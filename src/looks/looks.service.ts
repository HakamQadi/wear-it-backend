import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { PhotosService } from '../photos/photos.service';
import { TryOnService } from '../try-on/try-on.service';
import { StorageService } from '../uploads/storage.service';
import { WardrobeItem } from '../wardrobe/wardrobe-item.schema';
import { GenerateLookDto } from './look.dto';
import { Look, LookItem } from './look.schema';

/** Shape of a wardrobe item once its clothing type has been populated. */
type PopulatedItem = Omit<WardrobeItem, 'typeId'> & {
  _id: Types.ObjectId;
  typeId: { _id: Types.ObjectId; name: string; slug: string; sortOrder: number } | null;
};

@Injectable()
export class LooksService {
  /**
   * Image generation is slow and billed per call, so a member may only have one in
   * flight at a time. This is per-process; a multi-instance deployment needs a shared
   * rate limiter in front of the API as well.
   */
  private readonly generating = new Set<string>();

  constructor(
    @InjectModel(Look.name) private readonly lookModel: Model<Look>,
    @InjectModel(WardrobeItem.name) private readonly itemModel: Model<WardrobeItem>,
    private readonly photos: PhotosService,
    private readonly tryOn: TryOnService,
    private readonly storage: StorageService,
  ) {}

  findAll(userId: string) {
    return this.lookModel.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).lean().exec();
  }

  async findOne(userId: string, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Look not found');
    const look = await this.lookModel.findOne({ _id: id, userId: new Types.ObjectId(userId) }).lean().exec();
    if (!look) throw new NotFoundException('Look not found');
    return look;
  }

  async remove(userId: string, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Look not found');
    const deleted = await this.lookModel
      .findOneAndDelete({ _id: id, userId: new Types.ObjectId(userId) })
      .lean()
      .exec();
    if (!deleted) throw new NotFoundException('Look not found');
    await this.storage.releaseIfUnused(deleted.resultImageUrl);
    return { deleted: true };
  }

  async generate(userId: string, dto: GenerateLookDto) {
    if (this.generating.has(userId)) {
      throw new HttpException('A look is already being generated. Wait for it to finish.', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.generating.add(userId);
    try {
      return await this.runGeneration(userId, dto);
    } finally {
      this.generating.delete(userId);
    }
  }

  private async runGeneration(userId: string, dto: GenerateLookDto) {
    const items = await this.resolveItems(userId, dto.itemIds);
    const photo = await this.photos.findOne(userId, dto.photoId);

    const snapshots: LookItem[] = items.map((item) => ({
      itemId: item._id,
      typeId: item.typeId!._id,
      typeName: item.typeId!.name,
      name: item.name,
      imageUrl: item.imageUrl,
    }));

    const base = {
      userId: new Types.ObjectId(userId),
      photoId: photo._id,
      personImageUrl: photo.imageUrl,
      items: snapshots,
      prompt: dto.prompt?.trim() || '',
    };

    try {
      const result = await this.tryOn.composeLook({
        personImageUrl: photo.imageUrl,
        garments: snapshots.map((item) => ({ label: item.typeName, imageUrl: item.imageUrl })),
        extraDirection: dto.prompt,
      });
      const look = await this.lookModel.create({ ...base, status: 'ready', resultImageUrl: result.imageUrl });
      return look.toObject();
    } catch (error: unknown) {
      await this.lookModel.create({ ...base, status: 'failed', errorMessage: this.describe(error) });
      throw error;
    }
  }

  /** Loads the member's own items and enforces the one-item-per-clothing-type rule. */
  private async resolveItems(userId: string, itemIds: string[]): Promise<PopulatedItem[]> {
    const unique = [...new Set(itemIds)];
    if (unique.length !== itemIds.length) {
      throw new BadRequestException('The same wardrobe item was selected more than once');
    }

    const items = (await this.itemModel
      .find({ _id: { $in: unique.map((id) => new Types.ObjectId(id)) }, userId: new Types.ObjectId(userId) })
      .populate('typeId', 'name slug sortOrder')
      .lean()
      .exec()) as unknown as PopulatedItem[];

    if (items.length !== unique.length) {
      throw new NotFoundException('One or more selected items are not in your closet');
    }
    const untyped = items.find((item) => !item.typeId);
    if (untyped) {
      throw new BadRequestException(`"${untyped.name}" has no clothing type any more. Edit the item and pick a type.`);
    }

    const byType = new Map<string, string[]>();
    for (const item of items) {
      const key = item.typeId!.name;
      byType.set(key, [...(byType.get(key) ?? []), item.name]);
    }
    const clash = [...byType.entries()].find(([, names]) => names.length > 1);
    if (clash) {
      const [typeName, names] = clash;
      throw new BadRequestException(
        `A look can only include one ${typeName}. You selected ${names.length}: ${names.join(', ')}.`,
      );
    }

    // Stable, natural layering order (base layers first) taken from the CMS type order.
    return [...items].sort((a, b) => (a.typeId!.sortOrder ?? 0) - (b.typeId!.sortOrder ?? 0));
  }

  private describe(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      const message = (response as { message?: string | string[] }).message;
      if (Array.isArray(message)) return message.join(', ');
      if (message) return message;
    }
    return error instanceof Error ? error.message : 'Generation failed';
  }
}

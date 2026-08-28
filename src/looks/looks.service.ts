import { HttpException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { AppError } from '../common/errors/app-error';
import { PhotosService } from '../photos/photos.service';
import { BillingService } from '../plans/billing.service';
import { TryOnService } from '../try-on/try-on.service';
import { StorageService } from '../uploads/storage.service';
import { WardrobeItem } from '../wardrobe/wardrobe-item.schema';
import { GenerateLookDto } from './look.dto';
import { Look, LookItem } from './look.schema';

type PopulatedItem = Omit<WardrobeItem, 'typeId'> & {
  _id: Types.ObjectId;
  typeId: { _id: Types.ObjectId; name: string; nameAr?: string; slug: string; sortOrder: number } | null;
};

@Injectable()
export class LooksService {
  private readonly generating = new Set<string>();
  private readonly logger = new Logger(LooksService.name);

  constructor(
    @InjectModel(Look.name) private readonly lookModel: Model<Look>,
    @InjectModel(WardrobeItem.name) private readonly itemModel: Model<WardrobeItem>,
    private readonly photos: PhotosService,
    private readonly tryOn: TryOnService,
    private readonly storage: StorageService,
    private readonly billing: BillingService,
  ) {}

  findAll(userId: string) {
    return this.lookModel.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).lean().exec();
  }

  async findOne(userId: string, id: string) {
    if (!isValidObjectId(id)) throw AppError.notFound('LOOK_NOT_FOUND', 'Look not found');
    const look = await this.lookModel.findOne({ _id: id, userId: new Types.ObjectId(userId) }).lean().exec();
    if (!look) throw AppError.notFound('LOOK_NOT_FOUND', 'Look not found');
    return look;
  }

  async remove(userId: string, id: string) {
    if (!isValidObjectId(id)) throw AppError.notFound('LOOK_NOT_FOUND', 'Look not found');
    const deleted = await this.lookModel.findOneAndDelete({ _id: id, userId: new Types.ObjectId(userId) }).lean().exec();
    if (!deleted) throw AppError.notFound('LOOK_NOT_FOUND', 'Look not found');
    await this.storage.releaseIfUnused(deleted.resultImageUrl);
    return { deleted: true };
  }

  async generate(userId: string, dto: GenerateLookDto) {
    if (this.generating.has(userId)) {
      throw AppError.tooManyRequests('LOOK_IN_PROGRESS', 'A look is already being generated. Wait for it to finish.');
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
      typeNameAr: item.typeId!.nameAr || item.typeId!.name,
      name: item.name,
      imageUrl: item.imageUrl,
    }));
    const base = {
      userId: new Types.ObjectId(userId), photoId: photo._id, personImageUrl: photo.imageUrl,
      items: snapshots, prompt: dto.prompt?.trim() || '',
    };

    const reservation = await this.billing.reserveGeneration(userId);
    let generatedImageUrl = '';
    let persisted = false;
    try {
      const result = await this.tryOn.composeLook({
        personImageUrl: photo.imageUrl,
        garments: snapshots.map((item) => ({ label: item.typeName, imageUrl: item.imageUrl })),
        extraDirection: dto.prompt,
      });
      generatedImageUrl = result.imageUrl;
      const look = await this.lookModel.create({ ...base, status: 'ready', resultImageUrl: result.imageUrl });
      persisted = true;
      return look.toObject();
    } catch (error: unknown) {
      try { await this.billing.releaseGeneration(reservation); }
      catch (rollbackError) { this.logger.error('Could not refund failed generation quota', rollbackError); }
      if (generatedImageUrl && !persisted) {
        try { await this.storage.releaseIfUnused(generatedImageUrl); }
        catch (cleanupError) { this.logger.error('Could not clean generated image after persistence failure', cleanupError); }
      }
      try { await this.lookModel.create({ ...base, status: 'failed', errorMessage: this.describe(error) }); }
      catch (auditError) { this.logger.error('Could not persist failed look audit row', auditError); }
      throw error;
    }
  }

  private async resolveItems(userId: string, itemIds: string[]): Promise<PopulatedItem[]> {
    const unique = [...new Set(itemIds)];
    if (unique.length !== itemIds.length) {
      throw AppError.badRequest('ITEM_DUPLICATE', 'The same wardrobe item was selected more than once');
    }
    if (unique.some((id) => !isValidObjectId(id))) {
      throw AppError.badRequest('ITEM_INVALID', 'One or more selected wardrobe item IDs are invalid');
    }
    const items = (await this.itemModel
      .find({ _id: { $in: unique.map((id) => new Types.ObjectId(id)) }, userId: new Types.ObjectId(userId) })
      .populate('typeId', 'name nameAr slug sortOrder')
      .lean().exec()) as unknown as PopulatedItem[];
    if (items.length !== unique.length) throw AppError.notFound('ITEM_NOT_YOURS', 'One or more selected items are not in your closet');
    const untyped = items.find((item) => !item.typeId);
    if (untyped) {
      throw AppError.badRequest('ITEM_NO_TYPE', `"${untyped.name}" has no clothing type any more. Edit the item and pick a type.`, { name: untyped.name });
    }
    const byType = new Map<string, string[]>();
    for (const item of items) {
      const key = String(item.typeId!._id);
      byType.set(key, [...(byType.get(key) ?? []), item.name]);
    }
    const clash = [...byType.entries()].find(([, names]) => names.length > 1);
    if (clash) {
      const item = items.find((candidate) => String(candidate.typeId!._id) === clash[0])!;
      throw AppError.badRequest(
        'ITEM_TYPE_CLASH',
        `A look can only include one ${item.typeId!.name}. You selected ${clash[1].length}.`,
        { type: item.typeId!.name, count: clash[1].length },
      );
    }
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

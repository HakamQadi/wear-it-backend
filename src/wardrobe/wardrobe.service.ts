import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model, Types } from 'mongoose';
import { ClothingTypesService } from '../clothing-types/clothing-types.service';
import { StorageService } from '../uploads/storage.service';
import { CreateWardrobeItemDto, UpdateWardrobeItemDto } from './wardrobe.dto';
import { WardrobeItem } from './wardrobe-item.schema';
import { AppError } from '../common/errors/app-error';

export interface WardrobeQuery {
  typeId?: string;
  search?: string;
  includeArchived?: string;
}

@Injectable()
export class WardrobeService {
  constructor(
    @InjectModel(WardrobeItem.name) private readonly itemModel: Model<WardrobeItem>,
    private readonly clothingTypes: ClothingTypesService,
    private readonly storage: StorageService,
  ) {}

  findAll(userId: string, query: WardrobeQuery = {}) {
    const filter: FilterQuery<WardrobeItem> = { userId: new Types.ObjectId(userId) };
    if (query.includeArchived !== 'true') filter.isArchived = false;
    if (query.typeId && isValidObjectId(query.typeId)) filter.typeId = new Types.ObjectId(query.typeId);
    if (query.search?.trim()) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { brand: { $regex: escaped, $options: 'i' } },
        { color: { $regex: escaped, $options: 'i' } },
      ];
    }
    return this.itemModel
      .find(filter)
      .populate('typeId', 'name nameAr slug isActive sortOrder')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findOne(userId: string, id: string) {
    if (!isValidObjectId(id)) throw AppError.notFound('ITEM_NOT_FOUND', 'Wardrobe item not found');
    const item = await this.itemModel
      .findOne({ _id: id, userId: new Types.ObjectId(userId) })
      .populate('typeId', 'name nameAr slug isActive sortOrder')
      .lean()
      .exec();
    if (!item) throw AppError.notFound('ITEM_NOT_FOUND', 'Wardrobe item not found');
    return item;
  }

  async create(userId: string, dto: CreateWardrobeItemDto) {
    await this.clothingTypes.findActiveById(dto.typeId);
    const created = await this.itemModel.create({
      ...dto,
      userId: new Types.ObjectId(userId),
      typeId: new Types.ObjectId(dto.typeId),
    });
    return this.findOne(userId, created._id.toString());
  }

  async update(userId: string, id: string, dto: UpdateWardrobeItemDto) {
    if (!isValidObjectId(id)) throw AppError.notFound('ITEM_NOT_FOUND', 'Wardrobe item not found');
    if (dto.typeId) await this.clothingTypes.findActiveById(dto.typeId);
    const previous = await this.itemModel
      .findOneAndUpdate({ _id: id, userId: new Types.ObjectId(userId) }, dto, { runValidators: true })
      .lean()
      .exec();
    if (!previous) throw AppError.notFound('ITEM_NOT_FOUND', 'Wardrobe item not found');
    if (dto.imageUrl && dto.imageUrl !== previous.imageUrl) await this.storage.releaseIfUnused(previous.imageUrl);
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string) {
    if (!isValidObjectId(id)) throw AppError.notFound('ITEM_NOT_FOUND', 'Wardrobe item not found');
    const deleted = await this.itemModel.findOneAndDelete({ _id: id, userId: new Types.ObjectId(userId) }).lean().exec();
    if (!deleted) throw AppError.notFound('ITEM_NOT_FOUND', 'Wardrobe item not found');
    await this.storage.releaseIfUnused(deleted.imageUrl);
    return { deleted: true };
  }
}

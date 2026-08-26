import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { WardrobeItem } from '../wardrobe/wardrobe-item.schema';
import { CreateClothingTypeDto, UpdateClothingTypeDto } from './clothing-type.dto';
import { ClothingType } from './clothing-type.schema';

const DUPLICATE_KEY_CODE = 11000;

@Injectable()
export class ClothingTypesService {
  constructor(
    @InjectModel(ClothingType.name) private readonly typeModel: Model<ClothingType>,
    @InjectModel(WardrobeItem.name) private readonly itemModel: Model<WardrobeItem>,
  ) {}

  findAll(includeInactive = false) {
    return this.typeModel
      .find(includeInactive ? {} : { isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean()
      .exec();
  }

  async findActiveById(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Clothing type not found');
    const type = await this.typeModel.findOne({ _id: id, isActive: true }).lean().exec();
    if (!type) throw new NotFoundException('Clothing type not found or no longer available');
    return type;
  }

  async create(dto: CreateClothingTypeDto) {
    try {
      const created = await this.typeModel.create(dto);
      return created.toObject();
    } catch (error: unknown) {
      throw this.asHttpError(error);
    }
  }

  async update(id: string, dto: UpdateClothingTypeDto) {
    if (!isValidObjectId(id)) throw new NotFoundException('Clothing type not found');
    try {
      const type = await this.typeModel.findByIdAndUpdate(id, dto, { new: true, runValidators: true }).lean().exec();
      if (!type) throw new NotFoundException('Clothing type not found');
      return type;
    } catch (error: unknown) {
      throw this.asHttpError(error);
    }
  }

  async remove(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Clothing type not found');
    const itemCount = await this.itemModel.countDocuments({ typeId: id }).exec();
    if (itemCount > 0) {
      throw new BadRequestException(
        `${itemCount} wardrobe item(s) still use this type. Hide it instead of deleting, or wait until it is empty.`,
      );
    }
    const type = await this.typeModel.findByIdAndDelete(id).lean().exec();
    if (!type) throw new NotFoundException('Clothing type not found');
    return { deleted: true };
  }

  private asHttpError(error: unknown) {
    if ((error as { code?: number }).code === DUPLICATE_KEY_CODE) {
      return new ConflictException('A clothing type with this name or slug already exists');
    }
    return error;
  }
}

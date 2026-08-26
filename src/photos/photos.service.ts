import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { StorageService } from '../uploads/storage.service';
import { CreateUserPhotoDto, UpdateUserPhotoDto } from './photo.dto';
import { UserPhoto } from './user-photo.schema';

@Injectable()
export class PhotosService {
  constructor(
    @InjectModel(UserPhoto.name) private readonly photoModel: Model<UserPhoto>,
    private readonly storage: StorageService,
  ) {}

  findAll(userId: string) {
    return this.photoModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ isDefault: -1, createdAt: -1 })
      .lean()
      .exec();
  }

  async findOne(userId: string, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Photo not found');
    const photo = await this.photoModel.findOne({ _id: id, userId: new Types.ObjectId(userId) }).lean().exec();
    if (!photo) throw new NotFoundException('Photo not found');
    return photo;
  }

  async create(userId: string, dto: CreateUserPhotoDto) {
    const owner = new Types.ObjectId(userId);
    const isFirstPhoto = (await this.photoModel.countDocuments({ userId: owner }).exec()) === 0;
    const isDefault = dto.isDefault === true || isFirstPhoto;
    if (isDefault) await this.clearDefault(owner);
    const created = await this.photoModel.create({
      userId: owner,
      imageUrl: dto.imageUrl,
      label: dto.label?.trim() || '',
      isDefault,
    });
    return created.toObject();
  }

  async update(userId: string, id: string, dto: UpdateUserPhotoDto) {
    if (!isValidObjectId(id)) throw new NotFoundException('Photo not found');
    const owner = new Types.ObjectId(userId);
    if (dto.isDefault === true) await this.clearDefault(owner);
    const updated = await this.photoModel
      .findOneAndUpdate({ _id: id, userId: owner }, dto, { new: true, runValidators: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Photo not found');
    return updated;
  }

  async remove(userId: string, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Photo not found');
    const owner = new Types.ObjectId(userId);
    const deleted = await this.photoModel.findOneAndDelete({ _id: id, userId: owner }).lean().exec();
    if (!deleted) throw new NotFoundException('Photo not found');

    if (deleted.isDefault) {
      const next = await this.photoModel.findOne({ userId: owner }).sort({ createdAt: -1 }).exec();
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }
    await this.storage.releaseIfUnused(deleted.imageUrl);
    return { deleted: true };
  }

  private clearDefault(userId: Types.ObjectId) {
    return this.photoModel.updateMany({ userId, isDefault: true }, { $set: { isDefault: false } }).exec();
  }
}

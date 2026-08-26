import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../auth/user.schema';
import { ClothingType } from '../clothing-types/clothing-type.schema';
import { Look } from '../looks/look.schema';
import { UserPhoto } from '../photos/user-photo.schema';
import { WardrobeItem } from '../wardrobe/wardrobe-item.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(ClothingType.name) private readonly types: Model<ClothingType>,
    @InjectModel(WardrobeItem.name) private readonly items: Model<WardrobeItem>,
    @InjectModel(UserPhoto.name) private readonly photos: Model<UserPhoto>,
    @InjectModel(Look.name) private readonly looks: Model<Look>,
  ) {}

  async stats() {
    const [members, types, activeTypes, items, photos, looks, readyLooks] = await Promise.all([
      this.users.countDocuments({ role: 'user' }).exec(),
      this.types.countDocuments().exec(),
      this.types.countDocuments({ isActive: true }).exec(),
      this.items.countDocuments().exec(),
      this.photos.countDocuments().exec(),
      this.looks.countDocuments().exec(),
      this.looks.countDocuments({ status: 'ready' }).exec(),
    ]);
    return { members, types, activeTypes, items, photos, looks, readyLooks, failedLooks: looks - readyLooks };
  }

  /** Aggregate wardrobe usage per clothing type so the admin can see which categories matter. */
  async typeUsage() {
    const [types, grouped] = await Promise.all([
      this.types.find().sort({ sortOrder: 1, name: 1 }).lean().exec(),
      this.items.aggregate<{ _id: unknown; count: number }>([{ $group: { _id: '$typeId', count: { $sum: 1 } } }]).exec(),
    ]);
    const counts = new Map(grouped.map((row) => [String(row._id), row.count]));
    return types.map((type) => ({
      _id: type._id.toString(),
      name: type.name,
      nameAr: type.nameAr,
      slug: type.slug,
      isActive: type.isActive,
      sortOrder: type.sortOrder,
      itemCount: counts.get(type._id.toString()) ?? 0,
    }));
  }

  async members() {
    const members = await this.users.find({ role: 'user' }).sort({ createdAt: -1 }).limit(200).lean().exec();
    const ids = members.map((member) => member._id);
    const [itemRows, lookRows] = await Promise.all([
      this.items.aggregate<{ _id: unknown; count: number }>([
        { $match: { userId: { $in: ids } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ]).exec(),
      this.looks.aggregate<{ _id: unknown; count: number }>([
        { $match: { userId: { $in: ids } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ]).exec(),
    ]);
    const itemCounts = new Map(itemRows.map((row) => [String(row._id), row.count]));
    const lookCounts = new Map(lookRows.map((row) => [String(row._id), row.count]));

    return members.map((member) => ({
      _id: member._id.toString(),
      name: member.name,
      email: member.email,
      createdAt: (member as unknown as { createdAt: Date }).createdAt,
      itemCount: itemCounts.get(member._id.toString()) ?? 0,
      lookCount: lookCounts.get(member._id.toString()) ?? 0,
    }));
  }
}

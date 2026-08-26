import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { User } from '../auth/user.schema';
import { ClothingType } from '../clothing-types/clothing-type.schema';
import { SiteContent } from '../content/content.schema';
import { Look } from '../looks/look.schema';

/** Ordered base layer first so generated looks layer garments naturally. */
const DEFAULT_CLOTHING_TYPES = [
  { name: 'T-shirt', slug: 't-shirt', nameAr: 'تي شيرت', description: 'Tees and short-sleeve tops.', sortOrder: 10 },
  { name: 'Shirt', slug: 'shirt', nameAr: 'قميص', description: 'Buttoned shirts and blouses.', sortOrder: 20 },
  { name: 'Sweater', slug: 'sweater', nameAr: 'كنزة', description: 'Knitwear, hoodies and sweatshirts.', sortOrder: 30 },
  { name: 'Dress', slug: 'dress', nameAr: 'فستان', description: 'One-piece dresses.', sortOrder: 40 },
  { name: 'Pants', slug: 'pants', nameAr: 'بنطال', description: 'Trousers, jeans and chinos.', sortOrder: 50 },
  { name: 'Skirt', slug: 'skirt', nameAr: 'تنورة', description: 'Skirts of any length.', sortOrder: 60 },
  { name: 'Shorts', slug: 'shorts', nameAr: 'شورت', description: 'Short-length bottoms.', sortOrder: 70 },
  { name: 'Jacket', slug: 'jacket', nameAr: 'جاكيت', description: 'Jackets, blazers and light layers.', sortOrder: 80 },
  { name: 'Coat', slug: 'coat', nameAr: 'معطف', description: 'Heavier outerwear.', sortOrder: 90 },
  { name: 'Suit', slug: 'suit', nameAr: 'بدلة', description: 'Full suits and tailored sets.', sortOrder: 100 },
  { name: 'Shoes', slug: 'shoes', nameAr: 'حذاء', description: 'Footwear of every kind.', sortOrder: 110 },
  { name: 'Bag', slug: 'bag', nameAr: 'حقيبة', description: 'Bags and backpacks.', sortOrder: 120 },
  { name: 'Hat', slug: 'hat', nameAr: 'قبعة', description: 'Hats, caps and headwear.', sortOrder: 130 },
  { name: 'Accessory', slug: 'accessory', nameAr: 'إكسسوار', description: 'Scarves, belts, jewellery and more.', sortOrder: 140 },
];

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(ClothingType.name) private readonly types: Model<ClothingType>,
    @InjectModel(SiteContent.name) private readonly content: Model<SiteContent>,
    @InjectModel(Look.name) private readonly looks: Model<Look>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.seedAdmin();
    await this.seedClothingTypes();
    await this.backfillArabicNames();
    await this.seedContent();
  }

  private async seedAdmin() {
    const email = this.config.get<string>('ADMIN_EMAIL', 'admin@wearit.local').toLowerCase();
    if (await this.users.exists({ email })) return;
    const password = this.config.get<string>('ADMIN_PASSWORD', 'WearIt123!');
    await this.users.create({
      email,
      name: 'Wear It Admin',
      passwordHash: await bcrypt.hash(password, 12),
      role: 'admin',
    });
    this.logger.log(`Created initial admin: ${email}`);
  }

  /** Seeds a starter taxonomy only while the collection is empty, so admin edits survive restarts. */
  private async seedClothingTypes() {
    if ((await this.types.estimatedDocumentCount().exec()) > 0) return;
    await this.types.insertMany(DEFAULT_CLOTHING_TYPES);
    this.logger.log(`Seeded ${DEFAULT_CLOTHING_TYPES.length} clothing types`);
  }

  /**
   * Fills in the Arabic name on the starter types for databases created before they had
   * one. Only ever writes where the field is empty, so an admin's own wording is never
   * overwritten, and it is safe to run on every boot.
   */
  private async backfillArabicNames() {
    const updates = await Promise.all(
      DEFAULT_CLOTHING_TYPES.map((type) =>
        this.types
          .updateOne(
            { slug: type.slug, $or: [{ nameAr: { $exists: false } }, { nameAr: '' }] },
            { $set: { nameAr: type.nameAr } },
          )
          .exec(),
      ),
    );
    const filled = updates.reduce((total, result) => total + result.modifiedCount, 0);
    if (filled > 0) this.logger.log(`Filled in the Arabic name for ${filled} clothing type(s)`);

    // Looks snapshot the type label at generation time; older ones have no Arabic copy.
    // Each look is rewritten once, however many of its garments need filling in.
    const labels = new Map(
      (await this.types.find({ nameAr: { $nin: ['', null] } }).lean().exec()).map((type) => [
        type._id.toString(),
        type.nameAr,
      ]),
    );
    const stale = await this.looks
      .find({ items: { $elemMatch: { $or: [{ typeNameAr: { $exists: false } }, { typeNameAr: '' }] } } })
      .exec();

    let looksFilled = 0;
    for (const look of stale) {
      let touched = false;
      for (const item of look.items) {
        if (item.typeNameAr) continue;
        const label = labels.get(item.typeId?.toString() ?? '');
        // With no matching type left, the English label is the best available answer.
        item.typeNameAr = label || item.typeName;
        touched = true;
      }
      if (touched) {
        look.markModified('items');
        await look.save();
        looksFilled += 1;
      }
    }
    if (looksFilled > 0) this.logger.log(`Filled in the Arabic type label on ${looksFilled} look(s)`);

    const stillMissing = await this.types.countDocuments({ $or: [{ nameAr: { $exists: false } }, { nameAr: '' }] }).exec();
    if (stillMissing > 0) {
      this.logger.warn(
        `${stillMissing} clothing type(s) have no Arabic name. Add one in the CMS; members see the English name until then.`,
      );
    }
  }

  private async seedContent() {
    // Only creates the document when missing; the schema defaults supply both languages.
    await this.content.updateOne({ key: 'main' }, { $setOnInsert: { key: 'main' } }, { upsert: true });
  }

}

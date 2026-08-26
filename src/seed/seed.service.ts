import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { User } from '../auth/user.schema';
import { ClothingType } from '../clothing-types/clothing-type.schema';
import { SiteContent } from '../content/content.schema';

/** Ordered base layer first so generated looks layer garments naturally. */
const DEFAULT_CLOTHING_TYPES = [
  { name: 'T-shirt', slug: 't-shirt', description: 'Tees and short-sleeve tops.', sortOrder: 10 },
  { name: 'Shirt', slug: 'shirt', description: 'Buttoned shirts and blouses.', sortOrder: 20 },
  { name: 'Sweater', slug: 'sweater', description: 'Knitwear, hoodies and sweatshirts.', sortOrder: 30 },
  { name: 'Dress', slug: 'dress', description: 'One-piece dresses.', sortOrder: 40 },
  { name: 'Pants', slug: 'pants', description: 'Trousers, jeans and chinos.', sortOrder: 50 },
  { name: 'Skirt', slug: 'skirt', description: 'Skirts of any length.', sortOrder: 60 },
  { name: 'Shorts', slug: 'shorts', description: 'Short-length bottoms.', sortOrder: 70 },
  { name: 'Jacket', slug: 'jacket', description: 'Jackets, blazers and light layers.', sortOrder: 80 },
  { name: 'Coat', slug: 'coat', description: 'Heavier outerwear.', sortOrder: 90 },
  { name: 'Suit', slug: 'suit', description: 'Full suits and tailored sets.', sortOrder: 100 },
  { name: 'Shoes', slug: 'shoes', description: 'Footwear of every kind.', sortOrder: 110 },
  { name: 'Bag', slug: 'bag', description: 'Bags and backpacks.', sortOrder: 120 },
  { name: 'Hat', slug: 'hat', description: 'Hats, caps and headwear.', sortOrder: 130 },
  { name: 'Accessory', slug: 'accessory', description: 'Scarves, belts, jewellery and more.', sortOrder: 140 },
];

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(ClothingType.name) private readonly types: Model<ClothingType>,
    @InjectModel(SiteContent.name) private readonly content: Model<SiteContent>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.seedAdmin();
    await this.seedClothingTypes();
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

  private async seedContent() {
    await this.content.updateOne(
      { key: 'main' },
      {
        $setOnInsert: {
          key: 'main',
          brandName: 'Wear It',
          heroTitle: 'Your closet, digitised.',
          heroSubtitle:
            'Photograph what you already own, save it to your virtual wardrobe, then let AI show you wearing any combination of it.',
          heroCta: 'Build my closet',
          announcement: 'Plan tomorrow’s outfit tonight — from the clothes you already own.',
          footerText: 'A digital wardrobe that shows you the outfit before you wear it.',
        },
      },
      { upsert: true },
    );
  }
}

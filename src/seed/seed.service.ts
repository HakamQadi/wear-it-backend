import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { Admin } from '../auth/admin.schema';
import { Category } from '../categories/category.schema';
import { SiteContent } from '../content/content.schema';
import { Product } from '../products/product.schema';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);
  constructor(
    @InjectModel(Admin.name) private readonly admins: Model<Admin>,
    @InjectModel(Category.name) private readonly categories: Model<Category>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(SiteContent.name) private readonly content: Model<SiteContent>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.seedAdmin();
    await this.seedStore();
  }

  private async seedAdmin() {
    const email = this.config.get<string>('ADMIN_EMAIL', 'admin@wearit.local').toLowerCase();
    if (await this.admins.exists({ email })) return;
    const password = this.config.get<string>('ADMIN_PASSWORD', 'WearIt123!');
    await this.admins.create({ email, passwordHash: await bcrypt.hash(password, 12), name: 'Wear It Admin' });
    this.logger.log(`Created initial admin: ${email}`);
  }

  private async seedStore() {
    const count = await this.categories.countDocuments();
    if (count === 0) {
      await this.categories.insertMany([
        { name: 'Women', slug: 'women', description: 'Modern everyday pieces and elevated essentials.' },
        { name: 'Men', slug: 'men', description: 'Clean fits, relaxed layers and wardrobe staples.' },
        { name: 'Outerwear', slug: 'outerwear', description: 'Light jackets and statement layers.' },
      ]);
    }
    const categoryList = await this.categories.find().lean().exec();
    const category = (slug: string) => categoryList.find((item) => item.slug === slug)!._id;

    if ((await this.products.countDocuments()) === 0) {
      await this.products.insertMany([
        {
          name: 'Sand Oversized Tee', slug: 'sand-oversized-tee', description: 'A heavyweight oversized tee with a soft drape, dropped shoulders and a clean everyday silhouette.',
          categoryId: category('men'), price: 28, compareAtPrice: 35, images: ['/demo/sand-tee.svg'], tryOnOverlayUrl: '/demo/sand-tee-overlay.svg',
          sizes: ['S', 'M', 'L', 'XL'], colors: ['Sand', 'Black'], stock: 38, featured: true, tags: ['tee', 'oversized', 'minimal'],
        },
        {
          name: 'Sage Cropped Hoodie', slug: 'sage-cropped-hoodie', description: 'A soft brushed hoodie with a modern cropped shape, relaxed sleeves and a comfortable structured hood.',
          categoryId: category('women'), price: 46, images: ['/demo/sage-hoodie.svg'], tryOnOverlayUrl: '/demo/sage-hoodie-overlay.svg',
          sizes: ['XS', 'S', 'M', 'L'], colors: ['Sage', 'Cream'], stock: 24, featured: true, tags: ['hoodie', 'cropped', 'sage'],
        },
        {
          name: 'Midnight Bomber', slug: 'midnight-bomber', description: 'A clean lightweight bomber jacket with subtle volume and understated hardware for easy layering.',
          categoryId: category('outerwear'), price: 72, compareAtPrice: 89, images: ['/demo/midnight-bomber.svg'], tryOnOverlayUrl: '/demo/midnight-bomber-overlay.svg',
          sizes: ['S', 'M', 'L', 'XL'], colors: ['Midnight'], stock: 17, featured: true, tags: ['jacket', 'bomber', 'outerwear'],
        },
        {
          name: 'Cloud Rib Top', slug: 'cloud-rib-top', description: 'A fitted ribbed long-sleeve top with a soft neckline and stretch finish designed for everyday layering.',
          categoryId: category('women'), price: 32, images: ['/demo/cloud-rib-top.svg'], tryOnOverlayUrl: '/demo/cloud-rib-top-overlay.svg',
          sizes: ['XS', 'S', 'M', 'L'], colors: ['Cloud', 'Charcoal'], stock: 31, featured: false, tags: ['top', 'ribbed', 'basic'],
        },
      ]);
    }

    await this.content.updateOne({ key: 'main' }, {
      $setOnInsert: {
        key: 'main', brandName: 'Wear It', heroTitle: 'See the fit before it arrives.',
        heroSubtitle: 'Shop modern essentials, upload a photo, and preview the silhouette on you before adding it to your wardrobe.',
        heroCta: 'Shop the collection', announcement: 'Free delivery on orders over $100', footerText: 'Modern clothing with a more confident way to choose.',
      },
    }, { upsert: true });
  }
}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Admin, AdminSchema } from '../auth/admin.schema';
import { Category, CategorySchema } from '../categories/category.schema';
import { SiteContent, SiteContentSchema } from '../content/content.schema';
import { Product, ProductSchema } from '../products/product.schema';
import { SeedService } from './seed.service';

@Module({
  imports: [MongooseModule.forFeature([
    { name: Admin.name, schema: AdminSchema },
    { name: Category.name, schema: CategorySchema },
    { name: Product.name, schema: ProductSchema },
    { name: SiteContent.name, schema: SiteContentSchema },
  ])],
  providers: [SeedService],
})
export class SeedModule {}

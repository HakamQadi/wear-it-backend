import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '../products/product.schema';
import { Category, CategorySchema } from './category.schema';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Category.name, schema: CategorySchema }, { name: Product.name, schema: ProductSchema }])],
  controllers: [CategoriesController], providers: [CategoriesService], exports: [MongooseModule, CategoriesService],
})
export class CategoriesModule {}

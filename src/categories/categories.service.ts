import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product } from '../products/product.schema';
import { Category } from './category.schema';
import { CreateCategoryDto, UpdateCategoryDto } from './category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
  ) {}

  findAll(includeInactive = false) {
    return this.categoryModel.find(includeInactive ? {} : { isActive: true }).sort({ name: 1 }).lean().exec();
  }

  create(dto: CreateCategoryDto) { return this.categoryModel.create(dto); }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.categoryModel.findByIdAndUpdate(id, dto, { new: true, runValidators: true }).lean().exec();
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async remove(id: string) {
    const productCount = await this.productModel.countDocuments({ categoryId: id }).exec();
    if (productCount > 0) throw new BadRequestException('Reassign or delete products in this category first');
    const category = await this.categoryModel.findByIdAndDelete(id).lean().exec();
    if (!category) throw new NotFoundException('Category not found');
    return { deleted: true };
  }
}

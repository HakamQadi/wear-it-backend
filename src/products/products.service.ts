import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { Product } from './product.schema';
import { CreateProductDto, UpdateProductDto } from './product.dto';

@Injectable()
export class ProductsService {
  constructor(@InjectModel(Product.name) private readonly productModel: Model<Product>) {}

  findAll(params: { search?: string; category?: string; featured?: string }, includeInactive = false) {
    const filter: Record<string, unknown> = includeInactive ? {} : { isActive: true };
    if (params.category && isValidObjectId(params.category)) filter.categoryId = params.category;
    if (params.featured === 'true') filter.featured = true;
    if (params.search?.trim()) filter.$text = { $search: params.search.trim() };
    return this.productModel.find(filter).populate('categoryId', 'name slug').sort({ featured: -1, createdAt: -1 }).lean().exec();
  }

  async findBySlug(slug: string) {
    const product = await this.productModel.findOne({ slug, isActive: true }).populate('categoryId', 'name slug').lean().exec();
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async findById(id: string) {
    const product = await this.productModel.findById(id).populate('categoryId', 'name slug').lean().exec();
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  create(dto: CreateProductDto) { return this.productModel.create(dto); }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.productModel.findByIdAndUpdate(id, dto, { new: true, runValidators: true }).lean().exec();
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async remove(id: string) {
    const product = await this.productModel.findByIdAndDelete(id).lean().exec();
    if (!product) throw new NotFoundException('Product not found');
    return { deleted: true };
  }
}

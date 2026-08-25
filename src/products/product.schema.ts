import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Category } from '../categories/category.schema';

export type ProductDocument = HydratedDocument<Product>;

@Schema({ timestamps: true })
export class Product {
  @Prop({ required: true, trim: true }) name!: string;
  @Prop({ required: true, unique: true, lowercase: true, trim: true }) slug!: string;
  @Prop({ required: true }) description!: string;
  @Prop({ type: Types.ObjectId, ref: Category.name, required: true }) categoryId!: Types.ObjectId;
  @Prop({ required: true, min: 0 }) price!: number;
  @Prop({ min: 0 }) compareAtPrice?: number;
  @Prop({ type: [String], default: [] }) images!: string[];
  @Prop({ default: '' }) tryOnOverlayUrl!: string;
  @Prop({ type: [String], default: ['S', 'M', 'L', 'XL'] }) sizes!: string[];
  @Prop({ type: [String], default: ['Black'] }) colors!: string[];
  @Prop({ default: 0, min: 0 }) stock!: number;
  @Prop({ default: false }) featured!: boolean;
  @Prop({ default: true }) isActive!: boolean;
  @Prop({ type: [String], default: [] }) tags!: string[];
}

export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.index({ name: 'text', description: 'text', tags: 'text' });
ProductSchema.index({ categoryId: 1, isActive: 1 });

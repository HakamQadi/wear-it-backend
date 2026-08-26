import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ClothingTypeDocument = HydratedDocument<ClothingType>;

/**
 * A wardrobe category managed by the admin through the CMS (T-shirt, Pants, Jacket, ...).
 * A look may contain at most one wardrobe item per clothing type.
 */
@Schema({ timestamps: true, collection: 'clothingtypes' })
export class ClothingType {
  @Prop({ required: true, unique: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ default: 0 })
  sortOrder!: number;

  @Prop({ default: true })
  isActive!: boolean;
}

export const ClothingTypeSchema = SchemaFactory.createForClass(ClothingType);
ClothingTypeSchema.index({ sortOrder: 1, name: 1 });

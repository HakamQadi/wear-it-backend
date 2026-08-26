import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from '../auth/user.schema';
import { ClothingType } from '../clothing-types/clothing-type.schema';

export type WardrobeItemDocument = HydratedDocument<WardrobeItem>;

/** One photographed garment from a member's real closet. */
@Schema({ timestamps: true, collection: 'wardrobeitems' })
export class WardrobeItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: ClothingType.name, required: true })
  typeId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true })
  imageUrl!: string;

  @Prop({ default: '', trim: true })
  color!: string;

  @Prop({ default: '', trim: true })
  brand!: string;

  @Prop({ default: '', trim: true })
  notes!: string;

  @Prop({ default: false })
  isArchived!: boolean;
}

export const WardrobeItemSchema = SchemaFactory.createForClass(WardrobeItem);
WardrobeItemSchema.index({ userId: 1, typeId: 1 });
WardrobeItemSchema.index({ userId: 1, createdAt: -1 });

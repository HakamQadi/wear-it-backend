import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from '../auth/user.schema';

export type LookDocument = HydratedDocument<Look>;
export type LookStatus = 'ready' | 'failed';

/**
 * Snapshot of a wardrobe item at generation time so a look keeps rendering
 * after the underlying item is renamed or deleted.
 */
@Schema({ _id: false })
export class LookItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) itemId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) typeId!: Types.ObjectId;
  @Prop({ required: true }) typeName!: string;
  @Prop({ default: '' }) typeNameAr!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) imageUrl!: string;
}
const LookItemSchema = SchemaFactory.createForClass(LookItem);

@Schema({ timestamps: true, collection: 'looks' })
export class Look {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  photoId!: Types.ObjectId | null;

  @Prop({ required: true })
  personImageUrl!: string;

  @Prop({ type: [LookItemSchema], required: true })
  items!: LookItem[];

  @Prop({ default: '' })
  prompt!: string;

  @Prop({ type: String, enum: ['ready', 'failed'], required: true })
  status!: LookStatus;

  @Prop({ default: '' })
  resultImageUrl!: string;

  @Prop({ default: '' })
  errorMessage!: string;
}

export const LookSchema = SchemaFactory.createForClass(Look);
LookSchema.index({ userId: 1, createdAt: -1 });

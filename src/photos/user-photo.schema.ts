import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from '../auth/user.schema';

export type UserPhotoDocument = HydratedDocument<UserPhoto>;

/** A personal photo a member can reuse as the base for generated looks. */
@Schema({ timestamps: true, collection: 'userphotos' })
export class UserPhoto {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  imageUrl!: string;

  @Prop({ default: '', trim: true })
  label!: string;

  @Prop({ default: false })
  isDefault!: boolean;
}

export const UserPhotoSchema = SchemaFactory.createForClass(UserPhoto);
UserPhotoSchema.index({ userId: 1, createdAt: -1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ACCOUNT_ROLES, AccountRole } from '../common/types/jwt-payload';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'accounts' })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: String, enum: ACCOUNT_ROLES, default: AccountRole.USER })
  role!: AccountRole;
}

export const UserSchema = SchemaFactory.createForClass(User);

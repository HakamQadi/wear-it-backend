import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlanDocument = HydratedDocument<Plan>;

@Schema({ timestamps: true, collection: 'plans' })
export class Plan {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  nameAr!: string;

  @Prop({ default: '', trim: true })
  description!: string;

  @Prop({ default: '', trim: true })
  descriptionAr!: string;

  @Prop({ type: [String], default: [] })
  features!: string[];

  @Prop({ type: [String], default: [] })
  featuresAr!: string[];

  @Prop({ required: true, min: 0 })
  priceCents!: number;

  @Prop({ required: true, uppercase: true, trim: true, default: 'USD' })
  currency!: string;

  @Prop({ required: true, min: 1 })
  monthlyImageLimit!: number;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: false })
  isDefault!: boolean;

  @Prop({ default: 0, min: 0 })
  sortOrder!: number;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);

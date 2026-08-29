import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { PLAN_TIERS, PlanTier } from './plan.enums';

export type PlanDocument = HydratedDocument<Plan>;

@Schema({ timestamps: true, collection: 'plans' })
export class Plan {
  @Prop({ required: true, unique: true, enum: PLAN_TIERS }) tier!: PlanTier;
  @Prop({ required: true, trim: true }) name!: string;
  @Prop({ required: true, trim: true }) nameAr!: string;
  @Prop({ default: '' }) description!: string;
  @Prop({ default: '' }) descriptionAr!: string;
  @Prop({ required: true, min: 0 }) priceCents!: number;
  @Prop({ required: true, uppercase: true, trim: true, default: 'USD' }) currency!: string;
  @Prop({ required: true, min: 1 }) generationLimit!: number;
  @Prop({ type: [String], default: [] }) features!: string[];
  @Prop({ type: [String], default: [] }) featuresAr!: string[];
  @Prop({ default: true }) isActive!: boolean;
  @Prop({ required: true }) sortOrder!: number;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);

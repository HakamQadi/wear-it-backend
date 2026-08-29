import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  SUBSCRIPTION_PROVIDERS,
  SUBSCRIPTION_STATUSES,
  SubscriptionProvider,
  SubscriptionStatus,
} from './plan.enums';

export type SubscriptionDocument = HydratedDocument<Subscription>;

@Schema({ timestamps: true, collection: 'subscriptions' })
export class Subscription {
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true }) userId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) planId!: Types.ObjectId;
  @Prop({ required: true, enum: SUBSCRIPTION_STATUSES, default: SubscriptionStatus.FREE }) status!: SubscriptionStatus;
  @Prop({ required: true, enum: SUBSCRIPTION_PROVIDERS, default: SubscriptionProvider.FREE }) provider!: SubscriptionProvider;
  @Prop({ required: true }) currentPeriodStart!: Date;
  @Prop({ required: true }) currentPeriodEnd!: Date;
  @Prop({ required: true, min: 0, default: 0 }) generationCount!: number;
  @Prop() stripeCustomerId?: string;
  @Prop() stripeSubscriptionId?: string;
  @Prop({ default: false }) cancelAtPeriodEnd!: boolean;
  @Prop({ type: Types.ObjectId }) adminPlanAssignedBy?: Types.ObjectId;
  @Prop() adminPlanAssignedAt?: Date;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

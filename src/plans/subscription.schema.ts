import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SubscriptionStatus = 'free' | 'active' | 'trialing' | 'past_due' | 'canceled';
export type SubscriptionDocument = HydratedDocument<Subscription>;

@Schema({ timestamps: true, collection: 'subscriptions' })
export class Subscription {
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true }) userId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) planId!: Types.ObjectId;
  @Prop({ required: true, enum: ['free', 'active', 'trialing', 'past_due', 'canceled'], default: 'free' }) status!: SubscriptionStatus;
  @Prop({ required: true, enum: ['free', 'stripe'], default: 'free' }) provider!: 'free' | 'stripe';
  @Prop({ required: true }) currentPeriodStart!: Date;
  @Prop({ required: true }) currentPeriodEnd!: Date;
  @Prop({ required: true, min: 0, default: 0 }) generationCount!: number;
  @Prop() stripeCustomerId?: string;
  @Prop() stripeSubscriptionId?: string;
  @Prop({ default: false }) cancelAtPeriodEnd!: boolean;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

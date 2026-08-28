import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SubscriptionDocument = HydratedDocument<Subscription>;

@Schema({ timestamps: true, collection: 'subscriptions' })
export class Subscription {
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true, ref: 'User' })
  userId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Plan' }) planId?: Types.ObjectId;
  @Prop({ default: 'canceled' }) status!: string;
  @Prop({ sparse: true, unique: true, index: true }) stripeSubscriptionId?: string;
  @Prop({ index: true }) stripeCustomerId?: string;
  @Prop() currentPeriodStart?: Date;
  @Prop() currentPeriodEnd?: Date;
  @Prop({ default: false }) cancelAtPeriodEnd!: boolean;
  @Prop({ min: 0 }) priceCents?: number;
  @Prop({ uppercase: true, trim: true }) currency?: string;
  @Prop({ default: 0 }) lastStripeEventCreated!: number;
  @Prop() checkoutKey?: string;
  @Prop() checkoutSessionId?: string;
  @Prop() checkoutSessionUrl?: string;
  @Prop() checkoutExpiresAt?: Date;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

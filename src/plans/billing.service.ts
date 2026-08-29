import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppError } from '../common/errors/app-error';
import { PlanTier, SubscriptionProvider, SubscriptionStatus } from './plan.enums';
import { Plan } from './plan.schema';
import { PlansService } from './plans.service';
import { StripeService, StripeSubscription } from './stripe.service';
import { Subscription } from './subscription.schema';
import { addMonth } from './subscription.utils';

@Injectable()
export class BillingService {
  constructor(
    @InjectModel(Subscription.name) private readonly subscriptions: Model<Subscription>,
    @InjectModel(Plan.name) private readonly plansModel: Model<Plan>,
    private readonly plans: PlansService,
    private readonly stripe: StripeService,
  ) {}

  async status(userId: string) {
    const subscription = await this.ensureCurrentPeriod(userId);
    const plan = await this.plansModel.findById(subscription.planId).lean().exec();
    if (!plan) throw AppError.notFound('PLAN_NOT_FOUND', 'Plan not found');
    return {
      subscription: {
        status: subscription.status,
        provider: subscription.provider,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        generationCount: subscription.generationCount,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      plan,
      used: subscription.generationCount,
      limit: plan.generationLimit,
      remaining: Math.max(0, plan.generationLimit - subscription.generationCount),
      paymentsConfigured: this.stripe.isConfigured(),
    };
  }

  async reserveGeneration(userId: string) {
    const current = await this.ensureCurrentPeriod(userId);
    const plan = await this.plansModel.findById(current.planId).lean().exec();
    if (!plan) throw AppError.notFound('PLAN_NOT_FOUND', 'Plan not found');
    const reserved = await this.subscriptions.findOneAndUpdate(
      { _id: current._id, currentPeriodStart: current.currentPeriodStart, generationCount: { $lt: plan.generationLimit } },
      { $inc: { generationCount: 1 } },
      { new: true },
    ).lean().exec();
    if (!reserved) {
      throw AppError.forbidden('GENERATION_LIMIT_REACHED', `Your ${plan.name} plan generation limit has been reached`);
    }
    return { subscriptionId: String(reserved._id), periodStart: reserved.currentPeriodStart };
  }

  async releaseGeneration(reservation: { subscriptionId: string; periodStart: Date }) {
    await this.subscriptions.updateOne(
      { _id: reservation.subscriptionId, currentPeriodStart: reservation.periodStart, generationCount: { $gt: 0 } },
      { $inc: { generationCount: -1 } },
    ).exec();
  }

  async checkout(userId: string, email: string) {
    const current = await this.ensureCurrentPeriod(userId);
    if (current.provider === SubscriptionProvider.STRIPE && current.status === SubscriptionStatus.PAST_DUE) {
      throw AppError.conflict('BILLING_ACTION_REQUIRED', 'Resolve the existing subscription in the billing portal first');
    }
    if (
      current.provider === SubscriptionProvider.STRIPE &&
      [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING].includes(current.status)
    ) {
      throw AppError.conflict('ALREADY_PRO', 'Your Pro subscription is already active');
    }
    const plan = await this.plans.getByTier(PlanTier.PRO);
    if (!plan.isActive) throw AppError.serviceUnavailable('PRO_PLAN_UNAVAILABLE', 'The Pro plan is currently unavailable');
    const front = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim().replace(/\/$/, '');
    return this.stripe.createCheckout({
      userId,
      email,
      plan: plan as Plan,
      successUrl: `${front}/billing?checkout=success`,
      cancelUrl: `${front}/billing?checkout=canceled`,
      idempotencyKey: `wearit-checkout-${userId}-${new Date(current.currentPeriodStart).getTime()}`,
    });
  }

  async portal(userId: string) {
    const current = await this.ensureCurrentPeriod(userId);
    if (!current.stripeCustomerId) throw AppError.badRequest('NO_BILLING_ACCOUNT', 'No Stripe billing account exists yet');
    const front = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim().replace(/\/$/, '');
    return this.stripe.createPortal(current.stripeCustomerId, `${front}/billing`);
  }

  async handleStripeEvent(event: { type?: string; data?: { object?: unknown } }) {
    if (!event.type || !event.data?.object) return { received: true };
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as { subscription?: string };
      if (session.subscription) await this.applyStripeSubscription(await this.stripe.getSubscription(session.subscription));
    } else if (event.type.startsWith('customer.subscription.')) {
      await this.applyStripeSubscription(event.data.object as StripeSubscription);
    }
    return { received: true };
  }

  private async applyStripeSubscription(remote: StripeSubscription) {
    const userId = remote.metadata?.userId;
    if (!userId || !Types.ObjectId.isValid(userId)) return;
    const existing = await this.ensureCurrentPeriod(userId);
    if (
      existing.provider === SubscriptionProvider.STRIPE &&
      existing.stripeSubscriptionId &&
      existing.stripeSubscriptionId !== remote.id &&
      [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING].includes(existing.status)
    ) return;

    const active = remote.status === SubscriptionStatus.ACTIVE || remote.status === SubscriptionStatus.TRIALING;
    const nextStatus = active
      ? remote.status === SubscriptionStatus.TRIALING ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE
      : remote.status === SubscriptionStatus.PAST_DUE ? SubscriptionStatus.PAST_DUE : SubscriptionStatus.CANCELED;
    const plan = await this.plans.getByTier(active ? PlanTier.PRO : PlanTier.FREE);
    const remoteStart = remote.current_period_start ? new Date(remote.current_period_start * 1000) : new Date();
    const remoteEnd = remote.current_period_end ? new Date(remote.current_period_end * 1000) : addMonth(remoteStart);
    const periodChanged = new Date(existing.currentPeriodStart).getTime() !== remoteStart.getTime();
    const leavingPaidEntitlement = !active &&
      [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING].includes(existing.status);
    const fallbackStart = new Date();

    await this.subscriptions.updateOne(
      { _id: existing._id },
      {
        $set: {
          planId: plan._id,
          provider: SubscriptionProvider.STRIPE,
          status: nextStatus,
          stripeCustomerId: String(remote.customer || existing.stripeCustomerId || ''),
          stripeSubscriptionId: remote.id,
          cancelAtPeriodEnd: Boolean(remote.cancel_at_period_end),
          ...(active ? { currentPeriodStart: remoteStart, currentPeriodEnd: remoteEnd } : {}),
          ...(active && periodChanged ? { generationCount: 0 } : {}),
          ...(leavingPaidEntitlement ? {
            currentPeriodStart: fallbackStart,
            currentPeriodEnd: addMonth(fallbackStart),
            generationCount: 0,
          } : {}),
        },
      },
    ).exec();
  }

  private async ensureCurrentPeriod(userId: string) {
    const objectId = new Types.ObjectId(userId);
    let current = await this.subscriptions.findOne({ userId: objectId }).lean().exec();
    if (!current) {
      const free = await this.plans.getByTier(PlanTier.FREE);
      const start = new Date();
      try {
        current = (await this.subscriptions.create({
          userId: objectId,
          planId: free._id,
          status: SubscriptionStatus.FREE,
          provider: SubscriptionProvider.FREE,
          currentPeriodStart: start, currentPeriodEnd: addMonth(start), generationCount: 0,
        })).toObject();
      } catch {
        current = await this.subscriptions.findOne({ userId: objectId }).lean().exec();
      }
    }
    if (!current) throw AppError.serviceUnavailable('SUBSCRIPTION_UNAVAILABLE', 'Could not load subscription');

    const freeEntitlement = [
      SubscriptionStatus.FREE,
      SubscriptionStatus.PAST_DUE,
      SubscriptionStatus.CANCELED,
    ].includes(current.status);
    if (freeEntitlement && new Date(current.currentPeriodEnd).getTime() <= Date.now()) {
      const start = new Date();
      await this.subscriptions.updateOne(
        { _id: current._id, currentPeriodEnd: current.currentPeriodEnd },
        { $set: { currentPeriodStart: start, currentPeriodEnd: addMonth(start), generationCount: 0 } },
      ).exec();
      current = await this.subscriptions.findById(current._id).lean().exec();
      if (!current) throw AppError.serviceUnavailable('SUBSCRIPTION_UNAVAILABLE', 'Could not refresh subscription');
    }
    return current;
  }
}

import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { isValidObjectId, Model, Types } from 'mongoose';
import { User } from '../auth/user.schema';
import { AppError } from '../common/errors/app-error';
import { UpdatePlanDto } from './billing.dto';
import { GenerationUsage } from './generation-usage.schema';
import { Plan } from './plan.schema';
import { StripeJson, StripeService } from './stripe.service';
import { Subscription } from './subscription.schema';

const ENTITLED_STRIPE_STATUSES = new Set(['active', 'trialing']);
const CLOSED_STRIPE_STATUSES = new Set(['canceled', 'incomplete_expired']);
const DUPLICATE_KEY = 11000;

export interface GenerationReservation {
  usageId: string;
}

interface EntitlementContext {
  plan: Plan & { _id: Types.ObjectId };
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  stripeStatus: string | null;
  cancelAtPeriodEnd: boolean;
  subscriptionPriceCents: number | null;
  subscriptionCurrency: string | null;
}

@Injectable()
export class BillingService implements OnModuleInit {
  constructor(
    @InjectModel(Plan.name) private readonly plans: Model<Plan>,
    @InjectModel(Subscription.name) private readonly subscriptions: Model<Subscription>,
    @InjectModel(GenerationUsage.name) private readonly usage: Model<GenerationUsage>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly stripe: StripeService,
  ) {}

  async onModuleInit() {
    await this.seedPlan({
      slug: 'free', name: 'Free', nameAr: 'مجاني',
      description: 'Try AI outfits every month at no cost.',
      descriptionAr: 'جرّب تنسيقات الذكاء الاصطناعي كل شهر مجانًا.',
      features: ['3 AI outfit generations each month', 'Unlimited closet items', 'Unlimited saved personal photos'],
      featuresAr: ['3 إطلالات بالذكاء الاصطناعي كل شهر', 'قطع غير محدودة في الخزانة', 'صور شخصية محفوظة غير محدودة'],
      priceCents: 0, currency: 'USD', monthlyImageLimit: 3, isActive: true, isDefault: true, sortOrder: 0,
    });
    await this.seedPlan({
      slug: 'pro', name: 'Pro', nameAr: 'احترافي',
      description: 'Build more outfits with a larger monthly AI allowance.',
      descriptionAr: 'أنشئ تنسيقات أكثر مع رصيد شهري أكبر للذكاء الاصطناعي.',
      features: ['30 AI outfit generations each month', 'Unlimited closet items', 'Unlimited saved personal photos'],
      featuresAr: ['30 إطلالة بالذكاء الاصطناعي كل شهر', 'قطع غير محدودة في الخزانة', 'صور شخصية محفوظة غير محدودة'],
      priceCents: 999, currency: 'USD', monthlyImageLimit: 30, isActive: true, isDefault: false, sortOrder: 10,
    });
  }

  private async seedPlan(value: Record<string, unknown>) {
    try {
      await this.plans.updateOne({ slug: value.slug }, { $setOnInsert: value }, { upsert: true }).exec();
    } catch (error: unknown) {
      if ((error as { code?: number }).code !== DUPLICATE_KEY) throw error;
    }
  }

  async publicPlans() {
    const plans = await this.plans.find({ isActive: true }).sort({ sortOrder: 1, priceCents: 1 }).lean().exec();
    return plans.map((plan) => this.publicPlan(plan));
  }

  adminPlans() {
    return this.plans.find().sort({ sortOrder: 1, priceCents: 1 }).lean().exec();
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    if (!isValidObjectId(id)) throw AppError.notFound('PLAN_NOT_FOUND', 'Plan not found');
    const current = await this.plans.findById(id).lean().exec();
    if (!current) throw AppError.notFound('PLAN_NOT_FOUND', 'Plan not found');

    const nextPrice = dto.priceCents ?? current.priceCents;
    if (current.slug === 'free') {
      if (nextPrice !== 0) throw AppError.badRequest('DEFAULT_PLAN_MUST_BE_FREE', 'The Free plan must remain free');
      if (dto.isActive === false || dto.isDefault === false) {
        throw AppError.badRequest('DEFAULT_PLAN_REQUIRED', 'The Free plan must stay active and default');
      }
    } else if (current.slug === 'pro') {
      if (nextPrice <= 0) throw AppError.badRequest('PAID_PLAN_PRICE_REQUIRED', 'The Pro plan must have a price greater than zero');
      if (dto.isDefault === true) throw AppError.badRequest('DEFAULT_PLAN_REQUIRED', 'The Pro plan cannot become the default plan');
    } else {
      throw AppError.badRequest('PLAN_TIER_LOCKED', 'Only the Free and Pro tiers are supported');
    }

    const enforced = current.slug === 'free'
      ? { ...dto, priceCents: 0, isActive: true, isDefault: true }
      : { ...dto, isDefault: false };
    const saved = await this.plans.findByIdAndUpdate(id, { $set: enforced }, { new: true }).lean().exec();
    if (!saved) throw AppError.notFound('PLAN_NOT_FOUND', 'Plan not found');

    if (dto.monthlyImageLimit !== undefined && dto.monthlyImageLimit !== current.monthlyImageLimit) {
      await this.usage.updateMany(
        { planId: current._id, periodEnd: { $gt: new Date() } },
        { $set: { limit: dto.monthlyImageLimit } },
      ).exec();
    }
    return saved;
  }

  async me(userId: string) {
    await this.reconcilePendingCheckout(userId).catch(() => undefined);
    const context = await this.entitlement(userId);
    const usage = await this.ensureUsage(userId, context);
    const subscription = await this.subscriptions.findOne({ userId: new Types.ObjectId(userId) }).lean().exec();
    return {
      plan: this.publicPlan(context.plan),
      usage: {
        used: usage.used,
        limit: usage.limit,
        remaining: Math.max(0, usage.limit - usage.used),
        periodStart: usage.periodStart,
        periodEnd: usage.periodEnd,
      },
      stripeStatus: context.stripeStatus,
      cancelAtPeriodEnd: context.cancelAtPeriodEnd,
      paymentsConfigured: this.stripe.isConfigured(),
      subscriptionPriceCents: context.subscriptionPriceCents,
      subscriptionCurrency: context.subscriptionCurrency,
      canManageBilling: Boolean(subscription?.stripeCustomerId),
      hasOpenSubscription: Boolean(subscription?.stripeSubscriptionId && !CLOSED_STRIPE_STATUSES.has(subscription.status)),
    };
  }

  async reserveGeneration(userId: string): Promise<GenerationReservation> {
    const context = await this.entitlement(userId);
    const row = await this.ensureUsage(userId, context);
    const reserved = await this.usage.findOneAndUpdate(
      { _id: row._id, $expr: { $lt: ['$used', '$limit'] } },
      { $inc: { used: 1 } },
      { new: true },
    ).lean().exec();
    if (!reserved) {
      throw AppError.paymentRequired(
        'GENERATION_LIMIT_REACHED',
        `You have used all ${row.limit} AI image generations included in your ${context.plan.name} plan for this period.`,
        { limit: row.limit, plan: context.plan.name },
      );
    }
    return { usageId: reserved._id.toString() };
  }

  async refundGeneration(reservation: GenerationReservation) {
    if (!isValidObjectId(reservation.usageId)) return;
    await this.usage.updateOne({ _id: reservation.usageId, used: { $gt: 0 } }, { $inc: { used: -1 } }).exec();
  }

  async checkout(userId: string, planId: string) {
    if (!this.stripe.isConfigured()) throw AppError.serviceUnavailable('PAYMENTS_NOT_CONFIGURED', 'Payments are not configured yet');
    if (!isValidObjectId(planId)) throw AppError.notFound('PLAN_NOT_FOUND', 'Plan not found');
    const plan = await this.plans.findOne({ _id: planId, isActive: true }).lean().exec();
    if (!plan) throw AppError.notFound('PLAN_NOT_FOUND', 'Plan not found');
    if (plan.isDefault || plan.priceCents <= 0) throw AppError.badRequest('PLAN_NOT_PURCHASABLE', 'This plan does not require checkout');

    const user = await this.users.findById(userId).lean().exec();
    if (!user) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'Account not found');
    let subscription = await this.subscriptions.findOne({ userId: new Types.ObjectId(userId) }).lean().exec();
    if (subscription?.stripeSubscriptionId && !CLOSED_STRIPE_STATUSES.has(subscription.status)) {
      throw AppError.conflict('SUBSCRIPTION_REQUIRES_MANAGEMENT', 'An existing subscription must be managed before starting a new checkout');
    }

    let customerId = subscription?.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.createCustomer({ userId, email: user.email, name: user.name });
      customerId = this.stringField(customer, 'id');
      if (!customerId) throw AppError.badGateway('PAYMENT_PROVIDER_ERROR', 'The payment provider did not create a customer');
      subscription = await this.subscriptions.findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        { $set: { stripeCustomerId: customerId }, $setOnInsert: { status: 'canceled' } },
        { upsert: true, new: true },
      ).lean().exec();
    }

    const now = new Date();
    if (subscription?.checkoutSessionUrl && subscription.checkoutExpiresAt && subscription.checkoutExpiresAt > now) {
      return { url: subscription.checkoutSessionUrl };
    }

    const candidateKey = randomUUID();
    await this.subscriptions.updateOne(
      {
        userId: new Types.ObjectId(userId),
        $or: [
          { checkoutKey: { $exists: false } },
          { checkoutKey: null },
          { checkoutExpiresAt: { $exists: false } },
          { checkoutExpiresAt: { $lte: now } },
        ],
      },
      { $set: {
        checkoutKey: candidateKey,
        checkoutSessionId: null,
        checkoutSessionUrl: null,
        checkoutExpiresAt: new Date(now.getTime() + 23 * 60 * 60 * 1000),
      } },
    ).exec();

    subscription = await this.subscriptions.findOne({ userId: new Types.ObjectId(userId) }).lean().exec();
    if (subscription?.checkoutSessionUrl && subscription.checkoutExpiresAt && subscription.checkoutExpiresAt > now) {
      return { url: subscription.checkoutSessionUrl };
    }
    const checkoutKey = subscription?.checkoutKey || candidateKey;
    const session = await this.stripe.createCheckout({
      userId,
      planId: plan._id.toString(),
      customerId,
      planName: plan.name.slice(0, 12) || 'Wear It Pro',
      priceCents: plan.priceCents,
      currency: plan.currency,
      successUrl: `${this.frontendBase()}/billing?checkout=success`,
      cancelUrl: `${this.frontendBase()}/billing?checkout=cancelled`,
      idempotencyKey: `wear-it-checkout:${checkoutKey}`,
    });
    const url = this.stringField(session, 'url');
    const id = this.stringField(session, 'id');
    if (!url || !id) throw AppError.badGateway('PAYMENT_PROVIDER_ERROR', 'The payment provider did not create a checkout session');
    const expiresAtSeconds = this.numberField(session, 'expires_at');
    await this.subscriptions.updateOne(
      { userId: new Types.ObjectId(userId), checkoutKey },
      { $set: {
        planId: plan._id,
        checkoutSessionId: id,
        checkoutSessionUrl: url,
        checkoutExpiresAt: expiresAtSeconds ? new Date(expiresAtSeconds * 1000) : new Date(now.getTime() + 23 * 60 * 60 * 1000),
      } },
    ).exec();
    return { url };
  }

  async portal(userId: string) {
    if (!this.stripe.isConfigured()) throw AppError.serviceUnavailable('PAYMENTS_NOT_CONFIGURED', 'Payments are not configured yet');
    const subscription = await this.subscriptions.findOne({ userId: new Types.ObjectId(userId) }).lean().exec();
    if (!subscription?.stripeCustomerId) throw AppError.notFound('BILLING_ACCOUNT_NOT_FOUND', 'No billing account exists for this member yet');
    const session = await this.stripe.createPortal(subscription.stripeCustomerId, `${this.frontendBase()}/billing`);
    const url = this.stringField(session, 'url');
    if (!url) throw AppError.badGateway('PAYMENT_PROVIDER_ERROR', 'The payment provider did not create a billing portal session');
    return { url };
  }

  async webhook(rawBody: Buffer, signatureHeader?: string) {
    const event = this.stripe.parseWebhook(rawBody, signatureHeader);
    const object = event.data.object;
    if (event.type === 'checkout.session.completed') {
      const subscriptionId = this.stringField(object, 'subscription');
      if (subscriptionId) await this.syncStripeSubscription(await this.stripe.getSubscription(subscriptionId), event.created);
      return { received: true };
    }
    if (event.type.startsWith('customer.subscription.')) {
      const subscriptionId = this.stringField(object, 'id');
      if (subscriptionId) {
        const current = await this.stripe.getSubscription(subscriptionId).catch(() => object);
        await this.syncStripeSubscription(current, event.created);
      }
      return { received: true };
    }
    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const subscriptionId = this.stringField(object, 'subscription');
      if (subscriptionId) await this.syncStripeSubscription(await this.stripe.getSubscription(subscriptionId), event.created);
    }
    return { received: true };
  }

  private async reconcilePendingCheckout(userId: string) {
    if (!this.stripe.isConfigured()) return;
    const record = await this.subscriptions.findOne({ userId: new Types.ObjectId(userId) }).lean().exec();
    if (!record?.checkoutSessionId || (record.stripeSubscriptionId && ENTITLED_STRIPE_STATUSES.has(record.status))) return;
    const session = await this.stripe.getCheckoutSession(record.checkoutSessionId);
    if (this.stringField(session, 'status') !== 'complete') return;
    const subscriptionId = this.stringField(session, 'subscription');
    if (!subscriptionId) return;
    await this.syncStripeSubscription(
      await this.stripe.getSubscription(subscriptionId),
      Math.max(record.lastStripeEventCreated + 1, Math.floor(Date.now() / 1000)),
    );
  }

  private async syncStripeSubscription(object: StripeJson, eventCreated: number) {
    const subscriptionId = this.stringField(object, 'id');
    if (!subscriptionId) return;
    const customerId = this.stringField(object, 'customer');
    const status = this.stringField(object, 'status') || 'canceled';
    const metadata = (object.metadata ?? {}) as Record<string, unknown>;

    let existing = await this.subscriptions.findOne({ stripeSubscriptionId: subscriptionId }).lean().exec();
    const metadataUserId = typeof metadata.userId === 'string' && isValidObjectId(metadata.userId) ? metadata.userId : null;
    if (!existing && metadataUserId) existing = await this.subscriptions.findOne({ userId: new Types.ObjectId(metadataUserId) }).lean().exec();
    if (!existing && customerId) existing = await this.subscriptions.findOne({ stripeCustomerId: customerId }).lean().exec();
    if (!existing && !metadataUserId) return;
    const userId = metadataUserId || existing?.userId.toString();
    if (!userId) return;

    if (existing?.lastStripeEventCreated && eventCreated < existing.lastStripeEventCreated) return;
    if (existing?.stripeSubscriptionId && existing.stripeSubscriptionId !== subscriptionId) {
      if (!ENTITLED_STRIPE_STATUSES.has(status) || eventCreated <= (existing.lastStripeEventCreated || 0)) return;
    }

    const metadataPlanId = typeof metadata.planId === 'string' && isValidObjectId(metadata.planId) ? metadata.planId : null;
    const planId = metadataPlanId ? new Types.ObjectId(metadataPlanId) : existing?.planId;
    if (!planId) return;
    const period = this.subscriptionPeriod(object);
    const stripePrice = this.subscriptionPrice(object);
    await this.subscriptions.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { $set: {
        planId,
        status,
        stripeSubscriptionId: subscriptionId,
        ...(customerId ? { stripeCustomerId: customerId } : {}),
        ...(period.start ? { currentPeriodStart: new Date(period.start * 1000) } : {}),
        ...(period.end ? { currentPeriodEnd: new Date(period.end * 1000) } : {}),
        cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
        ...(stripePrice.priceCents !== null ? { priceCents: stripePrice.priceCents } : {}),
        ...(stripePrice.currency ? { currency: stripePrice.currency } : {}),
        lastStripeEventCreated: eventCreated,
        checkoutKey: null,
        checkoutSessionId: null,
        checkoutSessionUrl: null,
        checkoutExpiresAt: null,
      } },
      { upsert: true, new: true },
    ).exec();
  }

  private async entitlement(userId: string): Promise<EntitlementContext> {
    const userObjectId = new Types.ObjectId(userId);
    const subscription = await this.subscriptions.findOne({ userId: userObjectId }).lean().exec();
    if (subscription?.planId && subscription.stripeSubscriptionId && ENTITLED_STRIPE_STATUSES.has(subscription.status)) {
      const plan = await this.plans.findById(subscription.planId).lean().exec();
      if (plan && !plan.isDefault) {
        const month = this.utcMonth();
        const start = subscription.currentPeriodStart || month.start;
        const end = subscription.currentPeriodEnd || month.end;
        return {
          plan: plan as Plan & { _id: Types.ObjectId },
          periodKey: `stripe:${subscription.stripeSubscriptionId}:${Math.floor(start.getTime() / 1000)}`,
          periodStart: start,
          periodEnd: end,
          stripeStatus: subscription.status,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          subscriptionPriceCents: subscription.priceCents ?? null,
          subscriptionCurrency: subscription.currency ?? null,
        };
      }
    }
    const free = await this.plans.findOne({ isDefault: true, isActive: true }).lean().exec();
    if (!free) throw AppError.serviceUnavailable('DEFAULT_PLAN_MISSING', 'The default free plan is not configured');
    const month = this.utcMonth();
    return {
      plan: free as Plan & { _id: Types.ObjectId },
      periodKey: `free:${month.start.toISOString().slice(0, 7)}`,
      periodStart: month.start,
      periodEnd: month.end,
      stripeStatus: subscription?.status ?? null,
      cancelAtPeriodEnd: false,
      subscriptionPriceCents: null,
      subscriptionCurrency: null,
    };
  }

  private async ensureUsage(userId: string, context: EntitlementContext) {
    const userObjectId = new Types.ObjectId(userId);
    try {
      await this.usage.updateOne(
        { userId: userObjectId, periodKey: context.periodKey },
        { $setOnInsert: {
          userId: userObjectId,
          periodKey: context.periodKey,
          planId: context.plan._id,
          limit: context.plan.monthlyImageLimit,
          used: 0,
          periodStart: context.periodStart,
          periodEnd: context.periodEnd,
        } },
        { upsert: true },
      ).exec();
    } catch (error: unknown) {
      if ((error as { code?: number }).code !== DUPLICATE_KEY) throw error;
    }
    const row = await this.usage.findOne({ userId: userObjectId, periodKey: context.periodKey }).lean().exec();
    if (!row) throw AppError.serviceUnavailable('BILLING_USAGE_UNAVAILABLE', 'Usage could not be loaded');
    return row;
  }

  private publicPlan(plan: Plan & { _id?: Types.ObjectId }) {
    return {
      _id: plan._id?.toString(), slug: plan.slug, name: plan.name, nameAr: plan.nameAr,
      description: plan.description, descriptionAr: plan.descriptionAr,
      features: plan.features, featuresAr: plan.featuresAr,
      priceCents: plan.priceCents, currency: plan.currency,
      monthlyImageLimit: plan.monthlyImageLimit, isDefault: plan.isDefault, sortOrder: plan.sortOrder,
    };
  }

  private utcMonth() {
    const now = new Date();
    return {
      start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    };
  }

  private frontendBase() {
    const configured = process.env.BILLING_FRONTEND_URL?.trim() || process.env.FRONTEND_URL?.split(',')[0]?.trim();
    return (configured || 'http://localhost:3000').replace(/\/+$/, '');
  }

  private subscriptionPeriod(object: StripeJson): { start: number; end: number } {
    const directStart = this.numberField(object, 'current_period_start');
    const directEnd = this.numberField(object, 'current_period_end');
    if (directStart && directEnd) return { start: directStart, end: directEnd };
    const items = object.items as { data?: unknown[] } | undefined;
    const first = Array.isArray(items?.data) ? items.data[0] : undefined;
    const row = first as Record<string, unknown> | undefined;
    return {
      start: typeof row?.current_period_start === 'number' ? row.current_period_start : 0,
      end: typeof row?.current_period_end === 'number' ? row.current_period_end : 0,
    };
  }

  private subscriptionPrice(object: StripeJson): { priceCents: number | null; currency: string | null } {
    const items = object.items as { data?: unknown[] } | undefined;
    const first = Array.isArray(items?.data) ? items.data[0] : undefined;
    const price = (first as { price?: Record<string, unknown> } | undefined)?.price;
    const amount = price?.unit_amount;
    const currency = price?.currency;
    return {
      priceCents: typeof amount === 'number' && Number.isFinite(amount) ? amount : null,
      currency: typeof currency === 'string' ? currency.toUpperCase() : null,
    };
  }

  private stringField(object: StripeJson, key: string) {
    return typeof object[key] === 'string' ? object[key] as string : '';
  }

  private numberField(object: StripeJson, key: string) {
    const value = object[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
}

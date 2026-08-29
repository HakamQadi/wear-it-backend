export enum PlanTier {
  FREE = 'free',
  PRO = 'pro',
}

export enum SubscriptionStatus {
  FREE = 'free',
  ACTIVE = 'active',
  TRIALING = 'trialing',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
}

export enum SubscriptionProvider {
  FREE = 'free',
  STRIPE = 'stripe',
}

export const PLAN_TIERS = Object.values(PlanTier);
export const SUBSCRIPTION_STATUSES = Object.values(SubscriptionStatus);
export const SUBSCRIPTION_PROVIDERS = Object.values(SubscriptionProvider);

export function isPlanTier(value: string): value is PlanTier {
  return PLAN_TIERS.includes(value as PlanTier);
}

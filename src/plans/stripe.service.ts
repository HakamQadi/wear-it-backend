import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError } from '../common/errors/app-error';
import { Plan } from './plan.schema';

export type StripeSubscription = {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_start?: number;
  current_period_end?: number;
  metadata?: Record<string, string>;
};

@Injectable()
export class StripeService {
  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return Boolean(this.secretKey() && this.webhookSecret());
  }

  async createCheckout(input: { userId: string; email: string; plan: Plan; successUrl: string; cancelUrl: string; idempotencyKey: string }) {
    if (!this.isConfigured()) throw AppError.serviceUnavailable('PAYMENTS_NOT_CONFIGURED', 'Payments are not configured');
    const body = new URLSearchParams({
      mode: 'subscription',
      customer_email: input.email,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': input.plan.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(input.plan.priceCents),
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][product_data][name]': input.plan.name,
      'metadata[userId]': input.userId,
      'metadata[planTier]': input.plan.tier,
      'subscription_data[metadata][userId]': input.userId,
      'subscription_data[metadata][planTier]': input.plan.tier,
    });
    return this.post<{ url: string; id: string }>('/checkout/sessions', body, input.idempotencyKey);
  }

  async createPortal(customerId: string, returnUrl: string) {
    if (!this.secretKey()) throw AppError.serviceUnavailable('PAYMENTS_NOT_CONFIGURED', 'Payments are not configured');
    return this.post<{ url: string }>('/billing_portal/sessions', new URLSearchParams({ customer: customerId, return_url: returnUrl }));
  }

  async getSubscription(id: string) {
    if (!this.secretKey()) throw AppError.serviceUnavailable('PAYMENTS_NOT_CONFIGURED', 'Payments are not configured');
    const response = await fetch(`${this.baseUrl()}/subscriptions/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${this.secretKey()}` },
    });
    return this.read<StripeSubscription>(response);
  }

  verifyWebhook(raw: Buffer, signature: string) {
    const secret = this.webhookSecret();
    if (!secret) throw AppError.serviceUnavailable('PAYMENTS_NOT_CONFIGURED', 'Stripe webhook is not configured');
    const parts = Object.fromEntries(signature.split(',').map((part) => part.split('=', 2) as [string, string]));
    const timestamp = Number(parts.t);
    const received = parts.v1;
    if (!timestamp || !received || Math.abs(Date.now() / 1000 - timestamp) > 300) {
      throw AppError.badRequest('INVALID_STRIPE_SIGNATURE', 'Invalid Stripe signature');
    }
    const expected = createHmac('sha256', secret).update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw AppError.badRequest('INVALID_STRIPE_SIGNATURE', 'Invalid Stripe signature');
    }
  }

  private async post<T>(path: string, body: URLSearchParams, idempotencyKey?: string): Promise<T> {
    const response = await fetch(`${this.baseUrl()}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body,
    });
    return this.read<T>(response);
  }

  private async read<T>(response: Response): Promise<T> {
    const payload = (await response.json().catch(() => null)) as T | { error?: { message?: string } } | null;
    if (!response.ok) {
      const errorPayload = payload as { error?: { message?: string } } | null;
      throw AppError.badGateway('STRIPE_REQUEST_FAILED', errorPayload?.error?.message || 'Stripe request failed');
    }
    return payload as T;
  }

  private secretKey() { return this.config.get<string>('STRIPE_SECRET_KEY', ''); }
  private webhookSecret() { return this.config.get<string>('STRIPE_WEBHOOK_SECRET', ''); }
  private baseUrl() { return this.config.get<string>('STRIPE_API_BASE_URL', 'https://api.stripe.com/v1').replace(/\/$/, ''); }
}

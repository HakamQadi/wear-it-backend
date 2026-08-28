import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { AppError } from '../common/errors/app-error';

export type StripeJson = Record<string, unknown>;

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  constructor(private readonly config: ConfigService) {}
  isConfigured(): boolean { return Boolean(this.secretKey() && this.webhookSecret()); }
  async createCustomer(input: { userId: string; email: string; name: string }) { return this.request('customers', { email: input.email, name: input.name, 'metadata[userId]': input.userId }, `wear-it-customer:${input.userId}`); }
  async createCheckout(input: { userId: string; planId: string; customerId: string; planName: string; priceCents: number; currency: string; successUrl: string; cancelUrl: string; idempotencyKey: string }) {
    return this.request('checkout/sessions', {
      mode: 'subscription', customer: input.customerId, success_url: input.successUrl, cancel_url: input.cancelUrl,
      'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': input.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(input.priceCents), 'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][product_data][name]': input.planName, 'metadata[userId]': input.userId, 'metadata[planId]': input.planId,
      'subscription_data[metadata][userId]': input.userId, 'subscription_data[metadata][planId]': input.planId,
    }, input.idempotencyKey);
  }
  async createPortal(customerId: string, returnUrl: string) { return this.request('billing_portal/sessions', { customer: customerId, return_url: returnUrl }); }
  async getSubscription(subscriptionId: string) { return this.request(`subscriptions/${encodeURIComponent(subscriptionId)}`, undefined, undefined, 'GET'); }
  async getCheckoutSession(sessionId: string) { return this.request(`checkout/sessions/${encodeURIComponent(sessionId)}`, undefined, undefined, 'GET'); }

  parseWebhook(rawBody: Buffer, signatureHeader?: string): { type: string; created: number; data: { object: StripeJson } } {
    const secret = this.webhookSecret();
    if (!secret || !signatureHeader) throw AppError.badRequest('INVALID_WEBHOOK_SIGNATURE', 'The payment webhook signature is missing or invalid');
    const parts = signatureHeader.split(',').map((part) => part.trim());
    const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2);
    const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
    if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) throw AppError.badRequest('INVALID_WEBHOOK_SIGNATURE', 'The payment webhook signature is missing or invalid');
    const tolerance = Number(this.config.get<string>('STRIPE_WEBHOOK_TOLERANCE_SECONDS', '300'));
    if (!Number.isFinite(tolerance) || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > tolerance) throw AppError.badRequest('INVALID_WEBHOOK_SIGNATURE', 'The payment webhook signature is too old');
    const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
    const valid = signatures.some((candidate) => /^[a-f0-9]{64}$/i.test(candidate) && timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(candidate, 'hex')));
    if (!valid) throw AppError.badRequest('INVALID_WEBHOOK_SIGNATURE', 'The payment webhook signature is invalid');
    let event: unknown; try { event = JSON.parse(rawBody.toString('utf8')); } catch { throw AppError.badRequest('INVALID_WEBHOOK_PAYLOAD', 'The payment webhook body is not valid JSON'); }
    const parsed = event as { type?: unknown; created?: unknown; data?: { object?: unknown } };
    if (typeof parsed.type !== 'string' || typeof parsed.created !== 'number' || !parsed.data?.object) throw AppError.badRequest('INVALID_WEBHOOK_PAYLOAD', 'The payment webhook body is incomplete');
    return { type: parsed.type, created: parsed.created, data: { object: parsed.data.object as StripeJson } };
  }
  private secretKey() { return this.config.get<string>('STRIPE_SECRET_KEY')?.trim() || ''; }
  private webhookSecret() { return this.config.get<string>('STRIPE_WEBHOOK_SECRET')?.trim() || ''; }
  private apiBase() { return (this.config.get<string>('STRIPE_API_BASE_URL', 'https://api.stripe.com/v1') || '').replace(/\/+$/, ''); }
  private async request(path: string, form?: Record<string, string>, idempotencyKey?: string, method: 'POST' | 'GET' = 'POST'): Promise<StripeJson> {
    const key = this.secretKey(); if (!key) throw AppError.serviceUnavailable('PAYMENTS_NOT_CONFIGURED', 'Payments are not configured yet');
    const headers: Record<string, string> = { Authorization: `Bearer ${key}` }; if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded'; if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    let response: Response; try { response = await fetch(`${this.apiBase()}/${path}`, { method, headers, body: method === 'POST' ? new URLSearchParams(form ?? {}).toString() : undefined }); } catch (error: unknown) { this.logger.error(`Stripe request failed: ${error instanceof Error ? error.message : String(error)}`); throw AppError.badGateway('PAYMENT_PROVIDER_ERROR', 'The payment provider could not be reached'); }
    const payload = (await response.json().catch(() => ({}))) as StripeJson & { error?: { message?: string } };
    if (!response.ok) { this.logger.error(`Stripe ${method} ${path} failed: ${payload.error?.message || `HTTP ${response.status}`}`); throw AppError.badGateway('PAYMENT_PROVIDER_ERROR', 'The payment provider rejected the request'); }
    return payload;
  }
}

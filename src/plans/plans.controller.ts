import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtPayload } from '../common/types/jwt-payload';
import { AppError } from '../common/errors/app-error';
import { AccountRole } from '../common/types/jwt-payload';
import { BillingService } from './billing.service';
import { UpdatePlanDto } from './plan.dto';
import { isPlanTier, PlanTier } from './plan.enums';
import { PlansService } from './plans.service';
import { StripeService } from './stripe.service';

@Controller()
export class PlansController {
  constructor(
    private readonly plans: PlansService,
    private readonly billing: BillingService,
    private readonly stripe: StripeService,
  ) {}

  @Get('plans')
  plansPublic() { return this.plans.listPublic(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.ADMIN)
  @Get('admin/plans')
  plansAdmin() { return this.plans.listAdmin(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.ADMIN)
  @Patch('admin/plans/:tier')
  updatePlan(@Param('tier') rawTier: string, @Body() dto: UpdatePlanDto) {
    return this.plans.update(this.parseTier(rawTier), dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('billing/me')
  billingStatus(@CurrentUser() user: JwtPayload) { return this.billing.status(user.sub); }

  @UseGuards(JwtAuthGuard)
  @Post('billing/checkout')
  checkout(@CurrentUser() user: JwtPayload) { return this.billing.checkout(user.sub, user.email); }

  @UseGuards(JwtAuthGuard)
  @Post('billing/portal')
  portal(@CurrentUser() user: JwtPayload) { return this.billing.portal(user.sub); }

  @Post('billing/stripe/webhook')
  async webhook(@Req() req: Request & { rawBody?: Buffer }) {
    const signature = req.headers['stripe-signature'];
    if (!req.rawBody || typeof signature !== 'string') {
      throw AppError.badRequest('INVALID_STRIPE_SIGNATURE', 'Missing Stripe signature');
    }
    this.stripe.verifyWebhook(req.rawBody, signature);
    return this.billing.handleStripeEvent(req.body as { type?: string; data?: { object?: unknown } });
  }

  private parseTier(value: string): PlanTier {
    if (isPlanTier(value)) return value;
    throw AppError.badRequest('INVALID_PLAN_TIER', 'Plan tier must be free or pro');
  }
}

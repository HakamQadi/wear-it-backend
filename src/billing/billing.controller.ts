import { Body, Controller, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../common/types/jwt-payload';
import { AppError } from '../common/errors/app-error';
import { BillingService } from './billing.service';
import { CheckoutPlanDto } from './billing.dto';
@Controller('billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}
  @Get('plans') plans() { return this.service.publicPlans(); }
  @UseGuards(JwtAuthGuard) @Get('me') me(@CurrentUser() user: JwtPayload) { return this.service.me(user.sub); }
  @UseGuards(JwtAuthGuard) @Post('checkout') checkout(@CurrentUser() user: JwtPayload, @Body() dto: CheckoutPlanDto) { return this.service.checkout(user.sub, dto.planId); }
  @UseGuards(JwtAuthGuard) @Post('portal') portal(@CurrentUser() user: JwtPayload) { return this.service.portal(user.sub); }
  @Post('webhook') webhook(@Req() request: Request & { rawBody?: Buffer }, @Headers('stripe-signature') signature?: string) {
    if (!request.rawBody) throw AppError.badRequest('INVALID_WEBHOOK_PAYLOAD', 'Raw request body is unavailable for payment webhook verification');
    return this.service.webhook(request.rawBody, signature);
  }
}

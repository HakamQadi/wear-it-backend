import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { BillingService } from './billing.service';
import { Plan, PlanSchema } from './plan.schema';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { StripeService } from './stripe.service';
import { Subscription, SubscriptionSchema } from './subscription.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Plan.name, schema: PlanSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
  ],
  controllers: [PlansController],
  providers: [PlansService, BillingService, StripeService],
  exports: [PlansService, BillingService, MongooseModule],
})
export class PlansModule {}

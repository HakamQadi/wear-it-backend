import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AdminPlansController } from './admin-plans.controller';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { GenerationUsage, GenerationUsageSchema } from './generation-usage.schema';
import { Plan, PlanSchema } from './plan.schema';
import { StripeService } from './stripe.service';
import { Subscription, SubscriptionSchema } from './subscription.schema';
@Module({ imports: [AuthModule, MongooseModule.forFeature([{ name: Plan.name, schema: PlanSchema }, { name: Subscription.name, schema: SubscriptionSchema }, { name: GenerationUsage.name, schema: GenerationUsageSchema }])], controllers: [BillingController, AdminPlansController], providers: [BillingService, StripeService], exports: [BillingService] })
export class BillingModule {}

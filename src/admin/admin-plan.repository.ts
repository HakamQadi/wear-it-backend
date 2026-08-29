import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../auth/user.schema';
import { AccountRole } from '../common/types/jwt-payload';
import { PlanTier, SubscriptionProvider, SubscriptionStatus } from '../plans/plan.enums';
import { Plan } from '../plans/plan.schema';
import { Subscription } from '../plans/subscription.schema';
import { addMonth } from '../plans/subscription.utils';
import { AdminMemberPlanDto } from './admin.dto';

export interface MemberPlanState {
  userId: string;
  generationCount: number;
  plan: AdminMemberPlanDto | null;
}

type PlanRow = Plan & { _id: Types.ObjectId };
type SubscriptionRow = Subscription & { _id: Types.ObjectId };

function toPlanDto(plan: PlanRow): AdminMemberPlanDto {
  return {
    _id: plan._id.toString(),
    tier: plan.tier,
    name: plan.name,
    nameAr: plan.nameAr,
    generationLimit: plan.generationLimit,
    isActive: plan.isActive,
  };
}

@Injectable()
export class AdminPlanRepository {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Plan.name) private readonly plans: Model<Plan>,
    @InjectModel(Subscription.name) private readonly subscriptions: Model<Subscription>,
  ) {}

  async memberExists(userId: Types.ObjectId): Promise<boolean> {
    return Boolean(await this.users.exists({ _id: userId, role: AccountRole.USER }));
  }

  async findPlan(planId: Types.ObjectId): Promise<AdminMemberPlanDto | null> {
    const plan = await this.plans.findById(planId).lean().exec() as PlanRow | null;
    return plan ? toPlanDto(plan) : null;
  }

  async findMemberPlanStates(userIds: Types.ObjectId[]): Promise<MemberPlanState[]> {
    if (userIds.length === 0) return [];

    const [subscriptions, freePlan] = await Promise.all([
      this.subscriptions.find({ userId: { $in: userIds } }).lean().exec() as Promise<SubscriptionRow[]>,
      this.plans.findOne({ tier: PlanTier.FREE }).lean().exec() as Promise<PlanRow | null>,
    ]);
    const subscriptionsByUser = new Map(subscriptions.map((subscription) => [subscription.userId.toString(), subscription]));
    const planIds = subscriptions.map((subscription) => subscription.planId);
    const plans = planIds.length
      ? await this.plans.find({ _id: { $in: planIds } }).lean().exec() as PlanRow[]
      : [];
    const plansById = new Map(plans.map((plan) => [plan._id.toString(), plan]));

    return userIds.map((userId) => {
      const subscription = subscriptionsByUser.get(userId.toString());
      const plan = subscription ? plansById.get(subscription.planId.toString()) : freePlan;
      return {
        userId: userId.toString(),
        generationCount: subscription?.generationCount ?? 0,
        plan: plan ? toPlanDto(plan) : null,
      };
    });
  }

  async assignPlan(
    userId: Types.ObjectId,
    planId: Types.ObjectId,
    adminId: Types.ObjectId,
  ): Promise<{ generationCount: number }> {
    const now = new Date();
    const subscription = await this.subscriptions.findOneAndUpdate(
      { userId },
      {
        $set: {
          planId,
          adminPlanAssignedBy: adminId,
          adminPlanAssignedAt: now,
          generationCount: 0,
          currentPeriodStart: now,
          currentPeriodEnd: addMonth(now),
        },
        $setOnInsert: {
          status: SubscriptionStatus.FREE,
          provider: SubscriptionProvider.FREE,
          cancelAtPeriodEnd: false,
        },
      },
      { new: true, upsert: true },
    ).lean().exec();

    return { generationCount: subscription?.generationCount ?? 0 };
  }
}

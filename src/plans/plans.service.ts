import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppError } from '../common/errors/app-error';
import { UpdatePlanDto } from './plan.dto';
import { PlanTier } from './plan.enums';
import { Plan } from './plan.schema';

const DEFAULTS: Record<PlanTier, Partial<Plan>> = {
  [PlanTier.FREE]: {
    tier: PlanTier.FREE, name: 'Free', nameAr: 'مجاني',
    description: 'Try Wear It with a small monthly generation allowance.',
    descriptionAr: 'جرّب Wear It مع عدد محدود من التوليدات شهرياً.',
    priceCents: 0, currency: 'USD', generationLimit: 3,
    features: ['3 AI look generations per month', 'Virtual closet', 'Saved personal photos'],
    featuresAr: ['3 توليدات إطلالة بالذكاء الاصطناعي شهرياً', 'خزانة افتراضية', 'حفظ الصور الشخصية'],
    isActive: true, sortOrder: 1,
  },
  [PlanTier.PRO]: {
    tier: PlanTier.PRO, name: 'Pro', nameAr: 'برو',
    description: 'For members who create looks regularly.',
    descriptionAr: 'للمستخدمين الذين ينشئون إطلالات بشكل منتظم.',
    priceCents: 999, currency: 'USD', generationLimit: 30,
    features: ['30 AI look generations per month', 'Virtual closet', 'Saved personal photos'],
    featuresAr: ['30 توليد إطلالة بالذكاء الاصطناعي شهرياً', 'خزانة افتراضية', 'حفظ الصور الشخصية'],
    isActive: true, sortOrder: 2,
  },
};

@Injectable()
export class PlansService implements OnModuleInit {
  constructor(@InjectModel(Plan.name) private readonly model: Model<Plan>) {}

  async onModuleInit() {
    for (const tier of Object.values(PlanTier)) {
      await this.model.updateOne({ tier }, { $setOnInsert: DEFAULTS[tier] }, { upsert: true }).exec();
    }
  }

  listPublic() {
    return this.model.find({ isActive: true }).sort({ sortOrder: 1 }).lean().exec();
  }

  listAdmin() {
    return this.model.find().sort({ sortOrder: 1 }).lean().exec();
  }

  async getByTier(tier: PlanTier) {
    const plan = await this.model.findOne({ tier }).lean().exec();
    if (!plan) throw AppError.notFound('PLAN_NOT_FOUND', 'Plan not found');
    return plan;
  }

  async update(tier: PlanTier, dto: UpdatePlanDto) {
    if (tier === PlanTier.FREE && dto.priceCents !== undefined && dto.priceCents !== 0) {
      throw AppError.badRequest('FREE_PLAN_MUST_BE_FREE', 'The Free plan price must remain zero');
    }
    if (tier === PlanTier.FREE && dto.isActive === false) {
      throw AppError.badRequest('FREE_PLAN_REQUIRED', 'The Free plan cannot be disabled');
    }
    if (tier === PlanTier.PRO && dto.priceCents !== undefined && dto.priceCents < 1) {
      throw AppError.badRequest('PRO_PLAN_PRICE_REQUIRED', 'The Pro plan price must be greater than zero');
    }
    const update = { ...dto, ...(dto.currency ? { currency: dto.currency.toUpperCase() } : {}) };
    const plan = await this.model.findOneAndUpdate({ tier }, { $set: update }, { new: true }).lean().exec();
    if (!plan) throw AppError.notFound('PLAN_NOT_FOUND', 'Plan not found');
    return plan;
  }
}

import { IsMongoId } from 'class-validator';
import { PlanTier } from '../plans/plan.enums';

export class AssignMemberPlanDto {
  @IsMongoId()
  planId!: string;
}

export class AdminMemberPlanDto {
  _id!: string;
  tier!: PlanTier;
  name!: string;
  nameAr!: string;
  generationLimit!: number;
  isActive!: boolean;
}

export class AdminMemberDto {
  _id!: string;
  name!: string;
  email!: string;
  createdAt!: Date;
  itemCount!: number;
  lookCount!: number;
  generationCount!: number;
  plan!: AdminMemberPlanDto | null;
}

export class AssignMemberPlanResponseDto {
  userId!: string;
  generationCount!: number;
  plan!: AdminMemberPlanDto;
}

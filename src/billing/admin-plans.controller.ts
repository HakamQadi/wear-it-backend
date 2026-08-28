import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { BillingService } from './billing.service';
import { UpdatePlanDto } from './billing.dto';
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/plans')
export class AdminPlansController {
  constructor(private readonly service: BillingService) {}
  @Get() list() { return this.service.adminPlans(); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdatePlanDto) { return this.service.updatePlan(id, dto); }
}

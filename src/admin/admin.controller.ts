import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AccountRole, JwtPayload } from '../common/types/jwt-payload';
import { AssignMemberPlanDto } from './admin.dto';
import { AdminService } from './admin.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Get('type-usage')
  typeUsage() {
    return this.service.typeUsage();
  }

  @Get('members')
  members() {
    return this.service.members();
  }

  @Patch('members/:userId/plan')
  assignMemberPlan(
    @Param('userId') userId: string,
    @Body() dto: AssignMemberPlanDto,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.service.assignMemberPlan(userId, dto.planId, admin.sub);
  }
}

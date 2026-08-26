import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminService } from './admin.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
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
}

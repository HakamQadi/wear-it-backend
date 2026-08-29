import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AccountRole } from '../common/types/jwt-payload';
import { UpdateContentDto } from './content.dto';
import { ContentService } from './content.service';

@Controller('content')
export class ContentController {
  constructor(private readonly service: ContentService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(AccountRole.ADMIN)
  @Patch()
  update(@Body() dto: UpdateContentDto) {
    return this.service.update(dto);
  }
}

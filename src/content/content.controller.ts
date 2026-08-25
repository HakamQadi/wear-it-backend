import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UpdateContentDto } from './content.dto';
import { ContentService } from './content.service';
@Controller('content')
export class ContentController {
  constructor(private readonly service: ContentService) {}
  @Get() get() { return this.service.get(); }
  @UseGuards(JwtAuthGuard) @Patch() update(@Body() dto: UpdateContentDto) { return this.service.update(dto); }
}

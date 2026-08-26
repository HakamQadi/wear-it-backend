import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../common/types/jwt-payload';
import { TryOnService } from '../try-on/try-on.service';
import { GenerateLookDto } from './look.dto';
import { LooksService } from './looks.service';

@UseGuards(JwtAuthGuard)
@Controller('looks')
export class LooksController {
  constructor(
    private readonly service: LooksService,
    private readonly tryOn: TryOnService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user.sub);
  }

  /** Lets the studio warn before a member composes a look the backend cannot render. */
  @Get('status')
  status() {
    return { aiConfigured: this.tryOn.isConfigured() };
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.findOne(user.sub, id);
  }

  @Post('generate')
  generate(@CurrentUser() user: JwtPayload, @Body() dto: GenerateLookDto) {
    return this.service.generate(user.sub, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.remove(user.sub, id);
  }
}

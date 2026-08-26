import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../common/types/jwt-payload';
import { CreateWardrobeItemDto, UpdateWardrobeItemDto } from './wardrobe.dto';
import { WardrobeService } from './wardrobe.service';

@UseGuards(JwtAuthGuard)
@Controller('wardrobe')
export class WardrobeController {
  constructor(private readonly service: WardrobeService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('typeId') typeId?: string,
    @Query('search') search?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.service.findAll(user.sub, { typeId, search, includeArchived });
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.findOne(user.sub, id);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateWardrobeItemDto) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateWardrobeItemDto) {
    return this.service.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.remove(user.sub, id);
  }
}

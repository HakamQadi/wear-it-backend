import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AccountRole } from '../common/types/jwt-payload';
import { CreateClothingTypeDto, UpdateClothingTypeDto } from './clothing-type.dto';
import { ClothingTypesService } from './clothing-types.service';

@Controller('clothing-types')
export class ClothingTypesController {
  constructor(private readonly service: ClothingTypesService) {}

  /** Public: the types a member can pick from when adding an item. */
  @Get()
  findAll() {
    return this.service.findAll(false);
  }

  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(AccountRole.ADMIN)
  @Get('admin/all')
  adminAll() {
    return this.service.findAll(true);
  }

  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(AccountRole.ADMIN)
  @Post()
  create(@Body() dto: CreateClothingTypeDto) {
    return this.service.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(AccountRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClothingTypeDto) {
    return this.service.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(AccountRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './category.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  findAll() { return this.service.findAll(false); }

  @UseGuards(JwtAuthGuard) @Get('admin/all')
  adminAll() { return this.service.findAll(true); }

  @UseGuards(JwtAuthGuard) @Post()
  create(@Body() dto: CreateCategoryDto) { return this.service.create(dto); }

  @UseGuards(JwtAuthGuard) @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) { return this.service.update(id, dto); }

  @UseGuards(JwtAuthGuard) @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateProductDto, UpdateProductDto } from './product.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  findAll(@Query('search') search?: string, @Query('category') category?: string, @Query('featured') featured?: string) {
    return this.service.findAll({ search, category, featured });
  }

  @UseGuards(JwtAuthGuard) @Get('admin/all')
  adminAll(@Query('search') search?: string) { return this.service.findAll({ search }, true); }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) { return this.service.findBySlug(slug); }

  @UseGuards(JwtAuthGuard) @Post()
  create(@Body() dto: CreateProductDto) { return this.service.create(dto); }

  @UseGuards(JwtAuthGuard) @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) { return this.service.update(id, dto); }

  @UseGuards(JwtAuthGuard) @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}

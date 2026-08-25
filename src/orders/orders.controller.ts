import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateOrderDto, UpdateOrderStatusDto } from './order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}
  @Post() create(@Body() dto: CreateOrderDto) { return this.service.create(dto); }
  @UseGuards(JwtAuthGuard) @Get() findAll() { return this.service.findAll(); }
  @UseGuards(JwtAuthGuard) @Patch(':id/status') updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) { return this.service.updateStatus(id, dto.status); }
}

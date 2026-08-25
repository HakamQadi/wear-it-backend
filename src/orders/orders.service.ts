import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product } from '../products/product.schema';
import { CreateOrderDto } from './order.dto';
import { Order, OrderItem } from './order.schema';

type ReservableItem = Pick<OrderItem, 'productId' | 'quantity'>;

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
  ) {}

  private async releaseStock(items: ReservableItem[]) {
    await Promise.all(items.map((item) => this.productModel.updateOne(
      { _id: item.productId },
      { $inc: { stock: item.quantity } },
    ).exec()));
  }

  private async reserveStock(items: ReservableItem[]) {
    const reserved: ReservableItem[] = [];
    try {
      for (const item of items) {
        const result = await this.productModel.updateOne(
          { _id: item.productId, isActive: true, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
        ).exec();
        if (result.modifiedCount !== 1) throw new BadRequestException('An item is no longer available in the requested quantity');
        reserved.push(item);
      }
    } catch (error) {
      if (reserved.length) await this.releaseStock(reserved);
      throw error;
    }
  }

  async create(dto: CreateOrderDto) {
    const ids = [...new Set(dto.items.map((item) => item.productId))];
    const products = await this.productModel.find({ _id: { $in: ids }, isActive: true }).exec();
    if (products.length !== ids.length) throw new BadRequestException('One or more products are unavailable');
    const productMap = new Map(products.map((product) => [product._id.toString(), product]));

    const items = dto.items.map((item) => {
      const product = productMap.get(item.productId)!;
      if (!product.sizes.includes(item.size) || !product.colors.includes(item.color)) {
        throw new BadRequestException(`Invalid option selected for ${product.name}`);
      }
      return {
        productId: new Types.ObjectId(item.productId), name: product.name, unitPrice: product.price,
        quantity: item.quantity, size: item.size, color: item.color, image: product.images[0] || '',
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const delivery = subtotal >= 100 ? 0 : 5;
    const orderNumber = `WI-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    await this.reserveStock(items);
    try {
      const order = await this.orderModel.create({ ...dto, items, subtotal, delivery, total: subtotal + delivery, orderNumber });
      return order.toObject();
    } catch (error) {
      await this.releaseStock(items);
      throw error;
    }
  }

  findAll() { return this.orderModel.find().sort({ createdAt: -1 }).lean().exec(); }

  async updateStatus(id: string, status: string) {
    const current = await this.orderModel.findById(id).exec();
    if (!current) throw new NotFoundException('Order not found');
    if (current.status === status) return current.toObject();

    const wasCancelled = current.status === 'cancelled';
    const willBeCancelled = status === 'cancelled';
    if (!wasCancelled && willBeCancelled) await this.releaseStock(current.items);
    if (wasCancelled && !willBeCancelled) await this.reserveStock(current.items);

    current.status = status;
    try {
      await current.save();
      return current.toObject();
    } catch (error) {
      if (!wasCancelled && willBeCancelled) await this.reserveStock(current.items);
      if (wasCancelled && !willBeCancelled) await this.releaseStock(current.items);
      throw error;
    }
  }
}

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Product } from '../products/product.schema';

export type OrderDocument = HydratedDocument<Order>;

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, ref: Product.name, required: true }) productId!: Types.ObjectId;
  @Prop({ required: true }) name!: string;
  @Prop({ required: true, min: 0 }) unitPrice!: number;
  @Prop({ required: true, min: 1 }) quantity!: number;
  @Prop({ required: true }) size!: string;
  @Prop({ required: true }) color!: string;
  @Prop() image?: string;
}
const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ timestamps: true })
export class Order {
  @Prop({ required: true, unique: true }) orderNumber!: string;
  @Prop({ required: true }) customerName!: string;
  @Prop({ required: true, lowercase: true }) email!: string;
  @Prop({ required: true }) phone!: string;
  @Prop({ required: true }) address!: string;
  @Prop({ required: true }) city!: string;
  @Prop({ default: '' }) notes!: string;
  @Prop({ type: [OrderItemSchema], required: true }) items!: OrderItem[];
  @Prop({ required: true, min: 0 }) subtotal!: number;
  @Prop({ required: true, min: 0 }) delivery!: number;
  @Prop({ required: true, min: 0 }) total!: number;
  @Prop({ enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'], default: 'pending' }) status!: string;
  @Prop({ enum: ['cash_on_delivery'], default: 'cash_on_delivery' }) paymentMethod!: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ createdAt: -1 });

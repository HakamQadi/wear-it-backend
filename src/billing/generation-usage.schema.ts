import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GenerationUsageDocument = HydratedDocument<GenerationUsage>;

@Schema({ timestamps: true, collection: 'generation_usage' })
export class GenerationUsage {
  @Prop({ type: Types.ObjectId, required: true, index: true, ref: 'User' }) userId!: Types.ObjectId;
  @Prop({ required: true }) periodKey!: string;
  @Prop({ type: Types.ObjectId, required: true, ref: 'Plan' }) planId!: Types.ObjectId;
  @Prop({ required: true, min: 1 }) limit!: number;
  @Prop({ default: 0, min: 0 }) used!: number;
  @Prop({ required: true }) periodStart!: Date;
  @Prop({ required: true }) periodEnd!: Date;
}
export const GenerationUsageSchema = SchemaFactory.createForClass(GenerationUsage);
GenerationUsageSchema.index({ userId: 1, periodKey: 1 }, { unique: true });

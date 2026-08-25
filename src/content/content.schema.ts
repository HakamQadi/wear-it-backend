import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
export type SiteContentDocument = HydratedDocument<SiteContent>;
@Schema({ timestamps: true })
export class SiteContent {
  @Prop({ required: true, unique: true, default: 'main' }) key!: string;
  @Prop({ default: 'Wear it your way.' }) heroTitle!: string;
  @Prop({ default: 'Modern pieces, made easier to imagine on you.' }) heroSubtitle!: string;
  @Prop({ default: 'Try it on' }) heroCta!: string;
  @Prop({ default: 'Fresh fits. Better confidence.' }) announcement!: string;
  @Prop({ default: 'Wear It' }) brandName!: string;
  @Prop({ default: 'Style that feels like you.' }) footerText!: string;
}
export const SiteContentSchema = SchemaFactory.createForClass(SiteContent);

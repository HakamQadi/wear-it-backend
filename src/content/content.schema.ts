import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SiteContentDocument = HydratedDocument<SiteContent>;

@Schema({ timestamps: true })
export class SiteContent {
  @Prop({ required: true, unique: true, default: 'main' }) key!: string;
  @Prop({ default: 'Wear It' }) brandName!: string;
  @Prop({ default: 'Your closet, digitised.' }) heroTitle!: string;
  @Prop({ default: 'Photograph what you already own, then see yourself wearing any combination of it.' }) heroSubtitle!: string;
  @Prop({ default: 'Build my closet' }) heroCta!: string;
  @Prop({ default: 'Plan tomorrow’s outfit tonight.' }) announcement!: string;
  @Prop({ default: 'A digital wardrobe that shows you the outfit before you wear it.' }) footerText!: string;
}

export const SiteContentSchema = SchemaFactory.createForClass(SiteContent);

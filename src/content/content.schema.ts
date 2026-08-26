import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SiteContentDocument = HydratedDocument<SiteContent>;

/** One piece of public copy, held in both interface languages. */
@Schema({ _id: false })
export class LocalisedText {
  @Prop({ default: '' }) ar!: string;
  @Prop({ default: '' }) en!: string;
}
const LocalisedTextSchema = SchemaFactory.createForClass(LocalisedText);

const localised = (ar: string, en: string) => ({
  type: LocalisedTextSchema,
  default: () => ({ ar, en }),
});

@Schema({ timestamps: true })
export class SiteContent {
  @Prop({ required: true, unique: true, default: 'main' }) key!: string;

  @Prop(localised('Wear It', 'Wear It')) brandName!: LocalisedText;

  @Prop(localised('خزانتك، رقميًا.', 'Your closet, digitised.')) heroTitle!: LocalisedText;

  @Prop(
    localised(
      'صوّر ما تملكه بالفعل، واحفظه في خزانتك الافتراضية، ثم دع الذكاء الاصطناعي يريك نفسك مرتديًا أي تنسيق منها.',
      'Photograph what you already own, then see yourself wearing any combination of it.',
    ),
  )
  heroSubtitle!: LocalisedText;

  @Prop(localised('أنشئ خزانتي', 'Build my closet')) heroCta!: LocalisedText;

  @Prop(
    localised(
      'خطّط لإطلالة الغد الليلة — من الملابس التي تملكها بالفعل.',
      'Plan tomorrow’s outfit tonight — from the clothes you already own.',
    ),
  )
  announcement!: LocalisedText;

  @Prop(
    localised(
      'خزانة رقمية تريك الإطلالة قبل أن ترتديها.',
      'A digital wardrobe that shows you the outfit before you wear it.',
    ),
  )
  footerText!: LocalisedText;
}

export const SiteContentSchema = SchemaFactory.createForClass(SiteContent);

export const CONTENT_FIELDS = [
  'brandName',
  'heroTitle',
  'heroSubtitle',
  'heroCta',
  'announcement',
  'footerText',
] as const;

export type ContentField = (typeof CONTENT_FIELDS)[number];

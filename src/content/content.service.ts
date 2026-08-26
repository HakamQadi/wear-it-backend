import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UpdateContentDto } from './content.dto';
import { CONTENT_FIELDS, LocalisedText, SiteContent } from './content.schema';

type StoredValue = LocalisedText | string | null | undefined;
type ContentDocument = Record<string, unknown>;

@Injectable()
export class ContentService {
  constructor(@InjectModel(SiteContent.name) private readonly model: Model<SiteContent>) {}

  /**
   * Content written before the site became bilingual is a plain string. Reading it as
   * `{ ar, en }` would yield undefined in both languages, so a legacy string is treated as
   * the copy for each language until an admin edits it.
   */
  private static normalise(value: StoredValue, fallback = ''): LocalisedText {
    if (typeof value === 'string') return { ar: value, en: value };
    const ar = value?.ar ?? '';
    const en = value?.en ?? '';
    return { ar: ar || en || fallback, en: en || ar || fallback };
  }

  private static shape(document: ContentDocument): ContentDocument {
    const result: ContentDocument = { ...document };
    for (const field of CONTENT_FIELDS) {
      result[field] = ContentService.normalise(document[field] as StoredValue);
    }
    return result;
  }

  async get() {
    const existing = await this.model.findOne({ key: 'main' }).lean().exec();
    if (existing) return ContentService.shape(existing as unknown as ContentDocument);
    const created = await this.model.create({ key: 'main' });
    return ContentService.shape(created.toObject() as unknown as ContentDocument);
  }

  /** Merges per language, so saving only Arabic never blanks the English copy. */
  async update(dto: UpdateContentDto) {
    const current = (await this.get()) as ContentDocument;
    const merged: Record<string, LocalisedText> = {};

    for (const field of CONTENT_FIELDS) {
      const existing = ContentService.normalise(current[field] as StoredValue);
      const incoming = dto[field];
      merged[field] = {
        ar: incoming?.ar ?? existing.ar,
        en: incoming?.en ?? existing.en,
      };
    }

    const saved = await this.model
      .findOneAndUpdate({ key: 'main' }, merged, { new: true, upsert: true, runValidators: true })
      .lean()
      .exec();
    return ContentService.shape(saved as unknown as ContentDocument);
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UpdateContentDto } from './content.dto';
import { SiteContent } from './content.schema';

@Injectable()
export class ContentService {
  constructor(@InjectModel(SiteContent.name) private readonly model: Model<SiteContent>) {}

  /** Reading never writes; the document is only created the first time it is missing. */
  async get() {
    const existing = await this.model.findOne({ key: 'main' }).lean().exec();
    if (existing) return existing;
    const created = await this.model.create({ key: 'main' });
    return created.toObject();
  }

  update(dto: UpdateContentDto) {
    return this.model
      .findOneAndUpdate({ key: 'main' }, dto, { new: true, upsert: true, runValidators: true })
      .lean()
      .exec();
  }
}

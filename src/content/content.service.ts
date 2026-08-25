import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SiteContent } from './content.schema';
import { UpdateContentDto } from './content.dto';
@Injectable()
export class ContentService {
  constructor(@InjectModel(SiteContent.name) private readonly model: Model<SiteContent>) {}
  async get() { return (await this.model.findOne({ key: 'main' }).lean().exec()) || this.model.create({ key: 'main' }); }
  update(dto: UpdateContentDto) { return this.model.findOneAndUpdate({ key: 'main' }, dto, { new: true, upsert: true, runValidators: true }).lean().exec(); }
}

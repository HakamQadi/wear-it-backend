import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SiteContent, SiteContentSchema } from './content.schema';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
@Module({ imports: [MongooseModule.forFeature([{ name: SiteContent.name, schema: SiteContentSchema }])], controllers: [ContentController], providers: [ContentService], exports: [MongooseModule] })
export class ContentModule {}

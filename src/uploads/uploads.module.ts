import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Look, LookSchema } from '../looks/look.schema';
import { UserPhoto, UserPhotoSchema } from '../photos/user-photo.schema';
import { WardrobeItem, WardrobeItemSchema } from '../wardrobe/wardrobe-item.schema';
import { RemoteImageService } from './remote-image.service';
import { StorageService } from './storage.service';
import { UploadsController } from './uploads.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WardrobeItem.name, schema: WardrobeItemSchema },
      { name: UserPhoto.name, schema: UserPhotoSchema },
      { name: Look.name, schema: LookSchema },
    ]),
  ],
  controllers: [UploadsController],
  providers: [StorageService, RemoteImageService],
  exports: [StorageService, RemoteImageService],
})
export class UploadsModule {}

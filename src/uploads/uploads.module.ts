import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Look, LookSchema } from '../looks/look.schema';
import { UserPhoto, UserPhotoSchema } from '../photos/user-photo.schema';
import { WardrobeItem, WardrobeItemSchema } from '../wardrobe/wardrobe-item.schema';
import { ImageKitService } from './imagekit.service';
import { MediaAsset, MediaAssetSchema } from './media-asset.schema';
import { MediaController } from './media.controller';
import { RemoteImageService } from './remote-image.service';
import { StorageService } from './storage.service';
import { UploadsController } from './uploads.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WardrobeItem.name, schema: WardrobeItemSchema },
      { name: UserPhoto.name, schema: UserPhotoSchema },
      { name: Look.name, schema: LookSchema },
      { name: MediaAsset.name, schema: MediaAssetSchema },
    ]),
  ],
  controllers: [UploadsController, MediaController],
  providers: [ImageKitService, StorageService, RemoteImageService],
  exports: [ImageKitService, StorageService, RemoteImageService],
})
export class UploadsModule {}

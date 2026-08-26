import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadsModule } from '../uploads/uploads.module';
import { PhotosController } from './photos.controller';
import { PhotosService } from './photos.service';
import { UserPhoto, UserPhotoSchema } from './user-photo.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: UserPhoto.name, schema: UserPhotoSchema }]), UploadsModule],
  controllers: [PhotosController],
  providers: [PhotosService],
  exports: [MongooseModule, PhotosService],
})
export class PhotosModule {}

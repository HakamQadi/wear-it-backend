import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PhotosModule } from '../photos/photos.module';
import { TryOnModule } from '../try-on/try-on.module';
import { UploadsModule } from '../uploads/uploads.module';
import { WardrobeModule } from '../wardrobe/wardrobe.module';
import { Look, LookSchema } from './look.schema';
import { LooksController } from './looks.controller';
import { LooksService } from './looks.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Look.name, schema: LookSchema }]),
    WardrobeModule,
    PhotosModule,
    TryOnModule,
    UploadsModule,
  ],
  controllers: [LooksController],
  providers: [LooksService],
  exports: [MongooseModule],
})
export class LooksModule {}

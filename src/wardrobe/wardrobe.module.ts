import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClothingTypesModule } from '../clothing-types/clothing-types.module';
import { UploadsModule } from '../uploads/uploads.module';
import { WardrobeController } from './wardrobe.controller';
import { WardrobeItem, WardrobeItemSchema } from './wardrobe-item.schema';
import { WardrobeService } from './wardrobe.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: WardrobeItem.name, schema: WardrobeItemSchema }]),
    ClothingTypesModule,
    UploadsModule,
  ],
  controllers: [WardrobeController],
  providers: [WardrobeService],
  exports: [MongooseModule, WardrobeService],
})
export class WardrobeModule {}

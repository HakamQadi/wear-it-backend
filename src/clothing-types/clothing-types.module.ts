import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WardrobeItem, WardrobeItemSchema } from '../wardrobe/wardrobe-item.schema';
import { ClothingType, ClothingTypeSchema } from './clothing-type.schema';
import { ClothingTypesController } from './clothing-types.controller';
import { ClothingTypesService } from './clothing-types.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ClothingType.name, schema: ClothingTypeSchema },
      { name: WardrobeItem.name, schema: WardrobeItemSchema },
    ]),
  ],
  controllers: [ClothingTypesController],
  providers: [ClothingTypesService],
  exports: [MongooseModule, ClothingTypesService],
})
export class ClothingTypesModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../auth/user.schema';
import { ClothingType, ClothingTypeSchema } from '../clothing-types/clothing-type.schema';
import { SiteContent, SiteContentSchema } from '../content/content.schema';
import { SeedService } from './seed.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: ClothingType.name, schema: ClothingTypeSchema },
      { name: SiteContent.name, schema: SiteContentSchema },
    ]),
  ],
  providers: [SeedService],
})
export class SeedModule {}

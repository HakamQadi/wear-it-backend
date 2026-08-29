import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClothingTypesModule } from '../clothing-types/clothing-types.module';
import { LooksModule } from '../looks/looks.module';
import { PhotosModule } from '../photos/photos.module';
import { PlansModule } from '../plans/plans.module';
import { WardrobeModule } from '../wardrobe/wardrobe.module';
import { AdminController } from './admin.controller';
import { AdminPlanRepository } from './admin-plan.repository';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, ClothingTypesModule, WardrobeModule, PhotosModule, LooksModule, PlansModule],
  controllers: [AdminController],
  providers: [AdminService, AdminPlanRepository],
})
export class AdminModule {}

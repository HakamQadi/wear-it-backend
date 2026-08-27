import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { TryOnService } from './try-on.service';

@Module({
  imports: [UploadsModule],
  providers: [TryOnService],
  exports: [TryOnService],
})
export class TryOnModule {}

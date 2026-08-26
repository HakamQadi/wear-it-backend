import { Module } from '@nestjs/common';
import { TryOnService } from './try-on.service';

@Module({
  providers: [TryOnService],
  exports: [TryOnService],
})
export class TryOnModule {}

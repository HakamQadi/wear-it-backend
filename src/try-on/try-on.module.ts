import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { TryOnController } from './try-on.controller';
import { TryOnService } from './try-on.service';

@Module({
  imports: [ProductsModule],
  controllers: [TryOnController],
  providers: [TryOnService],
})
export class TryOnModule {}

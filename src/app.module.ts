import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ServeStaticModule } from '@nestjs/serve-static';
import { UPLOADS_DIRECTORY } from './uploads/uploads.constants';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { ClothingTypesModule } from './clothing-types/clothing-types.module';
import { ContentModule } from './content/content.module';
import { LooksModule } from './looks/looks.module';
import { PhotosModule } from './photos/photos.module';
import { SeedModule } from './seed/seed.module';
import { TryOnModule } from './try-on/try-on.module';
import { UploadsModule } from './uploads/uploads.module';
import { WardrobeModule } from './wardrobe/wardrobe.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI', 'mongodb://localhost:27017/wear_it'),
      }),
    }),
    ServeStaticModule.forRoot({ rootPath: UPLOADS_DIRECTORY, serveRoot: '/uploads' }),
    AuthModule,
    ClothingTypesModule,
    WardrobeModule,
    PhotosModule,
    TryOnModule,
    LooksModule,
    ContentModule,
    UploadsModule,
    AdminModule,
    SeedModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

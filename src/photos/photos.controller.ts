import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../common/types/jwt-payload';
import { CreateUserPhotoDto, UpdateUserPhotoDto } from './photo.dto';
import { PhotosService } from './photos.service';

@UseGuards(JwtAuthGuard)
@Controller('photos')
export class PhotosController {
  constructor(private readonly service: PhotosService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user.sub);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateUserPhotoDto) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateUserPhotoDto) {
    return this.service.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.remove(user.sub, id);
  }
}

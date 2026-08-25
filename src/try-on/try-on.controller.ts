import { BadRequestException, Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  TRY_ON_ALLOWED_MIME_TYPES,
  TRY_ON_ERRORS,
  TRY_ON_MAX_IMAGE_BYTES,
  TRY_ON_PERSON_IMAGE_FIELD,
} from './try-on.constants';
import { GenerateTryOnDto, GenerateTryOnResponseDto } from './try-on.dto';
import { TryOnService } from './try-on.service';

@Controller('try-on')
export class TryOnController {
  constructor(private readonly service: TryOnService) {}

  @Post('generate')
  @UseInterceptors(FileInterceptor(TRY_ON_PERSON_IMAGE_FIELD, {
    storage: memoryStorage(),
    limits: { fileSize: TRY_ON_MAX_IMAGE_BYTES },
    fileFilter: (_request, file, callback) => callback(null, TRY_ON_ALLOWED_MIME_TYPES.has(file.mimetype)),
  }))
  generate(
    @UploadedFile() personImage: Express.Multer.File | undefined,
    @Body() dto: GenerateTryOnDto,
  ): Promise<GenerateTryOnResponseDto> {
    if (!personImage) throw new BadRequestException(TRY_ON_ERRORS.invalidPersonImage);
    return this.service.generate(personImage, dto);
  }
}

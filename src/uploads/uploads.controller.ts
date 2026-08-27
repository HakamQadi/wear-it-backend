import { Body, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../common/types/jwt-payload';
import { RemoteImageService } from './remote-image.service';
import { StorageService } from './storage.service';
import { ImportImageDto } from './uploads.dto';
import { UPLOAD_ERROR, UPLOAD_FIELD, UPLOAD_MAX_BYTES, UPLOAD_MIME_EXTENSIONS } from './uploads.constants';
import { AppError } from '../common/errors/app-error';

@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly remoteImages: RemoteImageService,
    private readonly storage: StorageService,
  ) {}

  /** Upload straight from the member's device. */
  @Post('image')
  @UseInterceptors(
    // Held in memory so the bytes can go to whichever storage driver is configured; the
    // size limit below is what keeps that bounded.
    FileInterceptor(UPLOAD_FIELD, {
      storage: memoryStorage(),
      limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 },
      fileFilter: (_request, file, callback) => callback(null, Boolean(UPLOAD_MIME_EXTENSIONS[file.mimetype])),
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw AppError.badRequest('UPLOAD_INVALID', UPLOAD_ERROR);
    // Random UUID names: upload URLs are unguessable capability links. The extension comes
    // from the sniffed mimetype, never from the client filename.
    return this.storage.save(file.buffer, UPLOAD_MIME_EXTENSIONS[file.mimetype] ?? '.png');
  }

  /**
   * Import from a link. The image is downloaded here and saved as a normal upload, so the
   * caller gets back the same kind of /uploads/... path a device upload produces.
   */
  @Post('from-url')
  importFromUrl(@CurrentUser() user: JwtPayload, @Body() dto: ImportImageDto) {
    return this.remoteImages.importFromUrl(dto.url, user.sub);
  }
}

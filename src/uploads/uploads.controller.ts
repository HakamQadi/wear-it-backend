import { Body, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../common/types/jwt-payload';
import { RemoteImageService } from './remote-image.service';
import { ImportImageDto } from './uploads.dto';
import { UPLOAD_ERROR, UPLOAD_FIELD, UPLOAD_MAX_BYTES, UPLOAD_MIME_EXTENSIONS, UPLOADS_DIRECTORY } from './uploads.constants';
import { AppError } from '../common/errors/app-error';

@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly remoteImages: RemoteImageService) {}

  /** Upload straight from the member's device. */
  @Post('image')
  @UseInterceptors(
    FileInterceptor(UPLOAD_FIELD, {
      storage: diskStorage({
        destination: UPLOADS_DIRECTORY,
        // Random UUID names: upload URLs are unguessable capability links.
        filename: (_request, file, callback) =>
          callback(null, `${randomUUID()}${UPLOAD_MIME_EXTENSIONS[file.mimetype] ?? '.png'}`),
      }),
      limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 },
      fileFilter: (_request, file, callback) => callback(null, Boolean(UPLOAD_MIME_EXTENSIONS[file.mimetype])),
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw AppError.badRequest('UPLOAD_INVALID', UPLOAD_ERROR);
    return { url: `/uploads/${file.filename}` };
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

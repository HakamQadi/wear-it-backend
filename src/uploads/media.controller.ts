import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { AppError } from '../common/errors/app-error';
import { MEDIA_URL_PATTERN } from '../common/utils/media';
import { StorageService } from './storage.service';

const MEDIA_NOT_FOUND = 'That image could not be found';

/**
 * Serves `/uploads/<filename>`: the file itself while media lives on local disk, or a
 * redirect to the CDN copy once ImageKit holds it. Excluded from the global `api` prefix in
 * main.ts, so the address stays the one already stored in the database and rendered by the
 * frontend whichever driver is configured.
 */
@Controller('uploads')
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Get(':filename')
  serve(@Param('filename') filename: string, @Res() response: Response) {
    const url = `/uploads/${filename}`;
    // The pattern is the same allow-list the DTOs use: one path segment, no dot files.
    if (!MEDIA_URL_PATTERN.test(url)) throw AppError.notFound('MEDIA_NOT_FOUND', MEDIA_NOT_FOUND);

    // A stored name is never reused, so both answers are safe to cache.
    response.setHeader('Cache-Control', 'public, max-age=3600');

    const remote = this.storage.publicUrl(url);
    if (remote) return response.redirect(302, remote);

    const path = StorageService.resolveLocalPath(url);
    if (!path) throw AppError.notFound('MEDIA_NOT_FOUND', MEDIA_NOT_FOUND);
    return response.sendFile(path, (error?: NodeJS.ErrnoException) => {
      if (!error || response.headersSent) return;
      response.status(404).json({ statusCode: 404, code: 'MEDIA_NOT_FOUND', message: MEDIA_NOT_FOUND });
    });
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { Model } from 'mongoose';
import { basename, join } from 'path';
import { Look } from '../looks/look.schema';
import { UserPhoto } from '../photos/user-photo.schema';
import { WardrobeItem } from '../wardrobe/wardrobe-item.schema';
import { ImageKitService } from './imagekit.service';
import { MediaAsset } from './media-asset.schema';
import { UPLOADS_DIRECTORY } from './uploads.constants';

export { UPLOADS_DIRECTORY };
const UPLOAD_PREFIX = '/uploads/';

/**
 * Every stored image is addressed as `/uploads/<filename>`, whichever driver holds the
 * bytes: local disk by default, ImageKit once its credentials are configured. Keeping that
 * one shape means the media validation the DTOs apply (MEDIA_URL_PATTERN) stays a strict
 * allow-list — nothing downstream ever handles a member-supplied address — and rows written
 * before the switch keep working.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    @InjectModel(WardrobeItem.name) private readonly items: Model<WardrobeItem>,
    @InjectModel(UserPhoto.name) private readonly photos: Model<UserPhoto>,
    @InjectModel(Look.name) private readonly looks: Model<Look>,
    @InjectModel(MediaAsset.name) private readonly assets: Model<MediaAsset>,
    private readonly imagekit: ImageKitService,
  ) {}

  /** Filename of an internally hosted upload, or null for external/invalid URLs. */
  static resolveFilename(url: string): string | null {
    if (!url.startsWith(UPLOAD_PREFIX)) return null;
    const filename = basename(url);
    if (!filename || filename.startsWith('.')) return null;
    return filename;
  }

  /** Absolute path for an internally hosted upload, or null for external/invalid URLs. */
  static resolveLocalPath(url: string): string | null {
    const filename = StorageService.resolveFilename(url);
    return filename ? join(UPLOADS_DIRECTORY, filename) : null;
  }

  /** True when uploads go to ImageKit rather than the local uploads directory. */
  get usesImageKit(): boolean {
    return this.imagekit.isConfigured();
  }

  /**
   * Stores bytes under a fresh random name and returns the `/uploads/...` value to save.
   * `prefix` only makes generated looks recognisable in the media library.
   */
  async save(buffer: Buffer, extension: string, prefix = ''): Promise<{ url: string }> {
    const filename = `${prefix}${randomUUID()}${extension}`;
    if (this.usesImageKit) {
      const { fileId } = await this.imagekit.upload(buffer, filename);
      // Recorded so the file can be deleted by id later; see MediaAsset.
      await this.assets.updateOne({ filename }, { $set: { fileId } }, { upsert: true }).exec();
    } else {
      await mkdir(UPLOADS_DIRECTORY, { recursive: true });
      await writeFile(join(UPLOADS_DIRECTORY, filename), buffer);
    }
    return { url: `${UPLOAD_PREFIX}${filename}` };
  }

  /** Reads a stored upload back. Throws for anything that is not an internal upload. */
  async read(url: string): Promise<Buffer> {
    const filename = StorageService.resolveFilename(url);
    if (!filename) throw new Error(`Not an internal upload: ${url}`);
    if (this.usesImageKit) return this.imagekit.download(filename);
    return readFile(join(UPLOADS_DIRECTORY, filename));
  }

  /** Public URL for an upload, used to redirect a browser at the CDN copy. */
  publicUrl(url: string): string | null {
    const filename = StorageService.resolveFilename(url);
    if (!filename || !this.usesImageKit) return null;
    return this.imagekit.fileUrl(filename);
  }

  /** Deletes by recorded id, falling back to the name for files the migration copied over. */
  private async removeRemote(filename: string) {
    const asset = await this.assets.findOne({ filename }).lean().exec();
    if (asset?.fileId) await this.imagekit.removeById(asset.fileId);
    else await this.imagekit.removeByName(filename);
    // Dropped only after the file is gone: losing the id to a failed delete would leave a
    // file nothing can address until the media search index catches up with its name.
    await this.assets.deleteOne({ filename }).exec();
  }

  /**
   * Deletes an uploaded file once nothing in the database points at it any more.
   * Personal photos are sensitive, so a deleted record should not leave the bytes behind.
   */
  async releaseIfUnused(url?: string) {
    const filename = url ? StorageService.resolveFilename(url) : null;
    if (!url || !filename) return;

    const [itemCount, photoCount, lookCount] = await Promise.all([
      this.items.countDocuments({ imageUrl: url }).exec(),
      this.photos.countDocuments({ imageUrl: url }).exec(),
      this.looks
        .countDocuments({ $or: [{ personImageUrl: url }, { resultImageUrl: url }, { 'items.imageUrl': url }] })
        .exec(),
    ]);
    if (itemCount + photoCount + lookCount > 0) return;

    try {
      if (this.usesImageKit) await this.removeRemote(filename);
      else await unlink(join(UPLOADS_DIRECTORY, filename));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Could not remove unused upload ${url}: ${(error as Error).message}`);
      }
    }
  }
}

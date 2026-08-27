import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ImageKit from 'imagekit';
import { IMAGEKIT_DEFAULT_FOLDER, IMAGEKIT_FETCH_TIMEOUT_MS } from './uploads.constants';

/**
 * Media storage on ImageKit.
 *
 * Files keep the name the application gives them (`useUniqueFileName: false`) inside one
 * flat folder, so the `/uploads/<filename>` value held in the database maps to exactly one
 * remote object and back. Nothing else in the app needs to know where the bytes live.
 *
 * Credentials are read through ConfigService rather than at import time, so a `.env` file
 * loaded by ConfigModule is seen the same way an environment variable would be.
 */
@Injectable()
export class ImageKitService {
  private readonly logger = new Logger(ImageKitService.name);
  private client: ImageKit | null = null;

  constructor(private readonly config: ConfigService) {}

  private setting(key: string): string {
    return this.config.get<string>(key)?.trim() ?? '';
  }

  /** All three credentials present. Without them the app stores media on local disk. */
  isConfigured(): boolean {
    return Boolean(this.setting('IMAGEKIT_PUBLIC_KEY') && this.setting('IMAGEKIT_PRIVATE_KEY') && this.endpoint);
  }

  /** URL endpoint without its trailing slash, e.g. https://ik.imagekit.io/wearit. */
  get endpoint(): string {
    return this.setting('IMAGEKIT_URL_ENDPOINT').replace(/\/+$/, '');
  }

  /** Folder holding every upload, without surrounding slashes. */
  get folder(): string {
    return (this.setting('IMAGEKIT_FOLDER') || IMAGEKIT_DEFAULT_FOLDER).replace(/^\/+|\/+$/g, '');
  }

  /** Public URL of a stored file. */
  fileUrl(filename: string): string {
    return `${this.endpoint}/${this.folder}/${filename}`;
  }

  private get sdk(): ImageKit {
    if (!this.client) {
      this.client = new ImageKit({
        publicKey: this.setting('IMAGEKIT_PUBLIC_KEY'),
        privateKey: this.setting('IMAGEKIT_PRIVATE_KEY'),
        urlEndpoint: this.endpoint,
      });
    }
    return this.client;
  }

  /** Stores the bytes under exactly `filename`, returning the id a later delete needs. */
  async upload(buffer: Buffer, filename: string): Promise<{ url: string; fileId: string }> {
    const result = await this.sdk.upload({
      file: buffer,
      fileName: filename,
      folder: this.folder,
      // The application already names files with a random UUID. A suffix added here would
      // break the filename the database stores.
      useUniqueFileName: false,
      overwriteFile: true,
    });
    return { url: result.url ?? this.fileUrl(filename), fileId: result.fileId };
  }

  /** Deletes by id — exact, and free of the media search index's lag. */
  async removeById(fileId: string): Promise<void> {
    await this.sdk.deleteFile(fileId);
  }

  /** Reads a stored file back, for the pipeline that feeds images to the image model. */
  async download(filename: string): Promise<Buffer> {
    const response = await fetch(this.fileUrl(filename), {
      signal: AbortSignal.timeout(IMAGEKIT_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`ImageKit responded ${response.status} for ${filename}`);
    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Removes a file whose id was never recorded — anything copied across by the migration
   * script. The name lookup goes through the media search index, which only catches up some
   * time after an upload; that is fine for these, since they are old by definition.
   */
  async removeByName(filename: string): Promise<void> {
    const [file] = await this.sdk.listFiles({ path: this.folder, name: filename, limit: 1 });
    // listFiles can also return folders, which carry no fileId.
    if (!file || !('fileId' in file)) {
      this.logger.warn(`No ImageKit file named ${filename} to delete`);
      return;
    }
    await this.sdk.deleteFile(file.fileId);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError } from '../common/errors/app-error';
import { lookup as dnsLookup, LookupOptions } from 'dns';
import { isIP } from 'net';
import { request as httpRequest, IncomingMessage } from 'http';
import { request as httpsRequest } from 'https';
import sharp from 'sharp';
import { isBlockedAddress } from '../common/utils/private-address';
import {
  IMPORT_ALLOWED_PORTS,
  IMPORT_ERRORS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_PIXELS,
  IMPORT_MAX_REDIRECTS,
  IMPORT_TIMEOUT_MS,
  UPLOAD_MIME_EXTENSIONS,
} from './uploads.constants';
import { StorageService } from './storage.service';

type LookupCallback = (error: NodeJS.ErrnoException | null, address?: unknown, family?: number) => void;

/** Formats sharp can hand back that we are willing to store, mapped to their mimetype. */
const STORABLE_FORMATS: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * Downloads an image a member linked to and stores it as a normal Wear It upload.
 *
 * The stored value is always an /uploads/... path, so nothing downstream — the wardrobe,
 * the look pipeline, the image model — ever fetches a member-supplied address. The download
 * itself is the only place that touches the network, and it refuses every destination that
 * is not a public host: private ranges, loopback, link-local (including cloud metadata),
 * non-standard ports, credentials in the URL and redirects onto any of those.
 */
@Injectable()
export class RemoteImageService {
  private readonly logger = new Logger(RemoteImageService.name);

  /**
   * One import in flight per member. The endpoint makes the server issue outbound
   * requests, so it must not be usable as a parallel probing channel. Per-process, like
   * the look generation guard; a multi-instance deployment still wants a shared limiter.
   */
  private readonly importing = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Loopback is only ever allowed so the end-to-end suite can import from its own test
   * server. Every other private range stays blocked even when this is on.
   */
  private get allowLoopback(): boolean {
    return this.config.get<string>('IMAGE_IMPORT_ALLOW_LOOPBACK') === 'true';
  }

  async importFromUrl(rawUrl: string, memberId = 'anonymous'): Promise<{ url: string }> {
    if (this.importing.has(memberId)) {
      throw AppError.tooManyRequests('IMPORT_IN_PROGRESS', 'An image is already being imported. Wait for it to finish.');
    }
    this.importing.add(memberId);
    try {
      return await this.runImport(rawUrl);
    } finally {
      this.importing.delete(memberId);
    }
  }

  private async runImport(rawUrl: string): Promise<{ url: string }> {
    const downloaded = await this.download(this.parse(rawUrl), IMPORT_MAX_REDIRECTS);
    const { buffer, extension } = await this.normalise(downloaded);

    return this.storage.save(buffer, extension);
  }

  private parse(rawUrl: string): URL {
    let url: URL;
    try {
      url = new URL(rawUrl.trim());
    } catch {
      throw AppError.badRequest('IMPORT_PROTOCOL', IMPORT_ERRORS.protocol);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw AppError.badRequest('IMPORT_PROTOCOL', IMPORT_ERRORS.protocol);
    }
    if (url.username || url.password) throw AppError.badRequest('IMPORT_CREDENTIALS', IMPORT_ERRORS.credentials);

    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    // The loopback escape hatch also lifts the port rule, because a local test server
    // never listens on 80 or 443.
    if (!IMPORT_ALLOWED_PORTS.has(port) && !this.allowLoopback) {
      throw AppError.badRequest('IMPORT_PORT', IMPORT_ERRORS.port);
    }
    // A literal IP host never goes through DNS, so the socket would skip the lookup guard
    // below. Judge it here instead. URL.hostname keeps the brackets around an IPv6
    // literal, which would otherwise make it look like an ordinary name.
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) && isBlockedAddress(host, this.allowLoopback)) {
      throw AppError.badRequest('IMPORT_BLOCKED_HOST', IMPORT_ERRORS.blockedHost);
    }
    return url;
  }

  private async download(url: URL, redirectsLeft: number): Promise<Buffer> {
    const response = await this.send(url);
    const status = response.statusCode ?? 0;
    const location = response.headers.location;

    if (status >= 300 && status < 400 && location) {
      response.resume();
      if (redirectsLeft <= 0) throw AppError.badRequest('IMPORT_UNREACHABLE', IMPORT_ERRORS.unreachable);
      // Redirect targets are re-validated from scratch: a public host must not be able to
      // bounce the request onto an internal one.
      return this.download(this.parse(new URL(location, url).toString()), redirectsLeft - 1);
    }

    if (status !== 200) {
      response.resume();
      throw status === 404
        ? AppError.badRequest('IMPORT_NOT_FOUND', IMPORT_ERRORS.notFound)
        : AppError.badRequest('IMPORT_UNREACHABLE', IMPORT_ERRORS.unreachable);
    }

    const declared = Number(response.headers['content-length'] ?? 0);
    if (declared > IMPORT_MAX_BYTES) {
      response.destroy();
      throw AppError.badRequest('IMPORT_TOO_LARGE', IMPORT_ERRORS.tooLarge);
    }

    return this.collect(response);
  }

  private send(url: URL): Promise<IncomingMessage> {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const allowLoopback = this.allowLoopback;

    return new Promise<IncomingMessage>((resolve, reject) => {
      const request = send(
        url,
        {
          method: 'GET',
          headers: { accept: 'image/*', 'user-agent': 'WearIt/2.0 (image import)' },
          // Validation happens at connect time on the address actually resolved, so a
          // hostname cannot pass a check and then resolve somewhere else.
          lookup: (hostname, options, callback) =>
            RemoteImageService.safeLookup(hostname, options, callback as LookupCallback, allowLoopback),
        },
        resolve,
      );

      request.setTimeout(IMPORT_TIMEOUT_MS, () => {
        request.destroy(new Error('timeout'));
      });
      request.on('error', (error: NodeJS.ErrnoException) =>
        reject(
          error.code === 'EBLOCKEDHOST'
            ? AppError.badRequest('IMPORT_BLOCKED_HOST', IMPORT_ERRORS.blockedHost)
            : AppError.badRequest('IMPORT_UNREACHABLE', IMPORT_ERRORS.unreachable),
        ),
      );
      request.end();
    });
  }

  private static safeLookup(
    hostname: string,
    options: LookupOptions,
    callback: LookupCallback,
    allowLoopback: boolean,
  ) {
    const blocked = () => {
      const error: NodeJS.ErrnoException = new Error(IMPORT_ERRORS.blockedHost);
      error.code = 'EBLOCKEDHOST';
      return error;
    };

    dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error);
      const usable = addresses.filter((entry) => !isBlockedAddress(entry.address, allowLoopback));
      if (!usable.length) return callback(blocked());
      if (options.all) return callback(null, usable);
      return callback(null, usable[0].address, usable[0].family);
    });
  }

  private collect(response: IncomingMessage): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;

      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > IMPORT_MAX_BYTES) {
          response.destroy();
          reject(AppError.badRequest('IMPORT_TOO_LARGE', IMPORT_ERRORS.tooLarge));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', () => reject(AppError.badRequest('IMPORT_UNREACHABLE', IMPORT_ERRORS.unreachable)));
    });
  }

  /**
   * Re-encodes the download rather than trusting it. Whatever the server claimed the
   * content-type was, only a real raster image in one of our three formats survives.
   */
  private async normalise(raw: Buffer): Promise<{ buffer: Buffer; extension: string }> {
    try {
      const image = sharp(raw, { limitInputPixels: IMPORT_MAX_PIXELS }).rotate();
      const format = (await image.metadata()).format ?? '';
      const mimetype = STORABLE_FORMATS[format];

      if (mimetype === 'image/jpeg') return { buffer: await image.jpeg().toBuffer(), extension: '.jpg' };
      if (mimetype === 'image/webp') return { buffer: await image.webp().toBuffer(), extension: '.webp' };
      if (mimetype === 'image/png') return { buffer: await image.png().toBuffer(), extension: '.png' };

      throw AppError.badRequest('IMPORT_NOT_AN_IMAGE', IMPORT_ERRORS.notAnImage);
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      this.logger.debug(`Rejected imported image: ${error instanceof Error ? error.message : String(error)}`);
      throw AppError.badRequest('IMPORT_NOT_AN_IMAGE', IMPORT_ERRORS.notAnImage);
    }
  }
}

/** Exported for the unit tests; keeps the extension map beside the mimetypes it mirrors. */
export const IMPORT_STORABLE_FORMATS = STORABLE_FORMATS;
export const IMPORT_EXTENSIONS = UPLOAD_MIME_EXTENSIONS;

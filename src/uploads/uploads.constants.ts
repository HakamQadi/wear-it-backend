import { isAbsolute, join } from 'path';

/**
 * Where uploaded and generated media is stored. Override with UPLOADS_DIR so a test or
 * throwaway instance keeps its own files: isolating only the database is not enough,
 * because two instances sharing this directory can delete each other's media.
 */
export const UPLOADS_DIRECTORY = (() => {
  const configured = process.env.UPLOADS_DIR?.trim();
  if (!configured) return join(process.cwd(), 'uploads');
  return isAbsolute(configured) ? configured : join(process.cwd(), configured);
})();

/**
 * ImageKit takes over when IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY and
 * IMAGEKIT_URL_ENDPOINT are all set; the folder can be overridden with IMAGEKIT_FOLDER.
 * The values themselves are read through ConfigService, not here, so a .env file loaded
 * by ConfigModule is honoured.
 */
export const IMAGEKIT_DEFAULT_FOLDER = 'wear-it';
export const IMAGEKIT_FETCH_TIMEOUT_MS = 15_000;

export const UPLOAD_FIELD = 'file';
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** Extension is derived from the sniffed mimetype, never from the client filename. */
export const UPLOAD_MIME_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

export const UPLOAD_ACCEPTED_MIME_TYPES = Object.keys(UPLOAD_MIME_EXTENSIONS);
export const UPLOAD_ERROR = 'A PNG, JPG, JPEG or WEBP image up to 10 MB is required';

/** Importing an image from a link. */
export const IMPORT_MAX_BYTES = UPLOAD_MAX_BYTES;
export const IMPORT_TIMEOUT_MS = 10_000;
export const IMPORT_MAX_REDIRECTS = 3;
export const IMPORT_MAX_URL_LENGTH = 2048;
/** Only the standard web ports, so a link cannot reach an service on an odd port. */
export const IMPORT_ALLOWED_PORTS = new Set([80, 443]);
export const IMPORT_MAX_PIXELS = 40_000_000;

export const IMPORT_ERRORS = {
  protocol: 'The link must start with http:// or https://',
  credentials: 'The link must not contain a username or password',
  port: 'The link must use the standard http or https port',
  blockedHost: 'That link points at a private or internal address, so it cannot be imported',
  unreachable: 'The image could not be downloaded from that link',
  notFound: 'The link did not return an image (check that it opens directly in a browser)',
  tooLarge: 'That image is larger than 10 MB',
  notAnImage: 'That link is not a PNG, JPG or WEBP image',
} as const;

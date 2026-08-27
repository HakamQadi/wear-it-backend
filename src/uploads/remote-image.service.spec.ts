import { HttpStatus } from '@nestjs/common';
import { expectAppError } from '../common/errors/expect-app-error';
import { ConfigService } from '@nestjs/config';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import sharp from 'sharp';
import { IMPORT_ERRORS } from './uploads.constants';
import { RemoteImageService } from './remote-image.service';
import { StorageService } from './storage.service';

/** Where the bytes end up is StorageService's business; this suite only checks what it is handed. */
const mockSave = jest.fn(async (_buffer: Buffer, extension: string) => ({
  url: `/uploads/00000000-0000-4000-8000-000000000000${extension}`,
}));
const storage = () => ({ save: mockSave }) as unknown as StorageService;

/** Loopback is allowed so the service can reach this suite's own test server. */
const service = (allowLoopback = true) =>
  new RemoteImageService(
    new ConfigService({ IMAGE_IMPORT_ALLOW_LOOPBACK: allowLoopback ? 'true' : 'false' }),
    storage(),
  );

describe('RemoteImageService', () => {
  let server: Server;
  let origin: string;
  let png: Buffer;
  let jpeg: Buffer;

  beforeAll(async () => {
    png = await sharp({ create: { width: 40, height: 60, channels: 3, background: '#8ea18f' } }).png().toBuffer();
    jpeg = await sharp({ create: { width: 40, height: 60, channels: 3, background: '#8ea18f' } }).jpeg().toBuffer();

    server = createServer((request, response) => {
      const path = request.url || '/';
      if (path === '/tee.png') {
        response.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length });
        return response.end(png);
      }
      if (path === '/tee.jpg') {
        response.writeHead(200, { 'content-type': 'image/jpeg' });
        return response.end(jpeg);
      }
      // Claims to be an image but is not one.
      if (path === '/liar') {
        response.writeHead(200, { 'content-type': 'image/png' });
        return response.end('<html>definitely not an image</html>');
      }
      if (path === '/huge') {
        response.writeHead(200, { 'content-type': 'image/png', 'content-length': String(64 * 1024 * 1024) });
        return response.end(png);
      }
      if (path === '/redirect') {
        response.writeHead(302, { location: '/tee.png' });
        return response.end();
      }
      if (path === '/redirect-to-metadata') {
        response.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
        return response.end();
      }
      if (path === '/loop') {
        response.writeHead(302, { location: '/loop' });
        return response.end();
      }
      response.writeHead(404);
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  beforeEach(() => jest.clearAllMocks());

  it('stores a linked PNG as a normal upload', async () => {
    const result = await service().importFromUrl(`${origin}/tee.png`);

    expect(result.url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
    expect(mockSave).toHaveBeenCalledTimes(1);
    const written = mockSave.mock.calls[0][0];
    expect((await sharp(written).metadata()).format).toBe('png');
  });

  it('keeps a linked JPEG as a JPEG', async () => {
    const result = await service().importFromUrl(`${origin}/tee.jpg`);
    expect(result.url).toMatch(/\.jpg$/);
  });

  it('follows a redirect to the real image', async () => {
    const result = await service().importFromUrl(`${origin}/redirect`);
    expect(result.url).toMatch(/\.png$/);
  });

  it('refuses a redirect that points at an internal address', async () => {
    await expect(service().importFromUrl(`${origin}/redirect-to-metadata`)).rejects.toThrow(IMPORT_ERRORS.blockedHost);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('gives up on a redirect loop', async () => {
    await expectAppError(service().importFromUrl(`${origin}/loop`), HttpStatus.BAD_REQUEST, 'IMPORT_UNREACHABLE');
  });

  it('refuses a response that is not really an image', async () => {
    await expect(service().importFromUrl(`${origin}/liar`)).rejects.toThrow(IMPORT_ERRORS.notAnImage);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('refuses an image that declares itself larger than the limit', async () => {
    await expect(service().importFromUrl(`${origin}/huge`)).rejects.toThrow(IMPORT_ERRORS.tooLarge);
  });

  it('reports a link that does not resolve to an image', async () => {
    await expect(service().importFromUrl(`${origin}/missing.png`)).rejects.toThrow(IMPORT_ERRORS.notFound);
  });

  it.each([
    ['file:///etc/passwd', IMPORT_ERRORS.protocol],
    ['ftp://example.com/tee.png', IMPORT_ERRORS.protocol],
    ['not a url at all', IMPORT_ERRORS.protocol],
    ['https://user:secret@example.com/tee.png', IMPORT_ERRORS.credentials],
  ])('refuses %s before opening a connection', async (url, message) => {
    await expect(service().importFromUrl(url)).rejects.toThrow(message);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/tee.png',
    'http://192.168.1.1/tee.png',
    'http://[fd00::1]/tee.png',
    'http://172.16.0.1/tee.png',
  ])('refuses the internal address %s even when loopback is permitted', async (url) => {
    await expect(service().importFromUrl(url)).rejects.toThrow(IMPORT_ERRORS.blockedHost);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('allows only one import at a time per member', async () => {
    const subject = service();
    const first = subject.importFromUrl(`${origin}/tee.png`, 'member-a');
    await expect(subject.importFromUrl(`${origin}/tee.png`, 'member-a')).rejects.toThrow(/already being imported/);
    // A different member is unaffected.
    await expect(subject.importFromUrl(`${origin}/tee.png`, 'member-b')).resolves.toBeDefined();
    await expect(first).resolves.toBeDefined();
  });

  it('refuses loopback and non-standard ports with the default configuration', async () => {
    // The test server listens on a random high port, so the port rule is what rejects it
    // first; loopback blocking is covered by the hostname test below.
    await expectAppError(service(false).importFromUrl(`${origin}/tee.png`), HttpStatus.BAD_REQUEST, 'IMPORT_PORT');
    await expectAppError(
      service(false).importFromUrl('http://example.com:8080/tee.png'),
      HttpStatus.BAD_REQUEST,
      'IMPORT_PORT',
    );
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('refuses a bracketed IPv6 loopback literal when loopback is not permitted', async () => {
    await expect(service(false).importFromUrl('http://[::1]/tee.png')).rejects.toThrow(IMPORT_ERRORS.blockedHost);
  });

  it('refuses a hostname that resolves to a blocked address', async () => {
    // localhost resolves to 127.0.0.1 / ::1, both blocked without the escape hatch.
    await expectAppError(service(false).importFromUrl('http://localhost/tee.png'), HttpStatus.BAD_REQUEST, 'IMPORT_BLOCKED_HOST');
  });
});

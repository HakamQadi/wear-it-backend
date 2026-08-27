import { ConfigService } from '@nestjs/config';
import { ImageKitService } from './imagekit.service';

jest.mock('imagekit', () => {
  const upload = jest.fn();
  const listFiles = jest.fn();
  const deleteFile = jest.fn();
  return {
    __esModule: true,
    __mocks: { upload, listFiles, deleteFile },
    default: jest.fn().mockImplementation(() => ({ upload, listFiles, deleteFile })),
  };
});

const { __mocks: sdk } = jest.requireMock('imagekit') as {
  __mocks: { upload: jest.Mock; listFiles: jest.Mock; deleteFile: jest.Mock };
};

const credentials = {
  IMAGEKIT_PUBLIC_KEY: 'public',
  IMAGEKIT_PRIVATE_KEY: 'private',
  // The trailing slash is deliberate: endpoints are copied out of the dashboard with one.
  IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/wearit/',
};

const service = (settings: Record<string, string> = credentials) => new ImageKitService(new ConfigService(settings));

describe('ImageKitService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is only configured once all three credentials are present', () => {
    expect(service().isConfigured()).toBe(true);
    expect(service({}).isConfigured()).toBe(false);
    expect(service({ ...credentials, IMAGEKIT_PRIVATE_KEY: '  ' }).isConfigured()).toBe(false);
  });

  it('builds file URLs from the endpoint and folder, whatever the slashes', () => {
    expect(service().fileUrl('abc.png')).toBe('https://ik.imagekit.io/wearit/wear-it/abc.png');
    expect(service({ ...credentials, IMAGEKIT_FOLDER: '/looks/' }).fileUrl('abc.png')).toBe(
      'https://ik.imagekit.io/wearit/looks/abc.png',
    );
  });

  it('uploads under the exact filename, so the stored path keeps resolving', async () => {
    sdk.upload.mockResolvedValue({ url: 'https://ik.imagekit.io/wearit/wear-it/abc.png', fileId: 'file-1' });
    const png = Buffer.from('bytes');

    const uploaded = await service().upload(png, 'abc.png');

    expect(sdk.upload).toHaveBeenCalledWith({
      file: png,
      fileName: 'abc.png',
      folder: 'wear-it',
      useUniqueFileName: false,
      overwriteFile: true,
    });
    expect(uploaded).toEqual({ url: 'https://ik.imagekit.io/wearit/wear-it/abc.png', fileId: 'file-1' });
  });

  it('deletes straight by id, without consulting the search index', async () => {
    await service().removeById('file-1');

    expect(sdk.deleteFile).toHaveBeenCalledWith('file-1');
    expect(sdk.listFiles).not.toHaveBeenCalled();
  });

  it('falls back to a name lookup for files with no recorded id', async () => {
    sdk.listFiles.mockResolvedValue([{ fileId: 'file-9', name: 'migrated.png' }]);

    await service().removeByName('migrated.png');

    expect(sdk.listFiles).toHaveBeenCalledWith({ path: 'wear-it', name: 'migrated.png', limit: 1 });
    expect(sdk.deleteFile).toHaveBeenCalledWith('file-9');
  });

  it('does not try to delete a file that is no longer there', async () => {
    sdk.listFiles.mockResolvedValue([]);

    await service().removeByName('gone.png');

    expect(sdk.deleteFile).not.toHaveBeenCalled();
  });

  it('downloads a stored file from its public URL', async () => {
    const bytes = Buffer.from('image');
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(service().download('abc.png')).resolves.toEqual(bytes);
    expect(fetchMock.mock.calls[0][0]).toBe('https://ik.imagekit.io/wearit/wear-it/abc.png');
  });

  it('fails loudly when a download does not come back', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;

    await expect(service().download('abc.png')).rejects.toThrow('404');
  });
});

import { Model } from 'mongoose';
import { ImageKitService } from './imagekit.service';
import { MediaAsset } from './media-asset.schema';
import { StorageService, UPLOADS_DIRECTORY } from './storage.service';

jest.mock('fs/promises', () => {
  const readFile = jest.fn();
  const writeFile = jest.fn();
  const unlink = jest.fn();
  return {
    __esModule: true,
    __mocks: { readFile, writeFile, unlink },
    mkdir: jest.fn().mockResolvedValue(undefined),
    readFile,
    writeFile,
    unlink,
  };
});

const { __mocks: fs } = jest.requireMock('fs/promises') as {
  __mocks: { readFile: jest.Mock; writeFile: jest.Mock; unlink: jest.Mock };
};

/** Every collection reports the same reference count, which is all releaseIfUnused reads. */
const models = <T>(references: number) =>
  ({ countDocuments: () => ({ exec: async () => references }) }) as unknown as Model<T>;

const imagekit = (configured: boolean) =>
  ({
    isConfigured: () => configured,
    upload: jest.fn().mockResolvedValue({ url: 'https://ik.imagekit.io/wearit/wear-it/x.png', fileId: 'file-1' }),
    download: jest.fn().mockResolvedValue(Buffer.from('remote')),
    removeById: jest.fn().mockResolvedValue(undefined),
    removeByName: jest.fn().mockResolvedValue(undefined),
    fileUrl: (filename: string) => `https://ik.imagekit.io/wearit/wear-it/${filename}`,
  }) as unknown as ImageKitService & {
    upload: jest.Mock;
    download: jest.Mock;
    removeById: jest.Mock;
    removeByName: jest.Mock;
  };

/** Records the file id an upload returned, and hands it back when a delete looks it up. */
const assetStore = (recorded: { fileId: string } | null) => {
  const updateOne = jest.fn(() => ({ exec: async () => undefined }));
  const findOne = jest.fn(() => ({ lean: () => ({ exec: async () => recorded }) }));
  const deleteOne = jest.fn(() => ({ exec: async () => undefined }));
  return { updateOne, findOne, deleteOne };
};

let assets = assetStore(null);

const storage = (driver: ReturnType<typeof imagekit>, references = 0) =>
  new StorageService(
    models(references),
    models(references),
    models(references),
    assets as unknown as Model<MediaAsset>,
    driver,
  );

describe('StorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    assets = assetStore(null);
  });

  it('reads a filename out of an upload path and refuses anything else', () => {
    expect(StorageService.resolveFilename('/uploads/abc.png')).toBe('abc.png');
    expect(StorageService.resolveFilename('https://attacker.test/ssrf.png')).toBeNull();
    expect(StorageService.resolveFilename('/uploads/.env')).toBeNull();
  });

  describe('on local disk', () => {
    const driver = imagekit(false);

    it('writes the bytes and returns an upload path', async () => {
      const saved = await storage(driver).save(Buffer.from('bytes'), '.png');

      expect(saved.url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(UPLOADS_DIRECTORY),
        Buffer.from('bytes'),
      );
      expect(driver.upload).not.toHaveBeenCalled();
    });

    it('reads from disk and has no public URL to redirect to', async () => {
      fs.readFile.mockResolvedValue(Buffer.from('local'));

      await expect(storage(driver).read('/uploads/abc.png')).resolves.toEqual(Buffer.from('local'));
      expect(storage(driver).publicUrl('/uploads/abc.png')).toBeNull();
    });

    it('deletes the file once nothing references it', async () => {
      await storage(driver, 0).releaseIfUnused('/uploads/abc.png');
      expect(fs.unlink).toHaveBeenCalledTimes(1);

      await storage(driver, 2).releaseIfUnused('/uploads/abc.png');
      expect(fs.unlink).toHaveBeenCalledTimes(1);
    });
  });

  describe('on ImageKit', () => {
    const driver = imagekit(true);

    it('uploads under the generated name and returns the same upload path', async () => {
      const saved = await storage(driver).save(Buffer.from('bytes'), '.png', 'look-');

      expect(saved.url).toMatch(/^\/uploads\/look-[0-9a-f-]{36}\.png$/);
      expect(driver.upload).toHaveBeenCalledWith(Buffer.from('bytes'), saved.url.replace('/uploads/', ''));
      expect(fs.writeFile).not.toHaveBeenCalled();
      // The id is recorded straight away; the media search index is far too slow to rely on.
      expect(assets.updateOne).toHaveBeenCalledWith(
        { filename: saved.url.replace('/uploads/', '') },
        { $set: { fileId: 'file-1' } },
        { upsert: true },
      );
    });

    it('reads from the CDN and exposes the public URL', async () => {
      await expect(storage(driver).read('/uploads/abc.png')).resolves.toEqual(Buffer.from('remote'));
      expect(fs.readFile).not.toHaveBeenCalled();
      expect(storage(driver).publicUrl('/uploads/abc.png')).toBe('https://ik.imagekit.io/wearit/wear-it/abc.png');
    });

    it('deletes by the recorded id once nothing references it', async () => {
      assets = assetStore({ fileId: 'file-7' });

      await storage(driver, 0).releaseIfUnused('/uploads/abc.png');
      expect(driver.removeById).toHaveBeenCalledWith('file-7');
      expect(driver.removeByName).not.toHaveBeenCalled();

      await storage(driver, 1).releaseIfUnused('/uploads/abc.png');
      expect(driver.removeById).toHaveBeenCalledTimes(1);
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('falls back to the filename for media copied over by the migration', async () => {
      await storage(driver, 0).releaseIfUnused('/uploads/migrated.png');

      expect(driver.removeByName).toHaveBeenCalledWith('migrated.png');
    });

    it('never fails the caller when the remote delete does, and keeps the id to retry with', async () => {
      assets = assetStore({ fileId: 'file-7' });
      driver.removeById.mockRejectedValueOnce(new Error('ImageKit is down'));

      await expect(storage(driver, 0).releaseIfUnused('/uploads/abc.png')).resolves.toBeUndefined();
      expect(assets.deleteOne).not.toHaveBeenCalled();
    });
  });
});

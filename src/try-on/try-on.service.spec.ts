import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { TryOnService } from './try-on.service';

jest.mock('openai', () => {
  const imagesEdit = jest.fn();
  return {
    __esModule: true,
    __mockImagesEdit: imagesEdit,
    default: jest.fn().mockImplementation(() => ({ images: { edit: imagesEdit } })),
    APIError: class MockApiError extends Error {},
    toFile: jest.fn(async (buffer: Buffer, name: string) => ({ buffer, name })),
  };
});

jest.mock('fs/promises', () => {
  const readFile = jest.fn();
  const writeFile = jest.fn();
  return {
    __esModule: true,
    __mockReadFile: readFile,
    __mockWriteFile: writeFile,
    mkdir: jest.fn().mockResolvedValue(undefined),
    readFile,
    writeFile,
    unlink: jest.fn().mockResolvedValue(undefined),
  };
});

const { __mockImagesEdit: mockImagesEdit } = jest.requireMock('openai') as { __mockImagesEdit: jest.Mock };
const { __mockReadFile: mockReadFile, __mockWriteFile: mockWriteFile } = jest.requireMock('fs/promises') as {
  __mockReadFile: jest.Mock;
  __mockWriteFile: jest.Mock;
};

const configured = () => new ConfigService({ OPENAI_API_KEY: 'test-api-key', OPENAI_IMAGE_MODEL: 'gpt-image-2' });

describe('TryOnService', () => {
  let png: Buffer;

  beforeAll(async () => {
    png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#8ea18f' } }).png().toBuffer();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFile.mockResolvedValue(png);
  });

  it('sends the person photo followed by every garment, in the given order', async () => {
    mockImagesEdit.mockResolvedValue({ data: [{ b64_json: Buffer.from('generated').toString('base64') }] });
    const service = new TryOnService(configured());

    const result = await service.composeLook({
      personImageUrl: '/uploads/me.png',
      garments: [
        { label: 'T-shirt', imageUrl: '/uploads/tee.png' },
        { label: 'Pants', imageUrl: '/uploads/pants.png' },
        { label: 'Jacket', imageUrl: '/uploads/jacket.png' },
      ],
      extraDirection: 'Keep my pose and background.',
    });

    const call = mockImagesEdit.mock.calls[0][0];
    expect(call.image.map((file: { name: string }) => file.name)).toEqual([
      'person.png',
      'garment-1.png',
      'garment-2.png',
      'garment-3.png',
    ]);
    expect(call.prompt).toContain("Image 2 is the person's own T-shirt.");
    expect(call.prompt).toContain("Image 3 is the person's own Pants.");
    expect(call.prompt).toContain("Image 4 is the person's own Jacket.");
    expect(call.prompt).toContain('all 3 garments listed above at the same time');
    expect(call.prompt).toContain('Keep my pose and background.');
    expect(mockWriteFile).toHaveBeenCalledWith(expect.stringMatching(/look-[\w-]+\.png$/), Buffer.from('generated'));
    expect(result.imageUrl).toMatch(/^\/uploads\/look-[\w-]+\.png$/);
  });

  it('names a single garment without pluralising the instruction', async () => {
    mockImagesEdit.mockResolvedValue({ data: [{ b64_json: Buffer.from('x').toString('base64') }] });
    const service = new TryOnService(configured());

    await service.composeLook({ personImageUrl: '/uploads/me.png', garments: [{ label: 'Dress', imageUrl: '/uploads/d.png' }] });

    expect(mockImagesEdit.mock.calls[0][0].prompt).toContain('Dress the person in the garment listed above.');
  });

  it('refuses image sources that are not internal uploads', async () => {
    const service = new TryOnService(configured());
    await expect(
      service.composeLook({
        personImageUrl: 'https://attacker.test/ssrf.png',
        garments: [{ label: 'T-shirt', imageUrl: '/uploads/tee.png' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockImagesEdit).not.toHaveBeenCalled();
  });

  it('reports a clear error when the API key is missing', async () => {
    const service = new TryOnService(new ConfigService({}));
    await expect(
      service.composeLook({ personImageUrl: '/uploads/me.png', garments: [{ label: 'T-shirt', imageUrl: '/uploads/t.png' }] }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(service.isConfigured()).toBe(false);
  });
});

import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { ProductsService } from '../products/products.service';
import { TRY_ON_BASE_PROMPT } from './try-on.constants';
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
  const writeFile = jest.fn();
  return {
    ...jest.requireActual<typeof import('fs/promises')>('fs/promises'),
    __mockWriteFile: writeFile,
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile,
  };
});

const { __mockImagesEdit: mockImagesEdit } = jest.requireMock('openai') as { __mockImagesEdit: jest.Mock };
const { __mockWriteFile: mockWriteFile } = jest.requireMock('fs/promises') as { __mockWriteFile: jest.Mock };

const referenceSvg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <rect width="256" height="256" fill="#8ea18f" />
  </svg>
`);

describe('TryOnService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue(new Response(referenceSvg, {
      status: 200,
      headers: { 'content-type': 'image/svg+xml' },
    }));
  });

  it('sends the person, garment, and customer prompt to the image editor', async () => {
    mockImagesEdit.mockResolvedValue({
      data: [{ b64_json: Buffer.from('generated-image').toString('base64') }],
    });
    const productsService = {
      findBySlug: jest.fn().mockResolvedValue({
        tryOnOverlayUrl: 'https://example.test/garment.svg',
        images: [],
      }),
    } as unknown as ProductsService;
    const service = new TryOnService(
      new ConfigService({ OPENAI_API_KEY: 'test-api-key', OPENAI_IMAGE_MODEL: 'gpt-image-2' }),
      productsService,
    );
    const personImage: Express.Multer.File = {
      fieldname: 'personImage',
      originalname: 'person.png',
      encoding: '7bit',
      mimetype: 'image/png',
      size: referenceSvg.length,
      destination: '',
      filename: '',
      path: '',
      buffer: referenceSvg,
      stream: Readable.from(referenceSvg),
    };

    const result = await service.generate(personImage, {
      productSlug: 'sage-cropped-hoodie',
      prompt: 'Keep the same background and use a relaxed fit.',
    });

    expect(productsService.findBySlug).toHaveBeenCalledWith('sage-cropped-hoodie');
    expect(mockImagesEdit).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-image-2',
      image: expect.arrayContaining([
        expect.objectContaining({ name: 'person.png' }),
        expect.objectContaining({ name: 'garment.png' }),
      ]),
      prompt: expect.stringContaining(TRY_ON_BASE_PROMPT),
    }));
    expect(mockImagesEdit.mock.calls[0][0].prompt).toContain('Keep the same background and use a relaxed fit.');
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringMatching(/try-on-[\w-]+\.png$/),
      Buffer.from('generated-image'),
    );
    expect(result.imageUrl).toMatch(/^\/uploads\/try-on-[\w-]+\.png$/);
  });
});

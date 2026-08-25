import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import OpenAI, { APIError, toFile } from 'openai';
import { basename, join } from 'path';
import sharp from 'sharp';
import { ProductsService } from '../products/products.service';
import {
  TRY_ON_BASE_PROMPT,
  TRY_ON_DEFAULT_MODEL,
  TRY_ON_ERRORS,
  TRY_ON_MAX_REFERENCE_BYTES,
  TRY_ON_OUTPUT_FORMAT,
  TRY_ON_OUTPUT_QUALITY,
  TRY_ON_OUTPUT_SIZE,
  TRY_ON_REFERENCE_TIMEOUT_MS,
} from './try-on.constants';
import { GenerateTryOnDto, GenerateTryOnResponseDto } from './try-on.dto';

@Injectable()
export class TryOnService {
  private readonly logger = new Logger(TryOnService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly productsService: ProductsService,
  ) {}

  async generate(personImage: Express.Multer.File, dto: GenerateTryOnDto): Promise<GenerateTryOnResponseDto> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) throw new ServiceUnavailableException(TRY_ON_ERRORS.apiKeyMissing);

    const product = await this.productsService.findBySlug(dto.productSlug);
    const garmentSource = product.tryOnOverlayUrl || product.images[0];
    if (!garmentSource) throw new BadRequestException(TRY_ON_ERRORS.garmentMissing);

    try {
      const [personBuffer, garmentBuffer] = await Promise.all([
        this.normalizeImage(personImage.buffer, 1536, 2048),
        this.loadGarmentImage(garmentSource),
      ]);
      const client = new OpenAI({ apiKey });
      const prompt = dto.prompt?.trim()
        ? `${TRY_ON_BASE_PROMPT}\n\nAdditional customer direction: ${dto.prompt.trim()}`
        : TRY_ON_BASE_PROMPT;
      const response = await client.images.edit({
        model: this.config.get<string>('OPENAI_IMAGE_MODEL', TRY_ON_DEFAULT_MODEL),
        image: [
          await toFile(personBuffer, 'person.png', { type: 'image/png' }),
          await toFile(garmentBuffer, 'garment.png', { type: 'image/png' }),
        ],
        prompt,
        quality: TRY_ON_OUTPUT_QUALITY,
        output_format: TRY_ON_OUTPUT_FORMAT,
        size: TRY_ON_OUTPUT_SIZE,
      });
      const generatedBase64 = response.data?.[0]?.b64_json;
      if (!generatedBase64) throw new BadGatewayException(TRY_ON_ERRORS.generationFailed);

      const uploadsDirectory = join(process.cwd(), 'uploads');
      const filename = `try-on-${randomUUID()}.${TRY_ON_OUTPUT_FORMAT}`;
      await mkdir(uploadsDirectory, { recursive: true });
      await writeFile(join(uploadsDirectory, filename), Buffer.from(generatedBase64, 'base64'));
      return { imageUrl: `/uploads/${filename}` };
    } catch (error: unknown) {
      if (error instanceof BadRequestException || error instanceof BadGatewayException) throw error;
      if (error instanceof APIError) {
        this.logger.error(`OpenAI image edit failed (${error.status}): ${error.message}`);
        if (error.status === 401 || error.status === 403) {
          throw new ServiceUnavailableException('The AI image service credentials are invalid or do not have image-model access.');
        }
        throw new BadGatewayException(error.message || TRY_ON_ERRORS.generationFailed);
      }
      const message = error instanceof Error ? error.message : TRY_ON_ERRORS.generationFailed;
      this.logger.error(`AI try-on failed: ${message}`);
      throw new BadGatewayException(TRY_ON_ERRORS.generationFailed);
    }
  }

  private async loadGarmentImage(source: string): Promise<Buffer> {
    let rawImage: Buffer;
    if (source.startsWith('/uploads/')) {
      rawImage = await readFile(join(process.cwd(), 'uploads', basename(source)));
    } else if (source.startsWith('/')) {
      rawImage = await this.fetchFromFrontendOrigins(source);
    } else {
      rawImage = await this.fetchImage(source);
    }
    return this.normalizeImage(rawImage, 1536, 1536);
  }

  private async fetchFromFrontendOrigins(path: string): Promise<Buffer> {
    const origins = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    for (const origin of origins) {
      try {
        return await this.fetchImage(new URL(path, origin).toString());
      } catch {
        continue;
      }
    }
    throw new BadRequestException(TRY_ON_ERRORS.invalidGarmentSource);
  }

  private async fetchImage(source: string): Promise<Buffer> {
    const url = new URL(source);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new BadRequestException(TRY_ON_ERRORS.invalidGarmentSource);
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(TRY_ON_REFERENCE_TIMEOUT_MS) });
    if (!response.ok) throw new BadRequestException(TRY_ON_ERRORS.invalidGarmentSource);
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > TRY_ON_MAX_REFERENCE_BYTES) {
      throw new BadRequestException(TRY_ON_ERRORS.invalidGarmentSource);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > TRY_ON_MAX_REFERENCE_BYTES) {
      throw new BadRequestException(TRY_ON_ERRORS.invalidGarmentSource);
    }
    return buffer;
  }

  private normalizeImage(image: Buffer, width: number, height: number): Promise<Buffer> {
    return sharp(image, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width, height, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
  }
}

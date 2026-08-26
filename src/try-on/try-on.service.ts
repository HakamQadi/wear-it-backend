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
import { join } from 'path';
import sharp from 'sharp';
import { StorageService, UPLOADS_DIRECTORY } from '../uploads/storage.service';
import {
  buildTryOnPrompt,
  TRY_ON_DEFAULT_MODEL,
  TRY_ON_ERRORS,
  TRY_ON_MAX_SOURCE_BYTES,
  TRY_ON_OUTPUT_FORMAT,
  TRY_ON_OUTPUT_QUALITY,
  TRY_ON_OUTPUT_SIZE,
} from './try-on.constants';

export interface TryOnGarment {
  /** Clothing type name, e.g. "T-shirt". Used verbatim in the prompt. */
  label: string;
  imageUrl: string;
}

export interface ComposeLookInput {
  personImageUrl: string;
  garments: TryOnGarment[];
  extraDirection?: string;
}

@Injectable()
export class TryOnService {
  private readonly logger = new Logger(TryOnService.name);

  constructor(private readonly config: ConfigService) {}

  /** True when the backend has credentials to reach the image model. */
  isConfigured(): boolean {
    return Boolean(this.config.get<string>('OPENAI_API_KEY')?.trim());
  }

  async composeLook(input: ComposeLookInput): Promise<{ imageUrl: string }> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) throw new ServiceUnavailableException(TRY_ON_ERRORS.apiKeyMissing);

    const [personBuffer, ...garmentBuffers] = await Promise.all([
      this.loadImage(input.personImageUrl, 1024, 1536),
      ...input.garments.map((garment) => this.loadImage(garment.imageUrl, 1024, 1024)),
    ]);

    const prompt = buildTryOnPrompt(
      input.garments.map((garment) => garment.label),
      input.extraDirection,
    );

    try {
      const client = new OpenAI({ apiKey });
      const response = await client.images.edit({
        model: this.config.get<string>('OPENAI_IMAGE_MODEL', TRY_ON_DEFAULT_MODEL),
        image: [
          await toFile(personBuffer, 'person.png', { type: 'image/png' }),
          ...(await Promise.all(
            garmentBuffers.map((buffer, index) => toFile(buffer, `garment-${index + 1}.png`, { type: 'image/png' })),
          )),
        ],
        prompt,
        quality: TRY_ON_OUTPUT_QUALITY,
        output_format: TRY_ON_OUTPUT_FORMAT,
        size: TRY_ON_OUTPUT_SIZE,
      });

      const generatedBase64 = response.data?.[0]?.b64_json;
      if (!generatedBase64) throw new BadGatewayException(TRY_ON_ERRORS.generationFailed);

      const filename = `look-${randomUUID()}.${TRY_ON_OUTPUT_FORMAT}`;
      await mkdir(UPLOADS_DIRECTORY, { recursive: true });
      await writeFile(join(UPLOADS_DIRECTORY, filename), Buffer.from(generatedBase64, 'base64'));
      return { imageUrl: `/uploads/${filename}` };
    } catch (error: unknown) {
      throw this.asHttpError(error);
    }
  }

  private async loadImage(url: string, width: number, height: number): Promise<Buffer> {
    const path = StorageService.resolveLocalPath(url);
    if (!path) throw new BadRequestException(TRY_ON_ERRORS.invalidSource);

    let raw: Buffer;
    try {
      raw = await readFile(path);
    } catch {
      throw new BadRequestException(TRY_ON_ERRORS.invalidSource);
    }
    if (raw.length > TRY_ON_MAX_SOURCE_BYTES) throw new BadRequestException(TRY_ON_ERRORS.invalidSource);

    try {
      return await sharp(raw, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width, height, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch {
      throw new BadRequestException(TRY_ON_ERRORS.invalidSource);
    }
  }

  private asHttpError(error: unknown): Error {
    if (error instanceof BadGatewayException || error instanceof BadRequestException) return error;
    if (error instanceof APIError) {
      this.logger.error(`OpenAI image edit failed (${error.status}): ${error.message}`);
      if (error.status === 401 || error.status === 403) {
        return new ServiceUnavailableException(TRY_ON_ERRORS.credentials);
      }
      return new BadGatewayException(error.message || TRY_ON_ERRORS.generationFailed);
    }
    this.logger.error(`AI look generation failed: ${error instanceof Error ? error.message : String(error)}`);
    return new BadGatewayException(TRY_ON_ERRORS.generationFailed);
  }
}

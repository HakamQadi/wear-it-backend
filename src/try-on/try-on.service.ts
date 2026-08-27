import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError } from '../common/errors/app-error';
import OpenAI, { APIError, toFile } from 'openai';
import sharp from 'sharp';
import { StorageService } from '../uploads/storage.service';
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

  constructor(
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  /** True when the backend has credentials to reach the image model. */
  isConfigured(): boolean {
    return Boolean(this.config.get<string>('OPENAI_API_KEY')?.trim());
  }

  async composeLook(input: ComposeLookInput): Promise<{ imageUrl: string }> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) throw AppError.serviceUnavailable('AI_NOT_CONFIGURED', TRY_ON_ERRORS.apiKeyMissing);

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
      if (!generatedBase64) throw AppError.badGateway('AI_FAILED', TRY_ON_ERRORS.generationFailed);

      const stored = await this.storage.save(
        Buffer.from(generatedBase64, 'base64'),
        `.${TRY_ON_OUTPUT_FORMAT}`,
        'look-',
      );
      return { imageUrl: stored.url };
    } catch (error: unknown) {
      throw this.asHttpError(error);
    }
  }

  private async loadImage(url: string, width: number, height: number): Promise<Buffer> {
    if (!StorageService.resolveFilename(url)) throw AppError.badRequest('AI_INVALID_SOURCE', TRY_ON_ERRORS.invalidSource);

    let raw: Buffer;
    try {
      raw = await this.storage.read(url);
    } catch {
      throw AppError.badRequest('AI_INVALID_SOURCE', TRY_ON_ERRORS.invalidSource);
    }
    if (raw.length > TRY_ON_MAX_SOURCE_BYTES) throw AppError.badRequest('AI_INVALID_SOURCE', TRY_ON_ERRORS.invalidSource);

    try {
      return await sharp(raw, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width, height, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch {
      throw AppError.badRequest('AI_INVALID_SOURCE', TRY_ON_ERRORS.invalidSource);
    }
  }

  private asHttpError(error: unknown): Error {
    // A coded error already carries the right status and message; pass it through
    // rather than flattening it into a generic failure.
    if (error instanceof AppError) return error;
    if (error instanceof APIError) {
      this.logger.error(`OpenAI image edit failed (${error.status}): ${error.message}`);
      if (error.status === 401 || error.status === 403) {
        return AppError.serviceUnavailable('AI_CREDENTIALS', TRY_ON_ERRORS.credentials);
      }
      return AppError.badGateway('AI_FAILED', error.message || TRY_ON_ERRORS.generationFailed);
    }
    this.logger.error(`AI look generation failed: ${error instanceof Error ? error.message : String(error)}`);
    return AppError.badGateway('AI_FAILED', TRY_ON_ERRORS.generationFailed);
  }
}

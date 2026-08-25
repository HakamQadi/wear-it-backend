export const TRY_ON_PERSON_IMAGE_FIELD = 'personImage';
export const TRY_ON_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const TRY_ON_MAX_REFERENCE_BYTES = 15 * 1024 * 1024;
export const TRY_ON_REFERENCE_TIMEOUT_MS = 15_000;
export const TRY_ON_DEFAULT_MODEL = 'gpt-image-2';
export const TRY_ON_OUTPUT_QUALITY = 'medium' as const;
export const TRY_ON_OUTPUT_FORMAT = 'png' as const;
export const TRY_ON_OUTPUT_SIZE = '1024x1536' as const;
export const TRY_ON_ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export const TRY_ON_BASE_PROMPT = `Create a photorealistic virtual try-on image.
Image 1 is the person and must remain the primary composition.
Image 2 is the garment reference. Dress the person in that exact garment, preserving its color, cut, neckline, sleeves, texture, logos, and distinctive details.
Preserve the person's identity, face, hair, skin tone, body shape, pose, hands, background, camera angle, and lighting.
Fit the garment naturally to the person's torso with realistic folds, shadows, occlusion, and fabric behavior.
Remove the person's original upper-body garment only where the reference garment replaces it.
Return one polished fashion photograph. Do not add extra people, text, labels, borders, watermarks, or duplicate body parts.`;

export const TRY_ON_ERRORS = {
  invalidPersonImage: 'A PNG, JPG, JPEG or WEBP person image is required',
  garmentMissing: 'This product does not have an AI try-on garment reference',
  invalidGarmentSource: 'The garment reference could not be loaded',
  apiKeyMissing: 'AI try-on is not configured. Add OPENAI_API_KEY to the backend environment.',
  generationFailed: 'The AI try-on image could not be generated. Please try again.',
} as const;

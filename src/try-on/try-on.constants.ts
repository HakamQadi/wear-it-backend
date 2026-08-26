export const TRY_ON_MIN_ITEMS = 1;
/** The image edit endpoint accepts up to 16 images; one slot is the person photo. */
export const TRY_ON_MAX_ITEMS = 8;

export const TRY_ON_MAX_SOURCE_BYTES = 15 * 1024 * 1024;
export const TRY_ON_DEFAULT_MODEL = 'gpt-image-2';
export const TRY_ON_OUTPUT_QUALITY = 'medium' as const;
export const TRY_ON_OUTPUT_FORMAT = 'png' as const;
export const TRY_ON_OUTPUT_SIZE = '1024x1536' as const;
export const TRY_ON_MAX_DIRECTION_LENGTH = 600;

export const TRY_ON_ERRORS = {
  apiKeyMissing: 'AI look generation is not configured. Add OPENAI_API_KEY to the backend environment.',
  invalidSource: 'One of the selected images could not be read. Re-upload it and try again.',
  generationFailed: 'The look could not be generated. Please try again.',
  credentials: 'The AI image service credentials are invalid or do not have image-model access.',
} as const;

/**
 * Builds the instruction for a multi-garment look. Garment labels come from the
 * admin-managed clothing types, so new categories need no prompt changes.
 */
export function buildTryOnPrompt(garmentLabels: string[], extraDirection?: string): string {
  const garmentLines = garmentLabels
    .map((label, index) => `Image ${index + 2} is the person's own ${label}.`)
    .join('\n');

  const prompt = [
    'Create one photorealistic virtual try-on photograph.',
    'Image 1 is the person and stays the subject of the final image.',
    garmentLines,
    garmentLabels.length === 1
      ? 'Dress the person in the garment listed above.'
      : `Dress the person in all ${garmentLabels.length} garments listed above at the same time, layered in the natural order they would be worn.`,
    'Reproduce each garment exactly: colour, cut, neckline, sleeves, length, texture, pattern, prints, logos and hardware.',
    "Preserve the person's identity, face, hair, skin tone, body shape, pose, hands, background, camera angle and lighting.",
    'Replace the original clothing only where a listed garment covers it, and leave every uncovered area untouched.',
    'Fit each garment naturally with realistic folds, shadows, occlusion and fabric behaviour.',
    'Return exactly one polished full-length fashion photograph. Do not add extra people, text, labels, borders, watermarks, collages or duplicate limbs.',
  ].join('\n');

  const direction = extraDirection?.trim();
  return direction ? `${prompt}\n\nAdditional direction from the person: ${direction}` : prompt;
}

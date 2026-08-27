import { IsString, MaxLength, MinLength } from 'class-validator';
import { IMPORT_MAX_URL_LENGTH } from './uploads.constants';

export class ImportImageDto {
  /**
   * Deliberately typed as a plain string rather than @IsUrl: RemoteImageService does the
   * real parsing and network-level validation, and a single source of truth avoids two
   * slightly different notions of what counts as an acceptable link.
   */
  @IsString() @MinLength(8) @MaxLength(IMPORT_MAX_URL_LENGTH) url!: string;
}

import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { MEDIA_URL_MESSAGE, MEDIA_URL_PATTERN } from '../common/utils/media';

export class CreateUserPhotoDto {
  @Matches(MEDIA_URL_PATTERN, { message: MEDIA_URL_MESSAGE }) imageUrl!: string;
  @IsOptional() @IsString() @MaxLength(80) label?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateUserPhotoDto {
  @IsOptional() @IsString() @MaxLength(80) label?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

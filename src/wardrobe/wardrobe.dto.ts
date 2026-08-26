import { IsBoolean, IsMongoId, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MEDIA_URL_MESSAGE, MEDIA_URL_PATTERN } from '../common/utils/media';

export class CreateWardrobeItemDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsMongoId() typeId!: string;
  @Matches(MEDIA_URL_PATTERN, { message: MEDIA_URL_MESSAGE }) imageUrl!: string;
  @IsOptional() @IsString() @MaxLength(40) color?: string;
  @IsOptional() @IsString() @MaxLength(60) brand?: string;
  @IsOptional() @IsString() @MaxLength(400) notes?: string;
}

export class UpdateWardrobeItemDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @IsMongoId() typeId?: string;
  @IsOptional() @Matches(MEDIA_URL_PATTERN, { message: MEDIA_URL_MESSAGE }) imageUrl?: string;
  @IsOptional() @IsString() @MaxLength(40) color?: string;
  @IsOptional() @IsString() @MaxLength(60) brand?: string;
  @IsOptional() @IsString() @MaxLength(400) notes?: string;
  @IsOptional() @IsBoolean() isArchived?: boolean;
}

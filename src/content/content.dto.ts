import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class LocalisedTextDto {
  @IsOptional() @IsString() @MaxLength(400) ar?: string;
  @IsOptional() @IsString() @MaxLength(400) en?: string;
}

/**
 * Every field is a pair of languages. Nested objects only validate when both
 * @ValidateNested and @Type are present — without them the global whitelist strips the
 * inner values and forbidNonWhitelisted rejects the request.
 */
export class UpdateContentDto {
  @IsOptional() @ValidateNested() @Type(() => LocalisedTextDto) brandName?: LocalisedTextDto;
  @IsOptional() @ValidateNested() @Type(() => LocalisedTextDto) heroTitle?: LocalisedTextDto;
  @IsOptional() @ValidateNested() @Type(() => LocalisedTextDto) heroSubtitle?: LocalisedTextDto;
  @IsOptional() @ValidateNested() @Type(() => LocalisedTextDto) heroCta?: LocalisedTextDto;
  @IsOptional() @ValidateNested() @Type(() => LocalisedTextDto) announcement?: LocalisedTextDto;
  @IsOptional() @ValidateNested() @Type(() => LocalisedTextDto) footerText?: LocalisedTextDto;
}

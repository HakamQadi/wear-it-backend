import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateContentDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) brandName?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) heroTitle?: string;
  @IsOptional() @IsString() @MaxLength(400) heroSubtitle?: string;
  @IsOptional() @IsString() @MaxLength(60) heroCta?: string;
  @IsOptional() @IsString() @MaxLength(160) announcement?: string;
  @IsOptional() @IsString() @MaxLength(300) footerText?: string;
}

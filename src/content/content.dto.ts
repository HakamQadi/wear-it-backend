import { IsOptional, IsString, MinLength } from 'class-validator';
export class UpdateContentDto {
  @IsOptional() @IsString() @MinLength(2) heroTitle?: string;
  @IsOptional() @IsString() heroSubtitle?: string;
  @IsOptional() @IsString() heroCta?: string;
  @IsOptional() @IsString() announcement?: string;
  @IsOptional() @IsString() brandName?: string;
  @IsOptional() @IsString() footerText?: string;
}

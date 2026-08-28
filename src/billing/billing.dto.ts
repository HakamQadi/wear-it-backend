import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsMongoId, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CheckoutPlanDto { @IsMongoId() planId!: string; }

export class UpdatePlanDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) nameAr?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(500) descriptionAr?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(140, { each: true }) features?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(140, { each: true }) featuresAr?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000_000) priceCents?: number;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000) monthlyImageLimit?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000) sortOrder?: number;
}

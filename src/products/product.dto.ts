import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsMongoId, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export class CreateProductDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @Matches(/^[a-z0-9-]+$/) slug!: string;
  @IsString() @MinLength(10) description!: string;
  @IsMongoId() categoryId!: string;
  @Type(() => Number) @IsNumber() @Min(0) price!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) compareAtPrice?: number;
  @IsArray() @IsString({ each: true }) images!: string[];
  @IsOptional() @IsString() tryOnOverlayUrl?: string;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) sizes!: string[];
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) colors!: string[];
  @Type(() => Number) @IsNumber() @Min(0) stock!: number;
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

export class UpdateProductDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]+$/) slug?: string;
  @IsOptional() @IsString() @MinLength(10) description?: string;
  @IsOptional() @IsMongoId() categoryId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) price?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) compareAtPrice?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) images?: string[];
  @IsOptional() @IsString() tryOnOverlayUrl?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsString({ each: true }) sizes?: string[];
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsString({ each: true }) colors?: string[];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) stock?: number;
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

export class CreateClothingTypeDto {
  @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @IsString() @Matches(/^[a-z0-9-]+$/, { message: 'slug must contain only lowercase letters, numbers and dashes' }) @MaxLength(60) slug!: string;
  @IsOptional() @IsString() @MaxLength(400) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateClothingTypeDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]+$/, { message: 'slug must contain only lowercase letters, numbers and dashes' }) @MaxLength(60) slug?: string;
  @IsOptional() @IsString() @MaxLength(400) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

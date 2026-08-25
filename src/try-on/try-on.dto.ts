import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class GenerateTryOnDto {
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  productSlug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  prompt?: string;
}

export interface GenerateTryOnResponseDto {
  imageUrl: string;
}

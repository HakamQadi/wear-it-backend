import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class UpdatePlanDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() descriptionAr?: string;
  @IsOptional() @IsInt() @Min(0) priceCents?: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsInt() @Min(1) generationLimit?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) features?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) featuresAr?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

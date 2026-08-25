import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEmail, IsIn, IsInt, IsMongoId, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';

class CreateOrderItemDto {
  @IsMongoId() productId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsString() size!: string;
  @IsString() color!: string;
}

export class CreateOrderDto {
  @IsString() @MinLength(2) customerName!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(6) phone!: string;
  @IsString() @MinLength(5) address!: string;
  @IsString() @MinLength(2) city!: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CreateOrderItemDto) items!: CreateOrderItemDto[];
}

export class UpdateOrderStatusDto {
  @IsIn(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']) status!: string;
}

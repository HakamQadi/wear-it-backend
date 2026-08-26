import { ArrayMaxSize, ArrayMinSize, IsArray, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { TRY_ON_MAX_DIRECTION_LENGTH, TRY_ON_MAX_ITEMS, TRY_ON_MIN_ITEMS } from '../try-on/try-on.constants';

export class GenerateLookDto {
  /** One wardrobe item per clothing type, e.g. a T-shirt plus pants plus a jacket. */
  @IsArray()
  @ArrayMinSize(TRY_ON_MIN_ITEMS, { message: `Pick at least ${TRY_ON_MIN_ITEMS} wardrobe item` })
  @ArrayMaxSize(TRY_ON_MAX_ITEMS, { message: `A look can hold at most ${TRY_ON_MAX_ITEMS} wardrobe items` })
  @IsMongoId({ each: true })
  itemIds!: string[];

  /** A photo the member already saved. New uploads are saved to the library first. */
  @IsMongoId()
  photoId!: string;

  @IsOptional() @IsString() @MaxLength(TRY_ON_MAX_DIRECTION_LENGTH) prompt?: string;
}

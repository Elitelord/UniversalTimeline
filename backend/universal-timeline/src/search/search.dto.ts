import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SearchQueryDto {
  /** Free text. Parsed by websearch_to_tsquery, so quotes, OR and -exclusion all work. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  q: string;

  /** ISO timestamp. Defaults to SEARCH_DEFAULT_LOOKBACK_DAYS ago when omitted. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** ISO timestamp. Defaults to now when omitted. */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** Comma-separated activity types, matching the /timeline convention. */
  @IsOptional()
  @IsString()
  activity_type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}

import { 
  IsString, 
  IsUUID, 
  IsDateString, 
  IsOptional, 
  IsObject, 
  IsNotEmpty, 
  MaxLength
} from 'class-validator';

export class CreateEventDto {
  @IsUUID()
  @IsNotEmpty()
  id: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  user_id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  device_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  activity_type: string;

  // Intentionally lenient: the Windows client sends the raw window title here, which
  // can be empty (untitled window) or longer than 255 chars (a verbose browser tab
  // title). The DB column is unbounded varchar, and ParseArrayPipe rejects the WHOLE
  // batch if any one item fails validation — so a single long title used to strand
  // every queued event behind repeated 400s. EventsService sanitizes the value
  // (defaults empties, caps length) instead of rejecting it.
  @IsOptional()
  @IsString()
  activity_name?: string;

  @IsDateString()
  @IsNotEmpty()
  start_time: string;

  @IsOptional()
  @IsDateString()
  end_time?: string;
  
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
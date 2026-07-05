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

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  activity_name: string;

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
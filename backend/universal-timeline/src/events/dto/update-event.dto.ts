import { PartialType } from '@nestjs/mapped-types';
import { CreateEventDto } from '../event.dto';

export class UpdateEventDto extends PartialType(CreateEventDto) {}

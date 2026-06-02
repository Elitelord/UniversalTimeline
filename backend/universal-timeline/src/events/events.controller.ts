import { Controller, Get, Post, Body, ParseArrayPipe } from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './event.dto';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post('list')
  create(@Body(new ParseArrayPipe({ items: CreateEventDto})) createEventDto: CreateEventDto[]) {
    return this.eventsService.create(createEventDto);
  }

  @Post()
  createOne(@Body() createEventDto: CreateEventDto) {
    return this.eventsService.create(createEventDto);
  }

  @Get()
  findAll() {
    return this.eventsService.findAll();
  }
}

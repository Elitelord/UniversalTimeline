import { Controller, Get, Post, Body, ParseArrayPipe, UseGuards, Req } from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './event.dto';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';

@Controller('events')
@UseGuards(SupabaseAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post('list')
  create(@Body(new ParseArrayPipe({ items: CreateEventDto})) createEventDto: CreateEventDto[], @Req() req) {
    // Override user_id from JWT — don't trust client-provided user_id
    createEventDto.forEach(e => e.user_id = req.user_id);
    return this.eventsService.create(createEventDto);
  }

  @Post()
  createOne(@Body() createEventDto: CreateEventDto, @Req() req) {
    createEventDto.user_id = req.user_id;
    return this.eventsService.create(createEventDto);
  }

  @Get()
  findAll() {
    return this.eventsService.findAll();
  }
}

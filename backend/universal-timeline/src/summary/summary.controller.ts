import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { EventsService } from '../events/events.service';


@Controller('summary')
export class SummaryController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  getSummary(
    @Query('user_id') user_id: string,
    @Query('date', new DefaultValuePipe(new Date().toISOString().split('T')[0])) date: string,
  ) {
    return this.eventsService.getSummary(user_id, date);
  }
}

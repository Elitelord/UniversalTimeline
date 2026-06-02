import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { EventsService } from '../events/events.service';

@Controller('timeline')
export class TimelineController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  getTimeline(
    @Query('user_id') user_id: string,
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('activity_type') activity_type?: string,
  ) {
    return this.eventsService.getTimeline(user_id, start_date, end_date, page, limit, activity_type);
  }
}
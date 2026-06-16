import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe, UseGuards, Req } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';

@Controller('timeline')
@UseGuards(SupabaseAuthGuard)
export class TimelineController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  getTimeline(
    @Req() req,
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('activity_type') activity_type?: string,
  ) {
    // user_id comes from the verified JWT, not from query params
    return this.eventsService.getTimeline(req.user_id, start_date, end_date, page, limit, activity_type);
  }
}

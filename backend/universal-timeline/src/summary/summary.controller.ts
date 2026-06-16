import { Controller, Get, Query, DefaultValuePipe, UseGuards, Req } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';

@Controller('summary')
@UseGuards(SupabaseAuthGuard)
export class SummaryController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  getSummary(
    @Req() req,
    @Query('date', new DefaultValuePipe(new Date().toISOString().split('T')[0])) date: string,
  ) {
    // user_id comes from the verified JWT, not from query params
    return this.eventsService.getSummary(req.user_id, date);
  }
}

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
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
    @Query('compare_start_date') compare_start_date?: string,
    @Query('compare_end_date') compare_end_date?: string,
  ) {
    if (!start_date || !end_date) {
      // fallback to today if not provided
      const today = new Date().toISOString().split('T')[0];
      start_date = start_date || today;
      end_date = end_date || today;
    }
    
    // user_id comes from the verified JWT
    return this.eventsService.getSummary(req.user_id, {
      start_date,
      end_date,
      compare_start_date,
      compare_end_date,
    });
  }
}

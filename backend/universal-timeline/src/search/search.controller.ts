import { Controller, Get, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchQueryDto } from './search.dto';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';

@Controller('search')
@UseGuards(SupabaseAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(
    @Req() req,
    // Scoped pipe, not the global one: main.ts registers a bare ValidationPipe with
    // no `transform`, so query params arrive as strings and @IsInt() would reject
    // limit/offset. Changing the global pipe would affect every existing endpoint.
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: SearchQueryDto,
  ) {
    // user_id comes from the verified JWT, never from query params
    return this.searchService.search(req.user_id, query);
  }
}

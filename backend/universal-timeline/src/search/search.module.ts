import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchBootstrapService } from './search-bootstrap.service';
import { SearchCapabilities } from './search-capabilities.service';

@Module({
  imports: [EventsModule],
  controllers: [SearchController],
  providers: [SearchService, SearchBootstrapService, SearchCapabilities],
  exports: [SearchService, SearchCapabilities],
})
export class SearchModule {}

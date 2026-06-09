import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { SummaryController } from './summary.controller';
@Module({
  imports: [EventsModule],
  controllers: [SummaryController],
})
export class SummaryModule {}

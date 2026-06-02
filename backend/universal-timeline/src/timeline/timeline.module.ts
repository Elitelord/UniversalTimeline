import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { TimelineController } from './timeline.controller';

@Module({
  imports: [EventsModule],
  controllers: [TimelineController],
})
export class TimelineModule {}
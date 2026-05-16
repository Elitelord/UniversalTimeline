import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { Event } from './event.entity'; // Import your entity

@Module({
  // This line registers the Event entity with this specific module
  imports: [TypeOrmModule.forFeature([Event])], 
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
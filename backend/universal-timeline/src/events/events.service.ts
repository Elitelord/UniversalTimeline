import { Injectable } from '@nestjs/common';
import { CreateEventDto } from './event.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './event.entity';


@Injectable()
export class EventsService {
  constructor(    
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
  ) {}
  
  create(createEventDto: CreateEventDto | CreateEventDto[]) {
    if (Array.isArray(createEventDto)) {
      const newEventList: Event[] = [];
      for (const event of createEventDto) {
        const { metadata, ...rest } = event;
        const newEvent = this.eventRepository.create(rest);
        if (metadata) {
          newEvent.metadata = metadata;
        }
        newEventList.push(newEvent);
      }
      return this.eventRepository.save(newEventList);
    }
    return this.eventRepository.save(createEventDto);
  }

  findAll() {
    return this.eventRepository.find();
  }

  getTimeline(user_id: string, start_date: string, end_date: string, page: number, limit: number, activity_type?: string) {
    const query = this.eventRepository
      .createQueryBuilder('event')
      .where('event.user_id = :user_id', { user_id })
      .andWhere('event.start_time >= :start_time', { start_time: start_date })
      .andWhere('event.start_time <= :end_time', { end_time: end_date });

    if (activity_type) {
      query.andWhere('event.activity_type = :activity_type', { activity_type });
    }

    return query
      .orderBy('event.start_time', 'ASC')
      .skip(page * limit)
      .take(limit)
      .getMany();
  }
}

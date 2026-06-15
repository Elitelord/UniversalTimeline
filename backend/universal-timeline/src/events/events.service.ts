import { Injectable } from '@nestjs/common';
import { CreateEventDto } from './event.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Event } from './event.entity';
import { MergeService } from '../processing/merge.service';
import { createHash } from 'crypto';

@Injectable()
export class EventsService {
  constructor(    
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private readonly mergeService: MergeService,
  ) {}
  
  async create(createEventDto: CreateEventDto | CreateEventDto[]) {
    if (Array.isArray(createEventDto)) {
      const newEventList: Event[] = [];
      for (const event of createEventDto) {
        const { metadata, ...rest } = event;
        const newEvent = this.eventRepository.create(rest);
        newEvent.start_time = new Date(event.start_time);
        newEvent.end_time = event.end_time ? new Date(event.end_time) : null;
        if (metadata) {
          newEvent.metadata = metadata;
        }
        newEventList.push(newEvent);
      }
      for(const event of newEventList) {
        event.idempotency_hash = createHash('sha256').update(event.device_id + event.activity_name + event.start_time.toISOString()).digest('hex');
      }
      const existingEvents = await this.eventRepository.find({
        where: {
          idempotency_hash: In(newEventList.map(event => event.idempotency_hash)),
        },
      });
      
      const nonExistingEvents = newEventList.filter(event => !existingEvents.some(existingEvent => existingEvent.idempotency_hash === event.idempotency_hash));
      
      
      const mergedEvents = this.mergeService.mergeEvents(nonExistingEvents);
      return this.eventRepository.save(mergedEvents);
    }
    const { metadata, ...rest } = createEventDto;
    const newEvent = this.eventRepository.create(rest);
    newEvent.start_time = new Date(createEventDto.start_time);
    newEvent.end_time = createEventDto.end_time ? new Date(createEventDto.end_time) : null;
    if (metadata) {
      newEvent.metadata = metadata;
    }
    const newEventList = [newEvent];
    
    newEvent.idempotency_hash = createHash('sha256').update(newEvent.device_id + newEvent.activity_name + newEvent.start_time.toISOString()).digest('hex');
    
    const existingEvents = await this.eventRepository.find({
        where: {
          idempotency_hash: In(newEventList.map(event => event.idempotency_hash)),
        },
    });
      
    const nonExistingEvents = newEventList.filter(event => !existingEvents.some(existingEvent => existingEvent.idempotency_hash === event.idempotency_hash));
    const mergedEvents = this.mergeService.mergeEvents(nonExistingEvents);
    return this.eventRepository.save(mergedEvents);
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
  async getSummary(user_id: string, date:string ) {
    const query = await this.eventRepository
      .createQueryBuilder('event')
      .where('event.user_id = :user_id', { user_id })
      .andWhere('event.start_time >= :date', { date })
      .andWhere("event.start_time < CAST(:date AS date) + INTERVAL '1 day'", { date })
      .andWhere('event.end_time IS NOT NULL')
      .select('event.activity_type')
      .addSelect('SUM(EXTRACT(EPOCH FROM (event.end_time - event.start_time)) / 60)', 'duration')
      .addSelect('COUNT(*)', 'count')
      .groupBy('event.activity_type')
      .orderBy('duration', 'DESC')
      .getRawMany();
    const queryTwo = await this.eventRepository
      .createQueryBuilder('event')
      .where('event.user_id = :user_id', { user_id })
      .andWhere('event.start_time >= :date', { date })
      .andWhere("event.start_time < CAST(:date AS date) + INTERVAL '1 day'", { date })
      .andWhere('event.end_time IS NOT NULL')
      .select('event.activity_name')
      .addSelect('SUM(EXTRACT(EPOCH FROM (event.end_time - event.start_time)) / 60)', 'total_minutes')
      .groupBy('event.activity_name')
      .orderBy('total_minutes', 'DESC')
      .limit(5)
      .getRawMany();
    let totalMinutes = 0;
    for (const act of query) {
      totalMinutes += parseFloat(act.duration);
    }

    const summary = {
      user_id: user_id,
      date: date,
      total_active_time_minutes: totalMinutes,
      activity_breakdown: query.map(act => ({
        activity_type: act.event_activity_type,
        total_minutes: parseFloat(act.duration),
        event_count: parseInt(act.count),
      })),
      top_applications: queryTwo.map(app => ({
        activity_name: app.event_activity_name,
        total_minutes: parseFloat(app.total_minutes),
      })),
    }

    return summary;
  }
}

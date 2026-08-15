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
      
      const uniqueUserIds = [...new Set(nonExistingEvents.map(e => e.user_id))];
      const uniqueDeviceIds = [...new Set(nonExistingEvents.map(e => e.device_id))];
      
      let recentDbEvents: Event[] = [];
      if (uniqueUserIds.length > 0 && uniqueDeviceIds.length > 0) {
        recentDbEvents = await this.eventRepository.find({
          where: { user_id: In(uniqueUserIds), device_id: In(uniqueDeviceIds) },
          order: { start_time: 'DESC' },
          take: 100
        });
      }
      
      const mergedEvents = this.mergeService.mergeEvents([...recentDbEvents, ...nonExistingEvents]);
      
      const toSave = mergedEvents.filter(e => !e.id || (e as any)._isModified);
      return this.eventRepository.save(toSave);
    } else {
      return this.create([createEventDto as CreateEventDto]);
    }
  }

  findAll() {
    return this.eventRepository.find();
  }

  getTimeline(user_id: string, start_date: string, end_date: string, page: number, limit: number, activity_type?: string, search?: string) {
    const query = this.eventRepository
      .createQueryBuilder('event')
      .where('event.user_id = :user_id', { user_id })
      .andWhere('event.start_time >= :start_time', { start_time: start_date })
      .andWhere('event.start_time <= :end_time', { end_time: end_date });

    if (activity_type) {
      const types = activity_type.split(',').map(t => t.trim()).filter(Boolean);
      if (types.length === 1) {
        query.andWhere('event.activity_type = :activity_type', { activity_type: types[0] });
      } else if (types.length > 1) {
        query.andWhere('event.activity_type IN (:...activity_types)', { activity_types: types });
      }
    }

    if (search) {
      query.andWhere('event.activity_name ILIKE :search', { search: `%${search}%` });
    }

    return query
      .orderBy('event.start_time', 'ASC')
      .skip(page * limit)
      .take(limit)
      .getMany();
  }
  async getSummary(
    user_id: string,
    options: {
      start_date: string;
      end_date: string;
      compare_start_date?: string;
      compare_end_date?: string;
    }
  ) {
    const getPeriodData = async (start: string, end: string) => {
      // breakdown query
      const breakdown = await this.eventRepository
        .createQueryBuilder('event')
        .where('event.user_id = :user_id', { user_id })
        .andWhere('event.start_time >= :start', { start })
        .andWhere("event.start_time < CAST(:end AS date) + INTERVAL '1 day'", { end })
        .andWhere('event.end_time IS NOT NULL')
        .select('event.activity_type')
        .addSelect('SUM(EXTRACT(EPOCH FROM (event.end_time - event.start_time)) / 60)', 'duration')
        .addSelect('COUNT(*)', 'count')
        .groupBy('event.activity_type')
        .orderBy('duration', 'DESC')
        .getRawMany();

      // top applications query
      const topApps = await this.eventRepository
        .createQueryBuilder('event')
        .where('event.user_id = :user_id', { user_id })
        .andWhere('event.start_time >= :start', { start })
        .andWhere("event.start_time < CAST(:end AS date) + INTERVAL '1 day'", { end })
        .andWhere('event.end_time IS NOT NULL')
        .select('event.activity_name')
        .addSelect('MAX(event.activity_type)', 'activity_type')
        .addSelect('SUM(EXTRACT(EPOCH FROM (event.end_time - event.start_time)) / 60)', 'total_minutes')
        .groupBy('event.activity_name')
        .orderBy('total_minutes', 'DESC')
        .limit(5)
        .getRawMany();

      // time-series query for line charts
      const timeSeries = await this.eventRepository
        .createQueryBuilder('event')
        .where('event.user_id = :user_id', { user_id })
        .andWhere('event.start_time >= :start', { start })
        .andWhere("event.start_time < CAST(:end AS date) + INTERVAL '1 day'", { end })
        .andWhere('event.end_time IS NOT NULL')
        .select("TO_CHAR(event.start_time, 'YYYY-MM-DD')", 'date')
        .addSelect('event.activity_type', 'activity_type')
        .addSelect('SUM(EXTRACT(EPOCH FROM (event.end_time - event.start_time)) / 60)', 'duration')
        .groupBy("TO_CHAR(event.start_time, 'YYYY-MM-DD')")
        .addGroupBy('event.activity_type')
        .orderBy("TO_CHAR(event.start_time, 'YYYY-MM-DD')", 'ASC')
        .getRawMany();

      let totalMinutes = 0;
      for (const act of breakdown) {
        totalMinutes += parseFloat(act.duration);
      }

      return {
        total_active_time_minutes: totalMinutes,
        activity_breakdown: breakdown.map(act => ({
          activity_type: act.event_activity_type,
          total_minutes: parseFloat(act.duration),
          event_count: parseInt(act.count),
        })),
        top_applications: topApps.map(app => ({
          activity_name: app.event_activity_name,
          activity_type: app.activity_type,
          total_minutes: parseFloat(app.total_minutes),
        })),
        time_series: timeSeries.map(ts => ({
          date: ts.date,
          activity_type: ts.activity_type,
          total_minutes: parseFloat(ts.duration),
        })),
      };
    };

    const current_period = await getPeriodData(options.start_date, options.end_date);
    let comparison_period: any = null;

    if (options.compare_start_date && options.compare_end_date) {
      comparison_period = await getPeriodData(options.compare_start_date, options.compare_end_date);
    }

    return {
      user_id,
      start_date: options.start_date,
      end_date: options.end_date,
      current_period,
      comparison_period,
    };
  }
}

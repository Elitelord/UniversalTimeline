import { Injectable } from '@nestjs/common';
import { CreateEventDto } from './event.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between } from 'typeorm';
import { Event } from './event.entity';
import { MergeService } from '../processing/merge.service';
import { ClassifierService } from '../processing/classifier.service';
import { escapeLikePattern } from '../common/escape-like';
import { createHash } from 'crypto';

/** Runaway guard for a single timeline window; the range is already bounded by dates. */
const TIMELINE_FETCH_CAP = 5000;

/**
 * How far either side of an incoming batch to look for events it might merge into.
 * Only needs to exceed MergeService's 60s gap threshold; 5 minutes gives margin for
 * clock skew between a client and the server without pulling in unrelated history.
 */
const MERGE_CANDIDATE_PADDING_MS = 5 * 60 * 1000;

/** Safety cap on the candidate query — the time window already bounds it. */
const MERGE_CANDIDATE_CAP = 1000;

/**
 * Point-in-time event types. Their "duration" is meaningless (a notification is an
 * instant; idle is the opposite of active time), so they are excluded from the
 * summary's time aggregations — otherwise they inflate "active time" (measured at
 * ~17% of the total, mostly idle). They remain visible and filterable in the timeline.
 */
const SIGNAL_ACTIVITY_TYPES = ['notification', 'screen', 'idle'];

@Injectable()
export class EventsService {
  constructor(    
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private readonly mergeService: MergeService,
    private readonly classifierService: ClassifierService,
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
      // Normalise the type before anything else looks at it: MergeService keys on
      // activity_type, so reclassifying afterwards would change what merges with what.
      // Note the hash below deliberately does not include activity_type, so this
      // cannot affect duplicate detection.
      for (const event of newEventList) {
        this.classifierService.applyTo(event);
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
      
      // Merge candidates must be selected by TIME, not by a fixed row count.
      // A `take: 100` window silently failed whenever a batch was larger than 100
      // events, or when the event a new one should have merged into had already aged
      // out of the 100 most recent rows — measured at 515 unmerged events that met
      // the merge criteria exactly. Scope to the incoming batch's own time range,
      // widened by the merge gap so events on either edge can still join.
      let recentDbEvents: Event[] = [];
      if (nonExistingEvents.length > 0) {
        const times = nonExistingEvents.map(e => e.start_time.getTime());
        const windowStart = new Date(Math.min(...times) - MERGE_CANDIDATE_PADDING_MS);
        const windowEnd = new Date(Math.max(...times) + MERGE_CANDIDATE_PADDING_MS);

        recentDbEvents = await this.eventRepository.find({
          where: {
            user_id: In(uniqueUserIds),
            device_id: In(uniqueDeviceIds),
            start_time: Between(windowStart, windowEnd),
          },
          order: { start_time: 'DESC' },
          take: MERGE_CANDIDATE_CAP,
        });
      }

      const mergedEvents = this.mergeService.mergeEvents([...recentDbEvents, ...nonExistingEvents]);

      // Save every event that isn't an unchanged pre-existing DB row: i.e. all new
      // events (merged or lone) plus any existing row the merge extended.
      //
      // The previous filter was `!e.id || _isModified`, which assumed new events had
      // no id yet — but clients always supply a UUID (CreateEventDto requires it), so
      // `!e.id` was never true and any new event that didn't merge was silently
      // dropped. That regressed ingest on 2026-08-15 (commit dbfc4dc) and cut saved
      // volume by ~65%. Track the pre-existing ids explicitly instead.
      const existingDbIds = new Set(recentDbEvents.map(e => e.id));
      const toSave = mergedEvents.filter(
        e => !existingDbIds.has(e.id) || (e as any)._isModified,
      );
      return this.eventRepository.save(toSave);
    } else {
      return this.create([createEventDto as CreateEventDto]);
    }
  }

  findAll() {
    return this.eventRepository.find();
  }

  async getTimeline(user_id: string, start_date: string, end_date: string, page: number, limit: number, activity_type?: string, search?: string) {
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
      query.andWhere('event.activity_name ILIKE :search ESCAPE \'\\\'', {
        search: `%${escapeLikePattern(search)}%`,
      });
    }

    // Merge must run over the whole bounded window, not a page slice — otherwise a
    // session straddling a page boundary gets split into two half-sessions. The range
    // is always bounded (a day, three days, or a week), so fetching it whole is safe;
    // TIMELINE_FETCH_CAP is just a runaway guard.
    const events = await query
      .orderBy('event.start_time', 'ASC')
      .take(TIMELINE_FETCH_CAP)
      .getMany();

    const merged = this.mergeService.mergeEvents(events);
    return merged.slice(page * limit, page * limit + limit);
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
        .andWhere('event.activity_type NOT IN (:...signalTypes)', { signalTypes: SIGNAL_ACTIVITY_TYPES })
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
        .andWhere('event.activity_type NOT IN (:...signalTypes)', { signalTypes: SIGNAL_ACTIVITY_TYPES })
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
        .andWhere('event.activity_type NOT IN (:...signalTypes)', { signalTypes: SIGNAL_ACTIVITY_TYPES })
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

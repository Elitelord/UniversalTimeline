import { Injectable } from '@nestjs/common';
import { Event } from '../events/event.entity';

@Injectable()
export class MergeService {
    mergeEvents(events:Event[]): Event[] {  
        const mergedEvents: Event[] = [];
        let eventsCopy = events.filter((event): event is Event & { end_time: Date } => event.start_time !== null && event.end_time !== null);
        if (eventsCopy.length <= 1) {
            return eventsCopy;
        }
        eventsCopy.sort((a,b) => a.start_time.getTime() - b.start_time.getTime());
        let currentEvent = {...eventsCopy[0]};
        for (let i = 1; i < eventsCopy.length; i++) {
            let diff =  eventsCopy[i].start_time.getTime() - currentEvent.end_time.getTime();
            if (diff <= 60000 && eventsCopy[i].activity_type === currentEvent.activity_type && eventsCopy[i].activity_name === currentEvent.activity_name) {
                if (eventsCopy[i].end_time.getTime() > currentEvent.end_time.getTime()) {
                    currentEvent.end_time = eventsCopy[i].end_time;
                }
                if (eventsCopy[i].metadata) {
                    currentEvent.metadata = {
                        ...(currentEvent.metadata ?? {}),
                        ...(eventsCopy[i].metadata ?? {}),
                    };
                }
            } else {
                mergedEvents.push(currentEvent);
                currentEvent = eventsCopy[i]; 
            }
        }
        mergedEvents.push(currentEvent);
        return mergedEvents;
    }
}
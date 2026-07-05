import { Injectable } from '@nestjs/common';
import { Event } from '../events/event.entity';

@Injectable()
export class MergeService {
    mergeEvents(events: Event[]): Event[] {  
        const mergedEvents: Event[] = [];
        let eventsCopy = events.filter((event): event is Event & { end_time: Date } => event.start_time !== null && event.end_time !== null);
        
        if (eventsCopy.length <= 1) {
            return eventsCopy;
        }
        
        eventsCopy.sort((a,b) => a.start_time.getTime() - b.start_time.getTime());
        
        // Track the most recent active event for each unique activity signature
        const activeEvents = new Map<string, Event & { end_time: Date }>();
        
        for (const event of eventsCopy) {
            const signature = `${event.activity_type}::${event.activity_name}`;
            const lastActive = activeEvents.get(signature);
            
            if (lastActive) {
                const diff = event.start_time.getTime() - lastActive.end_time.getTime();
                
                // If the gap is small enough (<= 5 minutes = 300,000 ms), merge them!
                if (diff <= 300000) {
                    if (event.end_time.getTime() > lastActive.end_time.getTime()) {
                        lastActive.end_time = event.end_time;
                    }
                    if (event.metadata) {
                        lastActive.metadata = {
                            ...(lastActive.metadata ?? {}),
                            ...(event.metadata ?? {}),
                        };
                    }
                    continue; // Successfully merged, move to next event
                } else {
                    // Gap too large, the old event is complete
                    mergedEvents.push(lastActive);
                }
            }
            
            // Set as the new active event for this signature
            // Make a copy so we don't mutate the original array unexpectedly
            activeEvents.set(signature, { ...event });
        }
        
        // Flush all remaining active events
        for (const event of activeEvents.values()) {
            mergedEvents.push(event);
        }
        
        // Re-sort the final merged list by start_time
        mergedEvents.sort((a, b) => a.start_time.getTime() - b.start_time.getTime());
        
        return mergedEvents;
    }
}
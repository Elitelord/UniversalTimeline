import { Injectable } from '@nestjs/common';
import { Event } from '../events/event.entity';

@Injectable()
export class MergeService {
    mergeEvents(events: Event[]): Event[] {
        const mergedEvents: Event[] = [];

        // Events still in progress (no end_time yet) can't participate in merging —
        // merging is defined by the previous event's end_time. Set them aside and
        // pass them through untouched rather than dropping them, so the timeline can
        // show "currently running" activity.
        const openEvents = events.filter(event => event.start_time !== null && event.end_time === null);
        const eventsCopy = events.filter((event): event is Event & { end_time: Date } => event.start_time !== null && event.end_time !== null);

        if (eventsCopy.length <= 1) {
            return [...eventsCopy, ...openEvents].sort((a, b) => a.start_time.getTime() - b.start_time.getTime());
        }

        eventsCopy.sort((a,b) => a.start_time.getTime() - b.start_time.getTime());
        
        // Track the most recent active event for each unique activity signature
        const activeEvents = new Map<string, Event & { end_time: Date }>();
        
        for (const event of eventsCopy) {
            const signature = `${event.user_id}::${event.device_id}::${event.activity_type}::${event.activity_name}`;
            const lastActive = activeEvents.get(signature);
            
            if (lastActive) {
                const diff = event.start_time.getTime() - lastActive.end_time.getTime();
                
                // If the gap is small enough (<= 60 seconds = 60,000 ms), merge them!
                if (diff <= 60000) {
                    if (event.end_time.getTime() > lastActive.end_time.getTime()) {
                        lastActive.end_time = event.end_time;
                        (lastActive as any)._isModified = true;
                    }
                    if (event.metadata) {
                        lastActive.metadata = {
                            ...(lastActive.metadata ?? {}),
                            ...(event.metadata ?? {}),
                        };
                        (lastActive as any)._isModified = true;
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

        // Fold the in-progress events back in, then re-sort the whole list by start_time
        mergedEvents.push(...openEvents);
        mergedEvents.sort((a, b) => a.start_time.getTime() - b.start_time.getTime());

        return mergedEvents;
    }
}
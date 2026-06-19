# Sync Protocol Design Doc

## Overview
The sync protocol defines how the client-side tracker sends activity events to the backend API. It handles the inherent unreliability of network connections by buffering events locally, batching them efficiently, and ensuring no data is lost or duplicated — even across network failures, retries, and multi-device usage.

---

## Decision 1: Sync Frequency — Every 60 seconds

**Why 60 seconds?**

60 seconds strikes a balance between data freshness and resource efficiency. At a shorter interval like 5 seconds, a single user would generate 720 API calls per hour — multiplied across many users, that's significant server cost and battery drain on mobile/laptop clients. At a longer interval like 5 minutes, a crash or forced quit would lose up to 5 minutes of tracked activity, creating noticeable gaps in the timeline.

At 60 seconds, the worst-case data loss on crash is 1 minute of activity, and the client only makes 60 API calls per hour — a manageable load per user. For an activity tracker where minute-level granularity is sufficient, this is the sweet spot.

---

## Decision 2: Offline Behavior — Queue locally, retry

**What happens when the network is down?**

Events are queued in a local FIFO (first-in, first-out) buffer and retried when connectivity returns. Dropping events is not acceptable because for an activity timeline, gaps mean undercounting a user's total active time — which defeats the entire purpose of the app. A user who coded for 3 hours but had spotty WiFi shouldn't see only 1.5 hours on their dashboard.

The queue acts as a buffer between the data source (the activity tracker) and the unreliable network. Events continue to be captured at the normal rate regardless of network state.

---

## Decision 3: Reconnection — Drain the queue in order (FIFO)

**Why send events in chronological order?**

Our merge algorithm sorts events by `start_time` and merges adjacent same-activity events within a 60-second gap. If batch 2 arrives before batch 1, the server's merge step won't know about batch 1's events yet — so it can't merge events that span across batches. This would result in fragmented events that should have been one continuous session (e.g., a 3-hour coding session split into disconnected 1-minute chunks).

FIFO ordering ensures the server sees events in their natural chronological sequence, allowing the merge algorithm to work correctly across batch boundaries.

---

## Decision 4: Duplicate Handling — Idempotency keys (Phase 3)

**What if the server gets the same batch twice?**

This is already solved by our Phase 3 idempotency implementation. Each event gets a SHA-256 hash of `device_id + activity_name + start_time`. When a batch is sent, the server checks these hashes against existing events in the database before inserting. If a retry sends the same events again, the hashes match and the duplicates are silently skipped.

This is critical for the sync protocol because network timeouts are ambiguous — the client doesn't know if the server received the batch or not. Rather than building complex acknowledgment logic, idempotent inserts let the client safely retry without risk of creating duplicate data.

---

## Decision 5: Maximum Batch Size — 50 events

**Why cap at 50 per batch?**

From the **network** perspective: a 1000-event batch creates a large HTTP payload. If the request fails halfway through a flaky connection, the entire batch is lost and must be retried — wasting the bandwidth already used. With 50-event batches, a failed request is cheap to retry.

From the **server** perspective: larger batches hold database connections longer and increase memory usage during the merge step. Very small batches (say 5 events) would mean 10x more HTTP roundtrips, each with connection overhead (TLS handshake, TCP setup).

50 events is the sweet spot: small enough that a failed request isn't expensive to retry, large enough that you're not spamming the server with excessive roundtrips. At 60-second sync intervals, most batches will be well under 50 events anyway — the cap is a safety valve for burst scenarios.

---

## Decision 6: Queue Size Limit — 10,000 events, drop oldest

**Why cap the queue at all?**

Without a cap, a prolonged offline period (e.g., a laptop left running on airplane mode overnight) could accumulate an unbounded number of events, consuming excessive memory or local storage. 10,000 events at our data size is roughly manageable in memory without impacting application performance.

**Why drop oldest, not newest?**

The newest events represent what the user is doing *right now* — this is the most valuable data for real-time dashboard display and is what the user would notice missing. Old events from 6+ hours ago are less actionable. If a user has been offline for hours and the queue fills up, preserving recent activity gives a more accurate picture of their current workflow.

---

## Retry Strategy — Exponential backoff with jitter

**When a sync request fails, how should the client retry?**

Retrying immediately after a failure is likely to hit the same problem again (server down, network unreachable). Instead, the client uses **exponential backoff**: retry after 1s, then 2s, then 4s, then 8s, doubling each time up to a maximum of 60s.

Critically, each retry delay includes **jitter** — a random offset added to the wait time. This prevents the **thundering herd problem**: if 1000 clients all lose connectivity at the same time (e.g., office WiFi drops), without jitter they'd all retry at the exact same intervals, slamming the server the moment it comes back online. Jitter spreads reconnection attempts across time, allowing the server to recover gracefully.

Formula: `delay = min(maxDelay, baseDelay * 2^attempt) + random(0, jitterRange)`

Example sequence: 1.3s → 2.7s → 4.1s → 8.9s → 16.2s → 32.5s → 60s (capped)

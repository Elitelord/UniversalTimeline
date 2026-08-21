import { Session } from '@supabase/supabase-js';
import { generateDemoTimeline, generateDemoSummary } from './demo-data';
import type { TimelineEvent } from './timeline-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Sentinel error to signal the UI that we fell back to demo data
export class DemoFallbackError extends Error {
  constructor() {
    super('DEMO_FALLBACK');
    this.name = 'DemoFallbackError';
  }
}

function authHeaders(session: Session): HeadersInit {
  return { Authorization: `Bearer ${session.access_token}` };
}

async function fetchWithGracefulError(url: string, options: RequestInit) {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (err) {
    throw new Error("Could not connect to the server. Please check if the backend is running.");
  }

  // Check if response is JSON
  const contentType = res.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");

  if (!res.ok) {
    if (isJson) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Server error: ${res.status}`);
    }
    
    if (res.status === 404) {
      throw new Error("Endpoint not found (404). Please verify the backend is running.");
    }
    throw new Error(`Server returned an unexpected response (${res.status}).`);
  }

  if (!isJson) {
    throw new Error("Server returned an unexpected format (expected JSON). Is the backend running?");
  }

  return res.json();
}

export async function fetchTimeline(
  session: Session,
  startDate: string,
  endDate: string,
  filters?: { activityTypes?: string[]; search?: string },
  signal?: AbortSignal
) {
  const startDateLocal = new Date(`${startDate}T00:00:00`);
  const startISO = startDateLocal.toISOString();
  
  const endDateLocal = new Date(`${endDate}T23:59:59.999`);
  const endISO = endDateLocal.toISOString();

  const params = new URLSearchParams({
    start_date: startISO,
    end_date: endISO,
    limit: '1000',
  });

  if (filters?.activityTypes && filters.activityTypes.length > 0) {
    params.set('activity_type', filters.activityTypes.join(','));
  }
  if (filters?.search) {
    params.set('search', filters.search);
  }

  try {
    return await fetchWithGracefulError(
      `${API_URL}/timeline?${params.toString()}`,
      { headers: authHeaders(session), signal }
    );
  } catch (err) {
    // A caller-initiated abort is not a backend failure — let it propagate so the
    // page can discard the stale response instead of rendering demo data over it.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    // Backend unreachable — return demo data and signal the caller
    const demoEvents = generateDemoTimeline(startDate);
    // Attach a marker so the page component knows this is demo data
    (demoEvents as any).__demo = true;
    return demoEvents;
  }
}


export async function fetchSummary(
  session: Session, 
  startDate: string,
  endDate: string,
  compareStartDate?: string,
  compareEndDate?: string
) {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  });

  if (compareStartDate && compareEndDate) {
    params.set('compare_start_date', compareStartDate);
    params.set('compare_end_date', compareEndDate);
  }

  try {
    return await fetchWithGracefulError(`${API_URL}/summary?${params.toString()}`, {
      headers: authHeaders(session),
    });
  } catch {
    // Backend unreachable — return demo summary
    const demoSummary = generateDemoSummary(startDate);
    (demoSummary as any).__demo = true;
    return demoSummary;
  }
}

export interface SearchResponse {
  results: TimelineEvent[];
  has_more: boolean;
}

/**
 * Cross-date relevance-ranked search.
 *
 * Unlike fetchTimeline/fetchSummary this deliberately does NOT fall back to demo
 * data. There is no sensible demo answer to an arbitrary query — the demo schedule
 * has eight app names, so almost everything would come back empty and read as a
 * broken feature. Errors propagate and the UI shows them.
 */
export async function searchTimeline(
  session: Session,
  query: string,
  opts?: {
    from?: string;
    to?: string;
    activityTypes?: string[];
    limit?: number;
    offset?: number;
    signal?: AbortSignal;
  }
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query });

  if (opts?.from) params.set('from', opts.from);
  if (opts?.to) params.set('to', opts.to);
  if (opts?.activityTypes && opts.activityTypes.length > 0) {
    params.set('activity_type', opts.activityTypes.join(','));
  }
  if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts?.offset !== undefined) params.set('offset', String(opts.offset));

  return fetchWithGracefulError(`${API_URL}/search?${params.toString()}`, {
    headers: authHeaders(session),
    signal: opts?.signal,
  });
}

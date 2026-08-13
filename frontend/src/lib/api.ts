import { Session } from '@supabase/supabase-js';
import { generateDemoTimeline, generateDemoSummary } from './demo-data';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Sentinel error to signal the UI that we fell back to demo data
export class DemoFallbackError extends Error {
  constructor() {
    super('DEMO_FALLBACK');
    this.name = 'DemoFallbackError';
  }
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
  filters?: { activityTypes?: string[]; search?: string }
) {
  const startDateLocal = new Date(`${startDate}T00:00:00`);
  const startISO = startDateLocal.toISOString();
  
  const endDateLocal = new Date(`${endDate}T23:59:59.999`);
  const endISO = endDateLocal.toISOString();

  const params = new URLSearchParams({
    start_date: startISO,
    end_date: endISO,
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
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    );
  } catch {
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
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  } catch {
    // Backend unreachable — return demo summary
    const demoSummary = generateDemoSummary(startDate);
    (demoSummary as any).__demo = true;
    return demoSummary;
  }
}

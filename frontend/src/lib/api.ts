import { Session } from '@supabase/supabase-js';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

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
  const startISO = `${startDate}T00:00:00.000Z`;
  const endISO = `${endDate}T23:59:59.999Z`;

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

  return fetchWithGracefulError(
    `${API_URL}/timeline?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );
}


export async function fetchSummary(session: Session, date: string) {
  return fetchWithGracefulError(`${API_URL}/summary?date=${date}`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}


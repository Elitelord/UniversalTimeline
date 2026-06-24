import { Session } from '@supabase/supabase-js';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function fetchTimeline(
  session: Session,
  startDate: string,
  endDate: string
) {
  const startISO = `${startDate}T00:00:00.000Z`;
  const endISO = `${endDate}T23:59:59.999Z`;

  const res = await fetch(
    `${API_URL}/timeline?start_date=${startISO}&end_date=${endISO}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return res.json();
}

export async function fetchSummary(session: Session, date: string) {
  const res = await fetch(`${API_URL}/summary?date=${date}`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return res.json();
}

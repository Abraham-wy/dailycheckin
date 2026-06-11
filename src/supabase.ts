import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { DailyPlan, CheckinLog } from './types.js';

let client: SupabaseClient | null = null;

export function getSupabaseClient(url: string, serviceKey: string): SupabaseClient {
  if (!client) {
    client = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}

// Get plan for a specific date (the "明日计划" written for that date)
export async function getPlan(
  supabase: SupabaseClient,
  planDate: string
): Promise<DailyPlan | null> {
  const { data, error } = await supabase
    .from('daily_plans')
    .select('*')
    .eq('plan_date', planDate)
    .maybeSingle();

  if (error) throw new Error(`Failed to get plan for ${planDate}: ${error.message}`);
  return data;
}

// Insert or update plan for a specific date
export async function upsertPlan(
  supabase: SupabaseClient,
  planDate: string,
  content: string,
  source: 'manual' | 'carried_forward' = 'manual'
): Promise<DailyPlan> {
  const { data, error } = await supabase
    .from('daily_plans')
    .upsert(
      { plan_date: planDate, content, source, updated_at: new Date().toISOString() },
      { onConflict: 'plan_date' }
    )
    .select()
    .single();

  if (error) throw new Error(`Failed to upsert plan for ${planDate}: ${error.message}`);
  return data;
}

// Get the latest plan on or before a given date (for carry-forward)
export async function getLatestPlan(
  supabase: SupabaseClient,
  beforeDate: string
): Promise<DailyPlan | null> {
  const { data, error } = await supabase
    .from('daily_plans')
    .select('*')
    .lte('plan_date', beforeDate)
    .order('plan_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to get latest plan before ${beforeDate}: ${error.message}`);
  return data;
}

// Check if a successful check-in already exists for a date
export async function getCheckin(
  supabase: SupabaseClient,
  checkinDate: string
): Promise<CheckinLog | null> {
  const { data, error } = await supabase
    .from('checkin_logs')
    .select('*')
    .eq('checkin_date', checkinDate)
    .eq('status', 'success')
    .maybeSingle();

  if (error) throw new Error(`Failed to get checkin for ${checkinDate}: ${error.message}`);
  return data;
}

// Insert a check-in log record
export async function insertCheckin(
  supabase: SupabaseClient,
  log: Omit<CheckinLog, 'id' | 'created_at'>
): Promise<void> {
  const { error } = await supabase.from('checkin_logs').insert(log);
  if (error) throw new Error(`Failed to insert checkin log: ${error.message}`);
}

// Get recent check-in logs for history
export async function getRecentCheckins(
  supabase: SupabaseClient,
  limit = 7
): Promise<CheckinLog[]> {
  const { data, error } = await supabase
    .from('checkin_logs')
    .select('*')
    .order('checkin_date', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to get recent checkins: ${error.message}`);
  return data ?? [];
}

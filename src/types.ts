// Shared types for the daily check-in system

export interface DailyPlan {
  id: string;
  plan_date: string; // YYYY-MM-DD
  content: string;
  source: 'manual' | 'carried_forward';
  created_at: string;
  updated_at: string;
}

export interface CheckinLog {
  id: string;
  checkin_date: string;
  pushups: number | null;
  sleep_time: string | null; // HH:MM
  task_completion: string | null;
  tomorrow_plan: string | null;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  attempt_count: number;
  error_message: string | null;
  error_step: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface ReminderLog {
  id: string;
  reminder_date: string;
  sent_at: string;
  plan_was_set: boolean;
  responded: boolean;
}

export interface CheckinConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
  encryptedCookies: string;
  aesKey: string;
  dryRun: boolean;
}

export interface CheckinResult {
  success: boolean;
  attempts: number;
  error?: string;
  errorStep?: string;
  durationMs: number;
}

export interface WeChatDocCookies {
  [key: string]: string;
}

export interface SheetField {
  id: string;
  name: string;
  type: string;
}

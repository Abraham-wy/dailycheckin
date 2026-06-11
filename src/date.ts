import { format, addDays, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { WeChatDocCookies } from './types.js';

const TIMEZONE = 'Asia/Shanghai';

// Get today's date in CST (YYYY-MM-DD)
export function todayCST(): string {
  return format(toZonedTime(new Date(), TIMEZONE), 'yyyy-MM-dd');
}

// Get tomorrow's date in CST
export function tomorrowCST(): string {
  return format(addDays(toZonedTime(new Date(), TIMEZONE), 1), 'yyyy-MM-dd');
}

// Get yesterday's date in CST
export function yesterdayCST(): string {
  return format(subDays(toZonedTime(new Date(), TIMEZONE), 1), 'yyyy-MM-dd');
}

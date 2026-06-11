import { randomInt } from 'node:crypto';

// Random push-ups count: 0–30
export function randomPushups(): number {
  return randomInt(0, 31); // 0..30 inclusive
}

// Random sleep time between 23:00 and 23:59 CST
export function randomSleepTime(): string {
  const hour = 23;
  const minute = randomInt(0, 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// Random minute in range for cron setup
export function randomCronMinute(min: number, max: number): number {
  return randomInt(min, max + 1);
}

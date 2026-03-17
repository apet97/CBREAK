/**
 * @fileoverview Pure date range functions for date preset calculations.
 */

import type { DatePreset } from './types.js';
import { toDateKey } from './utils.js';

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  this_week: 'This Week',
  last_week: 'Last Week',
  last_2_weeks: 'Last 2 Weeks',
  last_month: 'Last Month',
  this_year: 'This Year',
};

export const ALL_PRESETS: DatePreset[] = [
  'today',
  'this_week',
  'last_week',
  'last_2_weeks',
  'last_month',
  'this_year',
];

export const DEFAULT_PRESET: DatePreset = 'this_week';

export interface DatePresetRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}

/**
 * Returns the start (Monday) and end (Sunday) date range for a given preset.
 */
export function getPresetRange(preset: DatePreset): DatePresetRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'today':
      return { start: toDateKey(today), end: toDateKey(today) };

    case 'this_week': {
      const day = today.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const monday = new Date(today);
      monday.setDate(today.getDate() + mondayOffset);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { start: toDateKey(monday), end: toDateKey(sunday) };
    }

    case 'last_week': {
      const day = today.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const thisMonday = new Date(today);
      thisMonday.setDate(today.getDate() + mondayOffset);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return { start: toDateKey(lastMonday), end: toDateKey(lastSunday) };
    }

    case 'last_2_weeks': {
      const end = new Date(today);
      const start = new Date(today);
      start.setDate(today.getDate() - 13);
      return { start: toDateKey(start), end: toDateKey(end) };
    }

    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0); // last day of prev month
      return { start: toDateKey(start), end: toDateKey(end) };
    }

    case 'this_year': {
      const start = new Date(today.getFullYear(), 0, 1);
      return { start: toDateKey(start), end: toDateKey(today) };
    }

    default:
      return getPresetRange('this_week');
  }
}

/**
 * Generates an array of YYYY-MM-DD date keys for every day in the range (inclusive).
 */
export function getDateKeysInRange(range: DatePresetRange): string[] {
  const keys: string[] = [];
  const current = new Date(range.start + 'T00:00:00');
  const end = new Date(range.end + 'T00:00:00');

  while (current <= end) {
    keys.push(toDateKey(current));
    current.setDate(current.getDate() + 1);
  }

  return keys;
}

/**
 * Counts the number of days in a range (inclusive).
 */
export function countDaysInRange(range: DatePresetRange): number {
  const start = new Date(range.start + 'T00:00:00');
  const end = new Date(range.end + 'T00:00:00');
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

/**
 * @fileoverview Type definitions for Break Compliance addon.
 */

// --- Date presets ---

export type DatePreset = 'today' | 'this_week' | 'last_week' | 'last_2_weeks' | 'last_month' | 'this_year';

// --- Jurisdiction & compliance ---

export type Jurisdiction = 'arbzg' | 'california' | 'custom';
export type ComplianceStatus = 'pass' | 'warn' | 'fail';

/** A time span with start and end timestamps. */
export interface TimeSpan {
  start: Date;
  end: Date;
  durationMinutes: number;
}

/** All entries for a single user on a single day. */
export interface UserDay {
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD
  workEntries: TimeSpan[];
  breakEntries: TimeSpan[];
  totalWorkMinutes: number;
  totalBreakMinutes: number;
}

/** Result of a single compliance rule evaluation. */
export interface RuleResult {
  ruleId: string;
  ruleName: string;
  status: ComplianceStatus;
  detail: string;
  requiredMinutes?: number;
  actualMinutes?: number;
}

/** Full compliance result for a user-day. */
export interface DayComplianceResult {
  userId: string;
  userName: string;
  date: string;
  overallStatus: ComplianceStatus;
  rules: RuleResult[];
  totalWorkMinutes: number;
  totalBreakMinutes: number;
}

/** Custom rule thresholds (for 'custom' jurisdiction). */
export interface CustomRule {
  minWorkMinutes: number;
  requiredBreakMinutes: number;
}

/** Workspace-level compliance configuration. */
export interface ComplianceConfig {
  jurisdiction: Jurisdiction;
  customRules?: CustomRule[];
  defaultDatePreset?: DatePreset;
}

// --- Store ---

export interface TokenClaims {
  workspaceId: string;
  backendUrl?: string;
  reportsUrl?: string;
  user?: string;
  sub?: string;
  addonId?: string;
  theme?: string;
  language?: string;
  workspaceRole?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

export interface ClockifyUser {
  id: string;
  name: string;
  email?: string;
  status?: string;
}

export interface AppStore {
  token: string;
  claims: TokenClaims;
  users: ClockifyUser[];
  config: ComplianceConfig;
  results: Map<string, Map<string, DayComplianceResult>>; // userId -> dateKey -> result
  loading: boolean;
  error: string | null;
  activePreset: DatePreset;
}

// --- API ---

/** Raw time entry from Clockify Detailed Report API. */
export interface ReportTimeEntry {
  _id: string;
  description: string;
  userId: string;
  userName?: string;
  timeInterval: {
    start: string;
    end: string;
    duration: number; // seconds
  };
  type: 'REGULAR' | 'BREAK' | 'HOLIDAY' | 'TIME_OFF';
  projectId?: string;
  projectName?: string;
}

/** Server config stored in Worker KV. */
export interface ServerConfig {
  config: ComplianceConfig;
  schemaVersion: number;
  updatedAt: string;
  updatedBy: string;
}

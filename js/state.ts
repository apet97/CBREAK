/**
 * @fileoverview Central application state store.
 */

import type { TokenClaims, ClockifyUser, ComplianceConfig, DayComplianceResult, AppStore, DatePreset } from './types.js';

const DEFAULT_CONFIG: ComplianceConfig = {
  jurisdiction: 'custom',
};

export const store: AppStore = {
  token: '',
  claims: {} as TokenClaims,
  users: [],
  config: { ...DEFAULT_CONFIG },
  results: new Map(),
  loading: false,
  error: null,
  activePreset: 'this_week' as DatePreset,
  customRangeStart: null,
  customRangeEnd: null,
};

export function setToken(token: string): void {
  store.token = token;
}

export function setClaims(claims: TokenClaims): void {
  store.claims = claims;
}

export function setUsers(users: ClockifyUser[]): void {
  store.users = users;
}

export function setConfig(config: ComplianceConfig): void {
  store.config = config;
}

export function setResults(results: Map<string, Map<string, DayComplianceResult>>): void {
  store.results = results;
}

export function setLoading(loading: boolean): void {
  store.loading = loading;
}

export function setError(error: string | null): void {
  store.error = error;
}

export function setActivePreset(preset: DatePreset): void {
  store.activePreset = preset;
}

export function setCustomRange(start: string | null, end: string | null): void {
  store.customRangeStart = start;
  store.customRangeEnd = end;
}

export function resetConfig(): void {
  store.config = { ...DEFAULT_CONFIG };
}

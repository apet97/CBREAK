/**
 * @fileoverview Central application state store.
 */

import type { TokenClaims, ClockifyUser, ComplianceConfig, DayComplianceResult, AppStore, DatePreset } from './types.js';

const DEFAULT_CONFIG: ComplianceConfig = {
  jurisdiction: 'arbzg',
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

export function resetConfig(): void {
  store.config = { ...DEFAULT_CONFIG };
}

/**
 * @fileoverview Worker type definitions for Break Compliance addon.
 */

export interface Env {
  SETTINGS_KV: KVNamespace;
  GITHUB_PAGES_ORIGIN: string;
  ENVIRONMENT?: string;
}

export interface ComplianceConfig {
  jurisdiction: 'arbzg' | 'california' | 'custom';
  customRules?: Array<{
    minWorkMinutes: number;
    requiredBreakMinutes: number;
  }>;
  defaultDatePreset?: 'today' | 'this_week' | 'last_week' | 'last_2_weeks' | 'last_month' | 'this_year';
}

export interface ServerConfig {
  config: ComplianceConfig;
  schemaVersion: number;
  updatedAt: string;
  updatedBy: string;
}

export interface InstalledPayload {
  addonId: string;
  authToken: string;
  workspaceId: string;
  asUser: string;
  apiUrl?: string;
  addonUserId: string;
}

export interface JwtPayload {
  sub?: string;
  user?: string;
  workspaceId: string;
  workspaceRole?: string;
  backendUrl?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

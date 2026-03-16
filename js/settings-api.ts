/**
 * @fileoverview Server settings API client for reading/writing compliance config
 * stored in the Cloudflare Worker KV backend.
 */

import type { ComplianceConfig, ServerConfig, TokenClaims } from './types.js';

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Derives the Worker API base URL from the current page origin.
 * In production the frontend is served by the Worker, so same origin.
 */
function getWorkerBaseUrl(): string {
  return window.location.origin;
}

/**
 * Fetches the workspace compliance config from the server.
 */
export async function fetchServerConfig(
  token: string,
  _claims: TokenClaims
): Promise<ComplianceConfig | null> {
  const url = `${getWorkerBaseUrl()}/api/config`;
  const response = await fetch(url, {
    headers: { 'X-Addon-Token': token },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    console.warn(`[settings-api] Failed to fetch config: ${response.status}`);
    return null;
  }

  const data = (await response.json()) as ServerConfig | { config: null };
  if (!data.config) return null;

  return data.config as ComplianceConfig;
}

/**
 * Saves the workspace compliance config to the server.
 */
export async function saveServerConfig(
  token: string,
  _claims: TokenClaims,
  config: ComplianceConfig
): Promise<boolean> {
  const url = `${getWorkerBaseUrl()}/api/config`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'X-Addon-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ config }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    console.warn(`[settings-api] Failed to save config: ${response.status}`);
    return false;
  }

  return true;
}

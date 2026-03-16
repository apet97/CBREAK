/**
 * @fileoverview Clockify addon lifecycle handlers.
 * INSTALLED → store token + default config, DELETED → cleanup.
 */

import type { Env, InstalledPayload, ComplianceConfig, ServerConfig } from './types';
import { jsonResponse, errorResponse, verifyLifecycleSignature, verifyInstallToken, verifyAuthTokenSignature } from './auth';

const DEFAULT_CONFIG: ComplianceConfig = {
  jurisdiction: 'arbzg',
};

export async function handleInstalled(request: Request, env: Env): Promise<Response> {
  let payload: InstalledPayload;
  try {
    payload = (await request.json()) as InstalledPayload;
  } catch {
    return errorResponse('Invalid JSON payload', 400, request, env.ENVIRONMENT);
  }

  const { workspaceId, authToken, asUser, apiUrl } = payload;
  if (!workspaceId || !authToken) {
    return errorResponse('Missing workspaceId or authToken', 400, request, env.ENVIRONMENT);
  }

  // Three-tier authentication
  const sigResult = await verifyLifecycleSignature(request);
  const authTokenSigValid = await verifyAuthTokenSignature(authToken);

  let authMethod: string;
  if (sigResult.valid) {
    if (sigResult.workspaceId && sigResult.workspaceId !== workspaceId) {
      return errorResponse('Unauthorized: workspaceId mismatch', 401, request, env.ENVIRONMENT);
    }
    authMethod = 'signature';
  } else if (authTokenSigValid) {
    authMethod = 'authToken-jwt';
  } else {
    const tokenValid = await verifyInstallToken(apiUrl, workspaceId, authToken);
    if (!tokenValid) {
      return errorResponse('Unauthorized: invalid lifecycle signature and could not verify installation token', 401, request, env.ENVIRONMENT);
    }
    authMethod = 'api-fallback';
    console.warn(`[AUDIT] Installed API-fallback auth path used: workspace=${workspaceId}`);
  }

  console.log(`[AUDIT] Addon installed: workspace=${workspaceId} user=${asUser || 'unknown'} authMethod=${authMethod}`);

  await env.SETTINGS_KV.put(`ws:${workspaceId}:token`, authToken);

  const existingConfig = await env.SETTINGS_KV.get(`ws:${workspaceId}:config`);
  if (!existingConfig) {
    const defaultServerConfig: ServerConfig = {
      config: DEFAULT_CONFIG,
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: asUser || 'system',
    };
    await env.SETTINGS_KV.put(`ws:${workspaceId}:config`, JSON.stringify(defaultServerConfig));
  }

  return jsonResponse({ status: 'installed' }, 200, request, env.ENVIRONMENT);
}

export async function handleDeleted(request: Request, env: Env): Promise<Response> {
  const sigResult = await verifyLifecycleSignature(request);
  if (!sigResult.valid) {
    return errorResponse('Unauthorized: invalid or missing lifecycle signature', 401, request, env.ENVIRONMENT);
  }

  let payload: { workspaceId?: string };
  try {
    payload = (await request.json()) as { workspaceId?: string };
  } catch {
    return errorResponse('Invalid JSON payload', 400, request, env.ENVIRONMENT);
  }

  const workspaceId = sigResult.workspaceId ?? payload.workspaceId;
  if (!workspaceId) {
    return errorResponse('Missing workspaceId', 400, request, env.ENVIRONMENT);
  }

  if (sigResult.workspaceId && payload.workspaceId && sigResult.workspaceId !== payload.workspaceId) {
    return errorResponse('Unauthorized: workspaceId mismatch', 401, request, env.ENVIRONMENT);
  }

  console.log(`[AUDIT] Addon deleted: workspace=${workspaceId}`);

  await env.SETTINGS_KV.delete(`ws:${workspaceId}:token`);
  await env.SETTINGS_KV.delete(`ws:${workspaceId}:config`);

  return jsonResponse({ status: 'deleted' }, 200, request, env.ENVIRONMENT);
}

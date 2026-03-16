/**
 * @fileoverview CRUD endpoints for workspace compliance configuration.
 * GET/PUT /api/config — jurisdiction + custom rules.
 */

import type { Env, ServerConfig, ComplianceConfig } from './types';
import { extractAndVerifyJwt, isAdminRole, isWorkspaceAdmin, jsonResponse, errorResponse } from './auth';

const VALID_JURISDICTIONS = ['arbzg', 'california', 'custom'] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isValidComplianceConfig(v: unknown): v is ComplianceConfig {
  if (!isRecord(v)) return false;
  if (!(VALID_JURISDICTIONS as readonly string[]).includes(v.jurisdiction as string)) return false;

  if (v.customRules !== undefined) {
    if (!Array.isArray(v.customRules)) return false;
    for (const rule of v.customRules) {
      if (!isRecord(rule)) return false;
      if (typeof rule.minWorkMinutes !== 'number' || !isFinite(rule.minWorkMinutes as number)) return false;
      if (typeof rule.requiredBreakMinutes !== 'number' || !isFinite(rule.requiredBreakMinutes as number)) return false;
      if ((rule.minWorkMinutes as number) < 0 || (rule.minWorkMinutes as number) > 1440) return false;
      if ((rule.requiredBreakMinutes as number) < 0 || (rule.requiredBreakMinutes as number) > 1440) return false;
    }
  }

  return true;
}

function isValidServerConfig(data: unknown): data is ServerConfig {
  if (!isRecord(data)) return false;
  if (!isValidComplianceConfig(data.config)) return false;
  return true;
}

export async function handleConfigGet(request: Request, env: Env): Promise<Response> {
  let jwt;
  try {
    jwt = await extractAndVerifyJwt(request);
  } catch (e) {
    return errorResponse(`Unauthorized: ${(e as Error).message}`, 401, request, env.ENVIRONMENT);
  }

  const data = await env.SETTINGS_KV.get(`ws:${jwt.workspaceId}:config`);
  if (!data) {
    return jsonResponse({ config: null, message: 'No config set for this workspace' }, 200, request, env.ENVIRONMENT);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    console.error(`[KV] Corrupted config JSON for workspace ${jwt.workspaceId}`);
    return errorResponse('Corrupted config data', 500, request, env.ENVIRONMENT);
  }

  if (!isValidServerConfig(parsed)) {
    console.error(`[KV] Invalid config schema for workspace ${jwt.workspaceId}`);
    return errorResponse('Corrupted config data', 500, request, env.ENVIRONMENT);
  }

  return jsonResponse(parsed, 200, request, env.ENVIRONMENT);
}

export async function handleConfigPut(request: Request, env: Env): Promise<Response> {
  let jwt;
  try {
    jwt = await extractAndVerifyJwt(request);
  } catch (e) {
    return errorResponse(`Unauthorized: ${(e as Error).message}`, 401, request, env.ENVIRONMENT);
  }

  const userId = jwt.user ?? jwt.sub ?? 'unknown';
  if (!jwt.backendUrl) {
    return errorResponse('Bad Request: token missing backendUrl', 400, request, env.ENVIRONMENT);
  }

  const isAdmin = isAdminRole(jwt.workspaceRole)
    || await isWorkspaceAdmin(env, jwt.workspaceId, userId, jwt.backendUrl);
  if (!isAdmin) {
    return errorResponse('Forbidden: admin access required', 403, request, env.ENVIRONMENT);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON', 400, request, env.ENVIRONMENT);
  }

  if (!isRecord(body) || !isRecord(body.config)) {
    return errorResponse('Missing config', 400, request, env.ENVIRONMENT);
  }

  if (!isValidComplianceConfig(body.config)) {
    return errorResponse('Invalid config: check jurisdiction and custom rules', 400, request, env.ENVIRONMENT);
  }

  const payload: ServerConfig = {
    config: body.config as ComplianceConfig,
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  };

  console.log(`[AUDIT] Config saved: workspace=${jwt.workspaceId} user=${userId}`);
  await env.SETTINGS_KV.put(`ws:${jwt.workspaceId}:config`, JSON.stringify(payload));
  return jsonResponse({ status: 'saved' }, 200, request, env.ENVIRONMENT);
}

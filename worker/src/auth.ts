/**
 * @fileoverview Authentication, authorization, and CORS for the Worker.
 * Adapted from otrepo/worker/src/auth.ts — changed ADDON_MANIFEST_KEY.
 */

import type { Env, JwtPayload } from './types';

const ADDON_MANIFEST_KEY = 'break-compliance';

const CLOCKIFY_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAubktufFNO/op+E5WBWL6
/Y9QRZGSGGCsV00FmPRl5A0mSfQu3yq2Yaq47IlN0zgFy9IUG8/JJfwiehsmbrKa
49t/xSkpG1u9w1GUyY0g4eKDUwofHKAt3IPw0St4qsWLK9mO+koUo56CGQOEpTui
5bMfmefVBBfShXTaZOtXPB349FdzSuYlU/5o3L12zVWMutNhiJCKyGfsuu2uXa9+
6uQnZBw1wO3/QEci7i4TbC+ZXqW1rCcbogSMORqHAP6qSAcTFRmrjFAEsOWiUUhZ
rLDg2QJ8VTDghFnUhYklNTJlGgfo80qEWe1NLIwvZj0h3bWRfrqZHsD/Yjh0duk6
yQIDAQAB
-----END PUBLIC KEY-----`;

const ALLOWED_CLOCKIFY_HOSTS = ['api.clockify.me', 'global.api.clockify.me'] as const;

const DEFAULT_INSTALL_TOKEN_API_BASES = [
  'https://developer.clockify.me/api',
  'https://api.clockify.me/api',
  'https://global.api.clockify.me/api',
] as const;

export function isAllowedClockifyUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return false;
    return (ALLOWED_CLOCKIFY_HOSTS as readonly string[]).includes(hostname) ||
      hostname.endsWith('.clockify.me');
  } catch {
    return false;
  }
}

function getClockifyApiBaseCandidates(apiUrl: string): string[] {
  if (!isAllowedClockifyUrl(apiUrl)) return [];
  try {
    const parsed = new URL(apiUrl);
    const origin = parsed.origin;
    const normalizedPath = parsed.pathname.replace(/\/+$/, '');
    const candidates = new Set<string>();
    const addCandidate = (path: string) => { candidates.add(`${origin}${path}`); };

    if (!normalizedPath || normalizedPath === '/') {
      addCandidate('/api');
      addCandidate('');
    } else if (normalizedPath.endsWith('/api')) {
      addCandidate(normalizedPath);
    } else if (normalizedPath.endsWith('/api/v1')) {
      addCandidate(normalizedPath.replace(/\/v1$/, ''));
    } else {
      addCandidate(normalizedPath);
      addCandidate(`${normalizedPath}/api`);
    }
    return Array.from(candidates);
  } catch {
    return [];
  }
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64UrlDecode(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function verifyRsa256(token: string): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const keyBuffer = pemToArrayBuffer(CLOCKIFY_PUBLIC_KEY_PEM);
    const cryptoKey = await crypto.subtle.importKey(
      'spki', keyBuffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['verify']
    );

    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = base64UrlDecode(parts[2]).buffer as ArrayBuffer;

    return await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      cryptoKey, signature, signingInput
    );
  } catch {
    return false;
  }
}

export function decodeJwt(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

  // Alias normalization
  if (!payload.workspaceId && typeof payload.activeWs === 'string' && payload.activeWs.trim()) {
    payload.workspaceId = payload.activeWs;
  }

  if (!payload.backendUrl) {
    const legacy =
      (typeof payload.apiUrl === 'string' && payload.apiUrl.trim()) ? payload.apiUrl :
      (typeof payload.baseURL === 'string' && payload.baseURL.trim()) ? payload.baseURL :
      (typeof payload.baseUrl === 'string' && payload.baseUrl.trim()) ? payload.baseUrl :
      undefined;
    if (legacy) {
      try {
        const parsed = new URL(legacy);
        let pathname = parsed.pathname.replace(/\/+$/, '');
        if (!pathname || pathname === '/') pathname = '/api';
        else if (pathname.endsWith('/api/v1')) pathname = pathname.replace(/\/v1$/, '');
        else if (!pathname.endsWith('/api')) pathname = `${pathname}/api`;
        payload.backendUrl = `${parsed.origin}${pathname}`;
      } catch {
        payload.backendUrl = legacy;
      }
    }
  }

  if (!payload.workspaceId) throw new Error('Missing workspaceId in JWT');
  return payload as JwtPayload;
}

export async function extractAndVerifyJwt(request: Request): Promise<JwtPayload> {
  let token: string;

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    const addonToken = request.headers.get('X-Addon-Token');
    if (addonToken) {
      token = addonToken;
    } else {
      throw new Error('No auth token provided');
    }
  }

  const signatureValid = await verifyRsa256(token);
  if (!signatureValid) throw new Error('Invalid token signature');

  return decodeJwt(token);
}

export async function verifyAuthTokenSignature(token: string): Promise<boolean> {
  const signatureValid = await verifyRsa256(token);
  if (!signatureValid) return false;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    ) as Record<string, unknown>;

    if (payload.iss !== 'clockify') return false;
    if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

export async function verifyLifecycleSignature(
  request: Request,
  addonKey: string = ADDON_MANIFEST_KEY
): Promise<{ valid: boolean; workspaceId?: string }> {
  const signatureHeader = request.headers.get('Clockify-Signature');
  if (!signatureHeader) return { valid: false };

  try {
    const parts = signatureHeader.split('.');
    if (parts.length !== 3) return { valid: false };

    const signatureValid = await verifyRsa256(signatureHeader);
    if (!signatureValid) return { valid: false };

    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    ) as Record<string, unknown>;

    if (payload.iss !== 'clockify') return { valid: false };
    if (payload.type !== 'addon') return { valid: false };
    if (payload.sub !== addonKey) return { valid: false };

    if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp) {
      return { valid: false };
    }

    return {
      valid: true,
      workspaceId: typeof payload.workspaceId === 'string' ? payload.workspaceId : undefined,
    };
  } catch {
    return { valid: false };
  }
}

export async function verifyInstallToken(
  apiUrl: string | undefined,
  workspaceId: string,
  authToken: string
): Promise<boolean> {
  let candidateBases: string[];
  if (apiUrl && apiUrl.trim()) {
    candidateBases = getClockifyApiBaseCandidates(apiUrl);
  } else {
    candidateBases = Array.from(new Set(
      DEFAULT_INSTALL_TOKEN_API_BASES.flatMap((base) => getClockifyApiBaseCandidates(base))
    ));
  }
  if (candidateBases.length === 0) return false;

  for (const base of candidateBases) {
    try {
      const response = await fetch(`${base}/v1/workspaces/${workspaceId}`, {
        headers: { 'X-Addon-Token': authToken },
      });
      if (!response.ok) continue;
      const contentType = response.headers?.get?.('content-type') ?? '';
      if (contentType && !contentType.includes('application/json')) continue;
      return true;
    } catch {
      // Try next candidate
    }
  }
  return false;
}

const ADMIN_ROLES = ['WORKSPACE_ADMIN', 'OWNER'] as const;

export function isAdminRole(role: string | undefined): boolean {
  return role != null && (ADMIN_ROLES as readonly string[]).includes(role);
}

export async function isWorkspaceAdmin(
  env: Env,
  workspaceId: string,
  userId: string,
  backendUrl: string
): Promise<boolean> {
  if (!isAllowedClockifyUrl(backendUrl)) return false;

  const installToken = await env.SETTINGS_KV.get(`ws:${workspaceId}:token`);
  if (!installToken) return false;

  try {
    const response = await fetch(
      `${backendUrl}/v1/workspaces/${workspaceId}/users/${userId}`,
      { headers: { 'X-Addon-Token': installToken } }
    );
    if (!response.ok) return false;

    const user = (await response.json()) as { roles?: Array<{ role?: string }> };
    return (user.roles ?? []).some(
      (r) => r.role === 'WORKSPACE_ADMIN' || r.role === 'OWNER'
    );
  } catch {
    return false;
  }
}

// --- CORS ---

const CORS_ALLOWED_PATTERNS: readonly (string | RegExp)[] = [
  'https://app.clockify.me',
  'https://clockify.me',
  /^https:\/\/[a-z]{2}\.app\.clockify\.me$/,
  /^https:\/\/[a-z]{2}\.clockify\.me$/,
  /^https:\/\/[\w-]+\.github\.io$/,
  /^https:\/\/[\w-]+\.[\w-]+\.workers\.dev$/,
];

const DEV_ONLY_PATTERNS: readonly RegExp[] = [
  /^http:\/\/localhost(:\d+)?$/,
];

export function isAllowedCorsOrigin(origin: string, environment?: string): boolean {
  const allowDev = environment !== undefined && environment !== 'production';
  const patterns: readonly (string | RegExp)[] =
    allowDev ? [...CORS_ALLOWED_PATTERNS, ...DEV_ONLY_PATTERNS] : CORS_ALLOWED_PATTERNS;
  return patterns.some((pattern) =>
    typeof pattern === 'string' ? origin === pattern : pattern.test(origin)
  );
}

export function corsHeaders(request?: Request, environment?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Addon-Token',
  };
  const origin = request?.headers.get('Origin');
  if (origin && isAllowedCorsOrigin(origin, environment)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

export function jsonResponse(data: unknown, status = 200, request?: Request, environment?: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request, environment) },
  });
}

export function errorResponse(message: string, status = 400, request?: Request, environment?: string): Response {
  return jsonResponse({ error: message }, status, request, environment);
}

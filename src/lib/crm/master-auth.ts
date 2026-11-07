import "server-only";
import { NextRequest } from "next/server";
import crypto from "crypto";
import { supabaseRows, verifyOperator } from "@/lib/crm/supabase-server";

export const MASTER_COOKIE_NAME = "nw_master_session";
// Standardized session lifetime: exactly 12 hours (43200 seconds)
export const MASTER_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const MASTER_SESSION_TTL_SEC = 12 * 60 * 60;
// Extended session lifetime for "Remember me" (30 days)
export const MASTER_REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MASTER_REMEMBER_TTL_SEC = 30 * 24 * 60 * 60;

type Staff = { role: string; enabled: boolean };

/**
 * Retrieve the dedicated strong HMAC secret for signing administrative sessions.
 * Fails closed (returns empty string) if missing or less than 32 characters.
 * NEVER uses or reuses the administrative login password.
 */
export function getMasterSessionSecret(): string {
  const secret = process.env.CRM_MASTER_SESSION_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  return "";
}

/**
 * Retrieve administrative password for Master login verification only.
 */
export function getMasterPassword(): string {
  return process.env.CRM_MASTER_PASSWORD?.trim() || "";
}

/**
 * Retrieve legacy service token for automated API calls.
 */
export function getLegacyAdminToken(): string {
  return process.env.CRM_LAB_ADMIN_TOKEN?.trim() || "";
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
export function timingSafeMatch(candidate: string, expected: string): boolean {
  if (!candidate || !expected) return false;
  const bufCandidate = Buffer.from(candidate);
  const bufExpected = Buffer.from(expected);
  if (bufCandidate.length !== bufExpected.length) {
    // Perform dummy constant-time comparison on candidate to mitigate timing leaks
    crypto.timingSafeEqual(bufCandidate, bufCandidate);
    return false;
  }
  return crypto.timingSafeEqual(bufCandidate, bufExpected);
}

/**
 * Create a signed, tamper-proof session token for Master administrators.
 * Supports optional 30-day extended remember-me lifetime.
 * Requires CRM_MASTER_SESSION_SECRET in environment; throws if missing (fail-closed).
 */
export function signMasterToken(actor = "master_admin", rememberMe = false): string {
  const secret = getMasterSessionSecret();
  if (!secret) {
    throw new Error("CRM_MASTER_SESSION_SECRET_MISSING: Cannot sign session without dedicated environment secret (minimum 32 chars).");
  }
  const timestamp = Date.now().toString();
  const payload = rememberMe ? `${actor}:${timestamp}:remember` : `${actor}:${timestamp}`;
  const hmacKey = crypto.createHash("sha256").update(secret).digest();
  const hmac = crypto.createHmac("sha256", hmacKey).update(payload).digest("hex");
  return `${payload}:${hmac}`;
}

/**
 * Verify a signed Master session token.
 * Fails closed (returns valid: false) if the environment session secret is missing or invalid.
 */
export function verifyMasterToken(token: string | undefined): { valid: boolean; actor?: string } {
  if (!token || typeof token !== "string") return { valid: false };
  const secret = getMasterSessionSecret();
  if (!secret) {
    // Fail-closed: Cannot verify sessions without the configured session secret
    return { valid: false };
  }

  const cleanToken = token.includes("%") ? decodeURIComponent(token) : token;
  const parts = cleanToken.split(":");
  if (parts.length === 3) {
    const [actor, timestampStr, signature] = parts;
    const timestamp = parseInt(timestampStr, 10);
    if (Number.isNaN(timestamp) || Date.now() - timestamp > MASTER_SESSION_TTL_MS || timestamp > Date.now() + 60000) {
      return { valid: false };
    }

    const payload = `${actor}:${timestampStr}`;
    const hmacKey = crypto.createHash("sha256").update(secret).digest();
    const expectedHmac = crypto.createHmac("sha256", hmacKey).update(payload).digest("hex");

    if (!timingSafeMatch(signature, expectedHmac)) {
      return { valid: false };
    }

    return { valid: true, actor };
  }

  if (parts.length === 4 && parts[2] === "remember") {
    const [actor, timestampStr, mode, signature] = parts;
    const timestamp = parseInt(timestampStr, 10);
    if (Number.isNaN(timestamp) || Date.now() - timestamp > MASTER_REMEMBER_TTL_MS || timestamp > Date.now() + 60000) {
      return { valid: false };
    }

    const payload = `${actor}:${timestampStr}:${mode}`;
    const hmacKey = crypto.createHash("sha256").update(secret).digest();
    const expectedHmac = crypto.createHmac("sha256", hmacKey).update(payload).digest("hex");

    if (!timingSafeMatch(signature, expectedHmac)) {
      return { valid: false };
    }

    return { valid: true, actor };
  }

  return { valid: false };
}

/**
 * Comprehensive Master authorization verification for all admin routes:
 * 1. Checks secure signed HTTP-only cookie (nw_master_session)
 * 2. Checks Bearer token or x-admin-password against environment secret
 * 3. Checks legacy crm_admin_token cookie with deprecation notice
 * 4. Checks Supabase authenticated user with platform_staff table role
 */
export async function verifyMasterRequest(request: NextRequest): Promise<{ authorized: boolean; actor: string }> {
  // 1. Check signed HTTP-only session cookie (primary & recommended)
  const sessionCookie = request.cookies.get(MASTER_COOKIE_NAME)?.value;
  if (sessionCookie) {
    const session = verifyMasterToken(sessionCookie);
    if (session.valid && session.actor) {
      return { authorized: true, actor: session.actor };
    }
  }

  // 2. Check direct header (Authorization: Bearer <key> or x-admin-password)
  const masterPassword = getMasterPassword();
  const legacyToken = getLegacyAdminToken();
  const authHeader = request.headers.get("x-admin-password") || request.headers.get("authorization") || "";
  const cleanKey = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (cleanKey) {
    if (masterPassword && (
      timingSafeMatch(cleanKey, masterPassword) ||
      (masterPassword.endsWith(".") && timingSafeMatch(cleanKey, masterPassword.slice(0, -1))) ||
      (!masterPassword.endsWith(".") && timingSafeMatch(cleanKey, masterPassword + "."))
    )) {
      return { authorized: true, actor: "api_master_password" };
    }
    if (legacyToken && timingSafeMatch(cleanKey, legacyToken)) {
      return { authorized: true, actor: "api_service_token" };
    }
  }

  // 3. Check legacy crm_admin_token cookie (warn about rotation)
  const legacyCookie = request.cookies.get("crm_admin_token")?.value;
  if (legacyCookie) {
    if ((legacyToken && timingSafeMatch(legacyCookie, legacyToken)) ||
        (masterPassword && timingSafeMatch(legacyCookie, masterPassword))) {
      console.warn("[master-auth] Warning: Legacy crm_admin_token cookie used. Session should be upgraded to signed nw_master_session.");
      return { authorized: true, actor: "legacy_admin_cookie" };
    }
  }

  // 4. Check Supabase operator session with platform_staff authorization
  try {
    const operator = await verifyOperator();
    if (operator) {
      const staff = await supabaseRows<Staff[]>(
        `platform_staff?select=role,enabled&user_id=eq.${encodeURIComponent(operator.id)}&limit=2`,
        operator.token
      );
      if (staff.length === 1 && staff[0].enabled && ["MASTER", "ADMINISTRADOR", "platform_admin"].includes(staff[0].role)) {
        return { authorized: true, actor: operator.email || operator.id };
      }
    }
  } catch {}

  return { authorized: false, actor: "anonymous" };
}

import { NextRequest, NextResponse } from "next/server";
import { isAllowedOrigin, privateJson, sessionCookieName, supabaseSettings, verifyOperator, supabaseRows } from "@/lib/crm/supabase-server";
import {
  MASTER_COOKIE_NAME,
  MASTER_SESSION_TTL_SEC,
  MASTER_REMEMBER_TTL_SEC,
  signMasterToken,
  timingSafeMatch,
  verifyMasterRequest
} from "@/lib/crm/master-auth";
import { getRedis } from "@/lib/crm/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Staff = { role: string; enabled: boolean };
type Membership = { tenant_id: string; role: string };
type Tenant = { id: string; name: string; status: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/crm/auth/session
 * Identifies currently logged-in user and returns their verified role and destination.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Check if authenticated as Master Admin
    const masterAuth = await verifyMasterRequest(request);
    if (masterAuth.authorized) {
      return privateJson({
        authenticated: true,
        role: "master",
        actor: masterAuth.actor,
        redirectTo: "/admin"
      });
    }

    // 2. Check if authenticated as Store Client / Operator via Supabase
    const operator = await verifyOperator();
    if (operator) {
      // Check if user is also in platform_staff
      try {
        const staff = await supabaseRows<Staff[]>(
          `platform_staff?select=role,enabled&user_id=eq.${encodeURIComponent(operator.id)}&limit=2`,
          operator.token
        );
        if (staff.length === 1 && staff[0].enabled && ["MASTER", "ADMINISTRADOR", "platform_admin"].includes(staff[0].role)) {
          return privateJson({
            authenticated: true,
            role: "master",
            actor: operator.email || operator.id,
            redirectTo: "/admin"
          });
        }
      } catch {}

      // Check tenant memberships
      try {
        const memberships = await supabaseRows<Membership[]>(
          `crm_tenant_memberships?select=tenant_id,role&user_id=eq.${encodeURIComponent(operator.id)}`,
          operator.token
        );
        const tenantIds = memberships.map(m => m.tenant_id).filter(id => UUID.test(id));
        if (tenantIds.length > 0) {
          const tenants = await supabaseRows<Tenant[]>(
            `crm_tenants?select=id,name,status&id=in.(${tenantIds.join(",")})&status=eq.active`,
            operator.token
          );
          if (tenants.length > 0) {
            return privateJson({
              authenticated: true,
              role: "client",
              actor: operator.email || operator.id,
              tenants,
              redirectTo: "/cliente"
            });
          }
        }
      } catch {}

      // Authenticated with Supabase but has no active store association
      return privateJson({
        authenticated: false,
        error: "no_active_tenant",
        message: "Usuário autenticado, mas não possui lojas ativas vinculadas."
      });
    }

    return privateJson({ authenticated: false });
  } catch {
    return privateJson({ authenticated: false });
  }
}

/**
 * POST /api/crm/auth/session
 * Single Central Login: Authenticates Master or Store Client and issues HttpOnly cookies.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "local_client";

    const redis = getRedis();
    const rateLimitKey = `crm:ratelimit:login:${ip}`;
    let attempts = 0;
    try {
      if (redis.status !== "ready" && redis.status !== "connecting") await redis.connect();
      const raw = await redis.get(rateLimitKey);
      attempts = raw ? parseInt(raw, 10) : 0;
    } catch {}

    if (attempts >= 8) {
      return privateJson({
        error: "too_many_attempts",
        message: "Muitas tentativas incorretas. Acesso bloqueado temporariamente por 15 minutos para proteção."
      }, 429);
    }

    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const rememberMe = Boolean(body.rememberMe);

    if (!password) {
      return privateJson({ error: "missing_credentials", message: "Informe a senha para continuar." }, 400);
    }

    const masterPassword = process.env.CRM_MASTER_PASSWORD?.trim() || "";
    const adminToken = process.env.CRM_LAB_ADMIN_TOKEN?.trim() || "";

    const isMasterPasswordMatch = Boolean(masterPassword && timingSafeMatch(password, masterPassword));

    // 1. Attempt Supabase Auth if email is provided
    let supaAccessToken: string | null = null;
    let supaUserId: string | null = null;
    let supaUserEmail: string | null = null;
    let supaMaxAge = 3600;

    if (email && email.includes("@")) {
      try {
        const { url, key } = supabaseSettings();
        const authRes = await fetch(url + "/auth/v1/token?grant_type=password", {
          method: "POST",
          headers: { apikey: key, "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          cache: "no-store",
          signal: AbortSignal.timeout(9000)
        });

        if (authRes.ok) {
          const authData = await authRes.json() as { access_token?: string; expires_in?: number; user?: { id?: string; email?: string } };
          if (authData.access_token && authData.user?.id) {
            supaAccessToken = authData.access_token;
            supaUserId = authData.user.id;
            supaUserEmail = authData.user.email || email;
            supaMaxAge = Math.max(60, Math.min(30 * 24 * 3600, Number(authData.expires_in ?? 3600)));
          }
        }
      } catch {}
    }

    // 2. Evaluate Role & Routing
    const isHttps = request.nextUrl.protocol === "https:" &&
      !request.nextUrl.hostname.includes("localhost") &&
      !request.nextUrl.hostname.includes("127.0.0.1");

    // Clear rate limit on successful credentials match
    if (isMasterPasswordMatch || supaAccessToken) {
      try { await redis.del(rateLimitKey); } catch {}
    }

    // CASE A: Master Admin via direct password match
    if (isMasterPasswordMatch) {
      const masterToken = signMasterToken("master_admin", rememberMe);
      const maxAge = rememberMe ? MASTER_REMEMBER_TTL_SEC : MASTER_SESSION_TTL_SEC;

      const response = NextResponse.json({
        success: true,
        role: "master",
        redirectTo: "/admin",
        actor: email || "master_admin"
      });

      response.cookies.set({
        name: MASTER_COOKIE_NAME,
        value: masterToken,
        httpOnly: true,
        secure: isHttps,
        sameSite: "lax",
        path: "/",
        maxAge
      });

      // If user also authenticated with Supabase, set operator cookie too
      if (supaAccessToken) {
        response.cookies.set(sessionCookieName(), supaAccessToken, {
          httpOnly: true,
          sameSite: "lax",
          secure: isHttps,
          path: "/",
          maxAge: rememberMe ? MASTER_REMEMBER_TTL_SEC : supaMaxAge
        });
      }

      return response;
    }

    // CASE B: Supabase Auth User
    if (supaAccessToken && supaUserId) {
      // B.1 Check if this Supabase user has a Master / Admin role in platform_staff
      try {
        const staff = await supabaseRows<Staff[]>(
          `platform_staff?select=role,enabled&user_id=eq.${encodeURIComponent(supaUserId)}&limit=2`,
          supaAccessToken
        );

        if (staff.length === 1 && staff[0].enabled && ["MASTER", "ADMINISTRADOR", "platform_admin"].includes(staff[0].role)) {
          const masterToken = signMasterToken(`master_${supaUserId}`, rememberMe);
          const maxAge = rememberMe ? MASTER_REMEMBER_TTL_SEC : MASTER_SESSION_TTL_SEC;

          const response = NextResponse.json({
            success: true,
            role: "master",
            redirectTo: "/admin",
            actor: supaUserEmail || supaUserId
          });

          response.cookies.set({
            name: MASTER_COOKIE_NAME,
            value: masterToken,
            httpOnly: true,
            secure: isHttps,
            sameSite: "lax",
            path: "/",
            maxAge
          });

          response.cookies.set(sessionCookieName(), supaAccessToken, {
            httpOnly: true,
            sameSite: "lax",
            secure: isHttps,
            path: "/",
            maxAge: rememberMe ? MASTER_REMEMBER_TTL_SEC : supaMaxAge
          });

          return response;
        }
      } catch {}

      // B.2 Check Store Client Memberships in crm_tenant_memberships
      try {
        const memberships = await supabaseRows<Membership[]>(
          `crm_tenant_memberships?select=tenant_id,role&user_id=eq.${encodeURIComponent(supaUserId)}`,
          supaAccessToken
        );
        const tenantIds = memberships.map(m => m.tenant_id).filter(id => UUID.test(id));

        if (!tenantIds.length) {
          return privateJson({
            error: "no_membership",
            message: "Sua conta de usuário não possui vínculo com nenhuma loja ativa no CRM. Contate o suporte da NovaesWeb."
          }, 403);
        }

        const tenants = await supabaseRows<Tenant[]>(
          `crm_tenants?select=id,name,status&id=in.(${tenantIds.join(",")})`,
          supaAccessToken
        );

        const activeTenants = tenants.filter(t => t.status === "active");
        if (!activeTenants.length) {
          return privateJson({
            error: "store_suspended",
            message: "A loja vinculada à sua conta está temporariamente suspensa ou inativa. Verifique o plano comercial com o suporte."
          }, 403);
        }

        // Store Client valid! Set operator cookie and clear any old master session
        const maxAge = rememberMe ? MASTER_REMEMBER_TTL_SEC : supaMaxAge;
        const response = NextResponse.json({
          success: true,
          role: "client",
          redirectTo: "/cliente",
          tenants: activeTenants,
          actor: supaUserEmail || supaUserId
        });

        response.cookies.set(sessionCookieName(), supaAccessToken, {
          httpOnly: true,
          sameSite: "lax",
          secure: isHttps,
          path: "/",
          maxAge
        });

        // Invalidate master cookie on client login
        response.cookies.set({
          name: MASTER_COOKIE_NAME,
          value: "",
          httpOnly: true,
          secure: isHttps,
          sameSite: "lax",
          path: "/",
          maxAge: 0
        });

        return response;
      } catch {
        return privateJson({
          error: "membership_verification_failed",
          message: "Não foi possível validar as empresas autorizadas para o seu usuário."
        }, 503);
      }
    }

    // Credential check failed
    try {
      await redis.incr(rateLimitKey);
      await redis.expire(rateLimitKey, 15 * 60);
    } catch {}

    return privateJson({
      error: "invalid_credentials",
      message: "E-mail ou senha incorretos. Verifique suas credenciais de acesso."
    }, 401);
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "auth_failed" }, 500);
  }
}

/**
 * DELETE /api/crm/auth/session
 * Complete, atomic Logout: destroys both Master and Client session cookies simultaneously.
 */
export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  const response = NextResponse.json({ authenticated: false, loggedOut: true });

  const isHttps = request.nextUrl.protocol === "https:" &&
    !request.nextUrl.hostname.includes("localhost") &&
    !request.nextUrl.hostname.includes("127.0.0.1");

  // Destroy Master cookie
  response.cookies.set({
    name: MASTER_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });

  // Destroy Client/Operator cookie
  response.cookies.set(sessionCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: 0
  });

  return response;
}


import { NextResponse, type NextRequest } from "next/server";

/**
 * Two jobs, both of which must happen before a page renders:
 *
 *  1. EXPERIMENT ASSIGNMENT — assign the landing variant once per visitor and
 *     persist it, so the server renders the right arm with no flash and the
 *     assignment survives the whole funnel (landing → audit → report → lead).
 *
 *  2. INTERNAL ACCESS — gate /internal/* behind a shared secret. This is not an
 *     auth platform and does not pretend to be one; it is the smallest thing
 *     that stops casual discovery of the sales brief. See SECURITY.md for what
 *     it does and does not defend against.
 */

export const VARIANT_COOKIE = "qntm_v";
export const INTERNAL_COOKIE = "qntm_internal";

/** 180 days. Long enough that a returning visitor stays in their arm. */
const VARIANT_MAX_AGE = 60 * 60 * 24 * 180;
/** 12 hours. Short enough that a shared laptop does not stay unlocked. */
const INTERNAL_MAX_AGE = 60 * 60 * 12;

/** Length-independent comparison, so the token cannot be probed by timing. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function guardInternal(request: NextRequest): NextResponse {
  const token = process.env.INTERNAL_ACCESS_TOKEN;

  // No token configured: allow locally so the tool is usable during
  // development, refuse in production rather than silently exposing it.
  if (!token) {
    if (process.env.NODE_ENV === "production") return notFound();
    return withInternalHeaders(NextResponse.next());
  }

  const cookie = request.cookies.get(INTERNAL_COOKIE)?.value;
  if (cookie && secretsMatch(cookie, token))
    return withInternalHeaders(NextResponse.next());

  // A key in the URL exchanges itself for a cookie and is then dropped from
  // the address bar, so the secret does not persist in history or in a
  // screen-shared URL.
  const key = request.nextUrl.searchParams.get("key");
  if (key && secretsMatch(key, token)) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("key");
    const response = NextResponse.redirect(clean);
    response.cookies.set(INTERNAL_COOKIE, token, {
      maxAge: INTERNAL_MAX_AGE,
      path: "/internal",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  }

  return notFound();
}

/** 404 rather than 401: an unauthorised visitor learns nothing exists here. */
function notFound(): NextResponse {
  return new NextResponse(null, {
    status: 404,
    headers: { "x-robots-tag": "noindex, nofollow, noarchive" },
  });
}

function withInternalHeaders(response: NextResponse): NextResponse {
  response.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  response.headers.set("cache-control", "no-store, max-age=0");
  return response;
}

function assignVariant(request: NextRequest): NextResponse {
  const existing = request.cookies.get(VARIANT_COOKIE)?.value;

  // A forced variant makes the experiment demonstrable without clearing
  // cookies. It only ever selects an arm the visitor could already be in.
  const forced = request.nextUrl.searchParams.get("v");
  const override = forced === "A" || forced === "B" ? forced : null;

  const variant =
    override ?? (existing === "A" || existing === "B" ? existing : coinFlip());

  const response = NextResponse.next();
  if (variant !== existing) {
    response.cookies.set(VARIANT_COOKIE, variant, {
      maxAge: VARIANT_MAX_AGE,
      path: "/",
      sameSite: "lax",
      httpOnly: false, // read by the client so events carry the arm
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}

function coinFlip(): "A" | "B" {
  return Math.random() < 0.5 ? "A" : "B";
}

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/internal"))
    return guardInternal(request);
  return assignVariant(request);
}

export const config = {
  matcher: ["/", "/audit", "/results", "/demo", "/talk", "/internal/:path*"],
};

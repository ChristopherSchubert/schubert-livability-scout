// HS256 service-token verification for GET /api/feed (#93, epic #84).
//
// The family hub pulls each app's feed with an `Authorization: Bearer <jwt>`
// service token, HS256-signed with the shared FEED_SERVICE_TOKEN_SIGNING_KEY.
// We verify it here rather than pull in a JWT dependency — node:crypto HMAC is
// the platform primitive and keeps the bundle lean. Fails closed: any doubt →
// { ok: false }, so a tokenless or tampered call is rejected (the conformance
// harness checks that a tokenless request does NOT 200).
import crypto from "node:crypto";

function b64urlToBuf(s) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Verify an `Authorization: Bearer <jwt>` HS256 token.
 *   authHeader  the raw Authorization header value (or null/undefined)
 *   signingKey  the shared secret (FEED_SERVICE_TOKEN_SIGNING_KEY)
 *   opts.now    epoch ms for the exp check (default Date.now())
 * Returns { ok: true, payload } on success, or { ok: false, reason } otherwise.
 */
export function verifyServiceToken(authHeader, signingKey, { now = Date.now() } = {}) {
  if (!signingKey) return { ok: false, reason: "no signing key configured" };
  const m = (authHeader || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, reason: "missing bearer token" };

  const parts = m[1].trim().split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed jwt" };
  const [h, p, sig] = parts;

  let header;
  try { header = JSON.parse(b64urlToBuf(h).toString("utf8")); }
  catch { return { ok: false, reason: "bad header" }; }
  if (header.alg !== "HS256") return { ok: false, reason: `unexpected alg ${header.alg}` };

  const expected = b64url(crypto.createHmac("sha256", signingKey).update(`${h}.${p}`).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "bad signature" };

  let payload;
  try { payload = JSON.parse(b64urlToBuf(p).toString("utf8")); }
  catch { return { ok: false, reason: "bad payload" }; }
  if (payload.exp != null && now / 1000 >= payload.exp) return { ok: false, reason: "expired" };
  if (payload.nbf != null && now / 1000 < payload.nbf) return { ok: false, reason: "not yet valid" };

  return { ok: true, payload };
}

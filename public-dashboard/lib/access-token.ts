const encoder = new TextEncoder();
function encode(data: Uint8Array) { return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function decode(data: string) { return Uint8Array.from(atob(data.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0)); }
async function key(secret: string) { return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }
export async function secretMatches(value: string, expected: string) {
  const signing = await key(expected);
  const signature = await crypto.subtle.sign("HMAC", signing, encoder.encode(expected));
  return crypto.subtle.verify("HMAC", signing, signature, encoder.encode(value));
}
export async function signAccess(secret: string, id = crypto.randomUUID(), now = Date.now()) {
  const payload = encode(encoder.encode(JSON.stringify({ id, expires: now + 7 * 86400000 })));
  const signature = await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(payload));
  return payload + "." + encode(new Uint8Array(signature));
}
export async function verifyAccess(cookie: string, secret: string, now = Date.now()): Promise<string | null> {
  try {
    if (cookie.length > 1024) return null;
    const [payload, signature, extra] = cookie.split(".");
    if (!payload || !signature || extra || !await crypto.subtle.verify("HMAC", await key(secret), decode(signature), encoder.encode(payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(decode(payload)));
    return typeof data.id === "string" && /^[\w-]{16,64}$/.test(data.id) && Number.isFinite(data.expires) && data.expires > now && data.expires <= now + 7 * 86400000 ? data.id : null;
  } catch { return null; }
}

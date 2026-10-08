// PayFast Instant Transaction Notification. Sets the user's plan after a verified payment.
// Deploy with --no-verify-jwt (PayFast does not send a Supabase token). UNTESTED against live PayFast.
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PRICES: Record<string, number> = { pro: 249, business: 599 };
const enc = (v: string) => encodeURIComponent(v.trim()).replace(/%20/g, "+").replace(/%[0-9a-f]{2}/g, (m) => m.toUpperCase());
async function md5(s: string) {
  const d = await crypto.subtle.digest("MD5", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  const sent = params.get("signature");
  // Rebuild the signature string from the fields in the order PayFast sent them.
  const pairs: string[] = [];
  for (const [k, v] of params) if (k !== "signature") pairs.push(`${k}=${enc(v)}`);
  const base = pairs.join("&");
  const pass = Deno.env.get("PAYFAST_PASSPHRASE");
  const expect = await md5(pass ? `${base}&passphrase=${enc(pass)}` : base);
  if (expect !== sent) return new Response("bad signature", { status: 400 });

  // Ask PayFast to confirm the notification is genuine.
  const host = Deno.env.get("PAYFAST_SANDBOX") === "true" ? "sandbox.payfast.co.za" : "www.payfast.co.za";
  const ok = await fetch(`https://${host}/eng/query/validate`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: base });
  if ((await ok.text()).trim() !== "VALID") return new Response("not valid", { status: 400 });

  const plan = params.get("custom_str1") ?? "";
  const userId = params.get("m_payment_id") ?? "";
  const status = params.get("payment_status");
  const gross = parseFloat(params.get("amount_gross") ?? "0");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (status === "COMPLETE" && PRICES[plan] && gross >= PRICES[plan]) {
    await admin.from("profiles").upsert({ user_id: userId, plan, payfast_token: params.get("token"), updated_at: new Date().toISOString() });
  } else if (status === "CANCELLED") {
    await admin.from("profiles").upsert({ user_id: userId, plan: "free", updated_at: new Date().toISOString() });
  }
  return new Response("ok");
});

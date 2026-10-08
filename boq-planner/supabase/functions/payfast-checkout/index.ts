// Returns signed PayFast subscription fields for the signed-in user. The passphrase never leaves the server.
// UNTESTED against live PayFast. Try it with PAYFAST_SANDBOX=true first.
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PLANS: Record<string, { amount: string; name: string }> = {
  pro: { amount: "249.00", name: "BOQ Planner Pro" },
  business: { amount: "599.00", name: "BOQ Planner Business" },
};
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
const enc = (v: string) => encodeURIComponent(v.trim()).replace(/%20/g, "+").replace(/%[0-9a-f]{2}/g, (m) => m.toUpperCase());

async function md5(s: string) {
  const d = await crypto.subtle.digest("MD5", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401, headers: cors });
    const { plan } = await req.json();
    const p = PLANS[plan];
    if (!p) return new Response(JSON.stringify({ error: "Unknown plan" }), { status: 400, headers: cors });

    const site = Deno.env.get("SITE_URL")!; // where the app is hosted, e.g. https://you.github.io/boq-planner/
    const fields: [string, string][] = [
      ["merchant_id", Deno.env.get("PAYFAST_MERCHANT_ID")!],
      ["merchant_key", Deno.env.get("PAYFAST_MERCHANT_KEY")!],
      ["return_url", site + "?paid=1"],
      ["cancel_url", site],
      ["notify_url", Deno.env.get("SUPABASE_URL") + "/functions/v1/payfast-itn"],
      ["email_address", user.email ?? ""],
      ["m_payment_id", user.id],
      ["amount", p.amount],
      ["item_name", p.name],
      ["custom_str1", plan],
      ["subscription_type", "1"],
      ["recurring_amount", p.amount],
      ["frequency", "3"], // monthly
      ["cycles", "0"],    // until cancelled
    ];
    const qs = fields.filter(([, v]) => v !== "").map(([k, v]) => `${k}=${enc(v)}`).join("&");
    const pass = Deno.env.get("PAYFAST_PASSPHRASE");
    const signature = await md5(pass ? `${qs}&passphrase=${enc(pass)}` : qs);
    const action = Deno.env.get("PAYFAST_SANDBOX") === "true" ? "https://sandbox.payfast.co.za/eng/process" : "https://www.payfast.co.za/eng/process";
    return new Response(JSON.stringify({ action, fields: Object.fromEntries(fields.filter(([, v]) => v !== "")), order: fields.filter(([, v]) => v !== "").map(([k]) => k), signature }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});

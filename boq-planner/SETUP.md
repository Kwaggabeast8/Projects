# Turning on accounts and monthly billing

Everything here has free sign-up. The app works without any of it (local-only). Do these once, in order.
The billing code is **untested against live PayFast**. Use the sandbox first and make one test payment before taking real money.

## 1. Supabase (accounts and cloud sync)
1. Create a free project at supabase.com.
2. SQL editor: paste and run `supabase/schema.sql`.
3. Authentication → Providers → Email: keep it on. Decide whether to require email confirmation.
4. Project settings → API: copy the **Project URL** and the **anon public** key into `config.js`.

## 2. PayFast (monthly subscriptions)
1. Register a merchant account at payfast.co.za. Subscriptions must be enabled on the account. Start with the sandbox account at sandbox.payfast.co.za.
2. Settings → Security: set a **passphrase**.
3. Note the merchant ID and merchant key.

## 3. Deploy the two functions
Install the Supabase CLI, then from this folder:

```
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set PAYFAST_MERCHANT_ID=... PAYFAST_MERCHANT_KEY=... PAYFAST_PASSPHRASE=... \
  PAYFAST_SANDBOX=true SITE_URL=https://YOUR-SITE/boq-planner/
supabase functions deploy payfast-checkout
supabase functions deploy payfast-itn --no-verify-jwt
```
Set `PAYFAST_SANDBOX=false` when you go live.

## 4. Host the app
Put `index.html` and `config.js` on any static host (GitHub Pages, Netlify, Cloudflare Pages). It must be https so "Use my location" works.

## 5. Check it end to end
1. Create an account in the app, then open Plans and press Subscribe to Pro.
2. Pay with the PayFast sandbox. PayFast calls `payfast-itn`, which sets your plan to `pro`.
3. Back in the app press **Refresh my plan**. Cloud sync turns on.
4. Cancel the subscription in PayFast. The plan returns to `free`.

## What is and is not enforced
- **Cloud sync is enforced by the database.** Row-level security only lets Pro and Business accounts write their workspace, so a user cannot grant themselves sync by editing the page.
- **Project limits, exports and printing are not enforced.** They run in the browser, so a technical user can bypass them. This is normal for a front-end-only app. If it matters later, move those features behind the server.
- Plan prices (R249 and R599) are in `supabase/functions/payfast-checkout/index.ts` and `payfast-itn/index.ts`. Change both together. The "Business" plan features (team seats, shared supplier book) are not built.
- Conflicts between devices: the most recent change wins.

## Before you charge customers
- Publish terms of use and a privacy policy (POPIA applies), and say supplier prices are indicative.
- Check PayFast's current fees and what they need from you to approve a subscription merchant.

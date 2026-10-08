# BOQ Planner

A single-page web app for builders. Read a bill of quantities, build the programme, find the cheapest suppliers near the site, and see whether the job is making or losing money.

Open `index.html` in a browser. There is nothing to install and no server. Data is kept in the browser (localStorage) on the device you use.

## What works now

- **BOQ import** from Excel, CSV, Word tables, text PDFs, scanned PDFs, photos, or pasted text. Scans and photos use free in-browser text recognition (Tesseract), so the preview must be checked before importing. Readers load from a CDN on first use, so the first scan needs internet. Lines are sorted into work sections and supplier categories automatically, and can be edited.
- **Programme** with critical path, start date, crew pace, rain allowance, the December builders' break, and per-phase duration overrides.
- **Suppliers**: your own supplier book, a price table, ranking by saving against BOQ rates, quote-request emails with email and WhatsApp links, map search links for more suppliers near the site, "use my location".
- **Price-list import** (Pro): upload or paste a supplier price list and match it to BOQ lines.
- **Profit and loss**: contract price from mark-up, paid amounts per line (falling back to best quote, then budget), site running costs for the whole duration including delay, variations, VAT view, and a spend-over-time chart.
- **Report**: summary, print/PDF, CSV exports (Pro), backup and restore.
- **Plans screen**: Free and Pro/Business tiers. Plan switching is a demo flag only.

## Not built yet

- Live accounts and payments. The code for sign-in, cloud sync and PayFast monthly billing is written (`supabase/`, `config.js`) but needs your own Supabase and PayFast accounts. See `SETUP.md`. The billing code has not been tested against live PayFast.
- Automatic live prices. Merchants rarely publish machine-readable prices, so prices come from price lists and quotes you enter.
- Supplier distances from coordinates. Distance is typed in per supplier; location only centres map searches.

## Turning it into a monthly subscription

1. Host the files on any free static host (GitHub Pages, Netlify, Cloudflare Pages). Location needs https.
2. Add accounts and storage (for example Supabase or Firebase, both have free tiers) so data follows the user across devices.
3. Add billing through a South African provider such as PayFast or Paystack, or Stripe. Sign-up is free but each transaction has a fee, and it needs your business details.
4. Move the plan checks (`pro()` in `index.html`) to the server so they cannot be bypassed in the browser.
5. Publish terms, a privacy policy (POPIA) and a note that supplier prices are indicative.

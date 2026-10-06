# Madhaus Nutrition – Shopify theme

Custom Online Store 2.0 theme. Black base, red accents/buttons, neon green-yellow prices.

| Role | Colour | Where to change |
|---|---|---|
| Background | `#0a0a0a` | Theme settings → Brand colours |
| Accent (red) | `#e10600` | Theme settings → Brand colours |
| Price (neon) | `#c8ff00` | Theme settings → Brand colours |

## Get it live

1. Create a store at shopify.com (a trial is fine).
2. **Option A – upload:** zip the *contents* of this folder (so `layout/`, `sections/` etc. are at the zip root), then Shopify admin → Online Store → Themes → Add theme → Upload zip file → Publish.
3. **Option B – Shopify CLI:** `npm i -g @shopify/cli`, then from this folder run `shopify theme dev --store your-store.myshopify.com` to preview, and `shopify theme push` to deploy.
4. In the theme editor: upload your logo and favicon, add a hero image, and add your social links.

## Store setup checklist

- Create a **Best Sellers** collection and pick it in the homepage "Featured collection" section.
- Menus (Online Store → Navigation): `main-menu` (Shop, Our Story, Contact...) and `footer`.
- Optional product metafield `custom.supplement_facts` (rich text / file) shows a "Supplement facts" accordion on product pages.
- Add real policies (shipping, refund, privacy) and review the FDA disclaimer in the footer for your products and region.

## Structure

- `layout/theme.liquid` – page shell, loads colours from settings
- `sections/` – header, footer, hero, marquee, featured collection, benefits, image-with-text, newsletter, plus `main-*` sections for product, collection, cart, search, blog, page and 404
- `templates/` – JSON templates (all sections can be rearranged in the theme editor)
- `assets/base.css`, `assets/theme.js` – styling and small bits of JS (mobile menu, variant picker, quantity)

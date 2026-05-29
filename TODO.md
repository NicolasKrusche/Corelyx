# Corelyx — TODO

## Trust & Landing Page

- [ ] **Founders / About page** (`/about`)
  - Photos, names, and short bios of founders
  - Company origin story ("Built in Austria")
  - Link from footer nav and header nav
  - Helps enterprise buyers verify who is behind the product

## SEO

- [ ] **Improve SEO structure** across `/academy`, `/blog`, `/docs`, `/compare`, `/templates`, `/use-cases`, `/integrations`, `/industry`
  - Better heading hierarchy (H1 → H2 → H3)
  - JSON-LD structured data (Article, HowTo, FAQPage schema) on content pages
  - Breadcrumb nav + BreadcrumbList schema markup
  - OpenGraph images per section (not just the global one)
  - Review internal linking density — more cross-links between related pages
  - Check canonical URLs are correct on all dynamic routes
  - Review meta descriptions for uniqueness and click-worthiness

- [ ] **Academy course content** — real step-by-step tutorials with Corelyx-specific workflow steps, node types, and example schemas (keep public, no auth wall)
  - Sit down with product to verify what nodes/connectors are actually available
  - Start with: "Build a GDPR DSAR workflow", "Build an AI Act review checkpoint", "Build a human approval gate"

## Done

- [x] Add Contact link to header nav (mailto:support@corelyx.app)
- [x] Add Trust Center link to footer nav (`/trust`)
- [x] Show governing law in footer legal block
- [x] Show support email in footer

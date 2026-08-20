# PENNIO — reconciled repo (this pass)

Base: `index-24.html` (the most evolved draft in the project files), reconciled against
the **live** `index.html` at github.com/pennio-design/pennio-design.github.io/blob/master/index.html.

## What was live vs. what's in this repo now

The live site is running an **older, partially-broken state**:
- Apply form had no real submit handler wired up in a way that reliably worked (index-24 fixed this — AJAX POST, honeypot, inline validation, error state).
- Meta Pixel loaded render-blocking in `<head>` (index-24 defers it to `window.load`).
- No `robots.txt`, `sitemap.xml`, or `site.webmanifest` existed (added here).
- Work grid mixed three real client case studies with two "Live" links to pages that were never confirmed to resolve (`/letscreate`, `/KnowledgeGraph`) plus an unlabeled AI-language-preservation project — all under one undifferentiated grid, which blurs "creative agency" into "AI lab" on first impression.
- FAQ existed as a section but wasn't in the desktop nav.

## What I fixed to make this deployable today

1. **Form now actually works.** Pointed `action` at the FormSubmit endpoint ID that's already active and confirmed on the live site (`ea0da421e8e6e82457be40792262eeed`) instead of the unfilled placeholder email that was in index-24. This is the one line that determines whether a single lead gets captured — I did not leave it as a TODO.
2. **Client work leads, studio products follow.** Jojo Jewels / Tabitha / PENNIO itself stand alone as the primary proof grid. KnowledgeGraph, The Let's Create Network, and Ogbifọ moved to a secondary "Also from the studio" strip — visible, still linked, not competing for the first impression.
3. **`sitemap.xml`** only lists the homepage. `/letscreate` and `/KnowledgeGraph` are commented out until confirmed live — an agency selling "we don't ship what doesn't work" cannot have a sitemap that 404s.
4. Deferred Meta Pixel, `decoding="async"` on below-fold images, `prefers-reduced-motion` support, visible focus states, FAQ added to both nav menus, root-absolute image paths.

## What I did NOT fabricate

- **`/letscreate` and `/KnowledgeGraph` page content.** Nothing in this project contains their actual copy, layout, or curriculum. I did not invent an academy page and ship it under your brand — that would be exactly the "assembled, not built" problem the homepage itself calls out. If you want these built, send me the real program structure (tracks, pricing, instructors, outcomes) and I'll build them to the same design system.
- **Client photography, logo files, favicons.** Referenced by path (`/jojo-jewels-brand-identity.webp`, `/logo.png`, etc.) exactly as the live site does. I have no access to the actual binary assets — confirm they exist at those paths before deploy or the placeholders (initials on a dark card) will show instead.
- **The FormSubmit inbox this hashed ID actually delivers to.** I reused the live ID because it's proven active, but I can't verify from here whose inbox that is. Confirm it's still monitored.

## Before you deploy

- [ ] Confirm `ea0da421e8e6e82457be40792262eeed` still delivers to a monitored inbox (FormSubmit IDs can be reset).
- [ ] Confirm `/letscreate` and `/KnowledgeGraph` resolve, or point those chips somewhere real (Instagram, a waitlist) until they do.
- [ ] Confirm the "3 new projects per month" and "48 hours" capacity claims are still true — these are live commitments, not decoration.
- [ ] Drop real image assets at the referenced paths.

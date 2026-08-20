# PENNIO Motion Graphics System

11 real, rendered assets + a reusable engine + a 30-item spec catalog. Everything in
here is an actual MP4/GIF, not a mockup — rendered server-side via Python (cairosvg)
+ ffmpeg. No headless browser, no paid morph plugin, no external CDN dependency.

## What's actually rendered right now (11)

| File | Concept | Suggested use |
|---|---|---|
| `pennio-logo-morph.mp4/.gif/.webm` | P-mark ⇄ full wordmark, seamless loop | Loading screen, video open/close, splash |
| `rendered/connection-orbit.*` | Orbit rings, rotating node | "Systems thinking" diagram beats |
| `rendered/orbit-strategy-loop.*` | Strategy→Identity→Web→Campaign→Feedback | Renders the Diagram Reel already scripted in your social pack (content id 08) |
| `rendered/cta-pulse-glow.*` | Radial pulse | Behind CTA buttons |
| `rendered/apply-badge-dot-pulse.*` | Small live-status dot | "5 questions, 5 minutes" badge |
| `rendered/growth-bars.*` | Bars build in | Stats reveal, case-study opens |
| `rendered/skyscraper-count-city.*` | Extended bar build | Full video-open version of the above |
| `rendered/wordmark-wipe.*` | Text wipe reveal | End-card / social outro |
| `rendered/ring-donut-accent.*` | Rotating pulse ring | FAQ reel per-question motif |
| `rendered/grid-floor-breathe.*` | Perspective grid, breathing opacity | Section background ambience |
| `rendered/radial-glow-breathe-asset.*` | Atmosphere glow breathe | Behind the mark, atmosphere layer |

The **nav logomark idle-breathe** (item #21 in the catalog) is live now — pure CSS in
`index.html`, 18px is too small for the full morph choreography to read, so it gets a
whisper-subtle scale pulse instead. Respects `prefers-reduced-motion`.

## Why only 11 of 30 are rendered, not all 30

This engine draws pure vector geometry (rings, bars, type, grids) — it does not have
access to the actual 16-asset "liquid glass" 3D render pack (`sphere-orange-glossy.png`,
`glass-panels-trio.png`, etc.) referenced throughout your other project files. Those
are Photoshop/3D-render outputs that were never uploaded as actual image files, only
referenced by filename. The other 19 catalog entries are fully specced (motion type,
duration, easing, use case) and tagged `spec_pending_asset` — the moment you hand me
the real asset PNGs, this same `engine.py` renders them the same way, no rebuild needed.
5 more are tagged `spec_pending_engine` (need one more builder function each — count-up
numbers, staggered card reveals) and 2 are `already_live` (FAQ +/× rotate, proof-card
hover lift) — just documented here so the full system is in one place.

## How to render more

```bash
pip install cairosvg --break-system-packages
python3 engine.py pennio-motion-catalog.json ./output
```
Add a new motion type by writing one function (see `b_orbit_rotate` etc. in
`engine.py` for the pattern) and registering it in `BUILDERS`.

## Format notes

- **GIF** — universal, no video tag needed, larger file size. Fine for social/Slack, not ideal for site performance.
- **MP4 (h264)** — smallest, fastest, needs a `<video>` tag. Use this on the actual website.
- **WebM (VP9, alpha)** — only rendered for the flagship logo (transparent background), for compositing over any section color without a hard rectangle.

Site embed for the flagship loop:
```html
<video autoplay loop muted playsinline poster="/pennio-logo-morph-poster.png" style="width:240px">
  <source src="/pennio-logo-morph.webm" type="video/webm">
  <source src="/pennio-logo-morph.mp4" type="video/mp4">
</video>
```

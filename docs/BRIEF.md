# VirtuBrain by Verantis: build brief

This is the source of truth for every agent building or reviewing the new virtubrain.ai. Read it fully before touching code.

## 1. What we are making

A flagship marketing site plus an integrated web app, at the level of craft of apple.com product pages
(think the iPhone Pro or AirPods Pro pages): confident type, a hero product filmed in a dark studio, scroll-driven
film scenes, bento highlight tiles, horizontal galleries, sticky local navigation, and nothing generic.
The client's words: "make the site a $100,000 website and app". A panel of harsh critics will score it; the bar is
9/10 or better on every dimension.

**Brand architecture**
- **VirtuBrain** is the product: a process instrument for the enterprise operating model. It maps 13 business
  functions down to 2,965 individual steps, calibrated by industry and country, and pins known failure points
  (pain points) to the exact step. It is the hero of the site and the thing users open in `/app/`.
- **Verantis** is the practice that built it and sells the work around it: an operating-model advisory practice
  for finance, HR and shared services (name from Latin *verus*, true). Always written "VirtuBrain by Verantis" in
  the brand lock-up.
- Do NOT mention "Process Reinvention Hub" anywhere, and do not say VirtuBrain is a new name for anything.
  (The client asked for that section to be removed.)

**Two audiences**
1. Enterprise finance and shared-services leaders (CFO, controller, GBS head). They need credibility, specificity
   and controls an auditor can follow.
2. Small and mid-sized businesses who want an AI assistant (customer support, staff help desk, bookings/orders).
   They need plain language, a clear first step and reassurance a person stays in charge.

## 2. Facts you may use (do not invent others)

Data (from the live VirtuBrain platform; the snapshot is in `public/data`):
- 13 business functions, 53 process groups, 142 Level 3 processes, 295 activities (L4), 590 tasks (L5), 2,965 steps (L6).
- 6 industries: retail, technology, insurance, banking, hotel and hospitality, manufacturing. 3 countries: Philippines, United States, Singapore.
- Every process has: description, trigger ("starts when"), output ("produces"), industry lens notes, country notes, typical systems, representative KPIs, and an L4 to L6 breakdown.
- 13 flagship processes carry curated step detail (`meta.flagshipProcesses`), e.g. 4.4.1 Manage Warehouse Operations, 8.1.1 Execute Period-End and Continuous Close.
- Pain-point library: 362 records (78 high, 145 medium, 139 low severity) in 8 categories: handoff friction 71, data quality and system friction 68, automation gap 51, exception volume 45, control and compliance gap 38, resource contention 38, rework loops 37, bottlenecks 14. Each is tied to a function, process, activity, task and step index, with a title, severity, category and an impact statement.
- **Honesty rule:** the pain-point library is illustrative. It was synthesized against the real taxonomy in the style of process-mining risk registers. Wherever pain-point numbers appear, a nearby line must say so (e.g. "Illustrative library, modelled on process-mining conventions. In an engagement it is filled with your own evidence.").

Verantis:
- Founded and led by Ver Villarico, a Consulting Director at Accenture (he prefers this title in external material). Background: process transformation at process-classification-framework level (record-to-report, procure-to-pay, order-to-cash), global business services and shared-services delivery, enterprise ERP ecosystems. The practice carries its own methods for agentic AI governance, audit-grade verifiability and continuous close.
- Based in Manila; works with clients in the Philippines, the United States and Singapore.
- Contact: vervillarico23@gmail.com (single constant; keep it in one place per file).

Offers (enterprise):
- **Agentic Close Assurance, 100 days.** One entity, one close. Map the close into zones, put agents on reconciliations and matching that can be checked against records, build the evidence trail controllers and auditors test. You get: a zone map of your close; agent-run reconciliations with logged checks; a control matrix ready for audit testing; a runbook and handover.
- **Agentic Supplier Invoice and Payment, pilot.** Invoice intake to payment proposal for one country or business unit. Agents capture, code and match; exceptions go to analysts with the reason attached. You get: a country exception inventory; matching and tolerance rules; an exception queue design; before-and-after measures from your own data.
- **Agent Governance Design, framework.** For teams with agents or copilots already in production. Autonomy set by how verifiable the work is; each agent action leaves defined evidence. You get: autonomy tiers by process step; an evidence and logging standard; roles for review and override; a pack internal audit can work from.
- **Team Enablement, training.** Practical AI fluency for finance, HR and shared-services teams; people practise on their own work in tiers with coaching. You get: a tiered curriculum by role; hands-on practice with feedback; a leader briefing on agentic operating models.

Offers (growing businesses):
- Customer support assistant (orders, bookings, prices and policies from your own records, on your website or chat channels, at any hour; hands over to staff).
- Staff help desk assistant (HR and operations questions from your handbook and policies).
- Booking and order assistant (takes bookings, confirms orders, sends updates, connected to the calendar or order system you already use).
- How it starts: one call to choose the first job; a written scope before any work begins; a working assistant your team has tested before customers see it.

How engagements run (4 moves, a real sequence so numbering is fine): **Calibrate** (lay your model against the taxonomy for your industry and country, agree scope), **Diagnose** (find steps where work stalls, tie each finding to its step), **Redesign** (decide per step: agent alone, agent drafts for approval, or people; design the controls and evidence), **Run** (stand up the new model, measure against the KPIs agreed at the start).

The three zones (the core idea, used everywhere): **Auto** (teal): output can be checked against a record, so an agent runs it and the check is logged. **Assist** (cobalt): output needs judgment to confirm, so an agent drafts and a person approves. **Human** (rose): accountability can't be delegated, so people decide and agents prepare.

Principles: Name the step, not the theme. Automate what can be checked. Evidence before scale. No promised percentages (we don't quote improvement figures until we have measured your process with your data). People stay accountable. One process first.

Insights (short essays, may appear on /verantis/): The verifiability gradient (autonomy follows how easily work can be checked); Token-bound capacity (shared services scaled by headcount; agent capacity scales with compute; changes pricing, peak planning, service levels); The continuous close (month-end is a batch because checking was expensive; when agents reconcile daily with evidence, most of the close is done before period end, leaving judgment, explanation and sign-off).

Do not invent: client names, logos, testimonials, improvement percentages, prices, team members, awards, certifications.

## 3. Art direction

**Concept: an instrument photographed in a dark studio.** The page is the studio. Dark sections use the Atlas film's
near-black green (`--void #020c09`) so footage bleeds into the page with no visible edge. Light chapters use the Monolith
film's fog grey (`--fog #d9e1e3`). Verantis has its own navy-and-brass world. Sections declare a world with a class
(`w-void w-ink w-teal w-fog w-light w-paper w-navy`) and every component colours itself from the semantic tokens in
`src/styles/tokens.css`. Signal colours always mean the same thing: teal/cobalt/rose = auto/assist/human; tick red = a fault
(pain point, high severity); amber = medium severity.

Type: Schibsted Grotesk (variable, self-hosted) for everything; IBM Plex Mono for labels, process codes (4.4.1.2), counts and
data. Apple-scale headlines (`.t-hero`, `.t-display`) with tight tracking; short lines; lots of air. One idea per screen.

Apple patterns to use (where they serve the story, not all at once):
- Scroll-scrubbed films pinned to the viewport with text beats (`src/lib/film.ts`, `.film` markup documented in that file).
- A sticky local nav under the global header on long pages (section links that highlight as you scroll).
- Bento "highlights" grids of rounded tiles (radius 18 to 28px) mixing big numbers, stills and one-line claims.
- Horizontal media galleries with scroll-snap and previous/next paddle buttons.
- Feature toggles (pressing a chip swaps an image and caption with a soft crossfade).
- Ambient video loops with a visible pause button (`video[data-loop]`, handled by `hydrateLoops`).
- Count-up numerals, line-by-line headline reveals, gentle parallax on stills. Motion is quiet, eased, purposeful.

Avoid: centred-everything layouts, purple gradients, emoji, stock-photo clichés, generic SaaS cards with an accent bar, walls of
identical cards, fake dashboards, "AI sparkle" icons, any copy that sounds like marketing filler.

## 4. Media you must use

All media came from the client's own Higgsfield generations and is processed in `public/media`.
`src/media-catalog.json` lists everything. Contact sheets: `docs/reference/stills-all.jpg` (ids under each thumb map to the
names below), `docs/reference/videos.jpg` (rows top to bottom: monolith, office, dial, lanes, atlas).

Films (scroll-scrubbed, 120 frames each, `d` 1440/1276px and `m` 720/638px sets):
- `atlas`: 13 smoked-glass plates rise from a closed stack into a lit tower (dark). The home hero.
- `monolith`: a frosted-glass monolith opens into levels that light teal, with red fault lines (fog grey, light). "Down to the step / where it breaks".
- `lanes`: scattered tiles drift into three lanes lit teal, cobalt, rose (teal void). The three zones.
Loops: `dial` (a dial's needle sweeps; calibration), `office` (a quiet shared-services floor at night).
Icons: 13 function line icons at `/media/icons/<functionId>.webp` (teal line on transparent; on dark use them as a CSS
mask so they take `currentColor`) plus `vb-monogram`.

Stills (54). Every one must appear somewhere on the site; the allocation below is a starting point:
- Home: atlas-tower, atlas-closed, atlas-closed-low, atlas-tower-tall, atlas-plate-wide, glass-levels, titanium-dial, three-dials,
  teal-dial-slate, three-channels, lanes-still, monolith-exploded, monolith-closed, maquette-city, ledger-glow, titanium-line,
  ss-floor-dusk, bakery-owner, atlas-diptych.
- Enterprise: controller-reconciliation, night-office, cbd-aerial, ledger-texture, atlas-flowchart-macro, atlas-flowchart-wide,
  atlas-flowchart-angle, atlas-clipped, tickmarks-1, tickmarks-2, brass-ruling-pen, limestone-ruler, atlas-plate.
- Growing businesses: cafe-owner, bakery-owner, desk-bell, brass-bell, limestone-tile, team-workshop, three-channels.
- Verantis: brass-notebook, brass-bars, brass-line, brass-ruler, paper-dial, paper-dial-portrait, blueprint-plate-1,
  blueprint-plate-2, exploded-dial, manila-workshop, cbd-aerial, teal-dial-magnifier.
- App: function icons, atlas-plate-square, atlas-book, atlas-stepped, atlas-columns, atlas-blocks, atlas-fanned (empty states,
  view headers, X-ray illustration).
Sizes: people photos are only 1024px wide; never show them wider than ~700 CSS px. Use `<img data-still="name">` (alt comes from the
catalog) or `picture()` from `src/lib/media.ts`. Never hotlink anything external.

## 5. Information architecture

Every page is a real HTML file (works on any static host, deep links load directly).
- `/` Home: the product story (see 6).
- `/app/` The VirtuBrain app (see 7). Deep links via hash: `#view=explore&fn=...&p=...&ind=retail&cty=PH`, `#view=pain&...`, `#view=xray&p=...`.
- `/enterprise/` Finance and shared services: the 4 offers in depth, how engagements run, what you get, FAQ, CTA.
- `/business/` Growing businesses: 3 assistants, how it starts, what stays human, FAQ, CTA.
- `/verantis/` The practice: who, why the name, principles, founder, insights (3 essays), approach, CTA.
- `/contact/` Form (name, work email, company optional, "I'm interested in" select, function optional, message), direct email, what happens next.
- `/404.html` On-brand not-found that also redirects old URLs (/solutions -> /business/, /services -> /enterprise/, /blog -> /verantis/#insights, /about -> /verantis/, /explore -> /app/, /pain-points -> /app/#view=pain, /platform -> /app/, /approach -> /enterprise/#approach, /practice -> /verantis/).

Global header and footer are partials (`src/partials`), injected at build. Body `data-nav` marks the current item.

## 6. Home page story (Apple product-page structure)

1. **Hero film (atlas, w-void, ~420vh).** Beats: (a) eyebrow "VirtuBrain by Verantis", headline "Find the step where your operating model breaks." with CTAs "Open the app" and "Talk to us"; (b) "13 business functions."; (c) "142 processes. 2,965 steps."; (d) "362 known failure points, pinned to the step." + illustrative note. Progress bar. Mobile uses the `m` frames and a shorter height.
2. **Highlights bento.** Big numbers and one-line claims, with atlas stills. Link "Open the app".
3. **Calibrate (dial loop).** "Calibrated to your industry and country." A live lens demo using real data: industry and country chips swap the actual lens and country notes for a flagship process (8.1.1 period-end close is a good default).
4. **Down to the step (monolith film, w-fog).** Beats walk Level 1 -> 3 -> 4/5 -> 6, ending with red fault lines = pain points, then a real pain-point record from the data. CTA into `/app/#view=explore&p=...`.
5. **Three zones (lanes film, w-teal).** "Sort every step by who should run it." Then an interactive zone map: tabs for Month-end close / Supplier invoices / Customer support showing real-sounding steps in Auto/Assist/Human columns with the check for each (reuse the copy from the previous site build: see `docs/previous-site.html`). CTA "X-ray a process" -> `/app/#view=xray`.
6. **Thirteen functions gallery.** Horizontal snap gallery of 13 cards (icon, name, groups and process counts from data), each opening that function in the app.
7. **Two ways in.** Enterprise (office loop / ss-floor-dusk) and Growing businesses (bakery-owner), each with 3 points and a link.
8. **Verantis band (w-navy).** Who built it, principles, founder line, link to /verantis/.
9. **Closing CTA** ("Bring the process that keeps breaking. We'll show you the step where it breaks.") + footer.

## 7. The app (`/app/`): VirtuBrain, integrated

Rebuild the VirtuBrain platform's explorer inside this site (reference: `docs/reference/live-app-explorer.jpg`,
`live-app-flow.jpg`, and the old demo code at `/tmp/claude-0/-home-claude-virtubrain/c4e42532-4bda-56e9-a343-3293907219c5/scratchpad/src/src/assets/demos.js`). Preact + signals, own CSS (`src/styles/app.css`),
data via `src/lib/data.ts` (you own and may extend that file). The app should feel like a premium tool (Linear, Things, Apple
Numbers), not a web page: fixed app chrome under the global header, panes, keyboard shortcuts, instant filtering.

Views (tabs in an app toolbar, all deep-linkable, Back/Forward work):
1. **Explore.** Function rail (13 with icons and counts) -> process list grouped by process group (search across all 142,
   `/` focuses search) -> process detail: id, name, description, starts when / produces, industry lens + country note (lens
   switcher in the toolbar), typical systems, KPIs, pain points for the process, and the L4 -> L5 -> L6 breakdown rendered as a
   clean vertical flow (start event, tasks, decision points with their no-branch, end event), with pain points pinned to their
   exact step by severity colour.
2. **Pain points.** Filter by function, category, severity, search; counts update live; each record shows title, impact,
   severity, category and the path (function / process / task / step) and opens that step in Explore. Include the honesty note.
3. **X-ray** (new, the signature feature). Choose any process; every L6 step is sorted into Auto / Assist / Human using
   `zoneOf()` in `src/lib/data.ts` (refine the rules if you can make them better, keep them explainable). Show: a summary
   (share of steps per zone, pain points per zone, a stacked bar), three lanes of steps with "why" on each, pain points pinned,
   and let the user re-assign a step's zone (click or keyboard) with the summary updating. A clear label: "A first-pass sort on
   the wording of each step. Use it to start the conversation, not to decide." Actions: copy a plain-text summary; "Talk to us
   about this process" linking to `/contact/?process=<id>`.
Mobile: panes collapse to a stack with back navigation; everything usable at 390px.
Empty, loading and error states are designed (skeletons, retry). Load the 1 MB taxonomy once; never block first paint.

## 8. Engineering rules

- Stack: Vite multi-page, TypeScript, plain CSS with tokens, Preact only inside `/app/`. GSAP is installed if you need timelines;
  prefer CSS and `src/lib/film.ts`.
- Do not edit `src/styles/tokens.css`, `src/styles/base.css`, `src/lib/film.ts`, `src/lib/media.ts`, `src/lib/site.ts`,
  `src/partials/*` or `vite.config.ts` unless your task says you own them. If you need a change there, say so in your report.
- Own your files: home -> `index.html`, `src/pages/home.ts`, `src/styles/home.css`. Inner pages -> their `index.html`s,
  `src/pages/<page>.ts`, `src/styles/pages.css`. App -> `app/index.html`, `src/app/**`, `src/pages/app.ts`, `src/styles/app.css`, `src/lib/data.ts`.
- Performance: first paint must not wait for films or data. Lazy-load below-the-fold media. No layout shift (width/height on images).
- Accessibility: WCAG 2.2 AA. Keyboard reachable, visible focus, real buttons and links, labels on inputs, `prefers-reduced-motion`
  honoured (films show their poster and stacked beats), contrast checked in every world, video loops pausable.
- Copy: plain, specific, short sentences, active voice. No em-dash asides, no "not X, but Y", no colon-then-reveal, no scare
  quotes, no stock phrases. Name things the way buyers do.
- Verify your work: `npx vite build` must pass; then `npx vite preview` and `node scripts/qa/shoot.mjs qa-output/<you> http://127.0.0.1:4173 --pages=<yours>`
  and LOOK at the screenshots (Read the jpgs). Fix what you see. Zero console errors, zero failed requests, zero serious axe
  violations, zero horizontal overflow at 390px.

## 9. Round 2 decisions (apply everywhere; these override earlier wording)

Shared foundation changes already made by the lead:
- `src/lib/site.ts`: the menu bug is fixed (it selected `<body data-nav>`); the header now auto-hides and takes a skin from the
  section under it (`data-skin` dark | light | navy on `header.site-nav`, also mirrored on `<html data-nav-skin>`). Give any
  non-world element a skin with `data-skin`. When the menu is open, `main`, `footer` and local navs get `inert`.
- `src/pages/inner.ts` moved to **`src/lib/ui.ts`** and is now the shared UI library for ALL pages (home included):
  `onFrame` (the one rAF scroll/resize loop: register all scroll-linked work here), `initLocalNav`, `initGalleries`, `initTabs`,
  `initFaq`, `initCounts` (real number in HTML + sr-only), `initLines`, `initScrub`, `initSteps`, `initInk`, `initCopy`. Use these
  instead of private re-implementations so motion and components are identical across pages.
- `src/lib/film.ts`: beats are never `inert` (text always stays in the accessibility tree; links in a faded beat leave the tab order
  and the beat gets `.is-off`). Frames load in two phases (key frames when near, the rest when the reader arrives or the page is
  idle); Save-Data or slow connections get the poster only (`.film.is-poster-only`); the frame set upgrades on resize; `--bg`
  is cached. Films register with `onFrame`.
- `base.css`: `.loop-toggle` styles are global; header blur moved to `::before`; world selector is explicit; reveals have no blur.
- `tokens.css`: `--fg-3` now passes 4.6:1 on every surface in every world; fog accent is `#0a6a5c`.
- SEO: canonical, absolute OG image, Twitter tags and JSON-LD are injected at build (vite `seo()` plugin) from each page's
  `<title>` and meta description, so keep titles <= 60 characters and descriptions 120-155 characters. `robots.txt`,
  `sitemap.xml`, `_redirects` (301s for old URLs), `_headers` (caching), `netlify.toml`, `vercel.json` exist in the repo.
- Function icons are now 96px (`/media/icons/<id>.webp`), still masks.

Content and honesty conventions (all pages and the app):
- **US English** everywhere (organization, modeled, center, program, practice as verb and noun, analyze, prioritize).
- Say **"362 illustrative failure points"** or "362 typical failure points", never "known". Wherever a pain-point record or count
  appears, an "Illustrative" label is visible in the same card or line, not a screen away. On marketing pages do not show the
  numeric impact sentences ("an estimated 14 hours", "20% of cases"); show title, category, severity and the step path. In the app,
  every record shows an "Illustrative" chip and its impact line starts with "Illustrative estimate."
- **Do not overclaim the steps.** The honest description: 142 processes broken into 295 activities, 590 tasks and 2,965 steps;
  13 flagship processes carry curated step detail; the rest follow a standard step pattern (receive, prepare, do, check, decide,
  hand off) that an engagement replaces with the client's own steps. Lead the proof with what is genuinely rich: every process has
  notes for 6 industries and 3 countries (852 industry notes and 426 country notes), typical systems and KPIs. Do not say
  "VirtuBrain maps all 2,965 of them" or "opens all the way down to the step" without that qualification.
- Process codes repeat across functions (9.x appears in Marketing/CX, Retail-Specific Operations and Asset & Facilities). Wherever a
  code is shown, show the function name with it, never two same-looking codes side by side without context, and always include
  `fn=` in links.
- Exact offer names everywhere: "Agentic Close Assurance", "Agentic Supplier Invoice and Payment", "Agent Governance Design",
  "Team Enablement". Industry label "Hotel and hospitality" everywhere (use `INDUSTRIES`).
- Principle 06 everywhere: **"One process first."** "Prove it on one close or one invoice flow, then widen."
- No track-record claims ("most clients...", "examples from our zone maps"). Use "We suggest starting with the close." and
  "An example zone map. Yours comes out of the diagnostic."
- Agentic Close Assurance carries the line: "This is not an audit or assurance engagement. Your auditors test the controls; we
  build them and the evidence."
- Enterprise FAQ adds (flagged to the client for confirmation): "What happens to our data?" -> "We agree data access, where agents
  run and how evidence is stored in the written scope, before anyone touches your systems." and "How is it priced?" -> "We quote in
  writing after the first call, against the scope we agree. No quote depends on promised savings."
- The zone story in one line: "Sort each step by how its output can be checked."

## 10. Round 3 decisions

Foundation (lead, committed):
- `onFrame({ read, write })` in `src/lib/ui.ts`: all reads run before all writes across the page; a plain function still works
  (runs after). Frames are skipped when neither scroll nor size changed; call `requestFrame()` after content changes size.
  Convert your scroll work to the two-phase form.
- `skinAt(x, y, ignore)` now uses a cached map of world sections (no hit-testing per frame). The header uses it.
- Films load the full frame set only after the reader starts scrolling into the film (or after 6 s idle on a fast connection).
- Brand font is preloaded; `favicon.ico`, `og-business.jpg` (used automatically for /business/: any `public/og-<slug>.jpg` is
  picked up), sitemap lastmod, more 301s and Vercel headers exist.

Shared wording (use exactly, everywhere including the app):
- Standard pattern: "a standard five-step pattern: confirm the inputs, do the task, check the output, decide whether it is
  complete, then log and hand off." Short form in tight UI: "standard five-step pattern".
- Flagships: "13 of 142 processes are flagships. In each one, one task carries curated, step-by-step detail." Never "curated detail
  for every step".
- Body copy says "failure points" ("362 illustrative failure points"); the feature is called the "Pain-point library".
- When a step's text equals its task name, show "Step N of 5: the task itself".

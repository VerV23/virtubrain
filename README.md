# virtubrain.ai

The VirtuBrain by Verantis website and the VirtuBrain app (`/app/`), built as a static multi-page site.

- **VirtuBrain** is the process instrument: 13 business functions, 142 processes and 2,965 steps, calibrated by industry
  and country, with an illustrative library of 362 failure points pinned to the step, and the X-ray view that sorts each step
  into Auto, Assist or Human.
- **Verantis** is the operating-model advisory practice that builds and runs it.

## Run it

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # writes dist/ (runs scripts/build-summary.ts first)
npm run preview    # serves dist/ on http://127.0.0.1:4173
npm run typecheck
```

Requires Node 22+. Python 3 with ImageMagick and ffmpeg is only needed to reprocess media.

## Deploy

`dist/` is plain static files and works on any host. Every page is a real HTML file, so deep links load directly.

- **Netlify:** connect the repo; `netlify.toml` sets the build. `public/_redirects` sends old virtubrain.ai addresses to their
  new pages with 301s, `public/_headers` sets caching and security headers, and the contact form uses Netlify Forms
  (`name="talk"`). Turn on form notifications in Netlify so enquiries reach the inbox.
- **Vercel:** `vercel.json` carries the same redirects and headers. The contact form falls back to opening the visitor's email
  app, because Netlify Forms is Netlify-only; connect a form service if you host elsewhere.
- **Anywhere else:** upload `dist/`, set `404.html` as the not-found page (it also redirects old addresses in the browser).

## Where things live

| Path | What |
|---|---|
| `index.html`, `enterprise/`, `business/`, `verantis/`, `contact/`, `404.html` | Marketing pages |
| `app/index.html`, `src/app/` | The VirtuBrain app (Preact) |
| `src/styles/tokens.css` | Colors, type and spacing tokens, and the section "worlds" |
| `src/styles/base.css`, `components.css` | Global styles and shared components |
| `src/lib/film.ts` | Scroll-scrubbed films (image sequences on a canvas) |
| `src/lib/ui.ts` | Shared behaviors: the frame loop, local nav, galleries, tabs, FAQ, count-ups, reveals |
| `src/lib/data.ts` | Taxonomy and pain-point loading, search index, zoning rules, wording helpers |
| `src/partials/` | Header and footer, plus `gen-home-*.html` generated at build time |
| `public/data/` | Snapshot of the VirtuBrain platform data, plus build-time digests |
| `public/media/` | Processed stills, film frames, loops and function icons |
| `docs/BRIEF.md` | The creative and engineering brief, including every content decision |

## Refresh the data

The site ships a snapshot of the platform data from virtubrain.higgsfield.app. From a machine that can reach it:

```bash
npm run sync-data && npm run build
```

## Media

All stills and films come from the client's own Higgsfield generations. To reprocess them, put the masters in `.masters/`
(`still/`, `video/`, `icon-cutout/`, `data/`) and run `npm run media`. Outputs go to `public/media` and `src/media-catalog.json`.

## Before launch

- Replace the Gmail contact address with a domain mailbox (it appears in the footer partial and the contact page).
- Confirm the founder line about Accenture and who staffs engagements.
- Confirm the data-handling and pricing FAQ answers on /enterprise/.
- Test a real form submission on the production host.

## Known follow-ups (not launch blockers)

- Films fill about 1,350px of a 1920px screen because the source clips are 1284px wide. Upscaling the lanes and monolith
  clips (Higgsfield `upscale_video`), re-exporting the desktop frames at 1920px and raising the size cap would fill it.
- Some component classes (`rec*`, `zbar`, `sevbar`, `chips`, `kpis`, `code`, `badge`, `fn-ico`, `note`, `tick`, `copy-btn`,
  `chev`) are styled separately in `home.css` and `app.css`; they could move into `components.css` with modifiers.
- On a mid-range phone (4x CPU throttle) the switch into the X-ray view takes about 200 ms; rendering its lanes in idle
  chunks would bring it lower.

/* Home page behavior. Everything here enhances markup that is already complete in index.html (the
   data-bound parts are rendered at build time by scripts/build-summary.ts), so the page paints fully
   with no JS and no data. The only data the home page fetches is /data/summary.json (~37 KB).
   All scroll-linked work runs on the shared onFrame loop from ui.ts. */
import "../styles/base.css";
import "../styles/home.css";
import { boot } from "../lib/site";
import { onFrame, initLocalNav, initGalleries, initTabs, initCounts, initLines, initInk } from "../lib/ui";
import { INDUSTRIES, COUNTRIES, CATEGORY_LABELS, type Industry, type Country, type Zone } from "../lib/data";
import catalog from "../media-catalog.json";

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmt = (n: number) => n.toLocaleString("en-US");
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Run fn once when el comes within `margin` of the viewport. */
function whenNear(el: Element | null, fn: () => void, margin = "900px 0px") {
  if (!el) return;
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: margin });
  io.observe(el);
}
/** Soft crossfade for content that has just been replaced. */
function fadeIn(els: (Element | null)[]) {
  if (reduce) return;
  for (const el of els) el?.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
}

/* ---------------------------------------------------------------------------------------------
   The build-time digest (scripts/build-summary.ts): the home page never downloads the full taxonomy
   --------------------------------------------------------------------------------------------- */
type Rec = { id: string; fn: string; fnName: string; pid: string; pname: string; tid: string; tname: string; step: number; stepText: string; title: string; sev: string; cat: string };
type Lens = { fn: string; fnName: string; id: string; short: string; name: string; description: string; industry: Record<Industry, string>; country: Record<Country, string>; systems: string[]; kpis: string[] };
type ZoneSum = { fn: string; fnName: string; id: string; name: string; total: number } & Record<Zone, number>;
type Summary = { home: { lens: Lens[]; zones: ZoneSum[]; records: Record<string, Rec[]>; featured: string } };
let summaryP: Promise<Summary> | null = null;
const getSummary = () => (summaryP ||= fetch("/data/summary.json", { headers: { Accept: "application/json" } })
  .then((r) => { if (!r.ok) throw new Error(`summary ${r.status}`); return r.json() as Promise<Summary>; })
  .catch((e) => { summaryP = null; throw e; }));

/* =============================================================================================
   1. Hero film choreography (listeners attach before boot() so the first progress event lands)
   ============================================================================================= */
function heroFilm() {
  const film = $(".hero");
  if (!film) return;
  const scrubs = $$("[data-scrub]", film).map((el) => ({ el, n: +el.dataset.scrub!, a: +el.dataset.a!, d: +el.dataset.d!, last: -1 }));
  const fns = $$(".hb-fns li", film);
  const names = fns.map((li) => $(".hb-fn", li)?.textContent ?? "");
  const tickN = $("[data-tick-n]", film), tickName = $("[data-tick-name]", film);
  const segs = $$(".hero-segs i", film).map((el) => ({ el, a: +el.dataset.a!, b: +el.dataset.b! }));
  const label = $("[data-prog-label]", film);
  const labels = ["01  The step", "02  Functions", "03  Processes and steps", "04  Failure points"];
  let cur = -1, lit = -1;
  film.addEventListener("film:progress", (e) => {
    const p = (e as CustomEvent<number>).detail;
    // the scrubbed numerals are aria-hidden; each has an sr-only twin with the final value
    for (const s of scrubs) {
      const v = Math.round(s.n * easeOut(clamp01((p - s.a) / s.d)));
      if (v !== s.last) { s.last = v; s.el.innerHTML = fmt(v).replace(",", '<span class="cm">,</span>'); }
    }
    // the plates light from the base up while beat b plays; the function list lights with them
    const k = p < 0.205 ? 0 : Math.min(fns.length, 1 + Math.floor(clamp01((p - 0.205) / 0.2) * (fns.length - 1) + 0.0001));
    if (k !== lit) {
      lit = k;
      fns.forEach((li, i) => li.classList.toggle("on", i < k));
      const idx = Math.max(0, k - 1);
      if (tickN) tickN.textContent = `${idx + 1} of ${fns.length}`;
      if (tickName) tickName.textContent = names[idx] ?? "";
    }
    for (const s of segs) s.el.style.setProperty("--f", clamp01((p - s.a) / (s.b - s.a)).toFixed(3));
    const c = Math.max(0, segs.findIndex((s) => p < s.b || s.b >= 1));
    if (c !== cur && label) { cur = c; label.textContent = labels[c]; }
  });
}

/* the monolith: the level ladder fills in as the film opens */
function monolithFilm() {
  const film = $(".mono-film");
  if (!film) return;
  const rows = $$(".ladder li", film).map((el) => ({ el, at: +el.dataset.at! }));
  let last = -2;
  film.addEventListener("film:progress", (e) => {
    const p = (e as CustomEvent<number>).detail;
    let k = -1;
    rows.forEach((r, i) => { if (p >= r.at) k = i; });
    if (k === last) return;
    last = k;
    rows.forEach((r, i) => { r.el.classList.toggle("in", i <= k); r.el.classList.toggle("cur", i === k); });
  });
}

/* =============================================================================================
   One scroll-linked pass for the page (shared onFrame loop): all reads, then all writes.
   - the local nav takes the skin (dark, light, navy) of whatever sits beneath it, so the global
     header, which probes the element under itself, follows the same skin
   - gentle parallax on a few large stills
   ============================================================================================= */
const WORLD_SKIN: Record<string, string> = { "w-void": "dark", "w-ink": "dark", "w-teal": "dark", "w-fog": "light", "w-light": "light", "w-paper": "light", "w-navy": "navy" };
function pageFrame() {
  const lnav = $<HTMLElement>("[data-lnav]");
  const imgs = reduce ? [] : $$<HTMLImageElement>("img[data-parallax]");
  let skin = lnav?.dataset.skin ?? "dark";
  onFrame(() => {
    // reads
    const vh = innerHeight;
    let next = skin;
    if (lnav) {
      const r = lnav.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) {
        for (const el of document.elementsFromPoint(innerWidth / 2, Math.min(vh - 1, r.bottom + 2))) {
          if (lnav.contains(el) || el.closest(".site-nav")) continue;
          const w = el.closest<HTMLElement>(".w-void, .w-ink, .w-teal, .w-fog, .w-light, .w-paper, .w-navy, [data-skin]");
          if (w) { next = w.dataset.skin || WORLD_SKIN[[...w.classList].find((c) => c in WORLD_SKIN) || ""] || "dark"; break; }
        }
      }
    }
    const moves: [HTMLImageElement, number][] = [];
    for (const img of imgs) {
      const r = img.parentElement!.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) continue;
      moves.push([img, ((r.top + r.height / 2) - vh / 2) / vh]);
    }
    // writes
    if (lnav && next !== skin) { skin = next; lnav.dataset.skin = next; }
    for (const [img, off] of moves) img.style.transform = `translate3d(0, ${(off * -5).toFixed(2)}%, 0) scale(1.12)`;
  });
}

/* =============================================================================================
   2. The monolith tile: the film's own frames play forward on a small canvas when pressed
   ============================================================================================= */
function opTile() {
  const tile = $<HTMLElement>("[data-op]");
  if (!tile) return;
  const btn = $<HTMLButtonElement>(".op-btn", tile)!, lbl = $(".op-lbl", tile)!;
  const canvas = $<HTMLCanvasElement>(".op-canvas", tile)!, ctx = canvas.getContext("2d", { alpha: false })!;
  const meta = (catalog.films as Record<string, { frames: number; base: string }>).monolith;
  // the same frame set the monolith film uses, so the browser cache serves both; 30 frames over ~1.1s
  const set = innerWidth * Math.min(devicePixelRatio || 1, 2) > 1100 ? "d" : "m";
  const COUNT = 30;
  const ids = Array.from({ length: COUNT }, (_, i) => Math.round((i * (meta.frames - 1)) / (COUNT - 1)));
  const imgs: (HTMLImageElement | undefined)[] = [];
  let ready: Promise<void> | null = null, pos = 0, raf = 0, open = false, touched = false, bg = "#d9e1e3";

  const load = () => (ready ||= Promise.all(ids.map((id, i) => {
    const im = new Image(); im.decoding = "async"; im.src = `${meta.base}/${set}/${String(id).padStart(3, "0")}.webp`;
    return im.decode().then(() => { imgs[i] = im; }).catch(() => {});
  })).then(() => { bg = getComputedStyle(tile).getPropertyValue("--bg").trim() || bg; }));
  const size = () => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
  };
  const draw = (k: number) => {
    let i = Math.round(k);
    while (i > 0 && !imgs[i]) i--;
    const im = imgs[i];
    if (!im) return;
    const W = canvas.width, H = canvas.height, s = Math.max(W / im.naturalWidth, H / im.naturalHeight);
    const w = im.naturalWidth * s, h = im.naturalHeight * s;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
    tile.classList.add("is-live");
  };
  new ResizeObserver(() => { size(); if (tile.classList.contains("is-live")) draw(pos); }).observe(canvas);
  const play = (to: number) => {
    cancelAnimationFrame(raf);
    const from = pos, dur = reduce ? 0 : 1100 * Math.abs(to - from) / (COUNT - 1);
    if (!dur) { pos = to; draw(pos); return; }
    const t0 = performance.now();
    const step = (t: number) => {
      const k = clamp01((t - t0) / dur);
      pos = from + (to - from) * easeIO(k);
      draw(pos);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  const set_ = (o: boolean) => {
    open = o;
    tile.dataset.open = String(o); btn.setAttribute("aria-pressed", String(o)); lbl.textContent = o ? "Close it" : "Open it";
    load().then(() => { size(); play(o ? COUNT - 1 : 0); });
  };
  btn.addEventListener("click", () => { touched = true; set_(!open); });
  whenNear(tile, () => { load(); }, "400px 0px");
  if (reduce) return;
  const io = new IntersectionObserver((es) => {
    if (es[0].isIntersecting) { io.disconnect(); load().then(() => setTimeout(() => { if (!touched) set_(true); }, 500)); }
  }, { threshold: 0.7 });
  io.observe(tile);
}

/* =============================================================================================
   3. Calibrate: the industry and country notes for four flagship processes, from the digest
   ============================================================================================= */
function calibrate() {
  const root = $("[data-console]");
  if (!root) return;
  const o = (k: string) => $(`[data-o="${k}"]`, root)!;
  const cap = $("[data-cal-cap]");
  const state = { proc: 0, ind: "retail" as Industry, cty: "PH" as Country };
  let lens: Lens[] | null = null;
  whenNear(root, () => { getSummary().then((s) => { lens = s.home.lens; }).catch(() => {}); }, "700px 0px");
  const status = o("status");

  const render = (changed: "proc" | "ind" | "cty") => {
    const L = lens![state.proc];
    if (changed === "proc") {
      o("code").textContent = `${L.fnName} · ${L.id}`;
      o("name").textContent = L.name;
      o("desc").textContent = L.description;
      o("systems").innerHTML = L.systems.map((s) => `<li>${esc(s)}</li>`).join("");
      o("kpis").innerHTML = L.kpis.map((s) => `<li>${esc(s)}</li>`).join("");
    }
    o("indName").textContent = INDUSTRIES[state.ind];
    o("ind").textContent = L.industry[state.ind] ?? "";
    o("ctyName").textContent = COUNTRIES[state.cty];
    o("cty").textContent = L.country[state.cty] ?? "";
    (o("link") as HTMLAnchorElement).href = `/app/#view=explore&fn=${encodeURIComponent(L.fn)}&p=${encodeURIComponent(L.id)}&ind=${state.ind}&cty=${state.cty}`;
    if (cap) cap.textContent = `${INDUSTRIES[state.ind]} · ${COUNTRIES[state.cty]}`;
    fadeIn(changed === "proc" ? [$(".out-head", root), $(".out-lens", root), $(".out-meta", root)]
      : changed === "ind" ? [o("ind").parentElement] : [o("cty").parentElement]);
  };
  const apply = (changed: "proc" | "ind" | "cty") => {
    if (lens) { render(changed); return; }
    status.textContent = "Loading…";
    getSummary().then((s) => { lens = s.home.lens; status.textContent = ""; render("proc"); })
      .catch(() => {
        status.innerHTML = `Couldn't load the notes. <button type="button">Try again</button>`;
        status.querySelector("button")!.addEventListener("click", () => apply(changed));
      });
  };
  $$("[data-ctl]", root).forEach((group) => {
    const kind = group.dataset.ctl as "proc" | "ind" | "cty";
    group.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>("button[data-v]");
      if (!b || b.getAttribute("aria-pressed") === "true") return;
      $$("button[data-v]", group).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      const v = b.dataset.v!;
      if (kind === "proc") state.proc = +v; else if (kind === "ind") state.ind = v as Industry; else state.cty = v as Country;
      apply(kind);
    });
  });
}

/* =============================================================================================
   4b. Pain-point library: illustrative records by category (title, category, severity, step path)
   ============================================================================================= */
function library() {
  const root = $("[data-rec]");
  const catsEl = $("[data-cats]");
  if (!root || !catsEl) return;
  const r = (k: string) => $(`[data-r="${k}"]`, root)!;
  let records: Record<string, Rec[]> | null = null;
  let cat = $<HTMLElement>('[data-cat][aria-pressed="true"]', catsEl)?.dataset.cat ?? "control-gap";
  let idx = 0;
  whenNear(root, () => { getSummary().then((s) => {
    records = s.home.records;
    idx = Math.max(0, (records[cat] ?? []).findIndex((x) => x.id === s.home.featured));
  }).catch(() => {}); }, "700px 0px");

  const render = () => {
    const list = records![cat] ?? [];
    const p = list[idx];
    if (!p) return;
    r("sevtag").className = `sevtag sev-${p.sev}`;
    r("sev").textContent = p.sev;
    r("cat").textContent = CATEGORY_LABELS[p.cat] ?? p.cat;
    r("count").textContent = `${idx + 1} of ${list.length} shown`;
    r("body").innerHTML = `<h3 class="rec-title" data-r="title">${esc(p.title)}</h3>
      <ol class="rec-path" data-r="path">
        <li><span class="mono">Function</span><span>${esc(p.fnName)}</span></li>
        <li><span class="mono">Process</span><span><b class="mono">${esc(p.pid)}</b> ${esc(p.pname)}</span></li>
        <li><span class="mono">Task</span><span><b class="mono">${esc(p.tid)}</b> ${esc(p.tname)}</span></li>
        <li class="rec-step sev-${p.sev}"><span class="mono">Step ${p.step + 1}</span><span>${esc(p.stepText)}</span></li>
      </ol>`;
    // s= is the app's step id (task id + 1-based step), so the link lands on the step itself
    (r("link") as HTMLAnchorElement).href = `/app/#view=explore&fn=${encodeURIComponent(p.fn)}&p=${encodeURIComponent(p.pid)}&s=${encodeURIComponent(`${p.tid}.${p.step + 1}`)}`;
    fadeIn([r("body")]);
  };
  const go = (fn: () => void) => {
    if (records) { fn(); render(); return; }
    r("count").textContent = "Loading…";
    getSummary().then((s) => { records = s.home.records; fn(); render(); }).catch(() => { r("count").textContent = "Couldn't load records"; });
  };
  catsEl.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-cat]");
    if (!b || b.getAttribute("aria-pressed") === "true") return;
    $$("button[data-cat]", catsEl).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    go(() => { cat = b.dataset.cat!; idx = 0; });
  });
  const len = () => records?.[cat]?.length ?? 1;
  $("[data-r-prev]", root)!.addEventListener("click", () => go(() => { idx = (idx - 1 + len()) % len(); }));
  $("[data-r-next]", root)!.addEventListener("click", () => go(() => { idx = (idx + 1) % len(); }));
}

/* =============================================================================================
   5b. Zone map: an example zone map per process, plus the live first-pass sort of its real steps
   ============================================================================================= */
type Item = [string, string];
const MAPS: [Item[], Item[], Item[]][] = [
  [[["Bank reconciliation", "Check: statement ties to ledger, item by item"], ["Intercompany matching", "Check: both sides agree to the cent"], ["Recurring journals", "Check: entry matches the approved schedule"]],
   [["Accruals", "Agent drafts from open POs, accountant reviews"], ["Flux analysis", "Agent explains variances, controller confirms"], ["Balance sheet support", "Agent assembles, reviewer signs"]],
   [["Judgmental provisions", "Policy and judgment, documented by a person"], ["Close sign-off", "The controller owns the numbers"], ["Auditor conversations", "Relationships and accountability"]]],
  [[["Invoice capture and coding", "Check: fields match the source document"], ["Three-way match", "Check: PO, receipt and invoice within tolerance"], ["Duplicate detection", "Check: no prior supplier, number and amount"]],
   [["Exception resolution", "Agent proposes the fix, analyst approves"], ["Supplier queries", "Agent drafts from ledger status, analyst sends"], ["Tax and country rules", "Agent flags the rule, specialist confirms"]],
   [["New supplier approval", "Due diligence and judgment"], ["Payment release", "Authorized approver, duties kept separate"], ["Dispute settlement", "Commercial decision"]]],
  [[["Order and booking status", "Check: answer comes from the system record"], ["Hours, prices and policies", "Check: answer quotes your published document"], ["Appointment booking", "Check: slot confirmed in your calendar"]],
   [["Refund requests", "Assistant gathers the facts, staff decide"], ["Complaints", "Assistant drafts the reply, staff send"], ["Quotes for custom work", "Assistant collects details, owner prices"]],
   [["Exceptions to policy", "A manager decides"], ["Upset customers", "A person takes over"], ["Legal or safety questions", "Always a person"]]],
];
const ZONE_KEYS: Zone[] = ["auto", "assist", "human"];
const ZONE_LABEL: Record<Zone, string> = { auto: "Auto", assist: "Assist", human: "Human" };

function zoneMap() {
  const box = $("[data-ztabs]"), panel = $("[data-zpanel]");
  if (!box || !panel) return;
  const imgs = $$("img", $(".zp-media", panel)!);
  const cols = $("[data-zcols]", panel)!;
  const zs = (k: string) => $(`[data-zs="${k}"]`, panel)!;
  let zones: ZoneSum[] | null = null, cur = 0;
  whenNear(panel, () => { getSummary().then((s) => { zones = s.home.zones; }).catch(() => {}); }, "700px 0px");

  const drawSort = (i: number) => {
    const z = zones![i];
    zs("fn").textContent = z.fnName; zs("id").textContent = z.id; zs("name").textContent = z.name;
    (zs("link") as HTMLAnchorElement).href = `/app/#view=xray&fn=${encodeURIComponent(z.fn)}&p=${encodeURIComponent(z.id)}`;
    const bar = zs("bar");
    ZONE_KEYS.forEach((k, j) => {
      const seg = bar.children[j] as HTMLElement;
      seg.style.setProperty("--n", String(z[k]));
      seg.querySelector("b")!.textContent = String(z[k]);
    });
    bar.setAttribute("aria-label", `${z.auto} auto, ${z.assist} assist and ${z.human} human steps out of ${z.total}`);
    zs("key").innerHTML = ZONE_KEYS.map((k) => `<span class="z-${k}"><span class="dot"></span>${ZONE_LABEL[k]} ${z[k]}</span>`).join("") + `<span class="zsort-total">of ${z.total} steps</span>`;
    bar.parentElement!.style.opacity = "";
  };
  box.addEventListener("tabs:change", (e) => {
    const i = (e as CustomEvent<{ index: number }>).detail.index;
    if (i === cur) return;
    cur = i;
    imgs.forEach((im, k) => im.classList.toggle("on", k === i));
    cols.innerHTML = ZONE_KEYS.map((z, k) =>
      `<div class="zcol z-${z}"><h3 class="zcol-h"><span class="dot"></span>${ZONE_LABEL[z]}</h3><ul>${
        MAPS[i][k].map(([b, s]) => `<li><b>${esc(b)}</b><span>${esc(s)}</span></li>`).join("")}</ul></div>`).join("");
    fadeIn($$(".zcol", cols));
    if (zones) { drawSort(i); fadeIn([zs("bar"), zs("key")]); return; }
    zs("bar").parentElement!.style.opacity = "0.5";
    getSummary().then((s) => { zones = s.home.zones; if (cur === i) drawSort(i); }).catch(() => {});
  });
}

/* =============================================================================================
   6. Thirteen functions: keyboard focus keeps the focused card fully in view
   ============================================================================================= */
function galleryFocus() {
  const track = $<HTMLElement>(".fns .gal-track");
  if (!track) return;
  track.addEventListener("focusin", (e) => {
    const item = (e.target as Element).closest<HTMLElement>(".gal-track > li");
    if (!item) return;
    const pad = parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0;
    const l = item.offsetLeft - pad, r = item.offsetLeft + item.offsetWidth - track.clientWidth + pad;
    if (track.scrollLeft > l) track.scrollTo({ left: l, behavior: reduce ? "auto" : "smooth" });
    else if (track.scrollLeft < r) track.scrollTo({ left: l, behavior: reduce ? "auto" : "smooth" });
  });
}

/* ---------------------------------------------------------------------------------------------- */
heroFilm();
monolithFilm();
boot();
initLocalNav();
initLines();
initCounts();
initInk();
initTabs();
initGalleries();
pageFrame();
opTile();
calibrate();
library();
zoneMap();
galleryFocus();

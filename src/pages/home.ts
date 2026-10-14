/* Home page behaviour. Everything here enhances markup that is already complete in index.html:
   the page paints fully with no JS and no data, then films, counters and live data take over. */
import "../styles/base.css";
import "../styles/home.css";
import { boot } from "../lib/site";
import { loadTaxonomy, loadPain, zoneOf, INDUSTRIES, COUNTRIES, CATEGORY_LABELS } from "../lib/data";
import type { Industry, Country, Taxonomy, Process, Fn, PainPoint, PainLibrary, Zone } from "../lib/data";

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmt = (n: number) => n.toLocaleString("en-US");
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Run fn once when el comes within `margin` of the viewport. */
function whenNear(el: Element | null, fn: () => void, margin = "900px 0px") {
  if (!el) return;
  if (!("IntersectionObserver" in window)) { fn(); return; }
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: margin });
  io.observe(el);
}

/** Soft crossfade for content that has just been replaced. */
function fadeIn(els: (Element | null)[]) {
  if (reduce) return;
  for (const el of els) el?.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
}

/* ---------------------------------------------------------------------------------------------
   Data helpers
   --------------------------------------------------------------------------------------------- */
function findProc(T: Taxonomy, fnId: string, id: string): { fn: Fn; proc: Process } | null {
  const fn = T.functions.find((f) => f.functionId === fnId);
  if (!fn) return null;
  for (const g of fn.processGroups) for (const p of g.processes) if (p.id === id) return { fn, proc: p };
  return null;
}
function zoneCounts(proc: Process) {
  const c: Record<Zone, number> = { auto: 0, assist: 0, human: 0 };
  for (const a of proc.activities) for (const t of a.tasks) for (const s of t.steps) c[zoneOf(s, t.name).zone]++;
  return c;
}

/* =============================================================================================
   1. Hero film choreography (listeners attach before boot() so the first progress event lands)
   ============================================================================================= */
function heroFilm() {
  const film = $(".hero");
  if (!film) return;
  const scrubs = $$("[data-scrub]", film).map((el) => ({ el, n: +el.dataset.scrub!, a: +el.dataset.a!, d: +el.dataset.d!, last: -1 }));
  const fns = $$(".hb-fns li", film);
  const tickN = $("[data-tick-n]", film), tickName = $("[data-tick-name]", film);
  const segs = $$(".hero-segs i", film).map((el) => ({ el, a: +el.dataset.a!, b: +el.dataset.b! }));
  const label = $("[data-prog-label]", film);
  const labels = ["01  The step", "02  Functions", "03  Processes and steps", "04  Failure points"];
  let cur = -1, lit = -1;
  film.addEventListener("film:progress", (e) => {
    const p = (e as CustomEvent<number>).detail;
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
      if (tickN) tickN.textContent = `${String(idx + 1).padStart(2, "0")} / 13`;
      if (tickName) tickName.textContent = fns[idx]?.textContent ?? "";
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
   Local nav: active chapter, light/dark skin, tucks up when the global header hides
   ============================================================================================= */
function localNav() {
  const lnav = $(".lnav");
  if (!lnav) return;
  const site = $(".site-nav");
  if (site) {
    const sync = () => lnav.classList.toggle("tuck", site.classList.contains("is-hidden"));
    new MutationObserver(sync).observe(site, { attributes: true, attributeFilter: ["class"] });
    sync();
  }
  const links = $$<HTMLAnchorElement>(".lnav-links a", lnav);
  const now = $("[data-lnav-now]", lnav);
  const sections = $$("main > section");
  const chapterLink: Record<string, string> = { Highlights: "#highlights", Calibrate: "#calibrate", "Down to the step": "#step", Zones: "#zones", Functions: "#functions", "Ways in": "#ways" };
  let ticking = false, lastChapter = "?", lastLight: boolean | null = null;
  const update = () => {
    ticking = false;
    const y = lnav.getBoundingClientRect().bottom + 1;
    let under: HTMLElement | null = null, chapter = "";
    for (const s of sections) {
      const r = s.getBoundingClientRect();
      if (r.top <= y && r.bottom > y) under = s;
      if (r.top <= innerHeight * 0.45 && r.bottom > innerHeight * 0.45) chapter = s.dataset.chapter || "";
    }
    const light = !!under && (under.classList.contains("w-fog") || under.classList.contains("w-light"));
    if (light !== lastLight) { lastLight = light; lnav.classList.toggle("is-light", light); }
    if (chapter !== lastChapter) {
      lastChapter = chapter;
      const href = chapterLink[chapter];
      links.forEach((a) => (a.getAttribute("href") === href ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
      if (now) now.textContent = chapter === "Down to the step" ? "To the step" : chapter;
    }
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  update();
}

/* =============================================================================================
   Count-up numerals (bento). Scroll-linked and one-way: a number counts up as it rises through the
   bottom edge of the screen and is final by the time it is 14% of a screen up, so it is never read
   half-counted. The final value is in the HTML for no-JS and reduced motion.
   ============================================================================================= */
function countUps() {
  if (reduce) return;
  const items = $$("[data-countup]").filter((el) => +el.dataset.countup! >= 10).map((el) => ({
    el, n: +el.dataset.countup!, d: +(getComputedStyle(el.closest("li") ?? el).getPropertyValue("--d") || 0), k: 0, last: -1,
  }));
  if (!items.length) return;
  // anything already on screen at load keeps its final value so the first paint is stable
  for (const it of items) { const r = it.el.getBoundingClientRect(); if (r.top < innerHeight) it.k = 1; }
  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = innerHeight;
    for (const it of items) {
      if (it.k >= 1) continue;
      const r = it.el.getBoundingClientRect();
      const k = clamp01((vh * 1.0 - r.top - it.d * 4) / (vh * 0.14));
      if (k <= it.k) continue;
      it.k = k;
      const v = Math.round(it.n * easeOut(k));
      if (v !== it.last) { it.last = v; it.el.textContent = fmt(v); }
    }
  };
  for (const it of items) if (it.k < 1) { it.el.textContent = "0"; it.last = 0; }
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

/* the monolith tile: press to open it, and it opens itself once when first seen */
function openTile() {
  const tile = $("[data-op]");
  if (!tile) return;
  const btn = $<HTMLButtonElement>(".op-btn", tile)!, lbl = $(".op-lbl", tile)!;
  let touched = false;
  const set = (open: boolean) => { tile.dataset.open = String(open); btn.setAttribute("aria-pressed", String(open)); lbl.textContent = open ? "Close it" : "Open it"; };
  btn.addEventListener("click", () => { touched = true; set(tile.dataset.open !== "true"); });
  if (reduce) return;
  const io = new IntersectionObserver((es) => {
    if (es[0].isIntersecting) { io.disconnect(); setTimeout(() => { if (!touched) set(true); }, 1100); }
  }, { threshold: 0.7 });
  io.observe(tile);
}

/* interlude: words brighten as the line scrolls through the reading zone */
function interludeWords() {
  const p = $("[data-words]");
  if (!p) return;
  const words = (p.textContent || "").split(" ");
  p.innerHTML = words.map((w) => `<span class="wd">${esc(w)}</span>`).join(" ");
  const spans = $$(".wd", p);
  if (reduce) { spans.forEach((s) => s.classList.add("lit")); return; }
  let lastK = -1, ticking = false;
  const update = () => {
    ticking = false;
    const r = p.getBoundingClientRect();
    const start = innerHeight * 0.86, end = innerHeight * 0.36;
    const prog = clamp01((start - r.top) / (start - end + r.height * 0.6));
    const k = Math.round(prog * spans.length);
    if (k === lastK) return;
    lastK = k;
    spans.forEach((s, i) => s.classList.toggle("lit", i < k));
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

/* gentle parallax on a few large stills */
function parallax() {
  if (reduce) return;
  const imgs = $$<HTMLImageElement>("img[data-parallax]");
  if (!imgs.length) return;
  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = innerHeight;
    for (const img of imgs) {
      const r = img.parentElement!.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) continue;
      const off = ((r.top + r.height / 2) - vh / 2) / vh; // -1..1 across the screen
      img.style.transform = `translate3d(0, ${(off * -5).toFixed(2)}%, 0) scale(1.12)`;
    }
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

/* =============================================================================================
   3. Calibrate: the industry and country lens, live from the taxonomy
   ============================================================================================= */
function calibrate() {
  const root = $("[data-console]");
  if (!root) return;
  const o = (k: string) => $(`[data-o="${k}"]`, root)!;
  const cap = $("[data-cal-cap]");
  const state = { fn: "finance-accounting", id: "8.1.1", ind: "retail" as Industry, cty: "PH" as Country };
  let T: Taxonomy | null = null;
  let pending: Promise<Taxonomy> | null = null;
  const get = () => (pending ||= loadTaxonomy().then((t) => (T = t)).catch((e) => { pending = null; throw e; }));
  whenNear(root, () => { get().catch(() => {}); }, "700px 0px");

  const status = o("status");
  const render = (changed: "proc" | "ind" | "cty") => {
    if (!T) return;
    const hit = findProc(T, state.fn, state.id);
    if (!hit) return;
    const { fn, proc } = hit;
    const c = proc.calibration;
    if (changed === "proc") {
      o("code").textContent = `${proc.id} · ${fn.functionName}`;
      o("name").textContent = proc.name;
      o("trigger").textContent = proc.trigger;
      o("systems").innerHTML = c.systems.map((s) => `<li>${esc(s)}</li>`).join("");
      o("kpis").innerHTML = c.kpis.map((s) => `<li>${esc(s)}</li>`).join("");
    }
    o("indName").textContent = INDUSTRIES[state.ind];
    o("ind").textContent = c.industry[state.ind] ?? "";
    o("ctyName").textContent = COUNTRIES[state.cty];
    o("cty").textContent = c.country[state.cty] ?? "";
    (o("link") as HTMLAnchorElement).href = `/app/#view=explore&fn=${encodeURIComponent(state.fn)}&p=${encodeURIComponent(state.id)}&ind=${state.ind}&cty=${state.cty}`;
    if (cap) cap.textContent = `${INDUSTRIES[state.ind]} · ${COUNTRIES[state.cty]}`;
    const moved = changed === "proc" ? [$(".out-head", root), $(".out-lens", root), $(".out-meta", root)]
      : changed === "ind" ? [o("ind").parentElement] : [o("cty").parentElement];
    fadeIn(moved);
  };

  const apply = (changed: "proc" | "ind" | "cty") => {
    if (T) { render(changed); return; }
    status.textContent = "Loading the taxonomy…";
    get().then(() => { status.textContent = ""; render("proc"); })
      .catch(() => {
        status.innerHTML = `Couldn't load the process data. <button type="button">Try again</button>`;
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
      if (kind === "proc") { const [fn, id] = v.split("|"); state.fn = fn; state.id = id; }
      else if (kind === "ind") state.ind = v as Industry;
      else state.cty = v as Country;
      apply(kind);
    });
  });
}

/* =============================================================================================
   4b. Pain-point library: real records, browsable by category
   ============================================================================================= */
function library() {
  const root = $("[data-rec]");
  const catsEl = $("[data-cats]");
  if (!root || !catsEl) return;
  const r = (k: string) => $(`[data-r="${k}"]`, root)!;
  const DEFAULT_ID = "pp-finance-accounting-8-1-1-8-1-1-2-2-6";
  const SEV_ORDER = { High: 0, Medium: 1, Low: 2 } as const;
  let lib: PainLibrary | null = null;
  let byCat: Record<string, PainPoint[]> = {};
  let cat = "automation-gap", list: PainPoint[] = [], idx = 0;
  let pending: Promise<PainLibrary> | null = null;
  const get = () => (pending ||= loadPain().then((l) => {
    lib = l;
    byCat = {};
    for (const p of l.painPoints) (byCat[p.category] ||= []).push(p);
    for (const k in byCat) byCat[k].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
    // the counts on the page come from the data itself
    $$<HTMLElement>("[data-cat]", catsEl).forEach((b) => {
      const n = byCat[b.dataset.cat!]?.length ?? 0;
      b.style.setProperty("--n", String(n));
      $(".cat-n", b)!.textContent = String(n);
    });
    list = byCat[cat] ?? [];
    idx = Math.max(0, list.findIndex((p) => p.id === DEFAULT_ID));
    r("count").textContent = `Record ${idx + 1} of ${list.length}`;
    return l;
  }).catch((e) => { pending = null; throw e; }));
  whenNear(root, () => { get().catch(() => {}); }, "700px 0px");

  const render = () => {
    const p = list[idx];
    if (!p) return;
    const sev = r("sevtag");
    sev.className = `sevtag sev-${p.severity}`;
    r("sev").textContent = p.severity;
    r("cat").textContent = CATEGORY_LABELS[p.category] ?? p.categoryLabel;
    r("count").textContent = `Record ${idx + 1} of ${list.length}`;
    r("title").textContent = p.title;
    r("impact").textContent = p.impact;
    r("path").innerHTML =
      `<li><span class="mono">Function</span><span>${esc(p.functionName)}</span></li>` +
      `<li><span class="mono">Process</span><span><b class="mono">${esc(p.processId)}</b> ${esc(p.processName)}</span></li>` +
      `<li><span class="mono">Task</span><span><b class="mono">${esc(p.taskId)}</b> ${esc(p.taskName)}</span></li>` +
      `<li class="rec-step sev-${p.severity}"><span class="mono">Step ${p.stepIndex + 1}</span><span>${esc(p.stepText)}</span></li>`;
    (r("link") as HTMLAnchorElement).href = `/app/#view=explore&fn=${encodeURIComponent(p.functionId)}&p=${encodeURIComponent(p.processId)}`;
    fadeIn([r("body")]);
  };
  const go = (fn: () => void) => {
    if (lib) { fn(); render(); return; }
    r("count").textContent = "Loading…";
    get().then(() => { fn(); render(); }).catch(() => { r("count").textContent = "Couldn't load records"; });
  };
  catsEl.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-cat]");
    if (!b || b.getAttribute("aria-pressed") === "true") return;
    $$("button[data-cat]", catsEl).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    go(() => { cat = b.dataset.cat!; list = byCat[cat] ?? []; idx = 0; });
  });
  $("[data-r-prev]", root)!.addEventListener("click", () => go(() => { idx = (idx - 1 + list.length) % list.length; }));
  $("[data-r-next]", root)!.addEventListener("click", () => go(() => { idx = (idx + 1) % list.length; }));
}

/* =============================================================================================
   5b. Zone map: the illustrative map from our engagements, plus a live first-pass sort of a real process
   ============================================================================================= */
type Item = [string, string];
const MAPS: { name: string; fn: string; id: string; proc: string; fallback: Record<Zone, number>; cols: [Item[], Item[], Item[]] }[] = [
  { name: "Month-end close", fn: "finance-accounting", id: "8.1.1", proc: "Execute Period-End and Continuous Close", fallback: { auto: 12, assist: 15, human: 5 }, cols: [
    [["Bank reconciliation", "Check: statement ties to ledger, item by item"], ["Intercompany matching", "Check: both sides agree to the cent"], ["Recurring journals", "Check: entry matches the approved schedule"]],
    [["Accruals", "Agent drafts from open POs, accountant reviews"], ["Flux analysis", "Agent explains variances, controller confirms"], ["Balance sheet support", "Agent assembles, reviewer signs"]],
    [["Judgmental provisions", "Policy and judgment, documented by a person"], ["Close sign-off", "The controller owns the numbers"], ["Auditor conversations", "Relationships and accountability"]]] },
  { name: "Supplier invoices", fn: "procurement", id: "7.1.2", proc: "Manage Receipt, Invoice Matching, and Payment", fallback: { auto: 15, assist: 15, human: 2 }, cols: [
    [["Invoice capture and coding", "Check: fields match the source document"], ["Three-way match", "Check: PO, receipt and invoice within tolerance"], ["Duplicate detection", "Check: no prior supplier, number and amount"]],
    [["Exception resolution", "Agent proposes the fix, analyst approves"], ["Supplier queries", "Agent drafts from ledger status, analyst sends"], ["Tax and country rules", "Agent flags the rule, specialist confirms"]],
    [["New supplier approval", "Due diligence and judgment"], ["Payment release", "Authorized approver, duties kept separate"], ["Dispute settlement", "Commercial decision"]]] },
  { name: "Customer support", fn: "marketing-sales-cx", id: "9.1.1", proc: "Manage Customer Service Operations & Contact Center", fallback: { auto: 16, assist: 14, human: 1 }, cols: [
    [["Order and booking status", "Check: answer comes from the system record"], ["Hours, prices and policies", "Check: answer quotes your published document"], ["Appointment booking", "Check: slot confirmed in your calendar"]],
    [["Refund requests", "Assistant gathers the facts, staff decide"], ["Complaints", "Assistant drafts the reply, staff send"], ["Quotes for custom work", "Assistant collects details, owner prices"]],
    [["Exceptions to policy", "A manager decides"], ["Upset customers", "A person takes over"], ["Legal or safety questions", "Always a person"]]] },
];
const ZONE_KEYS: Zone[] = ["auto", "assist", "human"];
const ZONE_LABEL: Record<Zone, string> = { auto: "Auto", assist: "Assist", human: "Human" };

function zoneMap() {
  const tabs = $("[data-ztabs]"), panel = $("[data-zpanel]");
  if (!tabs || !panel) return;
  const btns = $$<HTMLButtonElement>("[role=tab]", tabs);
  const imgs = $$("img", $(".zp-media", panel)!);
  const cols = $("[data-zcols]", panel)!;
  const zs = (k: string) => $(`[data-zs="${k}"]`, panel)!;
  const live: (Record<Zone, number> | null)[] = [null, null, null];
  let cur = 0;

  const drawBar = (i: number) => {
    const c = live[i] ?? MAPS[i].fallback;
    const total = c.auto + c.assist + c.human;
    const bar = zs("bar");
    ZONE_KEYS.forEach((z, k) => {
      const seg = bar.children[k] as HTMLElement;
      seg.style.setProperty("--n", String(c[z]));
      seg.querySelector("b")!.textContent = String(c[z]);
      seg.title = `${ZONE_LABEL[z]}: ${c[z]} of ${total} steps`;
    });
    bar.setAttribute("aria-label", `${c.auto} auto, ${c.assist} assist and ${c.human} human steps out of ${total}`);
    zs("key").innerHTML = ZONE_KEYS.map((z) => `<span class="z-${z}"><span class="dot"></span>${ZONE_LABEL[z]} ${c[z]}</span>`).join("") + `<span class="zsort-total">of ${total} steps</span>`;
  };
  const select = (i: number, focus = false) => {
    if (i === cur && !focus) return;
    cur = i;
    btns.forEach((b, k) => { b.setAttribute("aria-selected", String(k === i)); b.tabIndex = k === i ? 0 : -1; });
    if (focus) btns[i].focus();
    panel.setAttribute("aria-labelledby", btns[i].id);
    imgs.forEach((im, k) => im.classList.toggle("on", k === i));
    const m = MAPS[i];
    cols.innerHTML = ZONE_KEYS.map((z, k) =>
      `<div class="zcol z-${z}"><h3 class="zcol-h"><span class="dot"></span>${ZONE_LABEL[z]}</h3><ul>${
        m.cols[k].map(([b, s]) => `<li><b>${esc(b)}</b><span>${esc(s.charAt(0).toUpperCase() + s.slice(1))}</span></li>`).join("")}</ul></div>`).join("");
    zs("id").textContent = m.id;
    zs("name").textContent = m.proc;
    (zs("link") as HTMLAnchorElement).href = `/app/#view=xray&fn=${m.fn}&p=${encodeURIComponent(m.id)}`;
    drawBar(i);
    fadeIn($$(".zcol", cols));
  };
  btns.forEach((b, i) => b.addEventListener("click", () => select(i)));
  tabs.addEventListener("keydown", (e) => {
    const k = e.key;
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(k)) return;
    e.preventDefault();
    const n = btns.length;
    const i = k === "Home" ? 0 : k === "End" ? n - 1 : (cur + (k === "ArrowRight" ? 1 : -1) + n) % n;
    select(i, true);
  });
  // replace the saved counts with a live sort of each real process
  whenNear(panel, () => {
    loadTaxonomy().then((T) => {
      MAPS.forEach((m, i) => { const hit = findProc(T, m.fn, m.id); if (hit) live[i] = zoneCounts(hit.proc); });
      drawBar(cur);
    }).catch(() => {});
  }, "600px 0px");
}

/* =============================================================================================
   6. Thirteen functions: paddles + live counts
   ============================================================================================= */
function gallery() {
  const rail = $("[data-rail]");
  const pads = $$<HTMLButtonElement>("[data-paddles] button");
  if (!rail) return;
  const sync = () => {
    const max = rail.scrollWidth - rail.clientWidth - 2;
    pads.forEach((b) => { b.disabled = +b.dataset.dir! < 0 ? rail.scrollLeft <= 2 : rail.scrollLeft >= max; });
  };
  pads.forEach((b) => b.addEventListener("click", () => {
    const card = $(".fn-card", rail);
    const stepW = (card?.getBoundingClientRect().width ?? 300) + 20;
    const n = Math.max(1, Math.floor((rail.clientWidth * 0.8) / stepW));
    rail.scrollBy({ left: +b.dataset.dir! * n * stepW, behavior: reduce ? "auto" : "smooth" });
  }));
  rail.addEventListener("scroll", () => requestAnimationFrame(sync), { passive: true });
  addEventListener("resize", sync);
  sync();
  whenNear(rail, () => {
    Promise.all([loadTaxonomy(), loadPain()]).then(([T, P]) => {
      const pains: Record<string, number> = {};
      for (const p of P.painPoints) pains[p.functionId] = (pains[p.functionId] ?? 0) + 1;
      for (const fn of T.functions) {
        const card = $(`[data-fn="${fn.functionId}"]`, rail);
        if (!card) continue;
        const processes = fn.processGroups.reduce((n, g) => n + g.processes.length, 0);
        const steps = fn.processGroups.reduce((n, g) => n + g.processes.reduce((m, p) => m + p.activities.reduce((a, x) => a + x.tasks.reduce((b, t) => b + t.steps.length, 0), 0), 0), 0);
        const set = (k: string, v: number) => { const el = $(`[data-k="${k}"]`, card); if (el) el.textContent = fmt(v); };
        set("groups", fn.processGroups.length); set("processes", processes); set("steps", steps); set("pains", pains[fn.functionId] ?? 0);
      }
    }).catch(() => {});
  }, "400px 0px");
}

/* ---------------------------------------------------------------------------------------------- */
heroFilm();
monolithFilm();
boot();
localNav();
countUps();
openTile();
interludeWords();
parallax();
calibrate();
library();
zoneMap();
gallery();

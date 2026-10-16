/* Scroll-scrubbed films, Apple-style.
   Markup (all pieces optional except the stage + canvas):

   <section class="film w-void" data-film="atlas" style="--film-h:420vh">
     <div class="film-stage">
       <img class="film-poster" src="/media/film/atlas/first.webp" alt="...">
       <canvas class="film-canvas" aria-hidden="true"></canvas>
       <div class="film-overlay">
         <div class="beat" data-in="0" data-out="0.2">...</div>     // visible while progress is in [in, out]
         <div class="beat" data-in="0.25" data-out="0.5">...</div>
       </div>
       <div class="film-progress"><i></i></div>
     </div>
   </section>

   The section's scroll distance (--film-h) maps to frames 0..N-1. Beats fade in over the first 6%
   of their window and out over the last 6% (data-fade overrides). The section exposes
   --p (0..1) so CSS can react, and dispatches "film:progress" events with {detail: p}.
   Frames load progressively (every 8th, then 4th, 2nd, all) so scrubbing works before the set
   finishes. With prefers-reduced-motion the poster and all beats show statically. With Save-Data or a
   slow connection only the poster is used (beats still work). Beat text is never removed from the
   accessibility tree; controls inside a faded beat leave the tab order (class .is-off is set). */

import catalog from "../media-catalog.json";
import { onFrame } from "./ui";

type FilmMeta = { frames: number; base: string; desktop: number; mobile: number };
const FILMS = catalog.films as Record<string, FilmMeta>;
const reduce = matchMedia("(prefers-reduced-motion: reduce)");

const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
const lowData = !!conn && (conn.saveData === true || ["slow-2g", "2g", "3g"].includes(conn.effectiveType || ""));
type FrameSet = { imgs: (HTMLImageElement | undefined)[]; queued: Set<number> };

class Film {
  el: HTMLElement; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; meta: FilmMeta;
  sets: Record<"d" | "m", FrameSet> = { d: { imgs: [], queued: new Set() }, m: { imgs: [], queued: new Set() } };
  beats: { el: HTMLElement; a: number; b: number; f: number; vis: boolean; focusables: { el: HTMLElement; tab: string | null }[] }[] = [];
  bar: HTMLElement | null; p = -1; drawn = -1; drawnSet = ""; set: "d" | "m"; phase = 0; inflight = 0; queue: number[] = [];
  fit: "cover" | "contain"; focusX: number; focusY: number; bg = "#000";

  constructor(el: HTMLElement) {
    this.el = el;
    this.meta = FILMS[el.dataset.film!];
    this.canvas = el.querySelector(".film-canvas")!;
    this.ctx = this.canvas.getContext("2d", { alpha: false })!;
    this.bar = el.querySelector(".film-progress i");
    this.fit = (el.dataset.fit as "cover" | "contain") || "cover";
    this.focusX = parseFloat(el.dataset.focusX || "0.5");
    this.focusY = parseFloat(el.dataset.focusY || "0.5");
    this.set = this.wantSet();
    this.beats = [...el.querySelectorAll<HTMLElement>(".beat")].map((b) => ({
      el: b, a: parseFloat(b.dataset.in || "0"), b: parseFloat(b.dataset.out || "1"), f: parseFloat(b.dataset.fade || "0.06"), vis: true,
      focusables: [...b.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")].map((el) => ({ el, tab: el.getAttribute("tabindex") })),
    }));
    this.readBg();
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    if (lowData) { el.classList.add("is-poster-only"); return; }
    // phase 1 (a sparse key-frame set) when the film is near; phase 2 (everything) once the reader arrives or the page is idle
    new IntersectionObserver((es) => es[0].isIntersecting && this.load(1), { rootMargin: "100% 0px" }).observe(el);
  }

  wantSet(): "d" | "m" { return innerWidth * Math.min(devicePixelRatio || 1, 2) > 1100 ? "d" : "m"; }
  readBg() { this.bg = getComputedStyle(this.el).getPropertyValue("--bg").trim() || "#000"; }
  src(set: string, i: number) { return `${this.meta.base}/${set}/${String(i).padStart(3, "0")}.webp`; }

  load(phase: number) {
    if (phase <= this.phase) return;
    this.phase = phase;
    const N = this.meta.frames, fs = this.sets[this.set];
    if (phase === 1) {
      const order = [0, N - 1];
      for (let i = 8; i < N - 1; i += 8) order.push(i);
      this.queue.push(...order.filter((i) => !fs.queued.has(i)));
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
      const fast = !conn || (conn as { downlink?: number }).downlink === undefined || ((conn as { downlink?: number }).downlink ?? 0) >= 5;
      if (fast) setTimeout(() => (idle ? idle(() => this.load(2), { timeout: 6000 }) : this.load(2)), 6000);
    } else {
      // everything else, nearest to where the reader is first
      const t = this.target();
      const rest = [...Array(N).keys()].filter((i) => !fs.queued.has(i) && !this.queue.includes(i)).sort((a, b) => Math.abs(a - t) - Math.abs(b - t));
      this.queue.push(...rest);
    }
    this.pump();
  }

  pump() {
    const fs = this.sets[this.set], set = this.set;
    while (this.inflight < 4 && this.queue.length) {
      const i = this.queue.shift()!;
      if (fs.queued.has(i)) continue;
      fs.queued.add(i); this.inflight++;
      const im = new Image(); im.decoding = "async"; im.src = this.src(set, i);
      im.decode().then(() => { fs.imgs[i] = im; if (set === this.set && (Math.abs(i - this.target()) < 4 || this.drawn < 0)) this.draw(true); })
        .catch(() => fs.queued.delete(i))
        .finally(() => { this.inflight--; this.pump(); });
    }
  }

  target() { return Math.round(Math.max(0, this.p) * (this.meta.frames - 1)); }

  pick(t: number): HTMLImageElement | undefined {
    // nearest decoded frame in the preferred set, then fall back to the other set while it loads
    for (const key of [this.set, this.set === "d" ? "m" : "d"] as const) {
      const imgs = this.sets[key].imgs;
      if (imgs[t]) { this.drawnSet = key; return imgs[t]; }
      for (let d = 1; d < this.meta.frames; d++) {
        if (imgs[t - d]) { this.drawnSet = key; return imgs[t - d]; }
        if (imgs[t + d]) { this.drawnSet = key; return imgs[t + d]; }
      }
    }
    return undefined;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
    this.readBg();
    const want = this.wantSet();
    if (want === "d" && this.set === "m" && !lowData) { this.set = "d"; const ph = this.phase; this.phase = 0; this.queue = []; if (ph) this.load(Math.min(ph, 2)); if (ph >= 2) this.load(2); }
    this.draw(true);
  }

  draw(force = false) {
    const t = this.target();
    if (!force && t === this.drawn) return;
    const im = this.pick(t);
    if (!im) return;
    const { width: W, height: H } = this.canvas;
    if (!W || !H) return;
    const s = this.fit === "cover" ? Math.max(W / im.naturalWidth, H / im.naturalHeight) : Math.min(W / im.naturalWidth, H / im.naturalHeight);
    const w = im.naturalWidth * s, h = im.naturalHeight * s;
    this.ctx.fillStyle = this.bg;
    this.ctx.fillRect(0, 0, W, H);
    this.ctx.drawImage(im, (W - w) * this.focusX, (H - h) * this.focusY, w, h);
    this.drawn = t;
    if (!this.el.classList.contains("is-live")) this.el.classList.add("is-live");
  }

  /* read phase */
  measure() {
    const r = this.el.getBoundingClientRect();
    const span = r.height - innerHeight;
    return { p: span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0, near: r.top < innerHeight && r.bottom > 0 };
  }

  /* write phase */
  apply(p: number, near: boolean) {
    if (near && p > 0.002 && this.phase < 2 && !lowData) this.load(2);
    if (p === this.p) return;
    this.p = p;
    this.el.style.setProperty("--p", p.toFixed(4));
    if (this.bar) this.bar.style.setProperty("--p", p.toFixed(4));
    for (const b of this.beats) {
      // a beat that starts at 0 is already fully visible on arrival; one that ends at 1 stays visible at the end
      const fadeIn = b.a <= 0 ? 1 : (p - b.a) / b.f;
      const fadeOut = b.b >= 1 ? 1 : (b.b - p) / b.f;
      const o = p < b.a || p > b.b ? 0 : Math.max(0, Math.min(1, fadeIn, fadeOut));
      b.el.style.setProperty("--o", o.toFixed(3));
      // text stays in the accessibility tree at all times; only controls in a faded beat leave the tab order
      const vis = o >= 0.5;
      if (vis !== b.vis) {
        b.vis = vis;
        b.el.classList.toggle("is-off", !vis);
        b.focusables.forEach((f) => {
          if (!vis) f.el.setAttribute("tabindex", "-1");
          else if (f.tab === null) f.el.removeAttribute("tabindex");
          else f.el.setAttribute("tabindex", f.tab);
        });
      }
    }
    this.el.dispatchEvent(new CustomEvent("film:progress", { detail: p }));
    if (!lowData) this.draw();
  }
}

export function initFilms(root: ParentNode = document) {
  const films = [...root.querySelectorAll<HTMLElement>(".film[data-film]")];
  if (!films.length) return [];
  if (reduce.matches) { films.forEach((f) => f.classList.add("is-static")); return []; }
  const list = films.filter((f) => FILMS[f.dataset.film!]).map((f) => new Film(f));
  onFrame({
    read: () => list.map((f) => f.measure()),
    write: (m: { p: number; near: boolean }[]) => list.forEach((f, i) => f.apply(m[i].p, m[i].near)),
  });
  return list;
}

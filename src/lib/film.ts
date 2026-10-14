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
   finishes. With prefers-reduced-motion the poster and all beats show statically. */

import catalog from "../media-catalog.json";

type FilmMeta = { frames: number; base: string; desktop: number; mobile: number };
const FILMS = catalog.films as Record<string, FilmMeta>;
const reduce = matchMedia("(prefers-reduced-motion: reduce)");

class Film {
  el: HTMLElement; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D;
  meta: FilmMeta; imgs: (HTMLImageElement | undefined)[] = []; ready: boolean[] = [];
  beats: { el: HTMLElement; a: number; b: number; f: number }[] = [];
  bar: HTMLElement | null; p = 0; drawn = -1; set: "d" | "m"; started = false; raf = 0;
  fit: "cover" | "contain"; focusX: number; focusY: number;

  constructor(el: HTMLElement) {
    this.el = el;
    this.meta = FILMS[el.dataset.film!];
    this.canvas = el.querySelector(".film-canvas")!;
    this.ctx = this.canvas.getContext("2d", { alpha: false })!;
    this.bar = el.querySelector(".film-progress i");
    this.fit = (el.dataset.fit as "cover" | "contain") || "cover";
    this.focusX = parseFloat(el.dataset.focusX || "0.5");
    this.focusY = parseFloat(el.dataset.focusY || "0.5");
    this.set = innerWidth * Math.min(devicePixelRatio, 2) > 1100 ? "d" : "m";
    this.beats = [...el.querySelectorAll<HTMLElement>(".beat")].map((b) => ({
      el: b, a: parseFloat(b.dataset.in || "0"), b: parseFloat(b.dataset.out || "1"), f: parseFloat(b.dataset.fade || "0.06"),
    }));
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    new IntersectionObserver((es) => es[0].isIntersecting && this.start(), { rootMargin: "150% 0px" }).observe(el);
  }

  src(i: number) { return `${this.meta.base}/${this.set}/${String(i).padStart(3, "0")}.webp`; }

  start() {
    if (this.started) return;
    this.started = true;
    const N = this.meta.frames;
    const order: number[] = [];
    for (const step of [8, 4, 2, 1]) for (let i = 0; i < N; i += step) if (!order.includes(i)) order.push(i);
    if (!order.includes(N - 1)) order.splice(1, 0, N - 1);
    let k = 0;
    const next = () => {
      if (k >= order.length) return;
      const i = order[k++];
      const im = new Image(); im.decoding = "async"; im.src = this.src(i);
      im.decode().then(() => { this.imgs[i] = im; this.ready[i] = true; if (Math.abs(i - this.target()) < 6 || this.drawn < 0) this.draw(true); })
        .catch(() => {}).finally(next);
    };
    for (let c = 0; c < 6; c++) next();
  }

  target() { return Math.round(this.p * (this.meta.frames - 1)); }

  nearest(t: number) {
    if (this.ready[t]) return t;
    for (let d = 1; d < this.meta.frames; d++) {
      if (this.ready[t - d]) return t - d;
      if (this.ready[t + d]) return t + d;
    }
    return -1;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
    this.draw(true);
  }

  draw(force = false) {
    const i = this.nearest(this.target());
    if (i < 0 || (!force && i === this.drawn)) return;
    const im = this.imgs[i]!; const { width: W, height: H } = this.canvas;
    const s = this.fit === "cover" ? Math.max(W / im.naturalWidth, H / im.naturalHeight) : Math.min(W / im.naturalWidth, H / im.naturalHeight);
    const w = im.naturalWidth * s, h = im.naturalHeight * s;
    this.ctx.fillStyle = getComputedStyle(this.el).getPropertyValue("--bg") || "#000";
    this.ctx.fillRect(0, 0, W, H);
    this.ctx.drawImage(im, (W - w) * this.focusX, (H - h) * this.focusY, w, h);
    this.drawn = i;
    if (!this.el.classList.contains("is-live")) this.el.classList.add("is-live");
  }

  update() {
    const r = this.el.getBoundingClientRect();
    const span = r.height - innerHeight;
    const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
    if (p === this.p && this.drawn >= 0) return;
    this.p = p;
    this.el.style.setProperty("--p", p.toFixed(4));
    if (this.bar) this.bar.style.setProperty("--p", p.toFixed(4));
    for (const b of this.beats) {
      // a beat that starts at 0 is already fully visible on arrival; one that ends at 1 stays visible at the end
      const fadeIn = b.a <= 0 ? 1 : (p - b.a) / b.f;
      const fadeOut = b.b >= 1 ? 1 : (b.b - p) / b.f;
      const o = p < b.a || p > b.b ? 0 : Math.max(0, Math.min(1, fadeIn, fadeOut));
      b.el.style.setProperty("--o", o.toFixed(3));
      b.el.toggleAttribute("inert", o < 0.5);
    }
    this.el.dispatchEvent(new CustomEvent("film:progress", { detail: p }));
    this.draw();
  }
}

export function initFilms(root: ParentNode = document) {
  const films = [...root.querySelectorAll<HTMLElement>(".film[data-film]")];
  if (!films.length) return [];
  if (reduce.matches) { films.forEach((f) => f.classList.add("is-static")); return []; }
  const list = films.filter((f) => FILMS[f.dataset.film!]).map((f) => new Film(f));
  let ticking = false;
  const tick = () => { ticking = false; list.forEach((f) => f.update()); };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(tick); } };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  tick();
  return list;
}

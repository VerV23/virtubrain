/* Shared UI behaviors for every page (local nav, galleries, tabs, FAQ, count-ups, line reveals,
   scroll-linked scale, steps, ink reading effect, copy buttons). Originally built for the inner pages.
   Every enhancement is progressive: the HTML is complete and readable without it, and
   prefers-reduced-motion turns the motion off while keeping the interactions. */

const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/* One rAF-throttled scroll/resize loop shared by every scroll-linked effect.
   onFrame({ read, write }) runs every subscriber's read first, then every write, so one subscriber's
   style writes never force layout for the next one's reads. onFrame(fn) (a single function) still works
   and runs after the two-phase subscribers. Frames are skipped when neither scroll nor size changed. */
type Phased = { read?: () => unknown; write?: (r: any) => void };
const phased: Phased[] = [];
const legacy = new Set<() => void>();
let ticking = false, lastY = NaN, dirty = true;
function run() {
  ticking = false;
  const y = scrollY;
  if (y === lastY && !dirty) return;
  lastY = y; dirty = false;
  const reads = phased.map((s) => s.read?.());
  phased.forEach((s, i) => s.write?.(reads[i]));
  legacy.forEach((f) => f());
}
function req() { if (!ticking) { ticking = true; requestAnimationFrame(run); } }
let wired = false;
function wire() {
  if (wired) return; wired = true;
  addEventListener("scroll", req, { passive: true });
  addEventListener("resize", () => { dirty = true; worldsStale = true; req(); });
  new ResizeObserver(() => { dirty = true; worldsStale = true; req(); }).observe(document.body);
}
export function onFrame(fn: (() => void) | Phased) {
  wire();
  if (typeof fn === "function") { legacy.add(fn); fn(); }
  else { phased.push(fn); const r = fn.read?.(); fn.write?.(r); }
}
/** ask for a frame even if nothing scrolled (after content changes size, for example) */
export function requestFrame() { dirty = true; req(); }

/* The skin (dark | light | navy) of whatever is painted at a viewport point, ignoring the given chrome.
   Uses a cached map of world sections in document coordinates (rebuilt on resize or when the page
   height changes), so asking every frame costs no hit-testing or layout. */
const WORLD_SKIN: Record<string, string> = {
  "w-void": "dark", "w-ink": "dark", "w-teal": "dark", "w-fog": "light", "w-light": "light", "w-paper": "light", "w-navy": "navy",
};
const WORLD_SEL = ".w-void, .w-ink, .w-teal, .w-fog, .w-light, .w-paper, .w-navy, [data-skin]";
type World = { el: HTMLElement; t: number; b: number; l: number; r: number; area: number; skin: string };
let worlds: World[] = [], worldsStale = true;
function mapWorlds() {
  const sy = scrollY, sx = scrollX;
  worlds = [...document.querySelectorAll<HTMLElement>(WORLD_SEL)].filter((el) => !el.closest("header.site-nav")).map((el) => {
    const r = el.getBoundingClientRect();
    const skin = el.dataset.skin || WORLD_SKIN[[...el.classList].find((c) => c in WORLD_SKIN) || ""] || "dark";
    return { el, t: r.top + sy, b: r.bottom + sy, l: r.left + sx, r: r.right + sx, area: r.width * r.height, skin };
  });
  worldsStale = false;
}
export function skinAt(x: number, y: number, ignore: Element[] = []): string {
  wire();
  if (worldsStale) mapWorlds();
  const dy = y + scrollY, dx = x + scrollX;
  let best: World | null = null;
  const minW = innerWidth * 0.5; // tiles and cards inside a section never decide the bar's skin
  for (const w of worlds) {
    if (w.r - w.l < minW && !w.el.dataset.skin) continue;
    if (dy < w.t || dy >= w.b || dx < w.l || dx >= w.r) continue;
    if (ignore.some((g) => g === w.el || g.contains(w.el))) continue;
    if (!best || w.area < best.area) best = w;
  }
  return best ? best.skin : "dark";
}

/* ---------- sticky local nav: highlights the section in view ----------
   <nav class="lnav" data-lnav data-skin-follow> also takes the skin of the section beneath it, so the
   global header (which reads the element under itself) and the local bar always match.
   Scroll work is two-phase: geometry is read in read(), classes and styles are written in write().
   Link offsets are measured only when the bar resizes, never during a scroll frame. */
export function initLocalNav() {
  const nav = document.querySelector<HTMLElement>("[data-lnav]");
  if (!nav) return;
  const follow = nav.hasAttribute("data-skin-follow");
  const chrome = [nav, ...document.querySelectorAll(".site-nav")];
  const list = nav.querySelector<HTMLElement>(".lnav-links")!;
  const links = [...list.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
  const secs = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))));
  const ind = document.createElement("span");
  ind.className = "lnav-ind instant";
  ind.setAttribute("aria-hidden", "true");
  list.append(ind);
  let geo = links.map(() => ({ l: 0, w: 0 })), overflow = false, listW = 0;
  let cur = -2;
  const place = () => {
    const g = geo[cur];
    if (!g) { ind.style.setProperty("--o", "0"); return; }
    ind.style.setProperty("--x", `${g.l}px`);
    ind.style.setProperty("--w", `${g.w}px`);
    ind.style.setProperty("--o", "1");
  };
  const measure = () => {
    geo = links.map((a) => ({ l: a.offsetLeft, w: a.offsetWidth }));
    listW = list.clientWidth;
    overflow = list.scrollWidth > listW + 2;
    list.classList.toggle("overflows", overflow);
    place();
  };
  const set = (i: number) => {
    if (i === cur) return;
    cur = i;
    links.forEach((a, k) => (k === i ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
    place();
    // on narrow screens the links may scroll: bring the active one fully into view, never half of one
    const g = geo[i];
    if (g && overflow) {
      const sl = list.scrollLeft;
      if (g.l < sl || g.l + g.w > sl + listW - 24) {
        list.scrollTo({ left: Math.max(0, g.l - (listW - g.w) / 2), behavior: reduce() ? "auto" : "smooth" });
      }
    }
  };
  onFrame({
    read: () => {
      const navBottom = nav.getBoundingClientRect().bottom;
      const line = navBottom + innerHeight * 0.22;
      let i = -1;
      secs.forEach((s, k) => { if (s && s.getBoundingClientRect().top <= line) i = k; });
      // past the end of the last section (CTA, footer): keep the last item lit only while it is on screen
      const last = secs[secs.length - 1];
      if (i === secs.length - 1 && last && last.getBoundingClientRect().bottom < navBottom) i = -1;
      return { i, skin: follow ? skinAt(innerWidth / 2, navBottom + 2, chrome) : "" };
    },
    write: ({ i, skin }: { i: number; skin: string }) => {
      if (follow && nav.dataset.skin !== skin) nav.dataset.skin = skin;
      set(i);
    },
  });
  new ResizeObserver(measure).observe(list);
  document.fonts?.ready.then(measure);
  requestAnimationFrame(() => requestAnimationFrame(() => ind.classList.remove("instant")));
}

/* ---------- horizontal galleries with paddles ---------- */
export function initGalleries(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-gallery]").forEach((g) => {
    const track = g.querySelector<HTMLElement>(".gal-track")!;
    const [prev, next] = [...g.querySelectorAll<HTMLButtonElement>(".paddle")];
    const items = [...track.children] as HTMLElement[];
    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      const scrollable = max > 4 && getComputedStyle(track).overflowX !== "visible";
      g.classList.toggle("no-scroll", !scrollable);
      if (prev) prev.disabled = !scrollable || track.scrollLeft <= 4;
      if (next) next.disabled = !scrollable || track.scrollLeft >= max - 4;
    };
    const go = (dir: number) => {
      const cs = getComputedStyle(track);
      const pad = parseFloat(cs.scrollPaddingLeft) || 0;
      const gap = parseFloat(cs.columnGap) || 0;
      const max = track.scrollWidth - track.clientWidth;
      const lefts = items.map((it) => Math.min(max, Math.max(0, it.offsetLeft - pad)));
      // page by as many whole cards as fit, the way Apple's galleries move
      const per = Math.max(1, Math.floor((track.clientWidth - pad + gap) / (items[0].offsetWidth + gap)));
      let idx = lefts.findIndex((l) => l >= track.scrollLeft - 4);
      if (idx < 0) idx = items.length - 1;
      const j = Math.min(items.length - 1, Math.max(0, idx + dir * per));
      track.scrollTo({ left: lefts[j], behavior: reduce() ? "auto" : "smooth" });
    };
    prev?.addEventListener("click", () => go(-1));
    next?.addEventListener("click", () => go(1));
    track.addEventListener("scroll", update, { passive: true });
    new ResizeObserver(update).observe(track);
    update();
  });
}

/* ---------- segmented tabs with a sliding pill and crossfading panels ---------- */
export function initTabs(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-tabs]").forEach((box) => {
    const seg = box.querySelector<HTMLElement>('[role="tablist"]')!;
    const tabs = [...seg.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")!));
    const pill = document.createElement("span");
    pill.className = "seg-pill instant";
    pill.setAttribute("aria-hidden", "true");
    seg.prepend(pill);
    seg.classList.add("has-pill");
    let cur = Math.max(0, tabs.findIndex((t) => t.getAttribute("aria-selected") === "true"));
    const place = () => {
      const t = tabs[cur];
      pill.style.setProperty("--x", `${t.offsetLeft - 4}px`);
      pill.style.setProperty("--w", `${t.offsetWidth}px`);
    };
    const select = (i: number, focus = false) => {
      cur = i;
      tabs.forEach((t, k) => {
        const on = k === i;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
      });
      // several tabs may drive one shared panel (a figure that redraws), so settle panels after the tabs
      panels.forEach((p) => p?.classList.remove("on"));
      panels[i]?.classList.add("on");
      panels[i]?.setAttribute("aria-labelledby", tabs[i].id);
      place();
      if (focus) tabs[i].focus();
      if (seg.scrollWidth > seg.clientWidth + 2) {
        const t = tabs[i];
        seg.scrollTo({ left: t.offsetLeft - (seg.clientWidth - t.offsetWidth) / 2, behavior: reduce() ? "auto" : "smooth" });
      }
      box.dispatchEvent(new CustomEvent("tabs:change", { detail: { index: i, id: tabs[i].dataset.key || tabs[i].id, tab: tabs[i] } }));
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(i));
      t.addEventListener("keydown", (e) => {
        const k = e.key;
        let j = -1;
        if (k === "ArrowRight" || k === "ArrowDown") j = (i + 1) % tabs.length;
        else if (k === "ArrowLeft" || k === "ArrowUp") j = (i - 1 + tabs.length) % tabs.length;
        else if (k === "Home") j = 0;
        else if (k === "End") j = tabs.length - 1;
        if (j >= 0) { e.preventDefault(); select(j, true); }
      });
    });
    select(cur);
    new ResizeObserver(place).observe(seg);
    document.fonts?.ready.then(place);
    requestAnimationFrame(() => requestAnimationFrame(() => pill.classList.remove("instant")));
  });
}

/* ---------- FAQ disclosures ---------- */
export function initFaq(root: ParentNode = document) {
  root.querySelectorAll<HTMLButtonElement>(".faq-q").forEach((b) => {
    b.addEventListener("click", () => {
      const item = b.closest(".faq-item")!;
      const open = !item.classList.contains("open");
      item.classList.toggle("open", open);
      b.setAttribute("aria-expanded", String(open));
    });
  });
}

/* ---------- count-up numerals ----------
   The real number stays in the HTML and the DOM until the numeral is about to scroll into view, so
   captures, reader modes and crawlers always read it. Just below the fold it is zeroed, then it counts
   up once on screen; if the reader turns back first, the real value is restored. Screen readers get
   the final value up front from an sr-only copy. Numbers with a comma keep it narrow (<span class="sep">).
   An inline numeral keeps the width of its final value while it counts, so the words after it never move. */
export function initCounts(root: ParentNode = document) {
  const els = [...root.querySelectorAll<HTMLElement>("[data-count]")];
  if (!els.length) return;
  const fmt = new Intl.NumberFormat("en-US");
  const show = (el: HTMLElement, v: number) => { el.innerHTML = fmt.format(v).replace(/,/g, '<span class="sep">,</span>'); };
  const run = (el: HTMLElement) => {
    const to = Number(el.dataset.count);
    const dur = Number(el.dataset.dur || 850);
    const t0 = performance.now();
    const step = (t: number) => {
      const k = clamp((t - t0) / dur);
      show(el, k >= 1 ? to : Math.round(to * (1 - Math.pow(2, -10 * k))));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  type St = { el: HTMLElement; to: number; state: "final" | "zero" | "done" };
  const items: St[] = [];
  els.forEach((el) => {
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = el.textContent;
    el.before(sr);
    el.setAttribute("aria-hidden", "true");
    const r = el.getBoundingClientRect();
    // on screen at load, or reduced motion: the real value simply stays
    if (reduce() || (r.top < innerHeight && r.bottom > 0)) return;
    if (getComputedStyle(el).display === "inline") { el.style.display = "inline-block"; el.style.minWidth = `${r.width}px`; }
    items.push({ el, to: Number(el.dataset.count), state: "final" });
  });
  if (!items.length) return;
  onFrame({
    read: () => {
      const vh = innerHeight;
      return items.map((it) => {
        if (it.state === "done") return "";
        const r = it.el.getBoundingClientRect();
        if (r.top < vh * 0.88 && r.bottom > 0) return "run";
        if (r.top >= vh && r.top < vh * 1.35) return "zero";
        return "final";
      });
    },
    write: (next: string[]) => items.forEach((it, k) => {
      const n = next[k];
      if (!n || it.state === "done") return;
      if (n === "run") { it.state = "done"; run(it.el); }
      else if (n === "zero" && it.state !== "zero") { it.state = "zero"; show(it.el, 0); }
      else if (n === "final" && it.state === "zero") { it.state = "final"; show(it.el, it.to); }
    }),
  });
}

/* ---------- headline line reveals and one-shot section reveals ----------
   Split-line headlines are written as <span class="ln"><span>…</span></span> per line. A space is kept
   between lines so the accessible name, copy-paste and reader modes read "one process. Prove it",
   never "process.Prove". */
export function spaceLines(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(".ln").forEach((ln) => {
    const prev = ln.previousSibling;
    if (prev && prev.nodeType === 1 && (prev as Element).classList.contains("ln")) ln.before(document.createTextNode(" "));
  });
}
export function initLines(root: ParentNode = document) {
  spaceLines(root);
  const els = [...root.querySelectorAll<HTMLElement>(".lines, [data-reveal]")];
  if (!els.length || reduce()) return;
  document.documentElement.classList.add("ln-armed");
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -8% 0px" });
  els.forEach((el) => {
    el.querySelectorAll<HTMLElement>(".ln").forEach((ln, i) => ln.style.setProperty("--li", String(i)));
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.9) el.classList.add("in"); else io.observe(el);
  });
}

/* ---------- scroll-linked: image settle (zoom) and the hero frame that opens to full bleed ----------
   Only transforms and clip-paths change, so nothing here can move the layout. */
export function initScrub(root: ParentNode = document) {
  if (reduce()) return;
  const zooms = [...root.querySelectorAll<HTMLElement>("[data-zoom]")];
  const expands = [...root.querySelectorAll<HTMLElement>("[data-expand]")];
  if (!zooms.length && !expands.length) return;
  const live = new Set<HTMLElement>();
  const last = new WeakMap<HTMLElement, string>();
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) live.add(e.target as HTMLElement); else live.delete(e.target as HTMLElement); });
    requestFrame();
  }, { rootMargin: "15% 0px" });
  zooms.forEach((z) => io.observe(z));
  let lastE = "";
  onFrame({
    read: () => {
      const vh = innerHeight;
      const z: [HTMLElement, string][] = [];
      live.forEach((el) => {
        const r = el.getBoundingClientRect();
        // 0 as the element enters from the bottom, 1 once its center reaches the middle of the screen
        const p = clamp((vh - r.top) / (vh / 2 + r.height / 2));
        z.push([el, (1 + parseFloat(el.dataset.zoom || "0.1") * (1 - easeOut(p))).toFixed(4)]);
      });
      // the hero frame opens to full bleed over the first ~45% of a screen of scrolling
      return { z, e: expands.length ? easeOut(clamp(scrollY / (vh * 0.45))).toFixed(4) : "" };
    },
    write: ({ z, e }: { z: [HTMLElement, string][]; e: string }) => {
      z.forEach(([el, v]) => { if (last.get(el) !== v) { last.set(el, v); el.style.setProperty("--zoom", v); } });
      if (e && e !== lastE) { lastE = e; expands.forEach((el) => el.style.setProperty("--e", e)); }
    },
  });
}

/* ---------- sticky storytelling: steps scroll past, media crossfades ---------- */
export function initSteps(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-steps]").forEach((box) => {
    const steps = [...box.querySelectorAll<HTMLElement>(".step")];
    const media = [...box.querySelectorAll<HTMLElement>(".steps-media img")];
    const bars = [...box.querySelectorAll<HTMLElement>(".ticks-bar span")];
    let cur = -1;
    const set = (i: number) => {
      if (i === cur) return;
      cur = i;
      steps.forEach((s, k) => s.classList.toggle("on", k === i));
      media.forEach((m, k) => m.classList.toggle("on", k === i));
      bars.forEach((b, k) => b.classList.toggle("done", k <= i));
    };
    onFrame({
      read: () => {
        const mid = innerHeight * 0.55;
        let i = 0;
        steps.forEach((s, k) => { if (s.getBoundingClientRect().top < mid) i = k; });
        return i;
      },
      write: set,
    });
  });
}

/* ---------- Apple-style "ink" paragraph: words darken as you read down ---------- */
export function initInk(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-ink]").forEach((p) => {
    if (reduce()) return;
    const text = p.textContent!.replace(/\s+/g, " ").trim();
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = text;
    const vis = document.createElement("span");
    vis.setAttribute("aria-hidden", "true");
    const words = text.split(" ").map((w) => { const s = document.createElement("span"); s.className = "w"; s.textContent = w; return s; });
    words.forEach((w, i) => { vis.append(w); if (i < words.length - 1) vis.append(" "); });
    p.replaceChildren(sr, vis);
    let lit = -1;
    onFrame({
      read: () => {
        const r = p.getBoundingClientRect();
        const vh = innerHeight;
        return Math.round(clamp((vh * 0.82 - r.top) / (r.height + vh * 0.3)) * words.length);
      },
      write: (n: number) => {
        if (n === lit) return;
        const from = Math.min(n, Math.max(lit, 0)), to = Math.max(n, lit);
        lit = n;
        for (let i = from; i < to && i < words.length; i++) words[i].classList.toggle("on", i < n);
      },
    });
  });
}

/* ---------- copy-to-clipboard: <button data-copy="text"> or <button data-copy-from="element-id"> ---------- */
export function initCopy(root: ParentNode = document) {
  root.querySelectorAll<HTMLButtonElement>("[data-copy], [data-copy-from]").forEach((b) => {
    const label = b.textContent;
    b.addEventListener("click", async () => {
      const text = b.dataset.copy ?? document.getElementById(b.dataset.copyFrom!)?.textContent?.trim() ?? "";
      try {
        await navigator.clipboard.writeText(text);
        b.textContent = "Copied";
      } catch {
        b.textContent = "Press Ctrl+C to copy";
        const sel = getSelection();
        const target = b.parentElement?.querySelector("a");
        if (sel && target) { const range = document.createRange(); range.selectNodeContents(target); sel.removeAllRanges(); sel.addRange(range); }
      }
      setTimeout(() => (b.textContent = label), 2200);
    });
  });
}

export function initInner() {
  initLocalNav();
  initGalleries();
  initTabs();
  initFaq();
  initCounts();
  initLines();
  initScrub();
  initSteps();
  initInk();
  initCopy();
}

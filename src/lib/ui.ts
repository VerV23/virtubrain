/* Shared UI behaviours for every page (local nav, galleries, tabs, FAQ, count-ups, line reveals,
   scroll-linked scale, steps, ink reading effect, copy buttons). Originally built for the inner pages.
   Every enhancement is progressive: the HTML is complete and readable without it, and
   prefers-reduced-motion turns the motion off while keeping the interactions. */

const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/* one rAF-throttled scroll/resize loop shared by every scroll-linked effect */
const subs = new Set<() => void>();
let ticking = false;
export function onFrame(fn: () => void) {
  if (!subs.size) {
    const run = () => { ticking = false; subs.forEach((f) => f()); };
    const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(run); } };
    addEventListener("scroll", req, { passive: true });
    addEventListener("resize", req);
  }
  subs.add(fn);
  fn();
}

/* ---------- sticky local nav: highlights the section in view ---------- */
export function initLocalNav() {
  const nav = document.querySelector<HTMLElement>("[data-lnav]");
  if (!nav) return;
  const list = nav.querySelector<HTMLElement>(".lnav-links")!;
  const links = [...list.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
  const secs = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))));
  const ind = document.createElement("span");
  ind.className = "lnav-ind instant";
  ind.setAttribute("aria-hidden", "true");
  list.append(ind);
  let cur = -2;
  const place = () => {
    const a = links[cur];
    if (!a) { ind.style.setProperty("--o", "0"); return; }
    ind.style.setProperty("--x", `${a.offsetLeft}px`);
    ind.style.setProperty("--w", `${a.offsetWidth}px`);
    ind.style.setProperty("--o", "1");
  };
  const set = (i: number) => {
    if (i === cur) return;
    cur = i;
    links.forEach((a, k) => (k === i ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
    place();
    // on narrow screens the links may scroll: bring the active one fully into view, never half of one
    const a = links[i];
    if (a && list.scrollWidth > list.clientWidth + 2) {
      const l = a.offsetLeft, r = l + a.offsetWidth;
      if (l < list.scrollLeft || r > list.scrollLeft + list.clientWidth - 24) {
        list.scrollTo({ left: Math.max(0, l - (list.clientWidth - a.offsetWidth) / 2), behavior: reduce() ? "auto" : "smooth" });
      }
    }
  };
  onFrame(() => {
    const line = nav.getBoundingClientRect().bottom + innerHeight * 0.22;
    let i = -1;
    secs.forEach((s, k) => { if (s && s.getBoundingClientRect().top <= line) i = k; });
    // past the end of the last section (CTA, footer): keep the last item lit only while it is on screen
    const last = secs[secs.length - 1];
    if (i === secs.length - 1 && last && last.getBoundingClientRect().bottom < nav.getBoundingClientRect().bottom) i = -1;
    set(i);
  });
  const fit = () => { list.classList.toggle("overflows", list.scrollWidth > list.clientWidth + 2); place(); };
  new ResizeObserver(fit).observe(list);
  document.fonts?.ready.then(fit);
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
      box.dispatchEvent(new CustomEvent("tabs:change", { detail: { index: i, id: tabs[i].dataset.key || tabs[i].id } }));
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

/* ---------- count-up numerals (screen readers get the final value up front) ---------- */
export function initCounts(root: ParentNode = document) {
  const els = [...root.querySelectorAll<HTMLElement>("[data-count]")];
  if (!els.length) return;
  const fmt = new Intl.NumberFormat("en-US");
  const run = (el: HTMLElement) => {
    const to = Number(el.dataset.count);
    const dur = Number(el.dataset.dur || 850);
    const t0 = performance.now();
    const step = (t: number) => {
      const k = clamp((t - t0) / dur);
      const v = k >= 1 ? to : Math.round(to * (1 - Math.pow(2, -10 * k)));
      // digits only, so building markup is safe; the comma gets proportional spacing
      el.innerHTML = fmt.format(v).replace(/,/g, '<span class="sep">,</span>');
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { io.unobserve(e.target); run(e.target as HTMLElement); }
  }), { threshold: 0.3 });
  els.forEach((el) => {
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = el.textContent;
    el.before(sr);
    el.setAttribute("aria-hidden", "true");
    if (reduce()) return;
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0) return; // already on screen at load: leave the final value
    el.textContent = "0";
    io.observe(el);
  });
}

/* ---------- headline line reveals and one-shot section reveals ---------- */
export function initLines(root: ParentNode = document) {
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

/* ---------- scroll-linked: image settle (zoom) and the hero frame that opens to full bleed ---------- */
export function initScrub(root: ParentNode = document) {
  if (reduce()) return;
  const zooms = [...root.querySelectorAll<HTMLElement>("[data-zoom]")];
  const expands = [...root.querySelectorAll<HTMLElement>("[data-expand]")];
  const live = new Set<HTMLElement>();
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) live.add(e.target as HTMLElement); else live.delete(e.target as HTMLElement);
  }), { rootMargin: "15% 0px" });
  zooms.forEach((z) => io.observe(z));
  onFrame(() => {
    const vh = innerHeight;
    live.forEach((el) => {
      const r = el.getBoundingClientRect();
      // 0 as the element enters from the bottom, 1 once its centre reaches the middle of the screen
      const p = clamp((vh - r.top) / (vh / 2 + r.height / 2));
      const amt = parseFloat(el.dataset.zoom || "0.1");
      el.style.setProperty("--z", (1 + amt * (1 - easeOut(p))).toFixed(4));
    });
    // the hero frame opens to full bleed over the first ~45% of a screen of scrolling
    const e = easeOut(clamp(scrollY / (vh * 0.45))).toFixed(4);
    expands.forEach((el) => el.style.setProperty("--e", e));
  });
}

/* ---------- sticky storytelling: steps scroll past, media crossfades ---------- */
export function initSteps(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-steps]").forEach((box) => {
    const steps = [...box.querySelectorAll<HTMLElement>(".step")];
    const media = [...box.querySelectorAll<HTMLElement>(".steps-media img")];
    const bars = [...box.querySelectorAll<HTMLElement>(".ticks-bar span")];
    const set = (i: number) => {
      steps.forEach((s, k) => s.classList.toggle("on", k === i));
      media.forEach((m, k) => m.classList.toggle("on", k === i));
      bars.forEach((b, k) => b.classList.toggle("done", k <= i));
    };
    set(0);
    onFrame(() => {
      const mid = innerHeight * 0.55;
      let i = 0;
      steps.forEach((s, k) => { if (s.getBoundingClientRect().top < mid) i = k; });
      set(i);
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
    onFrame(() => {
      const r = p.getBoundingClientRect();
      const vh = innerHeight;
      const k = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.3));
      const n = Math.round(k * words.length);
      if (n === lit) return;
      lit = n;
      words.forEach((w, i) => w.classList.toggle("on", i < n));
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

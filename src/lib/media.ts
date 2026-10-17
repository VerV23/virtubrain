/* Responsive images from the media catalog.
   In HTML, write a placeholder and let hydrateImages() fill it in at load:
     <img data-still="atlas-tower" data-sizes="(min-width: 900px) 50vw, 100vw" alt="">   (alt from catalog if empty)
   Or build markup in TS with picture("atlas-tower", { sizes, eager, className }).
   Every still exists at the widths listed in src/media-catalog.json, as /media/img/<name>-<width>.webp. */
import catalog from "../media-catalog.json";

export type Still = { w: number; h: number; widths: number[]; world: string; alt: string; src: string };
export const STILLS = catalog.stills as Record<string, Still>;
export const LOOPS = catalog.loops as Record<string, { mp4: string; webm: string; poster: string; alt: string }>;

export function srcset(name: string) {
  const s = STILLS[name];
  if (!s) throw new Error(`Unknown still: ${name}`);
  return s.widths.map((w) => `${s.src}-${w}.webp ${w}w`).join(", ");
}
export function bestSrc(name: string, want = 1600) {
  const s = STILLS[name];
  const w = s.widths.find((x) => x >= want) ?? s.widths[s.widths.length - 1];
  return `${s.src}-${w}.webp`;
}

export function picture(name: string, o: { sizes?: string; eager?: boolean; className?: string; alt?: string; pos?: string } = {}) {
  const s = STILLS[name];
  const alt = (o.alt ?? s.alt).replace(/"/g, "&quot;");
  return `<img src="${bestSrc(name, 1024)}" srcset="${srcset(name)}" sizes="${o.sizes ?? "100vw"}" width="${s.w}" height="${s.h}" alt="${alt}"` +
    (o.className ? ` class="${o.className}"` : "") + (o.pos ? ` style="object-position:${o.pos}"` : "") +
    (o.eager ? ` fetchpriority="high"` : ` loading="lazy" decoding="async"`) + ">";
}

export function hydrateImages(root: ParentNode = document) {
  root.querySelectorAll<HTMLImageElement>("img[data-still]").forEach((img) => {
    const name = img.dataset.still!; const s = STILLS[name];
    if (!s) { console.warn("unknown still", name); return; }
    img.srcset = srcset(name);
    img.sizes = img.dataset.sizes || "100vw";
    if (!img.getAttribute("alt")) img.alt = s.alt;
    img.width = s.w; img.height = s.h;
    if (!img.hasAttribute("fetchpriority")) { img.loading = "lazy"; img.decoding = "async"; }
    img.src = bestSrc(name, 1024);
  });
}

/* Muted ambient loops: <video data-loop="dial"></video>. Plays only while on screen; a visible
   pause button is added for users who want motion stopped (WCAG 2.2.2). */
export function hydrateLoops(root: ParentNode = document) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.querySelectorAll<HTMLVideoElement>("video[data-loop]").forEach((v) => {
    const l = LOOPS[v.dataset.loop!]; if (!l) return;
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = "none"; v.poster = l.poster;
    v.setAttribute("aria-label", l.alt);
    v.innerHTML = `<source src="${l.webm}" type="video/webm"><source src="${l.mp4}" type="video/mp4">`;
    if (reduce) return;
    let userPaused = false;
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "loop-toggle";
    const what = (v.dataset.label || l.alt.replace(/\.$/, "")).toLowerCase();
    btn.setAttribute("aria-label", `Pause video: ${what}`);
    btn.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="3" width="2.6" height="10" rx="1"/><rect x="9.4" y="3" width="2.6" height="10" rx="1"/></svg>`;
    btn.addEventListener("click", () => {
      userPaused = !v.paused;
      if (userPaused) { v.pause(); btn.setAttribute("aria-label", `Play video: ${what}`); btn.classList.add("paused"); }
      else { v.play().catch(() => {}); btn.setAttribute("aria-label", `Pause video: ${what}`); btn.classList.remove("paused"); }
    });
    v.after(btn);
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !userPaused) { v.preload = "auto"; v.play().catch(() => {}); } else v.pause();
    }, { threshold: 0.2 }).observe(v);
  });
}

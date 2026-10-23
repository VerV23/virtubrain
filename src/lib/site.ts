/* Shared behaviour for every marketing page: header, reveals, media hydration, films.
   Each page entry does:  import "../styles/base.css"; import { boot } from "../lib/site"; boot();
   Scroll-linked work anywhere on the site should register with onFrame() from ./ui so the page
   runs one rAF loop (reads first, then writes) instead of many competing ones. */
import { hydrateImages, hydrateLoops } from "./media";
import { initFilms } from "./film";
import { onFrame, skinAt } from "./ui";

export function boot() {
  document.documentElement.classList.add("js");
  initNav();
  hydrateImages();
  hydrateLoops();
  initReveals();
  initFilms();
}

const WORLD_SKIN: Record<string, "dark" | "light" | "navy"> = {
  "w-void": "dark", "w-ink": "dark", "w-teal": "dark", "w-fog": "light", "w-light": "light", "w-paper": "light", "w-navy": "navy",
};

function initNav() {
  const nav = document.querySelector<HTMLElement>("header.site-nav");
  if (!nav) return;
  const btn = nav.querySelector<HTMLButtonElement>(".nav-toggle")!;
  const links = nav.querySelector<HTMLElement>("#nav-links")!;
  const outside = () => [...document.querySelectorAll<HTMLElement>("main, footer, .lnav, [data-lnav], .skip")].filter((el) => !nav.contains(el));
  const setOpen = (open: boolean, restoreFocus = true) => {
    nav.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", open ? "Close menu" : "Menu");
    document.documentElement.classList.toggle("menu-open", open);
    outside().forEach((el) => el.toggleAttribute("inert", open));
    if (open) links.querySelector<HTMLElement>("a")?.focus();
    else if (restoreFocus) btn.focus();
  };
  btn.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
  links.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setOpen(false, false)));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && nav.classList.contains("is-open")) setOpen(false); });
  matchMedia("(min-width: 861px)").addEventListener("change", (m) => { if (m.matches && nav.classList.contains("is-open")) setOpen(false, false); });

  // The bar tucks away while reading down and returns on any upward scroll, and takes the colour of
  // the section beneath it (dark, light or navy) the way apple.com's bar does.
  let last = scrollY, skin = "";
  let chromeEls: Element[] | null = null; // the bars to look past; static markup, so collected once
  const chrome = () => (chromeEls ??= [nav, ...document.querySelectorAll(".lnav, [data-lnav]")]);
  onFrame({
    read: () => ({ y: scrollY, h: nav.offsetHeight, focus: nav.matches(":focus-within") }),
    write: ({ y, h, focus }: { y: number; h: number; focus: boolean }) => {
      if (!nav.classList.contains("is-open") && !focus) {
        if (y > 320 && y > last + 4) nav.classList.add("is-hidden");
        else if (y < last - 4 || y <= 320) nav.classList.remove("is-hidden");
      }
      last = y;
      const next = skinAt(innerWidth / 2, Math.max(1, h - 4), chrome());
      if (next !== skin) { skin = next; nav.dataset.skin = next; document.documentElement.dataset.navSkin = next; }
    },
  });
}

function initReveals() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const els = document.querySelectorAll<HTMLElement>(".rv");
  if (!els.length || !("IntersectionObserver" in window)) return;
  document.documentElement.classList.add("rv-armed");
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -12% 0px" });
  els.forEach((el) => {
    // anything already on screen at load shows immediately, so the first frame is complete
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.95) el.classList.add("in"); else io.observe(el);
  });
}

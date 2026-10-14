/* Shared behaviour for every marketing page: header, reveals, media hydration, films.
   Each page entry does:  import "../styles/base.css"; import { boot } from "../lib/site"; boot();  */
import { hydrateImages, hydrateLoops } from "./media";
import { initFilms } from "./film";

export function boot() {
  document.documentElement.classList.add("js");
  initNav();
  hydrateImages();
  hydrateLoops();
  initReveals();
  initFilms();
}

function initNav() {
  const nav = document.querySelector<HTMLElement>("[data-nav]");
  if (!nav) return;
  const btn = nav.querySelector<HTMLButtonElement>(".nav-toggle")!;
  const close = () => { nav.classList.remove("is-open"); btn.setAttribute("aria-expanded", "false"); document.body.style.overflow = ""; };
  btn.addEventListener("click", () => {
    const open = !nav.classList.contains("is-open");
    nav.classList.toggle("is-open", open); btn.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
  });
  nav.querySelectorAll("#nav-links a").forEach((a) => a.addEventListener("click", close));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && nav.classList.contains("is-open")) { close(); btn.focus(); } });

  // Apple-style: the bar tucks away while reading down and returns on any upward scroll.
  let last = scrollY;
  addEventListener("scroll", () => {
    const y = scrollY;
    if (!nav.classList.contains("is-open") && !nav.matches(":focus-within")) nav.classList.toggle("is-hidden", y > 320 && y > last + 4);
    if (y < last - 4) nav.classList.remove("is-hidden");
    last = y;
  }, { passive: true });
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

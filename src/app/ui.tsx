/* Shared app components: icons, function icon masks, highlights, stills, states. */
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { STILLS, srcset, bestSrc } from "../lib/media";
import { splitMatches } from "./search";
import { humanizeTitle, humanizeImpact, wrapperOf, isTaskItself, whereInTask, IMPACT_PREFIX, type Severity, type Zone, type PainPoint } from "../lib/data";
import { taxIdx } from "./state";

/* ---- Icons: 16px line glyphs drawn on a 16 grid, stroke = currentColor ---------------------- */
const P: Record<string, JSX.Element> = {
  search: <><circle cx="7" cy="7" r="4.6" /><path d="m10.4 10.4 3.6 3.6" /></>,
  back: <path d="M10 3 5 8l5 5" />,
  chevron: <path d="m6 3.5 4.5 4.5L6 12.5" />,
  down: <path d="m3.5 6 4.5 4.5L12.5 6" />,
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  copy: <><rect x="5.5" y="5.5" width="8" height="8" rx="1.6" /><path d="M10.5 3.2V3a.9.9 0 0 0-.9-.9H3a.9.9 0 0 0-.9.9v6.6c0 .5.4.9.9.9h.3" /></>,
  link: <><path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.7.7" /><path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l.7-.7" /></>,
  check: <path d="m3 8.4 3.2 3.1L13 4.6" />,
  xray: <><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M6.2 2.5v11M9.8 2.5v11" /></>,
  filter: <path d="M2.5 4h11M4.8 8h6.4M7 12h2" />,
  undo: <><path d="M5.5 3.5 2.8 6.2l2.7 2.7" /><path d="M3 6.2h6.3a3.7 3.7 0 0 1 0 7.4H7" /></>,
  arrowRight: <path d="M3 8h9.5M9 4.5 12.5 8 9 11.5" />,
  arrowLeft: <path d="M13 8H3.5M7 4.5 3.5 8 7 11.5" />,
  keyboard: <><rect x="1.8" y="4" width="12.4" height="8" rx="1.6" /><path d="M4.5 6.6h.01M7 6.6h.01M9.5 6.6h.01M12 6.6h-.5M5 9.4h6" /></>,
  flag: <><path d="M4 14V2.6" /><path d="M4 3h7.4l-1.6 2.6L11.4 8H4" /></>,
  mail: <><rect x="2" y="3.5" width="12" height="9" rx="1.6" /><path d="m2.6 4.6 5.4 4 5.4-4" /></>,
  reset: <><path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.8" /><path d="M2.6 2.2v2.6h2.6" /></>,
  move: <><path d="M5 4.5 2.5 8 5 11.5M11 4.5 13.5 8 11 11.5" /><path d="M2.8 8h10.4" /></>,
  lens: <><circle cx="8" cy="8" r="5.6" /><path d="M8 2.4v2.2M8 11.4v2.2M2.4 8h2.2M11.4 8h2.2" /><circle cx="8" cy="8" r="1.4" /></>,
};
export function Icon({ name, class: cls = "" }: { name: keyof typeof P | string; class?: string }) {
  return (
    <svg class={`ico ${cls}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">{P[name]}</svg>
  );
}

/** A function's line icon from /media/icons, drawn as a CSS mask so it takes currentColor. */
export function FnIcon({ id, class: cls = "" }: { id: string; class?: string }) {
  return <span class={`fn-ico ${cls}`} aria-hidden="true" style={{ "--icon": `url("/media/icons/${id}.webp")` }} />;
}

/** Highlight query matches; `hl` holds regex sources from search.compile(). */
export function Hl({ text, hl }: { text: string; hl: string[] }) {
  if (!hl.length) return <>{text}</>;
  return <>{splitMatches(text, hl).map((p, i) => (p.m ? <mark key={i}>{p.t}</mark> : p.t))}</>;
}

/* ---- pain-point wording, shared by every view ------------------------------------------------------ */
export const Ill = () => <span class="ill">Illustrative</span>;
/* the wording helpers run a dozen regexes per record; each record is rewritten once and cached */
const titleMemo = new WeakMap<PainPoint, string>(), impactMemo = new WeakMap<PainPoint, string>();
export const painTitle = (p: PainPoint) => { let t = titleMemo.get(p); if (t === undefined) { t = humanizeTitle(p.title, p.taskName); titleMemo.set(p, t); } return t; };
export function painImpact(p: PainPoint) {
  const hit = impactMemo.get(p); if (hit !== undefined) return hit;
  const s = impactText(p); if (taxIdx.peek()) impactMemo.set(p, s); return s; // KPI wording needs the taxonomy
}
function impactText(p: PainPoint) {
  const kpis = taxIdx.value?.resolve(p.processId, p.functionId)?.proc.calibration.kpis || [];
  const s = humanizeImpact(p.impact, kpis);
  // records on the standard steps sit at task level, so their impact speaks of the task
  return wrapperOf(p.stepText) ? s.replace(/\bat this step\b/g, "in this task").replace(/\bthis (manual )?step\b/g, "this $1task").replace(/^This step\b/, "This task") : s;
}
/** Where a point sits: its exact step for core steps, task level for the standard steps. */
export function painWhere(p: PainPoint): { wrapper: boolean; itself: boolean; text: string } {
  const w = wrapperOf(p.stepText);
  if (w) return { wrapper: true, itself: false, text: `${whereInTask(p.stepText, p.category)} (standard step)` };
  if (isTaskItself(p.stepText, p.taskName)) {
    const proc = taxIdx.value?.resolve(p.processId, p.functionId)?.proc;
    const n = proc?.activities.flatMap((a) => a.tasks).find((t) => t.id === p.taskId)?.steps.length || 5;
    return { wrapper: false, itself: true, text: `Step ${p.stepIndex + 1} of ${n}: the task itself` };
  }
  return { wrapper: false, itself: false, text: `Step ${p.stepIndex + 1}` };
}
export const Impact = ({ p, hl = [] }: { p: PainPoint; hl?: string[] }) => (
  <p class="impact"><span class="impact-pre">{IMPACT_PREFIX}</span> <Hl text={painImpact(p)} hl={hl} /></p>
);
/** Contact link for a process, or for one failure point: then it carries the step (or task) and the title. */
export function talkHref(p: { processId: string; functionId: string; taskId?: string; stepIndex?: number; stepText?: string; title?: string; taskName?: string }) {
  let href = `/contact/?process=${encodeURIComponent(p.processId)}&fn=${encodeURIComponent(p.functionId)}`;
  if (p.taskId && p.stepText !== undefined) {
    const onTask = !!wrapperOf(p.stepText);
    href += `&step=${encodeURIComponent(onTask ? p.taskId : `${p.taskId}.${(p.stepIndex ?? 0) + 1}`)}`;
    if (p.title) href += `&about=${encodeURIComponent(humanizeTitle(p.title, p.taskName || "").slice(0, 160))}`;
  }
  return href;
}
/** "Talk to us about this step" for core steps, "this task" for points on the standard steps. */
export const talkLabel = (p: { stepText: string }) => `Talk to us about this ${wrapperOf(p.stepText) ? "task" : "step"}`;

export function Still({ name, sizes = "320px", class: cls = "", alt }: { name: string; sizes?: string; class?: string; alt?: string }) {
  const s = STILLS[name];
  if (!s) return null;
  return <img class={`still ${cls}`} src={bestSrc(name, 640)} srcset={srcset(name)} sizes={sizes} width={s.w} height={s.h} alt={alt ?? s.alt} loading="lazy" decoding="async" />;
}

export const SevMark = ({ sev, label = true }: { sev: Severity; label?: boolean }) => (
  <span class={`sev sev-${sev}`}><i aria-hidden="true" />{label ? `${sev}` : <span class="sr-only">{sev} severity</span>}</span>
);

export const ZoneMark = ({ zone, label }: { zone: Zone; label: string }) => (
  <span class={`zmark z-${zone}`}><i aria-hidden="true" />{label}</span>
);

export function Empty({ still, title, children, action }: { still: string; title: string; children?: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class="state">
      <div class="state-art"><Still name={still} sizes="220px" alt="" /></div>
      <h3 class="state-title">{title}</h3>
      {children && <div class="state-text">{children}</div>}
      {action && <div class="state-actions">{action}</div>}
    </div>
  );
}

export function ErrorState({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div class="state state-error" role="alert">
      <div class="state-art"><Still name="atlas-book" sizes="220px" alt="" /></div>
      <h3 class="state-title">{what} didn't load.</h3>
      <p class="state-text">The connection dropped before the data arrived. Your place is kept in the address bar, so trying again picks up where you were.</p>
      <div class="state-actions"><button type="button" class="b b-primary" onClick={onRetry}><Icon name="reset" />Try again</button></div>
    </div>
  );
}

/** Skeleton lines: n rows of shimmering bars with varied widths so it reads as text, not a grid. */
export function Skel({ rows = 6, class: cls = "" }: { rows?: number; class?: string }) {
  const widths = [92, 74, 86, 61, 80, 68, 90, 56, 77, 84];
  return (
    <div class={`skel ${cls}`} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => <span key={i} style={{ width: `${widths[i % widths.length]}%` }} />)}
    </div>
  );
}

/** Animate a number toward its target (respects reduced motion). */
export function useTween(target: number, ms = 420) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || from.current === target) { from.current = target; setV(target); return; }
    const a = from.current, t0 = performance.now(); let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms); const e = 1 - Math.pow(1 - k, 3);
      const x = a + (target - a) * e; setV(x); from.current = x;
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

export const plural = (n: number, one: string, many = one + "s") => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
export const pct = (n: number, total: number) => (total ? Math.round((100 * n) / total) : 0);

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch { return false; }
}

export const isTyping = (e: Event) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
};
export const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

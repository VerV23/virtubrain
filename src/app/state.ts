/* App state. The URL hash is the single source of truth for what is on screen, so every view is
   linkable and Back/Forward work:
     #view=explore&fn=finance-accounting&p=8.1.1&s=8.1.1.2.2.4&tab=lens&ind=retail&cty=PH&cmp=1&q=close
     #view=pain&pf=procurement&pc=handoff-friction&sev=High,Medium&pq=invoice&sort=sev   (fn= works as pf=)
     #view=xray&fn=finance-accounting&p=8.1.1&basis=all&only=1&z=8.1.1.2.2.4-h_8.1.1.1.1.2-a
   Navigation pushes a history entry; typing, filters and zone moves replace the current one. Links that
   name something that does not exist are corrected to what is shown, with a toast that says so. */
import { signal, computed, batch, effect } from "@preact/signals";
import {
  loadTaxonomy, loadPain, indexTaxonomy, indexPain, procKey, zoneOf, isWrapper, INDUSTRIES, COUNTRIES, SEVERITIES, ZONE_ORDER, CATEGORY_LABELS,
  type Taxonomy, type TaxonomyIndex, type PainLibrary, type PainIndex, type Industry, type Country, type Severity, type Zone, type ProcRef,
} from "../lib/data";

export type View = "explore" | "pain" | "xray";
export type SortKey = "sev" | "proc" | "cat";
export type DetailTab = "steps" | "lens" | "kpis" | "pain";
export type Basis = "core" | "all";
export interface Route {
  view: View; fn?: string; p?: string; s?: string; ind: Industry; cty: Country; q: string; tab: DetailTab; cmp: boolean;
  pf?: string; pc?: string; sev: Severity[]; pq: string; sort: SortKey;
  z: Record<string, Zone>; basis: Basis; only: boolean;
  badView?: string;
}
export const VIEWS: { id: View; label: string; key: string }[] = [
  { id: "explore", label: "Explore", key: "e" },
  { id: "pain", label: "Failure points", key: "p" },
  { id: "xray", label: "X-ray", key: "x" },
];
export const DEFAULT_FN = "finance-accounting";
export const DEFAULT_PROC = "8.1.1";
const TABS: DetailTab[] = ["steps", "lens", "kpis", "pain"];
const ZCODE: Record<Zone, string> = { auto: "a", assist: "s", human: "h" };
const ZDECODE: Record<string, Zone> = { a: "auto", s: "assist", h: "human" };

export function parse(hash: string): Route {
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  const get = (k: string) => (h.get(k) || "").trim() || undefined;
  const rawView = get("view");
  const view = (["explore", "pain", "xray"] as View[]).find((v) => v === rawView) || "explore";
  const ind = (get("ind") as Industry) in INDUSTRIES ? (get("ind") as Industry) : "retail";
  const ctyRaw = (get("cty") || "").toUpperCase();
  const cty = (ctyRaw in COUNTRIES ? ctyRaw : "PH") as Country;
  const sev = (get("sev") || "").split(",").map((x) => x.trim()).map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).filter((x): x is Severity => (SEVERITIES as string[]).includes(x));
  const sortRaw = get("sort");
  const sort: SortKey = sortRaw === "proc" || sortRaw === "cat" ? sortRaw : "sev";
  const z: Record<string, Zone> = {};
  for (const part of (get("z") || "").split("_")) {
    const m = /^(.+)-([ash])$/.exec(part);
    if (m) z[m[1]] = ZDECODE[m[2]];
  }
  const tab = (TABS as string[]).includes(get("tab") || "") ? (get("tab") as DetailTab) : "steps";
  return {
    view, fn: get("fn"), p: get("p"), s: get("s"), ind, cty, q: h.get("q") || "", tab, cmp: get("cmp") === "1",
    pf: get("pf") || (view === "pain" ? get("fn") : undefined), pc: get("pc"), sev, pq: h.get("pq") || "", sort,
    z, basis: get("basis") === "all" ? "all" : "core", only: get("only") === "1",
    badView: rawView && rawView !== view ? rawView : undefined,
  };
}

export function serialize(r: Route, o: { share?: boolean } = {}): string {
  const h = new URLSearchParams();
  h.set("view", r.view);
  if (r.view !== "pain") {
    if (r.fn) h.set("fn", r.fn);
    if (r.p) h.set("p", r.p);
    if (r.view === "explore") {
      if (r.s) h.set("s", r.s);
      if (r.tab !== "steps" && !r.s) h.set("tab", r.tab);
      h.set("ind", r.ind); h.set("cty", r.cty);
      if (r.cmp) h.set("cmp", "1");
      if (r.q && !o.share) h.set("q", r.q);
    }
    if (r.view === "xray") {
      if (r.basis === "all") h.set("basis", "all");
      if (r.only) h.set("only", "1");
      const z = Object.entries(r.z).map(([k, v]) => `${k}-${ZCODE[v]}`).join("_");
      if (z) h.set("z", z);
    }
  } else {
    if (r.pf) h.set("pf", r.pf);
    if (r.pc) h.set("pc", r.pc);
    if (r.sev.length) h.set("sev", SEVERITIES.filter((s) => r.sev.includes(s)).join(","));
    if (r.pq) h.set("pq", r.pq);
    if (r.sort !== "sev") h.set("sort", r.sort);
  }
  return "#" + h.toString();
}

/* The lens, the filters and X-ray moves survive view switches even though only the active view writes
   its own keys to the hash. */
const memory = { explore: {} as Partial<Route>, pain: {} as Partial<Route>, xray: {} as Partial<Route>, moves: new Map<string, Record<string, Zone>>() };

export const route = signal<Route>(parse(location.hash));

function movesKey(fn?: string, p?: string) {
  const ref = taxIdx.value?.resolve(p, fn);
  return ref ? procKey(ref.fn.functionId, ref.proc.id) : `${fn || ""}/${p || ""}`;
}
function remember(r: Route) {
  if (r.view === "explore") memory.explore = { fn: r.fn, p: r.p, ind: r.ind, cty: r.cty, q: r.q, tab: r.tab, cmp: r.cmp };
  if (r.view === "pain") memory.pain = { pf: r.pf, pc: r.pc, sev: r.sev, pq: r.pq, sort: r.sort };
  if (r.view === "xray") { memory.xray = { basis: r.basis, only: r.only }; if (r.p) memory.moves.set(movesKey(r.fn, r.p), r.z); }
}

export function go(patch: Partial<Route>, opts: { replace?: boolean; focus?: boolean } = {}) {
  const cur = route.value;
  remember(cur);
  let base: Route = { ...cur, badView: undefined };
  const viewChange = !!patch.view && patch.view !== cur.view;
  if (viewChange) {
    // a view switch brings back what that view last showed (filters, lens, search)
    if (patch.view === "pain") base = { ...base, ...memory.pain };
    else {
      if (!base.p && !base.fn) { base.fn = memory.explore.fn; base.p = memory.explore.p; }
      base.ind = memory.explore.ind || base.ind; base.cty = memory.explore.cty || base.cty;
      base.q = patch.view === "explore" ? memory.explore.q || "" : "";
      base.tab = patch.view === "explore" ? memory.explore.tab || "steps" : base.tab;
      base.cmp = !!memory.explore.cmp;
      if (patch.view === "xray") { base.basis = memory.xray.basis || "core"; base.only = !!memory.xray.only; }
      base.s = undefined;
    }
  }
  const next: Route = { ...base, ...patch };
  const procChanged = next.p !== cur.p || next.fn !== cur.fn;
  if (next.view === "xray" && !("z" in patch) && (procChanged || cur.view !== "xray")) {
    next.z = memory.moves.get(movesKey(next.fn, next.p)) || {};
  }
  if (procChanged && !("s" in patch)) next.s = undefined;
  if (next.s && !("tab" in patch)) next.tab = "steps";
  const h = serialize(next);
  if (h !== location.hash) {
    if (opts.replace) history.replaceState(history.state, "", h);
    else history.pushState({ from: location.hash }, "", h);
  }
  route.value = parse(h);
  if (opts.focus) focusHeading();
}

/** In-app back: pop history if the previous entry is where we want to go, otherwise push it. */
export function goBack(patch: Partial<Route>) {
  const target = serialize({ ...route.value, ...patch });
  if (history.state && history.state.from === target) history.back();
  else go(patch);
}

export const hrefFor = (patch: Partial<Route>) => location.pathname + serialize({ ...route.value, badView: undefined, ...patch });
/** A link to what is on screen, for sharing: no search text, the exact step if one is chosen. */
export const shareUrl = (patch: Partial<Route> = {}) => location.origin + location.pathname + serialize({ ...route.value, badView: undefined, ...patch }, { share: true });

addEventListener("popstate", () => { route.value = parse(location.hash); focusHeadingIfLost(); });
addEventListener("hashchange", () => {
  const r = parse(location.hash);
  if (serialize(r) !== serialize(route.value)) { route.value = r; focusHeadingIfLost(); }
});

/* ---- Focus: after a view change, Back/Forward or a retry, focus lands on the view's heading ---------- */
const HEADINGS: Record<View, string[]> = { explore: ["proc-title", "list-title", "rail-title"], pain: ["pv-h"], xray: ["xr-title"] };
export function focusHeading(tries = 40) {
  requestAnimationFrame(() => {
    for (const id of HEADINGS[route.value.view]) {
      const el = document.getElementById(id);
      if (el && el.getClientRects().length && !el.closest("[hidden], [inert]")) { el.focus({ preventScroll: true }); return; }
    }
    if (tries > 0) setTimeout(() => focusHeading(tries - 1), 50);
  });
}
export function focusHeadingIfLost() {
  requestAnimationFrame(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a || a === document.body || !a.isConnected || !a.getClientRects().length) focusHeading();
  });
}

/* ---- Data ------------------------------------------------------------------------------------ */
type Load<T> = { state: "loading" } | { state: "ready"; data: T } | { state: "error"; message: string };
export interface TaxData { T: Taxonomy; idx: TaxonomyIndex }
export interface PainData { L: PainLibrary; idx: PainIndex }
export const tax = signal<Load<TaxData>>({ state: "loading" });
export const pain = signal<Load<PainData>>({ state: "loading" });

export function loadData(o: { focus?: boolean } = {}) {
  const jobs: Promise<unknown>[] = [];
  if (tax.value.state !== "ready") {
    tax.value = { state: "loading" };
    jobs.push(loadTaxonomy().then((T) => { tax.value = { state: "ready", data: { T, idx: indexTaxonomy(T) } }; })
      .catch((e: Error) => { tax.value = { state: "error", message: e.message || "Network error" }; }));
  }
  if (pain.value.state !== "ready") {
    pain.value = { state: "loading" };
    jobs.push(loadPain().then((L) => { pain.value = { state: "ready", data: { L, idx: indexPain(L) } }; })
      .catch((e: Error) => { pain.value = { state: "error", message: e.message || "Network error" }; }));
  }
  if (o.focus) Promise.all(jobs).then(() => focusHeading());
}

export const taxIdx = computed(() => (tax.value.state === "ready" ? tax.value.data.idx : null));
export const painIdx = computed(() => (pain.value.state === "ready" ? pain.value.data : null));

/** The process on screen for Explore and X-ray: the route's process, else the function's flagship, else its first. */
export const currentProc = computed<ProcRef | null>(() => {
  const idx = taxIdx.value; if (!idx) return null;
  const r = route.value;
  const fnOk = r.fn && idx.fnById.has(r.fn) ? r.fn : undefined;
  const byRoute = idx.resolve(r.p, fnOk);
  if (byRoute) return byRoute;
  if (r.view === "xray" && !fnOk) return idx.resolve(DEFAULT_PROC, DEFAULT_FN) || idx.list[0];
  const fn = (fnOk && idx.fnById.get(fnOk)) || idx.fnById.get(DEFAULT_FN)!;
  return idx.list.find((x) => x.fn === fn && x.flagship) || idx.list.find((x) => x.fn === fn) || idx.list[0];
});
export const currentFnId = computed(() => {
  const r = route.value; const idx = taxIdx.value;
  if (r.fn && (!idx || idx.fnById.has(r.fn))) return r.fn;
  return currentProc.value?.fn.functionId || DEFAULT_FN;
});

/** Check a route against the data; returns what to say and how to correct it, or null if it is sound. */
export function checkRoute(r: Route, idx: TaxonomyIndex): { msg: string; patch: Partial<Route> } | null {
  const fnName = (id?: string) => (id && idx.fnById.get(id)?.functionName) || "";
  if (r.badView) return { msg: `There is no “${r.badView}” view. Showing Explore.`, patch: {} };
  if (r.view === "pain") {
    if (r.pf && !idx.fnById.has(r.pf)) return { msg: `No function “${r.pf}”. Showing all functions.`, patch: { pf: undefined } };
    if (r.pc && !CATEGORY_LABELS[r.pc]) return { msg: `No category “${r.pc}”. Showing all categories.`, patch: { pc: undefined } };
    // links from other pages say fn=; the library's own key is pf=
    if (/(^|[#&])(fn|p)=/.test(location.hash)) return { msg: "", patch: {} };
    return null;
  }
  const fnBad = !!r.fn && !idx.fnById.has(r.fn);
  if (r.p) {
    const exact = idx.resolve(r.p, fnBad ? undefined : r.fn);
    if (!exact) {
      const shown = (!fnBad && r.fn && (idx.list.find((x) => x.fn.functionId === r.fn && x.flagship) || idx.list.find((x) => x.fn.functionId === r.fn))) || idx.resolve(DEFAULT_PROC, DEFAULT_FN)!;
      return { msg: `No process ${r.p}. Showing ${shown.proc.id} ${shown.proc.name}.`, patch: { p: shown.proc.id, fn: shown.fn.functionId, s: undefined } };
    }
    if (fnBad) return { msg: `No function “${r.fn}”. Showing ${exact.proc.id} in ${exact.fn.functionName}.`, patch: { fn: exact.fn.functionId } };
    if (r.fn && exact.fn.functionId !== r.fn) return { msg: `${r.p} is in ${exact.fn.functionName}, not ${fnName(r.fn)}. Showing it there.`, patch: { fn: exact.fn.functionId } };
    if (!r.fn) return { msg: "", patch: { fn: exact.fn.functionId } };
    if (r.s && r.view === "explore") {
      const m = /^(.*)\.(\d+)$/.exec(r.s); let ok = false;
      if (m) for (const a of exact.proc.activities) for (const t of a.tasks) if (t.id === m[1] && Number(m[2]) >= 1 && Number(m[2]) <= t.steps.length) ok = true;
      if (!ok) return { msg: `No step ${r.s} in ${exact.proc.id}. Showing the process.`, patch: { s: undefined } };
    }
    if (r.view === "xray" && Object.keys(r.z).length) {
      const ids = new Set<string>(); for (const a of exact.proc.activities) for (const t of a.tasks) t.steps.forEach((_, i) => ids.add(stepIdOf(t.id, i)));
      const bad = Object.keys(r.z).filter((k) => !ids.has(k));
      if (bad.length) { const z = { ...r.z }; bad.forEach((k) => delete z[k]); return { msg: "", patch: { z } }; }
    }
    return null;
  }
  if (fnBad) return { msg: `No function “${r.fn}”. Showing ${fnName(DEFAULT_FN)}.`, patch: { fn: undefined } };
  return null;
}
effect(() => {
  const idx = taxIdx.value; const r = route.value; if (!idx) return;
  const c = checkRoute(r, idx); if (!c) return;
  queueMicrotask(() => { if (c.msg) say(c.msg, { tone: "warn" }); go(c.patch, { replace: true }); });
});

/** Zone counts over every step, and over core (non-wrapper) steps, the benchmark the X-ray compares against. */
export const zoneBenchmark = computed(() => {
  const idx = taxIdx.value; if (!idx) return null;
  const all: Record<Zone, number> = { auto: 0, assist: 0, human: 0 }; const core: Record<Zone, number> = { auto: 0, assist: 0, human: 0 };
  let nAll = 0, nCore = 0;
  for (const ref of idx.list) for (const a of ref.proc.activities) for (const t of a.tasks) for (const s of t.steps) {
    const z = zoneOf(s, t.name).zone; all[z]++; nAll++;
    if (!isWrapper(s)) { core[z]++; nCore++; }
  }
  return { all: { n: all, total: nAll }, core: { n: core, total: nCore }, order: ZONE_ORDER };
});

// Sort every step once while the browser is idle, so the first X-ray opens without that work.
effect(() => {
  if (!taxIdx.value) return;
  const warm = () => { void zoneBenchmark.value; };
  if ("requestIdleCallback" in window) (window as Window & { requestIdleCallback: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback(warm, { timeout: 2500 });
  else setTimeout(warm, 600);
});

/* ---- Small UI signals ------------------------------------------------------------------------ */
/** A toast with an action (Undo) belongs to the view and process it was offered in: `scope` records them and
    any route change that leaves them (a tab, a link, Back or Forward) clears the offer. */
export const toast = signal<{ id: number; text: string; tone?: "ok" | "warn"; action?: { label: string; run: () => void }; scope?: string } | null>(null);
const scopeOf = (r: Route) => `${r.view}|${r.fn || ""}|${r.p || ""}`;
effect(() => { const sc = scopeOf(route.value); const t = toast.peek(); if (t?.scope && t.scope !== sc) toast.value = null; });
let toastTimer = 0;
export function say(text: string, o: { tone?: "ok" | "warn"; action?: { label: string; run: () => void } } = {}) {
  clearTimeout(toastTimer);
  batch(() => { toast.value = { id: Date.now(), text, ...o, scope: o.action ? scopeOf(route.peek()) : undefined }; });
  toastTimer = window.setTimeout(() => { toast.value = null; }, o.action ? 6000 : o.tone === "warn" ? 5200 : 3200);
}
/** Single-character shortcuts (/, ?, E, P, X) can be switched off (WCAG 2.1.4). */
export const keysOn = signal<boolean>((() => { try { return localStorage.getItem("vb-keys") !== "0"; } catch { return true; } })());
export function setKeys(v: boolean) { keysOn.value = v; try { localStorage.setItem("vb-keys", v ? "1" : "0"); } catch { /* private mode */ } }
/** Polite announcements for screen readers that are not tied to a visible toast. */
export const announce = signal("");

export const stepIdOf = (taskId: string, i: number) => `${taskId}.${i + 1}`;
export function parseStepId(s: string) { const m = /^(.*)\.(\d+)$/.exec(s); return m ? { taskId: m[1], index: Number(m[2]) - 1 } : null; }
export const keyOf = (ref: ProcRef) => procKey(ref.fn.functionId, ref.proc.id);

/** A small persisted preference (try/catch: storage can be blocked). */
export function pref(key: string, fallback: boolean) {
  const s = signal<boolean>((() => { try { const v = localStorage.getItem(key); return v === null ? fallback : v === "1"; } catch { return fallback; } })());
  return { get value() { return s.value; }, set value(v: boolean) { s.value = v; try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* ignore */ } } };
}

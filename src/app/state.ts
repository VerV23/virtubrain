/* App state. The URL hash is the single source of truth for what is on screen, so every view is
   linkable and Back/Forward work:
     #view=explore&fn=finance-accounting&p=8.1.1&s=8.1.1.2.2.4&ind=retail&cty=PH&q=close
     #view=pain&pf=procurement&pc=handoff-friction&sev=High,Medium&pq=invoice&sort=sev
     #view=xray&fn=finance-accounting&p=8.1.1&z=8.1.1.2.2.4-h_8.1.1.1.1.2-a
   Navigation pushes a history entry; typing, filters and zone moves replace the current one. */
import { signal, computed, batch } from "@preact/signals";
import {
  loadTaxonomy, loadPain, indexTaxonomy, indexPain, procKey, zoneOf, INDUSTRIES, COUNTRIES, SEVERITIES, ZONE_ORDER,
  type Taxonomy, type TaxonomyIndex, type PainLibrary, type PainIndex, type Industry, type Country, type Severity, type Zone, type ProcRef,
} from "../lib/data";

export type View = "explore" | "pain" | "xray";
export type SortKey = "sev" | "proc" | "cat";
export interface Route {
  view: View; fn?: string; p?: string; s?: string; ind: Industry; cty: Country; q: string;
  pf?: string; pc?: string; sev: Severity[]; pq: string; sort: SortKey; z: Record<string, Zone>;
}
export const VIEWS: { id: View; label: string; key: string }[] = [
  { id: "explore", label: "Explore", key: "e" },
  { id: "pain", label: "Pain points", key: "p" },
  { id: "xray", label: "X-ray", key: "x" },
];
export const DEFAULT_FN = "finance-accounting";
export const DEFAULT_PROC = "8.1.1";
const ZCODE: Record<Zone, string> = { auto: "a", assist: "s", human: "h" };
const ZDECODE: Record<string, Zone> = { a: "auto", s: "assist", h: "human" };

export function parse(hash: string): Route {
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  const get = (k: string) => (h.get(k) || "").trim() || undefined;
  const view = (["explore", "pain", "xray"] as View[]).find((v) => v === h.get("view")) || "explore";
  const ind = (get("ind") as Industry) in INDUSTRIES ? (get("ind") as Industry) : "retail";
  const ctyRaw = (get("cty") || "").toUpperCase();
  const cty = (ctyRaw in COUNTRIES ? ctyRaw : "PH") as Country;
  const sev = (get("sev") || "").split(",").filter((x): x is Severity => (SEVERITIES as string[]).includes(x));
  const sortRaw = get("sort");
  const sort: SortKey = sortRaw === "proc" || sortRaw === "cat" ? sortRaw : "sev";
  const z: Record<string, Zone> = {};
  for (const part of (get("z") || "").split("_")) {
    const m = /^(.+)-([ash])$/.exec(part);
    if (m) z[m[1]] = ZDECODE[m[2]];
  }
  return { view, fn: get("fn"), p: get("p"), s: get("s"), ind, cty, q: h.get("q") || "", pf: get("pf"), pc: get("pc"), sev, pq: h.get("pq") || "", sort, z };
}

export function serialize(r: Route): string {
  const h = new URLSearchParams();
  h.set("view", r.view);
  if (r.view !== "pain") {
    if (r.fn) h.set("fn", r.fn);
    if (r.p) h.set("p", r.p);
    if (r.s && r.view === "explore") h.set("s", r.s);
    if (r.view === "explore") { h.set("ind", r.ind); h.set("cty", r.cty); if (r.q) h.set("q", r.q); }
    if (r.view === "xray") {
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

/* The lens and the explore/pain filters survive view switches even though only the active view
   writes its own keys to the hash. */
const memory = { explore: {} as Partial<Route>, pain: {} as Partial<Route>, moves: new Map<string, Record<string, Zone>>() };

export const route = signal<Route>(parse(location.hash));

function movesKey(fn?: string, p?: string) {
  const ref = taxIdx.value?.resolve(p, fn);
  return ref ? procKey(ref.fn.functionId, ref.proc.id) : `${fn || ""}/${p || ""}`;
}
function remember(r: Route) {
  if (r.view === "explore") memory.explore = { fn: r.fn, p: r.p, ind: r.ind, cty: r.cty, q: r.q };
  if (r.view === "pain") memory.pain = { pf: r.pf, pc: r.pc, sev: r.sev, pq: r.pq, sort: r.sort };
  if (r.view === "xray" && r.p) memory.moves.set(movesKey(r.fn, r.p), r.z);
}

export function go(patch: Partial<Route>, opts: { replace?: boolean } = {}) {
  const cur = route.value;
  remember(cur);
  let base: Route = { ...cur };
  if (patch.view && patch.view !== cur.view) {
    // a view switch brings back what that view last showed (filters, lens, search)
    if (patch.view === "pain") base = { ...base, ...memory.pain };
    else {
      if (!base.p && !base.fn) { base.fn = memory.explore.fn; base.p = memory.explore.p; }
      base.ind = memory.explore.ind || base.ind; base.cty = memory.explore.cty || base.cty;
      base.q = patch.view === "explore" ? memory.explore.q || "" : "";
      base.s = undefined;
    }
  }
  const next: Route = { ...base, ...patch };
  const procChanged = next.p !== cur.p || next.fn !== cur.fn;
  if (next.view === "xray" && !("z" in patch) && (procChanged || cur.view !== "xray")) {
    next.z = memory.moves.get(movesKey(next.fn, next.p)) || {};
  }
  if (procChanged && !("s" in patch)) next.s = undefined;
  const h = serialize(next);
  if (h !== location.hash) {
    if (opts.replace) history.replaceState(history.state, "", h);
    else history.pushState({ from: location.hash }, "", h);
  }
  route.value = parse(h);
}

/** In-app back: pop history if the previous entry is where we want to go, otherwise push it. */
export function goBack(patch: Partial<Route>) {
  const target = serialize({ ...route.value, ...patch });
  if (history.state && history.state.from === target) history.back();
  else go(patch);
}

export const hrefFor = (patch: Partial<Route>) => location.pathname + serialize({ ...route.value, ...patch });

addEventListener("popstate", () => { route.value = parse(location.hash); });
addEventListener("hashchange", () => {
  const r = parse(location.hash);
  if (serialize(r) !== serialize(route.value)) route.value = r;
});

/* ---- Data ------------------------------------------------------------------------------------ */
type Load<T> = { state: "loading" } | { state: "ready"; data: T } | { state: "error"; message: string };
export interface TaxData { T: Taxonomy; idx: TaxonomyIndex }
export interface PainData { L: PainLibrary; idx: PainIndex }
export const tax = signal<Load<TaxData>>({ state: "loading" });
export const pain = signal<Load<PainData>>({ state: "loading" });

export function loadData() {
  if (tax.value.state !== "ready") {
    tax.value = { state: "loading" };
    loadTaxonomy().then((T) => { tax.value = { state: "ready", data: { T, idx: indexTaxonomy(T) } }; })
      .catch((e: Error) => { tax.value = { state: "error", message: e.message || "Network error" }; });
  }
  if (pain.value.state !== "ready") {
    pain.value = { state: "loading" };
    loadPain().then((L) => { pain.value = { state: "ready", data: { L, idx: indexPain(L) } }; })
      .catch((e: Error) => { pain.value = { state: "error", message: e.message || "Network error" }; });
  }
}

export const taxIdx = computed(() => (tax.value.state === "ready" ? tax.value.data.idx : null));
export const painIdx = computed(() => (pain.value.state === "ready" ? pain.value.data : null));

/** The process on screen for Explore and X-ray: the route's process, else the function's flagship, else its first. */
export const currentProc = computed<ProcRef | null>(() => {
  const idx = taxIdx.value; if (!idx) return null;
  const r = route.value;
  const byRoute = idx.resolve(r.p, r.fn);
  if (byRoute) return byRoute;
  if (r.view === "xray") return idx.resolve(DEFAULT_PROC, DEFAULT_FN) || idx.list[0];
  const fn = (r.fn && idx.fnById.get(r.fn)) || idx.fnById.get(DEFAULT_FN)!;
  return idx.list.find((x) => x.fn === fn && x.flagship) || idx.list.find((x) => x.fn === fn) || idx.list[0];
});
export const currentFnId = computed(() => {
  const r = route.value; const idx = taxIdx.value;
  if (r.fn && (!idx || idx.fnById.has(r.fn))) return r.fn;
  return currentProc.value?.fn.functionId || DEFAULT_FN;
});

/** Zone share over every step in the taxonomy, the benchmark the X-ray compares against. */
export const zoneBenchmark = computed(() => {
  const idx = taxIdx.value; if (!idx) return null;
  const n: Record<Zone, number> = { auto: 0, assist: 0, human: 0 }; let total = 0;
  for (const ref of idx.list) for (const a of ref.proc.activities) for (const t of a.tasks) for (const s of t.steps) { n[zoneOf(s, t.name).zone]++; total++; }
  return { n, total, order: ZONE_ORDER };
});

/* ---- Small UI signals ------------------------------------------------------------------------ */
export const toast = signal<{ id: number; text: string; tone?: "ok" | "warn"; action?: { label: string; run: () => void } } | null>(null);
let toastTimer = 0;
export function say(text: string, o: { tone?: "ok" | "warn"; action?: { label: string; run: () => void } } = {}) {
  clearTimeout(toastTimer);
  batch(() => { toast.value = { id: Date.now(), text, ...o }; });
  toastTimer = window.setTimeout(() => { toast.value = null; }, o.action ? 6000 : 3200);
}
/** Single-character shortcuts (/, ?, E, P, X) can be switched off (WCAG 2.1.4). */
export const keysOn = signal<boolean>((() => { try { return localStorage.getItem("vb-keys") !== "0"; } catch { return true; } })());
export function setKeys(v: boolean) { keysOn.value = v; try { localStorage.setItem("vb-keys", v ? "1" : "0"); } catch { /* private mode */ } }
/** Polite announcements for screen readers that are not tied to a visible toast. */
export const announce = signal("");

export const stepIdOf = (taskId: string, i: number) => `${taskId}.${i + 1}`;
export function parseStepId(s: string) { const m = /^(.*)\.(\d+)$/.exec(s); return m ? { taskId: m[1], index: Number(m[2]) - 1 } : null; }
export const keyOf = (ref: ProcRef) => procKey(ref.fn.functionId, ref.proc.id);

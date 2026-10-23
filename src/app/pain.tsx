/* Pain-point library: 362 illustrative failure points, filtered by function, category, severity
   and search with live faceted counts. Each record opens its step (or, for one of the standard steps,
   its task) in Explore. Records render 50 at a time as the list scrolls. */
import { computed, signal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { SEVERITIES, PAIN_NOTE, CATEGORY_LABELS, categoryLabel, stepLabel, isWrapper, type PainPoint, type Severity } from "../lib/data";
import { route, go, hrefFor, shareUrl, pain, taxIdx, loadData, say, stepIdOf, type SortKey } from "./state";
import { compile, matches } from "./search";
import { Icon, FnIcon, Hl, SevMark, Still, Empty, ErrorState, Skel, Impact, painTitle, painImpact, painWhere, talkHref, talkLabel, plural, copyText } from "./ui";

const hayOf = new WeakMap<PainPoint, string>();
const hay = (p: PainPoint) => {
  let h = hayOf.get(p);
  if (!h) { h = [painTitle(p), painImpact(p), p.processId, p.processName, p.taskName, p.stepText, p.functionName, p.activityName, categoryLabel(p.category)].join(" ").toLowerCase(); hayOf.set(p, h); }
  return h;
};
type Facet = "fn" | "cat" | "sev";
const SEV_RANK: Record<Severity, number> = { High: 0, Medium: 1, Low: 2 };
const cmpId = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
const FIRST = 4, PAGE = 30; // the first few paint with the view; the observer streams the rest in right after
const limit = signal(FIRST);

/* the library re-filters only when its own filters change, not on every route change (a view switch, a process) */
const painKey = computed(() => { const r = route.value; return `${r.pf || ""}|${r.pc || ""}|${r.sev.join()}|${r.sort}|${r.pq}`; });
const model = computed(() => {
  const pd = pain.value; if (pd.state !== "ready") return null;
  void painKey.value; const r = route.peek(); const all = pd.data.L.painPoints; const Q = compile(r.pq);
  const fnOrder = new Map<string, number>();
  const idx = taxIdx.value;
  if (idx) [...idx.fnById.keys()].forEach((k, i) => fnOrder.set(k, i));
  else all.forEach((p) => { if (!fnOrder.has(p.functionId)) fnOrder.set(p.functionId, fnOrder.size); });
  const textOk = new Set(Q.terms.length ? all.filter((p) => matches(hay(p), Q)) : all);
  const ok = (p: PainPoint, skip?: Facet) =>
    (skip === "fn" || !r.pf || p.functionId === r.pf) && (skip === "cat" || !r.pc || p.category === r.pc) &&
    (skip === "sev" || !r.sev.length || r.sev.includes(p.severity)) && textOk.has(p);
  const count = (skip: Facet, key: (p: PainPoint) => string) => {
    const m = new Map<string, number>(); let total = 0;
    for (const p of all) if (ok(p, skip)) { m.set(key(p), (m.get(key(p)) || 0) + 1); total++; }
    return { m, total };
  };
  const procOrder = (a: PainPoint, b: PainPoint) => (fnOrder.get(a.functionId)! - fnOrder.get(b.functionId)!) || cmpId(a.taskId, b.taskId) || a.stepIndex - b.stepIndex;
  const sorters: Record<SortKey, (a: PainPoint, b: PainPoint) => number> = {
    sev: (a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || procOrder(a, b),
    proc: procOrder,
    cat: (a, b) => categoryLabel(a.category).localeCompare(categoryLabel(b.category)) || SEV_RANK[a.severity] - SEV_RANK[b.severity] || procOrder(a, b),
  };
  const rows = all.filter((p) => ok(p)).sort(sorters[r.sort]);
  const fns = [...new Map(all.map((p) => [p.functionId, p.functionName])).entries()].sort((a, b) => fnOrder.get(a[0])! - fnOrder.get(b[0])!);
  return { all, rows, hl: Q.hl, fns, fnC: count("fn", (p) => p.functionId), catC: count("cat", (p) => p.category), sevC: count("sev", (p) => p.severity) };
});
const activeFilters = () => { const r = route.value; return (r.pf ? 1 : 0) + (r.pc ? 1 : 0) + (r.sev.length ? 1 : 0) + (r.pq ? 1 : 0); };
const clearAll = () => go({ pf: undefined, pc: undefined, sev: [], pq: "" }, { replace: true });

export function PainView() {
  const pd = pain.value;
  if (pd.state === "error") return <div class="pv pv-state"><ErrorState what="The failure-point library" onRetry={() => loadData({ focus: true })} /></div>;
  const m = model.value;
  return (
    <div class="pv">
      <aside class="pane pv-side" aria-label="Filters">
        <div class="pane-scroll">{m ? <Filters /> : <Skel rows={16} class="skel-list" />}</div>
      </aside>
      <section class="pane pv-main" aria-labelledby="pv-h">
        <div class="pane-scroll" id="pv-scroll">{m ? <Results /> : <div class="pv-wrap"><Skel rows={2} class="skel-title" /><Skel rows={12} class="skel-recs" /></div>}</div>
      </section>
    </div>
  );
}

function Filters({ inSheet = false }: { inSheet?: boolean }) {
  const m = model.value!; const r = route.value; const idx = taxIdx.value;
  const toggleSev = (s: Severity) => go({ sev: r.sev.includes(s) ? r.sev.filter((x) => x !== s) : [...r.sev, s] }, { replace: true });
  const cats = Object.keys(CATEGORY_LABELS).sort((a, b) => (m.catC.m.get(b) || 0) - (m.catC.m.get(a) || 0) || CATEGORY_LABELS[a].localeCompare(CATEGORY_LABELS[b]));
  return (
    <div class="filters">
      <div class="f-head">
        <h2 class="pane-title" id={inSheet ? "sheet-h" : undefined}>Filter the library</h2>
        {activeFilters() > 0 && <button type="button" class="linkish" onClick={clearAll}>Clear all</button>}
      </div>
      <fieldset class="f-group">
        <legend class="h-xs">Severity</legend>
        <div class="sev-toggles">
          {SEVERITIES.map((s) => {
            const n = m.sevC.m.get(s) || 0;
            return (
              <button key={s} type="button" class={`sev-t sev-${s}`} aria-pressed={r.sev.includes(s)} onClick={() => toggleSev(s)} disabled={!n && !r.sev.includes(s)}>
                <i aria-hidden="true" /><span>{s}</span><span class="num">{n}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <RadioList legend="Category" value={r.pc || ""} total={m.catC.total} onChange={(v) => go({ pc: v || undefined }, { replace: true })}
        allLabel="All categories" items={cats.map((c) => ({ id: c, label: CATEGORY_LABELS[c], n: m.catC.m.get(c) || 0 }))} />
      <RadioList legend="Function" value={r.pf || ""} total={m.fnC.total} onChange={(v) => go({ pf: v || undefined }, { replace: true })}
        allLabel="All functions" items={m.fns.map(([id, name]) => ({ id, label: idx?.fnById.get(id)?.functionName || name, n: m.fnC.m.get(id) || 0, icon: id }))} />
      {!inSheet && (
        <section class="about" aria-labelledby="about-h">
          <div class="about-art"><Still name="atlas-blocks" sizes="264px" alt="" /></div>
          <h3 id="about-h">About this library</h3>
          <p>{m.all.length} illustrative failure points, written against the real taxonomy in the style of process-mining risk registers. {m.all.filter((p) => isWrapper(p.stepText)).length} of them sit on the standard steps around a task (confirm the inputs, check the output, decide whether it is complete, log and hand off), so they are shown at task level. They show the kind of evidence an engagement collects; they are not audited findings about any organization.</p>
        </section>
      )}
    </div>
  );
}

function RadioList({ legend, value, items, onChange, allLabel, total }: {
  legend: string; value: string; total: number; allLabel: string; onChange: (v: string) => void;
  items: { id: string; label: string; n: number; icon?: string }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const opts = [{ id: "", label: allLabel, n: total, icon: undefined as string | undefined }, ...items];
  const move = (d: number) => {
    const i = opts.findIndex((o) => o.id === value); const n = opts[(i + d + opts.length) % opts.length];
    onChange(n.id); requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(`[data-id="${n.id}"]`)?.focus());
  };
  return (
    <fieldset class="f-group">
      <legend class="h-xs">{legend}</legend>
      <div ref={ref} class="rlist" role="radiogroup" aria-label={legend}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); move(1); } if (e.key === "ArrowUp") { e.preventDefault(); move(-1); } }}>
        {opts.map((o) => (
          <button key={o.id} type="button" role="radio" data-id={o.id} aria-checked={o.id === value} tabIndex={o.id === value ? 0 : -1}
            class={`rl-item${!o.n && o.id !== value ? " is-zero" : ""}`} onClick={() => onChange(o.id)}>
            {o.icon ? <FnIcon id={o.icon} class="sm" /> : null}
            <span class="rl-label">{o.label}</span><span class="rl-n num">{o.n}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Results() {
  const m = model.value!; const r = route.value;
  const sheet = useRef<HTMLDialogElement>(null); const sentinel = useRef<HTMLLIElement>(null);
  const n = m.rows.length; const nf = activeFilters();
  const sevN = SEVERITIES.map((s) => [s, m.rows.filter((p) => p.severity === s).length] as const);
  // a new filter set starts at the top of the list, 50 records at a time
  useEffect(() => { limit.value = FIRST; const el = document.getElementById("pv-scroll"); if (el) el.scrollTop = 0; }, [r.pf, r.pc, r.sev.join(), r.sort, r.pq]);
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) limit.value += PAGE; }, { root: document.getElementById("pv-scroll"), rootMargin: "600px 0px" });
    io.observe(el); return () => io.disconnect();
  }, [limit.value, n]);
  // End / Ctrl+End (or dragging to the bottom) must reach the last record: render everything first
  useEffect(() => {
    const sc = document.getElementById("pv-scroll"); if (!sc) return;
    const all = () => { if (limit.value < n) limit.value = n; };
    const onKey = (e: KeyboardEvent) => { if (e.key === "End" && !(e.target as HTMLElement)?.closest?.("input, textarea, select")) all(); };
    const onScroll = () => { if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) all(); };
    addEventListener("keydown", onKey, true); sc.addEventListener("scroll", onScroll, { passive: true });
    return () => { removeEventListener("keydown", onKey, true); sc.removeEventListener("scroll", onScroll); };
  }, [n]);
  const chips: { label: string; clear: () => void }[] = [];
  if (r.pq) chips.push({ label: `“${r.pq}”`, clear: () => go({ pq: "" }, { replace: true }) });
  for (const s of r.sev) chips.push({ label: s, clear: () => go({ sev: r.sev.filter((x) => x !== s) }, { replace: true }) });
  if (r.pc) chips.push({ label: CATEGORY_LABELS[r.pc] || r.pc, clear: () => go({ pc: undefined }, { replace: true }) });
  if (r.pf) chips.push({ label: m.fns.find(([id]) => id === r.pf)?.[1] || r.pf, clear: () => go({ pf: undefined }, { replace: true }) });
  const shown = m.rows.slice(0, limit.value);

  return (
    <div class="pv-wrap">
      <header class="pv-head">
        <div class="pv-title-row">
          <div>
            <h2 id="pv-h" class="pv-title" tabIndex={-1}>Failure-point library</h2>
            <p class="pv-count" aria-live="polite" aria-atomic="true"><span class="num">{n}</span> of {m.all.length} illustrative failure points{nf ? " match" : ""}</p>
          </div>
          <div class="pv-tools">
            <button type="button" class="b b-ghost b-sm only-mobile" onClick={() => sheet.current?.showModal()} aria-haspopup="dialog">
              <Icon name="filter" />Filters{nf ? <span class="badge-n num">{nf}</span> : null}
            </button>
            <label class="sel sel-sm">
              <span class="sel-l">Sort</span>
              <select value={r.sort} onChange={(e) => go({ sort: (e.currentTarget as HTMLSelectElement).value as SortKey }, { replace: true })}>
                <option value="sev">Severity</option><option value="proc">Process order</option><option value="cat">Category</option>
              </select>
              <Icon name="down" />
            </label>
            <button type="button" class="b b-ghost b-sm" aria-label="Copy link to this view" onClick={async () => {
              const ok = await copyText(shareUrl()); say(ok ? "Link copied" : "Couldn't copy. The link is in the address bar.", { tone: ok ? "ok" : "warn" });
            }}><Icon name="link" /><span class="hide-sm">Copy link</span></button>
          </div>
        </div>
        <div class="sevbar" role="img" aria-label={sevN.map(([s, k]) => `${k} ${s.toLowerCase()}`).join(", ")}>
          {sevN.map(([s, k]) => <span key={s} class={`sevbar-seg sev-${s}`} style={{ flexGrow: String(k), flexBasis: k ? "2px" : "0px" }} />)}
        </div>
        <p class="sevbar-legend" aria-hidden="true">{sevN.map(([s, k]) => <span key={s} class={`sev-${s}`}><i />{s} <span class="num">{k}</span></span>)}</p>
        <p class="note">{PAIN_NOTE}</p>
        {chips.length > 0 && (
          <ul class="chips" aria-label="Active filters">
            {chips.map((c) => <li key={c.label}><button type="button" class="fchip" onClick={c.clear} aria-label={`Remove filter ${c.label}`}>{c.label}<Icon name="close" /></button></li>)}
          </ul>
        )}
      </header>
      {n === 0 ? (
        <Empty still="atlas-stepped" title="No failure points match these filters."
          action={<button type="button" class="b b-ghost" onClick={clearAll}><Icon name="reset" />Clear all filters</button>}>
          <p>Each filter narrows the others. Remove one, or search a broader word.</p>
        </Empty>
      ) : (
        <ol class="recs">
          {shown.map((p) => <Record key={p.id} p={p} hl={m.hl} />)}
          {shown.length < n && <li ref={sentinel} class="rec-more" aria-hidden="true"><Skel rows={2} class="skel-recs" /></li>}
        </ol>
      )}
      <dialog ref={sheet} class="sheet" aria-labelledby="sheet-h" onClick={(e) => { if (e.target === sheet.current) sheet.current?.close(); }}>
        <div class="sheet-body">
          <button type="button" class="sheet-x" onClick={() => sheet.current?.close()} aria-label="Close filters"><Icon name="close" /></button>
          <Filters inSheet />
        </div>
        <div class="sheet-foot"><button type="button" class="b b-primary b-block" onClick={() => sheet.current?.close()}>Show {plural(n, "failure point")}</button></div>
      </dialog>
    </div>
  );
}

function Record({ p, hl }: { p: PainPoint; hl: string[] }) {
  const sid = stepIdOf(p.taskId, p.stepIndex); const where = painWhere(p);
  const open = { view: "explore" as const, fn: p.functionId, p: p.processId, s: sid, q: "", tab: "steps" as const };
  return (
    <li class={`rec sev-${p.severity}`}>
      <p class="rec-meta"><SevMark sev={p.severity} /><span class="rec-cat">{categoryLabel(p.category, p.categoryLabel)}</span></p>
      <h3 class="rec-title">
        <a href={hrefFor(open)} class="rec-link" onClick={(e) => { e.preventDefault(); go(open); }}>
          <Hl text={painTitle(p)} hl={hl} />
        </a>
      </h3>
      <Impact p={p} hl={hl} />
      <div class="rec-path">
        <p class="rp-line">
          <span class="rp"><FnIcon id={p.functionId} class="sm" />{p.functionName}</span>
          <span class="rp"><span class="code">{p.processId}</span>{p.processName}</span>
          <span class="rp"><span class="code">{p.taskId}</span>{p.taskName}</span>
        </p>
        <p class="rp-step">
          {where.wrapper ? <span class="rp-st">{where.text}</span>
            : where.itself ? <><span class="code">{sid}</span><span class="rp-st">{where.text}</span></>
            : <><span class="code">{sid}</span><span class="rp-st">{where.text}: <Hl text={stepLabel(p.stepText, p.taskName)} hl={hl} /></span></>}
        </p>
      </div>
      <p class="rec-acts">
        <span class="rec-go" aria-hidden="true">{where.wrapper ? "Open task" : "Open step"}<Icon name="chevron" /></span>
        <a class="rec-talk" href={talkHref(p)}><Icon name="mail" />{talkLabel(p)}</a>
      </p>
    </li>
  );
}

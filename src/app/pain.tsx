/* Pain points: the illustrative library of 362 records, filtered by function, category, severity
   and search with live faceted counts. Each record opens its exact step in Explore. */
import { computed } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { SEVERITIES, PAIN_NOTE, CATEGORY_LABELS, categoryLabel, type PainPoint, type Severity } from "../lib/data";
import { route, go, hrefFor, pain, taxIdx, loadData, stepIdOf, type SortKey } from "./state";
import { termsOf } from "./search";
import { Icon, FnIcon, Hl, SevMark, Still, Empty, ErrorState, Skel, plural, pct } from "./ui";

const hayOf = new WeakMap<PainPoint, string>();
const hay = (p: PainPoint) => {
  let h = hayOf.get(p);
  if (!h) { h = [p.title, p.impact, p.processId, p.processName, p.taskName, p.stepText, p.functionName, p.activityName, categoryLabel(p.category)].join(" ").toLowerCase(); hayOf.set(p, h); }
  return h;
};
type Facet = "fn" | "cat" | "sev";
const SEV_RANK: Record<Severity, number> = { High: 0, Medium: 1, Low: 2 };
const cmpId = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

const model = computed(() => {
  const pd = pain.value; if (pd.state !== "ready") return null;
  const r = route.value; const all = pd.data.L.painPoints; const terms = termsOf(r.pq);
  const fnOrder = new Map<string, number>();
  const idx = taxIdx.value;
  if (idx) [...idx.fnById.keys()].forEach((k, i) => fnOrder.set(k, i));
  else all.forEach((p) => { if (!fnOrder.has(p.functionId)) fnOrder.set(p.functionId, fnOrder.size); });
  const ok = (p: PainPoint, skip?: Facet) =>
    (skip === "fn" || !r.pf || p.functionId === r.pf) && (skip === "cat" || !r.pc || p.category === r.pc) &&
    (skip === "sev" || !r.sev.length || r.sev.includes(p.severity)) && (!terms.length || terms.every((t) => hay(p).includes(t)));
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
  return { all, rows, terms, fns, fnC: count("fn", (p) => p.functionId), catC: count("cat", (p) => p.category), sevC: count("sev", (p) => p.severity) };
});
const activeFilters = () => { const r = route.value; return (r.pf ? 1 : 0) + (r.pc ? 1 : 0) + (r.sev.length ? 1 : 0) + (r.pq ? 1 : 0); };
const clearAll = () => go({ pf: undefined, pc: undefined, sev: [], pq: "" }, { replace: true });

export function PainView() {
  const pd = pain.value;
  if (pd.state === "error") return <div class="pv pv-state"><ErrorState what="The pain-point library" onRetry={loadData} /></div>;
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
          <p>{m.all.length} records written against the real taxonomy in the style of process-mining risk registers. Each one is pinned to a single step. They show the kind of evidence an engagement collects; they are not audited findings about any organisation.</p>
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
  const sheet = useRef<HTMLDialogElement>(null);
  const n = m.rows.length; const nf = activeFilters();
  const sevN = SEVERITIES.map((s) => [s, m.rows.filter((p) => p.severity === s).length] as const);
  // a new filter set starts at the top of the list
  useEffect(() => { const el = document.getElementById("pv-scroll"); if (el) el.scrollTop = 0; }, [r.pf, r.pc, r.sev.join(), r.sort]);
  const chips: { label: string; clear: () => void }[] = [];
  if (r.pq) chips.push({ label: `“${r.pq}”`, clear: () => go({ pq: "" }, { replace: true }) });
  for (const s of r.sev) chips.push({ label: s, clear: () => go({ sev: r.sev.filter((x) => x !== s) }, { replace: true }) });
  if (r.pc) chips.push({ label: CATEGORY_LABELS[r.pc] || r.pc, clear: () => go({ pc: undefined }, { replace: true }) });
  if (r.pf) chips.push({ label: m.fns.find(([id]) => id === r.pf)?.[1] || r.pf, clear: () => go({ pf: undefined }, { replace: true }) });

  return (
    <div class="pv-wrap">
      <header class="pv-head">
        <div class="pv-title-row">
          <div>
            <h2 id="pv-h" class="pv-title">Pain-point library</h2>
            <p class="pv-count" aria-live="polite" aria-atomic="true"><span class="num">{n}</span> of {m.all.length} pain points{nf ? " match" : ""}</p>
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
          </div>
        </div>
        <div class="sevbar" role="img" aria-label={sevN.map(([s, k]) => `${k} ${s.toLowerCase()}`).join(", ")}>
          {sevN.map(([s, k]) => <span key={s} class={`sevbar-seg sev-${s}`} style={{ flexGrow: String(k), flexBasis: k ? "2px" : "0px" }} />)}
        </div>
        <p class="sevbar-legend" aria-hidden="true">{sevN.map(([s, k]) => <span key={s} class={`sev-${s}`}><i />{s} <span class="num">{k}</span>{n ? <span class="muted"> {pct(k, n)}%</span> : null}</span>)}</p>
        <p class="note">{PAIN_NOTE}</p>
        {chips.length > 0 && (
          <ul class="chips" aria-label="Active filters">
            {chips.map((c) => <li key={c.label}><button type="button" class="fchip" onClick={c.clear} aria-label={`Remove filter ${c.label}`}>{c.label}<Icon name="close" /></button></li>)}
          </ul>
        )}
      </header>
      {n === 0 ? (
        <Empty still="atlas-stepped" title="No pain points match these filters."
          action={<button type="button" class="b b-ghost" onClick={clearAll}><Icon name="reset" />Clear all filters</button>}>
          <p>Each filter narrows the others. Remove one, or search a broader word.</p>
        </Empty>
      ) : (
        <ol class="recs">
          {m.rows.map((p) => <Record key={p.id} p={p} terms={m.terms} />)}
        </ol>
      )}
      <dialog ref={sheet} class="sheet" aria-labelledby="sheet-h" onClick={(e) => { if (e.target === sheet.current) sheet.current?.close(); }}>
        <div class="sheet-body">
          <button type="button" class="sheet-x" onClick={() => sheet.current?.close()} aria-label="Close filters"><Icon name="close" /></button>
          <Filters inSheet />
        </div>
        <div class="sheet-foot"><button type="button" class="b b-primary b-block" onClick={() => sheet.current?.close()}>Show {plural(n, "pain point")}</button></div>
      </dialog>
    </div>
  );
}

function Record({ p, terms }: { p: PainPoint; terms: string[] }) {
  const sid = stepIdOf(p.taskId, p.stepIndex);
  const href = hrefFor({ view: "explore", fn: p.functionId, p: p.processId, s: sid, q: "" });
  return (
    <li class={`rec sev-${p.severity}`}>
      <p class="rec-meta"><SevMark sev={p.severity} /><span class="rec-cat">{categoryLabel(p.category, p.categoryLabel)}</span></p>
      <h3 class="rec-title">
        <a href={href} class="rec-link" onClick={(e) => { e.preventDefault(); go({ view: "explore", fn: p.functionId, p: p.processId, s: sid, q: "" }); }}>
          <Hl text={p.title} terms={terms} />
        </a>
      </h3>
      <p class="rec-impact"><Hl text={p.impact} terms={terms} /></p>
      <div class="rec-path">
        <p class="rp-line">
          <span class="rp"><FnIcon id={p.functionId} class="sm" />{p.functionName}</span>
          <span class="rp"><span class="code">{p.processId}</span>{p.processName}</span>
          <span class="rp"><span class="code">{p.taskId}</span>{p.taskName}</span>
        </p>
        <p class="rp-step"><span class="code">{sid}</span><span class="rp-st">Step {p.stepIndex + 1}: <Hl text={p.stepText} terms={terms} /></span></p>
      </div>
      <span class="rec-go" aria-hidden="true">Open step<Icon name="chevron" /></span>
    </li>
  );
}

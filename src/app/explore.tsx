/* Explore: function rail -> process list (grouped, searchable) -> process detail. The detail opens on its
   Breakdown tab: activities and tasks as a vertical flow, the 12 standard wrapper steps folded away by
   default, pain points pinned to core steps (or to the task, when they sit on a wrapper step). */
import { signal, computed } from "@preact/signals";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import {
  INDUSTRIES, COUNTRIES, SEVERITIES, PAIN_NOTE, ZONES, zoneOf, gatewayOf, stepKey, taskKey, categoryLabel, wrapperOf, isWrapper,
  stepLabel, isTemplatedIO, humanizeIO, WRAPPER_WHERE,
  type ProcRef, type PainPoint, type Task, type Industry, type Country,
} from "../lib/data";
import { route, go, goBack, hrefFor, shareUrl, tax, pain, taxIdx, painIdx, currentProc, currentFnId, loadData, say, stepIdOf, parseStepId, keyOf, pref, type DetailTab } from "./state";
import { searchProcs, type Hit } from "./search";
import { Icon, FnIcon, Hl, SevMark, ZoneMark, Empty, ErrorState, Skel, Ill, Impact, painTitle, painWhere, talkHref, plural, copyText, reduceMotion } from "./ui";
import { Seg } from "./controls";
import { focusXrayStep } from "./xray";

/* ---- local state ---------------------------------------------------------------------------- */
/** Keyboard-highlighted row in the process list (a process key), separate from the open process. */
export const listActive = signal<string | null>(null);
/** On phones the panes stack; typing a search forces the list pane forward. */
export const mPane = signal<"list" | null>(null);
const hideStd = pref("vb-hide-std", true);
const showZones = pref("vb-zones", false);
/** Collapsed activities and tasks, keyed "<process key>:<id>". */
const collapsed = signal<Set<string>>(new Set());
/** Tasks whose folded standard steps the reader opened. */
const openStd = signal<Set<string>>(new Set());
const toggleIn = (s: typeof collapsed, k: string, force?: boolean) => {
  const n = new Set(s.value); const on = force ?? !n.has(k); if (on) n.add(k); else n.delete(k); s.value = n;
};

const search = computed(() => {
  const idx = taxIdx.value; const q = route.value.q.trim();
  return idx && q ? searchProcs(idx.list, q) : null;
});
interface ListGroup { id: string; code: string; name: string; fnId?: string; best?: boolean; items: { ref: ProcRef; hit?: Hit }[] }
const groups = computed<ListGroup[]>(() => {
  const idx = taxIdx.value; if (!idx) return [];
  const res = search.value;
  if (res) {
    const hits = res.hits; if (!hits.length) return [];
    // the strongest matches lead, whatever function they are in; the rest follow by function, strongest first
    const nBest = hits.length <= 6 ? hits.length : 5;
    const out: ListGroup[] = [{ id: "g-best", code: "", name: hits.length <= 6 ? "Matches" : "Best matches", best: true, items: hits.slice(0, nBest).map((hit) => ({ ref: hit.ref, hit })) }];
    const byFn = new Map<string, ListGroup>();
    for (const hit of hits.slice(nBest)) {
      const id = hit.ref.fn.functionId;
      if (!byFn.has(id)) byFn.set(id, { id: `g-${id}`, code: "", name: hit.ref.fn.functionName, fnId: id, items: [] });
      byFn.get(id)!.items.push({ ref: hit.ref, hit });
    }
    return [...out, ...byFn.values()];
  }
  const fn = idx.fnById.get(currentFnId.value); if (!fn) return [];
  return fn.processGroups.map((g) => ({
    id: `g-${fn.functionId}-${g.groupId}`, code: g.groupId, name: g.groupName,
    items: g.processes.map((p) => ({ ref: idx.byKey.get(`${fn.functionId}/${p.id}`)! })),
  }));
});
const flat = computed(() => groups.value.flatMap((g) => g.items.map((i) => i.ref)));
const optId = (key: string) => `opt-${key.replace(/[^\w.-]/g, "_")}`;

export function openProc(ref: ProcRef, o: { focusDetail?: boolean } = {}) {
  listActive.value = keyOf(ref); mPane.value = null;
  go({ view: "explore", fn: ref.fn.functionId, p: ref.proc.id, s: undefined });
  if (o.focusDetail) requestAnimationFrame(() => document.getElementById("proc-title")?.focus({ preventScroll: true }));
}

/** Keyboard handling shared by the toolbar search (as a combobox) and the list itself. */
export function listKey(e: KeyboardEvent): boolean {
  const items = flat.value; if (!items.length && e.key !== "Escape") return false;
  const cur = listActive.value ?? (currentProc.value ? keyOf(currentProc.value) : null);
  let i = items.findIndex((r) => keyOf(r) === cur);
  const set = (n: number) => { listActive.value = keyOf(items[Math.max(0, Math.min(items.length - 1, n))]); };
  switch (e.key) {
    case "ArrowDown": set(i < 0 ? 0 : i + 1); break;
    case "ArrowUp": set(i < 0 ? 0 : i - 1); break;
    case "Home": if ((e.target as HTMLElement).tagName === "INPUT") return false; set(0); break;
    case "End": if ((e.target as HTMLElement).tagName === "INPUT") return false; set(items.length - 1); break;
    case "PageDown": set(i + 10); break;
    case "PageUp": set(i - 10); break;
    case "Enter": {
      // with a fresh search, Enter opens the best match
      if (i < 0 || (search.value && !listActive.value)) i = 0;
      const ref = items[i]; if (!ref) return false; openProc(ref, { focusDetail: matchMedia("(max-width: 899px)").matches }); break;
    }
    case "Escape":
      if (route.value.q) { go({ q: "" }, { replace: true }); mPane.value = null; }
      else return false;
      break;
    default: return false;
  }
  e.preventDefault();
  return true;
}
export const activeOptionId = () => {
  const k = listActive.value; return k && flat.value.some((r) => keyOf(r) === k) ? optId(k) : undefined;
};

/* ---- view ------------------------------------------------------------------------------------- */
export function Explore() {
  const t = tax.value; const r = route.value;
  const pane = mPane.value || (r.p || r.s ? "detail" : r.fn || r.q ? "list" : "rail");
  if (t.state === "error") return <div class="ex ex-state"><ErrorState what="The process library" onRetry={() => loadData({ focus: true })} /></div>;
  return (
    <div class="ex" data-pane={pane}>
      <Rail />
      <ProcList />
      <Detail />
    </div>
  );
}

function Rail() {
  const idx = taxIdx.value; const fnId = currentFnId.value; const res = search.value; const h = res?.hits;
  const counts = new Map<string, number>();
  if (h) for (const x of h) counts.set(x.ref.fn.functionId, (counts.get(x.ref.fn.functionId) || 0) + 1);
  return (
    <nav class="pane rail" aria-labelledby="rail-title">
      <header class="pane-head">
        <h2 class="pane-title" id="rail-title" tabIndex={-1}>Functions</h2>
        <span class="pane-count num">{idx ? idx.fnById.size : 13}</span>
      </header>
      <div class="pane-scroll">
        {!idx ? <RailSkeleton /> : (
          <ul class="rail-list">
            {[...idx.fnById.values()].map((fn) => {
              const n = h ? counts.get(fn.functionId) || 0 : fn.processGroups.reduce((a, g) => a + g.processes.length, 0);
              const on = fn.functionId === fnId;
              return (
                <li key={fn.functionId}>
                  <a class={`rail-item${h && !n ? " is-dim" : ""}`} href={hrefFor({ view: "explore", fn: fn.functionId, p: undefined, s: undefined })}
                    aria-current={on ? "true" : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      if (h) {
                        go({ fn: fn.functionId }, { replace: true }); mPane.value = "list";
                        requestAnimationFrame(() => document.getElementById(`g-${fn.functionId}`)?.scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" }));
                      } else { listActive.value = null; mPane.value = null; go({ view: "explore", fn: fn.functionId, p: undefined, s: undefined }); }
                    }}>
                    <FnIcon id={fn.functionId} />
                    <span class="rail-name">{fn.functionName}</span>
                    <span class="rail-n num">{n}<span class="sr-only">{h ? " matching" : " processes"}</span></span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </nav>
  );
}
const RailSkeleton = () => (
  <ul class="rail-list" aria-hidden="true">
    {Array.from({ length: 13 }, (_, i) => <li key={i}><span class="rail-item is-skel"><span class="fn-ico sk-box" /><span class="sk-line" style={{ width: `${55 + ((i * 17) % 35)}%` }} /></span></li>)}
  </ul>
);

function ProcList() {
  const idx = taxIdx.value; const r = route.value; const res = search.value; const h = res?.hits; const gs = groups.value;
  const sel = currentProc.value; const selKey = sel ? keyOf(sel) : null;
  const active = listActive.value; const hl = res?.Q.hl || [];
  const painI = painIdx.value?.idx;
  const scroller = useRef<HTMLDivElement>(null);
  const fn = idx?.fnById.get(currentFnId.value);

  useEffect(() => {
    if (!active) return;
    document.getElementById(optId(active))?.scrollIntoView({ block: "nearest" });
  }, [active]);
  useEffect(() => {
    if (!selKey || h) return;
    const el = document.getElementById(optId(selKey)); const box = scroller.current;
    if (el && box) {
      const a = el.getBoundingClientRect(), b = box.getBoundingClientRect();
      if (a.top < b.top + 40 || a.bottom > b.bottom) box.scrollTop += a.top - b.top - box.clientHeight / 3;
    }
  }, [selKey, currentFnId.value, !!idx]);
  useEffect(() => { if (h && scroller.current) scroller.current.scrollTop = 0; }, [r.q]);

  const q = r.q.trim();
  const title = h ? "Search results" : fn?.functionName || "Processes";
  const status = !idx ? "Loading processes" : h ? (h.length ? `${plural(h.length, "process", "processes")} match “${res?.corrected || q}”` : `No process matches “${q}”`)
    : fn ? `${fn.processGroups.length} process groups, ${plural(flat.value.length, "process", "processes")}` : "";

  return (
    <section class="pane list" aria-labelledby="list-title">
      <header class="pane-head">
        <button type="button" class="back" onClick={() => { mPane.value = null; if (r.q) go({ q: "" }, { replace: true }); goBack({ fn: undefined, p: undefined, s: undefined, q: "" }); }}>
          <Icon name="back" /><span>Functions</span>
        </button>
        <div class="pane-head-text">
          <h2 class="pane-title" id="list-title" tabIndex={-1}>{h ? title : <>{fn && <FnIcon id={fn.functionId} class="sm" />}{title}</>}</h2>
          <p class="pane-sub" aria-live="polite">{status}</p>
        </div>
      </header>
      <div class="pane-scroll" ref={scroller}>
        {res?.corrected && h && h.length > 0 && (
          <p class="corrected">Showing results for <b>{res.corrected}</b>. No process matched “{q}”.</p>
        )}
        {!idx ? <Skel rows={14} class="skel-list" /> : h && !h.length ? (
          <Empty still="atlas-plate-square" title="Nothing matches that yet."
            action={<button type="button" class="b b-ghost" onClick={() => { go({ q: "" }, { replace: true }); mPane.value = null; document.getElementById("vb-search")?.focus(); }}>Clear search</button>}>
            <p>Search looks at process names, descriptions, activities and tasks, and knows shorthand such as AP, AR, P2P and month-end. Try{" "}
              {["invoice", "payroll", "close", "onboarding"].map((w, i, a) => (
                <span key={w}><button type="button" class="linkish" onClick={() => go({ q: w }, { replace: true })}>{w}</button>{i < a.length - 2 ? ", " : i === a.length - 2 ? " or " : ""}</span>
              ))}.
            </p>
          </Empty>
        ) : (
          <div class="listbox" role="listbox" id="vb-proclist" aria-labelledby="list-title" tabIndex={0}
            aria-activedescendant={activeOptionId()} onKeyDown={(e) => listKey(e)}
            onFocus={() => { if (!listActive.value && selKey) listActive.value = selKey; }}>
            {gs.map((g) => (
              <div key={g.id} role="group" aria-labelledby={`${g.id}-h`} class={`grp${g.best ? " grp-best" : ""}`} id={g.fnId ? `g-${g.fnId}` : undefined}>
                <div class="grp-h" id={`${g.id}-h`} role="presentation">
                  {g.fnId ? <FnIcon id={g.fnId} class="sm" /> : g.code ? <span class="code">{g.code}</span> : null}
                  <span class="grp-name">{g.name}</span>
                  {h && <span class="grp-n num">{g.items.length}</span>}
                </div>
                {g.items.map(({ ref, hit }) => {
                  const key = keyOf(ref); const pains = painI?.byProc.get(key) || [];
                  const top = pains[0]?.severity;
                  return (
                    <div key={key} id={optId(key)} role="option" aria-selected={key === selKey}
                      class={`opt${key === active ? " is-active" : ""}`} onClick={() => openProc(ref, { focusDetail: matchMedia("(max-width: 899px)").matches })}>
                      <span class="code">{ref.proc.id}</span>
                      <span class="opt-main">
                        <span class="opt-name"><Hl text={ref.proc.name} hl={hl} /></span>
                        {h && <span class="opt-fn">{ref.fn.functionName}</span>}
                        {hit?.context && <span class="opt-ctx"><span class="opt-ctx-l">{hit.context.label}</span> <Hl text={hit.context.text} hl={hl} /></span>}
                      </span>
                      <span class="opt-meta">
                        {ref.flagship && <span class="tag-l6" title="Curated step detail">L6</span>}
                        {pains.length > 0 && (
                          <span class={`pc sev-${top}`} title={`${plural(pains.length, "illustrative pain point")}, highest ${top.toLowerCase()}`}>
                            <i aria-hidden="true" />{pains.length}<span class="sr-only"> illustrative pain points, highest {top}</span>
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ---- detail ------------------------------------------------------------------------------------ */
const TAB_LABEL: Record<DetailTab, [string, string]> = { steps: ["Breakdown", "Breakdown"], lens: ["Industry and country", "Lens"], kpis: ["Systems and KPIs", "KPIs"], pain: ["Pain points", "Pain points"] };

function Detail() {
  const ref = currentProc.value; const r = route.value;
  const scroller = useRef<HTMLDivElement>(null);
  const key = ref ? keyOf(ref) : "";
  useLayoutEffect(() => { if (scroller.current && !r.s) scroller.current.scrollTop = 0; }, [key]);
  // land on a pinned step (deep link or "open step" from the pain-point library)
  useEffect(() => {
    if (!r.s || !ref) return;
    const st = parseStepId(r.s); if (!st) return;
    const task = ref.proc.activities.flatMap((a) => a.tasks.map((t) => ({ a, t }))).find((x) => x.t.id === st.taskId);
    if (!task) return;
    // make sure the activity and task are open; a wrapper step is shown at task level
    toggleIn(collapsed, `${key}:${task.a.id}`, false); toggleIn(collapsed, `${key}:${task.t.id}`, false);
    const wrapper = isWrapper(task.t.steps[st.index] || "");
    requestAnimationFrame(() => {
      const el = document.getElementById(wrapper ? `task-${task.t.id}` : `step-${r.s}`); if (!el) return;
      el.scrollIntoView({ block: wrapper ? "start" : "center", behavior: reduceMotion() ? "auto" : "smooth" });
      el.classList.remove("is-target"); void el.offsetWidth; el.classList.add("is-target");
      el.focus({ preventScroll: true });
    });
  }, [r.s, key, painIdx.value != null]);

  if (!ref) return (
    <article class="pane detail" aria-busy="true" aria-label="Process detail">
      <div class="pane-scroll"><div class="d-wrap"><Skel rows={2} class="skel-title" /><Skel rows={5} /><Skel rows={9} class="skel-flow" /></div></div>
    </article>
  );
  const { fn, group, proc } = ref;
  const painD = pain.value; const pins = painIdx.value?.idx.byProc.get(key) || [];
  const core = proc.activities.reduce((n, a) => n + a.tasks.reduce((m, t) => m + t.steps.filter((s) => !isWrapper(s)).length, 0), 0);
  const tabs: DetailTab[] = ["steps", "lens", "kpis", "pain"];
  const setTab = (tab: DetailTab, focus = false) => {
    go({ tab, s: undefined }, { replace: true });
    if (focus) requestAnimationFrame(() => document.getElementById(`dtab-${tab}`)?.focus());
  };

  return (
    <article class="pane detail" aria-labelledby="proc-title">
      <div class="pane-scroll" ref={scroller}>
        <div class="d-wrap">
          <header class="d-head">
            <button type="button" class="back" onClick={() => goBack({ p: undefined, s: undefined })}><Icon name="back" /><span>{r.q ? "Results" : fn.functionName}</span></button>
            <p class="crumb">
              <a href={hrefFor({ view: "explore", fn: fn.functionId, p: undefined, s: undefined, q: "" })}
                onClick={(e) => { e.preventDefault(); go({ view: "explore", fn: fn.functionId, p: undefined, s: undefined, q: "" }); }}>
                <FnIcon id={fn.functionId} class="sm" />{fn.functionName}</a>
              <span class="crumb-sep" aria-hidden="true">/</span>
              <span><span class="code">{group.groupId}</span> {group.groupName}</span>
            </p>
            <div class="d-idrow">
              <span class="code code-lg">{proc.id}</span>
              {ref.flagship && <span class="badge"><span class="tag-l6" aria-hidden="true">L6</span>Curated step detail</span>}
            </div>
            <h2 id="proc-title" class="d-title" tabIndex={-1}>{proc.name}</h2>
            <p class="d-desc">{proc.description}</p>
            <div class="d-bar">
              <dl class="readout">
                <div><dt>Activities</dt><dd class="num">{proc.activities.length}</dd></div>
                <div><dt>Tasks</dt><dd class="num">{ref.taskCount}</dd></div>
                <div><dt>Steps</dt><dd class="num">{ref.stepCount}<span class="dd-sub">{core} core</span></dd></div>
                <div><dt>Pain points <Ill /></dt><dd class="num">{painD.state === "ready" ? pins.length : painD.state === "error" ? "–" : "…"}</dd></div>
              </dl>
              <div class="d-actions">
                <a class="b b-primary" href={hrefFor({ view: "xray", fn: fn.functionId, p: proc.id })} onClick={(e) => { e.preventDefault(); go({ view: "xray", fn: fn.functionId, p: proc.id }); }}><Icon name="xray" />X-ray this process</a>
                <button type="button" class="b b-ghost" onClick={async () => {
                  const ok = await copyText(shareUrl({ s: r.s }));
                  say(ok ? "Link copied" : "Couldn't copy. The link is in the address bar.", { tone: ok ? "ok" : "warn" });
                }}><Icon name="link" />Copy link</button>
              </div>
            </div>
          </header>

          <div class="d-tabs" role="tablist" aria-label="Process detail"
            onKeyDown={(e) => {
              const i = tabs.indexOf(r.tab); const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (d) { e.preventDefault(); setTab(tabs[(i + d + tabs.length) % tabs.length], true); }
            }}>
            {tabs.map((t) => (
              <button key={t} id={`dtab-${t}`} type="button" role="tab" class="d-tab" aria-selected={r.tab === t} aria-controls="d-panel" tabIndex={r.tab === t ? 0 : -1} onClick={() => setTab(t)}>
                {TAB_LABEL[t][0] === TAB_LABEL[t][1] ? TAB_LABEL[t][0] : <><span class="tl-long">{TAB_LABEL[t][0]}</span><span class="tl-short">{TAB_LABEL[t][1]}</span></>}
                {t === "pain" && painD.state === "ready" ? <span class="d-tab-n num">{pins.length}</span> : null}
              </button>
            ))}
          </div>
          <div id="d-panel" role="tabpanel" aria-labelledby={`dtab-${r.tab}`} class="d-panel">
            {r.tab === "steps" && <Breakdown pr={ref} />}
            {r.tab === "lens" && <Lens pr={ref} />}
            {r.tab === "kpis" && <Kpis pr={ref} />}
            {r.tab === "pain" && <PainTab pr={ref} />}
          </div>

          <footer class="d-foot">
            <div>
              <h3 class="h-md">Bring this process to a conversation.</h3>
              <p>We'll lay it against your own steps and show you where it breaks.</p>
            </div>
            <a class="b b-light" href={`/contact/?process=${encodeURIComponent(proc.id)}&fn=${encodeURIComponent(fn.functionId)}`}><Icon name="mail" />Talk to us about this process</a>
          </footer>
          <p class="d-legal note">General information on process design. Not legal, tax or regulatory advice.</p>
        </div>
      </div>
    </article>
  );
}

function Lens({ pr }: { pr: ProcRef }) {
  const r = route.value; const cal = pr.proc.calibration;
  const setLens = (patch: { ind?: Industry; cty?: Country; cmp?: boolean }) => go(patch, { replace: true });
  return (
    <section class="d-sec" aria-labelledby="lens-h">
      <div class="d-sec-head">
        <div>
          <h3 id="lens-h" class="h-md">Calibrated to your industry and country</h3>
          <p class="d-sec-sub">Every process carries a note for each of 6 industries and 3 countries.</p>
        </div>
        <label class="switch">
          <input type="checkbox" checked={r.cmp} onChange={(e) => setLens({ cmp: (e.currentTarget as HTMLInputElement).checked })} />
          <span class="switch-ui" aria-hidden="true" /><span>Compare all</span>
        </label>
      </div>
      {!r.cmp ? (
        <>
          <div class="lens-inline">
            <Seg label="Industry" class="seg-wrap" value={r.ind} onChange={(ind) => setLens({ ind })}
              options={(Object.keys(INDUSTRIES) as Industry[]).map((k) => ({ id: k, label: INDUSTRIES[k] }))} />
            <Seg label="Country" value={r.cty} onChange={(cty) => setLens({ cty })}
              options={(Object.keys(COUNTRIES) as Country[]).map((k) => ({ id: k, label: COUNTRIES[k] }))} />
          </div>
          <div class="cal-grid" aria-live="polite">
            <div class="cal-card"><h4 class="h-xs">{INDUSTRIES[r.ind]}</h4><p>{cal.industry[r.ind] || "No industry note for this process yet."}</p></div>
            <div class="cal-card"><h4 class="h-xs">{COUNTRIES[r.cty]}</h4><p>{cal.country[r.cty] || "No country note for this process yet."}</p></div>
          </div>
        </>
      ) : (
        <>
          <h4 class="h-sm cmp-h">Industry notes</h4>
          <div class="cmp-grid">
            {(Object.keys(INDUSTRIES) as Industry[]).map((k) => (
              <button key={k} type="button" class={`cal-card cmp-card${k === r.ind ? " is-on" : ""}`} aria-pressed={k === r.ind} onClick={() => setLens({ ind: k })}>
                <span class="h-xs">{INDUSTRIES[k]}</span><span class="cmp-text">{cal.industry[k] || "No note yet."}</span>
              </button>
            ))}
          </div>
          <h4 class="h-sm cmp-h">Country notes</h4>
          <div class="cmp-grid cmp-3">
            {(Object.keys(COUNTRIES) as Country[]).map((k) => (
              <button key={k} type="button" class={`cal-card cmp-card${k === r.cty ? " is-on" : ""}`} aria-pressed={k === r.cty} onClick={() => setLens({ cty: k })}>
                <span class="h-xs">{COUNTRIES[k]}</span><span class="cmp-text">{cal.country[k] || "No note yet."}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Kpis({ pr }: { pr: ProcRef }) {
  const cal = pr.proc.calibration;
  return (
    <section class="d-sec d-sk">
      <div><h3 class="h-md">Typical systems</h3><ul class="sys">{cal.systems.map((s) => <li key={s}>{s}</li>)}</ul></div>
      <div><h3 class="h-md">Representative KPIs</h3><ul class="kpis">{cal.kpis.map((k) => <li key={k}>{k}</li>)}</ul></div>
    </section>
  );
}

function PainTab({ pr }: { pr: ProcRef }) {
  const painD = pain.value; const key = keyOf(pr); const pins = painIdx.value?.idx.byProc.get(key) || [];
  const sevCount = SEVERITIES.map((s) => [s, pins.filter((p) => p.severity === s).length] as const).filter(([, n]) => n);
  return (
    <section class="d-sec" aria-labelledby="pp-h">
      <div class="d-sec-head">
        <div>
          <h3 id="pp-h" class="h-md">Where it breaks <Ill /></h3>
          {painD.state === "ready" && <p class="d-sec-sub">{plural(pins.length, "illustrative pain point")}{sevCount.length ? ": " : ""}{sevCount.map(([s, n], i) => <span key={s}>{i ? ", " : ""}{n} {s.toLowerCase()}</span>)}</p>}
        </div>
      </div>
      {painD.state === "loading" && <Skel rows={3} />}
      {painD.state === "error" && <p class="inline-err">Pain points didn't load. <button type="button" class="linkish" onClick={() => loadData()}>Try again</button></p>}
      {painD.state === "ready" && (pins.length ? (
        <ul class="pp-list">
          {pins.map((p) => {
            const sid = stepIdOf(p.taskId, p.stepIndex); const where = painWhere(p);
            return (
              <li key={p.id} class={`pp-item sev-${p.severity}`}>
                <p class="pin-meta"><SevMark sev={p.severity} /><span class="pin-cat">{categoryLabel(p.category, p.categoryLabel)}</span><Ill /></p>
                <p class="pin-title">{painTitle(p)}</p>
                <Impact p={p} />
                <p class="pp-where"><span class="code">{where.wrapper ? p.taskId : sid}</span>{where.wrapper ? <> Task: {p.taskName}. {where.text}</> : <> {where.text}: {stepLabel(p.stepText, p.taskName)}</>}</p>
                <p class="pp-acts">
                  <a class="b b-ghost b-sm" href={hrefFor({ s: sid, tab: "steps" })} onClick={(e) => { e.preventDefault(); go({ s: sid, tab: "steps" }, { replace: true }); }}>{where.wrapper ? "Go to task" : "Go to step"}</a>
                  <a class="b b-quiet b-sm" href={talkHref(p)}><Icon name="mail" />Talk to us about this step</a>
                </p>
              </li>
            );
          })}
        </ul>
      ) : <p class="muted">No pain points recorded for this process.</p>)}
      <p class="note">{PAIN_NOTE}</p>
    </section>
  );
}

function Breakdown({ pr }: { pr: ProcRef }) {
  const key = keyOf(pr); const proc = pr.proc;
  const ids = proc.activities.flatMap((a) => [a.id, ...a.tasks.map((t) => t.id)]);
  const anyCollapsed = ids.some((id) => collapsed.value.has(`${key}:${id}`));
  const nWrap = proc.activities.reduce((n, a) => n + a.tasks.reduce((m, t) => m + t.steps.filter(isWrapper).length, 0), 0);
  return (
    <section class="d-sec d-flow" aria-labelledby="flow-h">
      <div class="d-sec-head flow-head">
        <div>
          <h3 id="flow-h" class="h-md">Breakdown to the step</h3>
          <p class="d-sec-sub">
            {proc.hasStepDetail ? "A flagship process: one task carries curated steps. " : ""}
            {nWrap ? `${nWrap} of the ${pr.stepCount} steps follow the standard pattern (receive, check, decide, hand off) that an engagement replaces with your own steps.` : "Every step here is curated."}
          </p>
        </div>
      </div>
      <div class="flow-tools">
        {nWrap > 0 && (
          <label class="switch">
            <input type="checkbox" checked={hideStd.value} onChange={(e) => { hideStd.value = (e.currentTarget as HTMLInputElement).checked; openStd.value = new Set(); }} />
            <span class="switch-ui" aria-hidden="true" /><span>Hide standard steps</span>
          </label>
        )}
        <label class="switch">
          <input type="checkbox" checked={showZones.value} onChange={(e) => { showZones.value = (e.currentTarget as HTMLInputElement).checked; }} />
          <span class="switch-ui" aria-hidden="true" /><span>Show zones</span>
        </label>
        <button type="button" class="b b-quiet b-sm" onClick={() => {
          const n = new Set(collapsed.value);
          if (anyCollapsed) ids.forEach((id) => n.delete(`${key}:${id}`)); else proc.activities.forEach((a) => n.add(`${key}:${a.id}`));
          collapsed.value = n;
        }}>{anyCollapsed ? "Expand all" : "Collapse all"}</button>
      </div>
      <Legend zones={showZones.value} />
      <Flow pr={pr} />
    </section>
  );
}

function Legend({ zones }: { zones: boolean }) {
  return (
    <ul class="legend" aria-label="Legend">
      <li><span class="lg lg-task" aria-hidden="true" />Step</li>
      <li><span class="lg lg-gw" aria-hidden="true" />Decision point</li>
      <li><span class="lg lg-std" aria-hidden="true" />Standard step</li>
      <li><span class="lg lg-pain sev-High" aria-hidden="true" /><span class="lg lg-pain sev-Medium" aria-hidden="true" /><span class="lg lg-pain sev-Low" aria-hidden="true" />Pain point by severity <Ill /></li>
      {zones && (Object.keys(ZONES) as (keyof typeof ZONES)[]).map((z) => <li key={z}><ZoneMark zone={z} label={ZONES[z].label} /></li>)}
    </ul>
  );
}

function IOEvent({ kind, text, pr }: { kind: "start" | "end"; text: string; pr: ProcRef }) {
  const templ = isTemplatedIO(text, pr.proc.name);
  return (
    <li class={`fl-event fl-${kind}${templ ? " is-std" : ""}`}>
      <span class="node" aria-hidden="true" />
      <div class="fl-body">
        <p class="fl-kind">{kind === "start" ? "Starts when" : "Produces"}{templ && <span class="std-tag">Standard wording</span>}</p>
        <p class="fl-text">{humanizeIO(text, pr.proc.name)}</p>
      </div>
    </li>
  );
}

function Flow({ pr }: { pr: ProcRef }) {
  const { proc } = pr; const key = keyOf(pr);
  const pidx = painIdx.value?.idx;
  return (
    <ol class="flow">
      <IOEvent kind="start" text={proc.trigger} pr={pr} />
      {proc.activities.map((a) => {
        const open = !collapsed.value.has(`${key}:${a.id}`);
        const nPain = pidx?.byProc.get(key)?.filter((p) => p.activityId === a.id).length || 0;
        return (
          <li key={a.id} class={`fl-act${open ? "" : " is-closed"}`}>
            <h4 class="act-head">
              <button type="button" aria-expanded={open} aria-controls={`act-${a.id}`} onClick={() => toggleIn(collapsed, `${key}:${a.id}`)}>
                <Icon name="chevron" class="chev" /><span class="code">{a.id}</span><span class="act-name">{a.name}</span>
                <span class="act-n">{plural(a.tasks.length, "task")}{nPain ? `, ${plural(nPain, "pain point")}` : ""}</span>
              </button>
            </h4>
            {open && <ol class="fl-tasks" id={`act-${a.id}`}>{a.tasks.map((t) => <FlowTask key={t.id} t={t} pr={pr} />)}</ol>}
          </li>
        );
      })}
      <IOEvent kind="end" text={proc.output} pr={pr} />
    </ol>
  );
}

function FlowTask({ t, pr }: { t: Task; pr: ProcRef }) {
  const key = keyOf(pr); const fnId = pr.fn.functionId; const r = route.value;
  const pidx = painIdx.value?.idx;
  const open = !collapsed.value.has(`${key}:${t.id}`);
  const tk = taskKey(fnId, t.id);
  const taskPins = pidx?.byTask.get(tk) || [];
  const stdOpen = !hideStd.value || openStd.value.has(tk);
  const wrappers = t.steps.map((s, i) => ({ s, i, w: wrapperOf(s) })).filter((x) => x.w);
  const zones = showZones.value;
  return (
    <li class={`fl-task${taskPins.length ? ` has-pain sev-${taskPins[0].severity}` : ""}`} id={`task-${t.id}`} tabIndex={-1} aria-labelledby={`task-${t.id}-h`}>
      <h5 class="task-head" id={`task-${t.id}-h`}>
        <button type="button" aria-expanded={open} aria-controls={`steps-${t.id}`} onClick={() => toggleIn(collapsed, `${key}:${t.id}`)}>
          <Icon name="chevron" class="chev" /><span class="code"><span class="sr-only">Task </span>{t.id}</span><span class="task-name">{t.name}</span>
          {taskPins.length > 0 && <span class={`pc sev-${taskPins[0].severity}`}><i aria-hidden="true" />{taskPins.length}<span class="sr-only"> illustrative pain points at task level</span></span>}
        </button>
      </h5>
      {open && (
        <div id={`steps-${t.id}`}>
          {taskPins.length > 0 && (
            <div class="task-pins">
              {taskPins.map((p) => { const w = wrapperOf(p.stepText); return <Pin key={p.id} p={p} where={w ? WRAPPER_WHERE[w.kind] : ""} />; })}
            </div>
          )}
          <ol class="fl-steps">
            {t.steps.map((s, i) => {
              const w = wrapperOf(s);
              if (w && !stdOpen) return null;
              const sid = stepIdOf(t.id, i); const gw = gatewayOf(s);
              const pp = w ? [] : pidx?.byStep.get(stepKey(fnId, t.id, i)) || [];
              const z = zones ? zoneOf(s, t.name) : null;
              return (
                <li key={sid} id={`step-${sid}`} tabIndex={-1} aria-labelledby={`step-${sid}-c step-${sid}-t`}
                  class={`st${gw ? " st-gw" : ""}${w ? " st-std" : ""}${pp.length ? ` has-pain sev-${pp[0].severity}` : ""}${sid === r.s ? " is-target" : ""}`}>
                  <span class="node" aria-hidden="true">{pp.length > 0 && <span class="fault" />}</span>
                  <div class="st-body">
                    <div class="st-meta">
                      <span class="code" id={`step-${sid}-c`}><span class="sr-only">Step </span>{sid}</span>
                      {w && <span class="std-tag">Standard step</span>}
                      {gw && <span class="st-kind">Decision</span>}
                      {z && <ZoneMark zone={z.zone} label={ZONES[z.zone].label} />}
                      <a class="st-x" href={hrefFor({ view: "xray", fn: pr.fn.functionId, p: pr.proc.id })}
                        onClick={(e) => { e.preventDefault(); go({ view: "xray", fn: pr.fn.functionId, p: pr.proc.id, basis: w ? "all" : route.value.basis }); requestAnimationFrame(() => focusXrayStep(sid)); }}
                        aria-label={`See step ${sid} in the X-ray`}><Icon name="xray" /><span class="st-x-l">X-ray</span></a>
                    </div>
                    <p class="st-text" id={`step-${sid}-t`}>{stepLabel(s, t.name)}</p>
                    {gw && (
                      <p class="branch">
                        <span class="br-off"><span class="br-l">{gw.off}</span><span class="br-line" aria-hidden="true" />{gw.offText}</span>
                        <span class="br-on"><span class="br-l">{gw.on}</span>continues</span>
                      </p>
                    )}
                    {pp.map((p) => <Pin key={p.id} p={p} />)}
                  </div>
                </li>
              );
            })}
            {wrappers.length > 0 && hideStd.value && (
              <li class="st-fold">
                <button type="button" aria-expanded={stdOpen} onClick={() => toggleIn(openStd, tk)}>
                  <span class="fold-n num">{wrappers.length}</span>
                  <span>{stdOpen ? "Hide the standard steps" : `standard steps: ${wrappers.map((x) => x.w!.label.toLowerCase()).join(", ")}`}</span>
                </button>
              </li>
            )}
          </ol>
        </div>
      )}
    </li>
  );
}

function Pin({ p, where }: { p: PainPoint; where?: string }) {
  return (
    <div class={`pin sev-${p.severity}`}>
      <p class="pin-meta"><SevMark sev={p.severity} /><span class="pin-cat">{categoryLabel(p.category, p.categoryLabel)}</span><Ill />{where && <span class="pin-where">{where}</span>}</p>
      <p class="pin-title">{painTitle(p)}</p>
      <Impact p={p} />
      <p class="pin-acts"><a href={talkHref(p)}>Talk to us about this step</a></p>
    </div>
  );
}

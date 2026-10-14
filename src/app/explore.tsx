/* Explore: function rail -> process list (grouped, searchable) -> process detail with the
   L4 -> L5 -> L6 breakdown drawn as a vertical flow and pain points pinned to their exact step. */
import { signal, computed } from "@preact/signals";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import {
  INDUSTRIES, COUNTRIES, SEVERITIES, PAIN_NOTE, ZONES, zoneOf, gatewayOf, stepKey, categoryLabel,
  type ProcRef, type PainPoint, type Task, type Severity,
} from "../lib/data";
import { route, go, goBack, hrefFor, tax, pain, taxIdx, painIdx, currentProc, currentFnId, loadData, say, stepIdOf, keyOf } from "./state";
import { searchProcs, termsOf, type Hit } from "./search";
import { Icon, FnIcon, Hl, SevMark, ZoneMark, Empty, ErrorState, Skel, plural, copyText, reduceMotion } from "./ui";
import { LensInline } from "./controls";
import { focusXrayStep } from "./xray";

/* ---- local state ---------------------------------------------------------------------------- */
/** Keyboard-highlighted row in the process list (a process key), separate from the open process. */
export const listActive = signal<string | null>(null);
/** On phones the panes stack; typing a search forces the list pane forward. */
export const mPane = signal<"list" | null>(null);
const showZones = signal<boolean>(readPref());
function readPref() { try { return localStorage.getItem("vb-zones") === "1"; } catch { return false; } }
function writePref(v: boolean) { try { localStorage.setItem("vb-zones", v ? "1" : "0"); } catch { /* private mode */ } }

const hits = computed<Hit[] | null>(() => {
  const idx = taxIdx.value; const q = route.value.q.trim();
  return idx && q ? searchProcs(idx.list, q) : null;
});
interface ListGroup { id: string; code: string; name: string; fnId?: string; items: { ref: ProcRef; hit?: Hit }[] }
const groups = computed<ListGroup[]>(() => {
  const idx = taxIdx.value; if (!idx) return [];
  const h = hits.value;
  if (h) {
    const byFn = new Map<string, ListGroup>();
    for (const fn of idx.fnById.values()) byFn.set(fn.functionId, { id: `g-${fn.functionId}`, code: "", name: fn.functionName, fnId: fn.functionId, items: [] });
    for (const hit of h) byFn.get(hit.ref.fn.functionId)!.items.push({ ref: hit.ref, hit });
    return [...byFn.values()].filter((g) => g.items.length);
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
    case "Enter": { if (i < 0) i = 0; const ref = items[i]; if (!ref) return false; openProc(ref, { focusDetail: matchMedia("(max-width: 899px)").matches }); break; }
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
  if (t.state === "error") return <div class="ex ex-state"><ErrorState what="The process library" onRetry={loadData} /></div>;
  return (
    <div class="ex" data-pane={pane}>
      <Rail />
      <ProcList />
      <Detail />
    </div>
  );
}

function Rail() {
  const idx = taxIdx.value; const fnId = currentFnId.value; const h = hits.value;
  const counts = new Map<string, number>();
  if (h) for (const x of h) counts.set(x.ref.fn.functionId, (counts.get(x.ref.fn.functionId) || 0) + 1);
  return (
    <nav class="pane rail" aria-label="Business functions">
      <header class="pane-head">
        <h2 class="pane-title">Functions</h2>
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
                    aria-current={on ? "true" : undefined} title={fn.functionName}
                    onClick={(e) => {
                      e.preventDefault();
                      if (h) {
                        go({ fn: fn.functionId }, { replace: true }); mPane.value = "list";
                        requestAnimationFrame(() => document.getElementById(`g-${fn.functionId}`)?.scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" }));
                      } else { listActive.value = null; mPane.value = null; go({ view: "explore", fn: fn.functionId, p: undefined, s: undefined }); }
                    }}>
                    <FnIcon id={fn.functionId} />
                    <span class="rail-name">{fn.functionName}</span>
                    <span class="rail-n num" aria-label={h ? `${n} matching` : `${n} processes`}>{n}</span>
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
  const idx = taxIdx.value; const r = route.value; const h = hits.value; const gs = groups.value;
  const sel = currentProc.value; const selKey = sel ? keyOf(sel) : null;
  const active = listActive.value; const terms = termsOf(r.q);
  const painI = painIdx.value?.idx;
  const scroller = useRef<HTMLDivElement>(null);
  const fn = idx?.fnById.get(currentFnId.value);

  // keep the keyboard-active row in view
  useEffect(() => {
    if (!active) return;
    document.getElementById(optId(active))?.scrollIntoView({ block: "nearest" });
  }, [active]);
  // when the function or open process changes from outside (deep link, back/forward), show the open row
  useEffect(() => {
    if (!selKey || h) return;
    const el = document.getElementById(optId(selKey)); const box = scroller.current;
    if (el && box) {
      const a = el.getBoundingClientRect(), b = box.getBoundingClientRect();
      if (a.top < b.top + 40 || a.bottom > b.bottom) box.scrollTop += a.top - b.top - box.clientHeight / 3;
    }
  }, [selKey, currentFnId.value, !!idx]);
  useEffect(() => { if (h && scroller.current) scroller.current.scrollTop = 0; }, [r.q]);

  const title = h ? "Search results" : fn?.functionName || "Processes";
  const status = !idx ? "Loading processes" : h ? (h.length ? `${plural(h.length, "process", "processes")} match “${r.q.trim()}”` : `No process matches “${r.q.trim()}”`)
    : fn ? `${fn.processGroups.length} process groups, ${plural(flat.value.length, "process", "processes")}` : "";

  return (
    <section class="pane list" aria-labelledby="list-title">
      <header class="pane-head">
        <button type="button" class="back" onClick={() => { mPane.value = null; if (r.q) go({ q: "" }, { replace: true }); goBack({ fn: undefined, p: undefined, s: undefined, q: "" }); }}>
          <Icon name="back" /><span>Functions</span>
        </button>
        <div class="pane-head-text">
          <h2 class="pane-title" id="list-title">{h ? title : <>{fn && <FnIcon id={fn.functionId} class="sm" />}{title}</>}</h2>
          <p class="pane-sub" aria-live="polite">{status}</p>
        </div>
      </header>
      <div class="pane-scroll" ref={scroller}>
        {!idx ? <Skel rows={14} class="skel-list" /> : h && !h.length ? (
          <Empty still="atlas-plate-square" title="Nothing matches that yet."
            action={<button type="button" class="b b-ghost" onClick={() => { go({ q: "" }, { replace: true }); mPane.value = null; document.getElementById("vb-search")?.focus(); }}>Clear search</button>}>
            <p>Search looks at process names, descriptions, activities and tasks. Try a broader word, such as{" "}
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
              <div key={g.id} role="group" aria-labelledby={`${g.id}-h`} class="grp" id={g.fnId ? `g-${g.fnId}` : undefined}>
                <div class="grp-h" id={`${g.id}-h`} role="presentation">
                  {g.fnId ? <FnIcon id={g.fnId} class="sm" /> : <span class="code">{g.code}</span>}
                  <span class="grp-name">{g.name}</span>
                  {g.fnId && <span class="grp-n num">{g.items.length}</span>}
                </div>
                {g.items.map(({ ref, hit }) => {
                  const key = keyOf(ref); const pains = painI?.byProc.get(key) || [];
                  const top = pains[0]?.severity;
                  return (
                    <div key={key} id={optId(key)} role="option" aria-selected={key === selKey}
                      class={`opt${key === active ? " is-active" : ""}`} onClick={() => openProc(ref, { focusDetail: matchMedia("(max-width: 899px)").matches })}>
                      <span class="code">{ref.proc.id}</span>
                      <span class="opt-main">
                        <span class="opt-name"><Hl text={ref.proc.name} terms={terms} /></span>
                        {hit?.context && <span class="opt-ctx"><span class="opt-ctx-l">{hit.context.label}</span> <Hl text={hit.context.text} terms={terms} /></span>}
                      </span>
                      <span class="opt-meta">
                        {ref.flagship && <span class="tag-l6" title="Curated step detail">L6</span>}
                        {pains.length > 0 && <span class={`pc sev-${top}`} title={`${plural(pains.length, "pain point")}, highest ${top}`}><i aria-hidden="true" />{pains.length}<span class="sr-only"> pain points</span></span>}
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
function Detail() {
  const ref = currentProc.value; const r = route.value;
  const scroller = useRef<HTMLDivElement>(null);
  const key = ref ? keyOf(ref) : "";
  useLayoutEffect(() => { if (scroller.current && !r.s) scroller.current.scrollTop = 0; }, [key]);
  // land on a pinned step (deep link or "open step" from the pain-point library)
  useEffect(() => {
    if (!r.s || !ref) return;
    const el = document.getElementById(`step-${r.s}`); if (!el) return;
    el.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" });
    el.classList.remove("is-target"); void el.offsetWidth; el.classList.add("is-target");
    el.focus({ preventScroll: true });
  }, [r.s, key, painIdx.value != null]);

  if (!ref) return (
    <article class="pane detail" aria-busy="true" aria-label="Process detail">
      <div class="pane-scroll"><div class="d-wrap"><Skel rows={2} class="skel-title" /><Skel rows={5} /><Skel rows={9} class="skel-flow" /></div></div>
    </article>
  );
  const { fn, group, proc } = ref;
  const painD = pain.value; const pins = painIdx.value?.idx.byProc.get(key) || [];
  const sevCount = SEVERITIES.map((s) => [s, pins.filter((p) => p.severity === s).length] as const).filter(([, n]) => n);
  const xrayHref = hrefFor({ view: "xray", fn: fn.functionId, p: proc.id });

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
            <dl class="readout">
              <div><dt>Activities</dt><dd class="num">{proc.activities.length}</dd></div>
              <div><dt>Tasks</dt><dd class="num">{ref.taskCount}</dd></div>
              <div><dt>Steps</dt><dd class="num">{ref.stepCount}</dd></div>
              <div><dt>Pain points</dt><dd class="num">{painD.state === "ready" ? pins.length : "–"}</dd></div>
            </dl>
            <div class="d-actions">
              <a class="b b-primary" href={xrayHref} onClick={(e) => { e.preventDefault(); go({ view: "xray", fn: fn.functionId, p: proc.id }); }}><Icon name="xray" />X-ray this process</a>
              <button type="button" class="b b-ghost" onClick={async () => {
                const ok = await copyText(location.origin + hrefFor({ view: "explore", fn: fn.functionId, p: proc.id, s: undefined }));
                say(ok ? "Link copied" : "Couldn't copy. The link is in the address bar.", { tone: ok ? "ok" : "warn" });
              }}><Icon name="link" />Copy link</button>
            </div>
          </header>

          <p class="d-desc">{proc.description}</p>

          <section class="d-io" aria-label="Trigger and output">
            <div class="io"><h3 class="h-sm"><span class="io-mark io-start" aria-hidden="true" />Starts when</h3><p>{proc.trigger}</p></div>
            <div class="io"><h3 class="h-sm"><span class="io-mark io-end" aria-hidden="true" />Produces</h3><p>{proc.output}</p></div>
          </section>

          <section class="d-sec d-cal" aria-labelledby="cal-h">
            <div class="d-sec-head"><h3 id="cal-h" class="h-md">Calibrated to your industry and country</h3></div>
            <LensInline />
            <div class="cal-grid" aria-live="polite">
              <div class="cal-card"><h4 class="h-xs">{INDUSTRIES[r.ind]}</h4><p>{proc.calibration.industry[r.ind] || "No industry note for this process yet."}</p></div>
              <div class="cal-card"><h4 class="h-xs">{COUNTRIES[r.cty]}</h4><p>{proc.calibration.country[r.cty] || "No country note for this process yet."}</p></div>
            </div>
          </section>

          <section class="d-sec d-sk">
            <div><h3 class="h-md">Typical systems</h3><ul class="sys">{proc.calibration.systems.map((s) => <li key={s}>{s}</li>)}</ul></div>
            <div><h3 class="h-md">Representative KPIs</h3><ul class="kpis">{proc.calibration.kpis.map((k) => <li key={k}>{k}</li>)}</ul></div>
          </section>

          <section class="d-sec d-pain" aria-labelledby="pp-h">
            <div class="d-sec-head">
              <h3 id="pp-h" class="h-md">Where it breaks</h3>
              {painD.state === "ready" && <p class="d-sec-sub">{plural(pins.length, "pain point")} pinned to steps{sevCount.length ? ": " : ""}{sevCount.map(([s, n], i) => <span key={s}>{i ? ", " : ""}{n} {s.toLowerCase()}</span>)}</p>}
            </div>
            {painD.state === "loading" && <Skel rows={3} />}
            {painD.state === "error" && <p class="inline-err">Pain points didn't load. <button type="button" class="linkish" onClick={loadData}>Try again</button></p>}
            {painD.state === "ready" && (pins.length ? (
              <ul class="pp-mini">
                {pins.map((p) => {
                  const sid = stepIdOf(p.taskId, p.stepIndex);
                  return (
                    <li key={p.id}>
                      <a href={hrefFor({ s: sid })} onClick={(e) => { e.preventDefault(); go({ s: sid }, { replace: true }); }}>
                        <SevMark sev={p.severity} />
                        <span class="pp-mini-t">{p.title}</span>
                        <span class="pp-mini-s"><span class="code">{sid}</span> Go to step</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : <p class="muted">No pain points recorded for this process.</p>)}
            <p class="note">{PAIN_NOTE}</p>
          </section>

          <section class="d-sec d-flow" aria-labelledby="flow-h">
            <div class="d-sec-head flow-head">
              <div>
                <h3 id="flow-h" class="h-md">Breakdown to the step</h3>
                <p class="d-sec-sub">{proc.hasStepDetail ? "Curated step detail on the flagship task; the other tasks follow the standard five-step pattern." : "Activities and tasks from the taxonomy, each broken into its five standard steps."}</p>
              </div>
              <label class="switch">
                <input type="checkbox" checked={showZones.value} onChange={(e) => { const v = (e.currentTarget as HTMLInputElement).checked; showZones.value = v; writePref(v); }} />
                <span class="switch-ui" aria-hidden="true" /><span>Show zones</span>
              </label>
            </div>
            <Legend zones={showZones.value} />
            <Flow pr={ref} />
          </section>

          <footer class="d-foot">
            <div>
              <h3 class="h-md">Bring this process to a conversation.</h3>
              <p>We'll lay it against your own steps and show you where it breaks.</p>
            </div>
            <a class="b b-light" href={`/contact/?process=${encodeURIComponent(proc.id)}&fn=${encodeURIComponent(ref.fn.functionId)}`}><Icon name="mail" />Talk to us about this process</a>
          </footer>
          <p class="d-legal note">General information on process design. Not legal, tax or regulatory advice.</p>
        </div>
      </div>
    </article>
  );
}

function Legend({ zones }: { zones: boolean }) {
  return (
    <ul class="legend" aria-label="Legend">
      <li><span class="lg lg-task" aria-hidden="true" />Step</li>
      <li><span class="lg lg-gw" aria-hidden="true" />Decision point</li>
      {SEVERITIES.map((s: Severity) => <li key={s}><span class={`lg lg-pain sev-${s}`} aria-hidden="true" />{s} pain point</li>)}
      {zones && (Object.keys(ZONES) as (keyof typeof ZONES)[]).map((z) => <li key={z}><ZoneMark zone={z} label={ZONES[z].label} /></li>)}
    </ul>
  );
}

function Flow({ pr }: { pr: ProcRef }) {
  const { proc, fn } = pr;
  const pinsByStep = painIdx.value?.idx.byStep;
  const target = route.value.s;
  const zones = showZones.value;
  return (
    <ol class="flow">
      <li class="fl-event fl-start">
        <span class="node" aria-hidden="true" />
        <div class="fl-body"><p class="fl-kind">Start</p><p class="fl-text">{proc.trigger}</p></div>
      </li>
      {proc.activities.map((a) => (
        <li key={a.id} class="fl-act">
          <div class="act-head"><span class="code">{a.id}</span><h4>{a.name}</h4><span class="act-n">{plural(a.tasks.length, "task")}</span></div>
          <ol class="fl-tasks">
            {a.tasks.map((t) => <FlowTask key={t.id} t={t} fnId={fn.functionId} pins={pinsByStep} target={target} zones={zones} pr={pr} />)}
          </ol>
        </li>
      ))}
      <li class="fl-event fl-end">
        <span class="node" aria-hidden="true" />
        <div class="fl-body"><p class="fl-kind">End</p><p class="fl-text">{proc.output}</p></div>
      </li>
    </ol>
  );
}

function FlowTask({ t, fnId, pins, target, zones, pr }: { t: Task; fnId: string; pins?: Map<string, PainPoint[]>; target?: string; zones: boolean; pr: ProcRef }) {
  return (
    <li class="fl-task">
      <div class="task-head"><span class="code">{t.id}</span><span class="task-name">{t.name}</span></div>
      <ol class="fl-steps">
        {t.steps.map((s, i) => {
          const sid = stepIdOf(t.id, i); const gw = gatewayOf(s);
          const pp = pins?.get(stepKey(fnId, t.id, i)) || [];
          const z = zones ? zoneOf(s, t.name) : null;
          return (
            <li key={sid} id={`step-${sid}`} tabIndex={-1}
              class={`st${gw ? " st-gw" : ""}${pp.length ? ` has-pain sev-${pp[0].severity}` : ""}${sid === target ? " is-target" : ""}`}>
              <span class="node" aria-hidden="true">{pp.length > 0 && <span class="fault" />}</span>
              <div class="st-body">
                <div class="st-meta">
                  <span class="code">{sid}</span>
                  {gw && <span class="st-kind">Decision</span>}
                  {z && <ZoneMark zone={z.zone} label={ZONES[z.zone].label} />}
                  <a class="st-x" href={hrefFor({ view: "xray", fn: pr.fn.functionId, p: pr.proc.id })}
                    onClick={(e) => { e.preventDefault(); go({ view: "xray", fn: pr.fn.functionId, p: pr.proc.id }); requestAnimationFrame(() => focusXrayStep(sid)); }}
                    aria-label={`See step ${sid} in the X-ray`}><Icon name="xray" />X-ray</a>
                </div>
                <p class="st-text">{s}</p>
                {gw && (
                  <p class="branch">
                    <span class="br-off"><span class="br-l">{gw.off}</span><span class="br-line" aria-hidden="true" />{gw.offText}</span>
                    <span class="br-on"><span class="br-l">{gw.on}</span>continues</span>
                  </p>
                )}
                {pp.map((p) => (
                  <div key={p.id} class={`pin sev-${p.severity}`}>
                    <p class="pin-meta"><SevMark sev={p.severity} /><span class="pin-cat">{categoryLabel(p.category, p.categoryLabel)}</span></p>
                    <p class="pin-title">{p.title}</p>
                    <p class="pin-impact">{p.impact}</p>
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </li>
  );
}


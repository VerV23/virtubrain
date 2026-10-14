/* The VirtuBrain app shell: toolbar (views, search, lens), the active view, status bar, toasts. */
import { render } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { route, go, hrefFor, VIEWS, tax, currentProc, toast, announce, loadData, keysOn, setKeys, type View } from "./state";
import { Explore, listKey, listActive, mPane, activeOptionId } from "./explore";
import { PainView } from "./pain";
import { XRay, pickOpen, pickQ, pickActive, pickItems, pickerKey, choose } from "./xray";
import { LensBar } from "./controls";
import { Icon, FnIcon, Still, isTyping } from "./ui";

loadData();

export function mount(el: HTMLElement) {
  el.textContent = "";
  render(<App />, el);
}

function App() {
  const r = route.value;
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || !keysOn.value) return;
      if (e.key === "/" && !isTyping(e)) { e.preventDefault(); const s = document.getElementById("vb-search") as HTMLInputElement | null; s?.focus(); s?.select(); return; }
      if (isTyping(e) || (e.target as HTMLElement)?.closest?.("dialog")) return;
      if (e.key === "?") { e.preventDefault(); dlg.current?.showModal(); return; }
      const v = VIEWS.find((x) => x.key === e.key.toLowerCase());
      if (v && !(e.target as HTMLElement)?.closest?.(".card")) { e.preventDefault(); switchView(v.id); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  // a document title per state, so history entries and tabs are readable
  const ref = currentProc.value;
  useEffect(() => {
    const v = VIEWS.find((x) => x.id === r.view)!.label;
    document.title = r.view === "pain" ? "Pain-point library · VirtuBrain" : ref ? `${ref.proc.id} ${ref.proc.name} · ${v} · VirtuBrain` : `${v} · VirtuBrain`;
  }, [r.view, ref]);

  return (
    <div class="vb" data-view={r.view}>
      <Toolbar />
      <div class="vb-body" id="vb-panel" role="tabpanel" aria-labelledby={`tab-${r.view}`}>
        {r.view === "explore" ? <Explore /> : r.view === "pain" ? <PainView /> : <XRay />}
      </div>
      <StatusBar onShortcuts={() => dlg.current?.showModal()} />
      <Toast />
      <div class="sr-only" aria-live="polite" aria-atomic="true">{announce.value}</div>
      <Shortcuts dlg={dlg} />
    </div>
  );
}

function switchView(view: View) {
  const r = route.value; if (view === r.view) return;
  const cur = currentProc.value;
  if (view === "xray" && r.view === "explore" && cur) go({ view, fn: cur.fn.functionId, p: cur.proc.id });
  else go({ view });
  pickOpen.value = false; mPane.value = null;
}

function Toolbar() {
  const r = route.value;
  const tabsRef = useRef<HTMLDivElement>(null);
  return (
    <div class="tb">
      <div class="tabs" role="tablist" aria-label="App views" ref={tabsRef}
        onKeyDown={(e) => {
          const i = VIEWS.findIndex((v) => v.id === r.view);
          const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (!d) return;
          e.preventDefault(); const n = VIEWS[(i + d + VIEWS.length) % VIEWS.length].id; switchView(n);
          requestAnimationFrame(() => document.getElementById(`tab-${n}`)?.focus());
        }}>
        {VIEWS.map((v) => (
          <a key={v.id} id={`tab-${v.id}`} role="tab" class="tab" aria-selected={r.view === v.id} aria-controls="vb-panel" tabIndex={r.view === v.id ? 0 : -1}
            href={hrefFor({ view: v.id })} onClick={(e) => { e.preventDefault(); switchView(v.id); }}>
            <TabGlyph v={v.id} />{v.label}
          </a>
        ))}
      </div>
      <Search />
      {r.view === "explore" && <LensBar />}
    </div>
  );
}
const TabGlyph = ({ v }: { v: View }) => (
  <svg class="tab-g" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
    {v === "explore" && <><rect x="2" y="2.5" width="4" height="11" rx="1" /><path d="M8.5 4h5.5M8.5 8h5.5M8.5 12h3.5" /></>}
    {v === "pain" && <><path d="M2 8h3.2l1.6-4 2.4 8 1.6-4H14" /></>}
    {v === "xray" && <><rect x="1.8" y="2.5" width="3.4" height="11" rx="1" /><rect x="6.3" y="2.5" width="3.4" height="11" rx="1" /><rect x="10.8" y="2.5" width="3.4" height="11" rx="1" /></>}
  </svg>
);

function Search() {
  const r = route.value; const view = r.view; const idx = tax.value.state === "ready" ? tax.value.data.idx : null;
  const value = view === "explore" ? r.q : view === "pain" ? r.pq : pickQ.value;
  const label = view === "explore" ? "Search all 142 processes" : view === "pain" ? "Search 362 pain points" : "Find a process to X-ray";
  const placeholder = view === "explore" ? "Search processes, activities, tasks" : view === "pain" ? "Search pain points" : "Find a process to X-ray";
  const input = useRef<HTMLInputElement>(null);
  const set = (v: string) => {
    if (view === "explore") { listActive.value = null; mPane.value = v.trim() ? "list" : null; go({ q: v }, { replace: true }); }
    else if (view === "pain") go({ pq: v }, { replace: true });
    else { pickQ.value = v; pickOpen.value = true; pickActive.value = 0; }
  };
  const combo = view !== "pain";
  const expanded = view === "explore" ? true : pickOpen.value;
  return (
    <div class={`tb-search${view === "xray" && pickOpen.value ? " is-open" : ""}`}>
      <Icon name="search" class="tb-search-ico" />
      <label for="vb-search" class="sr-only">{label}</label>
      <input ref={input} id="vb-search" type="text" inputMode="search" enterKeyHint={view === "pain" ? "search" : "go"} autocomplete="off" autocapitalize="off" spellcheck={false}
        placeholder={placeholder} value={value}
        role={combo ? "combobox" : undefined} aria-autocomplete={combo ? "list" : undefined} aria-expanded={combo ? expanded : undefined}
        aria-controls={combo ? (view === "explore" ? "vb-proclist" : "xr-picklist") : undefined}
        aria-activedescendant={view === "explore" ? activeOptionId() : view === "xray" && pickOpen.value && pickItems.value.length ? `pk-${pickActive.value}` : undefined}
        onInput={(e) => set((e.currentTarget as HTMLInputElement).value)}
        onFocus={() => { if (view === "xray") { pickOpen.value = true; } }}
        onBlur={() => { if (view === "xray") setTimeout(() => { if (document.activeElement !== input.current) pickOpen.value = false; }, 120); }}
        onKeyDown={(e) => {
          if (view === "explore") { if (listKey(e)) return; }
          else if (view === "xray") { if (pickerKey(e)) return; }
          if (e.key === "Escape") { if (value) set(""); else input.current?.blur(); e.preventDefault(); }
          if (e.key === "Enter" && view === "pain") { (document.querySelector(".rec-link") as HTMLElement | null)?.focus(); e.preventDefault(); }
        }} />
      {value ? (
        <button type="button" class="tb-clear" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={() => { set(""); input.current?.focus(); }}><Icon name="close" /></button>
      ) : <kbd class="tb-kbd" aria-hidden="true">/</kbd>}
      {view === "xray" && pickOpen.value && idx && <Picker />}
    </div>
  );
}

function Picker() {
  const items = pickItems.value; const q = pickQ.value.trim(); const a = pickActive.value;
  useEffect(() => { document.getElementById(`pk-${a}`)?.scrollIntoView({ block: "nearest" }); }, [a]);
  return (
    <div class="pick" onMouseDown={(e) => e.preventDefault()}>
      <p class="pick-h" aria-live="polite">{q ? (items.length ? `${items.length === 12 ? "Top 12" : items.length} matching ${items.length === 1 ? "process" : "processes"}` : "") : "Flagship processes with curated step detail"}</p>
      {items.length ? (
        <ul role="listbox" id="xr-picklist" aria-label="Processes">
          {items.map((ref, i) => (
            <li key={`${ref.fn.functionId}/${ref.proc.id}`} id={`pk-${i}`} role="option" aria-selected={i === a} class={i === a ? "is-active" : ""}
              onMouseEnter={() => { pickActive.value = i; }} onClick={() => choose(ref)}>
              <FnIcon id={ref.fn.functionId} class="sm" />
              <span class="code">{ref.proc.id}</span>
              <span class="pk-main"><span class="pk-name">{ref.proc.name}</span><span class="pk-fn">{ref.fn.functionName}</span></span>
            </li>
          ))}
        </ul>
      ) : (
        <div class="pick-empty" id="xr-picklist" role="listbox" aria-label="No matching processes">
          <Still name="atlas-fanned" sizes="96px" alt="" />
          <p>No process matches “{q}”. Try a word from its name, such as close, payroll or invoice.</p>
        </div>
      )}
    </div>
  );
}

function StatusBar({ onShortcuts }: { onShortcuts: () => void }) {
  const t = tax.value; const s = t.state === "ready" ? t.data.T.meta.stats : null;
  return (
    <footer class="vb-status">
      <p class="st-data">
        {s ? <><span class="num">{s.functions}</span> functions, <span class="num">{s.processes}</span> processes, <span class="num">{s.steps.toLocaleString("en-US")}</span> steps. </> : t.state === "error" ? "The process library didn't load. " : "Loading the process library. "}
        Pain points are illustrative, modelled on process-mining conventions.
      </p>
      <p class="st-legal">General information on process design. Not legal, tax or regulatory advice.</p>
      <div class="st-right">
        <button type="button" class="st-btn" onClick={onShortcuts}><Icon name="keyboard" />Shortcuts<kbd>?</kbd></button>
        <a class="st-btn" href="/contact/">Talk to us</a>
      </div>
    </footer>
  );
}

function Toast() {
  const t = toast.value;
  return (
    <div class="toast-host" role="status" aria-live="polite">
      {t && (
        <div key={t.id} class={`toast ${t.tone === "warn" ? "is-warn" : ""}`}>
          <Icon name={t.tone === "warn" ? "close" : "check"} />
          <span>{t.text}</span>
          {t.action && <button type="button" onClick={() => { const a = t.action!; toast.value = null; a.run(); }}>{t.action.label}</button>}
        </div>
      )}
    </div>
  );
}

function Shortcuts({ dlg }: { dlg: { current: HTMLDialogElement | null } }) {
  const rows: [string[], string][] = [
    [["/"], "Search"], [["↑", "↓"], "Move through the process list"], [["Enter"], "Open the highlighted process"], [["Esc"], "Clear the search"],
    [["E"], "Explore"], [["P"], "Pain points"], [["X"], "X-ray"],
    [["←", "→"], "X-ray: move the selected step to the next zone"], [["A", "S", "H"], "X-ray: send the selected step to Auto, Assist or Human"], [["R"], "X-ray: put a moved step back"],
    [["?"], "Show these shortcuts"],
  ];
  return (
    <dialog ref={dlg} class="sheet sheet-center" aria-labelledby="sc-h" onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
      <div class="sheet-body">
        <button type="button" class="sheet-x" onClick={() => dlg.current?.close()} aria-label="Close shortcuts"><Icon name="close" /></button>
        <h2 id="sc-h" class="pane-title">Keyboard shortcuts</h2>
        <label class="switch sc-switch">
          <input type="checkbox" checked={keysOn.value} onChange={(e) => setKeys((e.currentTarget as HTMLInputElement).checked)} />
          <span class="switch-ui" aria-hidden="true" /><span>Single-key shortcuts for /, ?, E, P and X. Turn them off if they clash with your screen reader or voice control. The Shortcuts button in the status bar always opens this panel.</span>
        </label>
        <dl class="sc-list">
          {rows.map(([k, d]) => <div key={d}><dt>{k.map((x) => <kbd key={x}>{x}</kbd>)}</dt><dd>{d}</dd></div>)}
        </dl>
      </div>
    </dialog>
  );
}

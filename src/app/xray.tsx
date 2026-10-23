/* X-ray: every step of one process sorted into Auto / Assist / Human by zoneOf(), with the reason shown,
   failure points pinned, and the reader free to move any step. By default it counts core steps (the work
   each task names); the standard steps around them gather in one row at the bottom of each lane.
   Moves live in the URL. */
import { signal, computed } from "@preact/signals";
import { useLayoutEffect, useRef } from "preact/hooks";
import {
  ZONES, ZONE_ORDER, zoneOf, gatewayOf, stepKey, taskKey, wrapperOf, stepLabel, humanizeStep, isTaskItself, shares, PAIN_NOTE, WRAPPER_WHERE, SEVERITIES, STAGE,
  type Zone, type ZoneCall, type PainPoint, type ProcRef, type WrapperKind,
} from "../lib/data";
import { route, go, hrefFor, shareUrl, tax, pain, painIdx, currentProc, taxIdx, zoneBenchmark, loadData, say, announce, stepIdOf, type Basis } from "./state";
import { searchProcs } from "./search";
import { Icon, FnIcon, Still, SevMark, ErrorState, Skel, Ill, painTitle, plural, copyText, useTween, reduceMotion } from "./ui";
import { Seg } from "./controls";

export interface XStep {
  sid: string; taskId: string; taskName: string; actName: string; text: string; label: string; call: ZoneCall;
  pins: PainPoint[]; taskPins: PainPoint[]; gw: boolean; n: number; std: { kind: WrapperKind; label: string } | null;
  itself: boolean; stepNo: number; stepOf: number;
}

const xsteps = computed<XStep[]>(() => {
  const ref = currentProc.value; if (!ref) return [];
  const pidx = painIdx.value?.idx; const out: XStep[] = []; let n = 0;
  for (const a of ref.proc.activities) for (const t of a.tasks) {
    const taskPins = pidx?.byTask.get(taskKey(ref.fn.functionId, t.id)) || [];
    t.steps.forEach((s, i) => {
      out.push({ sid: stepIdOf(t.id, i), taskId: t.id, taskName: t.name, actName: a.name, text: s, label: stepLabel(s, t.name), call: zoneOf(s, t.name),
        pins: pidx?.byStep.get(stepKey(ref.fn.functionId, t.id, i)) || [], taskPins, gw: !!gatewayOf(s), n: n++, std: wrapperOf(s),
        itself: isTaskItself(s, t.name), stepNo: i + 1, stepOf: t.steps.length });
    });
  }
  return out;
});
const zoneFor = (s: XStep) => route.value.z[s.sid] || s.call.zone;
const inBasis = (s: XStep, b: Basis) => b === "all" || !s.std;
const painFailed = () => pain.value.state === "error";
const sevRank = (p: PainPoint[]) => (p.length ? SEVERITIES.indexOf(p[0].severity) : 9);
const itselfLabel = (s: XStep) => `Step ${s.stepNo} of ${s.stepOf}: the task itself`;

/* ---- process picker (driven by the toolbar search while in X-ray) -------------------------------- */
export const pickOpen = signal(false);
export const pickQ = signal("");
export const pickActive = signal(0);
export const pickRes = computed(() => {
  const idx = taxIdx.value; if (!idx) return { items: [] as ProcRef[], corrected: undefined as string | undefined };
  const q = pickQ.value.trim();
  if (!q) return { items: idx.list.filter((r) => r.flagship), corrected: undefined };
  const res = searchProcs(idx.list, q);
  return { items: res.hits.slice(0, 12).map((h) => h.ref), corrected: res.corrected };
});
export const pickItems = computed(() => pickRes.value.items);
export function choose(ref: ProcRef) {
  pickOpen.value = false; pickQ.value = "";
  go({ view: "xray", fn: ref.fn.functionId, p: ref.proc.id });
  requestAnimationFrame(() => document.getElementById("xr-title")?.focus({ preventScroll: true }));
}
export function pickerKey(e: KeyboardEvent): boolean {
  const items = pickItems.value;
  switch (e.key) {
    case "ArrowDown": pickOpen.value = true; pickActive.value = Math.min(items.length - 1, pickActive.value + 1); break;
    case "ArrowUp": pickActive.value = Math.max(0, pickActive.value - 1); break;
    case "Enter": if (!items[pickActive.value]) return false; choose(items[pickActive.value]); break;
    case "Escape": if (!pickOpen.value && !pickQ.value) return false; pickOpen.value = false; pickQ.value = ""; break;
    default: return false;
  }
  e.preventDefault(); return true;
}
export function openPicker() {
  pickOpen.value = true; pickActive.value = 0;
  (document.getElementById("vb-search") as HTMLInputElement | null)?.focus();
}

/* ---- moves ------------------------------------------------------------------------------------ */
let flipFrom: Map<string, DOMRect> | null = null;
let focusAfter: string | null = null;
let focusFallback: string | null = null;
function captureRects() {
  if (reduceMotion()) return;
  flipFrom = new Map();
  document.querySelectorAll<HTMLElement>(".lanes [data-step]").forEach((el) => flipFrom!.set(el.dataset.step!, el.getBoundingClientRect()));
}
function counts(steps: XStep[], basis: Basis) {
  const c: Record<Zone, number> = { auto: 0, assist: 0, human: 0 }; const p: Record<Zone, number> = { auto: 0, assist: 0, human: 0 };
  let total = 0, stdPins = 0;
  for (const s of steps) {
    if (!inBasis(s, basis)) { stdPins += s.pins.length; continue; }
    const z = zoneFor(s); c[z]++; p[z] += s.pins.length; total++;
  }
  return { c, p, total, stdPins, pct: shares(ZONE_ORDER.map((z) => c[z])) };
}
export function moveStep(s: XStep, to: Zone, o: { focus?: boolean; quiet?: boolean } = {}) {
  const from = zoneFor(s); if (from === to) return;
  captureRects();
  if (o.focus !== false) {
    // on phones the destination lane is hidden, so focus falls to the neighboring card
    const el = document.querySelector<HTMLElement>(`.lanes [data-step="${CSS.escape(s.sid)}"]`);
    focusAfter = s.sid;
    const all = el ? [...(el.closest(".lane")?.querySelectorAll<HTMLElement>("[data-step]") || [])] : [];
    const j = el ? all.indexOf(el) : -1;
    focusFallback = (all[j + 1] || all[j - 1])?.dataset.step || null;
  }
  const z = { ...route.value.z };
  if (to === s.call.zone) delete z[s.sid]; else z[s.sid] = to;
  go({ z }, { replace: true });
  const { c } = counts(xsteps.value, route.value.basis);
  announce.value = `Step ${s.sid} moved to ${ZONES[to].label}. Auto ${c.auto}, Assist ${c.assist}, Human ${c.human}.`;
  if (!o.quiet) say(`Moved ${s.sid} to ${ZONES[to].label}`, { tone: "ok", action: { label: "Undo", run: () => moveStep(s, from, { quiet: true }) } });
}
const resetAll = () => { captureRects(); go({ z: {} }, { replace: true }); announce.value = "All steps are back where the first-pass sort put them."; say("Back to the first-pass sort", { tone: "ok" }); };

/* ---- view ------------------------------------------------------------------------------------- */
const mLane = signal<Zone>("auto");
/** Standard-step rows the reader opened, keyed by zone. */
const openFold = signal<Set<string>>(new Set());

/** After jumping in from Explore, bring the chosen step forward (switching the phone lane if needed) and focus it. */
export function focusXrayStep(sid: string, tries = 20) {
  const step = xsteps.value.find((s) => s.sid === sid);
  if (step?.std && route.value.basis === "core") { const k = zoneFor(step); if (!openFold.value.has(k)) openFold.value = new Set([...openFold.value, k]); }
  const el = document.querySelector<HTMLElement>(`.lanes [data-step="${CSS.escape(sid)}"]`);
  if (!el) { if (tries > 0) setTimeout(() => focusXrayStep(sid, tries - 1), 60); return; }
  const lane = el.closest<HTMLElement>("[data-zone]")?.dataset.zone as Zone | undefined;
  if (!el.getClientRects().length && lane && tries > 0) { mLane.value = lane; requestAnimationFrame(() => focusXrayStep(sid, 0)); return; }
  el.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" });
  el.focus({ preventScroll: true }); el.classList.add("is-target"); setTimeout(() => el.classList.remove("is-target"), 2400);
}

export function XRay() {
  const t = tax.value;
  if (t.state === "error") return <div class="xr xr-state"><ErrorState what="The process library" onRetry={() => loadData({ focus: true })} /></div>;
  const ref = currentProc.value;
  return (
    <div class="xr">
      <div class="pane-scroll xr-scroll" id="xr-scroll">
        <div class="xr-wrap">
          {ref ? <XHead pr={ref} /> : <div class="xr-head"><div class="xr-intro"><Skel rows={4} class="skel-title" /></div></div>}
          {ref ? <Summary pr={ref} /> : <div class="xr-sum"><Skel rows={3} /></div>}
          {ref && <StartHere />}
          {ref ? <Lanes /> : <div class="lanes">{ZONE_ORDER.map((z) => <section key={z} class={`lane z-${z}`}><Skel rows={10} class="skel-cards" /></section>)}</div>}
        </div>
      </div>
    </div>
  );
}

function XHead({ pr }: { pr: ProcRef }) {
  const { fn, group, proc } = pr;
  return (
    <header class="xr-head">
      <div class="xr-intro">
        <p class="xr-kicker">Process X-ray</p>
        <h2 id="xr-title" class="xr-title" tabIndex={-1}><span class="code code-lg">{proc.id}</span><span>{proc.name}</span></h2>
        <p class="crumb"><FnIcon id={fn.functionId} class="sm" />{fn.functionName}<span class="crumb-sep" aria-hidden="true">/</span><span><span class="code">{group.groupId}</span> {group.groupName}</span></p>
        <div class="xr-links">
          <button type="button" class="b b-ghost b-sm" onClick={openPicker}><Icon name="search" />Choose another process</button>
          <a class="b b-quiet b-sm" href={hrefFor({ view: "explore", fn: fn.functionId, p: proc.id, s: undefined })}
            onClick={(e) => { e.preventDefault(); go({ view: "explore", fn: fn.functionId, p: proc.id }, { focus: true }); }}>Open in Explore</a>
          <button type="button" class="b b-quiet b-sm" onClick={async () => {
            const ok = await copyText(shareUrl()); say(ok ? "Link copied" : "Couldn't copy. The link is in the address bar.", { tone: ok ? "ok" : "warn" });
          }}><Icon name="link" />Copy link</button>
        </div>
      </div>
      <figure class="xr-art" aria-hidden="true"><Still name="atlas-columns" sizes="(min-width: 900px) 150px, 88px" alt="" /></figure>
    </header>
  );
}

function PainRetry({ short = false }: { short?: boolean }) {
  return <span class="pain-fail">{short ? "Failure points didn't load" : "Failure points didn't load."} <button type="button" class="linkish" onClick={() => loadData()}>Try again</button></span>;
}

function Summary({ pr }: { pr: ProcRef }) {
  const steps = xsteps.value; const r = route.value;
  const { c, p, total, stdPins, pct } = counts(steps, r.basis); const moved = Object.keys(r.z).length;
  const nCore = steps.filter((s) => !s.std).length;
  const bench = zoneBenchmark.value?.[r.basis];
  const benchPct = bench ? shares(ZONE_ORDER.map((z) => bench.n[z])) : null;
  const copy = async () => {
    const ok = await copyText(summaryText(pr, steps));
    say(ok ? "Summary copied" : "Couldn't copy. Try again, or copy the link from the address bar.", { tone: ok ? "ok" : "warn" });
    const btn = document.getElementById("xr-copy"); if (ok && btn) { btn.classList.add("is-done"); setTimeout(() => btn.classList.remove("is-done"), 1800); }
  };
  return (
    <section class="xr-sum" aria-labelledby="sum-h">
      <h3 id="sum-h" class="sr-only">Summary of the sort</h3>
      <div class="sum-top">
        <p class="caveat"><span class="caveat-mark" aria-hidden="true" />A first-pass sort on the wording of each step. Use it to start the conversation, not to decide.</p>
        <div class="sum-actions">
          {moved > 0 && <button type="button" class="b b-quiet b-sm" onClick={resetAll}><Icon name="reset" />Reset</button>}
          <button type="button" id="xr-copy" class="b b-ghost b-sm copy-btn" onClick={copy}><span class="cb-a"><Icon name="copy" />Copy summary</span><span class="cb-b" aria-hidden="true"><Icon name="check" />Copied</span></button>
          <a class="b b-primary b-sm" href={`/contact/?process=${encodeURIComponent(pr.proc.id)}&fn=${encodeURIComponent(pr.fn.functionId)}`}><Icon name="mail" />Talk to us about this process</a>
        </div>
      </div>
      <div class="basis-row">
        <Seg label="Count" size="sm" value={r.basis} onChange={(basis) => go({ basis }, { replace: true })}
          options={[{ id: "core", label: <>Core steps <span class="num">{nCore}</span></> }, { id: "all", label: <>All steps <span class="num">{steps.length}</span></> }]} />
        <p class="basis-help">{r.basis === "core"
          ? `Core steps are the work each task names. The other ${steps.length - nCore} are the standard steps around them (confirm the inputs, check the output, decide whether it is complete, log and hand off), gathered at the bottom of each lane.`
          : `All ${steps.length} steps, including the standard five-step pattern around each task.`}</p>
      </div>
      <div class="zbar" role="img" aria-label={ZONE_ORDER.map((z, i) => `${ZONES[z].label} ${pct[i]}%`).join(", ")}>
        {ZONE_ORDER.map((z) => <span key={z} class={`zbar-seg z-${z}`} style={{ flexGrow: String(c[z]), flexBasis: c[z] ? "3px" : "0px" }} />)}
      </div>
      <div class="sum-meta">
        <p class="sum-total"><span class="num">{total}</span> {r.basis === "core" ? "core steps" : "steps"} in this process{moved ? <span class="sum-moved">, {moved} moved by you</span> : null}</p>
        {bench && benchPct && (
          <div class="bench">
            <div class="zbar zbar-thin" aria-hidden="true">{ZONE_ORDER.map((z) => <span key={z} class={`zbar-seg z-${z}`} style={{ flexGrow: String(bench.n[z]) }} />)}</div>
            <p>All {bench.total.toLocaleString("en-US")} {r.basis === "core" ? "core steps" : "steps"} in the taxonomy: {ZONE_ORDER.map((z, i) => <span key={z}>{i ? ", " : ""}{ZONES[z].label} {benchPct[i]}%</span>)}</p>
          </div>
        )}
      </div>
      <dl class="zstats">
        {ZONE_ORDER.map((z, i) => <ZStat key={z} z={z} n={c[z]} share={pct[i]} pains={p[z]} />)}
      </dl>
      {!painFailed() && <p class="std-pins">
        <Ill />
        <span>Failure points are illustrative{r.basis === "core" && stdPins > 0 && !painFailed() ? `. ${plural(stdPins, "more sits", "more sit")} on standard steps and ${stdPins === 1 ? "is" : "are"} listed at the bottom of each lane.` : "."}</span>
      </p>}
    </section>
  );
}
function ZStat({ z, n, share, pains }: { z: Zone; n: number; share: number; pains: number }) {
  const tn = useTween(n); const tp = useTween(share);
  const pd = pain.value.state;
  return (
    <div class={`zs z-${z}`}>
      <dt><i aria-hidden="true" />{ZONES[z].label}</dt>
      <dd class="zs-fig"><span class="zs-n num">{Math.round(tn)}</span><span class="zs-pct num">{Math.round(tp)}%</span></dd>
      <dd class="zs-pain">
        {pd === "error" ? <PainRetry short /> : pd === "loading" ? "Loading failure points" :
          pains ? <><span class="tick" aria-hidden="true" />{plural(pains, "failure point")}</> : "No failure points in this zone"}
      </dd>
    </div>
  );
}

/** Start here: core Auto steps an AI agent could take on, the ones with failure points first. Steps whose
    wording says a system already runs them are not recommended; they are named in a note instead. */
function StartHere() {
  const steps = xsteps.value; const failed = painFailed();
  const autos = steps.filter((s) => !s.std && zoneFor(s) === "auto");
  // a step that carries an automation-gap failure point is never "already system-run": the record says it is still manual
  const gap = (s: XStep) => s.pins.some((p) => p.category === "automation-gap");
  const systemRun = autos.filter((s) => s.call.rule === "system-run" && !route.value.z[s.sid] && !gap(s));
  const picks = autos.filter((s) => !systemRun.includes(s))
    .sort((a, b) => Number(gap(b)) - Number(gap(a)) || sevRank(a.pins) - sevRank(b.pins) || sevRank(a.taskPins) - sevRank(b.taskPins) || a.n - b.n).slice(0, 5);
  const bare = picks.filter((s) => !s.pins.length && !s.taskPins.length).length;
  const reason = (s: XStep) => {
    const g = s.pins.find((p) => p.category === "automation-gap");
    if (g) return { sev: g.severity, text: `${g.severity} failure point: this step is still done by hand` };
    if (s.pins[0]) return { sev: s.pins[0].severity, text: `${s.pins[0].severity} failure point at this step` };
    if (s.taskPins[0]) { const w = wrapperOf(s.taskPins[0].stepText); return { sev: s.taskPins[0].severity, text: `${s.taskPins[0].severity} failure point ${(w ? WRAPPER_WHERE[w.kind] : "in this task").replace(/^\w/, (c) => c.toLowerCase())}` }; }
    return null;
  };
  return (
    <section class="xr-start" aria-labelledby="start-h">
      <div class="start-head">
        <h3 id="start-h" class="h-md">Start here</h3>
        <p class="d-sec-sub">Core steps whose output can be checked against a record, the ones with failure points first.</p>
        <Ill />
      </div>
      {picks.length ? (
        <ol class="start-list">
          {picks.map((s) => {
            const why = failed ? null : reason(s);
            return (
              <li key={s.sid}>
                <button type="button" class="start-item" onClick={() => { if (route.value.only && !s.pins.length) go({ only: false }, { replace: true }); mLane.value = "auto"; focusXrayStep(s.sid); }}>
                  <span class="start-top"><span class="code">{s.sid}</span><span class="start-task">{s.itself ? itselfLabel(s) : s.taskName}</span></span>
                  <span class="start-text">{s.itself ? s.taskName : s.label}</span>
                  {why ? <span class="start-why"><SevMark sev={why.sev} label={false} />{why.text}</span>
                    : <span class="start-why muted">{failed ? "Failure points didn't load" : s.call.why}</span>}
                </button>
              </li>
            );
          })}
        </ol>
      ) : <p class="start-none">No core step in this process sorts to Auto on its wording, apart from steps a system already runs. Look at the Assist lane, where an AI agent drafts and a person approves.</p>}
      {(bare > 0 || systemRun.length > 0) && (
        <p class="start-note">
          {bare > 0 && !failed && <>{bare === picks.length ? "None of these has" : `${bare} of these ${bare === 1 ? "has" : "have"}`} a failure point recorded; {bare === 1 && bare !== picks.length ? "it is" : "they are"} listed because the output can be checked against a record. </>}
          {systemRun.length > 0 && <>Not listed because the wording says a system already runs {systemRun.length === 1 ? "it" : "them"}: {systemRun.map((s, i) => <span key={s.sid}>{i ? ", " : ""}<span class="code">{s.sid}</span></span>)}.</>}
        </p>
      )}
    </section>
  );
}

interface LaneItem { kind: "card"; s: XStep }
interface FoldItem { kind: "fold"; steps: XStep[] }
function laneItems(steps: XStep[], z: Zone, basis: Basis, only: boolean): (LaneItem | FoldItem)[] {
  const cards: LaneItem[] = []; const std: XStep[] = [];
  for (const s of steps) {
    if (zoneFor(s) !== z) continue;
    if (basis === "core" && s.std) std.push(s); else cards.push({ kind: "card", s });
  }
  const shownCards = only ? cards.filter((c) => c.s.pins.length > 0) : cards;
  const shownStd = only ? std.filter((s) => s.pins.length > 0) : std;
  return shownStd.length ? [...shownCards, { kind: "fold", steps: shownStd }] : shownCards;
}

function Lanes() {
  const steps = xsteps.value; const r = route.value; const box = useRef<HTMLDivElement>(null);
  const zkey = JSON.stringify(r.z) + r.basis + r.only + [...openFold.value].join();
  useLayoutEffect(() => {
    const from = flipFrom; flipFrom = null;
    if (from && box.current) {
      box.current.querySelectorAll<HTMLElement>("[data-step]").forEach((el) => {
        const a = from.get(el.dataset.step!); if (!a) return;
        const b = el.getBoundingClientRect(); const dx = a.left - b.left, dy = a.top - b.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      });
    }
    if (focusAfter) {
      const find = (sid: string | null) => (sid ? box.current?.querySelector<HTMLElement>(`[data-step="${CSS.escape(sid)}"]`) : null);
      const el = find(focusAfter); const alt = find(focusFallback);
      focusAfter = null; focusFallback = null;
      if (el && el.getClientRects().length) el.focus({ preventScroll: true });
      else if (alt && alt.getClientRects().length) alt.focus({ preventScroll: true });
    }
  }, [zkey]);
  const items = Object.fromEntries(ZONE_ORDER.map((z) => [z, laneItems(steps, z, r.basis, r.only)])) as Record<Zone, (LaneItem | FoldItem)[]>;
  const counted = (z: Zone) => steps.filter((s) => zoneFor(s) === z && inBasis(s, r.basis)).length;
  return (
    <div class="lanes-wrap">
      <div class="lanes-tools">
        <div class="lt-left">
          <label class="switch">
            <input type="checkbox" checked={r.only} onChange={(e) => go({ only: (e.currentTarget as HTMLInputElement).checked }, { replace: true })} disabled={painFailed()} />
            <span class="switch-ui" aria-hidden="true" /><span>Only steps with failure points</span>
          </label>
          <Ill />
        </div>
        <p class="kbd-hint" id="xr-kbd">Select a step, then press <kbd>←</kbd> <kbd>→</kbd> to move it, or <kbd>A</kbd> <kbd>S</kbd> <kbd>H</kbd> for Auto, Assist, Human. Or hover a step and choose a zone.</p>
      </div>
      {painFailed() && <p class="pain-banner"><PainRetry /></p>}
      <div class="lane-switch" role="radiogroup" aria-label="Show lane"
        onKeyDown={(e) => {
          const i = ZONE_ORDER.indexOf(mLane.value);
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const n = ZONE_ORDER[(i + (e.key === "ArrowRight" ? 1 : 2)) % 3]; mLane.value = n; requestAnimationFrame(() => document.getElementById(`ls-${n}`)?.focus()); }
        }}>
        {ZONE_ORDER.map((z) => (
          <button key={z} id={`ls-${z}`} type="button" role="radio" aria-checked={mLane.value === z} tabIndex={mLane.value === z ? 0 : -1} class={`z-${z}`} onClick={() => { mLane.value = z; }}>
            <i aria-hidden="true" />{ZONES[z].label}<span class="num">{counted(z)}</span>
          </button>
        ))}
      </div>
      <div class="lanes" ref={box} data-lane={mLane.value}>
        {ZONE_ORDER.map((z) => (
          <section key={z} class={`lane z-${z}`} aria-labelledby={`lane-${z}-h`} data-zone={z}>
            <header class="lane-head">
              <h3 id={`lane-${z}-h`}><i aria-hidden="true" />{ZONES[z].label}<span class="num">{counted(z)}</span></h3>
              <p>{ZONES[z].rule}</p>
            </header>
            {items[z].length ? (
              <ol class="lane-list">
                {items[z].map((it) => it.kind === "card" ? <Card key={it.s.sid} s={it.s} zone={z} /> : <Fold key="std" f={it} zone={z} />)}
              </ol>
            ) : (
              <div class="lane-empty"><p>{r.only ? "No steps with failure points here." : "No steps here."}</p><p>{r.only ? "Turn off the filter to see every step." : "Move one in with the zone control on any step."}</p></div>
            )}
          </section>
        ))}
      </div>
      <p class="note xr-note">Failure points on steps come from the illustrative library. {PAIN_NOTE.replace(/^Illustrative library, /, "It is ")}</p>
    </div>
  );
}

/** All of a lane's standard steps in one row at the bottom, with any failure points on them lifted into it. */
function Fold({ f, zone }: { f: FoldItem; zone: Zone }) {
  const open = openFold.value.has(zone);
  const tasks = new Set(f.steps.map((s) => s.taskId)).size;
  const stages = [...new Set(f.steps.map((s) => s.std!.kind))].sort((a, b) => ["start", "check", "gate", "handoff"].indexOf(a) - ["start", "check", "gate", "handoff"].indexOf(b));
  const withPins = f.steps.filter((s) => s.pins.length);
  const toggle = () => { const n = new Set(openFold.value); if (open) n.delete(zone); else n.add(zone); openFold.value = n; };
  return (
    <li class={`fold${open ? " is-open" : ""}`}>
      <button type="button" class="fold-btn" aria-expanded={open} onClick={toggle}>
        <Icon name="chevron" class="chev" />
        <span class="fold-main">
          <span class="fold-text"><span class="num">{f.steps.length}</span> standard {f.steps.length === 1 ? "step" : "steps"} across <span class="num">{tasks}</span> {tasks === 1 ? "task" : "tasks"}</span>
          <span class="fold-sub">{stages.map((k) => STAGE[k]).join(", ")}</span>
        </span>
      </button>
      {withPins.length > 0 && (
        <div class="fold-pins">
          {withPins.map((s) => s.pins.map((p) => (
            <p key={p.id} class={`card-pin sev-${p.severity}`}><SevMark sev={p.severity} /><span>{painTitle(p)} <span class="pin-where"><span class="code">{s.taskId}</span> {WRAPPER_WHERE[s.std!.kind].replace(/^\w/, (c) => c.toLowerCase())}</span></span></p>
          )))}
        </div>
      )}
      {open && <ol class="fold-list">{f.steps.map((s) => <Card key={s.sid} s={s} zone={zone} compact />)}</ol>}
    </li>
  );
}

function Card({ s, zone, compact = false }: { s: XStep; zone: Zone; compact?: boolean }) {
  const moved = zone !== s.call.zone; const failed = painFailed();
  const onKey = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    const i = ZONE_ORDER.indexOf(zone); const k = e.key.toLowerCase();
    let to: Zone | null = null;
    if (e.key === "ArrowLeft" && i > 0) to = ZONE_ORDER[i - 1];
    else if (e.key === "ArrowRight" && i < 2) to = ZONE_ORDER[i + 1];
    else if (k === "a" || k === "1") to = "auto"; else if (k === "s" || k === "2") to = "assist"; else if (k === "h" || k === "3") to = "human";
    else if (k === "r" && moved) to = s.call.zone;
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const all = [...(e.currentTarget as HTMLElement).closest(".lane")!.querySelectorAll<HTMLElement>("[data-step]")];
      const j = all.indexOf(e.currentTarget as HTMLElement); all[j + (e.key === "ArrowDown" ? 1 : -1)]?.focus(); e.preventDefault(); return;
    }
    if (to && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); e.stopPropagation(); moveStep(s, to); }
  };
  const top = s.std ? <span class="card-task">{s.taskId} {s.taskName}</span> : <span class="card-task">{s.itself ? itselfLabel(s) : s.taskName}</span>;
  return (
    <li class="card-li"><div class={`card z-${zone}${moved ? " is-moved" : ""}${s.gw ? " is-gw" : ""}${s.std ? " is-std" : ""}${compact ? " is-compact" : ""}`} data-step={s.sid} tabIndex={0}
      role="group" aria-label={`${ZONES[zone].label}. Step ${s.sid}${s.std ? ", standard step" : ""}: ${s.itself ? s.taskName : s.label}`} aria-describedby="xr-kbd" onKeyDown={onKey}>
      <p class="card-top"><span class="code">{s.sid}</span>{top}</p>
      <span class="mv-hint" aria-hidden="true" onClick={(e) => (e.currentTarget.parentElement as HTMLElement).focus()}><Icon name="move" />Move</span>
      <p class="card-text">{s.gw && <span class="sr-only">Decision point: </span>}{s.itself ? s.taskName : s.label}</p>
      <p class="card-why">
        {moved ? <><span class="why-l">Moved by you.</span> First pass: {ZONES[s.call.zone].label}. {s.call.why}</> : <><span class="why-l">Why</span>{s.call.why}</>}
      </p>
      {s.pins.map((p) => (
        <p key={p.id} class={`card-pin sev-${p.severity}`}><SevMark sev={p.severity} /><span>{painTitle(p)}{s.std && <span class="pin-where"> {WRAPPER_WHERE[s.std.kind].replace(/^\w/, (c) => c.toLowerCase())}</span>}</span></p>
      ))}
      {failed && <p class="card-fail">Failure points didn't load</p>}
      <div class="zseg" role="group" aria-label={`Move step ${s.sid}`}>
        {ZONE_ORDER.map((z) => (
          <button key={z} type="button" tabIndex={-1} class={`mv z-${z}`} aria-pressed={z === zone} aria-label={ZONES[z].label} title={ZONES[z].label} onClick={() => moveStep(s, z)}>
            <i aria-hidden="true" /><span class="mv-l" aria-hidden="true">{ZONES[z].label}</span><span class="mv-k" aria-hidden="true">{({ auto: "A", assist: "S", human: "H" } as const)[z]}</span>
          </button>
        ))}
        {moved && <button type="button" tabIndex={-1} class="mv mv-undo" onClick={() => moveStep(s, s.call.zone)} title="Put back where the first pass sorted it"><Icon name="undo" /><span class="sr-only">Put back to {ZONES[s.call.zone].label}</span></button>}
      </div>
    </div></li>
  );
}

function summaryText(ref: ProcRef, steps: XStep[]) {
  const r = route.value; const { c, p, total, pct, stdPins } = counts(steps, r.basis);
  const failed = painFailed(); const moved = steps.filter((s) => r.z[s.sid]);
  const text = (s: XStep) => (s.itself ? `${s.taskName} (${itselfLabel(s).toLowerCase()})` : humanizeStep(s.text, s.taskName));
  const L: string[] = [];
  L.push(`VirtuBrain process X-ray: ${ref.proc.id} ${ref.proc.name}`);
  L.push(`${ref.fn.functionName} / ${ref.group.groupId} ${ref.group.groupName}`);
  L.push("");
  L.push(`${total} ${r.basis === "core" ? "core steps" : "steps"} sorted by who should run them${r.basis === "core" ? ` (${steps.length - total} standard steps not counted)` : ""}:`);
  ZONE_ORDER.forEach((z, i) => L.push(`  ${ZONES[z].label.padEnd(7)}${String(c[z]).padStart(3)} steps  ${String(pct[i]).padStart(3)}%   ${failed ? "failure points didn't load" : `${plural(p[z], "illustrative failure point")}`}`));
  if (r.basis === "core" && stdPins && !failed) L.push(`  ${plural(stdPins, "more illustrative failure point")} on standard steps, listed with their task.`);
  if (moved.length) L.push(`${plural(moved.length, "step")} moved by hand from the first-pass sort.`);
  for (const z of ZONE_ORDER) {
    const list = steps.filter((s) => zoneFor(s) === z && inBasis(s, r.basis)); if (!list.length) continue;
    L.push(""); L.push(`${ZONES[z].label}: ${ZONES[z].rule}`);
    for (const s of list) L.push(`  ${s.sid}  ${text(s)}${r.z[s.sid] ? `  [moved from ${ZONES[s.call.zone].label}]` : ""}${s.pins.length ? `  [${s.pins.map((x) => `illustrative ${x.severity.toLowerCase()} failure point: ${painTitle(x)}`).join("; ")}]` : ""}`);
  }
  if (r.basis === "core" && !failed) {
    const sp = steps.filter((s) => s.std && s.pins.length);
    if (sp.length) { L.push(""); L.push("Failure points on standard steps (shown at task level):"); for (const s of sp) for (const x of s.pins) L.push(`  ${s.taskId}  ${WRAPPER_WHERE[s.std!.kind]}: illustrative ${x.severity.toLowerCase()} failure point, ${painTitle(x)}`); }
  }
  if (failed) { L.push(""); L.push("Failure points didn't load, so none are listed."); }
  L.push("");
  L.push("A first-pass sort on the wording of each step. Use it to start the conversation, not to decide.");
  L.push(PAIN_NOTE);
  L.push(`Open it: ${shareUrl({ view: "xray", fn: ref.fn.functionId, p: ref.proc.id })}`);
  return L.join("\n");
}

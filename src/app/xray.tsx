/* X-ray: every L6 step of one process sorted into Auto / Assist / Human by zoneOf(), with the
   reason shown, pain points pinned, and the user free to move any step. Moves live in the URL. */
import { signal, computed } from "@preact/signals";
import { useLayoutEffect, useRef } from "preact/hooks";
import { ZONES, ZONE_ORDER, zoneOf, gatewayOf, stepKey, PAIN_NOTE, type Zone, type ZoneCall, type PainPoint, type ProcRef } from "../lib/data";
import { route, go, hrefFor, tax, painIdx, currentProc, taxIdx, zoneBenchmark, loadData, say, announce, stepIdOf } from "./state";
import { searchProcs } from "./search";
import { Icon, FnIcon, Still, SevMark, ErrorState, Skel, plural, pct, copyText, useTween, reduceMotion } from "./ui";

export interface XStep { sid: string; taskId: string; taskName: string; actName: string; text: string; call: ZoneCall; pins: PainPoint[]; gw: boolean; n: number }

const xsteps = computed<XStep[]>(() => {
  const ref = currentProc.value; if (!ref) return [];
  const pins = painIdx.value?.idx.byStep; const out: XStep[] = []; let n = 0;
  for (const a of ref.proc.activities) for (const t of a.tasks) t.steps.forEach((s, i) => {
    out.push({ sid: stepIdOf(t.id, i), taskId: t.id, taskName: t.name, actName: a.name, text: s, call: zoneOf(s, t.name),
      pins: pins?.get(stepKey(ref.fn.functionId, t.id, i)) || [], gw: !!gatewayOf(s), n: n++ });
  });
  return out;
});
const zoneFor = (s: XStep) => route.value.z[s.sid] || s.call.zone;

/* ---- process picker (driven by the toolbar search while in X-ray) -------------------------------- */
export const pickOpen = signal(false);
export const pickQ = signal("");
export const pickActive = signal(0);
export const pickItems = computed<ProcRef[]>(() => {
  const idx = taxIdx.value; if (!idx) return [];
  const q = pickQ.value.trim();
  if (!q) return idx.list.filter((r) => r.flagship);
  return searchProcs(idx.list, q).slice(0, 12).map((h) => h.ref);
});
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
    case "Enter": if (!pickOpen.value || !items[pickActive.value]) return false; choose(items[pickActive.value]); break;
    case "Escape": if (!pickOpen.value && !pickQ.value) return false; pickOpen.value = false; pickQ.value = ""; break;
    default: return false;
  }
  e.preventDefault(); return true;
}
export function openPicker() {
  pickOpen.value = true; pickActive.value = 0;
  const el = document.getElementById("vb-search") as HTMLInputElement | null;
  el?.focus();
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
function counts(steps: XStep[]) {
  const c: Record<Zone, number> = { auto: 0, assist: 0, human: 0 }; const p: Record<Zone, number> = { auto: 0, assist: 0, human: 0 };
  for (const s of steps) { const z = zoneFor(s); c[z]++; p[z] += s.pins.length; }
  return { c, p };
}
export function moveStep(s: XStep, to: Zone, o: { focus?: boolean; quiet?: boolean } = {}) {
  const from = zoneFor(s); if (from === to) return;
  captureRects();
  if (o.focus !== false) {
    // on phones the destination lane is hidden, so focus falls to the neighbouring card
    const el = document.querySelector<HTMLElement>(`.lanes [data-step="${CSS.escape(s.sid)}"]`);
    focusAfter = s.sid;
    focusFallback = ((el?.nextElementSibling || el?.previousElementSibling) as HTMLElement | null)?.dataset.step || null;
  }
  const z = { ...route.value.z };
  if (to === s.call.zone) delete z[s.sid]; else z[s.sid] = to;
  go({ z }, { replace: true });
  const { c } = counts(xsteps.value);
  announce.value = `Step ${s.sid} moved to ${ZONES[to].label}. Auto ${c.auto}, Assist ${c.assist}, Human ${c.human}.`;
  if (!o.quiet) say(`Moved ${s.sid} to ${ZONES[to].label}`, { tone: "ok", action: { label: "Undo", run: () => moveStep(s, from, { quiet: true }) } });
}
const resetAll = () => { captureRects(); go({ z: {} }, { replace: true }); announce.value = "All steps are back where the first-pass sort put them."; say("Back to the first-pass sort", { tone: "ok" }); };

/* ---- view ------------------------------------------------------------------------------------- */
const mLane = signal<Zone>("auto");

/** After jumping in from Explore, bring the chosen step forward (switching the phone lane if needed) and focus it. */
export function focusXrayStep(sid: string, tries = 20) {
  const el = document.querySelector<HTMLElement>(`.lanes [data-step="${CSS.escape(sid)}"]`);
  if (!el) { if (tries > 0) setTimeout(() => focusXrayStep(sid, tries - 1), 60); return; }
  const lane = el.closest<HTMLElement>("[data-zone]")?.dataset.zone as Zone | undefined;
  if (!el.offsetParent && lane) { mLane.value = lane; requestAnimationFrame(() => focusXrayStep(sid, 0)); return; }
  el.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" });
  el.focus({ preventScroll: true }); el.classList.add("is-target"); setTimeout(() => el.classList.remove("is-target"), 2400);
}

export function XRay() {
  const t = tax.value;
  if (t.state === "error") return <div class="xr xr-state"><ErrorState what="The process library" onRetry={loadData} /></div>;
  const ref = currentProc.value;
  return (
    <div class="xr">
      <div class="pane-scroll xr-scroll" id="xr-scroll">
        <div class="xr-wrap">
          {ref ? <XHead ref_={ref} /> : <div class="xr-head"><div class="xr-intro"><Skel rows={4} class="skel-title" /></div></div>}
          {ref ? <Summary ref_={ref} /> : <div class="xr-sum"><Skel rows={3} /></div>}
          {ref ? <Lanes /> : <div class="lanes">{ZONE_ORDER.map((z) => <section key={z} class={`lane z-${z}`}><Skel rows={10} class="skel-cards" /></section>)}</div>}
        </div>
      </div>
    </div>
  );
}

function XHead({ ref_: ref }: { ref_: ProcRef }) {
  const { fn, group, proc } = ref;
  return (
    <header class="xr-head">
      <div class="xr-intro">
        <p class="xr-kicker">Process X-ray</p>
        <h2 id="xr-title" class="xr-title" tabIndex={-1}><span class="code code-lg">{proc.id}</span><span>{proc.name}</span></h2>
        <p class="crumb"><FnIcon id={fn.functionId} class="sm" />{fn.functionName}<span class="crumb-sep" aria-hidden="true">/</span><span><span class="code">{group.groupId}</span> {group.groupName}</span></p>
        <div class="xr-links">
          <button type="button" class="b b-ghost b-sm" onClick={openPicker}><Icon name="search" />Choose another process</button>
          <a class="b b-quiet b-sm" href={hrefFor({ view: "explore", fn: fn.functionId, p: proc.id, s: undefined })}
            onClick={(e) => { e.preventDefault(); go({ view: "explore", fn: fn.functionId, p: proc.id }); }}>Open in Explore</a>
        </div>
      </div>
      <figure class="xr-art" aria-hidden="true"><Still name="atlas-columns" sizes="(min-width: 900px) 240px, 40vw" alt="" /></figure>
    </header>
  );
}

function Summary({ ref_: ref }: { ref_: ProcRef }) {
  const steps = xsteps.value; const r = route.value; const total = steps.length;
  const { c, p } = counts(steps); const moved = Object.keys(r.z).length;
  const bench = zoneBenchmark.value;
  const copy = async () => {
    const ok = await copyText(summaryText(ref, steps));
    say(ok ? "Summary copied" : "Couldn't copy. Try again, or use Copy from the address bar link.", { tone: ok ? "ok" : "warn" });
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
          <a class="b b-primary b-sm" href={`/contact/?process=${encodeURIComponent(ref.proc.id)}&fn=${encodeURIComponent(ref.fn.functionId)}`}><Icon name="mail" />Talk to us about this process</a>
        </div>
      </div>
      <div class="zbar" role="img" aria-label={ZONE_ORDER.map((z) => `${ZONES[z].label} ${pct(c[z], total)}%`).join(", ")}>
        {ZONE_ORDER.map((z) => <span key={z} class={`zbar-seg z-${z}`} style={{ flexGrow: String(c[z]), flexBasis: c[z] ? "3px" : "0px" }} />)}
      </div>
      <div class="sum-meta">
        <p class="sum-total"><span class="num">{total}</span> steps in this process{moved ? <span class="sum-moved">, {moved} moved by you</span> : null}</p>
        {bench && (
          <div class="bench">
            <div class="zbar zbar-thin" aria-hidden="true">{ZONE_ORDER.map((z) => <span key={z} class={`zbar-seg z-${z}`} style={{ flexGrow: String(bench.n[z]) }} />)}</div>
            <p>All {bench.total.toLocaleString("en-US")} steps in the taxonomy: {ZONE_ORDER.map((z, i) => <span key={z}>{i ? ", " : ""}{ZONES[z].label} {pct(bench.n[z], bench.total)}%</span>)}</p>
          </div>
        )}
      </div>
      <dl class="zstats">
        {ZONE_ORDER.map((z) => <ZStat key={z} z={z} n={c[z]} total={total} pains={p[z]} />)}
      </dl>
    </section>
  );
}
function ZStat({ z, n, total, pains }: { z: Zone; n: number; total: number; pains: number }) {
  const tn = useTween(n); const tp = useTween(pct(n, total));
  return (
    <div class={`zs z-${z}`}>
      <dt><i aria-hidden="true" />{ZONES[z].label}</dt>
      <dd class="zs-fig"><span class="zs-n num">{Math.round(tn)}</span><span class="zs-pct num">{Math.round(tp)}%</span></dd>
      <dd class="zs-pain">{pains ? <><span class="tick" aria-hidden="true" />{plural(pains, "pain point")}</> : "No pain points"}</dd>
    </div>
  );
}

function Lanes() {
  const steps = xsteps.value; const r = route.value; const box = useRef<HTMLDivElement>(null);
  const zkey = JSON.stringify(r.z);
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
      if (el && el.offsetParent) el.focus({ preventScroll: true });
      else if (alt && alt.offsetParent) alt.focus({ preventScroll: true });
    }
  }, [zkey]);
  const byZone: Record<Zone, XStep[]> = { auto: [], assist: [], human: [] };
  for (const s of steps) byZone[zoneFor(s)].push(s);
  return (
    <div class="lanes-wrap">
      <div class="lane-switch" role="radiogroup" aria-label="Show lane"
        onKeyDown={(e) => {
          const i = ZONE_ORDER.indexOf(mLane.value);
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const n = ZONE_ORDER[(i + (e.key === "ArrowRight" ? 1 : 2)) % 3]; mLane.value = n; requestAnimationFrame(() => document.getElementById(`ls-${n}`)?.focus()); }
        }}>
        {ZONE_ORDER.map((z) => (
          <button key={z} id={`ls-${z}`} type="button" role="radio" aria-checked={mLane.value === z} tabIndex={mLane.value === z ? 0 : -1} class={`z-${z}`} onClick={() => { mLane.value = z; }}>
            <i aria-hidden="true" />{ZONES[z].label}<span class="num">{byZone[z].length}</span>
          </button>
        ))}
      </div>
      <p class="kbd-hint" id="xr-kbd">Select a step, then press <kbd>←</kbd> <kbd>→</kbd> to move it to another zone, or <kbd>A</kbd> <kbd>S</kbd> <kbd>H</kbd> for Auto, Assist, Human.</p>
      <div class="lanes" ref={box} data-lane={mLane.value}>
        {ZONE_ORDER.map((z) => (
          <section key={z} class={`lane z-${z}`} aria-labelledby={`lane-${z}-h`} data-zone={z}>
            <header class="lane-head">
              <h3 id={`lane-${z}-h`}><i aria-hidden="true" />{ZONES[z].label}<span class="num">{byZone[z].length}</span></h3>
              <p>{ZONES[z].rule}</p>
            </header>
            {byZone[z].length ? (
              <ol class="lane-list">{byZone[z].map((s) => <Card key={s.sid} s={s} zone={z} />)}</ol>
            ) : (
              <div class="lane-empty"><p>No steps here.</p><p>Move one in with the zone buttons on any step.</p></div>
            )}
          </section>
        ))}
      </div>
      <p class="note xr-note">Pain points pinned on steps come from the illustrative library. {PAIN_NOTE.replace(/^Illustrative library, /, "It is ")}</p>
    </div>
  );
}

function Card({ s, zone }: { s: XStep; zone: Zone }) {
  const moved = zone !== s.call.zone;
  const onKey = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    const i = ZONE_ORDER.indexOf(zone); const k = e.key.toLowerCase();
    let to: Zone | null = null;
    if (e.key === "ArrowLeft" && i > 0) to = ZONE_ORDER[i - 1];
    else if (e.key === "ArrowRight" && i < 2) to = ZONE_ORDER[i + 1];
    else if (k === "a" || k === "1") to = "auto"; else if (k === "s" || k === "2") to = "assist"; else if (k === "h" || k === "3") to = "human";
    else if (k === "r" && moved) to = s.call.zone;
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const li = e.currentTarget as HTMLElement; const sib = (e.key === "ArrowDown" ? li.nextElementSibling : li.previousElementSibling) as HTMLElement | null;
      sib?.focus(); e.preventDefault(); return;
    }
    if (to && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); e.stopPropagation(); moveStep(s, to); }
  };
  return (
    <li class={`card z-${zone}${moved ? " is-moved" : ""}${s.gw ? " is-gw" : ""}`} data-step={s.sid} tabIndex={0} aria-describedby="xr-kbd" onKeyDown={onKey}>
      <p class="card-top"><span class="code">{s.sid}</span><span class="card-task">{s.taskName}</span></p>
      <p class="card-text">{s.gw && <span class="sr-only">Decision point: </span>}{s.text}</p>
      <p class="card-why">
        {moved ? <><span class="why-l">Moved by you.</span> First pass: {ZONES[s.call.zone].label}. {s.call.why}</> : <><span class="why-l">Why</span>{s.call.why}</>}
      </p>
      {s.pins.map((p) => (
        <p key={p.id} class={`card-pin sev-${p.severity}`}><SevMark sev={p.severity} /><span>{p.title}</span></p>
      ))}
      <div class="card-move" role="group" aria-label={`Zone for step ${s.sid}`}>
        {ZONE_ORDER.map((z) => (
          <button key={z} type="button" tabIndex={-1} class={`mv z-${z}`} aria-pressed={z === zone} onClick={() => moveStep(s, z)}>
            <i aria-hidden="true" />{ZONES[z].label}
          </button>
        ))}
        {moved && <button type="button" tabIndex={-1} class="mv mv-undo" onClick={() => moveStep(s, s.call.zone)} title="Put back where the first pass sorted it"><Icon name="undo" /><span class="sr-only">Put back to {ZONES[s.call.zone].label}</span></button>}
      </div>
    </li>
  );
}

function summaryText(ref: ProcRef, steps: XStep[]) {
  const r = route.value; const total = steps.length; const { c, p } = counts(steps);
  const moved = steps.filter((s) => r.z[s.sid]);
  const L: string[] = [];
  L.push(`VirtuBrain process X-ray: ${ref.proc.id} ${ref.proc.name}`);
  L.push(`${ref.fn.functionName} / ${ref.group.groupId} ${ref.group.groupName}`);
  L.push("");
  L.push(`${total} steps sorted by who should run them:`);
  for (const z of ZONE_ORDER) L.push(`  ${ZONES[z].label.padEnd(7)}${String(c[z]).padStart(3)} steps  ${String(pct(c[z], total)).padStart(3)}%   ${plural(p[z], "pain point")}`);
  if (moved.length) L.push(`${plural(moved.length, "step")} moved by hand from the first-pass sort.`);
  for (const z of ZONE_ORDER) {
    const list = steps.filter((s) => zoneFor(s) === z); if (!list.length) continue;
    L.push(""); L.push(`${ZONES[z].label}: ${ZONES[z].rule}`);
    for (const s of list) L.push(`  ${s.sid}  ${s.text}${r.z[s.sid] ? `  [moved from ${ZONES[s.call.zone].label}]` : ""}${s.pins.length ? `  [${s.pins.map((x) => `${x.severity} pain point: ${x.title}`).join("; ")}]` : ""}`);
  }
  L.push("");
  L.push("A first-pass sort on the wording of each step. Use it to start the conversation, not to decide.");
  L.push(PAIN_NOTE);
  L.push(`Open it: ${location.origin}${hrefFor({ view: "xray", fn: ref.fn.functionId, p: ref.proc.id })}`);
  return L.join("\n");
}

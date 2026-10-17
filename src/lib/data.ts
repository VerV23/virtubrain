/* VirtuBrain data: the real taxonomy and pain-point library from the VirtuBrain platform
   (virtubrain.higgsfield.app), shipped as a snapshot in /public/data so the site works on any host.
   Refresh with: npm run sync-data (see README.md). */

export type Industry = "retail" | "tech" | "insurance" | "banking" | "hotel" | "manufacturing";
export type Country = "PH" | "US" | "SG";
export const INDUSTRIES: Record<Industry, string> = { retail: "Retail", tech: "Technology", insurance: "Insurance", banking: "Banking", hotel: "Hotel and hospitality", manufacturing: "Manufacturing" };
export const COUNTRIES: Record<Country, string> = { PH: "Philippines", US: "United States", SG: "Singapore" };

export interface Task { id: string; name: string; steps: string[] }
export interface Activity { id: string; name: string; tasks: Task[] }
export interface Process {
  id: string; name: string; description: string; hasStepDetail: boolean; activities: Activity[];
  calibration: { industry: Record<Industry, string>; country: Record<Country, string>; systems: string[]; kpis: string[] };
  trigger: string; output: string;
}
export interface Group { groupId: string; groupName: string; processes: Process[] }
export interface Fn { functionId: string; functionName: string; processGroups: Group[] }
export interface Taxonomy {
  meta: { stats: Record<"functions" | "groups" | "processes" | "activities" | "tasks" | "steps", number>; flagshipProcesses: { functionId: string; processId: string; name: string }[] };
  functions: Fn[];
}
export type Severity = "High" | "Medium" | "Low";
export const SEVERITIES: Severity[] = ["High", "Medium", "Low"];
export interface PainPoint {
  id: string; functionId: string; functionName: string; groupId: string; groupName: string; processId: string; processName: string;
  activityId: string; activityName: string; taskId: string; taskName: string; stepIndex: number; stepText: string;
  title: string; severity: Severity; category: string; categoryLabel: string; impact: string;
}
export interface PainLibrary { meta: { totalPainPoints: number; bySeverity: Record<Severity, number>; byCategory: Record<string, number> }; painPoints: PainPoint[] }

export const CATEGORY_LABELS: Record<string, string> = {
  "handoff-friction": "Handoff friction", "data-quality": "Data quality and system friction", "automation-gap": "Automation gap",
  "exception-volume": "Exception volume", "control-gap": "Control and compliance gap", "resource-contention": "Resource contention",
  "rework-loop": "Rework loops", bottleneck: "Bottlenecks and delay",
};

/** The line that must sit near any pain-point number (brief section 2, honesty rule). */
export const PAIN_NOTE = "Illustrative library, modeled on process-mining conventions. In an engagement it is filled with your own evidence.";
/** Prefix for every impact sentence shown in the app (brief section 9). */
export const IMPACT_PREFIX = "Illustrative estimate.";

const cache: Record<string, Promise<unknown>> = {};
function load<T>(name: string): Promise<T> {
  return (cache[name] ||= fetch(`/data/${name}.json`, { headers: { Accept: "application/json" } }).then((r) => {
    if (!r.ok) throw new Error(`Could not load ${name} (HTTP ${r.status})`);
    return r.json();
  }).catch((e) => { delete cache[name]; throw e; })) as Promise<T>;
}
export const loadTaxonomy = () => load<Taxonomy>("master-taxonomy");
export const loadPain = () => load<PainLibrary>("pain-points");

/* ---- Index ------------------------------------------------------------------------------------
   Process ids are NOT unique across functions: 9.1.1 to 9.3.2 exist in Marketing, Sales & CX, in
   Retail-Specific Operations and in Asset & Facilities Management. `key` (functionId/processId) is
   unique; `byId` resolves a bare id to the flagship (or first) process carrying it. */
export interface ProcRef { fn: Fn; group: Group; proc: Process; hay: string; stepCount: number; taskCount: number; key: string; flagship: boolean }
export const procKey = (functionId: string, processId: string) => `${functionId}/${processId}`;
export const stepKey = (functionId: string, taskId: string, stepIndex: number) => `${functionId}|${taskId}|${stepIndex}`;

export function indexTaxonomy(T: Taxonomy) {
  const list: ProcRef[] = []; const byId = new Map<string, ProcRef>(); const byKey = new Map<string, ProcRef>();
  const fnById = new Map<string, Fn>();
  const flag = new Set((T.meta.flagshipProcesses || []).map((f) => procKey(f.functionId, f.processId)));
  for (const fn of T.functions) {
    fnById.set(fn.functionId, fn);
    for (const group of fn.processGroups) for (const proc of group.processes) {
      let stepCount = 0, taskCount = 0;
      for (const a of proc.activities) for (const t of a.tasks) { taskCount++; stepCount += t.steps.length; }
      const hay = [proc.id, proc.name, proc.description, fn.functionName, group.groupName, ...proc.activities.flatMap((a) => [a.name, ...a.tasks.map((t) => t.name)])].join(" ").toLowerCase();
      const key = procKey(fn.functionId, proc.id);
      const ref: ProcRef = { fn, group, proc, hay, stepCount, taskCount, key, flagship: flag.has(key) || proc.hasStepDetail };
      list.push(ref); byKey.set(key, ref);
      const prev = byId.get(proc.id);
      if (!prev || (!prev.flagship && ref.flagship)) byId.set(proc.id, ref);
    }
  }
  /** Resolve a process from a bare id, preferring the given function when the id is ambiguous. */
  const resolve = (id?: string | null, functionId?: string | null) =>
    (id && functionId && byKey.get(procKey(functionId, id))) || (id ? byId.get(id) : undefined);
  return { list, byId, byKey, fnById, resolve };
}
export type TaxonomyIndex = ReturnType<typeof indexTaxonomy>;

/** Pain points by process, by exact step, and (for points that sit on a standard wrapper step) by task.
    A point on a wrapper step is shown at task level, because the wrapper is a pattern, not a recorded step. */
export const taskKey = (functionId: string, taskId: string) => `${functionId}|${taskId}`;
export function indexPain(L: PainLibrary) {
  const byProc = new Map<string, PainPoint[]>(); const byStep = new Map<string, PainPoint[]>(); const byTask = new Map<string, PainPoint[]>();
  const push = <K,>(m: Map<K, PainPoint[]>, k: K, p: PainPoint) => { const a = m.get(k); if (a) a.push(p); else m.set(k, [p]); };
  for (const p of L.painPoints) {
    push(byProc, procKey(p.functionId, p.processId), p);
    push(byStep, stepKey(p.functionId, p.taskId, p.stepIndex), p);
    if (isWrapper(p.stepText)) push(byTask, taskKey(p.functionId, p.taskId), p);
  }
  const sev = (s: Severity) => SEVERITIES.indexOf(s);
  for (const m of [byProc, byStep, byTask]) for (const a of m.values()) a.sort((x, y) => sev(x.severity) - sev(y.severity));
  return { byProc, byStep, byTask };
}
export type PainIndex = ReturnType<typeof indexPain>;
export const categoryLabel = (id: string, fallback = "") => CATEGORY_LABELS[id] || fallback || id;

/* ---- Decision points ---------------------------------------------------------------------------
   A step worded as a question is a gateway. The breakdown shows the branch that leaves the main path
   (for most questions "No"; for "is escalation required?" it is "Yes"). */
export interface Gateway { off: "Yes" | "No"; offText: string; on: "Yes" | "No" }
export function gatewayOf(step: string): Gateway | null {
  const s = step.trim();
  if (!s.endsWith("?")) return null;
  if (/^do the results meet the completion criteria/i.test(s)) return { off: "No", offText: "Routed to the exception queue, then reworked", on: "Yes" };
  if (/^are all required approvals and sign-offs in place/i.test(s)) return { off: "No", offText: "Held until the missing sign-off is in place", on: "Yes" };
  if (/^is further escalation or rework required/i.test(s)) return { off: "Yes", offText: "Escalated to the process owner and reworked", on: "No" };
  return { off: "No", offText: "Returned for rework", on: "Yes" };
}

/* ---- Standard (wrapper) steps -----------------------------------------------------------------
   577 of the 590 tasks follow a standard five-step pattern: confirm the inputs, do the task, check the
   output, decide whether it is complete, then log and hand off. The four steps around "do the task" are
   repeated wrapper sentences (12 variants); only the 13 flagship tasks carry curated steps. 2,308 of the
   2,965 steps (78%) are these wrappers, so the app folds them by default and counts core steps unless the
   reader asks for all of them. */
export const STANDARD_PATTERN = "a standard five-step pattern: confirm the inputs, do the task, check the output, decide whether it is complete, then log and hand off";
export type WrapperKind = "start" | "check" | "gate" | "handoff";
/** The pattern stage each wrapper belongs to, in the shared wording. */
export const STAGE: Record<WrapperKind, string> = { start: "confirm the inputs", check: "check the output", gate: "decide whether it is complete", handoff: "log and hand off" };
const WRAPPERS: [RegExp, WrapperKind][] = [
  [/^receive the trigger and confirm the inputs required for /i, "start"],
  [/^prepare templates, access, and stakeholder alignment for /i, "start"],
  [/^assess scope and gather the supporting data needed for /i, "start"],
  [/^validate the output against the defined quality and control checklist$/i, "check"],
  [/^cross-check the output against policy and prior-period baselines$/i, "check"],
  [/^review the results with the accountable process owner$/i, "check"],
  [/^do the results meet the completion criteria, with no exception handling required\?$/i, "gate"],
  [/^are all required approvals and sign-offs in place\?$/i, "gate"],
  [/^is further escalation or rework required before this task can close\?$/i, "gate"],
  [/^log the outcome in the system of record and notify the next process owner$/i, "handoff"],
  [/^hand off the finali[sz]ed output to the downstream task or team$/i, "handoff"],
  [/^document the decision and update the relevant system\(s\) of record$/i, "handoff"],
];
export function wrapperOf(step: string): { kind: WrapperKind; label: string } | null {
  const s = step.trim();
  for (const [re, kind] of WRAPPERS) if (re.test(s)) return { kind, label: STAGE[kind] };
  return null;
}
/** True for the 12 repeated wrapper sentences around each templated task. */
export const isWrapper = (step: string) => wrapperOf(step) !== null;
/** Where a pain point on a wrapper step sits, said at task level. */
export const WRAPPER_WHERE: Record<WrapperKind, string> = {
  start: "Where this task confirms its inputs", check: "Where this task's output is checked", gate: "Where this task decides whether it is complete", handoff: "At the handoff of this task",
};
/** A step whose text is just its task's name is the "do the task" step of the standard pattern. */
export const isTaskItself = (step: string, taskName: string) => step.trim().toLowerCase() === taskName.trim().toLowerCase();

/* ---- Wording: restore casing and plain phrasing ---------------------------------------------------
   The source data lowercases task names inside wrapper sentences ("bank/gl", "cfo", "rfx"), splices
   verb-first task names into pain titles ("spike around Obtain controller..."), and splices KPI names into
   impact sentences ("load on Number of late/manual..."). These helpers fix that for display; the data
   stays untouched. They are shared with the home page build (scripts/build-summary.ts). */
const KEEP = new Set(["North", "Star"]);
/** A task or process name as it reads mid-sentence: acronyms and mixed-case words kept, Title Case lowered. */
export function midCase(name: string): string {
  const words = name.match(/[A-Za-z][\w&'’]*/g) || [];
  const plain = words.filter((w) => w.length > 3 && !/[A-Z].*[A-Z]/.test(w) && !/\d/.test(w));
  const title = plain.length >= 2 && plain.filter((w) => /^[A-Z]/.test(w)).length / plain.length >= 0.6;
  let first = true;
  return name.replace(/[A-Za-z][\w&'’]*/g, (w) => {
    const isFirst = first; first = false;
    if (w.length === 1 || /[A-Z].*[A-Z]/.test(w) || /\d/.test(w) || /^[a-z]+[A-Z]/.test(w) || KEEP.has(w)) return w;
    return isFirst || title ? w.charAt(0).toLowerCase() + w.slice(1) : w;
  });
}
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function replaceName(text: string, name: string, atStart: "cap" | "keep" = "cap") {
  if (!name) return text;
  const i = text.toLowerCase().indexOf(name.toLowerCase());
  if (i < 0) return text;
  let rep = midCase(name);
  if (i === 0) rep = atStart === "cap" ? capFirst(rep) : rep;
  return text.slice(0, i) + rep + text.slice(i + name.length);
}

/* Verb-first task names become gerunds where they sit inside a sentence ("around obtaining controller and
   CFO review"). VERBS lists the leading verbs used in task and activity names, including the ones joined
   by "and" or commas ("Review, approve, and post ..."). */
const VERBS = new Set(("accept activate administer aggregate align allocate analyze apply approve assess assign assure audit author brief build " +
  "calculate capture cascade check classify cleanse clear close collect commit communicate compile conduct configure confirm consolidate contain " +
  "convert coordinate create define deliver deploy design detect determine develop diagnose dispatch disposition distribute document draft drive " +
  "embed enable enforce engage engineer eradicate establish evaluate execute extend facilitate field file finalize forecast formulate fulfill fund " +
  "gather generate govern groom hand identify implement incorporate inspect integrate investigate issue label launch lead localize log maintain manage " +
  "manufacture map model monitor negotiate notify obtain onboard operate optimize orchestrate pack perform pick pilot place plan post prepare present " +
  "prioritize process produce prosecute protect provide provision publish putaway qualify quantify rank ratify receive reconcile record recover recruit " +
  "refresh release remediate remit report reproduce resolve respond review roll route run scale scan schedule score screen secure segment select " +
  "sequence set source specify stage stand stock store stress-test structure submit support tender test track traffic train translate transmit " +
  "triage trigger tune update validate verify write").split(" "));
/** Verbs that can follow "and" later in a name; words that double as nouns here (record, report, plan...) are left out. */
const LATER_VERBS = new Set(("approve assess allocate cleanse decide develop evaluate execute extend finalize identify integrate localize maintain manage " +
  "negotiate onboard optimize prioritize quantify reconcile resolve specify submit triage tune validate recover protect adjust track conduct").split(" "));
const DOUBLE = new Set(["commit", "log", "map", "plan", "run", "scan", "set", "submit", "transmit", "remit", "stop", "ship", "get", "put", "cut"]);
function ing(v: string): string {
  const low = v.toLowerCase();
  if (low === "putaway") return "putting away";
  if (low === "traffic") return "trafficking";
  if (low.includes("-")) { const [a, ...b] = low.split("-"); return [a, ...b.slice(0, -1), ing(b[b.length - 1])].join("-"); }
  if (DOUBLE.has(low)) return low + low.slice(-1) + "ing";
  if (low.endsWith("ie")) return low.slice(0, -2) + "ying";
  if (low.endsWith("e") && !low.endsWith("ee")) return low.slice(0, -1) + "ing";
  return low + "ing";
}
/** "Review, approve, and post period-end entries" -> "reviewing, approving, and posting period-end entries". */
export function gerund(name: string): string {
  const m = midCase(name);
  const re = /^([A-Za-z-]+(?:\/[A-Za-z-]+)?)((?:,? (?:and|or) |, )([A-Za-z-]+))*/;
  const head = re.exec(m); if (!head) return m;
  const parts = head[0].split(/(,? (?:and|or) |, )/);
  const out: string[] = []; let consumed = 0;
  for (let i = 0; i < parts.length; i += 2) {
    const w = parts[i]; const words = w.split("/");
    if (!words.every((x) => VERBS.has(x.toLowerCase()))) break;
    if (i > 0) { out.push(parts[i - 1]); consumed += parts[i - 1].length; }
    out.push(words.map(ing).join("/")); consumed += w.length;
  }
  if (!out.length) return m;
  // a second verb later in the name ("Analyze experiment results and decide rollout") follows suit
  const rest = m.slice(consumed).replace(/(,? and )([a-z-]+)\b/g, (x, sep: string, w: string) => (LATER_VERBS.has(w) ? sep + ing(w) : x));
  return out.join("") + rest;
}

/** A step with the task name it embeds restored to its proper casing ("bank/GL", "CFO", "RFx"). */
export function humanizeStep(step: string, taskName = ""): string {
  if (taskName && isTaskItself(step, taskName)) return step;
  return replaceName(step, taskName);
}
/** Short form for display under its task: the three opening wrappers say "this task" instead of repeating the name. */
export function stepLabel(step: string, taskName = ""): string {
  const s = step.trim();
  if (/^receive the trigger and confirm the inputs required for /i.test(s)) return "Receive the trigger and confirm the inputs this task needs";
  if (/^prepare templates, access, and stakeholder alignment for /i.test(s)) return "Prepare templates, access, and stakeholder alignment for this task";
  if (/^assess scope and gather the supporting data needed for /i.test(s)) return "Assess scope and gather the supporting data this task needs";
  return humanizeStep(s, taskName);
}

/* Pain-point titles come from about 40 templates around the task name. Each template is rewritten so the
   task reads as a gerund ("Staffing gaps slow recording goods receipt at peak volume"). The four records on
   8.1.1, where most visitors land, also get titles written from their own step. */
const TITLE_OVERRIDES: Record<string, string> = {
  "Handoff after Configure close calendar, task dependencies, and preparer/reviewer assignments in the close management platform loses context":
    "Context is lost when the close calendar and preparer and reviewer assignments are handed to the next owner",
  "Generate variance/flux analysis versus budget, forecast, and prior period with AI-drafted commentary is still a manual, high-volume step":
    "Variance and flux analysis still takes heavy manual effort",
  "Non-standard cases spike around Obtain controller and CFO review, sign-off, and formal close certification":
    "Non-standard cases pile up at controller and CFO sign-off",
  "Review, approve, and post period-end and adjusting journal entries is a strong automation candidate":
    "Archiving entries and support for SOX/ICFR testing is still manual",
};
const TITLE_TEMPLATES: Record<string, (g: string) => string> = {
  "{T} requires manual re-entry due to system gaps": (g) => `${capFirst(g)} requires manual re-entry because of system gaps`,
  "Validation at {T} catches frequent upstream errors": (g) => `Checks during ${g} keep catching upstream errors`,
  "Handoff after {T} loses context": (g) => `Context is lost in the handoff after ${g}`,
  "{T} is still a manual, high-volume step": (g) => `${capFirst(g)} is still manual and high-volume`,
  "{T} relies on informal follow-up to reach the next team": (g) => `After ${g}, the handoff to the next team relies on informal follow-up`,
  "Ownership is unclear after {T}": (g) => `Ownership is unclear after ${g}`,
  "Cross-team handoff at {T} adds delay": (g) => `The cross-team handoff in ${g} adds delay`,
  "Approval evidence is inconsistent at {T}": (g) => `Approval evidence for ${g} is inconsistent`,
  "{T} is a strong automation candidate": (g) => `${capFirst(g)} is a strong automation candidate`,
  "{T} output isn't reliably logged downstream": (g) => `The output of ${g} isn't reliably logged downstream`,
  "Non-standard cases spike around {T}": (g) => `Non-standard cases spike around ${g}`,
  "Segregation of duties is unclear in {T}": (g) => `Segregation of duties is unclear in ${g}`,
  "Staffing gaps slow {T} at peak volume": (g) => `Staffing gaps slow ${g} at peak volume`,
  "Exception rate is elevated at {T}": (g) => `The exception rate is high in ${g}`,
  "{T} frequently loops back for correction": (g) => `${capFirst(g)} frequently loops back for correction`,
  "{T} generates disproportionate exceptions": (g) => `${capFirst(g)} generates a disproportionate share of exceptions`,
  "{T} is frequently blocked by incomplete data": (g) => `${capFirst(g)} is frequently blocked by incomplete data`,
  "No automation coverage for {T}": (g) => `${capFirst(g)} has no automation coverage`,
  "Source data for {T} is inconsistently formatted": (g) => `Source data for ${g} is inconsistently formatted`,
  "{T} competes for shared system access": (g) => `${capFirst(g)} competes for shared system access`,
  "{T} inputs vary by system of record": (g) => `Inputs to ${g} vary by system of record`,
  "{T} lacks a systematic control check": (g) => `${capFirst(g)} lacks a systematic control check`,
  "{T} remains spreadsheet- and email-driven": (g) => `${capFirst(g)} still runs on spreadsheets and email`,
  "{T} has no backup coverage": (g) => `${capFirst(g)} has no backup coverage`,
  "Off-path variants concentrate at {T}": (g) => `Off-path variants concentrate in ${g}`,
  "Rework spikes when {T} fails review": (g) => `Rework spikes when the output of ${g} fails review`,
  "High re-submission rate at {T}": (g) => `${capFirst(g)} has a high re-submission rate`,
  "Capacity constraints bottleneck {T}": (g) => `Capacity constraints bottleneck ${g}`,
  "The decision at {T} is frequently overridden": (g) => `The decision in ${g} is frequently overridden`,
  "Manual effort concentrates at {T}": (g) => `Manual effort concentrates in ${g}`,
  "{T} depends on a narrow pool of specialists": (g) => `${capFirst(g)} depends on a narrow pool of specialists`,
  "Sign-off at {T} is not consistently enforced": (g) => `Sign-off on ${g} is not consistently enforced`,
  "{T} bounces back on the exception path": (g) => `${capFirst(g)} bounces back on the exception path`,
  "{T} backs up during peak volume": (g) => `${capFirst(g)} backs up during peak volume`,
  "{T} regularly stalls awaiting the prior handoff": (g) => `${capFirst(g)} regularly stalls waiting for the prior handoff`,
  "Queueing builds up ahead of {T}": (g) => `Queues build up ahead of ${g}`,
  "Cycle time spikes around {T}": (g) => `Cycle time spikes around ${g}`,
  "Policy compliance is unverified at {T}": (g) => `Policy compliance is unverified in ${g}`,
};
/** A pain-point title in plain English. Pass the task name the title was written around. */
export function humanizeTitle(title: string, taskName: string): string {
  if (TITLE_OVERRIDES[title]) return TITLE_OVERRIDES[title];
  if (!taskName || !title.includes(taskName)) return replaceName(title, taskName);
  const tpl = title.replace(taskName, "{T}"); const g = gerund(taskName);
  const f = TITLE_TEMPLATES[tpl];
  if (f) return f(g);
  let m = /^\{T\} triggers repeat cycles within (.+)$/.exec(tpl);
  if (m) return `${capFirst(g)} triggers repeat cycles within ${gerund(m[1])}`;
  m = /^\{T\} is the slowest link in (.+)$/.exec(tpl);
  if (m) return `${capFirst(g)} is the slowest link in ${gerund(m[1])}`;
  return replaceName(title, taskName);
}
/** A KPI name as it reads inside a sentence: "% journal entries..." becomes "the share of journal entries...",
    "Number of late entries" becomes "the number of late entries"; acronyms are kept. */
export function kpiPhrase(kpi: string): string {
  let k = kpi.trim();
  k = k.replace(/^(%|percentage)\s+of\s+/i, "the share of ").replace(/^%\s+/, "the share of ").replace(/^(#|number)\s+of\s+/i, "the number of ");
  k = k.replace(/\bas %\s+of\b/g, "as a share of").replace(/\(%\s+of\s+/g, "(share of ");
  if (/^the (share|number) of /.test(k)) return k;
  const first = k.split(" ")[0];
  const body = midCase(first) + k.slice(first.length);
  return /^days\b/i.test(k) ? body : "the " + body;
}
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** An impact sentence with KPI splices rewritten; pass the process KPIs when known. */
export function humanizeImpact(impact: string, kpis: string[] = []): string {
  let s = impact;
  for (const k of [...kpis].sort((a, b) => b.length - a.length)) {
    if (!s.includes(k)) continue;
    const K = reEsc(k); const P = kpiPhrase(k);
    s = s.replace(new RegExp(`load on ${K}\\.`), `load, which shows up in ${P}.`)
      .replace(new RegExp(`, freeing capacity for ${K}\\.`), `. The gain would show up in ${P}.`)
      .replace(new RegExp(`, improving ${K}\\.`), `. The gain would show up in ${P}.`)
      .replace(new RegExp(`, a strong automation candidate for ${K}\\.`), `, a strong automation candidate. The gain would show up in ${P}.`)
      .replace(new RegExp(`feeding ${K}`), `feeding into ${P}`)
      .replace(new RegExp(`before ${K} targets are reached`), `before targets for ${P} are reached`)
      .replace(new RegExp(`within (.+?), adding rework`), (_m, a: string) => `within ${gerund(a)}, adding rework`)
      .replace(new RegExp(`adjacent steps in (.+?), adding`), (_m, a: string) => `adjacent steps in ${gerund(a)}, adding`);
    s = s.split(k).join(P);
  }
  // KPIs we were not told about: only a "%" that opens a KPI after a joining word ("slowing % invoices ...")
  return s.replace(/(^|[\s(])%\s+of\s+/g, "$1the share of ")
    .replace(/\b(slowing|eroding|affecting|improving|straining|feeding|threatens|on|for|into|delaying|pushes|pushing)\s+%\s+(?=[a-z])/g, "$1 the share of ");
}

/* Process descriptions in plain English: clean rewrites for the processes whose source text leans on dash
   asides, and a generic cleaner for anything else. */
const DESCRIPTIONS: Record<string, string> = {
  "finance-accounting/8.1.1": "Runs the period-end close from sub-ledger cutoff through journal posting, reconciliation, flux review and certification. More of it now runs continuously, with agents monitoring it.",
  "procurement/7.1.2": "Receives goods and services, matches supplier invoices to the purchase order and receipt, resolves exceptions and pays suppliers on time, within controls. Agents increasingly handle the matching and exceptions.",
  "human-capital-management/6.4.2": "Runs payroll end to end. Keeps pay master data current, calculates and pays salaries, and remits statutory contributions and taxes on time.",
  "procurement/7.1.3": "Governs low-value, high-volume spend: procurement cards, virtual cards, and travel and expense reimbursement. Keeps it within policy and reconciled to the GL.",
  "technology-specific-operations/TSO.1.1": "Runs the agile delivery rhythm that governs how engineering teams commit to and track work: backlog grooming, sprint and release planning, and delivery reporting.",
  "human-capital-management/6.2.3": "Prepares and delivers a structured onboarding experience, from contracts and system access to orientation and early-tenure milestones, so new hires become productive and engaged sooner.",
  "human-capital-management/6.3.1": "Runs the performance cycle end to end: goal setting and cascading, ongoing feedback and formal review. Includes improvement plans for employees who are underperforming.",
  "human-capital-management/6.5.2": "Manages every kind of separation, from resignations and exit interviews to involuntary terminations and retirement. Includes final pay and clearance.",
  "human-capital-management/6.6.2": "Runs the HR service channels, the help desk and shared services as well as self-service portals. Also keeps statutory records and answers employment verification and data-subject requests.",
  "human-capital-management/6.7.1": "Captures, schedules and validates employee time through biometric and mobile capture, shift rosters and timesheet and overtime approval, so payroll and labor-cost reporting get accurate, compliant data.",
};
/** A process description for display. */
export function displayDescription(proc: Process, functionId?: string): string {
  const fixed = (functionId && DESCRIPTIONS[`${functionId}/${proc.id}`]) || Object.entries(DESCRIPTIONS).find(([k]) => k.endsWith("/" + proc.id) && !functionId)?.[1];
  if (fixed) return fixed;
  return cleanAsides(proc.description);
}
/** Turns dash asides into commas and full stops: "X - A - Y" becomes "X, A, Y"; a trailing "X - A." becomes "X. A." */
export function cleanAsides(text: string): string {
  let t = text.replace(/\s+(?:—|–|--|-)\s+/g, " — ");
  const n = (t.match(/ — /g) || []).length;
  if (n >= 2) t = t.replace(/ — (.+?) — /g, ", $1, ");
  t = t.replace(/ — (.+)$/, (_m, rest: string) => `. ${capFirst(rest)}`);
  return t.replace(/ — /g, ", ").replace(/,\s*,/g, ",");
}

/** Process trigger and output sentences that follow a generic template rather than saying something specific. */
export function isTemplatedIO(text: string, procName = ""): boolean {
  const t = text.trim();
  return (!!procName && t.toLowerCase().includes(procName.toLowerCase())) ||
    /^(Triggered at the start of a new .* cycle, or when an exception|Triggered by an approved (mandate|initiative|change)|Triggered by a (business need|new or changing|scheduled)|Triggered on the scheduled cadence|Triggered by the start of the relevant|A current, actively managed .* position|A completed, validated |A closed-out, audit-ready record confirming|An approved (plan|design) for |A documented assessment of)/i.test(t);
}
/** Trigger or output with the embedded process name restored to its casing. */
export const humanizeIO = (text: string, procName: string) => replaceName(text, procName, "keep");

/** Whole-number shares that always add up to 100 (largest remainder). */
export function shares(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0); if (!total) return counts.map(() => 0);
  const raw = counts.map((c) => (100 * c) / total); const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; out[i]++; left--; }
  return out;
}

/* ---- Zoning: a transparent first-pass sort of each step into who should run it -------------
   auto   = the output can be checked against a record, so an AI agent runs it and logs the check
   assist = the output needs judgment to confirm, so an AI agent drafts and a person approves
   human  = accountability cannot be delegated, so people decide and AI agents prepare
   A heuristic on the step's wording, shown as a starting point, never a diagnosis. ("Agent" alone would be
   ambiguous: in contact-center steps it means a human rep, so the copy always says "AI agent".)

   How it reads a step, in order (the first rule that matches wins, and its reason is shown):
   1. The 12 wrapper sentences. Checks and the escalation gate follow the work they wrap: on rule-based
      work they are Auto, on judgment work Assist or Human.
   2. Who the step names (System, Preparer, Reviewer, Approver).
   3. Hands-on physical work: people do it, the system confirms each scan.
   4. Rule-driven releases and handoffs (release orders for picking, e-signature, routing): Auto.
   5. Approval, negotiation, disposition, decisions about people, legal exposure, statutory filings,
      treasury authority, speaking for the company, setting direction: Human.
   6. Accounting estimates, payment release, covenant tests, reading that needs interpretation, agreement
      between people, disputes, judgments about candidates: Assist.
   7. Judgment verbs anywhere in the step (draft, analyze, forecast, design, investigate...): Assist.
      A step is sorted by its hardest part, so "Issue RFP and evaluate bids" is Assist.
   8. Monitoring and tracking against thresholds: Auto, with its own reason.
   9. Transaction verbs (record, reconcile, calculate, route...) or automation cues (automated, matching,
      OCR, EDI): Auto.
   10. Everything else: Assist, because nothing in the wording names a check against a record. */
export type Zone = "auto" | "assist" | "human";
export const ZONE_ORDER: Zone[] = ["auto", "assist", "human"];
export const ZONES: Record<Zone, { label: string; rule: string }> = {
  auto: { label: "Auto", rule: "Output can be checked against a record. An AI agent runs it and the check is logged." },
  assist: { label: "Assist", rule: "Output needs judgment to confirm. An AI agent drafts and a person approves." },
  human: { label: "Human", rule: "Accountability can't be delegated. People decide and AI agents prepare." },
};
/** `rule` names the rule that fired when it matters downstream ("system-run": the wording says a system already does it). */
export interface ZoneCall { zone: Zone; why: string; rule?: "system-run" }
type Kind = "physical" | "accountable" | "other";
type Rule = [RegExp, Zone, string, Kind?, "system-run"?];

const T_VALIDATE = /^validate the output against the defined quality and control checklist/i;
const T_CROSS = /^cross-check the output against policy and prior-period baselines/i;
const T_OWNER = /^review the results with the accountable process owner/i;
const T_ESCALATE = /^is further escalation or rework required/i;
const STRUCTURAL: Rule[] = [
  [/^receive the trigger and confirm the inputs/i, "auto", "Checks the inputs against the request record. Complete or incomplete is a yes-or-no test."],
  [/^prepare templates, access, and stakeholder alignment/i, "assist", "An AI agent sets up templates and access. Getting stakeholders aligned takes a person."],
  [/^assess scope and gather the supporting data/i, "assist", "An AI agent gathers the data. A person decides the scope."],
  [/^do the results meet the completion criteria/i, "auto", "A yes-or-no gate on defined completion criteria. A no sends the case to a person."],
  [/^are all required approvals and sign-offs in place/i, "auto", "Whether the sign-offs exist can be read from the workflow record. Giving them stays with people."],
  [/^log the outcome in the system of record/i, "auto", "Writes the outcome to the system of record. The entry is its own evidence."],
  [/^hand off the finali[sz]ed output/i, "auto", "A routed handoff. Delivery shows in the workflow log."],
  [/^document the decision and update/i, "assist", "An AI agent drafts the decision record. The person who decided confirms it."],
];

const WHY_MONITOR = "Watches data against thresholds. An AI agent alerts and logs; a person acts on the alert.";
const RULES: Rule[] = [
  // 2. the step names its actor
  [/^(the )?(system|automated policy engine)\b|^approved entry auto-posts|auto-(matched|logged|posts|clear|classified)|\b(are|is) (archived|logged)\b|\bre-matched\b|\bsla clock\b/i, "auto", "The step says the system runs it by rule. The system log is the evidence.", "other", "system-run"],
  [/^approver\b/i, "human", "An approval under delegated authority. A named person signs.", "accountable"],
  [/^(preparer|reviewer|the resolver)\b|^(\w+ )?manager reviews\b/i, "assist", "The step names a person checking an AI agent's draft. The agent drafts and the person confirms."],
  [/^agent (captures|records|updates)\b/i, "assist", "A service rep does this today. An AI agent can pre-fill it and the rep confirms."],
  // 3. hands-on physical work
  [/^(pick|pack|putaway|load and manifest|stage (packed|the picked)|consolidate picks|accept and inspect|receive and stock|receive and verify inbound|unload|implement planogram|perform line setup|audit shelf|perform cycle counts|conduct (incoming material inspection|physical|workplace safety inspections)|operate reception|manage security guard|notify and hand off order to customer|store associate)\b|^prepare and process the daily bank deposit|\bcash count|\bpick (bopis|the item|items)\b|packing station|sales floor/i, "human", "Hands-on, on-site work. People do it and systems log each event.", "physical"],
  // 4. rule-driven releases and handoffs
  [/release and prioritize orders|^release wave|\be-signature\b|\bhand off to\b/i, "auto", "A rule-driven release or handoff. Each one leaves a system trail."],
  [/^route\b/i, "auto", "Routing by defined rules. Each hop is logged."],
  [/against (a |the )?(priority|severity)[\/a-z ]*matrix/i, "auto", "Sorted against a defined matrix. The call can be checked against the matrix and is logged."],
  // 5. accountability stays with a person
  [/\b(approve|approves|approving|approvals?(?!\s+(workflow|guardrails|thresholds))|sign-?off|certify|certifies|close certification|ratify|ratifies)\b/i, "human", "An approval or sign-off. Accountability stays with a named person.", "accountable"],
  [/\bnegotiat(e|es|ing|ion)\b/i, "human", "A negotiation. Someone has to own the terms.", "accountable"],
  [/\b(disposition|write-?offs?|disposals?)\b/i, "human", "Deciding what happens to goods or assets, or writing them off, is a call someone answers for.", "accountable"],
  [/\b(decide|go\/kill|funding decisions|evaluate and select|select(ion)? (and negotiate|suppliers?|new site)|select suppliers\/components|fund|critical incident|major escalation)\b/i, "human", "A call someone must own. AI agents can lay out the options.", "accountable"],
  [/\b(performance reviews?|9-box|calibration sessions|exit interviews|interviews and assessments|management interviews|performance improvement plans?|termination|redundancy|reduction-in-force|restructuring|grievance|union|works council|outplacement|absence case|offer to the candidate)\b/i, "human", "A decision about a person. A manager owns it and AI agents prepare the facts.", "accountable"],
  [/\b(litigation|outside counsel|regulator inquiries|regulatory examinations|antitrust|lobbying|political contributions|ethics|conflicts of interest|violations|hotline|legal advisory|legally clear|patents|authority correspondence|tax audits?|authority audits?)\b/i, "human", "Legal or regulatory exposure. A named person answers for it.", "accountable"],
  [/\b(file|files|submit|submits)\b[^.]*\b(returns?|reports?|filings?|statutory|regulatory)\b/i, "human", "A statutory or regulatory filing. A named officer signs it and an AI agent prepares it.", "accountable"],
  [/\b(debt issuance|refinanc\w*|signator\w*|bank account structure|bank account changes?|hedge transactions|execute hedges?|dealing)\b/i, "human", "Commits the company's money or signing authority. A named officer decides.", "accountable"],
  [/\b(earnings calls?|roadshows|investor conferences|town hall|journalist|media relationships|community stakeholder|present diligence findings|brief executive|strategy workshops|convene|crisis tier|disruption response|ahead of public release)\b/i, "human", "Speaks or acts for the company. A person fronts it and AI agents prepare.", "accountable"],
  [/^(set|define|establish)\b.*\b(strateg\w*|targets?(?!-)|appetite|tolerance|goals|okrs?|thesis|vision|ownership|oversight)\b/i, "human", "Sets direction or limits for others. Leadership owns it and AI agents model the options.", "accountable"],
  // 6. judgment the wording makes explicit
  [/\b(tax provision|deferred tax|reserves?|estimat\w*(?! tax installments)|impairment|fair value|valuation allowance|expected credit loss|bad debt|uncertain tax)\b/i, "assist", "An accounting estimate. An AI agent computes it from the rules and a person owns the judgment."],
  [/\b(payment runs?|release payments?|disburse|remit|wire transfers?)\b/i, "assist", "Money leaves the company. An AI agent prepares and checks the run, and a named approver releases it under dual control."],
  [/\b(cctv|surveillance|shrink|fairness|bias)\b/i, "assist", "Watching it takes judgment: footage, exceptions or fairness. An AI agent flags what it sees and a person decides what it means."],
  [/\bcredit (limits?|holds?)\b/i, "assist", "A credit decision. An AI agent scores the risk and a person sets the limit."],
  [/\bcovenant/i, "assist", "Covenant tests turn on definitions and waivers. An AI agent runs the numbers and a person signs off the result."],
  [/\b(legislation|rulemaking|laws?|regulatory changes?|laws\/regulations|sentiment|perception|(brand|market|competitive) positioning|(?<!cash )positioning|competitor\w*|competitive intelligence|product launches|brand health|threat intelligence|geopolitical)\b/i, "assist", "Reading it takes interpretation. An AI agent drafts or watches the sources and a person judges what matters."],
  [/\bwith (the )?(requestor|customer|business partners|finance\/revenue operations)\b|\bjointly\b|against supply constraints|with statistical forecast/i, "assist", "Needs agreement between people. An AI agent prepares the numbers and people settle the differences."],
  [/\b(disputes?|trade deductions|chargebacks|short-pays|out-of-balance investigation)\b/i, "assist", "Disputes and exceptions need judgment. An AI agent assembles the case and a person resolves it."],
  [/\b(screen|assess|evaluat|shortlist|rank|scor)\w*\b[^.]*\b(applications|resumes|candidates?)\b/i, "assist", "Judgments about candidates carry bias risk. An AI agent can shortlist and a person decides."],
  // 7. judgment verbs anywhere in the step (a step is sorted by its hardest part)
  [/\b(narrative|commentary|position papers)\b/i, "assist", "An AI agent can draft the words. A person checks they say what the numbers mean."],
  [/(^|, |\band )(draft|author|write(?!-off)|prepare|compile|produce|document|brief)\b|(, |\band )communicate\b/i, "assist", "An AI agent can draft it. A person checks the content before it is used."],
  [/(^|, |\band )(analy[sz]e|assess|evaluate|investigate|identify|quantify|forecast|model|review|scan for|triage|diagnose|remediate|stress-test|validate concept|score and rank|segment|gather)\b|\bforecasting\b/i, "assist", "Analysis an AI agent can run. Reading the result takes judgment, so a person confirms it."],
  [/(^|, |\band )(design|develop|build|plan|define|configure|implement|pilot|integrate|optimi[sz]e|localize|sequence roadmap|prioritize)\b|(, |\band )set\b|\b(visual identity|guidelines)\b/i, "assist", "Design work. An AI agent proposes and a person chooses."],
  // 8. watching against thresholds
  [/^(monitor|track)\b/i, "auto", WHY_MONITOR],
  // 9. transactions and automation cues
  [/\b(preventive maintenance|work orders?)\b/i, "auto", "Scheduled from the maintenance or work-order system. Each order and completion is logged; people do the physical work."],
  [/^(log|record|post|archive|preserve|sync|transmit|notify|distribute|publish|calculate|reconcile|match|capture|scan|collect|aggregate|extract|generate|issue|provision|release|convert|receive|tender|trigger|check|validate|screen|cleanse|refresh|roll up|schedule payments|sequence orders|apply incoming|run (baseline|depreciation|vulnerability|the automated|network)|restore|isolate|freeze|execute a canary|roll back|retest|set up test|score and route|enable the supplier|create and validate|apply distributed|process (checkout|recurring)|deploy models)\b/i, "auto", "A transaction or check with one right answer. It can be re-run and compared with the record."],
  [/\b(automated|automatically|auto-|system applies|ocr|via (e-invoicing|edi)|edi\/portal|three-way|two-way|matching|reconcil\w*|tolerance|routing rules|infrastructure-as-code|ci\/cd|ci pipeline|scanning|regression|smoke test|test cases|test suites?|depreciation|atp\/ctp|safety stock|reorder points|daily cash positioning|bank deposit|payslips|time capture)\b/i, "auto", "Rule-based work with a result that can be checked against the record."],
  // 10. ongoing operational work
  [/^(manage|maintain|administer|coordinate|operate|conduct|execute|perform|process|run|facilitate|support|govern|apply|establish|set|align|cascade|communicate|train|deliver|provide|enforce|embed|stand up|drive|resolve|respond|place|select|assign|allocate|determine|translate|incorporate|qualify|secure|obtain|activate|create|enable|deploy|detect|traffic|groom|tender|sequence|consolidate|prioritize|score|classify|report|source|accept|reproduce|write|present|kick off)\b/i, "assist", "Ongoing work with judgment calls along the way. An AI agent handles the routine and a person confirms."],
];
const DEFAULT_CALL: ZoneCall & { kind: Kind } = { zone: "assist", why: "Nothing in the wording names a check against a record, so a person confirms the result.", kind: "other" };

function classify(s: string): ZoneCall & { kind: Kind } {
  for (const [re, zone, why, kind, rule] of RULES) if (re.test(s)) return rule ? { zone, why, kind: kind || "other", rule } : { zone, why, kind: kind || "other" };
  return DEFAULT_CALL;
}

/** Sort one step. Pass the task name: wrapper checks and the escalation gate depend on the work they wrap.
    Calls are memoized, so sorting all 2,965 steps again (the X-ray benchmark, the zones overlay) is cheap. */
const memo = new Map<string, ZoneCall>();
export function zoneOf(step: string, task?: string): ZoneCall {
  const key = `${task || ""}\u0000${step}`;
  let c = memo.get(key);
  if (!c) { c = zoneOfUncached(step, task); memo.set(key, c); }
  return c;
}
function zoneOfUncached(step: string, task?: string): ZoneCall {
  const s = step.trim();
  for (const [re, zone, why] of STRUCTURAL) if (re.test(s)) return { zone, why };
  if (T_VALIDATE.test(s) || T_CROSS.test(s) || T_OWNER.test(s) || T_ESCALATE.test(s)) {
    const core = task ? classify(task) : { zone: "assist" as Zone, kind: "other" as Kind };
    if (T_ESCALATE.test(s)) return core.zone === "auto"
      ? { zone: "auto", why: "A defined threshold triggers escalation. It is logged and a person picks it up." }
      : { zone: "human", why: "Choosing to escalate is a judgment someone answers for." };
    if (T_OWNER.test(s)) return core.zone === "human" && core.kind === "accountable"
      ? { zone: "human", why: "The accountable owner reviews work that is theirs to answer for. AI agents prepare the pack." }
      : { zone: "assist", why: "An AI agent prepares the review pack. The process owner confirms." };
    if (core.zone === "auto") return T_VALIDATE.test(s)
      ? { zone: "auto", why: "Rule-based output tested against a defined checklist. Each pass or fail is logged." }
      : { zone: "auto", why: "A comparison with policy limits and prior periods that can be re-run." };
    return T_VALIDATE.test(s)
      ? { zone: "assist", why: "The checklist is fixed, but the work it checks needs judgment. An AI agent pre-checks and a person confirms." }
      : { zone: "assist", why: "An AI agent compares the result with policy and prior periods. A person judges the differences." };
  }
  const c = classify(s);
  return c.rule ? { zone: c.zone, why: c.why, rule: c.rule } : { zone: c.zone, why: c.why };
}


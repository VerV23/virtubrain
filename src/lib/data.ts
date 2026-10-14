/* VirtuBrain data: the real taxonomy and pain-point library from the VirtuBrain platform
   (virtubrain.higgsfield.app), shipped as a snapshot in /public/data so the site works on any host.
   Refresh with: npm run sync-data (see README). */

export type Industry = "retail" | "tech" | "insurance" | "banking" | "hotel" | "manufacturing";
export type Country = "PH" | "US" | "SG";
export const INDUSTRIES: Record<Industry, string> = { retail: "Retail", tech: "Technology", insurance: "Insurance", banking: "Banking", hotel: "Hotel and hospitality", manufacturing: "Manufacturing" };
export const COUNTRIES: Record<Country, string> = { PH: "Philippines", US: "United States", SG: "Singapore" };
export const LEVELS = ["Function", "Process group", "Process", "Activity", "Task", "Step"];

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
   577 of the 590 tasks are broken into five steps with the same pattern: four wrapper sentences
   (start, check, decide, hand off) around one core step that repeats the task name. Only the 13
   flagship tasks carry curated steps. 2,308 of the 2,965 steps (78%) are these wrappers, so the app
   folds them by default and counts core steps unless the reader asks for all of them. */
export type WrapperKind = "start" | "check" | "gate" | "handoff";
const WRAPPERS: [RegExp, WrapperKind, string][] = [
  [/^receive the trigger and confirm the inputs required for /i, "start", "Confirm inputs"],
  [/^prepare templates, access, and stakeholder alignment for /i, "start", "Prepare and align"],
  [/^assess scope and gather the supporting data needed for /i, "start", "Scope and gather data"],
  [/^validate the output against the defined quality and control checklist$/i, "check", "Checklist check"],
  [/^cross-check the output against policy and prior-period baselines$/i, "check", "Policy cross-check"],
  [/^review the results with the accountable process owner$/i, "check", "Owner review"],
  [/^do the results meet the completion criteria, with no exception handling required\?$/i, "gate", "Completion gate"],
  [/^are all required approvals and sign-offs in place\?$/i, "gate", "Approvals gate"],
  [/^is further escalation or rework required before this task can close\?$/i, "gate", "Escalation gate"],
  [/^log the outcome in the system of record and notify the next process owner$/i, "handoff", "Log and notify"],
  [/^hand off the finali[sz]ed output to the downstream task or team$/i, "handoff", "Hand off"],
  [/^document the decision and update the relevant system\(s\) of record$/i, "handoff", "Record the decision"],
];
export function wrapperOf(step: string): { kind: WrapperKind; label: string } | null {
  const s = step.trim();
  for (const [re, kind, label] of WRAPPERS) if (re.test(s)) return { kind, label };
  return null;
}
/** True for the 12 repeated wrapper sentences around each templated task. */
export const isWrapper = (step: string) => wrapperOf(step) !== null;
/** Where a pain point on a wrapper step sits, said at task level. */
export const WRAPPER_WHERE: Record<WrapperKind, string> = {
  start: "As this task starts", check: "When this task's output is checked", gate: "At this task's decision point", handoff: "At the handoff of this task",
};

/* ---- Wording: restore casing and plain phrasing ---------------------------------------------------
   The source data lowercases task names inside wrapper sentences ("bank/gl", "cfo", "rfx"), drops task
   names mid-sentence in Title Case into pain titles, and splices KPI names into impact sentences ("slowing
   % journal entries auto-matched"). These helpers fix that for display; the data stays untouched. */
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
/** A step with the task name it embeds restored to its proper casing ("bank/GL", "CFO", "RFx"). */
export function humanizeStep(step: string, taskName = ""): string {
  if (taskName && step.trim().toLowerCase() === taskName.trim().toLowerCase()) return step;
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
/** A pain-point title with the task name in sentence case where it sits mid-sentence. */
export const humanizeTitle = (title: string, taskName: string) => replaceName(title, taskName);
/** A KPI name as it reads inside a sentence: "% journal entries..." becomes "the share of journal entries...". */
export function kpiPhrase(kpi: string): string {
  let k = kpi.trim();
  k = k.replace(/^%\s+of\s+/i, "the share of ").replace(/^%\s+/, "the share of ");
  k = k.replace(/\bas %\s+of\b/g, "as a share of").replace(/\(%\s+of\s+/g, "(share of ");
  return k.startsWith("the share of") ? k : midCase(k.split(" ")[0]) + k.slice(k.split(" ")[0].length);
}
/** An impact sentence with KPI splices rewritten; pass the process KPIs when known. */
export function humanizeImpact(impact: string, kpis: string[] = []): string {
  let s = impact;
  for (const k of [...kpis].sort((a, b) => b.length - a.length)) if (s.includes(k)) s = s.split(k).join(kpiPhrase(k));
  return s.replace(/(^|[\s(])%\s+of\s+/g, "$1the share of ").replace(/(^|\s)%\s+(?=[a-z])/g, "$1the share of ");
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
export interface ZoneCall { zone: Zone; why: string }
type Kind = "physical" | "accountable" | "other";
type Rule = [RegExp, Zone, string, Kind?];

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
  [/^(the )?(system|automated policy engine)\b|^approved entry auto-posts|auto-(matched|logged|posts|clear|classified)|\b(are|is) (archived|logged)\b|\bre-matched\b|\bsla clock\b/i, "auto", "The step says the system runs it by rule. The system log is the evidence."],
  [/^approver\b/i, "human", "An approval under delegated authority. A named person signs.", "accountable"],
  [/^(preparer|reviewer|the resolver)\b/i, "assist", "The step names a person checking an AI agent's draft. The agent drafts and the person confirms."],
  // 3. hands-on physical work
  [/^(pick|pack|putaway|load and manifest|stage (packed|the picked)|consolidate picks|accept and inspect|receive and stock|receive and verify inbound|unload|implement planogram|perform line setup|audit shelf|perform cycle counts|conduct (incoming material inspection|physical|workplace safety inspections)|operate reception|manage security guard|notify and hand off order to customer|store associate)\b|packing station|sales floor/i, "human", "Hands-on work in a store, plant or warehouse. People do it and the system confirms each scan.", "physical"],
  // 4. rule-driven releases and handoffs
  [/release and prioritize orders|^release wave|\be-signature\b|\bhand off to\b/i, "auto", "A rule-driven release or handoff. Each one leaves a system trail."],
  [/^route\b/i, "auto", "Routing by defined rules. Each hop is logged."],
  // 5. accountability stays with a person
  [/\b(approve|approves|approving|approvals?(?!\s+(workflow|guardrails|thresholds))|sign-?off|certify|certifies|close certification|ratify|ratifies)\b/i, "human", "An approval or sign-off. Accountability stays with a named person.", "accountable"],
  [/\bnegotiat(e|es|ing|ion)\b/i, "human", "A negotiation. Someone has to own the terms.", "accountable"],
  [/\bdisposition\b/i, "human", "Deciding what happens to goods or assets is a call someone answers for.", "accountable"],
  [/\b(decide|go\/kill|funding decisions|evaluate and select|select(ion)? (and negotiate|suppliers?|new site)|select suppliers\/components|fund|critical incident|major escalation)\b/i, "human", "A call someone must own. AI agents can lay out the options.", "accountable"],
  [/\b(performance reviews?|9-box|calibration sessions|exit interviews|interviews and assessments|management interviews|performance improvement plans?|termination|redundancy|reduction-in-force|restructuring|grievance|union|works council|outplacement|absence case|offer to the candidate)\b/i, "human", "A decision about a person. A manager owns it and AI agents prepare the facts.", "accountable"],
  [/\b(litigation|outside counsel|regulator inquiries|regulatory examinations|antitrust|lobbying|political contributions|ethics|conflicts of interest|violations|hotline|legal advisory|legally clear|patents)\b/i, "human", "Legal or regulatory exposure. A named person answers for it.", "accountable"],
  [/\b(file|files|submit|submits)\b[^.]*\b(returns?|reports?|filings?|statutory|regulatory)\b/i, "human", "A statutory or regulatory filing. A named officer signs it and an AI agent prepares it.", "accountable"],
  [/\b(debt issuance|refinanc\w*|signator\w*|bank account structure|bank account changes?)\b/i, "human", "Commits the company's money or signing authority. A named officer decides.", "accountable"],
  [/\b(earnings calls?|roadshows|investor conferences|town hall|journalist|media relationships|community stakeholder|present diligence findings|brief executive|strategy workshops|convene|crisis tier|disruption response|ahead of public release)\b/i, "human", "Speaks or acts for the company. A person fronts it and AI agents prepare.", "accountable"],
  [/^(set|define|establish)\b.*\b(strateg\w*|targets?(?!-)|appetite|tolerance|goals|okrs?|thesis|vision|ownership|oversight)\b/i, "human", "Sets direction or limits for others. Leadership owns it and AI agents model the options.", "accountable"],
  // 6. judgment the wording makes explicit
  [/\b(tax provision|deferred tax|reserves?|estimat\w*|impairment|fair value|valuation allowance|expected credit loss|bad debt|uncertain tax)\b/i, "assist", "An accounting estimate. An AI agent computes it from the rules and a person owns the judgment."],
  [/\b(payment runs?|release payments?|disburse|remit|wire transfers?)\b/i, "assist", "Money leaves the company. An AI agent prepares and checks the run, and a named approver releases it under dual control."],
  [/\bcovenant/i, "assist", "Covenant tests turn on definitions and waivers. An AI agent runs the numbers and a person signs off the result."],
  [/\b(legislation|rulemaking|laws?|regulatory changes?|laws\/regulations|sentiment|perception|(brand|market|competitive) positioning|brand health|threat intelligence|geopolitical)\b/i, "assist", "Reading it takes interpretation. An AI agent drafts or watches the sources and a person judges what matters."],
  [/\bwith (the )?(requestor|customer|business partners|finance\/revenue operations)\b|\bjointly\b|against supply constraints|with statistical forecast/i, "assist", "Needs agreement between people. An AI agent prepares the numbers and people settle the differences."],
  [/\b(disputes?|trade deductions|chargebacks|short-pays|out-of-balance investigation)\b/i, "assist", "Disputes and exceptions need judgment. An AI agent assembles the case and a person resolves it."],
  [/\b(screen|assess|evaluat|shortlist|rank|scor)\w*\b[^.]*\b(applications|resumes|candidates?)\b/i, "assist", "Judgments about candidates carry bias risk. An AI agent can shortlist and a person decides."],
  // 7. judgment verbs anywhere in the step (a step is sorted by its hardest part)
  [/\b(narrative|commentary|position papers)\b/i, "assist", "An AI agent can draft the words. A person checks they say what the numbers mean."],
  [/(^|, |\band )(draft|author|write|prepare|compile|produce|document|brief)\b|(, |\band )communicate\b/i, "assist", "An AI agent can draft it. A person checks the content before it is used."],
  [/(^|, |\band )(analy[sz]e|assess|evaluate|investigate|identify|quantify|forecast|model|review|scan for|triage|diagnose|remediate|stress-test|validate concept|score and rank|segment)\b|\bforecasting\b/i, "assist", "Analysis an AI agent can run. Reading the result takes judgment, so a person confirms it."],
  [/(^|, |\band )(design|develop|build|plan|define|configure|implement|pilot|integrate|optimi[sz]e|localize|sequence roadmap|prioritize|gather)\b|(, |\band )set\b/i, "assist", "Design work. An AI agent proposes and a person chooses."],
  // 8. watching against thresholds
  [/^(monitor|track)\b/i, "auto", WHY_MONITOR],
  // 9. transactions and automation cues
  [/^(log|record|post|archive|preserve|sync|transmit|notify|distribute|publish|calculate|reconcile|match|capture|scan|collect|aggregate|extract|generate|issue|provision|release|convert|receive|tender|trigger|check|validate|screen|cleanse|refresh|roll up|schedule payments|sequence orders|apply incoming|run (baseline|depreciation|vulnerability|the automated|network)|restore|isolate|freeze|execute a canary|roll back|retest|set up test|score and route|enable the supplier|create and validate|apply distributed|process (checkout|recurring)|deploy models)\b/i, "auto", "A transaction or check with one right answer. It can be re-run and compared with the record."],
  [/\b(automated|automatically|auto-|system applies|ocr|via (e-invoicing|edi)|edi\/portal|three-way|two-way|matching|reconcil\w*|tolerance|routing rules|infrastructure-as-code|ci\/cd|ci pipeline|scanning|regression|smoke test|test cases|test suites?|depreciation|atp\/ctp|safety stock|reorder points|daily cash positioning|bank deposit|payslips|time capture)\b/i, "auto", "Rule-based work with a result that can be checked against the record."],
  // 10. ongoing operational work
  [/^(manage|maintain|administer|coordinate|operate|conduct|execute|perform|process|run|facilitate|support|govern|apply|establish|set|align|cascade|communicate|train|deliver|provide|enforce|embed|stand up|drive|resolve|respond|place|select|assign|allocate|determine|translate|incorporate|qualify|secure|obtain|activate|create|enable|deploy|detect|traffic|groom|tender|sequence|consolidate|prioritize|score|classify|report|source|accept|reproduce|write|present|kick off)\b/i, "assist", "Ongoing work with judgment calls along the way. An AI agent handles the routine and a person confirms."],
];
const DEFAULT_CALL: ZoneCall & { kind: Kind } = { zone: "assist", why: "Nothing in the wording names a check against a record, so a person confirms the result.", kind: "other" };

function classify(s: string): ZoneCall & { kind: Kind } {
  for (const [re, zone, why, kind] of RULES) if (re.test(s)) return { zone, why, kind: kind || "other" };
  return DEFAULT_CALL;
}

/** Sort one step. Pass the task name: wrapper checks and the escalation gate depend on the work they wrap. */
export function zoneOf(step: string, task?: string): ZoneCall {
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
  return { zone: c.zone, why: c.why };
}

/** Zone every step of a task (keeps the task context for its wrapper checks). */
export const zoneTask = (t: Task): ZoneCall[] => t.steps.map((s) => zoneOf(s, t.name));

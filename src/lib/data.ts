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
export const PAIN_NOTE = "Illustrative library, modelled on process-mining conventions. In an engagement it is filled with your own evidence.";

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

export function indexPain(L: PainLibrary) {
  const byProc = new Map<string, PainPoint[]>(); const byStep = new Map<string, PainPoint[]>();
  const push = <K,>(m: Map<K, PainPoint[]>, k: K, p: PainPoint) => { const a = m.get(k); if (a) a.push(p); else m.set(k, [p]); };
  for (const p of L.painPoints) {
    push(byProc, procKey(p.functionId, p.processId), p);
    push(byStep, stepKey(p.functionId, p.taskId, p.stepIndex), p);
  }
  const sev = (s: Severity) => SEVERITIES.indexOf(s);
  for (const a of byProc.values()) a.sort((x, y) => sev(x.severity) - sev(y.severity));
  for (const a of byStep.values()) a.sort((x, y) => sev(x.severity) - sev(y.severity));
  return { byProc, byStep };
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

/* ---- Zoning: a transparent first-pass sort of each step into who should run it -------------
   auto   = the output can be checked against a record, so an agent can run it and log the check
   assist = the output needs judgment to confirm, so an agent drafts and a person approves
   human  = accountability cannot be delegated, so people decide and agents prepare
   This is a heuristic on the step's wording, shown to users as a starting point, never a diagnosis.

   How it reads a step, in order (the first rule that matches wins, and its reason is shown):
   1. The structural steps that wrap most tasks (receive inputs, check, decide, log, hand off). Checks
      follow the work they check: a checklist on rule-based work is Auto, on judgment work it is Assist.
   2. Who the step names (System, Preparer, Reviewer, Approver).
   3. Hands-on physical work: people do it, the system confirms each scan.
   4. Approval, negotiation, decisions about people, legal exposure, speaking for the company, setting
      direction: accountability stays with a person.
   5. Reading that needs interpretation (law, sentiment): an agent watches, a person judges.
   6. Judgment verbs anywhere in the step (draft, analyse, design, investigate...): Assist. A step is
      sorted by its hardest part, so "Issue RFP and evaluate bids" is Assist.
   7. Transaction verbs (record, reconcile, calculate, route, monitor...) or automation cues (automated,
      matching, OCR, EDI): Auto.
   8. Everything else: Assist, because nothing in the wording names a check against a record. */
export type Zone = "auto" | "assist" | "human";
export const ZONE_ORDER: Zone[] = ["auto", "assist", "human"];
export const ZONES: Record<Zone, { label: string; rule: string }> = {
  auto: { label: "Auto", rule: "Output can be checked against a record. An agent runs it and the check is logged." },
  assist: { label: "Assist", rule: "Output needs judgment to confirm. An agent drafts and a person approves." },
  human: { label: "Human", rule: "Accountability can't be delegated. People decide and agents prepare." },
};
export interface ZoneCall { zone: Zone; why: string }
type Rule = [RegExp, Zone, string];

// 1. structural steps
const T_VALIDATE = /^validate the output against the defined quality and control checklist/i;
const T_CROSS = /^cross-check the output against policy and prior-period baselines/i;
const T_OWNER = /^review the results with the accountable process owner/i;
const STRUCTURAL: Rule[] = [
  [/^receive the trigger and confirm the inputs/i, "auto", "Checks the inputs against the request record. Complete or incomplete is a yes-or-no test."],
  [/^prepare templates, access, and stakeholder alignment/i, "assist", "An agent sets up templates and access. Getting stakeholders aligned takes a person."],
  [/^assess scope and gather the supporting data/i, "assist", "An agent gathers the data. A person decides the scope."],
  [/^do the results meet the completion criteria/i, "auto", "A yes-or-no gate on defined completion criteria. A no sends the case to a person."],
  [/^are all required approvals and sign-offs in place/i, "auto", "Whether the sign-offs exist can be read from the workflow record. Giving them stays with people."],
  [/^is further escalation or rework required/i, "human", "Choosing to escalate is a judgment someone answers for."],
  [/^log the outcome in the system of record/i, "auto", "Writes the outcome to the system of record. The entry is its own evidence."],
  [/^hand off the finali[sz]ed output/i, "auto", "A routed handoff. Delivery shows in the workflow log."],
  [/^document the decision and update/i, "assist", "An agent drafts the decision record. The person who decided confirms it."],
];

const RULES: Rule[] = [
  // 2. the step names its actor
  [/^(the )?(system|automated policy engine)\b|^approved entry auto-posts|auto-(matched|logged|posts|clear|classified)|\b(are|is) (archived|logged)\b|\bre-matched\b|\bsla clock\b/i, "auto", "The step says the system runs it by rule. The system log is the evidence."],
  [/^approver\b/i, "human", "An approval under delegated authority. A named person signs."],
  [/^(preparer|reviewer|the resolver)\b/i, "assist", "The step names a person checking an agent's draft. Agent drafts, person confirms."],
  // 3. hands-on physical work
  [/^(pick|pack|putaway|load and manifest|stage (packed|the picked)|consolidate picks|accept and inspect|receive and stock|implement planogram|perform line setup|audit shelf|perform cycle counts|conduct (incoming material inspection|physical|workplace safety inspections)|operate reception|manage security guard|notify and hand off order to customer|store associate)\b|packing station|sales floor/i, "human", "Hands-on work in a store, plant or warehouse. People do it and the system confirms each scan."],
  // 4. accountability stays with a person
  [/^route\b/i, "auto", "Routing by defined rules. Each hop is logged."],
  [/\b(approve|approves|approving|approvals?(?!\s+(workflow|guardrails|thresholds))|sign-?off|certify|certifies|close certification|ratify|ratifies)\b/i, "human", "An approval or sign-off. Accountability stays with a named person."],
  [/\bnegotiat(e|es|ing|ion)\b/i, "human", "A negotiation. Someone has to own the terms."],
  [/\b(decide|go\/kill|funding decisions|evaluate and select|select(ion)? (and negotiate|suppliers?|new site)|select suppliers\/components|fund|critical incident|major escalation)\b/i, "human", "A call someone must own. Agents can lay out the options."],
  [/\b(performance reviews?|9-box|calibration sessions|exit interviews|interviews and assessments|management interviews|performance improvement plans?|termination|redundancy|reduction-in-force|restructuring|grievance|union|works council|outplacement|absence case|offer to the candidate)\b/i, "human", "A decision about a person. A manager owns it and agents prepare the facts."],
  [/\b(litigation|outside counsel|regulator inquiries|regulatory examinations|antitrust|lobbying|political contributions|ethics|conflicts of interest|violations|hotline|legal advisory|legally clear)\b/i, "human", "Legal or regulatory exposure. A named person answers for it."],
  [/\b(earnings calls?|roadshows|investor conferences|town hall|journalist|media relationships|community stakeholder|present diligence findings|brief executive|strategy workshops|convene|crisis tier|disruption response|ahead of public release)\b/i, "human", "Speaks or acts for the company. A person fronts it and agents prepare."],
  [/^(set|define|establish)\b.*\b(strateg\w*|targets?(?!-)|appetite|tolerance|goals|okrs?|thesis|vision|ownership|oversight)\b/i, "human", "Sets direction or limits for others. Leadership owns it and agents model the options."],
  // 5. reading that needs interpretation, agreement between people, or judgments about candidates
  [/\b(legislation|rulemaking|laws?|regulatory changes?|laws\/regulations|sentiment|perception|positioning|brand health|threat intelligence|geopolitical|narrative|commentary|position papers)\b/i, "assist", "Reading it takes interpretation. An agent drafts or watches the sources and a person judges what matters."],
  [/\bwith (the )?(requestor|customer|business partners|finance\/revenue operations)\b|\bjointly\b|against supply constraints|with statistical forecast/i, "assist", "Needs agreement between people. An agent prepares the numbers and people settle the differences."],
  [/\b(disputes?|deductions|chargebacks|short-pays|out-of-balance investigation)\b/i, "assist", "Disputes and exceptions need judgment. An agent assembles the case and a person resolves it."],
  [/\b(resumes|candidates?)\b/i, "assist", "Judgments about candidates carry bias risk. An agent can shortlist and a person decides."],
  // 6. judgment verbs anywhere in the step (a step is sorted by its hardest part)
  [/(^|, |\band )(draft|author|write|prepare|compile|produce|document|brief)\b|(, |\band )communicate\b/i, "assist", "An agent can draft it. A person checks the content before it is used."],
  [/(^|, |\band )(analy[sz]e|assess|evaluate|investigate|identify|quantify|forecast|model|review|scan for|triage|diagnose|remediate|stress-test|validate concept|score and rank|segment)\b/i, "assist", "Analysis an agent can run. Reading the result takes judgment, so a person confirms it."],
  [/(^|, |\band )(design|develop|build|plan|define|configure|implement|pilot|integrate|optimi[sz]e|localize|sequence roadmap|prioritize|gather)\b|(, |\band )set\b/i, "assist", "Design work. An agent proposes and a person chooses."],
  // 7. transactions and automation cues
  [/^(log|record|post|archive|preserve|sync|transmit|remit|disburse|notify|distribute|publish|calculate|reconcile|match|capture|scan|monitor|track|collect|aggregate|extract|generate|issue|provision|release|convert|receive|tender|trigger|check|validate|screen|cleanse|refresh|roll up|schedule payments|sequence orders|apply incoming|run (baseline|ai-assisted|depreciation|vulnerability|the automated|network)|restore|isolate|freeze|execute a canary|roll back|retest|set up test|score and route|enable the supplier|create and validate|apply distributed|process (checkout|payment runs|recurring)|deploy models|provision)\b/i, "auto", "A transaction or check with one right answer. It can be re-run and compared with the record."],
  [/\b(automated|automatically|auto-|system applies|ocr|via (e-invoicing|edi)|edi\/portal|three-way|two-way|matching|reconcil\w*|tolerance|routing rules|infrastructure-as-code|ci\/cd|ci pipeline|scanning|regression|smoke test|test cases|test suites?|depreciation|atp\/ctp|safety stock|reorder points|daily cash positioning|bank deposit|payslips|time capture)\b/i, "auto", "Rule-based work with a result that can be checked against the record."],
  // 8. ongoing operational work
  [/^(manage|maintain|administer|coordinate|operate|conduct|execute|perform|process|run|facilitate|support|govern|apply|establish|set|align|cascade|communicate|train|deliver|provide|enforce|embed|stand up|drive|resolve|respond|place|select|assign|allocate|determine|translate|incorporate|qualify|secure|obtain|activate|create|enable|deploy|detect|traffic|groom|tender|sequence|consolidate|prioritize|score|classify|report|source|accept|reproduce|write|present)\b/i, "assist", "Ongoing work with judgment calls along the way. An agent handles the routine and a person confirms."],
];
const DEFAULT_CALL: ZoneCall = { zone: "assist", why: "Nothing in the wording names a check against a record, so a person confirms the result." };

function classify(s: string): ZoneCall {
  for (const [re, zone, why] of RULES) if (re.test(s)) return { zone, why };
  return DEFAULT_CALL;
}

/** Sort one step. Pass the task name for structural steps whose zone depends on the work they check. */
export function zoneOf(step: string, task?: string): ZoneCall {
  const s = step.trim();
  for (const [re, zone, why] of STRUCTURAL) if (re.test(s)) return { zone, why };
  if (T_VALIDATE.test(s) || T_CROSS.test(s) || T_OWNER.test(s)) {
    const core = task ? classify(task).zone : "assist";
    if (T_OWNER.test(s)) return core === "human"
      ? { zone: "human", why: "The accountable owner reviews work that is theirs to answer for. Agents prepare the pack." }
      : { zone: "assist", why: "An agent prepares the review pack. The process owner confirms." };
    if (core === "auto") return T_VALIDATE.test(s)
      ? { zone: "auto", why: "Rule-based output tested against a defined checklist. Each pass or fail is logged." }
      : { zone: "auto", why: "A comparison with policy limits and prior periods that can be re-run." };
    return T_VALIDATE.test(s)
      ? { zone: "assist", why: "The checklist is fixed, but the work it checks needs judgment. An agent pre-checks and a person confirms." }
      : { zone: "assist", why: "An agent compares the result with policy and prior periods. A person judges the differences." };
  }
  return classify(s);
}

/** Zone every step of a task (keeps the task context for its structural checks). */
export const zoneTask = (t: Task): ZoneCall[] => t.steps.map((s) => zoneOf(s, t.name));

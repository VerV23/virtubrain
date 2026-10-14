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

const cache: Record<string, Promise<unknown>> = {};
function load<T>(name: string): Promise<T> {
  return (cache[name] ||= fetch(`/data/${name}.json`, { headers: { Accept: "application/json" } }).then((r) => {
    if (!r.ok) throw new Error(`Could not load ${name} (HTTP ${r.status})`);
    return r.json();
  }).catch((e) => { delete cache[name]; throw e; })) as Promise<T>;
}
export const loadTaxonomy = () => load<Taxonomy>("master-taxonomy");
export const loadPain = () => load<PainLibrary>("pain-points");

export interface ProcRef { fn: Fn; group: Group; proc: Process; hay: string; stepCount: number }
export function indexTaxonomy(T: Taxonomy) {
  const list: ProcRef[] = []; const byId = new Map<string, ProcRef>();
  for (const fn of T.functions) for (const group of fn.processGroups) for (const proc of group.processes) {
    const stepCount = proc.activities.reduce((n, a) => n + a.tasks.reduce((m, t) => m + t.steps.length, 0), 0);
    const hay = [proc.id, proc.name, proc.description, fn.functionName, group.groupName, ...proc.activities.flatMap((a) => [a.name, ...a.tasks.map((t) => t.name)])].join(" ").toLowerCase();
    const ref = { fn, group, proc, hay, stepCount }; list.push(ref); byId.set(proc.id, ref);
  }
  return { list, byId };
}

/* ---- Zoning: a transparent first-pass sort of each step into who should run it -------------
   auto   = the output can be checked against a record, so an agent can run it and log the check
   assist = the output needs judgment to confirm, so an agent drafts and a person approves
   human  = accountability cannot be delegated, so people decide and agents prepare
   This is a heuristic on the step's wording, shown to users as a starting point, never a diagnosis. */
export type Zone = "auto" | "assist" | "human";
export const ZONES: Record<Zone, { label: string; rule: string }> = {
  auto: { label: "Auto", rule: "Output can be checked against a record. An agent runs it and the check is logged." },
  assist: { label: "Assist", rule: "Output needs judgment to confirm. An agent drafts and a person approves." },
  human: { label: "Human", rule: "Accountability can't be delegated. People decide and agents prepare." },
};
const RULES: [RegExp, Zone, string][] = [
  [/\b(approv|sign-?off|sign off|ratif|certif|negotiat|authori[sz]|select (the )?(supplier|vendor|winning)|decid|escalat|terminate|hire|dismiss)/i, "human", "Approval, negotiation or a decision someone must own"],
  [/^(is|are|do|does|has|have)\b.*\?$/i, "human", "A decision point: someone answers for the outcome"],
  [/^(log|record|post|hand off|notify|validate|cross-check|reconcile|match|receive the trigger|route|archive|sync|calculate|generate|extract|monitor|track|collect)/i, "auto", "Checkable against a system of record"],
  [/\b(automated|automatic|system-generated|real-time|matching|reconciliation|three-way|duplicate)/i, "auto", "Rule-based work with a verifiable result"],
  [/^(review|assess|analy[sz]|draft|prepare|document|investigate|evaluate|design|develop|plan|forecast|recommend|summari[sz]|compile|identify|conduct|coordinate|configure|build|define|perform|manage|execute|run|process|maintain|administer|set|establish|consolidate|prioriti[sz]e)/i, "assist", "Needs judgment to confirm: an agent drafts, a person approves"],
];
export function zoneOf(step: string): { zone: Zone; why: string } {
  for (const [re, zone, why] of RULES) if (re.test(step.trim())) return { zone, why };
  return { zone: "assist", why: "No clear check against a record, so a person confirms it" };
}

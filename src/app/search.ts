/* Search across all 142 processes (names, ids, descriptions, activities, tasks) and the pain-point library.
   - Every query word must match somewhere. Words of three letters or fewer match the start of a word only
     ("ap" finds "AP", never "capital"); longer words may match inside words ("reconcil" finds "reconciliations").
   - Buyers' shorthand expands: AP, AR, P2P, O2C, R2R, month-end, helpdesk, complaints and so on.
   - Ranking favours the id and name, then group and function, then description, activities and tasks.
   - With no result, each word is corrected to the nearest word in the library (one or two typos) and the
     list says "Showing results for ...". */
import type { ProcRef } from "../lib/data";

export const SYNONYMS: Record<string, string[]> = {
  ap: ["accounts payable", "supplier invoice", "invoice matching", "payment runs"],
  ar: ["accounts receivable", "collections", "cash application"],
  p2p: ["procure-to-pay", "procure to pay", "purchase order", "invoice matching"],
  o2c: ["order to cash", "order-to-cash", "billing", "collections"],
  r2r: ["record to report", "general ledger", "period-end"],
  gl: ["general ledger"],
  "month-end": ["period-end", "close"], monthend: ["period-end", "close"], "year-end": ["period-end", "close"], "quarter-end": ["period-end", "close"],
  close: ["period-end"],
  complaints: ["inquiries", "customer service", "grievance", "feedback"], complaint: ["inquiries", "customer service", "grievance", "feedback"],
  helpdesk: ["help desk", "service desk", "helpdesk", "self-service", "inquiries"], servicedesk: ["service desk", "help desk"],
  payroll: ["payroll", "pay run"], salary: ["pay", "compensation", "payroll"], pay: ["payroll", "compensation"],
  hr: ["human capital", "employee", "hris"], hcm: ["human capital"],
  "fp&a": ["planning", "budget", "forecast"], fpa: ["planning", "budget", "forecast"],
  "t&e": ["expense", "travel"], expenses: ["expense"],
  hiring: ["hire", "recruit", "requisition", "candidate"], recruiting: ["recruit", "hire", "requisition", "applications"], recruitment: ["recruit", "hire", "requisition"],
  onboarding: ["onboard"], offboarding: ["separation", "exit", "termination"],
  vendor: ["supplier"], vendors: ["supplier"], suppliers: ["supplier", "vendor"],
  invoices: ["invoice"], billing: ["invoice", "billing"],
  recon: ["reconcil"], reconciliation: ["reconcil"], reconciliations: ["reconcil"],
  vat: ["vat", "indirect tax"], gst: ["gst", "indirect tax"],
  cyber: ["cybersecurity", "security"], security: ["cybersecurity", "security"],
  inventory: ["inventory", "stock"], stock: ["inventory"], warehouse: ["warehouse", "warehousing"],
  purchasing: ["purchase", "procure"], sourcing: ["sourcing", "supplier selection"],
  esg: ["sustainability", "environmental", "esg"], crm: ["customer relationship", "pipeline", "crm"],
  returns: ["return", "reverse logistics"], kyc: ["kyc", "know your customer"], sox: ["sox", "control testing", "icfr"],
  treasury: ["cash", "treasury", "liquidity"], cash: ["cash", "treasury"], tax: ["tax"],
  contact: ["contact center", "customer service"], callcenter: ["contact center"], "call-center": ["contact center"],
};

export interface Query { terms: string[]; alts: string[][]; hl: string[] }
const WORD = /[a-z0-9&-]+/g;
export const termsOf = (q: string) => q.toLowerCase().replace(/[“”"'’]/g, " ").split(/\s+/).map((t) => t.replace(/^[^\w&]+|[^\w&]+$/g, "")).filter(Boolean).slice(0, 8);
export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function compile(q: string): Query {
  const terms = termsOf(q);
  const alts = terms.map((t) => [t, ...(SYNONYMS[t] || [])]);
  // highlight sources: short words as word starts, synonyms as whole phrases
  const hl = [...new Set(alts.flatMap((a) => a.map((x, i) => (x.length <= 3 ? `\\b${esc(x)}${i === 0 && SYNONYMS[x] ? "\\b" : ""}` : esc(x)))))];
  return { terms, alts, hl };
}
const reCache = new Map<string, RegExp>();
function test(hay: string, alt: string, isAcronym: boolean) {
  if (alt.length > 3) return hay.includes(alt);
  const key = (isAcronym ? "w:" : "p:") + alt;
  let re = reCache.get(key);
  if (!re) { re = new RegExp(`\\b${esc(alt)}${isAcronym ? "\\b" : ""}`); reCache.set(key, re); }
  return re.test(hay);
}
/** Does this text match every word of the query (or its shorthand)? */
export function matches(hay: string, Q: Query) {
  return Q.alts.every((a) => a.some((x, i) => test(hay, x, i === 0 && !!SYNONYMS[x])));
}

export interface Hit { ref: ProcRef; score: number; context?: { label: string; text: string } }
export interface Result { hits: Hit[]; Q: Query; corrected?: string }

const fieldCache = new WeakMap<ProcRef, { name: string; id: string; grp: string; desc: string }>();
const fields = (r: ProcRef) => {
  let f = fieldCache.get(r);
  if (!f) { f = { name: r.proc.name.toLowerCase(), id: r.proc.id.toLowerCase(), grp: `${r.group.groupName} ${r.fn.functionName}`.toLowerCase(), desc: r.proc.description.toLowerCase() }; fieldCache.set(r, f); }
  return f;
};

function run(list: ProcRef[], Q: Query): Hit[] {
  if (!Q.terms.length) return [];
  const out: Hit[] = []; const phrase = Q.terms.join(" ");
  for (const ref of list) {
    if (!matches(ref.hay, Q)) continue;
    const f = fields(ref); let score = 0;
    Q.alts.forEach((a) => {
      const t = a[0]; let best = 0;
      a.forEach((x, i) => {
        const w = i === 0 ? 1 : 0.8; const acr = i === 0 && !!SYNONYMS[x];
        let s = 0;
        if (f.id === x) s = 20; else if (f.id.startsWith(x) && /\d/.test(x)) s = 12;
        if (test(f.name, x, acr)) s = Math.max(s, new RegExp(`\\b${esc(x)}`).test(f.name) ? 7 : 5);
        if (test(f.grp, x, acr)) s = Math.max(s, 2.5);
        if (test(f.desc, x, acr)) s = Math.max(s, 1.6);
        if (!s) s = 0.8; // matched somewhere in activities or tasks
        best = Math.max(best, s * w);
      });
      score += best + (t.length > 3 ? 0.2 : 0);
    });
    if (Q.terms.length > 1 && f.name.includes(phrase)) score += 10;
    if (ref.flagship) score += 0.6;
    const nameHas = (x: string, i: number) => test(f.name, x, i === 0 && !!SYNONYMS[x]) || f.id.includes(x);
    const missing = Q.alts.filter((a) => !a.some(nameHas));
    out.push({ ref, score, context: missing.length ? contextFor(ref, missing) : undefined });
  }
  return out.sort((a, b) => b.score - a.score || a.ref.proc.id.localeCompare(b.ref.proc.id, "en", { numeric: true }));
}

function contextFor(ref: ProcRef, alts: string[][]): Hit["context"] {
  const fieldsList: { label: string; text: string }[] = [];
  for (const a of ref.proc.activities) {
    fieldsList.push({ label: `Activity ${a.id}`, text: a.name });
    for (const t of a.tasks) fieldsList.push({ label: `Task ${t.id}`, text: t.name });
  }
  fieldsList.push({ label: "Description", text: ref.proc.description });
  fieldsList.push({ label: ref.group.groupId, text: ref.group.groupName });
  let best: Hit["context"]; let bestN = 0;
  for (const f of fieldsList) {
    const low = f.text.toLowerCase(); const n = alts.filter((a) => a.some((x, i) => test(low, x, i === 0 && !!SYNONYMS[x]))).length;
    if (n > bestN) { best = f.label === "Description" ? { label: f.label, text: excerpt(f.text, alts.flat()) } : f; bestN = n; if (n === alts.length) break; }
  }
  return best;
}
function excerpt(text: string, terms: string[]) {
  const low = text.toLowerCase(); const at = Math.min(...terms.map((t) => low.indexOf(t)).filter((i) => i >= 0));
  if (!isFinite(at) || at < 60) return text.length > 150 ? text.slice(0, 148).trimEnd() + "…" : text;
  const start = text.lastIndexOf(" ", at - 40);
  const s = "…" + text.slice(start + 1, start + 150).trimEnd();
  return start + 150 < text.length ? s + "…" : s;
}

/* ---- typo fallback ------------------------------------------------------------------------------ */
const vocabCache = new WeakMap<object, Map<string, number>>();
function vocab(list: ProcRef[]) {
  let v = vocabCache.get(list);
  if (!v) { v = new Map(); for (const r of list) for (const w of r.hay.match(WORD) || []) if (w.length >= 4) v.set(w, (v.get(w) || 0) + 1); vocabCache.set(list, v); }
  return v;
}
/** Optimal string alignment distance, stopping early once it exceeds max. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}
export function correct(word: string, v: Map<string, number>): string | null {
  if (word.length < 4 || v.has(word) || SYNONYMS[word]) return null;
  const max = word.length >= 7 ? 2 : 1; let best: string | null = null, bestD = max + 1, bestN = 0;
  for (const [w, n] of v) {
    const dist = editDistance(word, w, max);
    if (dist < bestD || (dist === bestD && n > bestN)) { best = w; bestD = dist; bestN = n; }
  }
  return bestD <= max ? best : null;
}

export function searchProcs(list: ProcRef[], q: string): Result {
  const Q = compile(q); const hits = run(list, Q);
  if (hits.length || !Q.terms.length) return { hits, Q };
  const v = vocab(list); let changed = false;
  const fixed = Q.terms.map((t) => { const c = correct(t, v); if (c) { changed = true; return c; } return t; });
  if (!changed) return { hits, Q };
  const Q2 = compile(fixed.join(" ")); const hits2 = run(list, Q2);
  return hits2.length ? { hits: hits2, Q: Q2, corrected: fixed.join(" ") } : { hits, Q };
}

/** Split text into plain and matched parts for highlighting (sources are regex fragments from compile()). */
export function splitMatches(text: string, hl: string[]): { t: string; m: boolean }[] {
  if (!hl.length) return [{ t: text, m: false }];
  const alt = [...hl].sort((a, b) => b.length - a.length).join("|");
  const split = new RegExp(`(${alt})`, "gi"); const whole = new RegExp(`^(?:${alt})$`, "i");
  return text.split(split).filter(Boolean).map((t) => ({ t, m: whole.test(t) }));
}

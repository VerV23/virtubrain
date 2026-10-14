/* Process search across all 142 processes: names, ids, descriptions, activities and tasks.
   Every term must appear somewhere; the score favours hits in the id and name. When the name alone
   doesn't explain the match, the hit carries the field that does, so the list can show it. */
import type { ProcRef } from "../lib/data";

export const termsOf = (q: string) => q.toLowerCase().replace(/[“”"']/g, " ").split(/\s+/).filter((t) => t.length > 0).slice(0, 8);

export interface Hit { ref: ProcRef; score: number; context?: { label: string; text: string } }

export function searchProcs(list: ProcRef[], q: string): Hit[] {
  const terms = termsOf(q); if (!terms.length) return [];
  const out: Hit[] = [];
  for (const ref of list) {
    if (!terms.every((t) => ref.hay.includes(t))) continue;
    const name = ref.proc.name.toLowerCase(); const id = ref.proc.id.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (id === t) score += 20; else if (id.startsWith(t)) score += 10;
      if (name.includes(t)) score += new RegExp(`\\b${esc(t)}`).test(name) ? 6 : 4;
      if (ref.group.groupName.toLowerCase().includes(t) || ref.fn.functionName.toLowerCase().includes(t)) score += 2;
      if (ref.proc.description.toLowerCase().includes(t)) score += 1.5;
    }
    if (ref.flagship) score += 0.5;
    const missing = terms.filter((t) => !name.includes(t) && !id.includes(t));
    out.push({ ref, score, context: missing.length ? contextFor(ref, missing) : undefined });
  }
  return out.sort((a, b) => b.score - a.score);
}

function contextFor(ref: ProcRef, terms: string[]): Hit["context"] {
  const fields: { label: string; text: string }[] = [];
  for (const a of ref.proc.activities) {
    fields.push({ label: `Activity ${a.id}`, text: a.name });
    for (const t of a.tasks) fields.push({ label: `Task ${t.id}`, text: t.name });
  }
  fields.push({ label: "Description", text: ref.proc.description });
  fields.push({ label: ref.group.groupId, text: ref.group.groupName });
  let best: Hit["context"]; let bestN = 0;
  for (const f of fields) {
    const low = f.text.toLowerCase(); const n = terms.filter((t) => low.includes(t)).length;
    if (n > bestN) { best = f.label === "Description" ? { label: f.label, text: excerpt(f.text, terms) } : f; bestN = n; if (n === terms.length) break; }
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

export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Split text into plain and matched parts for highlighting. */
export function splitMatches(text: string, terms: string[]): { t: string; m: boolean }[] {
  if (!terms.length) return [{ t: text, m: false }];
  const alt = terms.map(esc).sort((a, b) => b.length - a.length).join("|");
  const split = new RegExp(`(${alt})`, "gi"); const whole = new RegExp(`^(?:${alt})$`, "i");
  return text.split(split).filter(Boolean).map((t) => ({ t, m: whole.test(t) }));
}

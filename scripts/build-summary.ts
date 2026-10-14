/* Build-time data digests, so marketing pages never download the 1 MB taxonomy.
   Runs automatically before `npm run build` (prebuild) and can be run alone: npx tsx scripts/build-summary.ts
   Outputs (both small, both regenerated from public/data on every build):
   - public/data/process-index.json  { v: 1, processes: [{ fn, fnName, id, name }] }   used by /contact/ to name ?process=
   - public/data/summary.json        digest for the home page (extend as the home page needs; keep it under ~40 KB) */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { indexTaxonomy, type Taxonomy, type PainLibrary } from "../src/lib/data.ts";

const ROOT = resolve(import.meta.dirname, "..");
const T: Taxonomy = JSON.parse(readFileSync(resolve(ROOT, "public/data/master-taxonomy.json"), "utf8"));
const P: PainLibrary = JSON.parse(readFileSync(resolve(ROOT, "public/data/pain-points.json"), "utf8"));
const idx = indexTaxonomy(T);

const processes = idx.list.map((r) => ({ fn: r.fn.functionId, fnName: r.fn.functionName, id: r.proc.id, name: r.proc.name }));
writeFileSync(resolve(ROOT, "public/data/process-index.json"), JSON.stringify({ v: 1, processes }));

const summary = {
  v: 1,
  stats: T.meta.stats,
  pain: { total: P.painPoints.length, bySeverity: P.meta.bySeverity, byCategory: P.meta.byCategory },
  functions: T.functions.map((f) => ({ id: f.functionId, name: f.functionName, groups: f.processGroups.length,
    processes: f.processGroups.reduce((n, g) => n + g.processes.length, 0) })),
  flagships: T.meta.flagshipProcesses,
};
writeFileSync(resolve(ROOT, "public/data/summary.json"), JSON.stringify(summary));
console.log(`process-index: ${processes.length} processes; summary: ${JSON.stringify(summary).length} bytes`);

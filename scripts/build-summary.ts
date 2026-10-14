/* Build-time data digests, so marketing pages never download the 1 MB taxonomy.
   Runs automatically before `npm run build` (prebuild) and can be run alone: npx tsx scripts/build-summary.ts
   Outputs (all regenerated from public/data on every build):
   - public/data/process-index.json  { v: 1, processes: [{ fn, fnName, id, name }] }   used by /contact/ to name ?process=
   - public/data/summary.json        digest for the home page (the only data the home page fetches; keep it under ~40 KB)
   - src/partials/gen-home-*.html    the home page's data-bound markup, rendered with the real numbers so the page paints
                                     complete and nothing changes when the digest loads. Do not edit by hand. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { indexTaxonomy, zoneOf, humanizeTitle, humanizeStep, CATEGORY_LABELS, INDUSTRIES, COUNTRIES, type Taxonomy, type PainLibrary, type PainPoint, type Process, type Fn, type Zone } from "../src/lib/data.ts";

const ROOT = resolve(import.meta.dirname, "..");
const T: Taxonomy = JSON.parse(readFileSync(resolve(ROOT, "public/data/master-taxonomy.json"), "utf8"));
const P: PainLibrary = JSON.parse(readFileSync(resolve(ROOT, "public/data/pain-points.json"), "utf8"));
const idx = indexTaxonomy(T);

const processes = idx.list.map((r) => ({ fn: r.fn.functionId, fnName: r.fn.functionName, id: r.proc.id, name: r.proc.name }));
writeFileSync(resolve(ROOT, "public/data/process-index.json"), JSON.stringify({ v: 1, processes }));

/* ------------------------------------------------------------------------------------------------
   Home page digest
   ------------------------------------------------------------------------------------------------ */
const SEV = ["High", "Medium", "Low"] as const;
const sevRank = (s: string) => SEV.indexOf(s as (typeof SEV)[number]);
const find = (fnId: string, id: string): { fn: Fn; proc: Process; group: string; groupName: string } => {
  const fn = T.functions.find((f) => f.functionId === fnId)!;
  for (const g of fn.processGroups) for (const p of g.processes) if (p.id === id) return { fn, proc: p, group: g.groupId, groupName: g.groupName };
  throw new Error(`process not found: ${fnId} ${id}`);
};
const stepsOf = (p: Process) => p.activities.reduce((n, a) => n + a.tasks.reduce((m, t) => m + t.steps.length, 0), 0);

// notes: every process carries one note per industry and per country
let industryNotes = 0, countryNotes = 0;
for (const r of idx.list) {
  industryNotes += Object.values(r.proc.calibration.industry).filter((s) => s && s.trim()).length;
  countryNotes += Object.values(r.proc.calibration.country).filter((s) => s && s.trim()).length;
}

// functions, in taxonomy order
const flag = new Map<string, { id: string; name: string }>();
for (const f of T.meta.flagshipProcesses) if (!flag.has(f.functionId)) flag.set(f.functionId, { id: f.processId, name: f.name });
const functions = T.functions.map((f) => {
  const procs = f.processGroups.flatMap((g) => g.processes);
  const pains = P.painPoints.filter((p) => p.functionId === f.functionId);
  return {
    id: f.functionId, name: f.functionName, groups: f.processGroups.length, processes: procs.length,
    steps: procs.reduce((n, p) => n + stepsOf(p), 0),
    groupNames: f.processGroups.map((g) => g.groupName),
    flagship: flag.get(f.functionId) ?? null,
    pains: { total: pains.length, High: pains.filter((p) => p.severity === "High").length, Medium: pains.filter((p) => p.severity === "Medium").length, Low: pains.filter((p) => p.severity === "Low").length },
  };
});

// the calibration showcase: four flagship processes buyers recognise
const LENS = [["finance-accounting", "8.1.1", "Period-end close"], ["procurement", "7.1.2", "Invoice matching and payment"], ["human-capital-management", "6.4.2", "Payroll"], ["marketing-sales-cx", "9.1.1", "Customer service"]] as const;
const lens = LENS.map(([fnId, id, short]) => {
  const { fn, proc } = find(fnId, id);
  const c = proc.calibration;
  return { fn: fnId, fnName: fn.functionName, id, short, name: proc.name, description: proc.description, industry: c.industry, country: c.country, systems: c.systems, kpis: c.kpis };
});

// the zone map's live first-pass sort, with the same rules the app uses
const ZMAP = [["finance-accounting", "8.1.1"], ["procurement", "7.1.2"], ["marketing-sales-cx", "9.1.1"]] as const;
const zones = ZMAP.map(([fnId, id]) => {
  const { fn, proc } = find(fnId, id);
  const c: Record<Zone, number> = { auto: 0, assist: 0, human: 0 };
  for (const a of proc.activities) for (const t of a.tasks) for (const s of t.steps) c[zoneOf(s, t.name).zone]++;
  return { fn: fnId, fnName: fn.functionName, id, name: proc.name, ...c, total: c.auto + c.assist + c.human };
});

// the library card: a few records per category, most severe first, without impact estimates (home shows
// title, category, severity and the step path only). The featured record opens the card and ends the monolith film.
const FEATURED = "pp-supply-chain-operations-logistics-4-2-2-4-2-2-1-1-1";
const PER_CAT = 5;
type Rec = { id: string; fn: string; fnName: string; pid: string; pname: string; tid: string; tname: string; step: number; stepText: string; title: string; sev: string; cat: string };
const slim = (p: PainPoint): Rec => ({ id: p.id, fn: p.functionId, fnName: p.functionName, pid: p.processId, pname: p.processName, tid: p.taskId, tname: p.taskName,
  step: p.stepIndex, stepText: humanizeStep(p.stepText, p.taskName), title: humanizeTitle(p.title, p.taskName), sev: p.severity, cat: p.category });
const cats = Object.keys(CATEGORY_LABELS).sort((a, b) => (P.meta.byCategory[b] ?? 0) - (P.meta.byCategory[a] ?? 0));
const records: Record<string, Rec[]> = {};
for (const cat of cats) {
  // spread across functions: the most severe record from each function first, then the rest
  const all = P.painPoints.filter((p) => p.category === cat).sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
  const seen = new Set<string>(); const first: PainPoint[] = []; const rest: PainPoint[] = [];
  for (const p of all) (seen.has(p.functionId) ? rest : (seen.add(p.functionId), first)).push(p);
  let pick = [...first, ...rest].sort((a, b) => sevRank(a.severity) - sevRank(b.severity)).slice(0, PER_CAT);
  const feat = P.painPoints.find((p) => p.id === FEATURED)!;
  if (feat.category === cat) pick = [feat, ...pick.filter((p) => p.id !== FEATURED)].slice(0, PER_CAT);
  records[cat] = pick.map(slim);
}
const featured = slim(P.painPoints.find((p) => p.id === FEATURED)!);

const summary = {
  v: 2,
  stats: T.meta.stats,
  notes: { industry: industryNotes, country: countryNotes, flagships: T.meta.flagshipProcesses.length },
  pain: { total: P.painPoints.length, bySeverity: P.meta.bySeverity, byCategory: P.meta.byCategory },
  // groupNames only feed the generated gallery markup, so they stay out of the runtime digest
  functions: functions.map(({ groupNames: _g, ...f }) => f),
  flagships: T.meta.flagshipProcesses,
  home: { lens, zones, records, featured: FEATURED },
};
writeFileSync(resolve(ROOT, "public/data/summary.json"), JSON.stringify(summary));

/* ------------------------------------------------------------------------------------------------
   Generated home markup (src/partials/gen-home-*.html), included by index.html with <!-- @include ... -->
   ------------------------------------------------------------------------------------------------ */
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const n = (v: number) => v.toLocaleString("en-US");
const HEAD = "<!-- generated by scripts/build-summary.ts from public/data; do not edit -->\n";
const write = (name: string, html: string) => writeFileSync(resolve(ROOT, "src/partials", `gen-home-${name}.html`), HEAD + html.trim() + "\n");
const S = T.meta.stats;

// hero beat b: the thirteen functions, taxonomy order, with their process counts
write("fnlist", `<ol class="hb-fns" aria-label="The thirteen business functions and their processes">
${functions.map((f) => `  <li><span class="hb-fn">${esc(f.name)}</span><span class="hb-fn-n mono" aria-label="${f.processes} processes">${f.processes}</span></li>`).join("\n")}
</ol>`);

// bento: six levels
const LV: [string, string, number][] = [["L1", "Functions", S.functions], ["L2", "Process groups", S.groups], ["L3", "Processes", S.processes], ["L4", "Activities", S.activities], ["L5", "Tasks", S.tasks], ["L6", "Steps", S.steps]];
write("levels", `<ol class="lv-list">
${LV.map(([l, k, v], i) => `  <li style="--d:${i}"><span class="lv-k"><b class="mono">${l}</b>${k}</span><span class="lv-v num" data-count="${v}">${n(v)}</span></li>`).join("\n")}
</ol>`);

// calibrate: the default lens (8.1.1, retail, Philippines)
const L0 = lens[0];
write("lens", `<div class="out-head">
  <p class="mono out-code" data-o="code">${esc(L0.fnName)} · ${esc(L0.id)}</p>
  <h3 class="out-title" data-o="name">${esc(L0.name)}</h3>
  <p class="out-desc" data-o="desc">${esc(L0.description)}</p>
</div>
<div class="out-lens">
  <div class="out-block">
    <p class="out-k mono">Industry note · <span data-o="indName">${esc(INDUSTRIES.retail)}</span></p>
    <p class="out-v" data-o="ind">${esc(L0.industry.retail)}</p>
  </div>
  <div class="out-block">
    <p class="out-k mono">Country note · <span data-o="ctyName">${esc(COUNTRIES.PH)}</span></p>
    <p class="out-v" data-o="cty">${esc(L0.country.PH)}</p>
  </div>
</div>
<div class="out-meta">
  <div>
    <p class="out-k mono">Typical systems</p>
    <ul class="pills" data-o="systems">${L0.systems.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
  </div>
  <div>
    <p class="out-k mono">KPIs</p>
    <ul class="kpis" data-o="kpis">${L0.kpis.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
  </div>
</div>`);

// down to the step: the ladder ends on the featured record
const F = find(featured.fn, featured.pid);
const act = F.proc.activities.find((a) => featured.tid.startsWith(a.id + "."))!;
const fullStep = F.proc.activities.flatMap((a) => a.tasks).find((t) => t.id === featured.tid)!;
write("ladder", `<ol class="ladder" aria-label="Example path, level by level">
  <li data-at="0.02"><span class="mono">L1</span><span>${esc(F.fn.functionName)}</span></li>
  <li data-at="0.2"><span class="mono">L2</span><span><b class="mono">${esc(F.group)}</b> ${esc(F.groupName)}</span></li>
  <li data-at="0.26"><span class="mono">L3</span><span><b class="mono">${esc(F.proc.id)}</b> ${esc(F.proc.name)}</span></li>
  <li data-at="0.5"><span class="mono">L4</span><span><b class="mono">${esc(act.id)}</b> ${esc(act.name)}</span></li>
  <li data-at="0.57"><span class="mono">L5</span><span><b class="mono">${esc(fullStep.id)}</b> ${esc(fullStep.name)}</span></li>
  <li data-at="0.72"><span class="mono">L6</span><span><b class="mono">Step ${featured.step + 1} of ${fullStep.steps.length}</b> ${esc(featured.stepText)}</span></li>
  <li data-at="0.9" class="ladder-fault sev-${featured.sev}"><span class="mono" aria-hidden="true">!</span><span><b class="mono">${featured.sev}</b> ${esc(CATEGORY_LABELS[featured.cat])}. <i>Illustrative</i></span></li>
</ol>`);

// library: category list with live counts, and the featured record
const catLabel = (c: string) => CATEGORY_LABELS[c] ?? c;
const maxCat = Math.max(...cats.map((c) => P.meta.byCategory[c] ?? 0));
write("cats", `<div class="cats" role="group" aria-labelledby="lib-cats-l" data-cats style="--max:${maxCat}">
${cats.map((c) => `  <button type="button" class="cat" aria-pressed="${c === featured.cat}" data-cat="${c}" style="--n:${P.meta.byCategory[c]}"><span class="cat-k">${esc(catLabel(c))}</span><span class="cat-n num">${P.meta.byCategory[c]}</span><i></i></button>`).join("\n")}
</div>`);
const recBody = (r: Rec) => `<h3 class="rec-title" data-r="title">${esc(r.title)}</h3>
            <ol class="rec-path" data-r="path">
              <li><span class="mono">Function</span><span>${esc(r.fnName)}</span></li>
              <li><span class="mono">Process</span><span><b class="mono">${esc(r.pid)}</b> ${esc(r.pname)}</span></li>
              <li><span class="mono">Task</span><span><b class="mono">${esc(r.tid)}</b> ${esc(r.tname)}</span></li>
              <li class="rec-step sev-${r.sev}"><span class="mono">Step ${r.step + 1}</span><span>${esc(r.stepText)}</span></li>
            </ol>`;
const featIdx = records[featured.cat].findIndex((r) => r.id === featured.id);
write("record", `<div class="rec-top">
            <p class="rec-tags"><span class="sevtag sev-${featured.sev}" data-r="sevtag"><span class="dot"></span><span data-r="sev">${featured.sev}</span></span><span class="rec-cat" data-r="cat">${esc(catLabel(featured.cat))}</span><span class="ill-chip">Illustrative</span></p>
            <div class="rec-nav">
              <span class="rec-count mono" data-r="count">${featIdx + 1} of ${records[featured.cat].length} shown</span>
              <button type="button" class="paddle paddle-sm" data-r-prev aria-label="Previous record"><span class="chev chev-l"></span></button>
              <button type="button" class="paddle paddle-sm" data-r-next aria-label="Next record"><span class="chev"></span></button>
            </div>
          </div>
          <div class="rec-body" data-r="body">
            ${recBody(featured)}
          </div>
          <div class="rec-foot">
            <a class="link-more" data-r="link" href="/app/#view=explore&amp;fn=${featured.fn}&amp;p=${encodeURIComponent(featured.pid)}&amp;s=${encodeURIComponent(`${featured.tid}.${featured.step + 1}`)}">Open this step in the app</a>
            <a class="link-more" href="/app/#view=pain">All ${P.painPoints.length} records</a>
          </div>`);

// zone map: the live first-pass sort for the first tab
const Z0 = zones[0];
write("zsort", `<div class="zsort-head">
            <p class="zsort-t">First-pass sort of the real steps in <span data-zs="fn">${esc(Z0.fnName)}</span> <b class="mono" data-zs="id">${esc(Z0.id)}</b> <span data-zs="name">${esc(Z0.name)}</span></p>
            <a class="btn btn-sm" data-zs="link" href="/app/#view=xray&amp;fn=${Z0.fn}&amp;p=${encodeURIComponent(Z0.id)}">X-ray this process</a>
          </div>
          <div class="zbar" data-zs="bar" role="img" aria-label="${Z0.auto} auto, ${Z0.assist} assist and ${Z0.human} human steps out of ${Z0.total}">
            <i class="z-auto" style="--n:${Z0.auto}"><b class="num">${Z0.auto}</b></i><i class="z-assist" style="--n:${Z0.assist}"><b class="num">${Z0.assist}</b></i><i class="z-human" style="--n:${Z0.human}"><b class="num">${Z0.human}</b></i>
          </div>
          <p class="zkey zsort-key" data-zs="key" aria-hidden="true"><span class="z-auto"><span class="dot"></span>Auto ${Z0.auto}</span><span class="z-assist"><span class="dot"></span>Assist ${Z0.assist}</span><span class="z-human"><span class="dot"></span>Human ${Z0.human}</span><span class="zsort-total">of ${Z0.total} steps</span></p>`);

// thirteen functions gallery, taxonomy order
write("gallery", functions.map((f) => {
  const groups = f.groupNames.slice(0, 3).map(esc).join(" · ") + (f.groupNames.length > 3 ? ` · and ${f.groupNames.length - 3} more` : "");
  return `<li class="fn-item"><a class="fn-card" href="/app/#view=explore&amp;fn=${f.id}" data-fn="${f.id}">
          <span class="fn-top"><span class="fn-ico" style="--ico:url(/media/icons/${f.id}.webp)" aria-hidden="true"></span><span class="fn-procs mono"><b>${f.processes}</b> processes</span></span>
          <span class="fn-name">${esc(f.name)}</span>
          <span class="fn-groups">${groups}</span>
          <span class="fn-flag">${f.flagship ? `<span class="fn-flag-k mono">Flagship</span><span>${esc(f.flagship.name)}</span>` : `<span class="fn-flag-k mono">Groups</span><span>${f.groups} process groups</span>`}</span>
          <span class="fn-stats"><span><b class="num">${n(f.steps)}</b> steps</span><span><b class="num">${f.groups}</b> groups</span></span>
          <span class="fn-sev" aria-label="${f.pains.total} illustrative failure points: ${f.pains.High} high, ${f.pains.Medium} medium, ${f.pains.Low} low">
            <span class="fn-sev-k"><span class="mono">${f.pains.total} failure points</span><span class="ill-chip">Illustrative</span></span>
            <span class="fn-sev-bar" aria-hidden="true"><i class="sev-High" style="--n:${f.pains.High}"></i><i class="sev-Medium" style="--n:${f.pains.Medium}"></i><i class="sev-Low" style="--n:${f.pains.Low}"></i></span>
          </span>
          <span class="fn-go">Open in the app</span>
        </a></li>`;
}).join("\n        "));

const size = JSON.stringify(summary).length;
console.log(`process-index: ${processes.length} processes; summary: ${size} bytes; notes ${industryNotes}/${countryNotes}; home partials written`);
if (size > 48_000) console.warn("summary.json is getting large; trim records per category");

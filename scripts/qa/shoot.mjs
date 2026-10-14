// QA harness: build-free screenshot + audit run against a running server (vite preview or dev).
// Usage: node scripts/qa/shoot.mjs [outDir=qa-output/latest] [baseUrl=http://127.0.0.1:4173] [--pages=/,/app/]
// Produces for each page and viewport: viewport screenshots at a series of scroll positions (so scroll-driven
// film scenes can be judged frame by frame), one full-page screenshot, and report.json with console errors,
// failed requests, horizontal overflow, axe (WCAG 2.2 AA serious/critical) violations and timing.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const OUT = args[0] || "qa-output/latest";
const BASE = (args[1] || "http://127.0.0.1:4173").replace(/\/$/, "");
const PAGES = (flags.pages || "/,/app/,/enterprise/,/business/,/verantis/,/contact/,/404.html").split(",");
const VIEWPORTS = (flags.viewports || "desk:1440x900,mob:390x844").split(",").map((v) => { const [n, s] = v.split(":"); const [w, h] = s.split("x").map(Number); return { n, w, h }; });
const STOPS = Number(flags.stops || 14);
const AXE = readFileSync(new URL("../../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const report = [];
for (const vp of VIEWPORTS) {
  for (const path of PAGES) {
    const slug = (path.replace(/[\/.]+/g, "-").replace(/^-|-$/g, "") || "home");
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.n === "mob" ? 2 : 1 });
    const page = await ctx.newPage();
    const errors = [], failed = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("requestfailed", (r) => failed.push(r.url() + " " + (r.failure()?.errorText || "")));
    page.on("response", (r) => r.status() >= 400 && failed.push(r.status() + " " + r.url()));
    const t0 = Date.now();
    await page.goto(BASE + path, { waitUntil: "networkidle" }).catch((e) => errors.push("goto " + e));
    const loadMs = Date.now() - t0;
    await page.waitForTimeout(600);
    const H = await page.evaluate(() => document.documentElement.scrollHeight);
    const shots = [];
    for (let k = 0; k < STOPS; k++) {
      const y = Math.round(((H - vp.h) * k) / Math.max(1, STOPS - 1));
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.waitForTimeout(450);
      const f = `${vp.n}-${slug}-${String(k).padStart(2, "0")}.jpg`;
      await page.screenshot({ path: join(OUT, f), type: "jpeg", quality: 72 });
      shots.push({ file: f, y });
    }
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
    const full = `${vp.n}-${slug}-full.jpg`;
    await page.screenshot({ path: join(OUT, full), type: "jpeg", quality: 60, fullPage: true }).catch(() => {});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await page.addScriptTag({ content: AXE });
    const axe = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } });
      return r.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    }).catch((e) => ["axe failed " + e]);
    report.push({ viewport: vp.n, path, loadMs, height: H, overflow, errors, failed: [...new Set(failed)], axe, shots: shots.map((s) => s.file), full });
    console.log(`${vp.n} ${path}: ${loadMs}ms h=${H} overflow=${overflow} errors=${errors.length} failed=${failed.length} axe=${axe.length}`);
    await ctx.close();
  }
}
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 1));
await browser.close();

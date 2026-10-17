import "../styles/base.css";
import "../styles/components.css";
import "../styles/pages.css";
import { boot } from "../lib/site";
import { initInner } from "../lib/ui";

boot();
initInner();

/* Essay 03 figure: where the close work lands in a month, batch versus continuous.
   An illustration of the argument (no client data): the same reconciliation and matching work
   either piles up after period end or is spread across the month, leaving the close days for
   judgment, explanation and sign-off. Heights are percentages of the chart. */
const DAYS = 22, CLOSE = 5;
const MODES = {
  batch: {
    chk: [...Array(DAYS).fill(0).map((_, i) => 4 + (i % 5 === 2 ? 2 : 0)), 64, 78, 72, 52, 26],
    jdg: [...Array(DAYS).fill(0), 10, 16, 22, 30, 40],
    say: "Month-end batch. Reconciliation and matching pile up after the period ends, on top of the judgment and sign-off the controller owns.",
  },
  continuous: {
    chk: [...Array(DAYS).fill(0).map((_, i) => 15 + ((i * 7) % 5)), 10, 6, 0, 0, 0],
    jdg: [...Array(DAYS).fill(0), 22, 30, 34, 30, 22],
    say: "Continuous close. Agents reconcile and match every day with evidence attached, so the close days are left for judgment, explanation and sign-off.",
  },
} as const;
type Mode = keyof typeof MODES;

const fig = document.querySelector<HTMLElement>(".essay-fig.cc");
const bars = fig?.querySelector<HTMLElement>("[data-cc]");
const say = fig?.querySelector<HTMLElement>(".cc-say");
if (fig && bars && say) {
  bars.style.setProperty("--n", String(DAYS + CLOSE));
  const cells = Array.from({ length: DAYS + CLOSE }, (_, i) => {
    const col = document.createElement("div");
    col.className = "cc-bar" + (i >= DAYS ? " close-day" : "");
    const chk = document.createElement("i"); chk.className = "chk";
    const jdg = document.createElement("i"); jdg.className = "jdg";
    chk.style.setProperty("--d", String(i)); jdg.style.setProperty("--d", String(i));
    col.append(chk, jdg);
    bars.append(col);
    return { chk, jdg };
  });
  const draw = (m: Mode) => {
    const d = MODES[m];
    cells.forEach((c, i) => { c.chk.style.setProperty("--h", String(d.chk[i])); c.jdg.style.setProperty("--h", String(d.jdg[i])); });
    say.textContent = d.say;
  };
  draw("batch");
  fig.addEventListener("tabs:change", (e) => {
    const id = (e as CustomEvent<{ id: string }>).detail.id as Mode;
    if (id in MODES) draw(id);
  });
}

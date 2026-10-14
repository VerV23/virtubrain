/* Small controls: a radio segmented control with roving focus, and the industry/country lens. */
import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";
import { INDUSTRIES, COUNTRIES, type Industry, type Country } from "../lib/data";
import { route, go } from "./state";
import { Icon } from "./ui";

export function Seg<T extends string>({ label, value, options, onChange, class: cls = "", size = "md" }: {
  label: string; value: T; options: { id: T; label: ComponentChildren; title?: string }[]; onChange: (v: T) => void; class?: string; size?: "sm" | "md";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (dir: number) => {
    const i = options.findIndex((o) => o.id === value);
    const next = options[(i + dir + options.length) % options.length];
    onChange(next.id);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.focus());
  };
  return (
    <div ref={ref} class={`seg seg-${size} ${cls}`} role="radiogroup" aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(1); }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      }}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" data-id={o.id} aria-checked={o.id === value} tabIndex={o.id === value ? 0 : -1}
          title={o.title} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

const IND_SHORT: Record<Industry, string> = { retail: "Retail", tech: "Technology", insurance: "Insurance", banking: "Banking", hotel: "Hospitality", manufacturing: "Manufacturing" };
export const setLens = (patch: { ind?: Industry; cty?: Country }) => go(patch, { replace: true });

/** Toolbar lens: a select for the six industries and a three-way country switch. */
export function LensBar() {
  const r = route.value;
  return (
    <div class="lens" role="group" aria-label="Lens">
      <span class="lens-label"><Icon name="lens" />Lens</span>
      <label class="sel">
        <span class="sr-only">Industry</span>
        <select value={r.ind} onChange={(e) => setLens({ ind: (e.currentTarget as HTMLSelectElement).value as Industry })}>
          {(Object.keys(INDUSTRIES) as Industry[]).map((k) => <option key={k} value={k}>{IND_SHORT[k]}</option>)}
        </select>
        <Icon name="down" />
      </label>
      <Seg label="Country" size="sm" value={r.cty} onChange={(cty) => setLens({ cty })}
        options={(Object.keys(COUNTRIES) as Country[]).map((k) => ({ id: k, label: k, title: COUNTRIES[k] }))} />
    </div>
  );
}

/** Inline lens inside the process detail, where its effect is visible. */
export function LensInline() {
  const r = route.value;
  return (
    <div class="lens-inline">
      <Seg label="Industry lens" class="seg-wrap" value={r.ind} onChange={(ind) => setLens({ ind })}
        options={(Object.keys(INDUSTRIES) as Industry[]).map((k) => ({ id: k, label: IND_SHORT[k], title: INDUSTRIES[k] }))} />
      <Seg label="Country lens" value={r.cty} onChange={(cty) => setLens({ cty })}
        options={(Object.keys(COUNTRIES) as Country[]).map((k) => ({ id: k, label: COUNTRIES[k] }))} />
    </div>
  );
}

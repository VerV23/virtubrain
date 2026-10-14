/* A radio segmented control with roving focus (arrow keys move and select). */
import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";

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

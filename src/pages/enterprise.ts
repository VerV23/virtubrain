import "../styles/base.css";
import "../styles/pages.css";
import { boot } from "../lib/site";
import { initInner } from "../lib/ui";

boot();
initInner();

// the zone-map tabs also retarget the X-ray link to the process on show
const tabs = document.getElementById("zone-tabs");
const xray = document.getElementById("zone-xray") as HTMLAnchorElement | null;
const label: Record<string, string> = { "8.1.1": "X-ray every step of the close", "7.1.2": "X-ray every step of invoice matching" };
tabs?.addEventListener("tabs:change", (e) => {
  const id = (e as CustomEvent<{ id: string }>).detail.id;
  if (!xray || !label[id]) return;
  xray.href = `/app/#view=xray&p=${id}`;
  xray.textContent = label[id];
});

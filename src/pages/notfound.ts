import "../styles/base.css";
import "../styles/components.css";
import "../styles/pages.css";
import { boot } from "../lib/site";

boot();

// show the path the visitor asked for (as text, never as markup), unless this is /404.html itself
let path = location.pathname + location.search;
try { path = decodeURIComponent(path); } catch { /* keep it encoded */ }
const box = document.getElementById("nf-path");
if (box && !/^\/404(\.html)?$/i.test(location.pathname)) {
  box.querySelector("code")!.textContent = path.length > 80 ? path.slice(0, 77) + "..." : path;
  box.hidden = false;
}

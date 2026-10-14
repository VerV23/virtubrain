import "../styles/base.css";
import "../styles/app.css";
import { boot } from "../lib/site";
import { mount } from "../app/main";

boot();
const root = document.getElementById("vb-root");
if (root) mount(root);

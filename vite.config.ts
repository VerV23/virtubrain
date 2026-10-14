import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* Multi-page static site. Every page is a real HTML file, so every URL loads directly
   on any static host (no SPA fallback needed). Shared chrome lives in src/partials and is
   injected at build time:  <!-- @include header -->  <!-- @include footer -->
   The header marks the current section with aria-current using the page's data-nav value. */

const ROOT = import.meta.dirname;
const PAGES = {
  main: "index.html",
  app: "app/index.html",
  enterprise: "enterprise/index.html",
  business: "business/index.html",
  verantis: "verantis/index.html",
  contact: "contact/index.html",
  notfound: "404.html",
};

function partials(): Plugin {
  return {
    name: "vb-partials",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const nav = /<body[^>]*data-nav="([^"]+)"/.exec(html)?.[1] ?? "";
        return html.replace(/<!--\s*@include\s+([\w-]+)\s*-->/g, (_m, name: string) => {
          let part = readFileSync(resolve(ROOT, "src/partials", `${name}.html`), "utf8");
          if (nav) part = part.replace(new RegExp(`data-nav-item="${nav}"`, "g"), `data-nav-item="${nav}" aria-current="page"`);
          return part;
        });
      },
    },
  };
}

export default defineConfig({
  plugins: [partials(), preact()],
  appType: "mpa",
  build: {
    target: "es2020",
    cssCodeSplit: true,
    assetsInlineLimit: 2048,
    rollupOptions: { input: Object.fromEntries(Object.entries(PAGES).map(([k, v]) => [k, resolve(ROOT, v)])) },
  },
  server: { port: 5173, host: "127.0.0.1" },
  preview: { port: 4173, host: "127.0.0.1" },
});

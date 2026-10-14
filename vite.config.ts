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

const SITE = "https://virtubrain.ai";

/* Absolute share/canonical URLs, Twitter tags and structured data, derived from each page's own
   <title> and description so page authors only maintain those two. */
function seo(): Plugin {
  return {
    name: "vb-seo",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const route = ctx.path.replace(/index\.html$/, "");
        const url = SITE + (route === "/404.html" ? "/" : route);
        const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "VirtuBrain by Verantis";
        const desc = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? "";
        const img = `${SITE}/og.jpg`;
        const tags = [
          route === "/404.html" ? `<meta name="robots" content="noindex">` : `<link rel="canonical" href="${url}">`,
          `<meta property="og:url" content="${url}">`,
          `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`,
          `<meta property="og:image:alt" content="A tower of thirteen engraved glass plates beside the line: Find the step where your operating model breaks.">`,
          `<meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${desc}"><meta name="twitter:image" content="${img}">`,
        ];
        const org = { "@type": "Organization", "@id": `${SITE}/#verantis`, name: "Verantis", url: `${SITE}/verantis/`,
          description: "Operating-model advisory practice for finance, HR and shared services.", areaServed: ["PH", "US", "SG"],
          founder: { "@type": "Person", name: "Ver Villarico" }, address: { "@type": "PostalAddress", addressLocality: "Manila", addressCountry: "PH" } };
        if (route === "/") tags.push(ld([{ ...org }, { "@type": "WebSite", "@id": `${SITE}/#website`, name: "VirtuBrain", url: `${SITE}/`, publisher: { "@id": `${SITE}/#verantis` } }]));
        if (route === "/app/") tags.push(ld([{ "@type": "WebApplication", name: "VirtuBrain", url, applicationCategory: "BusinessApplication", operatingSystem: "Any",
          description: desc, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, publisher: org }]));
        if (route === "/verantis/") tags.push(ld([org]));
        return html
          .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${img}">`)
          .replace("</head>", `${tags.join("\n")}\n</head>`);
      },
    },
  };
}
const ld = (graph: object[]) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>`;

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
  plugins: [partials(), seo(), preact()],
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

import "../styles/base.css";
import "../styles/pages.css";
import { boot } from "../lib/site";
import { initInner } from "./inner";
import { loadTaxonomy, indexTaxonomy } from "../lib/data";

boot();
initInner();

/* The talk form.
   - Netlify Forms picks it up at deploy (name="talk", data-netlify, honeypot "bot-field").
   - Without JS the browser validates and posts natively, and Netlify redirects to /contact/?sent=1.
   - With JS we validate inline, post with fetch, and if the POST is not handled by Netlify (another
     host, offline, an error) we open the visitor's email app with the message already written. */

const form = document.getElementById("talk") as HTMLFormElement | null;
const params = new URLSearchParams(location.search);
const email = () => document.getElementById("direct-email")?.textContent?.trim() || "";

if (form) {
  form.noValidate = true;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const fName = $<HTMLInputElement>("f-name");
  const fEmail = $<HTMLInputElement>("f-email");
  const fCompany = $<HTMLInputElement>("f-company");
  const fInterest = $<HTMLSelectElement>("f-interest");
  const fFunction = $<HTMLSelectElement>("f-function");
  const fMessage = $<HTMLTextAreaElement>("f-message");
  const fProcess = $<HTMLInputElement>("f-process");
  const status = $<HTMLElement>("form-status");
  const body = form.querySelector<HTMLElement>(".form-body")!;
  const result = $<HTMLElement>("form-result");
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;

  /* ---- prefill from the URL: ?interest=close and ?process=8.1.1 ---- */
  const interest = params.get("interest");
  if (interest) {
    const opt = fInterest.querySelector<HTMLOptionElement>(`option[data-key="${CSS.escape(interest)}"]`);
    if (opt) opt.selected = true;
  }
  const pid = params.get("process")?.trim();
  const pfn = params.get("fn")?.trim() || null;
  if (pid && /^[\w.-]{1,24}$/.test(pid)) prefillProcess(pid);

  async function prefillProcess(id: string) {
    const chip = $<HTMLElement>("proc-chip");
    let label = `process ${id}`;
    try {
      const { resolve } = indexTaxonomy(await loadTaxonomy());
      const ref = resolve(id, pfn);
      if (!ref) return;
      label = `${ref.proc.id} ${ref.proc.name}`;
      fProcess.value = `${label} (${ref.fn.functionName})`;
      const fo = [...fFunction.options].find((o) => o.value === ref.fn.functionName);
      if (fo && !fFunction.value) fo.selected = true;
      chip.innerHTML = "";
      const code = Object.assign(document.createElement("span"), { className: "code", textContent: ref.proc.id });
      const name = Object.assign(document.createElement("b"), { textContent: ref.proc.name });
      const open = Object.assign(document.createElement("a"), { className: "link-more", href: `/app/#view=explore&fn=${encodeURIComponent(ref.fn.functionId)}&p=${encodeURIComponent(ref.proc.id)}`, textContent: "Open in the app" });
      const x = Object.assign(document.createElement("button"), { type: "button", className: "x", textContent: "Remove" });
      x.setAttribute("aria-label", `Remove process ${ref.proc.id} from the message`);
      x.addEventListener("click", () => {
        if (fMessage.value === prefilled) fMessage.value = "";
        fProcess.value = "";
        chip.hidden = true;
        fMessage.focus();
      });
      chip.append("About ", code, name, open, x);
      chip.hidden = false;
    } catch {
      // taxonomy unavailable: still carry the id the visitor came with
      fProcess.value = label;
    }
    const prefilled = `We'd like to talk about ${label}.`;
    if (!fMessage.value.trim()) fMessage.value = prefilled;
  }

  /* ---- inline validation ---- */
  const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
  type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const rules: [Field, (v: string) => string][] = [
    [fName, (v) => (v ? "" : "Enter your name.")],
    [fEmail, (v) => (!v ? "Enter your work email." : EMAIL_RE.test(v) ? "" : "Enter an email address like name@company.com.")],
    [fInterest, (v) => (v ? "" : "Choose what you're interested in.")],
    [fMessage, (v) => (!v ? "Tell us briefly what you'd like to fix." : v.length < 10 ? "Add a little more detail. A sentence is enough." : "")],
  ];
  const touched = new WeakSet<Field>();
  const check = (el: Field, rule: (v: string) => string) => {
    const msg = rule(el.value.trim());
    const err = document.getElementById(el.getAttribute("aria-describedby")!.split(" ").find((id) => id.startsWith("e-"))!)!;
    err.textContent = msg;
    el.setAttribute("aria-invalid", String(!!msg));
    el.closest(".field")!.classList.toggle("field-ok", !msg && touched.has(el));
    return !msg;
  };
  rules.forEach(([el, rule]) => {
    el.addEventListener("blur", () => { if (el.value.trim() || touched.has(el)) { touched.add(el); check(el, rule); } });
    el.addEventListener("change", () => { touched.add(el); check(el, rule); });
    el.addEventListener("input", () => { if (el.getAttribute("aria-invalid") === "true") check(el, rule); });
  });

  /* ---- submit ---- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    rules.forEach(([el]) => touched.add(el));
    const bad = rules.filter(([el, rule]) => !check(el, rule)).map(([el]) => el);
    if (bad.length) {
      status.innerHTML = "";
      const p = document.createElement("p");
      p.className = "err";
      p.textContent = bad.length === 1 ? "One field needs attention." : `${bad.length} fields need attention.`;
      status.append(p);
      bad[0].focus();
      return;
    }
    status.textContent = "";
    submit.setAttribute("aria-busy", "true");
    submit.textContent = "Sending";
    const data = new FormData(form);
    let handled = false;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 12000);
      const res = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(data as unknown as Record<string, string>).toString(),
        signal: ctl.signal,
      });
      clearTimeout(timer);
      // only Netlify actually stores the submission; any other host means the POST went nowhere
      handled = res.ok && (res.headers.has("x-nf-request-id") || /netlify/i.test(res.headers.get("server") || ""));
    } catch { handled = false; }
    submit.removeAttribute("aria-busy");
    submit.textContent = "Send message";
    if (handled) showSent(fName.value.trim(), fEmail.value.trim());
    else showMailFallback();
  });

  function showSent(name: string, addr: string) {
    body.hidden = true;
    result.innerHTML = `<div class="sent-panel"><span class="sent-mark" aria-hidden="true"></span><h2></h2><p></p><a class="link-more" href="/app/">Explore the app while you wait</a></div>`;
    result.querySelector("h2")!.textContent = name ? `Thanks, ${name.split(" ")[0]}. Your message is in.` : "Thanks. Your message is in.";
    result.querySelector("p")!.textContent = addr ? `We'll reply to ${addr} to set up an intro call.` : "We'll reply by email to set up an intro call.";
    result.hidden = false;
    result.focus();
  }

  function composeMail() {
    const meta = ([
      ["Name", fName.value.trim()],
      ["Work email", fEmail.value.trim()],
      ["Company", fCompany.value.trim()],
      ["Interested in", fInterest.value],
      ["Function", fFunction.value],
      ["Process", fProcess.value],
    ] as const).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
    const text = [...meta, "", fMessage.value.trim()].join("\n");
    const subject = `Enquiry from ${fName.value.trim() || "the website"}: ${fInterest.value}`;
    const href = `mailto:${email()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text.slice(0, 1800))}`;
    return { text, href };
  }

  function showMailFallback() {
    const { text, href } = composeMail();
    body.hidden = true;
    result.innerHTML = `<div class="sent-panel"><span class="sent-mark mail" aria-hidden="true"></span><h2>Finish in your email app.</h2>
      <p>The form couldn't send from here, so we've written the message for you. Your email app should open with it ready to send to <b class="addr"></b>.</p>
      <div class="cta-row"><a class="btn" data-mailto>Open the email</a><button class="copy-btn" type="button" data-copy-msg>Copy message</button><button class="copy-btn" type="button" data-edit>Edit the form</button></div>
      <pre class="mail-preview" tabindex="0" aria-label="Your message"></pre></div>`;
    result.querySelector(".addr")!.textContent = email();
    result.querySelector<HTMLAnchorElement>("[data-mailto]")!.href = href;
    result.querySelector(".mail-preview")!.textContent = text;
    const copy = result.querySelector<HTMLButtonElement>("[data-copy-msg]")!;
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(text); copy.textContent = "Copied"; } catch { copy.textContent = "Select the text below to copy"; }
      setTimeout(() => (copy.textContent = "Copy message"), 2200);
    });
    result.querySelector<HTMLButtonElement>("[data-edit]")!.addEventListener("click", () => {
      result.hidden = true; body.hidden = false; fMessage.focus();
    });
    result.hidden = false;
    result.focus();
    location.href = href;
  }

  if (params.get("sent") === "1") showSent("", "");
}

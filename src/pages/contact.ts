import "../styles/base.css";
import "../styles/pages.css";
import { boot } from "../lib/site";
import { initInner } from "../lib/ui";

boot();
initInner();

/* The talk form.
   - Netlify Forms picks it up at deploy (name="talk", data-netlify, honeypot "bot-field").
   - Without JS the browser validates and posts natively, and Netlify redirects to /contact/?sent=1.
   - With JS we validate inline, post with fetch, and if the POST is not handled by Netlify (another
     host, offline, an error) we open the visitor's email app with the message already written.
   - ?interest=<key> preselects the interest; ?process=<id>[&fn=<function id>] names a process, resolved
     against the small /data/process-index.json (process codes repeat across functions, so fn decides).
   - The assistant path (?interest=assistant, or chosen in the select) rewrites the form in a
     business owner's words. */

type ProcIndex = { v: number; processes: { fn: string; fnName: string; id: string; name: string }[] };

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

  const pickInterest = (key: string) => {
    const opt = fInterest.querySelector<HTMLOptionElement>(`option[data-key="${CSS.escape(key)}"]`);
    if (opt) { opt.selected = true; return true; }
    return false;
  };

  /* ---- the assistant path speaks a business owner's language ---- */
  const COPY = {
    process: { h1a: "Tell us about the", h1b: "process you want to fix.", email: "Work email", msg: "What would you like to fix?",
      hint: "A sentence or two is enough. Name the process if you can.", s2b: "We pick one process", s2: "On the call we choose where to start and what to look at first." },
    assistant: { h1a: "Tell us the one job", h1b: "you'd hand over first.", email: "Email", msg: "What should the assistant handle first?",
      hint: "A sentence or two is enough. For example, booking questions on your website.", s2b: "We pick the first job.", s2: "On the call we choose the one job your assistant starts with." },
  };
  let mode: keyof typeof COPY = "process";
  const setMode = (next: keyof typeof COPY, animate = true) => {
    if (next === mode) return;
    mode = next;
    const c = COPY[next];
    const h1 = $<HTMLElement>("ct-title");
    $<HTMLElement>("ct-h1a").textContent = c.h1a;
    $<HTMLElement>("ct-h1b").textContent = c.h1b;
    $<HTMLElement>("l-email").textContent = c.email;
    $<HTMLElement>("l-message").textContent = c.msg;
    $<HTMLElement>("h-message").textContent = c.hint;
    const s2 = $<HTMLElement>("step-2");
    s2.querySelector("b")!.textContent = c.s2b;
    s2.querySelector("span")!.textContent = c.s2;
    if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      h1.classList.remove("swap"); void h1.offsetWidth; h1.classList.add("swap");
    }
  };
  const syncMode = () => setMode(fInterest.selectedOptions[0]?.dataset.key === "assistant" ? "assistant" : "process");
  fInterest.addEventListener("change", syncMode);

  /* ---- prefill from the URL ---- */
  const interest = params.get("interest");
  if (interest) pickInterest(interest);
  setMode(fInterest.selectedOptions[0]?.dataset.key === "assistant" ? "assistant" : "process", false);
  const pid = params.get("process")?.trim();
  const pfn = params.get("fn")?.trim() || "";
  let prefilled = "";
  if (pid && /^[\w.-]{1,24}$/.test(pid)) prefillProcess(pid, pfn);

  async function prefillProcess(id: string, fn: string) {
    let label = `process ${id}`;
    let found: ProcIndex["processes"][number] | undefined;
    try {
      const res = await fetch("/data/process-index.json", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const idx = (await res.json()) as ProcIndex;
      const same = idx.processes.filter((p) => p.id === id);
      found = fn ? same.find((p) => p.fn === fn) : same.length === 1 ? same[0] : undefined;
      if (!same.length) return; // an id we don't know: leave the form alone
    } catch {
      /* index unavailable: still carry the id the visitor came with */
    }
    if (found) {
      label = `${found.id} ${found.name} (${found.fnName})`;
      const fo = [...fFunction.options].find((o) => o.value === found!.fnName);
      if (fo && !fFunction.value) fo.selected = true;
      showChip(found);
    }
    fProcess.value = label;
    if (!interest) {
      const key = found?.fn === "finance-accounting" && found.id.startsWith("8.1") ? "close"
        : found?.fn === "procurement" && found.id === "7.1.2" ? "invoice" : "app";
      pickInterest(key);
      syncMode();
    }
    prefilled = `We'd like to talk about ${label}.`;
    if (!fMessage.value.trim()) fMessage.value = prefilled;
  }

  function showChip(p: ProcIndex["processes"][number]) {
    const chip = $<HTMLElement>("proc-chip");
    chip.replaceChildren();
    const lead = Object.assign(document.createElement("span"), { className: "chip-k", textContent: "About:" });
    const code = Object.assign(document.createElement("span"), { className: "code", textContent: p.id });
    const name = Object.assign(document.createElement("b"), { textContent: p.name });
    const fnl = Object.assign(document.createElement("span"), { className: "chip-fn", textContent: `(${p.fnName})` });
    const open = Object.assign(document.createElement("a"), {
      className: "link-more", textContent: "Open in the app",
      href: `/app/#view=explore&fn=${encodeURIComponent(p.fn)}&p=${encodeURIComponent(p.id)}`,
    });
    const x = Object.assign(document.createElement("button"), { type: "button", className: "x", textContent: "Remove" });
    x.setAttribute("aria-label", `Remove process ${p.id} from the message`);
    x.addEventListener("click", () => {
      if (fMessage.value === prefilled) fMessage.value = "";
      fProcess.value = "";
      chip.hidden = true;
      fMessage.focus();
    });
    const text = document.createElement("span");
    text.className = "chip-text";
    text.append(lead, " ", code, " ", name, " ", fnl);
    chip.append(text, open, x);
    chip.hidden = false;
  }

  /* ---- inline validation ---- */
  const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
  type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const rules: [Field, (v: string) => string][] = [
    [fName, (v) => (v ? "" : "Enter your name.")],
    [fEmail, (v) => (!v ? (mode === "assistant" ? "Enter your email." : "Enter your work email.") : EMAIL_RE.test(v) ? "" : "Enter an email address like name@company.com.")],
    [fInterest, (v) => (v ? "" : "Choose what you're interested in.")],
    [fMessage, (v) => (!v ? (mode === "assistant" ? "Tell us briefly what the assistant should handle first." : "Tell us briefly what you'd like to fix.") : v.length < 10 ? "Add a little more detail. A sentence is enough." : "")],
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
      status.replaceChildren();
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
      [mode === "assistant" ? "Email" : "Work email", fEmail.value.trim()],
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

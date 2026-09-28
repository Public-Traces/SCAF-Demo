"use strict";
/*
 * Application demo. Three things verify here, and nothing else does:
 *   1. every sentence on this site,
 *   2. the pitch, which carries a certificate signed with the demo key,
 *   3. whatever a visitor types by hand into the box while demo signing is on.
 * All checking and signing happens in this browser. Nothing is sent anywhere.
 */

const $ = id => document.getElementById(id);
const enc = new TextEncoder();
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const sha = async s => hex(await crypto.subtle.digest("SHA-256", typeof s === "string" ? enc.encode(s) : s));
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

const SITE_WRITTEN = "2026-09-28";   // the day this site's copy was written
const GRAM = 4;                       // passages match four words at a time

/* The encoding every certificate is signed over: sorted keys, no spaces. */
function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object")
    return "{" + Object.keys(v).sort().map(k => '"' + k + '":' + canonical(v[k])).join(",") + "}";
  if (typeof v === "string") return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(Math.trunc(v));
}
function derToRaw(der) {
  let i = der[1] & 0x80 ? 2 + (der[1] & 0x7f) : 2;
  const part = () => {
    i++; const len = der[i++]; let v = der.slice(i, i + len); i += len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32); out.set(v, 32 - v.length); return out;
  };
  const raw = new Uint8Array(64); raw.set(part(), 0); raw.set(part(), 32); return raw;
}
function rawToDer(raw) {
  const int = b => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i);
    return b[0] & 0x80 ? [0x02, b.length + 1, 0, ...b] : [0x02, b.length, ...b]; };
  const body = [...int(raw.slice(0, 32)), ...int(raw.slice(32))];
  return new Uint8Array([0x30, body.length, ...body]);
}

/* Words the same way the desktop tool splits them: letters, digits and apostrophes, in lower case. */
function words(text) {
  const out = [], re = /[\p{L}\p{N}\p{M}'’]+/gu;
  let m;
  while ((m = re.exec(text))) out.push({ w: m[0].normalize("NFC").replace(/’/g, "'").toLowerCase(), s: m.index, e: m.index + m[0].length });
  return out;
}

/* ── what verifies ─────────────────────────────────────────────────────────── */
const REG = { grams: new Set(), whole: new Set() };
let PITCH = null, KEY = null;

async function remember(text) {
  const w = words(text).map(t => t.w);
  if (!w.length) return;
  if (w.length < GRAM) { REG.whole.add(await sha("s|" + w.join(" "))); return; }
  for (let i = 0; i + GRAM <= w.length; i++) REG.grams.add(await sha("g|" + w.slice(i, i + GRAM).join(" ")));
}

/* Every block of copy on the site, on both tabs, but never the live results. */
function siteCopy() {
  const sel = "h1,h2,h3,p,li,dt,dd,button,a,.legend span,.brand";
  const blocks = [...document.querySelectorAll(sel)].filter(el =>
    !el.closest("[data-live]") && !el.querySelector(sel.split(",").join(",")));
  const texts = blocks.map(el => el.textContent.trim()).filter(Boolean);
  texts.push($("box").placeholder);
  // Results copy, as it reads for the pitch.
  texts.push("96% of this text was physically typed", "Certificate of authenticity", "Signature has integrity.",
    "This certificate is secure end-to-end", "No injection",
    "No portions of the text were copy-pasted in or injected onto a word processor by AI.",
    "96% typed on a built-in keyboard", "Signature verifies physical keys were pressed by computer’s built-in hardware.",
    "Text", "Display verified words", "Typed by hand", "Physically typed then edited",
    "Not typed by hand (copy-pasted or injected)", "Share the certificate", "Show the signed bytes");
  return texts;
}

async function prepare() {
  const [certRes, pitchRes] = await Promise.all([fetch("pitch-certificate.json"), fetch("pitch.txt")]);
  const cert = await certRes.json(), text = await pitchRes.text();
  PITCH = { cert, text };
  await Promise.all([...siteCopy(), text].map(remember));
  KEY = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
}
const ready = prepare();

/* ── typing in the box ─────────────────────────────────────────────────────── */
// One mark per character of the box: k typed while signing, e typed then replaced by the keyboard's
// own suggestions while signing, u typed with signing off, p anything else (a paste, a drop, a script).
let signing = false, marks = [], before = "";
$("box").addEventListener("input", e => {
  const now = $("box").value;
  let a = 0;
  while (a < before.length && a < now.length && before[a] === now[a]) a++;
  let b = 0;
  while (b < before.length - a && b < now.length - a && before[before.length - 1 - b] === now[now.length - 1 - b]) b++;
  const typed = ["insertText", "insertCompositionText", "insertLineBreak", "insertParagraph"].includes(e.inputType);
  const mark = !e.isTrusted ? "p" : typed ? (signing ? "k" : "u")
             : e.inputType === "insertReplacementText" ? (signing ? "e" : "u") : "p";
  marks = marks.slice(0, a).concat(new Array(now.length - a - b).fill(mark), marks.slice(before.length - b));
  before = now;
});
function setSwitch(btn, on) { btn.setAttribute("aria-checked", String(on)); }
$("signing").addEventListener("click", () => { signing = !signing; setSwitch($("signing"), signing); });
$("showMarks").addEventListener("click", () => {
  const on = $("showMarks").getAttribute("aria-checked") !== "true";
  setSwitch($("showMarks"), on);
  $("checked").classList.toggle("plain", !on);
});

/* ── checking ──────────────────────────────────────────────────────────────── */
async function analyse(text) {
  const toks = words(text);
  const label = new Array(toks.length).fill("u");
  const wordsHash = await sha("w1|" + toks.map(t => t.w).join(" "));

  if (PITCH && wordsHash === PITCH.cert.wordsHash) {
    let i = 0;
    for (const p of PITCH.cert.passages) for (let k = 0; k < p.n; k++, i++)
      label[i] = p.v === "typed" ? "t" : p.v === "edited" ? "e" : "u";
    return { toks, label, wordsHash, pitch: true };
  }
  const from = new Set();
  const grams = await Promise.all(toks.slice(0, Math.max(0, toks.length - GRAM + 1)).map((_, i) =>
    sha("g|" + toks.slice(i, i + GRAM).map(t => t.w).join(" "))));
  grams.forEach((h, i) => { if (REG.grams.has(h)) for (let k = i; k < i + GRAM; k++) { label[k] = "t"; from.add("site"); } });
  if (toks.length && toks.length < GRAM && REG.whole.has(await sha("s|" + toks.map(t => t.w).join(" "))))
    toks.forEach((_, k) => { label[k] = "t"; from.add("site"); });
  toks.forEach((t, k) => {
    if (label[k] !== "u") return;
    const m = marks.slice(t.s, t.e);
    if (m.length === t.e - t.s && m.every(c => c === "k" || c === "e")) {
      label[k] = m.includes("e") ? "e" : "t";
      from.add("box");
    }
  });
  return { toks, label, wordsHash, pitch: false, from };
}

/* Every character takes the verdict of the word it belongs to; punctuation and spaces follow it. */
function paint(text, toks, label) {
  const lab = new Array(text.length).fill(null);
  toks.forEach((t, k) => { for (let c = t.s; c < t.e; c++) lab[c] = label[k]; });
  for (let c = 0; c < text.length; c++) {
    if (lab[c] || /\s/.test(text[c])) continue;
    let l = c - 1; while (l >= 0 && !/\s/.test(text[l]) && !lab[l]) l--;
    let r = c + 1; while (r < text.length && !/\s/.test(text[r]) && !lab[r]) r++;
    lab[c] = (l >= 0 && !/\s/.test(text[l]) && lab[l]) || (r < text.length && !/\s/.test(text[r]) && lab[r]) || null;
  }
  // Punctuation standing on its own, like a dash between spaces, joins the words either side when they agree.
  for (let c = 0; c < text.length; c++) {
    if (lab[c] || /\s/.test(text[c])) continue;
    let l = c - 1; while (l >= 0 && !lab[l]) l--;
    let r = c + 1; while (r < text.length && !lab[r]) r++;
    if (l >= 0 && r < text.length && lab[l] === lab[r] && !text.slice(l, r).includes("\n")) lab[c] = lab[l];
  }
  for (let c = 0; c < text.length; c++) {
    if (!/\s/.test(text[c])) continue;
    let l = c - 1; while (l >= 0 && /\s/.test(text[l])) l--;
    let r = c + 1; while (r < text.length && /\s/.test(text[r])) r++;
    if (l >= 0 && r < text.length && lab[l] && lab[l] === lab[r] && !text.slice(l + 1, r).includes("\n")) lab[c] = lab[l];
  }
  let html = "", start = 0;
  for (let c = 1; c <= text.length; c++) {
    if (c < text.length && lab[c] === lab[start]) continue;
    const piece = esc(text.slice(start, c));
    html += lab[start] ? `<span class="${lab[start]}">${piece}</span>` : piece;
    start = c;
  }
  return html;
}

const ICON = {
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>',
};
const longDay = iso => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const certifiedAt = iso => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) +
  ", " + new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

async function verifyCert(cert) {
  try {
    const { sig, ...body } = cert;
    const key = await crypto.subtle.importKey("spki", unb64(cert.pubKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derToRaw(unb64(sig)), enc.encode(canonical(body)));
  } catch (e) { return false; }
}
async function signNew(body) {
  const pub = await crypto.subtle.exportKey("spki", KEY.publicKey);
  body.pubKey = b64(pub);
  const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, KEY.privateKey, enc.encode(canonical(body))));
  return { ...body, sig: b64(rawToDer(raw)) };
}

let CURRENT = null;
async function check() {
  await ready;
  const text = $("box").value;
  if (!text.trim()) { $("box").focus(); return; }
  const r = await analyse(text);
  const letters = (k) => r.toks[k].e - r.toks[k].s;
  const total = r.toks.reduce((n, _, k) => n + letters(k), 0);
  const good = r.toks.reduce((n, _, k) => n + (r.label[k] !== "u" ? letters(k) : 0), 0);

  let cert, pct;
  if (r.pitch) {
    cert = PITCH.cert;
    pct = cert.percent;
  } else {
    pct = total ? Math.round(good / total * 100) : 0;
    if (pct === 0 && good > 0) pct = 1;
    if (pct === 100 && good < total) pct = 99;
    const days = [];
    if (r.from.has("site")) days.push(SITE_WRITTEN);
    if (r.from.has("box")) days.push(localDay());
    cert = await signNew({
      v: 1, claim: "demo-signing", issuedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
      originallyTyped: days.sort()[0] || "", percent: pct,
      signedWords: r.label.filter(l => l !== "u").length, words: r.toks.length, wordsHash: r.wordsHash,
      input: "built-in keyboard only", sip: true,
    });
  }
  CURRENT = cert;
  const valid = await verifyCert(cert);
  const off = 100 - pct;
  // Typing that happened with demo signing switched off is part of what didn't verify.
  const unsigned = !r.pitch && r.toks.some((t, k) => r.label[k] === "u" && marks.slice(t.s, t.e).includes("u"));
  const lead = `${off}% was injected or copy-pasted from other sources or AI` + (unsigned ? ", or typed without our tool." : "");
  const hint = unsigned ? "Try toggling on Demo Signing to see what verification can do." : "";

  $("markIcon").className = "mark" + (pct >= 90 ? "" : " bad");
  $("markIcon").innerHTML = pct >= 90 ? ICON.ok : ICON.bad;
  $("headline").textContent = `${pct}% of this text was physically typed`;
  $("checked").innerHTML = paint(text, r.toks, r.label);
  $("subline").hidden = pct > 0;
  $("subline").textContent = hint ? `${lead} ${hint}` : lead;
  $("certPane").hidden = pct === 0;

  const items = [
    valid ? { k: "ok", t: "Signature has integrity.", d: "This certificate is secure end-to-end" }
          : { k: "bad", t: "Signature has integrity.", d: "This certificate is secure end-to-end" },
    r.pitch || off === 0
      ? { k: "ok", t: "No injection", d: "No portions of the text were copy-pasted in or injected onto a word processor by AI." }
      : { k: "bad", t: lead, d: hint },
    { k: pct >= 90 ? "ok" : "warn", t: `${pct}% typed on a built-in keyboard`,
      d: "Signature verifies physical keys were pressed by computer’s built-in hardware." },
  ];
  $("checks").innerHTML = items.map(c => `<li class="${c.k}"><span class="i">${c.k === "ok" ? "✓" : c.k === "bad" ? "✕" : "!"}</span>
    <div><b>${esc(c.t)}</b>${c.d ? `<span class="d">${esc(c.d)}</span>` : ""}</div></li>`).join("");

  const keyId = (await sha(unb64(cert.pubKey))).slice(0, 16).match(/.{4}/g).join(" ");
  const typedOn = r.pitch ? cert.typedFrom : cert.originallyTyped;
  const rows = [
    ["Originally Typed", typedOn ? longDay(typedOn) : ""],
    ["Certified", certifiedAt(cert.issuedAt)],
    ["Signed words", String(r.pitch ? cert.words : cert.signedWords)],
    ["Input accepted", "Built-in keyboard only"],
    ["System protection", "On"],
    ["Signing key", `<code>${keyId}</code>`],
  ].filter(row => row[1]);
  $("details").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${k === "Signing key" ? v : esc(v)}</dd>`).join("");

  const { sig, ...body } = cert;
  $("bytes").textContent = canonical(body) + "\n\n" + sig;
  $("bytes").hidden = true;
  $("bytesBtn").setAttribute("aria-expanded", "false");

  const res = $("results");
  const first = res.hidden;
  res.hidden = false;
  if (first) { res.classList.add("pending"); requestAnimationFrame(() => requestAnimationFrame(() => res.classList.remove("pending"))); }
  res.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}
$("checkBtn").addEventListener("click", check);

$("bytesBtn").addEventListener("click", () => {
  const open = $("bytes").hidden;
  $("bytes").hidden = !open;
  $("bytesBtn").setAttribute("aria-expanded", String(open));
});
$("shareBtn").addEventListener("click", () => {
  if (!CURRENT) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(CURRENT, null, 1)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = "certificate.json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

/* ── tabs ──────────────────────────────────────────────────────────────────── */
function route() {
  const about = location.hash === "#about";
  $("page-verify").hidden = about;
  $("page-about").hidden = !about;
  scrollTo(0, 0);
  $("tab-verify").toggleAttribute("aria-current", !about);
  $("tab-about").toggleAttribute("aria-current", about);
  if (about) $("tab-about").setAttribute("aria-current", "page"); else $("tab-verify").setAttribute("aria-current", "page");
  revealBelowFold();
}
window.addEventListener("hashchange", route);

/* ── entrance: sections below the fold arrive from a slight blur ───────────── */
const seen = "IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches
  ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.remove("pending"); seen.unobserve(e.target); } }), { threshold: 0.12 })
  : null;
function revealBelowFold() {
  if (!seen) return;
  document.querySelectorAll(".sheet.reveal").forEach(el => {
    if (el.offsetParent === null) return;
    if (el.getBoundingClientRect().top > innerHeight * 0.92) { el.classList.add("pending"); seen.observe(el); }
  });
}
route();

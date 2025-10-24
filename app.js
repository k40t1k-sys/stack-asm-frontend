// app.js — minimal, hardcoded backend
const $ = (sel) => document.querySelector(sel);
const logEl = $("#log");
const connPill = $("#conn-pill");
const tableBody = $("#ticker-body");
const filterInput = $("#filter-symbol");
const priceSymbolInput = $("#price-symbol");
const priceOutput = $("#price-output");

// Hardcode your backend base URL (HTTP) — change to your IP/DNS if needed
const HTTP_URL = "https://friendly-paste-jumping-agreements.trycloudflare.com";

function log(msg, obj) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  logEl.textContent += (obj ? `${line} ${JSON.stringify(obj)}\n` : `${line}\n`);
  logEl.scrollTop = logEl.scrollHeight;
}

function toWsUrl(httpUrl) {
  const u = new URL(httpUrl);
  u.pathname = u.pathname.replace(/\/$/, "") + "/ws";
  u.protocol = (u.protocol === "https:") ? "wss:" : "ws:";
  return u.toString();
}

function setConnected(on) {
  connPill.textContent = on ? "Connected" : "Disconnected";
  connPill.classList.toggle("pill--connected", on);
  connPill.classList.toggle("pill--disconnected", !on);
}

const state = new Map();
function renderTable(filter = "") {
  const rows = [];
  const f = filter.trim().toUpperCase();
  const list = Array.from(state.values())
    .filter(x => (f ? x.symbol.includes(f) : true))
    .sort((a,b) => a.symbol.localeCompare(b.symbol));
  for (const it of list) {
    const time = new Date(it.timestamp).toISOString().replace("T"," ").replace("Z","Z");
    rows.push(`
      <tr>
        <td>${it.symbol}</td>
        <td class="num">${it.last_price}</td>
        <td class="num">${it.change_percent}</td>
        <td class="num">${time}</td>
      </tr>
    `);
  }
  tableBody.innerHTML = rows.join("");
}

async function fetchLatest() {
  try {
    const res = await fetch(`${HTTP_URL.replace(/\/$/, "")}/latest`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const arr = (data && data.data) || [];
    for (const it of arr) state.set(it.symbol, it);
    renderTable(filterInput.value);
    log("Fetched /latest", {count: arr.length});
  } catch (e) {
    log("Error fetching /latest", {error: String(e)});
  }
}

async function fetchPrice(symbol) {
  const sym = symbol.trim();
  if (!sym) return;
  try {
    const url = `${HTTP_URL.replace(/\/$/, "")}/price?symbol=${encodeURIComponent(sym)}`;
    const res = await fetch(url);
    const txt = await res.text();
    priceOutput.textContent = txt;
    if (!res.ok) log(`GET /price failed`, {status: res.status, body: txt});
  } catch (e) {
    priceOutput.textContent = String(e);
    log("Error fetching /price", {error: String(e)});
  }
}

let ws = null;
let backoff = 1000;
const maxBackoff = 30000;

function connectWs() {
  const WS_URL = toWsUrl(HTTP_URL);
  log("Connecting WS...", {WS_URL});
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    setConnected(true);
    log("WebSocket open");
    backoff = 1000;
  };

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.type === "snapshot" && Array.isArray(msg.data)) {
        for (const it of msg.data) state.set(it.symbol, it);
        renderTable(filterInput.value);
        log("Received snapshot", {count: msg.data.length});
      } else if (msg.type === "ticker" && msg.data) {
        state.set(msg.data.symbol, msg.data);
        renderTable(filterInput.value);
      }
    } catch (e) {
      log("WS parse error", {error: String(e)});
    }
  };

  ws.onclose = () => {
    setConnected(false);
    log("WebSocket closed");
    retryWs();
  };

  ws.onerror = () => {
    log("WebSocket error");
  };
}

function retryWs() {
  const delay = Math.min(maxBackoff, backoff + Math.random() * backoff);
  log(`Reconnecting WS in ${Math.round(delay/1000)}s...`);
  setTimeout(connectWs, delay);
  backoff = Math.min(maxBackoff, backoff * 2);
}

// Bind existing controls
$("#btn-refresh").addEventListener("click", fetchLatest);
filterInput.addEventListener("input", () => renderTable(filterInput.value));
$("#btn-price").addEventListener("click", () => fetchPrice(priceSymbolInput.value || "BTCUSDT"));

// Boot
fetchLatest();
connectWs();

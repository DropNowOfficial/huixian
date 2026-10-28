import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const injectPath = fs.existsSync(path.join(here, "inject.js"))
  ? path.join(here, "inject.js")
  : path.join(here, "../inject.js");
const { fillSeat } = require(injectPath);
const { chromium } = require("playwright");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const HOSTS = new Set(["chatgpt.com", "claude.ai", "gemini.google.com", "grok.com", "grok.x.ai"]);

const DEFAULTS = {
  gpt: { name: "ChatGPT", home: "https://chatgpt.com" },
  claude: { name: "Claude", home: "https://claude.ai/new" },
  gemini: { name: "Gemini", home: "https://gemini.google.com/app" },
  grok: { name: "Grok", home: "https://grok.com" },
};

const dataDir = process.env.HUIXIAN_DATA || path.join(here, "data");
const versionFile = path.join(dataDir, "versions.json");
const live = new Map();
const calls = [];

function recipeFrom(preface = "") {
  return {
    preface,
    seats: Object.fromEntries(
      Object.entries(DEFAULTS).map(([id, seat]) => [id, { name: seat.name, home: seat.home }]),
    ),
  };
}

function allowedHome(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function cleanRecipe(input) {
  const next = recipeFrom("");
  const preface = String(input?.preface || "").slice(0, 400);
  next.preface = preface;
  for (const id of Object.keys(DEFAULTS)) {
    const home = input?.seats?.[id]?.home;
    if (typeof home === "string" && allowedHome(home)) next.seats[id].home = home;
  }
  return next;
}

function loadStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(versionFile)) {
    const now = new Date().toISOString();
    const recipe = recipeFrom("");
    const store = {
      active: "v2",
      recipe,
      versions: [
        {
          id: "v1",
          name: "本机四席",
          note: "Electron 窗口。四块屏隔开，登录留在本机。",
          runtime: "desktop",
          createdAt: now,
          recipe,
        },
        {
          id: "v2",
          name: "云端四屏",
          note: "同一台云电脑上的四块隔开的屏。关掉笔记本，登录还在。",
          runtime: "cloud",
          createdAt: now,
          recipe,
        },
      ],
    };
    fs.writeFileSync(versionFile, JSON.stringify(store, null, 2));
    return store;
  }
  const store = JSON.parse(fs.readFileSync(versionFile, "utf8"));
  store.recipe = cleanRecipe(store.recipe);
  return store;
}

let store = loadStore();

function persist() {
  fs.writeFileSync(versionFile, JSON.stringify(store, null, 2));
}

function hint(url, title = "") {
  const blob = `${url} ${title}`.toLowerCase();
  if (!String(url || "").startsWith("http")) return "未打开";
  if (/accounts\.google|login|sign-in|signin|auth|just a moment|请稍候|cloudflare|challenge|captcha/.test(blob)) {
    return "需要接管";
  }
  return "会话开着";
}

function logCall(entry) {
  calls.unshift({ ...entry, at: Date.now() });
  calls.splice(8);
}

function snapshot() {
  return {
    ok: true,
    computer: "huixian-1",
    active: store.active,
    recipe: store.recipe,
    versions: store.versions.map(({ recipe, ...rest }) => rest),
    calls,
    seats: Object.entries(store.recipe.seats).map(([id, seat]) => {
      const page = live.get(id)?.page;
      const url = page && !page.isClosed() ? page.url() : "";
      return {
        id,
        name: seat.name,
        home: seat.home,
        open: Boolean(page && !page.isClosed()),
        url,
        hint: hint(url),
      };
    }),
  };
}

async function openSeat(id) {
  const spec = store.recipe.seats[id];
  if (!spec) throw new Error("没有这一席");
  const existing = live.get(id);
  if (existing && !existing.page.isClosed()) {
    if (existing.page.url() === "about:blank") {
      await existing.page.goto(spec.home, { waitUntil: "domcontentloaded", timeout: 25000 });
    }
    return existing;
  }
  const dir = path.join(dataDir, "profiles", id);
  fs.mkdirSync(dir, { recursive: true });
  const context = await chromium.launchPersistentContext(dir, {
    headless: true,
    viewport: { width: 960, height: 600 },
    userAgent: UA,
    locale: "zh-CN",
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultNavigationTimeout(25000);
  await page.goto(spec.home, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
  const seat = { context, page };
  live.set(id, seat);
  return seat;
}

async function shot(id) {
  const seat = await openSeat(id);
  const image = (await seat.page.screenshot({ type: "jpeg", quality: 42 })).toString("base64");
  const title = await seat.page.title();
  const url = seat.page.url();
  return { ok: true, image, url, title, hint: hint(url, title) };
}

async function deliver(id, text) {
  const seat = await openSeat(id);
  const preface = store.recipe.preface.trim();
  const full = preface ? `${preface}\n\n${text}` : text;
  const result = await seat.page.evaluate(fillSeat, full, id);
  logCall({ seat: id, text: text.slice(0, 80), ok: Boolean(result?.ok), version: store.active });
  if (!result?.ok) return { ok: false, reason: result?.reason || "没送进页面", version: store.active };
  return { ...result, version: store.active };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 200_000) reject(new Error("请求太大"));
      else chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("不是 JSON"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const send = (code, body) => {
    const raw = JSON.stringify(body);
    res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
    res.end(raw);
  };
  try {
    const token = process.env.HUIXIAN_TOKEN;
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      return send(401, { ok: false, error: "需要令牌" });
    }
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/v1/state") return send(200, snapshot());
    if (req.method !== "POST") return send(404, { ok: false, error: "没有这条路" });
    const body = await readJson(req);
    const id = body.seat;
    if (url.pathname === "/v1/open") {
      await openSeat(id);
      return send(200, snapshot());
    }
    if (url.pathname === "/v1/shot") return send(200, await shot(id));
    if (url.pathname === "/v1/click") {
      const seat = await openSeat(id);
      const view = seat.page.viewportSize() || { width: 960, height: 600 };
      const x = Math.min(1, Math.max(0, Number(body.x) || 0)) * view.width;
      const y = Math.min(1, Math.max(0, Number(body.y) || 0)) * view.height;
      await seat.page.mouse.click(x, y);
      return send(200, { ok: true });
    }
    if (url.pathname === "/v1/type") {
      const seat = await openSeat(id);
      await seat.page.keyboard.insertText(String(body.text || "").slice(0, 2000));
      return send(200, { ok: true });
    }
    if (url.pathname === "/v1/key") {
      const seat = await openSeat(id);
      const key = String(body.key || "").slice(0, 20);
      if (!["Enter", "Backspace", "Tab", "Escape"].includes(key)) return send(400, { ok: false, error: "不支持这个键" });
      await seat.page.keyboard.press(key);
      return send(200, { ok: true });
    }
    if (url.pathname === "/v1/deliver" || url.pathname === "/v1/call") {
      const text = String(body.text || "").trim().slice(0, 2000);
      if (!text) return send(400, { ok: false, error: "没有文字" });
      if (body.version && body.version !== store.active) {
        const item = store.versions.find((version) => version.id === body.version);
        if (!item) return send(404, { ok: false, error: "没有这个版本" });
        store.active = item.id;
        store.recipe = cleanRecipe(item.recipe);
        persist();
      }
      return send(200, await deliver(id, text));
    }
    if (url.pathname === "/v1/recipe") {
      store.recipe = cleanRecipe({ ...store.recipe, ...body, seats: body.seats || store.recipe.seats });
      if (typeof body.preface === "string") store.recipe.preface = body.preface.slice(0, 400);
      persist();
      return send(200, snapshot());
    }
    if (url.pathname === "/v1/versions/save") {
      const name = String(body.name || "未命名").trim().slice(0, 40);
      const note = String(body.note || "").trim().slice(0, 200);
      const item = {
        id: `v${store.versions.length + 1}`,
        name,
        note,
        runtime: "cloud",
        createdAt: new Date().toISOString(),
        recipe: cleanRecipe(store.recipe),
      };
      store.versions.push(item);
      store.active = item.id;
      persist();
      return send(200, snapshot());
    }
    if (url.pathname === "/v1/versions/use") {
      const item = store.versions.find((version) => version.id === body.id);
      if (!item) return send(404, { ok: false, error: "没有这个版本" });
      store.active = item.id;
      store.recipe = cleanRecipe(item.recipe);
      persist();
      return send(200, snapshot());
    }
    return send(404, { ok: false, error: "没有这条路" });
  } catch (error) {
    send(500, { ok: false, error: error instanceof Error ? error.message : "云端浏览器出错" });
  }
});

const port = Number(process.env.PORT || 8787);
const host = process.env.HUIXIAN_HOST || "127.0.0.1";
server.listen(port, host, () => {
  console.log(`huixian cloud ${host}:${port}`);
});

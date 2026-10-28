"use strict";

const path = require("path");
const { app, BaseWindow, WebContentsView, ipcMain, session, clipboard, Menu } = require("electron");
const { fillSeat, readSeat } = require("./inject");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SEATS = [
  { id: "gpt", name: "ChatGPT", home: "https://chatgpt.com" },
  { id: "claude", name: "Claude", home: "https://claude.ai/new" },
  { id: "gemini", name: "Gemini", home: "https://gemini.google.com/app" },
  { id: "grok", name: "Grok", home: "https://grok.com" },
];

const LEFT = 300;
const seats = new Map();
let win = null;
let ui = null;
let focused = "gpt";
let tiled = false;

function loginHint(id, url) {
  const value = String(url || "").toLowerCase();
  if (!value.startsWith("http")) return "未打开";
  if (/accounts\.google\.com|login|sign-in|signin|auth/.test(value)) return "在登录页";
  if (id === "gpt" && value.includes("chatgpt.com")) return "会话开着";
  if (id === "claude" && value.includes("claude.ai")) return "会话开着";
  if (id === "gemini" && value.includes("gemini.google")) return "会话开着";
  if (id === "grok" && (value.includes("grok.com") || value.includes("grok.x.ai"))) return "会话开着";
  return "已离开首页";
}

function snapshot() {
  return {
    focused,
    tiled,
    seats: SEATS.map((seat) => {
      const live = seats.get(seat.id);
      const url = live?.view.webContents.getURL() || "";
      return {
        id: seat.id,
        name: seat.name,
        home: seat.home,
        url,
        title: live?.view.webContents.getTitle() || seat.name,
        hint: loginHint(seat.id, url),
      };
    }),
  };
}

function emit() {
  if (!ui || ui.webContents.isDestroyed()) return;
  ui.webContents.send("status", snapshot());
}

function contentSize() {
  if (typeof win.getContentSize === "function") return win.getContentSize();
  const bounds = win.getBounds();
  return [bounds.width, bounds.height];
}

function layout() {
  if (!win || !ui) return;
  const [width, height] = contentSize();
  ui.setBounds({ x: 0, y: 0, width: LEFT, height });
  const area = { x: LEFT, y: 0, width: Math.max(0, width - LEFT), height };
  const list = SEATS.map((seat) => seats.get(seat.id)).filter(Boolean);
  if (tiled) {
    const col = Math.floor(area.width / 2);
    const row = Math.floor(area.height / 2);
    list.forEach((seat, index) => {
      seat.view.setBounds({
        x: area.x + (index % 2) * col,
        y: area.y + Math.floor(index / 2) * row,
        width: col,
        height: row,
      });
    });
    return;
  }
  for (const seat of list) {
    seat.view.setBounds(seat.id === focused ? area : { x: LEFT, y: 0, width: 0, height: 0 });
  }
}

function attachMenu(view, seat) {
  view.webContents.on("context-menu", () => {
    Menu.buildFromTemplate([
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
      { type: "separator" },
      { label: "重新加载这一席", click: () => view.webContents.reload() },
      { label: "回到这一席首页", click: () => view.webContents.loadURL(seat.home) },
    ]).popup();
  });
}

function watch(seat, view) {
  const notify = () => emit();
  view.webContents.on("did-navigate", notify);
  view.webContents.on("did-navigate-in-page", notify);
  view.webContents.on("page-title-updated", notify);
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) view.webContents.loadURL(url);
    return { action: "deny" };
  });
  attachMenu(view, seat);
}

function makeSeat(seat) {
  const partition = `persist:relay-${seat.id}`;
  const view = new WebContentsView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  session.fromPartition(partition).setUserAgent(UA);
  view.webContents.setUserAgent(UA);
  watch(seat, view);
  view.webContents.loadURL(seat.home);
  return { id: seat.id, view };
}

async function runInPage(view, fn, args) {
  const source = `(${fn.toString()})(${args.map((item) => JSON.stringify(item)).join(",")})`;
  const job = view.webContents.executeJavaScript(source, true);
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("超时")), 12000));
  return Promise.race([job, timeout]);
}

function registerIpc() {
  ipcMain.handle("state", () => snapshot());
  ipcMain.handle("focus", (_event, id) => {
    if (!seats.has(id)) return snapshot();
    focused = id;
    layout();
    emit();
    return snapshot();
  });
  ipcMain.handle("tile", (_event, on) => {
    tiled = Boolean(on);
    layout();
    emit();
    return snapshot();
  });
  ipcMain.handle("home", (_event, id) => {
    const seat = SEATS.find((item) => item.id === id);
    const live = seats.get(id);
    if (seat && live) live.view.webContents.loadURL(seat.home);
    return snapshot();
  });
  ipcMain.handle("reload", (_event, id) => {
    const live = seats.get(id);
    if (live) live.view.webContents.reload();
    return snapshot();
  });
  ipcMain.handle("deliver", async (_event, payload) => {
    const text = String(payload?.text || "").trim();
    const id = payload?.id;
    const live = seats.get(id);
    if (!text || !live) return { ok: false, reason: "没有席位或没有文字" };
    try {
      const result = await runInPage(live.view, fillSeat, [text, id]);
      if (!result?.ok) {
        clipboard.writeText(text);
        return { ok: false, reason: result?.reason || "没送进去", copied: true };
      }
      return result;
    } catch (error) {
      clipboard.writeText(text);
      return { ok: false, reason: error.message || "送出失败", copied: true };
    }
  });
  ipcMain.handle("capture", async (_event, id) => {
    const live = seats.get(id);
    if (!live) return { ok: false, reason: "没有这一席" };
    try {
      const text = await runInPage(live.view, readSeat, []);
      if (!text) return { ok: false, reason: "没读到回答。用鼠标在页面里选中那段话，再交一次。" };
      return { ok: true, text };
    } catch (error) {
      return { ok: false, reason: error.message || "没读到" };
    }
  });
}

function createWindow() {
  win = new BaseWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "汇线",
    backgroundColor: "#101210",
  });
  ui = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.contentView.addChildView(ui);
  ui.webContents.loadFile(path.join(__dirname, "renderer", "index.html"));
  for (const seat of SEATS) {
    const live = makeSeat(seat);
    seats.set(seat.id, live);
    win.contentView.addChildView(live.view);
  }
  layout();
  win.on("resize", layout);
  ui.webContents.on("did-finish-load", emit);
}

const locked = app.requestSingleInstanceLock();
if (!locked) {
  app.quit();
} else {
  app.userAgentFallback = UA;
  app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");
  app.commandLine.appendSwitch("disable-features", "UserAgentClientHint");
  app.whenReady().then(() => {
    registerIpc();
    createWindow();
  });
  app.on("second-instance", () => {
    if (win) win.focus();
  });
  app.on("window-all-closed", () => app.quit());
}

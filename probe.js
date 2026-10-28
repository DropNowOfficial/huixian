"use strict";

const path = require("path");
const { app, BaseWindow, WebContentsView } = require("electron");
const { fillSeat, readSeat } = require("./inject");

app.whenReady().then(async () => {
  const win = new BaseWindow({ width: 800, height: 600, show: false });
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 800, height: 600 });
  await view.webContents.loadFile(path.join(__dirname, "fixture.html"));
  const filled = await view.webContents.executeJavaScript(`(${fillSeat.toString()})("hello from relay", "gpt")`, true);
  const value = await view.webContents.executeJavaScript(`document.querySelector("#prompt-textarea").value`, true);
  const read = await view.webContents.executeJavaScript(`(${readSeat.toString()})()`, true);
  const size = typeof win.getContentSize === "function" ? win.getContentSize() : null;
  console.log(JSON.stringify({ view: typeof WebContentsView, filled, value, read: read.slice(0, 24), size }));
  app.exit(filled.ok && value === "hello from relay" && read.includes("上一席") ? 0 : 1);
});

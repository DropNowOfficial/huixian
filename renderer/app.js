const order = ["gpt", "claude", "gemini", "grok"];
const picked = new Set(order);
let mode = "one";
let state = null;

const seatsEl = document.getElementById("seats");
const log = document.getElementById("log");
const draft = document.getElementById("draft");

function say(text) {
  log.textContent = text;
}

function paint() {
  if (!state) return;
  seatsEl.innerHTML = "";
  for (const seat of state.seats) {
    const row = document.createElement("div");
    row.className = "seat" + (seat.id === state.focused ? " on" : "");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = picked.has(seat.id);
    box.addEventListener("click", (event) => {
      event.stopPropagation();
      if (box.checked) picked.add(seat.id);
      else picked.delete(seat.id);
    });
    const name = document.createElement("span");
    name.innerHTML = `<b>${seat.name}</b><small>${seat.hint === "在登录页" ? "在这里登录你的账号" : seat.home.replace("https://", "")}</small>`;
    const hint = document.createElement("span");
    hint.className = "hint" + (seat.hint === "在登录页" || seat.hint === "未打开" ? " wait" : "");
    hint.textContent = seat.hint;
    row.append(box, name, hint);
    row.addEventListener("click", () => window.relay.focus(seat.id));
    seatsEl.append(row);
  }
  document.getElementById("tile").classList.toggle("on", state.tiled);
}

async function send() {
  const text = draft.value.trim();
  if (!text || !state) return;
  const ids = mode === "one" ? [state.focused] : order.filter((id) => picked.has(id));
  if (ids.length === 0) {
    say("先勾一席。");
    return;
  }
  const lines = [];
  for (const id of ids) {
    const result = await window.relay.deliver({ id, text });
    const name = state.seats.find((seat) => seat.id === id)?.name || id;
    lines.push(result.ok ? `${name} 已送出` : `${name}：${result.reason}${result.copied ? " 文字已复制。" : ""}`);
  }
  say(lines.join(" "));
}

async function pass() {
  if (!state) return;
  const from = state.focused;
  const start = order.indexOf(from);
  const next = order[(start + 1) % order.length];
  const taken = await window.relay.capture(from);
  if (!taken.ok) {
    say(taken.reason);
    return;
  }
  await window.relay.focus(next);
  const sent = await window.relay.deliver({
    id: next,
    text: `上一席的原话如下，请接着处理，不要装成上一席：\n\n${taken.text}`,
  });
  const fromName = state.seats.find((seat) => seat.id === from)?.name || from;
  const nextName = state.seats.find((seat) => seat.id === next)?.name || next;
  say(sent.ok ? `已把 ${fromName} 的页面文字交给 ${nextName}` : sent.reason);
}

document.getElementById("mode-one").addEventListener("click", () => {
  mode = "one";
  document.getElementById("mode-one").classList.add("on");
  document.getElementById("mode-all").classList.remove("on");
});
document.getElementById("mode-all").addEventListener("click", () => {
  mode = "all";
  document.getElementById("mode-all").classList.add("on");
  document.getElementById("mode-one").classList.remove("on");
});
document.getElementById("tile").addEventListener("click", () => {
  window.relay.tile(!state?.tiled);
});
document.getElementById("send").addEventListener("click", send);
document.getElementById("pass").addEventListener("click", pass);
draft.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) send();
});

if (!window.relay) {
  say("这是桌面窗口的侧栏。用 npm start 打开后，右边才是各家的登录页。");
} else {
  window.relay.onStatus((next) => {
    state = next;
    paint();
  });
  window.relay.state().then((next) => {
    state = next;
    paint();
  });
}

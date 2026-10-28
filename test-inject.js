"use strict";

const assert = require("assert");
const { fillSeat, readSeat } = require("./inject");

function mount(html) {
  const elements = [];
  class El {
    constructor(tag, attrs, text) {
      this.tagName = tag.toUpperCase();
      this.attrs = attrs;
      this.children = [];
      this.disabled = false;
      this.value = "";
      this.textContent = text || "";
      this.innerText = text || "";
      this.isContentEditable = tag === "div";
      elements.push(this);
    }
    getAttribute(name) {
      return this.attrs[name] || null;
    }
    getBoundingClientRect() {
      return { width: 200, height: 40 };
    }
    focus() {
      this.focused = true;
    }
    click() {
      this.clicked = true;
    }
    dispatchEvent(event) {
      this.event = event;
    }
    matches(selector) {
      if (selector === "#prompt-textarea") return this.attrs.id === "prompt-textarea";
      if (selector.startsWith("button")) return this.tagName === "BUTTON";
      return false;
    }
  }
  const textarea = new El("textarea", { id: "prompt-textarea" });
  const button = new El("button", { "data-testid": "send-button", "aria-label": "Send" });
  const answer = new El(
    "p",
    { "data-message-author-role": "assistant" },
    "上一席已经写好的一段足够长的回答，用来测试交接。这里再补一句，让它稳稳超过读取阈值。",
  );
  const all = [textarea, button, answer];
  global.document = {
    querySelectorAll(selector) {
      if (selector === "#prompt-textarea") return [textarea];
      if (selector.includes("send-button")) return [button];
      if (selector === "button") return [button];
      if (selector.includes("assistant")) return [answer];
      if (selector.includes("textarea")) return [textarea];
      return [];
    },
    createRange() {
      return { selectNodeContents() {} };
    },
    execCommand() {
      return false;
    },
  };
  global.window = {
    getComputedStyle() {
      return { visibility: "visible", display: "block" };
    },
    getSelection() {
      return "";
    },
  };
  global.HTMLTextAreaElement = function HTMLTextAreaElement() {};
  global.HTMLInputElement = function HTMLInputElement() {};
  global.InputEvent = function InputEvent() {};
  global.KeyboardEvent = function KeyboardEvent() {};
  global.Event = function Event() {};
  Object.defineProperty(HTMLTextAreaElement.prototype, "value", {
    set(v) {
      this.value = v;
    },
    configurable: true,
  });
  // The prototype setter above would recurse. Use a map instead.
  const store = new WeakMap();
  Object.defineProperty(HTMLTextAreaElement.prototype, "value", {
    get() {
      return store.get(this) ?? "";
    },
    set(v) {
      store.set(this, v);
    },
    configurable: true,
  });
  Object.setPrototypeOf(textarea, HTMLTextAreaElement.prototype);
  delete textarea.value;
  textarea.getBoundingClientRect = () => ({ width: 200, height: 40 });
  textarea.focus = function focus() {
    this.focused = true;
  };
  textarea.dispatchEvent = function dispatch(event) {
    this.event = event;
  };
  textarea.getAttribute = (name) => textarea.attrs[name] || null;
  return { textarea, button };
}

const page = mount();
const filled = fillSeat("hello from relay", "gpt");
assert.strictEqual(filled.ok, true);
assert.strictEqual(filled.how, "button");
assert.strictEqual(page.button.clicked, true);
assert.strictEqual(page.textarea.value, "hello from relay");
const read = readSeat();
assert.ok(read.includes("上一席"));
console.log("inject ok");

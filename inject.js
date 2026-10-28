"use strict";

function fillSeat(text, seatId) {
  const lists = {
    gpt: ["#prompt-textarea", "div.ProseMirror", "textarea"],
    claude: ['div[contenteditable="true"].ProseMirror', "div.ProseMirror", 'fieldset div[contenteditable="true"]', "textarea"],
    gemini: ['rich-textarea div[contenteditable="true"]', ".ql-editor", 'div[contenteditable="true"]', "textarea"],
    grok: ["textarea", 'div[contenteditable="true"]'],
  };

  function visible(el) {
    if (!el) return false;
    const box = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return box.width > 24 && box.height > 12 && style.visibility !== "hidden" && style.display !== "none";
  }

  function find(selectors) {
    for (const selector of selectors) {
      const found = Array.from(document.querySelectorAll(selector)).find(visible);
      if (found) return found;
    }
    return Array.from(document.querySelectorAll('textarea, div[contenteditable="true"]')).reverse().find(visible) || null;
  }

  function fill(el, value) {
    el.focus();
    const tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") {
      const proto = tag === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const set = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (set) set.call(el, value);
      else el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const inserted = document.execCommand("insertText", false, value);
    if (!inserted || !String(el.innerText || "").includes(value.slice(0, 8))) {
      el.textContent = value;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
    }
  }

  function clickSend() {
    const labeled = [
      'button[data-testid="send-button"]',
      'button[aria-label="Send message"]',
      'button[aria-label="Send"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
      'button[data-testid*="send"]',
    ];
    for (const selector of labeled) {
      const button = Array.from(document.querySelectorAll(selector)).find((el) => visible(el) && !el.disabled);
      if (button) {
        button.click();
        return "button";
      }
    }
    const loose = Array.from(document.querySelectorAll("button")).find((button) => {
      const label = `${button.getAttribute("aria-label") || ""} ${button.getAttribute("data-testid") || ""}`.toLowerCase();
      return visible(button) && !button.disabled && /send|提交|发送/.test(label);
    });
    if (loose) {
      loose.click();
      return "button";
    }
    return "";
  }

  const el = find(lists[seatId] || []);
  if (!el) return { ok: false, reason: "这一页上还没有输入框。先登录，或等页面加载完再送。" };
  fill(el, text);
  const how = clickSend();
  if (!how) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    return { ok: true, how: "enter" };
  }
  return { ok: true, how };
}

function readSeat() {
  const selected = String(window.getSelection ? window.getSelection() : "").trim();
  if (selected.length > 8) return selected.slice(0, 6000);
  const nodes = Array.from(document.querySelectorAll('[data-message-author-role="assistant"], main p, article p'));
  const last = nodes.filter((node) => (node.innerText || "").trim().length > 40).pop();
  return last ? last.innerText.trim().slice(0, 6000) : "";
}

module.exports = { fillSeat, readSeat };

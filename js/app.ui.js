function syncHeight() {
  const minHeight = smallScreenQuery.matches ? 36 : 44;
  const isEmpty = ta.value.trim().length === 0;
  ta.style.height = "0px";
  if (smallScreenQuery.matches && isEmpty) {
    ta.style.height = minHeight + "px";
  } else {
    const next = Math.min(160, Math.max(minHeight, ta.scrollHeight));
    ta.style.height = next + "px";
  }
  const isBusy = window.isGenerating === true;
  send.disabled = isBusy ? false : ta.value.trim().length === 0;
  updateComposerSafeArea();
}
ta.addEventListener("input", syncHeight);
syncHeight();

// Enter to send
ta.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    if (smallScreenQuery?.matches) return;
    e.preventDefault();
    if (!send.disabled) send.click();
  }
});

// ============ ✅ 聊天 UI 容器（动态创建，不改 HTML） ============
const contentEl = document.querySelector(".content");
const mainEl = document.querySelector(".main");
const helloEl = document.querySelector(".hello");
const sidebarEl = document.querySelector(".sidebar");
const sidebarToggle = document.querySelector(".sidebar-toggle");
const sidebarMask = document.querySelector(".sidebar-mask");
composerWrap = document.querySelector(".composer-wrap");
const renameModal = document.getElementById("renameModal");
const renameInput = document.getElementById("renameInput");
const renameOk = document.getElementById("renameOk");
const renameCancel = document.getElementById("renameCancel");
const renameHint = document.getElementById("renameHint");
const deleteModal = document.getElementById("deleteModal");
const deleteOk = document.getElementById("deleteOk");
const deleteCancel = document.getElementById("deleteCancel");
const deleteDesc = document.getElementById("deleteDesc");
const toastContainer = document.getElementById("toastContainer");
let pendingSidebarCloseTimer = null;
let suppressSidebarCloseUntil = 0;
let renameResolve = null;
let deleteResolve = null;
let sessionOpBusy = false;
let sessionOpType = "";
let sessionMenuEl = null;
let sessionMenuTarget = null;

// 消息列表容器
let chatList = document.querySelector(".chat-list");
if (!chatList) {
  chatList = document.createElement("div");
  chatList.className = "chat-list";
  // 放在 hello 后面（hello 之下）
  if (helloEl && helloEl.parentNode) {
    helloEl.insertAdjacentElement("afterend", chatList);
  } else {
    contentEl.appendChild(chatList);
  }
}

function getChatScrollContainer() {
  if (mainEl && mainEl.scrollHeight > mainEl.clientHeight + 2) return mainEl;
  if (contentEl && contentEl.scrollHeight > contentEl.clientHeight + 2) return contentEl;
  return document.scrollingElement || document.documentElement || chatList;
}

function scrollChatToBottom() {
  const el = getChatScrollContainer();
  if (!el) return;
  try {
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  } catch (_) {
    el.scrollTop = el.scrollHeight;
  }
}

function setSidebarOpen(isOpen) {
  if (!sidebarEl) return;
  sidebarEl.classList.toggle("open", isOpen);
  sidebarMask?.classList.toggle("show", isOpen);
  setBodyScrollLocked(isOpen);
}

function isAnyModalOpen() {
  if (renameModal?.classList.contains("show")) return true;
  if (deleteModal?.classList.contains("show")) return true;
  return false;
}

function showToast(message, variant = "info", duration = 1600) {
  if (!toastContainer) return;
  const toast = document.createElement("div");
  toast.className = `toast ${variant}`;
  toast.textContent = String(message || "");
  toastContainer.appendChild(toast);

  const maxToasts = 4;
  while (toastContainer.children.length > maxToasts) {
    toastContainer.removeChild(toastContainer.firstChild);
  }

  setTimeout(() => {
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 220);
  }, duration);
}

async function copyTextToClipboard(text) {
  const content = String(text ?? "");
  if (!content) return false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content);
      return true;
    } catch (_) {}
  }
  try {
    const input = document.createElement("textarea");
    input.value = content;
    input.setAttribute("readonly", "true");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    input.setSelectionRange(0, input.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(input);
    return Boolean(ok);
  } catch (_) {
    return false;
  }
}

function ensureMessageId(msg) {
  if (!msg || typeof msg !== "object") return "";
  if (msg._mid) return String(msg._mid);
  const id = `${Date.now()}_${(++messageIdSeed).toString(36)}`;
  try {
    Object.defineProperty(msg, "_mid", {
      value: id,
      enumerable: false,
      configurable: false,
    });
  } catch (_) {
    msg._mid = id;
  }
  return id;
}

function removeMessageById(msgId) {
  if (!msgId) return false;
  const idx = chatHistory.findIndex((m) => m && String(m._mid || "") === msgId);
  if (idx < 0) return false;
  chatHistory.splice(idx, 1);
  return true;
}

function getLastUserMessage() {
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    const m = chatHistory[i];
    if (m && m.role === "user") return m;
  }
  return null;
}

function syncLastUserEditUI() {
  const last = getLastUserMessage();
  const lastId = last ? String(last._mid || "") : "";
  document.querySelectorAll(".msg-row.user").forEach((row) => {
    const isLast = lastId && row.dataset.msgId === lastId;
    row.classList.toggle("is-last-user", isLast);
    if (!isLast && row.classList.contains("is-editing")) {
      const bubble = row.querySelector(".msg-bubble");
      finishEditMessage(row, bubble, false);
    }
  });
}

function startEditMessage(row, bubble) {
  if (!row || !bubble) return;
  if (!row.classList.contains("is-last-user")) {
    showToast("仅可修改最后一条消息", "warn", 1400);
    return;
  }
  if (ta.disabled) {
    showToast("正在生成中，请稍后再改", "warn", 1400);
    return;
  }
  if (row.classList.contains("is-editing")) return;
  const msgId = row.dataset.msgId || "";
  const msg = chatHistory.find((m) => m && String(m._mid || "") === msgId);
  if (!msg) return;

  row.dataset.editBackup = bubble.dataset.rawText || String(msg.content || "");
  row.classList.add("is-editing");
  row.classList.add("show-actions");

  const content = getBubbleContent(bubble);
  content.innerHTML = "";
  const input = document.createElement("textarea");
  input.className = "msg-edit-input";
  input.value = String(msg.content || "");
  content.appendChild(input);

  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

async function finishEditMessage(row, bubble, save) {
  if (!row || !bubble) return;
  const msgId = row.dataset.msgId || "";
  const msg = chatHistory.find((m) => m && String(m._mid || "") === msgId);
  if (!msg) return;

  if (!save) {
    const original = row.dataset.editBackup || bubble.dataset.rawText || String(msg.content || "");
    bubble.dataset.rawText = original;
    setBubbleText(bubble, original);
    row.classList.remove("is-editing");
    return;
  }

  const input = bubble.querySelector(".msg-edit-input");
  const next = input ? String(input.value || "").trim() : "";
  if (!next) {
    showToast("内容不能为空", "warn", 1400);
    return;
  }

  msg.content = next;
  bubble.dataset.rawText = next;
  setBubbleText(bubble, next);
  row.classList.remove("is-editing");
  row.dataset.editBackup = "";

  await regenerateAfterEdit(row, bubble, msg);
}

async function regenerateAfterEdit(row, bubble, msg) {
  if (!row || !msg) return;
  const msgId = row.dataset.msgId || "";
  const idx = chatHistory.findIndex((m) => m && String(m._mid || "") === msgId);
  if (idx >= 0) {
    chatHistory.splice(idx + 1);
  }
  let next = row.nextSibling;
  while (next) {
    const toRemove = next;
    next = next.nextSibling;
    toRemove.remove();
  }
  syncLastUserEditUI();
  try {
    await generateAssistantResponse(String(msg.content || ""), null);
  } catch (_) {}
}

function ensureMessageActions(bubble, role) {
  if (!bubble) return;
  const mount =
    bubble.parentElement?.classList?.contains("msg-stack") ? bubble.parentElement : bubble;
  let actions = mount.querySelector(".msg-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "msg-actions";
    mount.appendChild(actions);
  }

  if (!actions.querySelector(".msg-copy")) {
    const copyBtn = document.createElement("button");
    copyBtn.className = "msg-action-btn msg-copy";
    copyBtn.type = "button";
    copyBtn.title = "复制";
    copyBtn.setAttribute("aria-label", "复制消息");
    copyBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="9" y="9" width="11" height="11" rx="2"></rect>
        <rect x="4" y="4" width="11" height="11" rx="2"></rect>
      </svg>
    `;
    copyBtn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const payload =
        role === "assistant"
          ? (bubble.dataset.rawMd || bubble.textContent || "")
          : (bubble.dataset.rawText || bubble.textContent || "");
      const ok = await copyTextToClipboard(payload);
      showToast(ok ? "已复制" : "复制失败", ok ? "success" : "error", 1200);
    });
    actions.appendChild(copyBtn);
  }

  if (role === "user" && !actions.querySelector(".msg-edit")) {
    const editBtn = document.createElement("button");
    editBtn.className = "msg-action-btn msg-edit";
    editBtn.type = "button";
    editBtn.title = "修改";
    editBtn.setAttribute("aria-label", "修改消息");
    editBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20h9"></path>
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
      </svg>
    `;
    editBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const row = bubble.closest(".msg-row");
      startEditMessage(row, bubble);
    });
    actions.appendChild(editBtn);
  }

  if (!actions.querySelector(".msg-delete")) {
    const delBtn = document.createElement("button");
    delBtn.className = "msg-action-btn msg-delete";
    delBtn.type = "button";
    delBtn.title = "删除";
    delBtn.setAttribute("aria-label", "删除消息");
    delBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h18"></path>
        <path d="M8 6V4h8v2"></path>
        <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"></path>
        <path d="M10 11v6"></path>
        <path d="M14 11v6"></path>
      </svg>
    `;
    delBtn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (ta.disabled) {
        showToast("正在生成中，请稍后再删", "warn", 1400);
        return;
      }
      const row = bubble.closest(".msg-row");
      if (!row) return;
      const msgId = row.dataset.msgId || "";
      const removed = removeMessageById(msgId);
      row.remove();

      const isNowEmpty = !chatHistory || chatHistory.length === 0;
      if (isNowEmpty) {
        const idToDelete = String(currentChatId || "");
        let deletedOk = false;
        if (idToDelete && serverKey) {
          try {
            const res = await apiPost("delete_chat.php", { key: serverKey, id: idToDelete });
            deletedOk = res?.status === "success";
          } catch (_) {}
        }
        startNewChat();
        try {
          await refreshSessionsList();
        } catch (_) {}
        showToast(deletedOk ? "会话已清空并删除" : "会话已清空", "success", 1400);
        return;
      }

      if (removed) {
        try {
          await saveCurrentChatToServer();
        } catch (_) {}
      }
      syncLastUserEditUI();
      if (!chatList.querySelector(".msg-row") && helloEl) {
        helloEl.style.display = "block";
      }
      showToast("已删除", "success", 1200);
    });
    actions.appendChild(delBtn);
  }

  if (role === "user" && !actions.querySelector(".msg-save")) {
    const saveBtn = document.createElement("button");
    saveBtn.className = "msg-action-btn msg-save";
    saveBtn.type = "button";
    saveBtn.title = "保存";
    saveBtn.setAttribute("aria-label", "保存修改");
    saveBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 6L9 17l-5-5"></path>
      </svg>
    `;
    saveBtn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const row = bubble.closest(".msg-row");
      await finishEditMessage(row, bubble, true);
    });
    actions.appendChild(saveBtn);
  }

  if (role === "user" && !actions.querySelector(".msg-cancel")) {
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "msg-action-btn msg-cancel";
    cancelBtn.type = "button";
    cancelBtn.title = "取消";
    cancelBtn.setAttribute("aria-label", "取消修改");
    cancelBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6l12 12"></path>
        <path d="M18 6l-12 12"></path>
      </svg>
    `;
    cancelBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const row = bubble.closest(".msg-row");
      finishEditMessage(row, bubble, false);
    });
    actions.appendChild(cancelBtn);
  }
}

function updateSessionActionLockUI() {
  if (!sessionsGroupEl) return;
  const btns = sessionsGroupEl.querySelectorAll(".session-menu-btn");
  btns.forEach((btn) => {
    btn.disabled = sessionOpBusy;
  });
}

function setSessionOpBusy(isBusy, type) {
  sessionOpBusy = Boolean(isBusy);
  sessionOpType = isBusy ? String(type || "") : "";
  updateSessionActionLockUI();
  if (sessionOpBusy) {
    closeSessionMenu();
  }
}

function setBodyScrollLocked(locked) {
  if (locked) {
    document.body.classList.add("no-scroll");
    return;
  }
  if (isAnyModalOpen()) return;
  if (sidebarEl?.classList.contains("open")) return;
  document.body.classList.remove("no-scroll");
}

function updateInputHints() {
  if (!ta) return;
  if (smallScreenQuery.matches) {
    ta.setAttribute("placeholder", "输入内容...");
    const hintEl = document.querySelector(".composer .hint");
    if (hintEl) hintEl.textContent = "";
  } else {
    ta.setAttribute("placeholder", DEFAULT_PLACEHOLDER);
    const hintEl = document.querySelector(".composer .hint");
    if (hintEl) {
      hintEl.textContent = "请您遵守相关规定使用。AI也可能会出错，请核查重要信息。";
    }
  }
}

function updateComposerSafeArea() {
  if (!composerWrap) return;
  const rect = composerWrap.getBoundingClientRect();
  const bottomGap = Math.max(0, window.innerHeight - rect.bottom);
  const safe = Math.ceil(rect.height + bottomGap + 12);
  document.documentElement.style.setProperty("--composer-safe-bottom", `${safe}px`);
}

function suppressSidebarClose(ms) {
  suppressSidebarCloseUntil = Date.now() + (ms || 0);
}

function scheduleSidebarClose() {
  if (!smallScreenQuery.matches) return;
  if (Date.now() < suppressSidebarCloseUntil) return;
  if (pendingSidebarCloseTimer) {
    clearTimeout(pendingSidebarCloseTimer);
    pendingSidebarCloseTimer = null;
  }
  closeSidebarIfSmall();
}

function cancelSidebarClose() {
  if (pendingSidebarCloseTimer) {
    clearTimeout(pendingSidebarCloseTimer);
    pendingSidebarCloseTimer = null;
  }
}

function closeSidebarIfSmall() {
  if (smallScreenQuery.matches) {
    setSidebarOpen(false);
  }
}

function ensureSessionMenu() {
  if (sessionMenuEl) return sessionMenuEl;
  const menu = document.createElement("div");
  menu.className = "session-menu";
  menu.innerHTML = `
    <button type="button" class="session-menu-item" data-action="rename">改名</button>
    <button type="button" class="session-menu-item danger" data-action="delete">删除</button>
  `;
  document.body.appendChild(menu);

  menu.addEventListener("click", async (ev) => {
    const btn = ev.target.closest(".session-menu-item");
    if (!btn || !sessionMenuTarget) return;
    ev.stopPropagation();
    const action = btn.dataset.action;
    const target = sessionMenuTarget;
    closeSessionMenu();
    const { id, item, titleText, short } = target;
    if (action === "rename") {
      await promptRenameSession(id, titleText, short);
    } else if (action === "delete") {
      await deleteSession(id, item, titleText, short);
    }
  });

  sessionMenuEl = menu;
  return menu;
}

function openSessionMenu(anchorBtn, target) {
  if (sessionOpBusy) {
    showToast("正在处理其他会话，请稍候", "warn");
    return;
  }
  const menu = ensureSessionMenu();
  if (menu.classList.contains("open") && sessionMenuTarget?.id === target?.id) {
    closeSessionMenu();
    return;
  }

  closeSessionMenu();
  sessionMenuTarget = target;

  const btnRect = anchorBtn.getBoundingClientRect();
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  menu.classList.add("open");
  menu.style.visibility = "hidden";
  menu.style.left = "0px";
  menu.style.top = "0px";

  const menuRect = menu.getBoundingClientRect();
  const menuWidth = menuRect.width || 140;
  const menuHeight = menuRect.height || 88;

  let left = btnRect.right - menuWidth;
  left = Math.max(8, Math.min(left, viewportW - menuWidth - 8));

  let top = btnRect.bottom + 6;
  if (top + menuHeight > viewportH - 8) {
    top = btnRect.top - menuHeight - 6;
  }

  menu.style.left = `${left}px`;
  menu.style.top = `${Math.max(8, top)}px`;
  menu.style.visibility = "visible";
  anchorBtn.setAttribute("aria-expanded", "true");
}

function closeSessionMenu() {
  if (!sessionMenuEl) return;
  sessionMenuEl.classList.remove("open");
  sessionMenuEl.style.visibility = "";
  sessionMenuTarget = null;
  document.querySelectorAll(".session-menu-btn[aria-expanded=\"true\"]")
    .forEach((btn) => btn.setAttribute("aria-expanded", "false"));
}

function openRenameModal(initialValue) {
  if (!renameModal || !renameInput || !renameOk || !renameCancel) {
    return Promise.resolve(null);
  }
  renameInput.value = String(initialValue || "");
  if (renameHint) {
    renameHint.textContent = "最多 60 个字符";
    renameHint.classList.remove("error");
  }
  renameModal.classList.add("show");
  renameModal.setAttribute("aria-hidden", "false");
  setBodyScrollLocked(true);

  requestAnimationFrame(() => {
    renameInput.focus();
    renameInput.select();
  });

  return new Promise((resolve) => {
    renameResolve = resolve;
  });
}

function closeRenameModal(result) {
  if (!renameModal) return;
  renameModal.classList.remove("show");
  renameModal.setAttribute("aria-hidden", "true");
  setBodyScrollLocked(false);

  if (renameResolve) {
    const resolve = renameResolve;
    renameResolve = null;
    resolve(result ?? null);
  }
}

renameOk?.addEventListener("click", () => {
  const value = normalizeTitleText(renameInput?.value || "");
  if (!value) {
    if (renameHint) {
      renameHint.textContent = "标题不能为空";
      renameHint.classList.add("error");
    }
    renameInput?.focus();
    return;
  }
  closeRenameModal(value);
});

renameCancel?.addEventListener("click", () => {
  closeRenameModal(null);
});

renameModal?.addEventListener("click", (ev) => {
  if (ev.target === renameModal) {
    closeRenameModal(null);
  }
});

renameInput?.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") {
    ev.preventDefault();
    renameOk?.click();
  }
  if (ev.key === "Escape") {
    ev.preventDefault();
    closeRenameModal(null);
  }
});

function openDeleteModal(sessionName) {
  if (!deleteModal || !deleteOk || !deleteCancel) {
    return Promise.resolve(false);
  }
  if (deleteDesc) {
    deleteDesc.textContent = sessionName
      ? `确认删除会话“${sessionName}”？`
      : "确认删除该会话？";
  }
  deleteModal.classList.add("show");
  deleteModal.setAttribute("aria-hidden", "false");
  setBodyScrollLocked(true);

  return new Promise((resolve) => {
    deleteResolve = resolve;
  });
}

function closeDeleteModal(result) {
  if (!deleteModal) return;
  deleteModal.classList.remove("show");
  deleteModal.setAttribute("aria-hidden", "true");
  setBodyScrollLocked(false);

  if (deleteResolve) {
    const resolve = deleteResolve;
    deleteResolve = null;
    resolve(Boolean(result));
  }
}

deleteOk?.addEventListener("click", () => {
  closeDeleteModal(true);
});

deleteCancel?.addEventListener("click", () => {
  closeDeleteModal(false);
});

deleteModal?.addEventListener("click", (ev) => {
  if (ev.target === deleteModal) {
    closeDeleteModal(false);
  }
});

sidebarToggle?.addEventListener("click", () => {
  const isOpen = sidebarEl?.classList.contains("open");
  setSidebarOpen(!isOpen);
});

sidebarMask?.addEventListener("click", () => {
  setSidebarOpen(false);
});

smallScreenQuery.addEventListener("change", (e) => {
  if (!e.matches) {
    setSidebarOpen(false);
  }
  updateInputHints();
  syncHeight();
});

updateInputHints();

if (composerWrap) {
  updateComposerSafeArea();
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => updateComposerSafeArea());
    ro.observe(composerWrap);
  } else {
    window.addEventListener("resize", updateComposerSafeArea);
  }
}


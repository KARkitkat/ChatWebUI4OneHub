// ============ ✅ 上下文：历史对话存储与裁剪（Server Storage, api/*） ============
//
// 后端接口：
// - POST api/get_chat_history.php { key }               -> [ { id, title, model }, ... ] (兼容旧 ["123...789.txt", ...])
// - POST api/get_chat.php         { key, id }           -> { status, content, title, model }
// - POST api/put_chat.php         { key, id?, content, model } -> { status, id }
// - POST api/update_chat_title.php{ key, id, title }    -> { status, title }
// - POST api/delete_chat.php      { key, id }           -> { status }
//
// 说明：这里把“apiToken”做一次 SHA-256 哈希后当作 key 发给后端，避免把真实 token 当目录名暴露。
//       key 只包含 [0-9a-f]，也能通过后端的 key 格式校验。

const API_BASE = "api";
const LEGACY_LOCAL_HISTORY_KEY = "chat_history_v1"; // 旧版本 localStorage 历史
const ACTIVE_CHAT_ID_KEY = "active_chat_id_v1";
const ACTIVE_SIDE_KIND_KEY = "active_side_kind_v1";

function normalizeSideKind(kind) {
  const k = String(kind || "").trim();
  if (k === "new" || k === "session" || k === "prompt") return k;
  return "";
}

function emitSideChanged() {
  try {
    document.dispatchEvent(
      new CustomEvent("side:changed", {
        detail: {
          kind: activeSideKind,
          promptKey: activePromptKey,
          chatId: currentChatId,
        },
      })
    );
  } catch (_) {}
}

// 你可以按需要调：发给模型时最多带多少条、最多带多少字符（粗略等价 token 限制）
// 注意：这里只影响“发给模型的上下文”，不会影响“服务端存储的完整历史”
const HISTORY_MAX_MESSAGES = 30; // 历史对话条数
const HISTORY_MAX_CHARS = 24000; // 上下文长度

// 会话内完整历史（服务端持久化）
let chatHistory = [];
let currentChatId = localStorage.getItem(ACTIVE_CHAT_ID_KEY) || "";
let currentChatTitle = "";
let chatLoadVersion = 0; // 防止旧会话加载回写到新会话
const storedSideKind = normalizeSideKind(localStorage.getItem(ACTIVE_SIDE_KIND_KEY));
let activeSideKind = storedSideKind === "session" && !currentChatId
  ? "new"
  : (storedSideKind || (currentChatId ? "session" : "new"));
let activePromptKey = "";
let messageIdSeed = 0;

// serverKey = sha256(apiToken) 的 hex 字符串
let serverKey = "";
let lastSessionsSnapshot = [];

// 批量删除（历史记录）
let isBatchDeleteMode = false;
const batchSelectedIds = new Set();
let batchDeleteBtnEl = null;

// 侧边栏会话列表容器（复用 HTML 里空的 side-group）
const sideGroups = document.querySelectorAll(".side-group");
const sessionsGroupEl = sideGroups?.[sideGroups.length - 1] || null;
const topbarEl = document.querySelector(".topbar");
let newChatBtn = null;
let composerWrap = null;
const promptTranslateBtn = document.querySelector('.side-item[data-prompt="translate"]');
const promptOptimizeBtn = document.querySelector('.side-item[data-prompt="optimize"]');
const promptDrawBtn = document.querySelector('.side-item[data-prompt="draw"]');
const promptVideoBtn = document.querySelector('.side-item[data-prompt="video"]');

const PROMPT_TEXTS = {
  translate: "请将以下文本翻译成英文：\n",
  optimize: "请优化以下文本，使其更清晰、更流畅：\n",
  draw: "创建一幅图片：",
  video: "创作一段视频：",
};

const DRAW_AUTO_MODEL_ID = "nano-banana";
const VIDEO_AUTO_MODEL_ID = "veo-3.1";
const DRAW_MODEL_STORAGE_KEY =
  typeof MODEL_STORAGE_KEY === "string" ? MODEL_STORAGE_KEY : "selected_model_v1";
const VIDEO_MODEL_STORAGE_KEY = "selected_video_model_v1";
let drawAutoModelEnabled = false;
let drawAutoModelRestore = "";
let videoAutoModelEnabled = false;
let videoAutoModelRestore = "";

function getCurrentSelectedModelValue() {
  const el = document.getElementById("selected-model");
  if (!el) return "";
  const fromData = el.dataset.modelId;
  if (fromData !== undefined && fromData !== "") return String(fromData).trim();
  return String(el.textContent || "").trim();
}

function drawAutoNormalizeModelId(value) {
  return String(value ?? "").trim().toLowerCase();
}

function drawAutoGetSelectedModelValue() {
  return getCurrentSelectedModelValue();
}

function drawAutoApplySelectedModel(modelId, options = {}) {
  const next = String(modelId ?? "").trim();
  if (!next) return;
  if (typeof setSelectedModel === "function") {
    setSelectedModel(next, options);
    return;
  }
  const modelEl = document.getElementById("selected-model");
  if (modelEl) modelEl.textContent = next;
  const persist = options?.persist !== false;
  if (persist) {
    try {
      localStorage.setItem(DRAW_MODEL_STORAGE_KEY, next);
    } catch (_) {}
  }
  document.dispatchEvent(new CustomEvent("model:selected", { detail: { modelId: next } }));
}

function enableDrawAutoModel() {
  if (!drawAutoModelEnabled) {
    drawAutoModelRestore = drawAutoGetSelectedModelValue();
  }
  drawAutoModelEnabled = true;
  if (
    drawAutoNormalizeModelId(drawAutoGetSelectedModelValue()) !==
    drawAutoNormalizeModelId(DRAW_AUTO_MODEL_ID)
  ) {
    drawAutoApplySelectedModel(DRAW_AUTO_MODEL_ID, { persist: false });
  }
}

function disableDrawAutoModel() {
  if (!drawAutoModelEnabled) return;
  drawAutoModelEnabled = false;
  const stored = localStorage.getItem(DRAW_MODEL_STORAGE_KEY) || "";
  const target = stored || drawAutoModelRestore;
  if (
    target &&
    drawAutoNormalizeModelId(target) !==
      drawAutoNormalizeModelId(drawAutoGetSelectedModelValue())
  ) {
    drawAutoApplySelectedModel(target, { persist: false });
  }
  drawAutoModelRestore = "";
}

function videoAutoGetSelectedModelValue() {
  return getCurrentSelectedModelValue();
}

function videoAutoApplySelectedModel(modelId, options = {}) {
  const next = String(modelId ?? "").trim();
  if (!next) return;
  if (typeof setSelectedModel === "function") {
    setSelectedModel(next, options);
    return;
  }
  const modelEl = document.getElementById("selected-model");
  if (modelEl) {
    modelEl.dataset.modelId = next;
    modelEl.textContent = next;
  }
  const persist = options?.persist !== false;
  if (persist) {
    try {
      localStorage.setItem(VIDEO_MODEL_STORAGE_KEY, next);
    } catch (_) {}
  }
  document.dispatchEvent(new CustomEvent("model:selected", { detail: { modelId: next } }));
}

function enableVideoAutoModel() {
  if (!videoAutoModelEnabled) {
    videoAutoModelRestore = videoAutoGetSelectedModelValue();
  }
  videoAutoModelEnabled = true;
  if (
    drawAutoNormalizeModelId(videoAutoGetSelectedModelValue()) !==
    drawAutoNormalizeModelId(VIDEO_AUTO_MODEL_ID)
  ) {
    videoAutoApplySelectedModel(VIDEO_AUTO_MODEL_ID, { persist: false });
  }
}

function disableVideoAutoModel() {
  if (!videoAutoModelEnabled) return;
  videoAutoModelEnabled = false;
  const stored = localStorage.getItem(VIDEO_MODEL_STORAGE_KEY) || "";
  const target = stored || videoAutoModelRestore;
  if (
    target &&
    drawAutoNormalizeModelId(target) !==
      drawAutoNormalizeModelId(videoAutoGetSelectedModelValue())
  ) {
    videoAutoApplySelectedModel(target, { persist: false });
  }
  videoAutoModelRestore = "";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sha256Hex(input) {
  const text = String(input ?? "");
  if (window.crypto?.subtle?.digest && typeof TextEncoder !== "undefined") {
    try {
      const enc = new TextEncoder();
      const buf = enc.encode(text);
      const hashBuf = await crypto.subtle.digest("SHA-256", buf);
      const bytes = Array.from(new Uint8Array(hashBuf));
      return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (_) {
      // fallback below
    }
  }
  return sha256HexFallback(text);
}

function toUtf8Bytes(str) {
  if (typeof TextEncoder !== "undefined") {
    return Array.from(new TextEncoder().encode(str));
  }
  const utf8 = unescape(encodeURIComponent(str));
  const bytes = new Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) {
    bytes[i] = utf8.charCodeAt(i);
  }
  return bytes;
}

function sha256HexFallback(input) {
  const bytes = toUtf8Bytes(String(input ?? ""));
  let ascii = "";
  for (let i = 0; i < bytes.length; i++) {
    ascii += String.fromCharCode(bytes[i]);
  }
  return sha256Ascii(ascii);
}

function sha256Ascii(ascii) {
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i;
  let j;
  let result = "";

  const words = [];
  const asciiBitLength = ascii.length * 8;

  const k = sha256Ascii.k || [];
  const h = sha256Ascii.h || [];
  let primeCounter = k.length;
  const isComposite = {};

  if (!primeCounter) {
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) {
          isComposite[i] = candidate;
        }
        h[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    sha256Ascii.h = h;
    sha256Ascii.k = k;
  }

  let hash = (sha256Ascii.h || h).slice(0);

  ascii += "\x80";
  while (ascii.length % 64 - 56) ascii += "\x00";
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (j = 0; j < words.length;) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);
    let a = oldHash[0];
    let b = oldHash[1];
    let c = oldHash[2];
    let d = oldHash[3];
    let e = oldHash[4];
    let f = oldHash[5];
    let g = oldHash[6];
    let hh = oldHash[7];

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const s0 = i < 16
        ? w[i]
        : (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0;
      w[i] = s0;

      const t1 = (hh + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e & f) ^ (~e & g)) + k[i] + w[i]) | 0;
      const t2 = ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;

      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }

    hash[0] = (oldHash[0] + a) | 0;
    hash[1] = (oldHash[1] + b) | 0;
    hash[2] = (oldHash[2] + c) | 0;
    hash[3] = (oldHash[3] + d) | 0;
    hash[4] = (oldHash[4] + e) | 0;
    hash[5] = (oldHash[5] + f) | 0;
    hash[6] = (oldHash[6] + g) | 0;
    hash[7] = (oldHash[7] + hh) | 0;
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }

  return result;
}

function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

async function apiPost(path, dataObj) {
  const fd = new FormData();
  Object.entries(dataObj || {}).forEach(([k, v]) => fd.append(k, String(v ?? "")));

  const resp = await fetch(`${API_BASE}/${path}`, {
    method: "POST",
    body: fd,
  });

  const text = await resp.text().catch(() => "");
  if (!resp.ok) {
    throw new Error(`API ${path} HTTP ${resp.status}: ${text || resp.statusText}`);
  }

  // 兼容：有些情况下 PHP 可能输出空白
  try {
    return text ? JSON.parse(text) : null;
  } catch (e) {
    throw new Error(`API ${path} 返回非 JSON：${text?.slice(0, 200)}`);
  }
}

function buildPersistPayload() {
  // 这里存“完整历史”，不做 trim
  const title = resolveChatTitle();
  const model = getCurrentSelectedModelValue();
  const safeMessages = (chatHistory || []).map((m) => {
    if (!m || typeof m !== "object") return m;
    const copy = { ...m };
    delete copy._mid;
    return copy;
  });

  return JSON.stringify({
    v: 1,
    title,
    model,
    updatedAt: Date.now(),
    messages: safeMessages,
  });
}

function normalizeTitleText(title) {
  const t = String(title ?? "").replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 60) : t;
}

function normalizeModelText(model) {
  return String(model ?? "").trim();
}

function deriveTitleFromHistory(history) {
  const firstUser = (history || []).find(
    (m) => m?.role === "user" && String(m.content ?? "").trim() !== ""
  );
  const raw = firstUser ? String(firstUser.content).trim() : "新会话";
  return normalizeTitleText(raw) || "新会话";
}

function extractTitleFromPayload(raw) {
  if (!raw) return "";
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      if (obj.title) return normalizeTitleText(obj.title);
      if (Array.isArray(obj.messages)) return deriveTitleFromHistory(obj.messages);
    }
    if (Array.isArray(obj)) return deriveTitleFromHistory(obj);
  } catch (_) {}
  return "";
}

function extractModelFromPayload(raw) {
  if (!raw) return "";
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && obj.model) {
      return normalizeModelText(obj.model);
    }
  } catch (_) {}
  return "";
}

function applySessionModel(modelId) {
  const next = normalizeModelText(modelId);
  if (!next) return;
  if (typeof window.setSelectedModel === "function") {
    window.setSelectedModel(next, { persist: false });
    return;
  }
  const modelEl = document.getElementById("selected-model");
  if (modelEl) modelEl.textContent = next;
  document.dispatchEvent(new CustomEvent("model:selected", { detail: { modelId: next } }));
}

function resolveChatTitle() {
  const cur = normalizeTitleText(currentChatTitle);
  if (cur && cur !== "新会话") {
    currentChatTitle = cur;
    return cur;
  }
  const derived = deriveTitleFromHistory(chatHistory);
  currentChatTitle = derived;
  return derived;
}

function parsePersistPayload(raw) {
  if (!raw) return [];
  // 1) 我们的新格式：{ v, title, updatedAt, messages: [...] }
  try {
    const obj = JSON.parse(raw);
    if (obj && Array.isArray(obj.messages)) {
      return obj.messages.filter((m) => m && m.role);
    }
    // 2) 旧格式：直接是数组
    if (Array.isArray(obj)) {
      return obj.filter((m) => m && m.role);
    }
  } catch (_) {}

  // 3) 实在不是 JSON：当作一段文本
  return [{ role: "assistant", content: String(raw) }];
}

function trimHistory(history) {
  const src = Array.isArray(history) ? history : [];
  let out = [];
  let totalChars = 0;

  for (let i = src.length - 1; i >= 0; i--) {
    const m = src[i];
    if (!m || !m.role) continue;

    const content = String(m.content ?? "");
    if (m.role === "assistant" && content.trim() === "") continue;

    const approx = content.length + 20;
    if (out.length >= HISTORY_MAX_MESSAGES) break;
    if (totalChars + approx > HISTORY_MAX_CHARS) break;

    out.push({ role: m.role, content });
    totalChars += approx;
  }

  out.reverse();
  return out;
}

function setActiveChatId(id) {
  currentChatId = String(id || "");
  if (currentChatId) localStorage.setItem(ACTIVE_CHAT_ID_KEY, currentChatId);
  else localStorage.removeItem(ACTIVE_CHAT_ID_KEY);
  if (activeSideKind !== "prompt") {
    activeSideKind = currentChatId ? "session" : "new";
    try {
      localStorage.setItem(ACTIVE_SIDE_KIND_KEY, activeSideKind);
    } catch (_) {}
  }
  syncNewChatActiveState();
  syncSessionActiveStyles();
  syncTopbarVisibility();
  emitSideChanged();
}

function syncNewChatActiveState() {
  syncSideSelection();
}

function syncSessionActiveStyles() {
  syncSideSelection();
}

function syncSideSelection() {
  const allItems = document.querySelectorAll(".side-item");
  allItems.forEach((item) => item.classList.remove("is-active"));

  if (activeSideKind === "new" && newChatBtn) {
    newChatBtn.classList.add("is-active");
  }

  if (activeSideKind === "prompt") {
    if (activePromptKey === "translate") {
      promptTranslateBtn?.classList.add("is-active");
    }
    if (activePromptKey === "optimize") {
      promptOptimizeBtn?.classList.add("is-active");
    }
    if (activePromptKey === "draw") {
      promptDrawBtn?.classList.add("is-active");
    }
    if (activePromptKey === "video") {
      promptVideoBtn?.classList.add("is-active");
    }
  }

  if (activeSideKind === "session" && sessionsGroupEl) {
    const items = sessionsGroupEl.querySelectorAll(".side-item");
    items.forEach((item) => {
      const id = String(item.dataset.chatId || "");
      if (id && id === currentChatId) {
        item.classList.add("is-active");
      }
    });
  }
}

function setActiveSideKind(kind, options = {}) {
  activeSideKind = normalizeSideKind(kind) || "new";
  try {
    localStorage.setItem(ACTIVE_SIDE_KIND_KEY, activeSideKind);
  } catch (_) {}
  const keepModel = Boolean(options?.keepModel);
  if (activeSideKind !== "prompt" && !keepModel) {
    disableDrawAutoModel();
    disableVideoAutoModel();
  }
  syncSideSelection();
  syncTopbarVisibility();
  emitSideChanged();
}

function syncTopbarVisibility() {
  if (!topbarEl) return;
  const shouldShow = activeSideKind !== "session";
  topbarEl.style.display = shouldShow ? "" : "none";
}

function stripPromptPrefix(text, key) {
  const prompt = PROMPT_TEXTS[key];
  if (!prompt) return text;
  if (text.startsWith(prompt)) {
    return text.slice(prompt.length).replace(/^\n+/, "");
  }
  return text;
}

function clearPromptSelection(options = {}) {
  const keepModel = Boolean(options?.keepModel);
  if (drawAutoModelEnabled && !keepModel) {
    disableDrawAutoModel();
  }
  if (videoAutoModelEnabled && !keepModel) {
    disableVideoAutoModel();
  }
  if (!activePromptKey) return;
  ta.value = stripPromptPrefix(ta.value || "", activePromptKey);
  activePromptKey = "";
  syncHeight();
}

function updateBatchDeleteHeaderUI() {
  if (!batchDeleteBtnEl) return;
  const count = batchSelectedIds.size;
  batchDeleteBtnEl.textContent = count ? `删除(${count})` : "删除";
  const busy = typeof sessionOpBusy !== "undefined" && sessionOpBusy;
  batchDeleteBtnEl.disabled = count <= 0 || busy;
}

function setBatchDeleteMode(on) {
  const next = Boolean(on);
  isBatchDeleteMode = next;
  if (!next) {
    batchSelectedIds.clear();
  }
  batchDeleteBtnEl = null;
  // 不额外拉取数据，直接用最近一次快照重绘
  try {
    renderSessionsList(lastSessionsSnapshot);
  } catch (_) {}
}

async function deleteSelectedSessions() {
  if (typeof sessionOpBusy !== "undefined" && sessionOpBusy) {
    showToast("正在处理其他会话，请稍候", "warn");
    return;
  }
  if (!serverKey) {
    showToast("未登录或缺少授权。", "error");
    return;
  }

  const ids = Array.from(batchSelectedIds).filter((id) => /^\d{18}$/.test(String(id || "")));
  if (ids.length === 0) {
    showToast("请先选择要删除的会话", "warn", 1400);
    return;
  }

  const ok = await openDeleteModal(`选中的 ${ids.length} 个会话`);
  if (!ok) return;
  if (typeof sessionOpBusy !== "undefined" && sessionOpBusy) {
    showToast("正在处理其他会话，请稍候", "warn");
    return;
  }

  let success = 0;
  let deletedCurrent = false;

  try {
    if (typeof setSessionOpBusy === "function") {
      setSessionOpBusy(true, "delete");
    }
    for (const id of ids) {
      try {
        const res = await apiPost("delete_chat.php", { key: serverKey, id });
        if (res?.status === "success") {
          success++;
          if (id === currentChatId) deletedCurrent = true;
        }
      } catch (_) {}
    }

    if (deletedCurrent) {
      startNewChat();
    }

    batchSelectedIds.clear();
    isBatchDeleteMode = false;
    await refreshSessionsList();

    if (success === ids.length) {
      showToast("删除完成", "success", 1400);
    } else if (success > 0) {
      showToast(`部分删除成功（${success}/${ids.length}）`, "warn", 1800);
    } else {
      showToast("删除失败", "error", 1800);
    }
  } finally {
    if (typeof setSessionOpBusy === "function") {
      setSessionOpBusy(false, "");
    }
  }
}

function activatePrompt(key) {
  const prompt = PROMPT_TEXTS[key];
  if (!prompt) return;

  let content = ta.value || "";
  if (activePromptKey && activePromptKey !== key) {
    content = stripPromptPrefix(content, activePromptKey);
  }

  if (!content.startsWith(prompt)) {
    content = content ? `${prompt}${content}` : prompt;
  }

  ta.value = content;
  activePromptKey = key;
  setActiveSideKind("prompt");
  if (key === "draw") {
    enableDrawAutoModel();
    disableVideoAutoModel();
  } else if (key === "video") {
    enableVideoAutoModel();
    disableDrawAutoModel();
  } else {
    disableDrawAutoModel();
    disableVideoAutoModel();
    applySessionModel("gpt-4");
  }
  syncHeight();
  ta.focus();
}

async function saveCurrentChatToServer() {
  if (!serverKey) return;

  const before = currentChatId;
  const payload = buildPersistPayload();

  const res = await apiPost("put_chat.php", {
    key: serverKey,
    id: currentChatId,
    content: payload,
    model: getCurrentSelectedModelValue(),
  });

  if (res?.status === "success" && res?.id) {
    setActiveChatId(res.id);
  }

  // 如果是新会话第一次保存，刷新侧边栏列表
  if (!before && currentChatId) {
    // 模板（翻译/优化/绘图）首次生成会话后，自动切到“历史记录”条目，避免一直停留在模板选中态
    if (activeSideKind === "prompt" && activePromptKey) {
      const keepDrawModel = activePromptKey === "draw";
      const keepVideoModel = activePromptKey === "video";
      clearPromptSelection({ keepModel: keepDrawModel || keepVideoModel });
      setActiveSideKind("session", { keepModel: keepDrawModel || keepVideoModel });
    }
    await refreshSessionsList();
  }
}

async function loadChatFromServer(id) {
  const targetId = String(id || "");
  if (!serverKey || !targetId) return false;

  const loadVersion = ++chatLoadVersion;

  const res = await apiPost("get_chat.php", { key: serverKey, id: targetId });
  if (res?.status !== "success") throw new Error("读取会话失败");

  if (loadVersion !== chatLoadVersion) return false;
  chatHistory = parsePersistPayload(res.content || "");
  const serverTitle = normalizeTitleText(res?.title || "");
  currentChatTitle = serverTitle || extractTitleFromPayload(res.content || "");
  setActiveChatId(targetId);
  const serverModel =
    normalizeModelText(res?.model || "") || extractModelFromPayload(res.content || "");
  if (serverModel) {
    applySessionModel(serverModel);
  }
  return true;
}

async function fetchSessions() {
  const res = await apiPost("get_chat_history.php", { key: serverKey });
  const arr = Array.isArray(res) ? res : [];
  const out = [];

  for (const item of arr) {
    if (typeof item === "string") {
      const id = String(item || "").replace(/\.txt$/i, "");
      if (/^\d{18}$/.test(id)) out.push({ id, title: "" });
      continue;
    }

    if (item && typeof item === "object") {
      const id = String(item.id || "").replace(/\.txt$/i, "");
      if (!/^\d{18}$/.test(id)) continue;
      const title = String(item.title || "").trim();
      out.push({ id, title });
    }
  }

  return out;
}

function clearChatUI() {
  chatList.innerHTML = "";
  if (helloEl) helloEl.style.display = "block";
}

function renderHistoryToUI() {
  clearChatUI();
  if (!chatHistory || chatHistory.length === 0) return;

  for (const m of chatHistory) {
    if (!m || !m.role) continue;
    const role = m.role === "assistant" ? "assistant" : "user";
    appendMessage(role, String(m.content ?? ""), m);
  }

  syncLastUserEditUI();
  requestAnimationFrame(() => {
    scrollChatToBottom();
    requestAnimationFrame(scrollChatToBottom);
  });
  setTimeout(scrollChatToBottom, 80);
}

async function promptRenameSession(id, titleText, short) {
  if (sessionOpBusy) {
    showToast("正在处理其他会话，请稍候", "warn");
    return;
  }
  if (!currentChatId || id !== currentChatId) {
    showToast("请先打开该会话再修改标题。", "warn");
    return;
  }

  suppressSidebarClose(2000);
  cancelSidebarClose();

  const fallbackName = titleText || currentChatTitle || `会话 ${short}`;
  const input = await openRenameModal(fallbackName);
  if (input === null) return;

  const nextTitle = normalizeTitleText(input);
  if (!nextTitle) return;
  if (sessionOpBusy) {
    showToast("正在处理其他会话，请稍候", "warn");
    return;
  }

  try {
    setSessionOpBusy(true, "rename");
    const res = await apiPost("update_chat_title.php", {
      key: serverKey,
      id,
      title: nextTitle,
    });

    if (res?.status === "success") {
      const updatedTitle = normalizeTitleText(res?.title || nextTitle);
      currentChatTitle = updatedTitle;
      const currentItem = sessionsGroupEl?.querySelector(`[data-chat-id="${id}"]`);
      const nameEl = currentItem?.querySelector(".session-name");
      if (nameEl) nameEl.textContent = updatedTitle;
      await refreshSessionsList();
      showToast("修改完成", "success", 1400);
    } else {
      showToast("修改失败", "error", 1600);
    }
  } catch (e) {
    showToast("修改失败", "error", 1600);
  } finally {
    setSessionOpBusy(false, "");
  }
}

async function deleteSession(id, item, titleText, short) {
  if (sessionOpBusy) {
    showToast("正在处理其他会话，请稍候", "warn");
    return;
  }

  if (!serverKey) {
    showToast("未登录或缺少授权。", "error");
    return;
  }

  const name = titleText || (id === currentChatId ? currentChatTitle : "") || `会话 ${short}`;
  const ok = await openDeleteModal(name);
  if (!ok) return;
  if (sessionOpBusy) {
    showToast("正在处理其他会话，请稍候", "warn");
    return;
  }

  try {
    setSessionOpBusy(true, "delete");
    const res = await apiPost("delete_chat.php", { key: serverKey, id });
    if (res?.status === "success") {
      if (id === currentChatId) {
        startNewChat();
      }
      if (item) item.remove();
      await refreshSessionsList();
      scheduleSidebarClose();
      showToast("删除完成", "success", 1400);
      return;
    }
    showToast("删除失败", "error", 1600);
  } catch (e) {
    showToast("删除失败", "error", 1600);
  } finally {
    setSessionOpBusy(false, "");
  }
}

function renderSessionsList(sessions) {
  if (!sessionsGroupEl) return;
  sessionsGroupEl.innerHTML = "";

  const list = Array.isArray(sessions) ? sessions : [];
  if (list.length === 0) {
    // 列表为空时自动退出批量删除（否则没有入口退出）
    isBatchDeleteMode = false;
    batchSelectedIds.clear();
    batchDeleteBtnEl = null;
    const empty = document.createElement("div");
    empty.className = "side-title";
    empty.textContent = "暂无历史记录";
    sessionsGroupEl.appendChild(empty);
    return;
  }

  const title = document.createElement("div");
  title.className = "side-title side-title-row";
  const titleTextEl = document.createElement("span");
  titleTextEl.className = "side-title-text";
  titleTextEl.textContent = "历史记录";
  const actionsEl = document.createElement("div");
  actionsEl.className = "side-title-actions";

  if (isBatchDeleteMode) {
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "side-title-btn";
    cancelBtn.type = "button";
    cancelBtn.textContent = "取消";
    cancelBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setBatchDeleteMode(false);
    });

    const delBtn = document.createElement("button");
    delBtn.className = "side-title-btn danger";
    delBtn.type = "button";
    delBtn.textContent = "删除";
    delBtn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      await deleteSelectedSessions();
    });
    batchDeleteBtnEl = delBtn;
    updateBatchDeleteHeaderUI();

    actionsEl.appendChild(cancelBtn);
    actionsEl.appendChild(delBtn);
  } else {
    const bulkBtn = document.createElement("button");
    bulkBtn.className = "side-title-btn";
    bulkBtn.type = "button";
    bulkBtn.textContent = "批量删除";
    bulkBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      batchSelectedIds.clear();
      setBatchDeleteMode(true);
    });
    actionsEl.appendChild(bulkBtn);
  }

  title.appendChild(titleTextEl);
  title.appendChild(actionsEl);
  sessionsGroupEl.appendChild(title);

  list.slice(0, 50).forEach((session, idx) => {
    const id = String(session?.id || "");
    if (!/^\d{18}$/.test(id)) return;
    const titleText = String(session?.title || "").trim();

    const item = document.createElement("div");
    item.className = "side-item";
    item.dataset.chatId = id;
    item.classList.toggle("is-active", activeSideKind === "session" && id === currentChatId);
    item.classList.toggle("is-selected", isBatchDeleteMode && batchSelectedIds.has(id));

    // 先用 id 兜底显示，后面可以懒加载 title
    const short = id.slice(-6);
    const displayName = titleText || `会话 ${short}`;
    const checkHtml = isBatchDeleteMode
      ? '<span class="session-check" aria-hidden="true"></span>'
      : "";
    item.innerHTML = `${checkHtml}<span class="ico"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-circle-icon lucide-message-circle"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/></svg></span><span class="session-name">${escapeHtml(displayName)}</span>`;

    let menuBtn = null;
    if (!isBatchDeleteMode) {
      // 右侧菜单按钮
      menuBtn = document.createElement("button");
      menuBtn.className = "session-menu-btn";
      menuBtn.type = "button";
      menuBtn.title = "更多操作";
      menuBtn.setAttribute("aria-haspopup", "menu");
      menuBtn.setAttribute("aria-expanded", "false");
      menuBtn.innerHTML = `
        <span class="dots">
          <i></i><i></i><i></i>
        </span>
      `;

      menuBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openSessionMenu(menuBtn, { id, item, titleText, short });
      });

      item.appendChild(menuBtn);
    }

    item.addEventListener("click", async () => {
      if (ta.disabled) return; // 正在发送中，别切
      if (window.isGenerating) return; // 正在生成（视频/音频等）时不可切换对话

      if (isBatchDeleteMode) {
        if (batchSelectedIds.has(id)) batchSelectedIds.delete(id);
        else batchSelectedIds.add(id);
        item.classList.toggle("is-selected", batchSelectedIds.has(id));
        updateBatchDeleteHeaderUI();
        return;
      }

      clearPromptSelection();
      setActiveSideKind("session");
      try {
        const ok = await loadChatFromServer(id);
        if (!ok) return;
        renderHistoryToUI();
        await refreshSessionsList();
        scheduleSidebarClose();
      } catch (e) {
        appendMessage("assistant", "加载历史失败：" + (e?.message || String(e)));
      }
    });

    if (!isBatchDeleteMode && menuBtn) {
      item.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        menuBtn.click();
      });
    }

    sessionsGroupEl.appendChild(item);

    // 懒加载标题：只给前 10 个且无标题的取一次内容，避免请求太多
    if (!titleText && idx < 10) {
      (async () => {
        try {
          const res = await apiPost("get_chat.php", { key: serverKey, id });
          let t = String(res?.title || "").trim();
          if (!t) {
            const msgs = parsePersistPayload(res?.content || "");
            const firstUser = msgs.find((m) => m?.role === "user" && String(m.content ?? "").trim() !== "");
            t = firstUser ? String(firstUser.content).trim().slice(0, 18) : `会话 ${short}`;
          }
          const nameEl = item.querySelector(".session-name");
          if (nameEl) nameEl.textContent = t;
        } catch (_) {}
      })();
    }
  });

  updateSessionActionLockUI();
  syncSideSelection();
}

async function refreshSessionsList() {
  if (!serverKey) return [];
  const sessions = await fetchSessions();
  lastSessionsSnapshot = Array.isArray(sessions) ? sessions : [];
  renderSessionsList(sessions);

  // 如果当前会话 id 不存在了（比如被删/服务器无），自动回退到最新一条
  if (currentChatId && !sessions.some((s) => s?.id === currentChatId)) {
    setActiveChatId(sessions[0]?.id || "");
  }
  return sessions;
}

function startNewChat(options = {}) {
  chatLoadVersion++; // 让未完成的加载失效，避免旧会话回写
  clearPromptSelection();
  setActiveSideKind("new");
  applySessionModel("gpt-4");
  setActiveChatId("");
  currentChatTitle = "";
  chatHistory = [];
  pendingFiles = [];
  renderAttachList();
  const preserveInput = Boolean(options?.preserveInput);
  if (!preserveInput) {
    ta.value = "";
  }
  syncHeight();
  setSending(false);
  clearChatUI();
}

// 绑定“新建会话”
newChatBtn = document.querySelector(".side-item.primary");
newChatBtn?.addEventListener("click", () => {
  if (ta.disabled) return;
  if (window.isGenerating) return;
  clearPromptSelection();
  setActiveSideKind("new");
  startNewChat();
  scheduleSidebarClose();
});
syncNewChatActiveState();
syncTopbarVisibility();

promptTranslateBtn?.addEventListener("click", (ev) => {
  ev.stopPropagation();
  if (window.isGenerating) return;
  if (activeSideKind === "session") {
    startNewChat();
  }
  activatePrompt("translate");
  scheduleSidebarClose();
});

promptOptimizeBtn?.addEventListener("click", (ev) => {
  ev.stopPropagation();
  if (window.isGenerating) return;
  if (activeSideKind === "session") {
    startNewChat();
  }
  activatePrompt("optimize");
  scheduleSidebarClose();
});

promptDrawBtn?.addEventListener("click", (ev) => {
  ev.stopPropagation();
  if (window.isGenerating) return;
  if (activeSideKind === "session") {
    startNewChat();
  }
  activatePrompt("draw");
  scheduleSidebarClose();
});

promptVideoBtn?.addEventListener("click", (ev) => {
  ev.stopPropagation();
  if (window.isGenerating) return;
  if (activeSideKind === "session") {
    startNewChat();
  }
  activatePrompt("video");
  scheduleSidebarClose();
});

// 从旧 localStorage 迁移到服务器（只做一次）
async function migrateLegacyLocalHistory() {
  const raw = localStorage.getItem(LEGACY_LOCAL_HISTORY_KEY);
  if (!raw) return;

  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return;

    // 用旧历史创建一个新的会话文件
    startNewChat();
    chatHistory = arr.filter((m) => m && m.role);
    await saveCurrentChatToServer();

    // 迁移完成，删除旧存储
    localStorage.removeItem(LEGACY_LOCAL_HISTORY_KEY);
  } catch (_) {}
}

// 初始化：计算 serverKey -> 迁移 -> 拉取历史列表 -> 打开最近会话/上次会话
async function initServerHistory() {
  try {
    if (!apiToken) return;

    serverKey = await sha256Hex(apiToken);

    await migrateLegacyLocalHistory();
    const sessions = await refreshSessionsList();

    const lastKind = normalizeSideKind(localStorage.getItem(ACTIVE_SIDE_KIND_KEY))
      || (currentChatId ? "session" : "new");
    if (lastKind !== "session") {
      startNewChat();
      return;
    }

    // 优先打开上次会话，否则打开最近一条，否则新建
    const target = currentChatId && sessions.some((s) => s?.id === currentChatId)
      ? currentChatId
      : (sessions[0]?.id || "");
    if (target) {
      const ok = await loadChatFromServer(target);
      if (ok) {
        renderHistoryToUI();
        await refreshSessionsList();
      }
      return;
    }

    startNewChat();
  } catch (e) {
    appendMessage("assistant", "初始化历史记录失败：" + (e?.message || String(e)));
    startNewChat();
  }
}



// ============ Pillbar + Hover Panel ============
const MODEL_GROUPS_DEFAULT = [
  {
    key: "gpt",
    label: "GPT",
    icon: "logo/chatgpt.png",
    models: [
      "gpt-5.2",
      "gpt-5.1",
      "gpt-5",
      "o3-pro",
      "o3",
      "o1-pro",
      "o1",
      "gpt-4.1",
      "gpt-4",
      "chatgpt-4o-latest",
      "gpt-3.5-turbo-raw",
    ],
  },
  {
    key: "deepseek",
    label: "DeepSeek",
    icon: "logo/deepseek.png",
    models: ["deepseek-r1", "deepseek-v3.2", "deepseek-v3.1", "deepseek-v3"],
  },
  {
    key: "gemini",
    label: "Gemini",
    icon: "logo/gemini.png",
    models: [
      "gemini-3-pro",
      "gemini-3-flash",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
    ],
  },
  {
    key: "claude",
    label: "Claude",
    icon: "logo/claude.png",
    models: [
      "claude-haiku-4.5",
      "claude-opus-4.5",
      "claude-opus-4.1",
      "claude-opus-4",
      "claude-sonnet-3.5",
      "claude-haiku-3",
    ],
  },
  {
    key: "kimi",
    label: "Kimi",
    icon: "logo/kimi.png",
    models: [
      "kimi-k2",
      "kimi-k2-0905-t",
      "kimi-k2-instruct",
      "kimi-k2-t",
      "kimi-k2-think-t",
      "kimi-k2-thinking",
    ],
  },
  {
    key: "flux",
    label: "Flux",
    icon: "logo/flux.png",
    models: [
      "flux-2-flash",
      "flux-2-max",
      "flux-2-pro",
      "flux-2-turbo",
      "flux-fill",
      "flux-pro-1.1",
    ],
  },
];

// 绘图模型：大分类固定 8 个，模型按 id 前缀自动归类（不写死列表）
const DRAW_CATEGORY_KEYS = ["flux", "nano-banana", "gpt-image", "stablediffusion", "seedream", "hunyuan", "qwen-image", "luma-photon"];
const DRAW_CATEGORY_LABELS = {
  "flux": "Flux",
  "nano-banana": "Nano Banana",
  "gpt-image": "GPT-Image",
  "stablediffusion": "Stablediffusion",
  "seedream": "Seedream",
  "hunyuan": "Hunyuan",
  "qwen-image": "Qwen-Image",
  "luma-photon": "Luma-Photon"
};
// 绘图分类与 logo 对应（与 model-all 弹窗中 resolveModelIcon 的 logo/${prefix}.png 命名一致）
const DRAW_CATEGORY_ICONS = {
  "flux": "logo/flux.png",
  "nano-banana": "logo/gemini.png",
  "gpt-image": "logo/gpt-image.png",
  "stablediffusion": "logo/stablediffusion.png",
  "seedream": "logo/seedream.png",
  "hunyuan": "logo/hunyuan.png",
  "qwen-image": "logo/qwen-image.png",
  "luma-photon": "logo/luma-photon.png",
};
const MODEL_GROUPS_DRAW = DRAW_CATEGORY_KEYS.map(function (key) {
  const label = DRAW_CATEGORY_LABELS[key] || key;
  const icon = DRAW_CATEGORY_ICONS[key] || "logo/" + key + ".png";
  return { key: key, label: label, icon: icon, models: [] };
});

async function fetchDrawModelsForGroup(group) {
  if (!group || group.models.length > 0) return;
  try {
    const list = await fetchAllModelsOnce();
    if (!Array.isArray(list)) return;
    const key = String(group.key || "").toLowerCase();
    if (!key) return;
    group.models = list
      .filter(function (m) {
        return String(m?.id ?? "").toLowerCase().startsWith(key);
      })
      .map(function (m) {
        return m.id;
      })
      .sort(function (a, b) {
        return String(a).localeCompare(String(b));
      });
  } catch (_) {}
}

// 视频模型：API 调用使用小写，展示可用大写；特殊展示名（如带括号）在此映射
const VIDEO_MODEL_DISPLAY_NAMES = {
  "grok-imagine-video": "Grok-Imagine-Video (xAI)",
  "hunyuan-video-1.5": "Hunyuan-Video-1.5 (腾讯)",
  "svi-2.0-pro": "SVI-2.0-Pro",
  "amazon-nova-reel-1.1": "Amazon-Nova-Reel-1.1 (亚马逊)",
  "kling-avatar-pro": "Kling-Avatar-Pro",
  "omnihuman": "OmniHuman (字节跳动)",
  "ray2": "Ray2 (智谱AI)",
  "mochi-preview": "Mochi-preview",
};

function toVideoModelDisplayName(modelId) {
  const id = String(modelId ?? "").trim().toLowerCase();
  if (VIDEO_MODEL_DISPLAY_NAMES[id]) return VIDEO_MODEL_DISPLAY_NAMES[id];
  return id.split("-").map(function (s) {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }).join("-");
}

// 视频模型：大分类固定 10 个，模型按 id 前缀自动归类（不写死列表）
const VIDEO_CATEGORY_KEYS = ["veo", "sora", "runway", "kling", "wan", "hailuo", "pixverse", "seedance", "ltx", "vidu"];
const MODEL_GROUPS_VIDEO = VIDEO_CATEGORY_KEYS.map(function (key) {
  const label = key === "ltx" ? "LTX" : key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
  return { key: key, label: label, icon: "logo/" + key + ".png", models: [] };
});

async function fetchVideoModelsForGroup(group) {
  if (!group || group.models.length > 0) return;
  try {
    const list = await fetchAllModelsOnce();
    if (!Array.isArray(list)) return;
    const key = String(group.key || "").toLowerCase();
    if (!key) return;
    group.models = list
      .filter(function (m) {
        return String(m?.id ?? "").toLowerCase().startsWith(key);
      })
      .map(function (m) {
        return m.id;
      })
      .sort(function (a, b) {
        return String(a).localeCompare(String(b));
      });
  } catch (_) {}
}

// 音频模型：API 小写，展示可大写
function toAudioModelDisplayName(modelId) {
  const id = String(modelId ?? "").trim().toLowerCase();
  return id.split("-").map(function (s) {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }).join("-");
}

// 音频模型：大分类固定 5 个，模型按 id 前缀自动归类（不写死列表），无「其他」
const AUDIO_CATEGORY_KEYS = ["elevenlabs", "gemini-2.5", "hailuo", "sonic", "stable-audio"];
const AUDIO_CATEGORY_ICONS = {
  "gemini-2.5": "logo/gemini.png",
};
const MODEL_GROUPS_AUDIO = AUDIO_CATEGORY_KEYS.map(function (key) {
  const label = key === "stable-audio" ? "Stable-Audio" : key === "gemini-2.5" ? "Gemini-2.5" : key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
  const icon = AUDIO_CATEGORY_ICONS[key] || "logo/" + key + ".png";
  return { key: key, label: label, icon: icon, models: [] };
});

async function fetchAudioModelsForGroup(group) {
  if (!group || group.models.length > 0) return;
  try {
    const list = await fetchAllModelsOnce();
    if (!Array.isArray(list)) return;
    const key = String(group.key || "").toLowerCase();
    if (!key) return;
    group.models = list
      .filter(function (m) {
        return String(m?.id ?? "").toLowerCase().startsWith(key);
      })
      .map(function (m) {
        return m.id;
      })
      .sort(function (a, b) {
        return String(a).localeCompare(String(b));
      });
  } catch (_) {}
}

const ALL_MODELS_PILL = {
  key: "all",
  label: "全部",
  icon: "logo/more.png",
};

const pillbarEl = document.querySelector(".pillbar");
const pillButtons = new Map();
let modelPopEl = null;
let modelPopList = null;
let modelPopAnchor = null;
let modelPopGroup = null;
let hoverCloseTimer = null;
let lastPillPointerType = "mouse";
let allPillEl = null;
const MODEL_STORAGE_KEY_SAFE =
  typeof MODEL_STORAGE_KEY === "string" ? MODEL_STORAGE_KEY : "selected_model_v1";

let allModelsModalEl = null;
let allModelsTabsEl = null;
let allModelsContentEl = null;
let allModelsActiveGroup = "all";
let allModelsCache = null;
let allModelsLoadingPromise = null;
const MODEL_TAB_COLLAPSE_THRESHOLD = 12;
let allModelsTabsExpanded = false;
let allModelsTabsUserToggled = false;

function normalizeToken(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isDrawQuickModelMode() {
  try {
    return (
      typeof activeSideKind !== "undefined" &&
      typeof activePromptKey !== "undefined" &&
      activeSideKind === "prompt" &&
      activePromptKey === "draw"
    );
  } catch (_) {
    return false;
  }
}

function isVideoQuickModelMode() {
  try {
    return (
      typeof activeSideKind !== "undefined" &&
      typeof activePromptKey !== "undefined" &&
      activeSideKind === "prompt" &&
      activePromptKey === "video"
    );
  } catch (_) {
    return false;
  }
}

function isAudioQuickModelMode() {
  try {
    return (
      typeof activeSideKind !== "undefined" &&
      typeof activePromptKey !== "undefined" &&
      activeSideKind === "prompt" &&
      activePromptKey === "audio"
    );
  } catch (_) {
    return false;
  }
}

function getPillbarModelGroups() {
  if (isAudioQuickModelMode()) return MODEL_GROUPS_AUDIO;
  if (isVideoQuickModelMode()) return MODEL_GROUPS_VIDEO;
  if (isDrawQuickModelMode()) return MODEL_GROUPS_DRAW;
  return MODEL_GROUPS_DEFAULT;
}

function getSelectedModelValue() {
  const el = document.getElementById("selected-model");
  if (!el) return "";
  const fromData = el.dataset.modelId;
  if (fromData !== undefined && fromData !== "") return String(fromData).trim();
  return String(el.textContent || "").trim();
}

function getModelPrefix(modelId) {
  const raw = String(modelId ?? "").trim();
  if (!raw) return "";
  const dashIndex = raw.indexOf("-");
  return dashIndex > 0 ? raw.slice(0, dashIndex) : raw;
}

function findGroupByPrefix(prefix) {
  const key = normalizeToken(prefix);
  if (!key) return null;
  return (
    getPillbarModelGroups().find(
      (group) =>
        normalizeToken(group.key) === key || normalizeToken(group.label) === key
    ) || null
  );
}

function findGroupByModel(modelId) {
  const target = normalizeToken(modelId);
  if (!target) return null;
  const groups = getPillbarModelGroups();
  if (isVideoQuickModelMode() || isDrawQuickModelMode() || isAudioQuickModelMode()) {
    const idLower = String(modelId ?? "").toLowerCase();
    return groups.find(function (g) {
      return idLower.startsWith(g.key);
    }) || null;
  }
  return (
    groups.find((group) =>
      group.models.some((m) => normalizeToken(m) === target)
    ) || null
  );
}

function resolveGroupForModel(modelId) {
  const prefixGroup = findGroupByPrefix(getModelPrefix(modelId));
  if (prefixGroup) return prefixGroup;
  return findGroupByModel(modelId);
}

function setActivePill(key) {
  const target = normalizeToken(key);
  pillButtons.forEach((pill, groupKey) => {
    const isActive = normalizeToken(groupKey) === target && target !== "";
    pill.classList.toggle("active", isActive);
    pill.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function syncPillbarToSelectedModel() {
  const current = getSelectedModelValue();
  const group = resolveGroupForModel(current);
  setActivePill(group?.key || "");
  if (modelPopEl?.classList.contains("show") && modelPopGroup) {
    renderModelPopList(modelPopGroup);
  }
}

function applySelectedModel(modelId, options = {}) {
  const next = String(modelId ?? "").trim();
  if (!next) return;
  const modelEl = document.getElementById("selected-model");
  if (modelEl) {
    modelEl.dataset.modelId = next;
    modelEl.textContent = isVideoQuickModelMode()
      ? toVideoModelDisplayName(next)
      : isAudioQuickModelMode()
        ? toAudioModelDisplayName(next)
        : next;
  }
  const persist = options?.persist !== false;
  if (persist) {
    try {
      localStorage.setItem(MODEL_STORAGE_KEY_SAFE, next);
    } catch (_) {}
  }
  document.dispatchEvent(
    new CustomEvent("model:selected", { detail: { modelId: next } })
  );
}
window.applySelectedModel = applySelectedModel;

function ensureModelPop() {
  if (modelPopEl) return modelPopEl;
  const pop = document.createElement("div");
  pop.className = "model-pop";
  pop.setAttribute("aria-hidden", "true");
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "模型选择");
  pop.innerHTML = `
    <div class="model-pop-list" role="listbox" aria-label="模型列表"></div>
  `;
  document.body.appendChild(pop);
  modelPopEl = pop;
  modelPopList = pop.querySelector(".model-pop-list");
  pop.addEventListener("pointerenter", (ev) => {
    if (ev.pointerType && ev.pointerType !== "mouse") return;
    cancelHoverClose();
  });
  pop.addEventListener("pointerleave", (ev) => {
    if (ev.pointerType && ev.pointerType !== "mouse") return;
    scheduleHoverClose();
  });
  return pop;
}

function renderModelPopList(group) {
  if (!modelPopList || !group) return;
  const current = normalizeToken(getSelectedModelValue());
  const showVideoDisplay = isVideoQuickModelMode();
  const showAudioDisplay = isAudioQuickModelMode();
  modelPopList.innerHTML = "";
  group.models.forEach((modelId) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "model-pop-item";
    item.textContent = showVideoDisplay ? toVideoModelDisplayName(modelId) : showAudioDisplay ? toAudioModelDisplayName(modelId) : modelId;
    item.dataset.model = modelId;
    const isActive = normalizeToken(modelId) === current;
    if (isActive) item.classList.add("active");
    item.setAttribute("aria-selected", isActive ? "true" : "false");
    item.addEventListener("click", (ev) => {
      ev.stopPropagation();
      applySelectedModel(modelId);
      closeModelPop();
    });
    modelPopList.appendChild(item);
  });
}

function positionModelPop(anchorEl) {
  if (!modelPopEl || !anchorEl) return;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  modelPopEl.style.visibility = "hidden";
  modelPopEl.style.left = "0px";
  modelPopEl.style.top = "0px";

  const anchorRect = anchorEl.getBoundingClientRect();
  const cardRect = modelPopEl.getBoundingClientRect();
  const cardWidth = cardRect.width || 280;
  const cardHeight = cardRect.height || 240;

  let left = anchorRect.left + anchorRect.width / 2 - cardWidth / 2;
  left = Math.max(8, Math.min(left, viewportW - cardWidth - 8));

  let top = anchorRect.bottom + 10;
  if (top + cardHeight > viewportH - 10) {
    top = anchorRect.top - cardHeight - 10;
  }

  modelPopEl.style.left = `${left}px`;
  modelPopEl.style.top = `${Math.max(8, top)}px`;
  modelPopEl.style.visibility = "visible";
}

function openModelPop(group, anchorEl) {
  if (!group) return;
  ensureModelPop();
  modelPopGroup = group;
  modelPopAnchor = anchorEl || pillbarEl;
  if ((isVideoQuickModelMode() || isDrawQuickModelMode() || isAudioQuickModelMode()) && (!group.models || group.models.length === 0)) {
    modelPopList.innerHTML = '<div class="model-pop-loading">加载中...</div>';
    modelPopEl?.classList.add("show");
    modelPopEl?.setAttribute("aria-hidden", "false");
    setActivePill(group.key);
    positionModelPop(modelPopAnchor);
    var fetchFn = isVideoQuickModelMode() ? fetchVideoModelsForGroup : isDrawQuickModelMode() ? fetchDrawModelsForGroup : fetchAudioModelsForGroup;
    fetchFn(group).then(function () {
      if (modelPopGroup === group && modelPopList) {
        modelPopList.innerHTML = "";
        renderModelPopList(group);
      }
    });
    return;
  }
  renderModelPopList(group);
  modelPopEl?.classList.add("show");
  modelPopEl?.setAttribute("aria-hidden", "false");
  setActivePill(group.key);
  positionModelPop(modelPopAnchor);
}

function closeModelPop() {
  if (!modelPopEl) return;
  modelPopEl.classList.remove("show");
  modelPopEl.setAttribute("aria-hidden", "true");
  modelPopGroup = null;
  modelPopAnchor = null;
  syncPillbarToSelectedModel();
}

function ensureAllModelsModal() {
  if (allModelsModalEl) return allModelsModalEl;
  const modal = document.createElement("div");
  modal.className = "modal model-all-modal";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="model-all-card" role="dialog" aria-modal="true" aria-label="全部模型">
      <div class="model-all-header">
        <div class="model-all-title">全部模型</div>
        <button class="model-all-close" type="button" aria-label="关闭">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 6l12 12"></path>
            <path d="M18 6l-12 12"></path>
          </svg>
        </button>
      </div>
      <div class="model-all-search-wrap">
        <input type="text" class="model-all-search" id="modelAllSearch" placeholder="搜索模型…" aria-label="搜索模型" autocomplete="off" />
      </div>
      <div class="model-all-body">
        <div class="model-all-tabs" id="modelAllTabs"></div>
        <div class="model-all-content" id="modelAllContent"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  allModelsModalEl = modal;
  allModelsTabsEl = modal.querySelector("#modelAllTabs");
  allModelsContentEl = modal.querySelector("#modelAllContent");
  const searchInput = modal.querySelector("#modelAllSearch");
  if (searchInput) {
    searchInput.addEventListener("input", () => filterAllModelsBySearch());
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        searchInput.value = "";
        filterAllModelsBySearch();
        e.stopPropagation();
      }
    });
  }
  const closeBtn = modal.querySelector(".model-all-close");
  closeBtn?.addEventListener("click", () => closeAllModelsModal());
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) closeAllModelsModal();
  });
  return modal;
}

function filterAllModelsBySearch() {
  const searchEl = allModelsModalEl?.querySelector("#modelAllSearch");
  const query = String(searchEl?.value ?? "").trim().toLowerCase();
  const groupKey = String(allModelsActiveGroup || "all");
  const sections = allModelsModalEl?.querySelectorAll(".model-group");
  if (!sections?.length) return;
  sections.forEach((section) => {
    const sectionKey = section.dataset.group || "";
    const groupMatch = groupKey === "all" || sectionKey === groupKey;
    const cards = section.querySelectorAll(".model-card");
    let hasVisible = false;
    cards.forEach((card) => {
      const modelId = String(card.dataset.model ?? "").toLowerCase();
      const groupLabel = String(card.dataset.groupLabel ?? "").toLowerCase();
      const searchMatch = !query || modelId.includes(query) || groupLabel.includes(query);
      const show = groupMatch && searchMatch;
      card.style.display = show ? "" : "none";
      if (show) hasVisible = true;
    });
    section.style.display = groupMatch && hasVisible ? "" : "none";
  });
}

function openAllModelsModal() {
  ensureAllModelsModal();
  closeModelPop();
  const searchInput = allModelsModalEl?.querySelector("#modelAllSearch");
  if (searchInput) {
    searchInput.value = "";
  }
  allModelsModalEl.classList.add("show");
  allModelsModalEl.setAttribute("aria-hidden", "false");
  allPillEl?.classList.add("active");
  if (typeof setBodyScrollLocked === "function") {
    setBodyScrollLocked(true);
  }
  loadAllModelsIntoModal();
}

function closeAllModelsModal() {
  if (!allModelsModalEl) return;
  allModelsModalEl.classList.remove("show");
  allModelsModalEl.setAttribute("aria-hidden", "true");
  allPillEl?.classList.remove("active");
  if (typeof setBodyScrollLocked === "function") {
    setBodyScrollLocked(false);
  }
}

function cancelHoverClose() {
  if (hoverCloseTimer) {
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = null;
  }
}

function scheduleHoverClose(delay = 120) {
  cancelHoverClose();
  hoverCloseTimer = setTimeout(() => {
    closeModelPop();
  }, delay);
}

let lastPillbarMode = "";

function updateModelPillbarForContext(force = false) {
  const mode = isDrawQuickModelMode() ? "draw" : isVideoQuickModelMode() ? "video" : isAudioQuickModelMode() ? "audio" : "default";
  if (!force && mode === lastPillbarMode) {
    syncPillbarToSelectedModel();
    return;
  }
  lastPillbarMode = mode;
  closeModelPop();
  initModelPillbar(getPillbarModelGroups());
  syncPillbarToSelectedModel();
}

function initModelPillbar(groups) {
  if (!pillbarEl) return;
  pillbarEl.innerHTML = "";
  pillButtons.clear();
  allPillEl = null;
  const list = Array.isArray(groups) ? groups : [];
  list.forEach((group) => {
    const pill = document.createElement("div");
    pill.className = "pill";
    pill.dataset.model = group.key;
    pill.setAttribute("role", "tab");
    pill.setAttribute("aria-selected", "false");
    const isDirectPick = Array.isArray(group.models) && group.models.length === 1;
    pill.innerHTML = `
      <span class="dot">
        <img src="${group.icon}" width="18" alt="" onerror="this.onerror=null;this.src='logo/default.png';" />
      </span>${group.label}
    `;
    pill.addEventListener("pointerenter", (ev) => {
      if (ev.pointerType && ev.pointerType !== "mouse") return;
      cancelHoverClose();
      if (!isDirectPick) {
        openModelPop(group, pill);
      }
    });
    pill.addEventListener("pointerleave", (ev) => {
      if (ev.pointerType && ev.pointerType !== "mouse") return;
      if (!isDirectPick) {
        scheduleHoverClose();
      }
    });
    pill.addEventListener("pointerdown", (ev) => {
      if (ev.pointerType) {
        lastPillPointerType = ev.pointerType;
      }
    });
    pill.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (isDirectPick) {
        applySelectedModel(group.models[0]);
        closeModelPop();
        setActivePill(group.key);
        return;
      }
      if (lastPillPointerType === "mouse") return;
      openModelPop(group, pill);
    });
    pillbarEl.appendChild(pill);
    pillButtons.set(group.key, pill);
  });

  const allPill = document.createElement("div");
  allPill.className = "pill pill-all";
  allPill.dataset.action = "all";
  allPill.setAttribute("role", "button");
  allPill.innerHTML = `
      <span class="dot">
        <img src="${ALL_MODELS_PILL.icon}" width="18" alt="" onerror="this.onerror=null;this.src='logo/default.png';" />
      </span>${ALL_MODELS_PILL.label}
    `;
  allPill.addEventListener("click", (ev) => {
    ev.preventDefault();
    openAllModelsModal();
  });
  pillbarEl.appendChild(allPill);
  allPillEl = allPill;
}

updateModelPillbarForContext(true);

const selectedModelNode = document.getElementById("selected-model");
if (selectedModelNode && window.MutationObserver) {
  const observer = new MutationObserver(() => syncPillbarToSelectedModel());
  observer.observe(selectedModelNode, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}
document.addEventListener("model:selected", syncPillbarToSelectedModel);
document.addEventListener("side:changed", () => updateModelPillbarForContext());

window.addEventListener("resize", () => {
  if (modelPopEl?.classList.contains("show")) {
    positionModelPop(modelPopAnchor || pillbarEl);
  }
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && modelPopEl?.classList.contains("show")) {
    closeModelPop();
  }
  if (ev.key === "Escape" && allModelsModalEl?.classList.contains("show")) {
    closeAllModelsModal();
  }
});
document.addEventListener("pointerdown", (ev) => {
  if (!modelPopEl?.classList.contains("show")) return;
  if (ev.pointerType && ev.pointerType === "mouse") return;
  const target = ev.target;
  if (modelPopEl.contains(target)) return;
  if (pillbarEl?.contains(target)) return;
  closeModelPop();
});

// ============ 全部模型弹窗 ============
async function fetchAllModelsOnce() {
  if (Array.isArray(allModelsCache)) return allModelsCache;
  if (allModelsLoadingPromise) return allModelsLoadingPromise;

  allModelsLoadingPromise = (async () => {
    const response = await fetch("https://api.topglobai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: "Bearer " + apiToken,
        "Content-Type": "application/json",
      },
    });
    const json = await response.json();
    allModelsCache = Array.isArray(json?.data) ? json.data : [];
    return allModelsCache;
  })()
    .catch((err) => {
      allModelsCache = null;
      throw err;
    })
    .finally(() => {
      allModelsLoadingPromise = null;
    });

  return allModelsLoadingPromise;
}

function resolveOwnedBy(model) {
  const raw = String(model?.owned_by ?? "").trim();
  const rawLower = raw.toLowerCase();
  const isUnknown = !raw || rawLower === "unknown" || raw === "未知";
  if (isUnknown) {
    const prefix = getModelPrefix(model?.id || "");
    return prefix || "未知";
  }
  return raw;
}

function resolveModelIcon(modelId) {
  const prefix = getModelPrefix(modelId);
  if (!prefix) return "logo/default.png";
  return `logo/${prefix}.png`;
}

function renderAllModelsTabs(groups) {
  if (!allModelsTabsEl) return;
  allModelsTabsEl.innerHTML = "";

  const tabs = [{ key: "all", label: "全部" }, ...groups.map((g) => ({
    key: g.key,
    label: g.label,
  }))];

  const needCollapse = tabs.length > MODEL_TAB_COLLAPSE_THRESHOLD;
  const activeIndex = tabs.findIndex((tab) => tab.key === allModelsActiveGroup);
  if (
    needCollapse &&
    !allModelsTabsExpanded &&
    !allModelsTabsUserToggled &&
    activeIndex >= MODEL_TAB_COLLAPSE_THRESHOLD
  ) {
    allModelsTabsExpanded = true;
  }

  const visibleTabs = needCollapse && !allModelsTabsExpanded
    ? tabs.slice(0, MODEL_TAB_COLLAPSE_THRESHOLD)
    : tabs;

  visibleTabs.forEach((tab) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "model-all-tab";
    btn.dataset.group = tab.key;
    btn.textContent = tab.label;
    if (tab.key === allModelsActiveGroup) btn.classList.add("active");
    btn.addEventListener("click", () => {
      allModelsActiveGroup = tab.key;
      applyAllModelsGroupFilter();
      renderAllModelsTabs(groups);
    });
    allModelsTabsEl.appendChild(btn);
  });

  if (needCollapse) {
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "model-all-tab model-all-toggle";
    toggleBtn.textContent = allModelsTabsExpanded ? "收起" : "更多";
    toggleBtn.addEventListener("click", () => {
      allModelsTabsUserToggled = true;
      allModelsTabsExpanded = !allModelsTabsExpanded;
      renderAllModelsTabs(groups);
    });
    allModelsTabsEl.appendChild(toggleBtn);
  }
}

function applyAllModelsGroupFilter() {
  if (!allModelsContentEl) return;
  const groupKey = String(allModelsActiveGroup || "all");
  const sections = allModelsContentEl.querySelectorAll(".model-group");
  sections.forEach((section) => {
    const key = section.dataset.group || "";
    const show = groupKey === "all" || key === groupKey;
    section.style.display = show ? "" : "none";
  });
  filterAllModelsBySearch();
}

function renderAllModelsContent(groups) {
  if (!allModelsContentEl) return;
  allModelsContentEl.innerHTML = "";

  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "model-group";
    section.dataset.group = group.key;

    const title = document.createElement("div");
    title.className = "model-group-title";
    title.textContent = group.label;
    section.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "model-group-grid";

    group.models.forEach((model) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "model-card";
      btn.dataset.model = model.id;
      btn.dataset.groupLabel = group.label || "";

      const iconWrap = document.createElement("span");
      iconWrap.className = "model-card-icon";
      const img = document.createElement("img");
      img.alt = "";
      img.src = resolveModelIcon(model.id);
      img.onerror = () => {
        img.onerror = null;
        img.src = "logo/default.png";
      };
      iconWrap.appendChild(img);

      const info = document.createElement("span");
      info.className = "model-card-info";
      const name = document.createElement("span");
      name.className = "model-card-title";
      name.textContent = model.id;
      info.appendChild(name);

      btn.appendChild(iconWrap);
      btn.appendChild(info);

      btn.addEventListener("click", () => {
        applySelectedModel(model.id);
        closeAllModelsModal();
      });

      grid.appendChild(btn);
    });

    section.appendChild(grid);
    allModelsContentEl.appendChild(section);
  });

  applyAllModelsGroupFilter();
}

async function loadAllModelsIntoModal() {
  if (!allModelsContentEl) return;
  allModelsContentEl.innerHTML = '<div class="model-all-state">加载中...</div>';
  allModelsTabsEl.innerHTML = "";

  try {
    const models = await fetchAllModelsOnce();
    if (!models || models.length === 0) {
      allModelsContentEl.innerHTML = '<div class="model-all-state">暂无模型</div>';
      return;
    }

    const groupMap = new Map();
    models.forEach((model) => {
      const label = resolveOwnedBy(model);
      const key = normalizeToken(label) || "unknown";
      if (!groupMap.has(key)) {
        groupMap.set(key, { key, label, models: [] });
      }
      groupMap.get(key).models.push(model);
    });

    const groups = Array.from(groupMap.values()).sort((a, b) =>
      String(a.label).localeCompare(String(b.label))
    );
    groups.forEach((group) => {
      group.models.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    });

    allModelsActiveGroup = "all";
    allModelsTabsExpanded = false;
    allModelsTabsUserToggled = false;
    renderAllModelsTabs(groups);
    renderAllModelsContent(groups);
  } catch (err) {
    allModelsContentEl.innerHTML =
      '<div class="model-all-state error">加载失败</div>';
  }
}

// ============ 下面保持你原来的模型列表加载逻辑 ============
const modelChip = document.querySelector(".model-chip");
let isModelsLoaded = false; // 防止重复请求
let isModelsLoading = false;

function setModelDropdownOpen(isOpen) {
  const open = Boolean(isOpen);
  document.body.classList.toggle("model-dropdown-open", open);
  modelChip?.classList.toggle("open", open);
}

modelChip?.addEventListener("pointerenter", (e) => {
  if (e.pointerType && e.pointerType !== "mouse") return;
  setModelDropdownOpen(true);
});
modelChip?.addEventListener("pointerleave", (e) => {
  if (e.pointerType && e.pointerType !== "mouse") return;
  setModelDropdownOpen(false);
});
modelChip?.addEventListener("focusin", () => setModelDropdownOpen(true));
modelChip?.addEventListener("focusout", () => setModelDropdownOpen(false));

async function ensureModelDropdownLoaded() {
  if (!modelChip) return null;
  let dropdown = modelChip.querySelector(".model-dropdown");
  if (!dropdown) {
    dropdown = document.createElement("div");
    dropdown.className = "model-dropdown";
    dropdown.innerHTML =
      '<div class="model-item" style="justify-content:center; color:#999;">加载中...</div>';
    modelChip.appendChild(dropdown);
  }

  if (isModelsLoaded || isModelsLoading) return dropdown;
  isModelsLoading = true;

  try {
    dropdown.innerHTML = "";

    const models = await fetchAllModelsOnce();
    if (models && models.length > 0) {
      const normalizeOwnedBy = (model) => {
        const ownedByRaw = String(model?.owned_by ?? "").trim();
        if (ownedByRaw && ownedByRaw !== "unknown" && ownedByRaw !== "Unknown" && ownedByRaw !== "未知") {
          return ownedByRaw;
        }
        const modelId = String(model?.id ?? "");
        const dashIndex = modelId.indexOf("-");
        if (dashIndex > 0) return modelId.slice(0, dashIndex);
        return modelId || ownedByRaw || "未知";
      };

      models.forEach((model) => {
        const ownedBy = normalizeOwnedBy(model);
        const item = document.createElement("div");
        item.className = "model-item";
        item.innerHTML = `
            <span class="model-id">${model.id}</span>
            <span class="model-owner">${ownedBy}</span>
          `;
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          applySelectedModel(model.id);
          setModelDropdownOpen(false);
        });
        dropdown.appendChild(item);
      });
      isModelsLoaded = true;
    } else {
      dropdown.innerHTML = '<div class="model-item">暂无数据</div>';
    }
  } catch (error) {
    console.error("Fetch error:", error);
    dropdown.innerHTML =
      '<div class="model-item" style="color:red;">加载失败</div>';
  } finally {
    isModelsLoading = false;
  }

  return dropdown;
}

// 鼠标移入时触发（桌面）
modelChip?.addEventListener("mouseenter", async () => {
  await ensureModelDropdownLoaded();
});

// 点击切换（移动端）
modelChip?.addEventListener("click", async (e) => {
  if (e.target && e.target.closest(".model-dropdown")) return;
  e.stopPropagation();
  const willOpen = !modelChip.classList.contains("open");
  setModelDropdownOpen(willOpen);
  if (willOpen) {
    await ensureModelDropdownLoaded();
  }
});

document.addEventListener("click", (e) => {
  if (!modelChip?.classList.contains("open")) return;
  if (modelChip.contains(e.target)) return;
  setModelDropdownOpen(false);
});

document.addEventListener("click", (e) => {
  const menu = e.target.closest(".session-menu");
  const btn = e.target.closest(".session-menu-btn");
  if (menu || btn) return;
  closeSessionMenu();
});

document.addEventListener("click", (e) => {
  if (!smallScreenQuery.matches) return;
  const row = e.target.closest(".msg-row");
  document.querySelectorAll(".msg-row.show-actions").forEach((el) => {
    if (el !== row) el.classList.remove("show-actions");
  });
  if (row) {
    if (row.classList.contains("is-editing")) {
      row.classList.add("show-actions");
      return;
    }
    row.classList.toggle("show-actions");
  }
});

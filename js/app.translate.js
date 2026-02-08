// ============ 文本翻译面板：Google 翻译风格，不保存到数据库 ============
// 依赖：app.chat.js 的 streamTranslateToElement、app.boot 的 apiToken

const TRANSLATE_MODEL_GROUPS = [
  { key: "gpt", label: "GPT", models: ["gpt-5.2", "gpt-5.1", "gpt-5", "o3-pro", "o3", "o1-pro", "o1", "gpt-4.1", "gpt-4", "chatgpt-4o-latest", "gpt-3.5-turbo-raw"] },
  { key: "deepseek", label: "DeepSeek", models: ["deepseek-r1", "deepseek-v3.2", "deepseek-v3.1", "deepseek-v3"] },
  { key: "gemini", label: "Gemini", models: ["gemini-3-pro", "gemini-3-flash", "gemini-2.5-flash", "gemini-2.0-flash"] },
  { key: "claude", label: "Claude", models: ["claude-haiku-4.5", "claude-opus-4.5", "claude-opus-4.1", "claude-opus-4", "claude-sonnet-3.5", "claude-haiku-3"] },
  { key: "kimi", label: "Kimi", models: ["kimi-k2", "kimi-k2-0905-t", "kimi-k2-instruct", "kimi-k2-t", "kimi-k2-think-t", "kimi-k2-thinking"] },
];

const DEFAULT_TRANSLATE_MODEL = "gpt-4";

const translatePanel = document.getElementById("translatePanel");
const translateBackBtn = document.getElementById("translateBackBtn");
const translateFromLang = document.getElementById("translateFromLang");
const translateToLang = document.getElementById("translateToLang");
const translateModelGroup = document.getElementById("translateModelGroup");
const translateModel = document.getElementById("translateModel");
const translateInput = document.getElementById("translateInput");
const translateOutput = document.getElementById("translateOutput");
const translateBtn = document.getElementById("translateBtn");
const translateClearBtn = document.getElementById("translateClearBtn");
const translateCopyInputBtn = document.getElementById("translateCopyInputBtn");
const translateCopyOutputBtn = document.getElementById("translateCopyOutputBtn");

const TRANSLATE_OUTPUT_PLACEHOLDER = "翻译结果将显示在这里";
const TRANSLATE_MORE_VALUE = "__more__";

let translateAbortController = null;
let translateLangModalEl = null;
let translateLangModalTarget = null; // "from" | "to"

function fillTranslateLangSelects() {
  if (!translateFromLang || !translateToLang) return;
  translateFromLang.innerHTML = "";
  TRANSLATE_COMMON_FROM.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name === "自动检测" ? "auto" : name;
    opt.textContent = name;
    translateFromLang.appendChild(opt);
  });
  const moreFrom = document.createElement("option");
  moreFrom.value = TRANSLATE_MORE_VALUE;
  moreFrom.textContent = "更多...";
  translateFromLang.appendChild(moreFrom);

  translateToLang.innerHTML = "";
  TRANSLATE_COMMON_TO.forEach((name, idx) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (idx === 1) opt.selected = true;
    translateToLang.appendChild(opt);
  });
  const moreTo = document.createElement("option");
  moreTo.value = TRANSLATE_MORE_VALUE;
  moreTo.textContent = "更多...";
  translateToLang.appendChild(moreTo);
}

function ensureSelectHasOption(select, value, text) {
  const v = String(value ?? "").trim();
  const t = String(text ?? v).trim();
  if (!v || v === TRANSLATE_MORE_VALUE) return;
  const exists = Array.from(select.options).some((o) => o.value === v);
  if (!exists) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = t;
    const moreOpt = Array.from(select.options).find((o) => o.value === TRANSLATE_MORE_VALUE);
    if (moreOpt) select.insertBefore(opt, moreOpt);
    else select.appendChild(opt);
  }
  select.value = v;
}

function openTranslateLangModal(target) {
  translateLangModalTarget = target;
  if (!translateLangModalEl) {
    translateLangModalEl = document.createElement("div");
    translateLangModalEl.className = "translate-lang-modal";
    translateLangModalEl.setAttribute("aria-hidden", "true");
    translateLangModalEl.innerHTML = `
      <div class="translate-lang-modal-backdrop"></div>
      <div class="translate-lang-modal-card" role="dialog" aria-modal="true" aria-label="选择语言">
        <div class="translate-lang-modal-header">
          <h3 class="translate-lang-modal-title">选择语言</h3>
          <button type="button" class="translate-lang-modal-close" aria-label="关闭">&times;</button>
        </div>
        <div class="translate-lang-modal-search-wrap">
          <input type="text" class="translate-lang-modal-search" id="translateLangSearch" placeholder="搜索语言…" aria-label="搜索语言" autocomplete="off" />
        </div>
        <div class="translate-lang-modal-body"></div>
      </div>
    `;
    document.body.appendChild(translateLangModalEl);
    const backdrop = translateLangModalEl.querySelector(".translate-lang-modal-backdrop");
    const closeBtn = translateLangModalEl.querySelector(".translate-lang-modal-close");
    const searchInput = translateLangModalEl.querySelector(".translate-lang-modal-search");
    backdrop?.addEventListener("click", () => closeTranslateLangModal());
    closeBtn?.addEventListener("click", () => closeTranslateLangModal());
    searchInput?.addEventListener("input", () => filterTranslateLangModal(searchInput));
    searchInput?.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        searchInput.value = "";
        filterTranslateLangModal(searchInput);
        searchInput.blur();
        e.stopPropagation();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && translateLangModalEl?.classList.contains("show")) closeTranslateLangModal();
    });
  }
  const searchInput = translateLangModalEl.querySelector(".translate-lang-modal-search");
  if (searchInput) {
    searchInput.value = "";
    searchInput.placeholder = "搜索语言…";
  }
  const body = translateLangModalEl.querySelector(".translate-lang-modal-body");
  body.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "translate-lang-grid";
  const allLangs = TRANSLATE_ALL_LANGUAGES_COLUMNS.flat();
  allLangs.forEach((lang) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "translate-lang-item";
    btn.textContent = lang;
    btn.dataset.lang = lang;
    btn.addEventListener("click", () => {
      if (translateLangModalTarget === "from") {
        ensureSelectHasOption(translateFromLang, lang, lang);
      } else {
        ensureSelectHasOption(translateToLang, lang, lang);
      }
      closeTranslateLangModal();
    });
    grid.appendChild(btn);
  });
  body.appendChild(grid);
  translateLangModalEl.classList.add("show");
  translateLangModalEl.setAttribute("aria-hidden", "false");
  if (searchInput) {
    requestAnimationFrame(() => searchInput.focus());
  }
}

function filterTranslateLangModal(searchInput) {
  if (!translateLangModalEl || !searchInput) return;
  const query = String(searchInput.value || "").trim().toLowerCase();
  const items = translateLangModalEl.querySelectorAll(".translate-lang-item");
  items.forEach((btn) => {
    const lang = String(btn.dataset.lang || "").toLowerCase();
    const show = !query || lang.includes(query);
    btn.style.display = show ? "" : "none";
  });
}

function closeTranslateLangModal() {
  if (!translateLangModalEl) return;
  translateLangModalEl.classList.remove("show");
  translateLangModalEl.setAttribute("aria-hidden", "true");
}

translateFromLang?.addEventListener("change", () => {
  if (translateFromLang.value === TRANSLATE_MORE_VALUE) {
    const prev = translateFromLang.dataset.lastFrom || "auto";
    openTranslateLangModal("from");
    translateFromLang.value = prev;
    translateFromLang.dataset.lastFrom = prev;
  } else {
    translateFromLang.dataset.lastFrom = translateFromLang.value;
  }
});
translateToLang?.addEventListener("change", () => {
  if (translateToLang.value === TRANSLATE_MORE_VALUE) {
    const prev = translateToLang.dataset.lastTo || "英语";
    openTranslateLangModal("to");
    translateToLang.value = prev;
    translateToLang.dataset.lastTo = prev;
  } else {
    translateToLang.dataset.lastTo = translateToLang.value;
  }
});
if (translateFromLang) translateFromLang.dataset.lastFrom = "auto";
if (translateToLang) translateToLang.dataset.lastTo = "英语";

function fillTranslateModelSelect(groupKey) {
  if (!translateModel) return;
  const key = String(groupKey || "gpt").trim().toLowerCase();
  const group = TRANSLATE_MODEL_GROUPS.find((g) => g.key.toLowerCase() === key) || TRANSLATE_MODEL_GROUPS[0];
  translateModel.innerHTML = "";
  const models = group.models || [];
  const hasDefault = models.some((m) => String(m).toLowerCase() === DEFAULT_TRANSLATE_MODEL.toLowerCase());
  const selected = hasDefault ? DEFAULT_TRANSLATE_MODEL : (models[0] || "");
  models.forEach((modelId) => {
    const opt = document.createElement("option");
    opt.value = modelId;
    opt.textContent = modelId;
    if (String(modelId).toLowerCase() === selected.toLowerCase()) opt.selected = true;
    translateModel.appendChild(opt);
  });
}

function syncTranslateModelGroupOptions() {
  if (!translateModelGroup) return;
  translateModelGroup.innerHTML = "";
  TRANSLATE_MODEL_GROUPS.forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g.key;
    opt.textContent = g.label;
    translateModelGroup.appendChild(opt);
  });
  fillTranslateModelSelect(translateModelGroup.value);
}

translateModelGroup?.addEventListener("change", () => {
  fillTranslateModelSelect(translateModelGroup.value);
});

translateBackBtn?.addEventListener("click", () => {
  if (typeof window.exitTranslateMode === "function") {
    window.exitTranslateMode();
  }
});

function getSelectedTranslateModelId() {
  const el = document.getElementById("translateModel");
  return (el?.value || DEFAULT_TRANSLATE_MODEL).trim();
}

function buildTranslatePrompt(fromLang, toLang, text) {
  const from = String(fromLang || "auto").trim();
  const to = String(toLang || "英语").trim();
  const t = String(text || "").trim();
  if (!t) return "";
  if (from === "auto") {
    return `请将以下文本翻译成${to}。只输出翻译结果，不要解释。\n\n${t}`;
  }
  return `请将以下文本从${from}翻译成${to}。只输出翻译结果，不要解释。\n\n${t}`;
}

async function runTranslate() {
  const text = (translateInput?.value || "").trim();
  if (!text) {
    if (typeof showToast === "function") showToast("请输入要翻译的文本", "warn");
    return;
  }
  if (window.isGenerating) {
    if (typeof showToast === "function") showToast("请等待当前翻译完成", "warn");
    return;
  }

  const fromLang = translateFromLang?.value || "auto";
  const toLang = translateToLang?.value || "英语";
  const modelId = getSelectedTranslateModelId();
  const prompt = buildTranslatePrompt(fromLang, toLang, text);

  translateOutput.textContent = "翻译中…";
  translateOutput.classList.add("loading");
  translateOutput.classList.remove("placeholder");
  translateBtn.disabled = true;
  window.isGenerating = true;

  if (translateAbortController) {
    try { translateAbortController.abort(); } catch (_) {}
  }
  translateAbortController = new AbortController();

  try {
    await streamTranslateToElement(modelId, prompt, translateOutput, translateAbortController.signal);
  } catch (err) {
    const msg = err?.message || String(err);
    translateOutput.textContent = "翻译失败：" + msg;
    translateOutput.classList.remove("loading");
    if (typeof showToast === "function") showToast("翻译失败", "error");
  } finally {
    translateBtn.disabled = false;
    window.isGenerating = false;
    translateAbortController = null;
  }
}

translateBtn?.addEventListener("click", runTranslate);

translateClearBtn?.addEventListener("click", () => {
  if (translateInput) translateInput.value = "";
  if (translateOutput) {
    translateOutput.textContent = TRANSLATE_OUTPUT_PLACEHOLDER;
    translateOutput.classList.add("placeholder");
    translateOutput.classList.remove("loading");
  }
  if (typeof showToast === "function") showToast("已清空", "info", 1200);
});

/* 左侧复制：复制输入框内容 */
translateCopyInputBtn?.addEventListener("click", async () => {
  const text = (translateInput?.value || "").trim();
  if (!text) {
    if (typeof showToast === "function") showToast("暂无内容可复制", "warn");
    return;
  }
  if (typeof copyTextToClipboard === "function") {
    const ok = await copyTextToClipboard(text);
    if (typeof showToast === "function") showToast(ok ? "已复制到剪贴板" : "复制失败", ok ? "success" : "error", 1400);
  } else if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      if (typeof showToast === "function") showToast("已复制到剪贴板", "success", 1400);
    } catch (_) {
      if (typeof showToast === "function") showToast("复制失败", "error");
    }
  }
});

/* 右侧复制：复制输出框内容 */
translateCopyOutputBtn?.addEventListener("click", async () => {
  const text = (translateOutput?.textContent || "").trim();
  if (!text || text === TRANSLATE_OUTPUT_PLACEHOLDER) {
    if (typeof showToast === "function") showToast("暂无内容可复制", "warn");
    return;
  }
  if (typeof copyTextToClipboard === "function") {
    const ok = await copyTextToClipboard(text);
    if (typeof showToast === "function") showToast(ok ? "已复制到剪贴板" : "复制失败", ok ? "success" : "error", 1400);
  } else if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      if (typeof showToast === "function") showToast("已复制到剪贴板", "success", 1400);
    } catch (_) {
      if (typeof showToast === "function") showToast("复制失败", "error");
    }
  }
});

// 初始化：常用语言下拉 + 模型下拉
fillTranslateLangSelects();
syncTranslateModelGroupOptions();

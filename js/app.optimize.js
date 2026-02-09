// ============ 文本优化面板：不保存到数据库 ============
// 依赖：app.chat.js 的 streamTranslateToElement、app.boot 的 apiToken

const OPTIMIZE_MODEL_GROUPS = [
  { key: "gpt", label: "GPT", models: ["gpt-5.2", "gpt-5.1", "gpt-5", "o3-pro", "o3", "o1-pro", "o1", "gpt-4.1", "gpt-4", "chatgpt-4o-latest", "gpt-3.5-turbo-raw"] },
  { key: "deepseek", label: "DeepSeek", models: ["deepseek-r1", "deepseek-v3.2", "deepseek-v3.1", "deepseek-v3"] },
  { key: "gemini", label: "Gemini", models: ["gemini-3-pro", "gemini-3-flash", "gemini-2.5-flash", "gemini-2.0-flash"] },
  { key: "claude", label: "Claude", models: ["claude-haiku-4.5", "claude-opus-4.5", "claude-opus-4.1", "claude-opus-4", "claude-sonnet-3.5", "claude-haiku-3"] },
  { key: "kimi", label: "Kimi", models: ["kimi-k2", "kimi-k2-0905-t", "kimi-k2-instruct", "kimi-k2-t", "kimi-k2-think-t", "kimi-k2-thinking"] },
];

const DEFAULT_OPTIMIZE_MODEL = "gpt-4";
const OPTIMIZE_OUTPUT_PLACEHOLDER = "优化结果将显示在这里";

const optimizePanel = document.getElementById("optimizePanel");
const optimizeBackBtn = document.getElementById("optimizeBackBtn");
const optimizeModelGroup = document.getElementById("optimizeModelGroup");
const optimizeModel = document.getElementById("optimizeModel");
const optimizeArticle = document.getElementById("optimizeArticle");
const optimizeArticleType = document.getElementById("optimizeArticleType");
const optimizeReader = document.getElementById("optimizeReader");
const optimizeStyle = document.getElementById("optimizeStyle");
const optimizeType = document.getElementById("optimizeType");
const optimizeCustom = document.getElementById("optimizeCustom");
const optimizeOutput = document.getElementById("optimizeOutput");
const optimizeBtn = document.getElementById("optimizeBtn");
const optimizeClearBtn = document.getElementById("optimizeClearBtn");
const optimizeCopyInputBtn = document.getElementById("optimizeCopyInputBtn");
const optimizeCopyOutputBtn = document.getElementById("optimizeCopyOutputBtn");

let optimizeAbortController = null;

function fillOptimizeModelSelect(groupKey) {
  if (!optimizeModel) return;
  const key = String(groupKey || "gpt").trim().toLowerCase();
  const group = OPTIMIZE_MODEL_GROUPS.find((g) => g.key.toLowerCase() === key) || OPTIMIZE_MODEL_GROUPS[0];
  optimizeModel.innerHTML = "";
  const models = group.models || [];
  const hasDefault = models.some((m) => String(m).toLowerCase() === DEFAULT_OPTIMIZE_MODEL.toLowerCase());
  const selected = hasDefault ? DEFAULT_OPTIMIZE_MODEL : (models[0] || "");
  models.forEach((modelId) => {
    const opt = document.createElement("option");
    opt.value = modelId;
    opt.textContent = modelId;
    if (String(modelId).toLowerCase() === selected.toLowerCase()) opt.selected = true;
    optimizeModel.appendChild(opt);
  });
}

function syncOptimizeModelGroupOptions() {
  if (!optimizeModelGroup) return;
  optimizeModelGroup.innerHTML = "";
  OPTIMIZE_MODEL_GROUPS.forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g.key;
    opt.textContent = g.label;
    optimizeModelGroup.appendChild(opt);
  });
  fillOptimizeModelSelect(optimizeModelGroup.value);
}

optimizeModelGroup?.addEventListener("change", () => {
  fillOptimizeModelSelect(optimizeModelGroup.value);
});

optimizeBackBtn?.addEventListener("click", () => {
  if (typeof window.exitOptimizeMode === "function") {
    window.exitOptimizeMode();
  }
});

function getSelectedOptimizeModelId() {
  return (optimizeModel?.value || DEFAULT_OPTIMIZE_MODEL).trim();
}

function buildOptimizePrompt() {
  const article = (optimizeArticle?.value || "").trim();
  if (!article) return "";
  const articleType = (optimizeArticleType?.value || "普通文章").trim();
  const reader = (optimizeReader?.value || "一般读者").trim();
  const style = (optimizeStyle?.value || "标准").trim();
  const type = (optimizeType?.value || "文本润色").trim();
  const custom = (optimizeCustom?.value || "").trim();
  const customLine = custom ? `另外注意：${custom}。` : "";
  return `你需要优化文章。要求是：文章类型：${articleType}，目标读者：${reader}，写作风格：${style}，优化类型：${type}。${customLine}接下来是需要优化的文章，你直接生成优化后的，不要输出多余内容。\n\n${article}`;
}

async function runOptimize() {
  const text = (optimizeArticle?.value || "").trim();
  if (!text) {
    if (typeof showToast === "function") showToast("请输入需要优化的文章", "warn");
    return;
  }
  if (window.isGenerating) {
    if (typeof showToast === "function") showToast("请等待当前优化完成", "warn");
    return;
  }

  const modelId = getSelectedOptimizeModelId();
  const prompt = buildOptimizePrompt();
  if (!prompt) return;

  optimizeOutput.textContent = "优化中…";
  optimizeOutput.classList.add("loading");
  optimizeOutput.classList.remove("placeholder");
  optimizeBtn.disabled = true;
  window.isGenerating = true;

  if (optimizeAbortController) {
    try { optimizeAbortController.abort(); } catch (_) {}
  }
  optimizeAbortController = new AbortController();

  try {
    await streamOptimizeToElement(modelId, prompt, optimizeOutput, optimizeAbortController.signal);
  } catch (err) {
    const msg = err?.message || String(err);
    optimizeOutput.textContent = "优化失败：" + msg;
    optimizeOutput.classList.remove("loading");
    if (typeof showToast === "function") showToast("优化失败", "error");
  } finally {
    optimizeBtn.disabled = false;
    window.isGenerating = false;
    optimizeAbortController = null;
  }
}

optimizeBtn?.addEventListener("click", runOptimize);

optimizeClearBtn?.addEventListener("click", () => {
  if (optimizeArticle) optimizeArticle.value = "";
  if (optimizeCustom) optimizeCustom.value = "";
  if (optimizeOutput) {
    optimizeOutput.textContent = OPTIMIZE_OUTPUT_PLACEHOLDER;
    optimizeOutput.classList.add("placeholder");
    optimizeOutput.classList.remove("loading");
  }
  if (typeof showToast === "function") showToast("已清空", "info", 1200);
});

optimizeCopyInputBtn?.addEventListener("click", async () => {
  const text = (optimizeArticle?.value || "").trim();
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

optimizeCopyOutputBtn?.addEventListener("click", async () => {
  const text = (optimizeOutput?.textContent || "").trim();
  if (!text || text === OPTIMIZE_OUTPUT_PLACEHOLDER) {
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

syncOptimizeModelGroupOptions();

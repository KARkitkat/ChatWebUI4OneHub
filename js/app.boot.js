// 1. 获取当前 URL 的参数
const urlParams = new URLSearchParams(window.location.search);
// 2. 检查是否存在指定 key
if (urlParams.has("key")) {
  const tokenValue = urlParams.get("key");
  // 3. 设置到 localStorage
  localStorage.setItem("apiToken", tokenValue);
  console.log("已从 URL 更新 apiToken");

  const url = new URL(window.location.href);
  const params = url.searchParams;

  // 1. 从参数对象中删除该 key
  params.delete("key");

  // 2. 更新地址栏（保留其他参数）
  const newUrl =
    url.origin +
    url.pathname +
    (params.toString() ? `?${params.toString()}` : "");
  window.history.replaceState({}, document.title, newUrl);
}

const apiToken = localStorage.getItem("apiToken");
const MODEL_STORAGE_KEY = "selected_model_v1";
const selectedModelEl = document.getElementById("selected-model");
function setSelectedModel(modelId, options = {}) {
  const next = String(modelId ?? "").trim();
  if (!selectedModelEl || !next) return;
  selectedModelEl.textContent = next;
  const persist = options?.persist !== false;
  if (persist) {
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, next);
    } catch (_) {}
  }
  document.dispatchEvent(new CustomEvent("model:selected", { detail: { modelId: next } }));
}
window.setSelectedModel = setSelectedModel;

const savedModelId = localStorage.getItem(MODEL_STORAGE_KEY);
if (savedModelId) {
  setSelectedModel(savedModelId, { persist: false });
}
const smallScreenQuery = window.matchMedia("(max-width: 1210px)");

if (apiToken) {
  console.log("获取成功:", apiToken);
} else {
  window.top.location.replace("https://topglobai.com");
}

// Pillbar: mouse wheel horizontal scroll support
const pillbar = document.querySelector(".pillbar");
if (pillbar) {
  pillbar.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (!e.deltaY) return;
      const maxScroll = pillbar.scrollWidth - pillbar.clientWidth;
      if (maxScroll <= 0) return;
      e.preventDefault();
      pillbar.scrollLeft += e.deltaY;
    },
    { passive: false }
  );
}

// Auto-grow textarea
const ta = document.getElementById("msg");
const send = document.getElementById("send");
const DEFAULT_PLACEHOLDER = ta?.getAttribute("placeholder") || "输入内容";
window.isGenerating = false;


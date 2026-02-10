// ============ 画廊面板：从当前会话聊天记录提取图片/视频，按时间展示 ============
// 依赖：app.history.js (chatHistory, exitGalleryMode), app.markdown.js (extractVideoUrls)

(function () {
  const galleryPanel = document.getElementById("galleryPanel");
  const galleryBackBtn = document.getElementById("galleryBackBtn");
  const galleryBody = document.getElementById("galleryBody");
  const galleryPlaceholder = document.getElementById("galleryPlaceholder");
  const galleryGrid = document.getElementById("galleryGrid");

  const GALLERY_DELETED_STORAGE_KEY = "gallery_deleted_v1";
  const ACTIVE_CHAT_ID_KEY = "active_chat_id_v1";

  if (!galleryPanel || !galleryGrid) return;

  function getCurrentChatId() {
    try {
      return String(localStorage.getItem(ACTIVE_CHAT_ID_KEY) || "").trim();
    } catch (_) {
      return "";
    }
  }

  function getDeletedKeys() {
    const chatId = getCurrentChatId();
    if (!chatId) return new Set();
    try {
      const raw = localStorage.getItem(GALLERY_DELETED_STORAGE_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      const arr = Array.isArray(obj[chatId]) ? obj[chatId] : [];
      return new Set(arr);
    } catch (_) {
      return new Set();
    }
  }

  function addDeletedKey(key) {
    const chatId = getCurrentChatId();
    if (!chatId) return;
    try {
      const raw = localStorage.getItem(GALLERY_DELETED_STORAGE_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      if (!Array.isArray(obj[chatId])) obj[chatId] = [];
      if (!obj[chatId].includes(key)) obj[chatId].push(key);
      localStorage.setItem(GALLERY_DELETED_STORAGE_KEY, JSON.stringify(obj));
    } catch (_) {}
  }

  function getItemDeleteKey(item) {
    if (item.url) return item.url;
    if (item.type === "error") return "error:" + (item.prompt || "") + ":" + String(item.error || "").slice(0, 100);
    if (item.generating) return "generating:" + (item.prompt || "");
    return "unknown";
  }

  /** 判断 URL 是否为视频（与 app.markdown 一致，不当作图片） */
  function isVideoUrl(url) {
    try {
      const path = new URL(String(url)).pathname.toLowerCase();
      return /\/video\//.test(path) || /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(path);
    } catch (_) {
      return false;
    }
  }

  /** 疑似截断的域名（如 pfst.cf2.po），不当作有效图片/视频地址 */
  function isLikelyTruncatedUrl(url) {
    try {
      const host = new URL(String(url)).hostname.toLowerCase();
      return /\.(po|ne|or|ec|dn)$/.test(host);
    } catch (_) {
      return true;
    }
  }

  /** 从文本中提取图片 URL（![]() 与 裸 URL）；支持 URL 跨换行（如 base\\n/image/...） */
  function extractImageUrls(text) {
    let str = String(text ?? "");
    str = str.replace(/(https?:\/\/[^\s)]+)\s*\n\s*(\/[^\s)]+(?:\?[^)\s]*)?)/gi, "$1$2");
    const urls = [];
    const seen = new Set();

    const mdImageRe = /!\[[^\]]*\]\s*\(\s*(https?:\/\/[^)\s]*(?:\s*\n\s*\/[^)\s]*)*(?:\?[^)\s]*)?)\s*\)/gi;
    let m;
    while ((m = mdImageRe.exec(str)) !== null) {
      const url = (m[1] || "").trim().replace(/\s*\n\s*/g, "");
      if (url && !isVideoUrl(url) && !isLikelyTruncatedUrl(url) && !seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }

    const rawUrlRe = /https?:\/\/[^\s<>"')\]\]]+(?:\s*\n\s*\/[^\s<>"')\]\]]+)*(?:\?[^)\s]*)?/g;
    while ((m = rawUrlRe.exec(str)) !== null) {
      let url = m[0].replace(/[.,;:!?)\]\]]+$/, "").replace(/\s*\n\s*/g, "").trim();
      if (!url || url.length < 10 || isVideoUrl(url) || isLikelyTruncatedUrl(url)) continue;
      const isImageLike =
        /\/image\//i.test(url) ||
        /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url) ||
        /poecdn|pfst|cdn.*img/i.test(url);
      if (isImageLike && !seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }
    return urls;
  }

  /** 从 chatHistory 解析出 { type, url, prompt, generating? } 列表，按消息顺序（新在后） */
  function collectGalleryItems() {
    const history = typeof chatHistory !== "undefined" && Array.isArray(chatHistory) ? chatHistory : [];
    const items = [];
    let lastUserPrompt = "";

    for (const msg of history) {
      if (!msg || !msg.role) continue;
      const content = String(msg.content ?? "").trim();

      if (msg.role === "user") {
        lastUserPrompt = content;
        continue;
      }

      if (msg.role !== "assistant") continue;

      const videoUrls = typeof extractVideoUrls === "function" ? extractVideoUrls(content) : [];
      const imageUrls = extractImageUrls(content);

      const prompt = lastUserPrompt || "—";
      const modelId = (msg.modelId != null && String(msg.modelId).trim() !== "") ? String(msg.modelId).trim() : null;
      for (const url of videoUrls) {
        items.push({ type: "video", url, prompt, modelId });
      }
      for (const url of imageUrls) {
        items.push({ type: "image", url, prompt, modelId });
      }
      // 无媒体且内容像报错时，在画廊显示错误卡片
      if (videoUrls.length === 0 && imageUrls.length === 0 && content.length > 0) {
        const looksLikeError = content.length < 600 || /失败|错误|异常|请求失败|网络|超时|Failed|Error|Network|timeout|请更换/i.test(content);
        if (looksLikeError) {
          items.push({ type: "error", prompt, error: content, modelId });
        }
      }
    }

    // 正在生成时，最后一条助理消息尚无媒体则增加「正在生成」占位卡片
    const isGen = typeof window.isGenerating !== "undefined" && window.isGenerating === true;
    const promptKey = typeof window.galleryPromptKey === "function" ? window.galleryPromptKey() : "";
    if (isGen && (promptKey === "video" || promptKey === "draw")) {
      const lastMsg = history.length ? history[history.length - 1] : null;
      const lastIsAssistant = lastMsg && lastMsg.role === "assistant";
      const lastHasMedia = lastIsAssistant && (function () {
        const c = String(lastMsg.content ?? "").trim();
        const v = typeof extractVideoUrls === "function" ? extractVideoUrls(c) : [];
        const i = extractImageUrls(c);
        return v.length > 0 || i.length > 0;
      })();
      if (lastIsAssistant && !lastHasMedia) {
        const generatingPrompt = history.length >= 2 && history[history.length - 2].role === "user"
          ? String(history[history.length - 2].content ?? "").trim() || "—"
          : "—";
        const modelEl = document.getElementById("selected-model");
        const currentModelId = (modelEl?.dataset?.modelId ?? modelEl?.textContent ?? "").trim() || null;
        items.push({
          type: promptKey === "video" ? "video" : "image",
          generating: true,
          prompt: generatingPrompt,
          modelId: currentModelId
        });
      }
    }

    const deleted = getDeletedKeys();
    return items.filter(function (item) { return !deleted.has(getItemDeleteKey(item)); });
  }

  /** 在操作区追加删除按钮。若当前项为生成中且正在生成，先停止生成再删除。 */
  function appendDeleteButton(actions, item) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gallery-btn gallery-btn-delete";
    btn.textContent = "删除";
    btn.setAttribute("aria-label", "删除");
    btn.addEventListener("click", function () {
      if (item.generating && typeof window.interruptCurrentGeneration === "function" && window.isGenerating) {
        window.interruptCurrentGeneration();
      }
      addDeletedKey(getItemDeleteKey(item));
      if (typeof window.refreshGallery === "function") window.refreshGallery();
    });
    actions.appendChild(btn);
  }

  /** 按“本次会话”一组展示（无每条消息时间戳时）；可扩展为按日期分组 */
  function groupItemsByDate(items) {
    return [{ dateLabel: "本次会话", items }];
  }

  /** 已展示过的完成项 URL（页面加载时已有或已展示过遮罩淡出的），不再加模糊遮罩 */
  let shownCompletedUrls = new Set();
  let isFirstGalleryRender = true;

  function renderGallery() {
    galleryGrid.innerHTML = "";
    const items = collectGalleryItems();
    const groups = groupItemsByDate(items);

    if (items.length === 0) {
      galleryPlaceholder?.classList.remove("hidden");
      return;
    }

    galleryPlaceholder?.classList.add("hidden");

    if (isFirstGalleryRender) {
      for (const item of items) {
        if (item.url) shownCompletedUrls.add(item.url);
      }
      isFirstGalleryRender = false;
    }

    for (const group of groups) {
      if (!group.items || group.items.length === 0) continue;

      const section = document.createElement("div");
      section.className = "gallery-date-section";

      const title = document.createElement("div");
      title.className = "gallery-date-title";
      title.textContent = group.dateLabel;
      section.appendChild(title);

      const cardsWrap = document.createElement("div");
      cardsWrap.className = "gallery-date-cards";

      for (const item of group.items) {
        let card = null;
        if (item.generating) {
          card = createGeneratingCard(item);
        } else if (item.type === "error") {
          card = createErrorCard(item);
        } else if (item.type === "video") {
          const showReveal = !!item.url && !shownCompletedUrls.has(item.url);
          if (showReveal) {
            card = createGeneratingCard(item, {
              completing: true,
              onBarComplete: function (c) {
                const newCard = createVideoCard(item, true);
                c.parentNode.replaceChild(newCard, c);
                shownCompletedUrls.add(item.url);
              }
            });
          } else {
            card = createVideoCard(item, false);
          }
        } else {
          const showReveal = !!item.url && !shownCompletedUrls.has(item.url);
          card = createImageCard(item, showReveal);
          if (showReveal) shownCompletedUrls.add(item.url);
        }
        if (card) cardsWrap.appendChild(card);
      }

      section.appendChild(cardsWrap);
      galleryGrid.appendChild(section);
    }
  }

  const VIDEO_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  /** 根据条目保存的 modelId 和 type 显示模型名，避免用当前选中模型覆盖历史条目的 tag */
  function getModelDisplayNameForItem(modelId, type) {
    const id = (modelId != null && String(modelId).trim() !== "") ? String(modelId).trim() : "";
    if (!id) return "—";
    if (type === "video" && typeof toVideoModelDisplayName === "function") {
      return toVideoModelDisplayName(id);
    }
    if (type === "audio" && typeof toAudioModelDisplayName === "function") {
      return toAudioModelDisplayName(id);
    }
    return id.split("-").map(function (s) { return s.charAt(0).toUpperCase() + (s.slice(1) || "").toLowerCase(); }).join("-");
  }

  function appendPromptRow(container, promptText, modelId, type) {
    const row = document.createElement("div");
    row.className = "gallery-card-prompt-row";
    const tag = document.createElement("span");
    tag.className = "gallery-model-tag";
    tag.textContent = getModelDisplayNameForItem(modelId, type);
    const promptEl = document.createElement("div");
    promptEl.className = "gallery-card-prompt";
    promptEl.textContent = promptText || "—";
    row.appendChild(tag);
    row.appendChild(promptEl);
    container.appendChild(row);
  }

  function createErrorCard(item) {
    const card = document.createElement("div");
    card.className = "gallery-card gallery-card-error";

    const errorWrap = document.createElement("div");
    errorWrap.className = "gallery-error-wrap";
    const icon = document.createElement("div");
    icon.className = "gallery-error-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "!";
    const label = document.createElement("div");
    label.className = "gallery-error-label";
    label.textContent = "生成失败";
    const message = document.createElement("div");
    message.className = "gallery-error-message";
    message.textContent = item.error || "未知错误";
    errorWrap.appendChild(icon);
    errorWrap.appendChild(label);
    errorWrap.appendChild(message);

    const info = document.createElement("div");
    info.className = "gallery-card-info";
    const actions = document.createElement("div");
    actions.className = "gallery-card-actions";
    appendDeleteButton(actions, item);
    info.appendChild(actions);
    appendPromptRow(info, item.prompt, item.modelId, item.type);
    card.appendChild(errorWrap);
    card.appendChild(info);
    return card;
  }

  var FAKE_PROGRESS_DURATION = 120;
  var FAKE_PROGRESS_TIMEOUT = 300;
  var COMPLETING_BAR_DURATION_MS = 500;

  function createGeneratingCard(item, options) {
    const isVideo = item.type === "video";
    const completing = options && options.completing;
    const card = document.createElement("div");
    card.className = "gallery-card gallery-card-generating " + (isVideo ? "gallery-card-video" : "gallery-card-image");

    const mediaWrap = document.createElement("div");
    mediaWrap.className = "gallery-generating-wrap";
    const circles = document.createElement("div");
    circles.className = "gallery-generating-circles";
    const sizes = [80, 144, 104, 176, 116, 132];
    sizes.forEach(function (size, i) {
      const circle = document.createElement("div");
      circle.className = "gallery-generating-circle gallery-generating-circle--" + (i + 1);
      circle.style.width = size + "px";
      circle.style.height = size + "px";
      circles.appendChild(circle);
    });
    const overlay = document.createElement("div");
    overlay.className = "gallery-generating-overlay";
    overlay.setAttribute("aria-hidden", "true");
    mediaWrap.appendChild(circles);
    mediaWrap.appendChild(overlay);

    card.appendChild(mediaWrap);

    if (isVideo) {
      const progressWrap = document.createElement("div");
      progressWrap.className = "gallery-generating-progress" + (completing ? " gallery-generating-progress--completing" : "");
      const progressTrack = document.createElement("div");
      progressTrack.className = "gallery-generating-progress-track";
      const progressBar = document.createElement("div");
      progressBar.className = "gallery-generating-progress-bar";
      progressBar.setAttribute("role", "progressbar");
      progressBar.setAttribute("aria-valuemin", "0");
      progressBar.setAttribute("aria-valuemax", "100");
      progressTrack.appendChild(progressBar);
      progressWrap.appendChild(progressTrack);
      card.appendChild(progressWrap);

      function setProgress(pct) {
        const v = Math.min(100, Math.max(0, pct));
        progressBar.style.width = v + "%";
        progressBar.setAttribute("aria-valuenow", Math.round(v));
      }

      if (completing) {
        requestAnimationFrame(function () {
          setProgress(100);
        });
        progressBar.addEventListener("transitionend", function onEnd() {
          progressBar.removeEventListener("transitionend", onEnd);
          if (options && typeof options.onBarComplete === "function") options.onBarComplete(card);
        });
      } else {
        const startTime = Date.now();
        const tick = function () {
          const elapsed = (Date.now() - startTime) / 1000;
          if (elapsed >= FAKE_PROGRESS_TIMEOUT) {
            setProgress(100);
            return;
          }
          let pct;
          if (elapsed < FAKE_PROGRESS_DURATION * 0.75) {
            pct = (elapsed / (FAKE_PROGRESS_DURATION * 0.75)) * 75;
          } else if (elapsed < FAKE_PROGRESS_DURATION) {
            const t = (elapsed - FAKE_PROGRESS_DURATION * 0.75) / (FAKE_PROGRESS_DURATION * 0.25);
            const easeOut = 1 - (1 - t) * (1 - t);
            pct = 75 + 25 * easeOut;
          } else {
            pct = 100;
          }
          setProgress(pct);
        };
        tick();
        const intervalId = setInterval(function () {
          tick();
          if ((Date.now() - startTime) / 1000 >= FAKE_PROGRESS_TIMEOUT) clearInterval(intervalId);
        }, 100);
      }
    }

    const info = document.createElement("div");
    info.className = "gallery-card-info";
    const actions = document.createElement("div");
    actions.className = "gallery-card-actions";
    appendDeleteButton(actions, item);
    info.appendChild(actions);
    appendPromptRow(info, item.prompt, item.modelId, item.type);
    card.appendChild(info);
    return card;
  }

  function createVideoCard(item, showRevealOverlay) {
    const card = document.createElement("div");
    card.className = "gallery-card gallery-card-video";

    const videoWrap = document.createElement("div");
    videoWrap.className = "gallery-video-wrap";
    const video = document.createElement("video");
    video.className = "gallery-card-media";
    video.src = item.url;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    videoWrap.appendChild(video);
    if (showRevealOverlay) {
      const revealOverlay = document.createElement("div");
      revealOverlay.className = "gallery-reveal-overlay";
      revealOverlay.setAttribute("aria-hidden", "true");
      videoWrap.appendChild(revealOverlay);
      function startRevealAfterLoad() {
        setTimeout(function () {
          revealOverlay.classList.add("gallery-reveal-overlay--start");
        }, 1000);
      }
      if (video.readyState >= 2) startRevealAfterLoad();
      else video.addEventListener("loadeddata", startRevealAfterLoad);
    }

    const info = document.createElement("div");
    info.className = "gallery-card-info";

    const actions = document.createElement("div");
    actions.className = "gallery-card-actions";

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "gallery-btn gallery-btn-play";
    playBtn.textContent = "播放";
    playBtn.setAttribute("aria-label", "播放");
    function updatePlayBtnText() {
      playBtn.textContent = video.paused ? "播放" : "暂停";
      playBtn.setAttribute("aria-label", video.paused ? "播放" : "暂停");
    }
    playBtn.addEventListener("click", () => {
      if (video.paused) video.play();
      else video.pause();
    });
    video.addEventListener("play", updatePlayBtnText);
    video.addEventListener("pause", updatePlayBtnText);
    actions.appendChild(playBtn);

    const speedWrap = document.createElement("div");
    speedWrap.className = "gallery-btn gallery-speed-wrap";
    const speedSelect = document.createElement("select");
    speedSelect.className = "gallery-speed-select";
    speedSelect.setAttribute("aria-label", "播放倍速");
    VIDEO_SPEEDS.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = String(s);
      opt.textContent = s === 1 ? "1x" : s + "x";
      if (s === 1) opt.selected = true;
      speedSelect.appendChild(opt);
    });
    speedSelect.addEventListener("change", () => {
      video.playbackRate = Number(speedSelect.value);
    });
    speedWrap.appendChild(document.createTextNode("倍速 "));
    speedWrap.appendChild(speedSelect);
    actions.appendChild(speedWrap);

    const downloadBtn = document.createElement("a");
    downloadBtn.href = item.url;
    downloadBtn.download = "";
    downloadBtn.target = "_blank";
    downloadBtn.rel = "noopener noreferrer";
    downloadBtn.className = "gallery-btn";
    downloadBtn.textContent = "下载";
    actions.appendChild(downloadBtn);
    appendDeleteButton(actions, item);

    info.appendChild(actions);
    appendPromptRow(info, item.prompt, item.modelId, item.type);
    card.appendChild(videoWrap);
    card.appendChild(info);
    return card;
  }

  function openImageLightbox(url) {
    const existing = document.getElementById("galleryImageLightbox");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "galleryImageLightbox";
    overlay.className = "gallery-image-lightbox";
    overlay.setAttribute("aria-label", "放大预览");
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "gallery-image-lightbox-close";
    closeBtn.setAttribute("aria-label", "关闭");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
  }

  function createImageCard(item, showRevealOverlay) {
    const card = document.createElement("div");
    card.className = "gallery-card gallery-card-image";

    const mediaWrap = document.createElement("div");
    mediaWrap.className = "gallery-image-wrap";
    const img = document.createElement("img");
    img.className = "gallery-card-media";
    img.src = item.url;
    img.alt = "";
    img.loading = "lazy";
    mediaWrap.appendChild(img);
    if (showRevealOverlay) {
      const revealOverlay = document.createElement("div");
      revealOverlay.className = "gallery-reveal-overlay";
      revealOverlay.setAttribute("aria-hidden", "true");
      mediaWrap.appendChild(revealOverlay);
      function startRevealAfterLoad() {
        setTimeout(function () {
          revealOverlay.classList.add("gallery-reveal-overlay--start");
        }, 1000);
      }
      if (img.complete) startRevealAfterLoad();
      else img.addEventListener("load", startRevealAfterLoad);
    }
    card.appendChild(mediaWrap);

    const info = document.createElement("div");
    info.className = "gallery-card-info";

    const actions = document.createElement("div");
    actions.className = "gallery-card-actions";
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "gallery-btn gallery-btn-view";
    viewBtn.textContent = "查看";
    viewBtn.addEventListener("click", () => openImageLightbox(item.url));
    actions.appendChild(viewBtn);
    const downloadBtn = document.createElement("a");
    downloadBtn.href = item.url;
    downloadBtn.download = "";
    downloadBtn.target = "_blank";
    downloadBtn.rel = "noopener noreferrer";
    downloadBtn.className = "gallery-btn";
    downloadBtn.textContent = "下载";
    actions.appendChild(downloadBtn);
    appendDeleteButton(actions, item);
    info.appendChild(actions);
    appendPromptRow(info, item.prompt, item.modelId, item.type);
    card.appendChild(info);
    return card;
  }

  function refreshGallery() {
    renderGallery();
  }

  galleryBackBtn?.addEventListener("click", () => {
    if (typeof window.exitGalleryMode === "function") window.exitGalleryMode();
  });

  document.addEventListener("chat:history-updated", () => {
    if (typeof window.isGalleryMode === "function" && window.isGalleryMode()) {
      refreshGallery();
    }
  });

  window.refreshGallery = refreshGallery;
})();

// ============ ✅ Markdown 渲染（marked + DOMPurify） ============
function renderMarkdown(mdText) {
  // marked 基本配置：GFM + 换行
  if (window.marked) {
    marked.setOptions({
      gfm: true,
      breaks: true,
      headerIds: false,
      mangle: false,
    });

    const normalized = normalizeLatexDelimiters(mdText || "");
    const rawHtml = marked.parse(normalized);
    const htmlWithCodeClass = rawHtml.replace(
      /<pre><code(?![^>]*class=)/g,
      '<pre><code class="hljs"'
    );
    const safeHtml = window.DOMPurify
      ? DOMPurify.sanitize(htmlWithCodeClass, { USE_PROFILES: { html: true } })
      : htmlWithCodeClass;

    return safeHtml;
  }

  // 如果 marked 没加载成功，退化为纯文本（不炸）
  return (mdText || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
}

function normalizeLatexDelimiters(input) {
  let text = String(input ?? "");

  // Convert single-line [ ... ] to \[ ... \] (block), avoid markdown links
  text = text.replace(/^\s*\[([^\]\n]+)\]\s*$/gm, (m, inner) => {
    const expr = String(inner || "").trim();
    return expr ? `\\[${expr}\\]` : m;
  });

  // Inline [ ... ] -> \( ... \) only if it looks like math and not a link
  text = text.replace(/\[([^\]\n]+)\]/g, (m, inner, offset) => {
    const before = text[offset - 1];
    if (before === "\\") return m;
    const after = text[offset + m.length];
    if (after === "(") return m; // markdown link
    const expr = String(inner || "").trim();
    if (!/[\\^_{}]/.test(expr)) return m;
    return `\\(${expr}\\)`;
  });

  // Collapse newlines inside $$...$$ to keep delimiters in one text node
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (m, inner) => {
    const body = String(inner || "").replace(/\s*\n\s*/g, " ");
    return `$$${body}$$`;
  });

  // Collapse newlines inside \[...\]
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (m, inner) => {
    const body = String(inner || "").replace(/\s*\n\s*/g, " ");
    return `\\[${body}\\]`;
  });

  return text;
}

function stripSpinnerLines(input) {
  let text = String(input ?? "");
  // Remove braille spinner lines like "⠋ Running...", "⠇ Thinking...", etc.
  text = text.replace(/^\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇]\s+.*$/gm, "");
  // Collapse excessive blank lines caused by stripping
  text = text.replace(/\n{3,}/g, "\n\n");
  return text;
}

function mergeGeneratingImageProgress(input) {
  const text = String(input ?? "");
  const re = /Generating image \(\d+s elapsed\)/gi;
  const matches = [];
  let m;

  while ((m = re.exec(text)) !== null) {
    matches.push({ start: m.index, end: re.lastIndex, value: m[0] });
    if (re.lastIndex === m.index) re.lastIndex++;
  }

  if (matches.length <= 1) return text;

  let out = "";
  let cursor = 0;
  let i = 0;

  while (i < matches.length) {
    const start = matches[i].start;
    out += text.slice(cursor, start);

    let j = i;
    let lastVal = matches[i].value;
    let seqEnd = matches[i].end;

    while (j + 1 < matches.length) {
      const gap = text.slice(matches[j].end, matches[j + 1].start);
      if (/^\s*$/.test(gap)) {
        j++;
        lastVal = matches[j].value;
        seqEnd = matches[j].end;
        continue;
      }
      break;
    }

    out += lastVal;
    cursor = seqEnd;
    i = j + 1;
  }

  out += text.slice(cursor);
  return out;
}

// 合并视频生成进度行（多种格式只保留最后一条）：Generating. (Ns)、Generating.. (Ns)、Generating... (Ns)、Generating... (**Ns** elapsed)、Generating video (Ns elapsed) 等
function mergeGeneratingVideoProgress(input) {
  const text = String(input ?? "");
  const re = /Generating(?:\.{1,3}\s*\(\d+s\)|\.\.\.\s*\(\*\*\d+s\*\* elapsed\)| video \(\d+(?:\/\d+)?s elapsed\))/gi;
  const matches = [];
  let m;

  while ((m = re.exec(text)) !== null) {
    matches.push({ start: m.index, end: re.lastIndex, value: m[0] });
    if (re.lastIndex === m.index) re.lastIndex++;
  }

  if (matches.length <= 1) return text;

  let out = "";
  let cursor = 0;
  let i = 0;

  while (i < matches.length) {
    const start = matches[i].start;
    out += text.slice(cursor, start);

    let j = i;
    let lastVal = matches[j].value;
    let seqEnd = matches[j].end;

    while (j + 1 < matches.length) {
      const gap = text.slice(matches[j].end, matches[j + 1].start);
      if (/^\s*$/.test(gap)) {
        j++;
        lastVal = matches[j].value;
        seqEnd = matches[j].end;
        continue;
      }
      break;
    }

    out += lastVal;
    cursor = seqEnd;
    i = j + 1;
  }

  out += text.slice(cursor);
  return out;
}

// 判断内容是否仅为视频/生成类进度（无最终链接等），用于继续显示「正在生成」占位
Generating. (12s)// 流式可能为片段如 "Generating. (0s)Gen"，故先去掉所有完整进度段，再看剩余是否为空或未收齐的 "Generating"
function isOnlyGeneratingProgress(text) {
  const t = String(text ?? "").trim();
  if (!t) return true;
  if (/https?:\/\//i.test(t)) return false;
  let rest = t
    .replace(/Generating\.{1,3}\s*\(\d+s\)/gi, "")
    .replace(/Generating(?:\.\.\.\s*\(\*\*\d+s\*\* elapsed\)| video \(\d+(?:\/\d+)?s elapsed\))/gi, "")
    .trim();
  rest = rest.replace(/\s*Generating\.{0,3}\s*$/i, "").trim();
  if (rest === "") return true;
  if (/^Generating\.{0,3}$/i.test(rest)) return true;
  if (/^Generat/i.test(rest) && rest.length < 12) return true;
  return false;
}

// 合并 "Generating Music (Ns elapsed)" 进度行，只保留最后一条
function mergeGeneratingMusicProgress(input) {
  const text = String(input ?? "");
  const re = /Generating Music \(\d+s elapsed\)/gi;
  const matches = [];
  let m;

  while ((m = re.exec(text)) !== null) {
    matches.push({ start: m.index, end: re.lastIndex, value: m[0] });
    if (re.lastIndex === m.index) re.lastIndex++;
  }

  if (matches.length <= 1) return text;

  let out = "";
  let cursor = 0;
  let i = 0;

  while (i < matches.length) {
    const start = matches[i].start;
    out += text.slice(cursor, start);

    let j = i;
    let lastVal = matches[i].value;
    let seqEnd = matches[i].end;

    while (j + 1 < matches.length) {
      const gap = text.slice(matches[j].end, matches[j + 1].start);
      if (/^\s*$/.test(gap)) {
        j++;
        lastVal = matches[j].value;
        seqEnd = matches[j].end;
        continue;
      }
      break;
    }

    out += lastVal;
    cursor = seqEnd;
    i = j + 1;
  }

  out += text.slice(cursor);
  return out;
}

// 从文本中提取视频链接（/video/ 路径或常见视频扩展名）
function extractVideoUrls(text) {
  const str = String(text ?? "");
  const urlRe = /https?:\/\/[^\s<>"')\]]+/gi;
  const urls = [];
  let m;
  const seen = new Set();

  while ((m = urlRe.exec(str)) !== null) {
    let url = m[0].replace(/[.,;:!?)]+$/, "").trim();
    if (!url) continue;
    try {
      const path = new URL(url).pathname.toLowerCase();
      const isVideo =
        /\/video\//.test(path) ||
        /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(path);
      if (isVideo && !seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    } catch (_) {}
  }
  return urls;
}

// 在气泡内注入视频播放块：预览、下载、倍速
function injectVideoPlayers(bubble) {
  if (!bubble || !bubble.classList.contains("assistant")) return;
  const rawText = bubble.dataset.rawMd || bubble.textContent || "";
  const urls = extractVideoUrls(rawText);
  if (urls.length === 0) return;

  const content = getBubbleContent(bubble);
  if (!content) return;

  content.querySelectorAll(".msg-video-wrap").forEach((el) => el.remove());

  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  urls.forEach((url) => {
    const wrap = document.createElement("div");
    wrap.className = "msg-video-wrap";

    const video = document.createElement("video");
    video.className = "msg-video-player";
    video.src = url;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";

    const toolbar = document.createElement("div");
    toolbar.className = "msg-video-toolbar";

    const speedLabel = document.createElement("span");
    speedLabel.className = "msg-video-speed-label";
    speedLabel.textContent = "倍速:";

    const speedSelect = document.createElement("select");
    speedSelect.className = "msg-video-speed";
    speedSelect.setAttribute("aria-label", "播放倍速");
    speeds.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = String(s);
      opt.textContent = s === 1 ? "1x" : s + "x";
      if (s === 1) opt.selected = true;
      speedSelect.appendChild(opt);
    });
    speedSelect.addEventListener("change", () => {
      video.playbackRate = Number(speedSelect.value);
    });

    const downloadBtn = document.createElement("a");
    downloadBtn.className = "msg-video-download";
    downloadBtn.href = url;
    downloadBtn.download = "";
    downloadBtn.target = "_blank";
    downloadBtn.rel = "noopener noreferrer";
    downloadBtn.setAttribute("aria-label", "下载视频");
    const downloadText = document.createElement("span");
    downloadText.className = "msg-video-download-text";
    downloadText.textContent = "下载";
    downloadBtn.appendChild(downloadText);

    toolbar.appendChild(speedLabel);
    toolbar.appendChild(speedSelect);
    toolbar.appendChild(downloadBtn);
    wrap.appendChild(video);
    wrap.appendChild(toolbar);
    content.appendChild(wrap);
  });
}

// 从文本中提取音频链接（/audio/ 路径或常见音频扩展名）
function extractAudioUrls(text) {
  const str = String(text ?? "");
  const urlRe = /https?:\/\/[^\s<>"')\]]+/gi;
  const urls = [];
  let m;
  const seen = new Set();

  while ((m = urlRe.exec(str)) !== null) {
    let url = m[0].replace(/[.,;:!?)]+$/, "").trim();
    if (!url) continue;
    try {
      const path = new URL(url).pathname.toLowerCase();
      const isAudio =
        /\/audio\//.test(path) ||
        /\.(mp3|wav|ogg|m4a|aac|flac|webm)(\?|$)/i.test(path);
      if (isAudio && !seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    } catch (_) {}
  }
  return urls;
}

// 在气泡内注入音频播放块：预览、下载、倍速
function injectAudioPlayers(bubble) {
  if (!bubble || !bubble.classList.contains("assistant")) return;
  const rawText = bubble.dataset.rawMd || bubble.textContent || "";
  const urls = extractAudioUrls(rawText);
  if (urls.length === 0) return;

  const content = getBubbleContent(bubble);
  if (!content) return;

  content.querySelectorAll(".msg-audio-wrap").forEach((el) => el.remove());

  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  urls.forEach((url) => {
    const wrap = document.createElement("div");
    wrap.className = "msg-audio-wrap";

    const audio = document.createElement("audio");
    audio.className = "msg-audio-player";
    audio.src = url;
    audio.controls = true;
    audio.preload = "metadata";

    const toolbar = document.createElement("div");
    toolbar.className = "msg-audio-toolbar";

    const speedLabel = document.createElement("span");
    speedLabel.className = "msg-audio-speed-label";
    speedLabel.textContent = "倍速:";

    const speedSelect = document.createElement("select");
    speedSelect.className = "msg-audio-speed";
    speedSelect.setAttribute("aria-label", "播放倍速");
    speeds.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = String(s);
      opt.textContent = s === 1 ? "1x" : s + "x";
      if (s === 1) opt.selected = true;
      speedSelect.appendChild(opt);
    });
    speedSelect.addEventListener("change", () => {
      audio.playbackRate = Number(speedSelect.value);
    });

    const downloadBtn = document.createElement("a");
    downloadBtn.className = "msg-audio-download";
    downloadBtn.href = url;
    downloadBtn.download = "";
    downloadBtn.target = "_blank";
    downloadBtn.rel = "noopener noreferrer";
    downloadBtn.setAttribute("aria-label", "下载音频");
    const downloadText = document.createElement("span");
    downloadText.className = "msg-audio-download-text";
    downloadText.textContent = "下载";
    downloadBtn.appendChild(downloadText);

    toolbar.appendChild(speedLabel);
    toolbar.appendChild(speedSelect);
    toolbar.appendChild(downloadBtn);
    wrap.appendChild(audio);
    wrap.appendChild(toolbar);
    content.appendChild(wrap);
  });
}

// 给渲染出的链接补上安全属性（可选但推荐）
function secureLinks(container) {
  container.querySelectorAll("a").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
}

function renderLatexIn(container) {
  if (!container || typeof window.renderMathInElement !== "function") return;
  try {
    window.renderMathInElement(container, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
        { left: "\\[", right: "\\]", display: true },
      ],
      throwOnError: false,
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
    });
  } catch (_) {}
}

function renderCodeHighlight(container) {
  if (!container) return;
  ensureCodeCopyButtons(container);
  if (!window.hljs) {
    ensureHighlightJs().then((ok) => {
      if (!ok) return;
      renderCodeHighlight(container);
    });
    return;
  }
  container.querySelectorAll("pre code").forEach((block) => {
    if (block.dataset.hljs === "1") return;
    try {
      window.hljs.highlightElement(block);
      block.dataset.hljs = "1";
    } catch (_) {}
  });
}

function ensureCodeCopyButtons(container) {
  if (!container) return;
  container.querySelectorAll("pre").forEach((pre) => {
    const code = pre.querySelector("code");
    if (!code) return;
    if (pre.querySelector(".code-copy-btn")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "msg-action-btn code-copy-btn";
    btn.title = "复制代码";
    btn.setAttribute("aria-label", "复制代码");
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="9" y="9" width="11" height="11" rx="2"></rect>
        <rect x="4" y="4" width="11" height="11" rx="2"></rect>
      </svg>
    `;

    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const text = String(code.textContent || "");
      const ok = typeof copyTextToClipboard === "function"
        ? await copyTextToClipboard(text)
        : false;
      if (typeof showToast === "function") {
        showToast(ok ? "已复制" : "复制失败", ok ? "success" : "error", 1200);
      }
    });

    pre.appendChild(btn);
  });
}

function getBubbleContent(bubble) {
  if (!bubble) return null;
  let content = bubble.querySelector(".msg-content");
  if (!content) {
    content = document.createElement("div");
    content.className = "msg-content";
    bubble.prepend(content);
  }
  return content;
}

function setBubbleHtml(bubble, html) {
  const content = getBubbleContent(bubble);
  if (content) content.innerHTML = html || "";
  return content;
}

function setBubbleText(bubble, text) {
  const content = getBubbleContent(bubble);
  if (content) content.textContent = text || "";
  return content;
}

let hljsLoadingPromise = null;
function ensureHighlightJs() {
  if (window.hljs) return Promise.resolve(true);
  if (hljsLoadingPromise) return hljsLoadingPromise;

  hljsLoadingPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[data-hljs-fallback="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(window.hljs)));
      existing.addEventListener("error", () => resolve(false));
      return;
    }

    const link = document.querySelector('link[data-hljs-fallback="1"]');
    if (!link) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css";
      css.setAttribute("data-hljs-fallback", "1");
      document.head.appendChild(css);
    }

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js";
    script.async = true;
    script.setAttribute("data-hljs-fallback", "1");
    script.onload = () => resolve(Boolean(window.hljs));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return hljsLoadingPromise;
}

ensureHighlightJs().then((ok) => {
  if (!ok) return;
  renderCodeHighlight(document);
});


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


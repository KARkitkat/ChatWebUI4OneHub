(() => {
  const searchBtn = document.getElementById("searchBtn");
  if (!searchBtn) return;

  let isSearching = false;
  let isSearchMode = false;
  let searchAbortController = null;

  const SEND_ICON_HTML = send?.innerHTML || "";
  const STOP_ICON_HTML = `
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2"></rect>
    </svg>
  `;

  function setSearching(on) {
    const next = Boolean(on);
    isSearching = next;
    window.isSearching = next;
    searchBtn.disabled = next;
    searchBtn.classList.toggle("is-loading", next);
    if (!window.isGenerating) {
      ta.disabled = next;
      send.disabled = next ? false : ta.value.trim().length === 0;
    }
    if (send) {
      send.classList.toggle("is-stop", next);
      send.title = next ? "停止搜索" : "发送";
      send.setAttribute("aria-label", next ? "停止搜索" : "发送");
      if (next) {
        if (STOP_ICON_HTML) send.innerHTML = STOP_ICON_HTML;
      } else if (SEND_ICON_HTML) {
        send.innerHTML = SEND_ICON_HTML;
      }
    }
  }

  function setSearchMode(on) {
    const next = Boolean(on);
    isSearchMode = next;
    window.isSearchMode = next;
    searchBtn.classList.toggle("is-active", next);
    searchBtn.setAttribute("aria-pressed", next ? "true" : "false");
    searchBtn.title = next ? "搜索已开启" : "搜索";
  }

  function isAbortError(err) {
    if (!err) return false;
    if (err.name === "AbortError") return true;
    if (err.code === 20) return true;
    const msg = String(err.message || "");
    return msg.includes("aborted") || msg.includes("AbortError");
  }

  function extractResponseText(resp) {
    const out = [];
    const outputs = Array.isArray(resp?.output) ? resp.output : [];
    outputs.forEach((item) => {
      if (item?.type === "message") {
        const parts = Array.isArray(item.content) ? item.content : [];
        parts.forEach((part) => {
          const text = part?.text;
          if (typeof text === "string" && text.trim()) {
            out.push(text);
          }
        });
      } else if (item?.type === "output_text" && item?.text) {
        out.push(String(item.text));
      }
    });
    return out.join("\n").trim();
  }

  async function runWebSearch(queryText, signal) {
    const body = {
      model: "gpt-4.1",
      tools: [{ type: "web_search_preview" }],
      input: queryText,
    };

    const resp = await fetch("https://api.topglobai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });

    const text = await resp.text().catch(() => "");
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${text || resp.statusText}`);
    }

    return text ? JSON.parse(text) : null;
  }

  function abortSearch() {
    if (!isSearching) return false;
    if (searchAbortController) {
      try {
        searchAbortController.abort();
      } catch (_) {}
    }
    return true;
  }

  async function runSearchFlow(queryText) {
    if (isSearching) return;

    const userMsg = { role: "user", content: queryText };
    ensureMessageId(userMsg);
    appendMessage("user", queryText, userMsg);
    chatHistory.push(userMsg);
    syncLastUserEditUI();

    ta.value = "";
    syncHeight();

    const assistantMsg = { role: "assistant", content: "" };
    ensureMessageId(assistantMsg);
    chatHistory.push(assistantMsg);
    const assistantBubble = appendMessage("assistant", "", assistantMsg);
    assistantBubble.classList.add("is-typing");
    setBubbleHtml(
      assistantBubble,
      '<span class="typing-hint">正在搜索<span class="typing-dots"><i></i><i></i><i></i></span></span>'
    );
    assistantBubble.dataset.rawMd = "";
    ensureMessageActions(assistantBubble, "assistant");
    scrollChatToBottom();

    searchAbortController = new AbortController();
    setSearching(true);

    try {
      await saveCurrentChatToServer();
    } catch (_) {}

    try {
      const data = await runWebSearch(queryText, searchAbortController.signal);
      const resultText = extractResponseText(data) || "暂无结果";

      assistantBubble.classList.remove("is-typing");
      const content = setBubbleHtml(assistantBubble, renderMarkdown(resultText));
      assistantBubble.dataset.rawMd = resultText;
      ensureMessageActions(assistantBubble, "assistant");
      renderLatexIn(content);
      renderCodeHighlight(content);
      secureLinks(content);
      assistantMsg.content = resultText;

      await saveCurrentChatToServer();
    } catch (err) {
      if (isAbortError(err)) {
        assistantBubble.classList.remove("is-typing");
        const msg = "搜索已停止";
        setBubbleText(assistantBubble, msg);
        assistantBubble.dataset.rawMd = msg;
        ensureMessageActions(assistantBubble, "assistant");
        assistantMsg.content = msg;
        try {
          await saveCurrentChatToServer();
        } catch (_) {}
        return;
      }
      assistantBubble.classList.remove("is-typing");
      const msg = "搜索失败：" + (err?.message || String(err));
      setBubbleText(assistantBubble, msg);
      assistantBubble.dataset.rawMd = msg;
      ensureMessageActions(assistantBubble, "assistant");
      assistantMsg.content = msg;
      try {
        await saveCurrentChatToServer();
      } catch (_) {}
    } finally {
      searchAbortController = null;
      setSearching(false);
      syncHeight();
      ta.focus();
    }
  }

  searchBtn.addEventListener("click", () => {
    if (isSearching) return;
    if (window.isGenerating) {
      showToast("正在生成中，请稍后再切换搜索", "warn", 1400);
      return;
    }
    setSearchMode(!isSearchMode);
    ta?.focus();
  });

  send.addEventListener(
    "click",
    async (ev) => {
      if (isSearching) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        abortSearch();
        return;
      }
      if (!isSearchMode) return;
      if (window.isGenerating) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();

      if (isSearching) return;
      const queryText = String(ta.value || "").trim();
      if (!queryText) {
        showToast("请输入搜索内容", "warn", 1400);
        return;
      }
      if (Array.isArray(pendingFiles) && pendingFiles.length > 0) {
        showToast("搜索不支持附件，请先移除附件", "warn", 1600);
        return;
      }
      await runSearchFlow(queryText);
    },
    true
  );
})();

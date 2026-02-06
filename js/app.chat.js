function buildSystemMessage(model) {
  const now = new Date();
  // 你示例里的 system 内容格式
  const sysText =
    '如果需要输出公式，除非用户特别要求，请使用双美元符号，不要使用方括号。\n' +
    `Current model: ${model}\n` +
    `Current time: ${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,"0")}/${String(now.getDate()).padStart(2,"0")} ` +
    `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}\n` +
    'Latex inline: $x^2$\n' +
    'Latex block: $$e=mc^2$$\n';

  return { role: "system", content: sysText };
}

const SEND_ICON_HTML = send?.innerHTML || "";
const STOP_ICON_HTML = `
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2"></rect>
  </svg>
`;

let isGenerating = false;
let activeAbortController = null;
let lastUserTextForInterrupt = "";
let lastUserMsgIdForInterrupt = "";
let interruptRequested = false;
let pendingRestoreFocus = false;
let lastSendMeta = null;

function isAbortError(err) {
  if (!err) return false;
  if (err.name === "AbortError") return true;
  if (err.code === 20) return true;
  const msg = String(err.message || "");
  return msg.includes("aborted") || msg.includes("AbortError");
}

function resolveQuotaErrorMessage(err) {
  const status = err?.status ?? err?.statusCode;
  if (status !== 429) return "";
  const bodyText = String(err?.body ?? err?.responseText ?? "");
  let msgText = "";
  if (bodyText) {
    try {
      const obj = JSON.parse(bodyText);
      msgText = String(obj?.error?.message || obj?.message || "");
    } catch (_) {
      msgText = bodyText;
    }
  }
  const raw = msgText || String(err?.message || "");
  if (raw.includes("上游负载已饱和")) {
    return "积分不足请到 https://topglobai.com/ 充值使用。";
  }
  return "";
}

function updateSendButtonMode(isSending) {
  if (!send) return;
  if (isSending) {
    send.classList.add("is-stop");
    send.title = "停止";
    send.setAttribute("aria-label", "停止生成");
    if (STOP_ICON_HTML) send.innerHTML = STOP_ICON_HTML;
  } else {
    send.classList.remove("is-stop");
    send.title = "发送";
    send.setAttribute("aria-label", "发送");
    if (SEND_ICON_HTML) send.innerHTML = SEND_ICON_HTML;
  }
}

function restoreLastUserInput() {
  const text = String(lastUserTextForInterrupt || "");
  if (!text) return;
  ta.value = text;
  syncHeight();
  pendingRestoreFocus = true;
}

function interruptCurrentGeneration() {
  if (!isGenerating) return false;
  interruptRequested = true;
  if (activeAbortController) {
    try { activeAbortController.abort(); } catch (_) {}
  }
  restoreLastUserInput();
  return true;
}

function removeAssistantMessage(assistantMsg, assistantBubble) {
  if (assistantBubble) {
    const row = assistantBubble.closest(".msg-row");
    if (row) row.remove();
  }
  const idx = chatHistory.indexOf(assistantMsg);
  if (idx >= 0) chatHistory.splice(idx, 1);
}

function removeUserMessageById(msgId) {
  if (!msgId) return false;
  const row = chatList?.querySelector(`.msg-row.user[data-msg-id="${msgId}"]`);
  if (row) row.remove();
  let removed = false;
  if (typeof removeMessageById === "function") {
    removed = removeMessageById(msgId);
  } else {
    const idx = chatHistory.findIndex((m) => m && String(m._mid || "") === msgId);
    if (idx >= 0) {
      chatHistory.splice(idx, 1);
      removed = true;
    }
  }
  syncLastUserEditUI();
  if (!chatList.querySelector(".msg-row") && helloEl) {
    helloEl.style.display = "block";
  }
  return removed;
}

function formatAttachmentSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "--";
  if (typeof formatBytes === "function") return formatBytes(n);
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function guessAttachmentKind(name) {
  const n = String(name || "").toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(n)) return "image";
  return "file";
}

function getAttachmentIconSvg(kind) {
  if (kind === "image") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2"></rect>
        <circle cx="8.5" cy="8.5" r="1.5"></circle>
        <path d="M21 15l-5-5L5 21"></path>
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <path d="M14 2v6h6"></path>
    </svg>
  `;
}

function normalizeMessageAttachments(msgRef) {
  const src = Array.isArray(msgRef?.attachments) ? msgRef.attachments : [];
  const out = [];
  src.forEach((it) => {
    if (!it) return;
    const name = String(it.name || "").trim();
    if (!name) return;
    const sizeNum = Number(it.size);
    out.push({ name, size: Number.isFinite(sizeNum) ? sizeNum : NaN });
  });
  return out;
}

function renderMessageAttachments(stackEl, attachments) {
  if (!stackEl) return;
  const list = Array.isArray(attachments) ? attachments : [];

  const existing = stackEl.querySelector(".msg-attachments");
  if (existing) existing.remove();
  if (list.length === 0) return;

  const wrap = document.createElement("div");
  wrap.className = "msg-attachments";
  wrap.setAttribute("aria-label", "附件");

  list.forEach((att) => {
    const name = String(att?.name || "").trim();
    if (!name) return;
    const sizeText = formatAttachmentSize(att?.size);
    const kind = guessAttachmentKind(name);

    const chip = document.createElement("div");
    chip.className = "msg-attach-chip";
    chip.dataset.kind = kind;
    chip.title = `${name}${sizeText !== "--" ? ` (${sizeText})` : ""}`;

    const ico = document.createElement("span");
    ico.className = "msg-attach-ico";
    ico.innerHTML = getAttachmentIconSvg(kind);

    const nm = document.createElement("span");
    nm.className = "msg-attach-name";
    nm.textContent = name;

    const sz = document.createElement("span");
    sz.className = "msg-attach-size";
    sz.textContent = sizeText;

    chip.appendChild(ico);
    chip.appendChild(nm);
    chip.appendChild(sz);
    wrap.appendChild(chip);
  });

  const actions = stackEl.querySelector(".msg-actions");
  if (actions) stackEl.insertBefore(wrap, actions);
  else stackEl.appendChild(wrap);
}

// 简单消息气泡（不依赖 md、不做上下文）
function appendMessage(role, text, msgRef) {
  const row = document.createElement("div");
  row.className = `msg-row ${role}`;

  const stack = document.createElement("div");
  stack.className = "msg-stack";

  const bubble = document.createElement("div");
  bubble.className = `msg-bubble ${role}`;
  const content = getBubbleContent(bubble);

  if (role === "assistant") {
    bubble.dataset.rawMd = String(text || "");
    bubble.classList.add("markdown-body");
    content.innerHTML = renderMarkdown(text || "");
    renderLatexIn(content);
    renderCodeHighlight(content);
    secureLinks(content);
    if (typeof injectVideoPlayers === "function") {
      injectVideoPlayers(bubble);
    }
    if (typeof injectAudioPlayers === "function") {
      injectAudioPlayers(bubble);
    }
  } else {
    bubble.dataset.rawText = String(text || "");
    content.textContent = text || "";
  }

  stack.appendChild(bubble);
  if (role === "user" && msgRef) {
    const attachments = normalizeMessageAttachments(msgRef);
    if (attachments.length > 0) {
      renderMessageAttachments(stack, attachments);
    }
  }
  if (msgRef) {
    const msgId = ensureMessageId(msgRef);
    if (msgId) row.dataset.msgId = msgId;
  }
  ensureMessageActions(bubble, role);
  row.appendChild(stack);
  chatList.appendChild(row);

  if (helloEl) helloEl.style.display = "none";
  scrollChatToBottom();

  return bubble;
}

function setSending(isSending) {
  const next = Boolean(isSending);
  isGenerating = next;
  window.isGenerating = next;
  updateSendButtonMode(next);
  if (send) {
    send.disabled = next ? false : ta.value.trim().length === 0;
  }
  ta.disabled = next;
  if (!next && pendingRestoreFocus) {
    pendingRestoreFocus = false;
    ta.focus();
    try {
      ta.setSelectionRange(ta.value.length, ta.value.length);
    } catch (_) {}
  }
}

// 初始化历史记录（服务器存储）
initServerHistory();

// ============ ✅ SSE 解析器（EventStream） ============
function createSSEParser(onData) {
  let buffer = "";

  return (chunkText) => {
    buffer += chunkText;

    // 统一换行（兼容 \r\n）
    buffer = buffer.replace(/\r\n/g, "\n");

    // SSE 事件以 \n\n 分割
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const lines = part.split("\n");
      for (const line of lines) {
        // 只处理 data: 行
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();

        if (!data) continue;
        onData(data);
      }
    }
  };
}

// ============ ✅ 核心：发送消息 -> /v1/chat/completions（stream） ============
async function sendChatMessage(userText, userContentOverride, signal) {
  const model = (
    document.getElementById("selected-model")?.innerText || "gpt-4"
  ).trim();

  const systemMsg = buildSystemMessage(model);
  const historyForSend = trimHistory(chatHistory);

  // 允许传 Poe content[]，否则回退纯文本
  const userContent = userContentOverride ?? userText;

  // 先组装：system + history
  const messages = [systemMsg, ...historyForSend];

  // 如果历史最后一条正好是本轮 user 文本：用 userContent 覆盖它（关键！）
  const last = messages[messages.length - 1];
  if (last && last.role === "user" && String(last.content ?? "") === userText) {
    last.content = userContent;
  } else {
    // 否则再追加一条 user
    messages.push({ role: "user", content: userContent });
  }

  const body = {
    model,
    temperature: 0.5,
    presence_penalty: 0,
    frequency_penalty: 0,
    messages,
    stream: true,
  };

  const resp = await fetch("https://api.topglobai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiToken,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    let errText = "";
    try { errText = await resp.text(); } catch (_) {}
    const error = new Error(`HTTP ${resp.status}: ${errText || resp.statusText}`);
    error.status = resp.status;
    error.body = errText;
    throw error;
  }
  if (!resp.body) throw new Error("浏览器不支持 ReadableStream，无法读取流式返回。");
  return resp.body;
}

async function generateAssistantResponse(userText, userContentOverride) {
  const assistantMsg = { role: "assistant", content: "" };
  ensureMessageId(assistantMsg);
  chatHistory.push(assistantMsg);
  const assistantBubble = appendMessage("assistant", "", assistantMsg);
  assistantBubble.classList.add("is-typing");
  setBubbleHtml(
    assistantBubble,
    '<span class="typing-hint">AI 正在输入<span class="typing-dots"><i></i><i></i><i></i></span></span>'
  );
  assistantBubble.dataset.rawMd = "";
  ensureMessageActions(assistantBubble, "assistant");
  setSending(true);

  let hasAssistantOutput = false;
  let aborted = false;
  let abortedNeedsSave = false;
  activeAbortController = new AbortController();
  const abortSignal = activeAbortController.signal;

  try {
    const stream = await sendChatMessage(userText, userContentOverride, abortSignal);

    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8");

    let assistantText = "";

    const parse = createSSEParser((data) => {
      if (data === "[DONE]") return;

      let json;
      try {
        json = JSON.parse(data);
      } catch (e) {
        return;
      }

      const delta =
        json?.choices?.[0]?.delta?.content ??
        json?.choices?.[0]?.message?.content ??
        "";

      let lastPiece = "";

      function mergeStreamPiece(piece) {
        if (!piece) return;
        if (piece === lastPiece) return;
        lastPiece = piece;

        if (piece.startsWith(assistantText)) {
          assistantText = piece;
          return;
        }
        if (assistantText.startsWith(piece)) return;
        assistantText += piece;
      }

      if (delta) {
        mergeStreamPiece(delta);

        const cleaned = stripSpinnerLines(assistantText);
        if (cleaned !== assistantText) {
          assistantText = cleaned;
        }
        if (typeof mergeGeneratingImageProgress === "function") {
          const merged = mergeGeneratingImageProgress(assistantText);
          if (merged !== assistantText) {
            assistantText = merged;
          }
        }
        if (typeof mergeGeneratingVideoProgress === "function") {
          const mergedVideo = mergeGeneratingVideoProgress(assistantText);
          if (mergedVideo !== assistantText) {
            assistantText = mergedVideo;
          }
        }
        if (typeof mergeGeneratingMusicProgress === "function") {
          const mergedMusic = mergeGeneratingMusicProgress(assistantText);
          if (mergedMusic !== assistantText) {
            assistantText = mergedMusic;
          }
        }

        if (!hasAssistantOutput && assistantText.trim() !== "") {
          hasAssistantOutput = true;
          assistantBubble.classList.remove("is-typing");
        }

        if (!hasAssistantOutput && assistantText.trim() === "") {
          return;
        }

        const assistantContent = setBubbleHtml(
          assistantBubble,
          renderMarkdown(assistantText)
        );
        assistantBubble.dataset.rawMd = assistantText;
        ensureMessageActions(assistantBubble, "assistant");
        renderLatexIn(assistantContent);
        renderCodeHighlight(assistantContent);
        secureLinks(assistantContent);
        if (typeof injectVideoPlayers === "function") {
          injectVideoPlayers(assistantBubble);
        }
        if (typeof injectAudioPlayers === "function") {
          injectAudioPlayers(assistantBubble);
        }
        scrollChatToBottom();

        assistantMsg.content = assistantText;
      }

      if (json?.error?.message) {
        const err = "请求失败：" + json.error.message;
        assistantBubble.classList.remove("is-typing");
        setBubbleText(assistantBubble, err);
        assistantBubble.dataset.rawMd = err;
        ensureMessageActions(assistantBubble, "assistant");
        assistantMsg.content = err;
      }
    });

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunkText = decoder.decode(value, { stream: true });
      parse(chunkText);
    }

    await saveCurrentChatToServer();
  } catch (err) {
    if (isAbortError(err)) {
      aborted = true;
      assistantBubble.classList.remove("is-typing");
      if (interruptRequested) {
        removeAssistantMessage(assistantMsg, assistantBubble);
        removeUserMessageById(lastUserMsgIdForInterrupt);

        const meta = lastSendMeta;
        const shouldCancelNewSession =
          meta &&
          !String(meta.chatIdBefore || "") &&
          Number(meta.historyLenBefore || 0) === 0;

        if (shouldCancelNewSession) {
          const deleteId = String(currentChatId || "");
          try {
            if (deleteId && typeof serverKey !== "undefined" && serverKey && typeof apiPost === "function") {
              await apiPost("delete_chat.php", { key: serverKey, id: deleteId });
            }
          } catch (_) {}

          // 回到发送前的状态（保留输入框回填内容）
          try {
            if (typeof startNewChat === "function") {
              startNewChat({ preserveInput: true });
            }
          } catch (_) {}

          if (lastSendMeta?.sideKindBefore === "prompt" && lastSendMeta?.promptKeyBefore) {
            try {
              if (typeof activatePrompt === "function") {
                activatePrompt(lastSendMeta.promptKeyBefore);
              }
            } catch (_) {}
          }

          try {
            if (typeof refreshSessionsList === "function") {
              await refreshSessionsList();
            }
          } catch (_) {}

          abortedNeedsSave = false;
        } else {
          abortedNeedsSave = true;
        }
      } else if (!hasAssistantOutput) {
        removeAssistantMessage(assistantMsg, assistantBubble);
      } else {
        abortedNeedsSave = true;
      }
      interruptRequested = false;
      lastUserMsgIdForInterrupt = "";
      return;
    }

    console.error(err);
    const quotaMsg = resolveQuotaErrorMessage(err);
    const msg = quotaMsg || ("请求异常：" + (err?.message || String(err)));
    assistantBubble.classList.remove("is-typing");
    setBubbleText(assistantBubble, msg);
    assistantBubble.dataset.rawMd = msg;
    ensureMessageActions(assistantBubble, "assistant");
    assistantMsg.content = msg;

    try {
      await saveCurrentChatToServer();
    } catch (_) {}
  } finally {
    if (aborted && abortedNeedsSave) {
      try {
        await saveCurrentChatToServer();
      } catch (_) {}
    }
    activeAbortController = null;
    setSending(false);
    syncHeight();
    ta.focus();
    lastSendMeta = null;
  }
}

// 绑定发送按钮：真正发请求 + 实时渲染流式输出
send.addEventListener("click", async () => {
  if (isGenerating) {
    interruptCurrentGeneration();
    return;
  }
  const text = ta.value.trim();
  if (!text) return;
  lastUserTextForInterrupt = text;
  lastSendMeta = {
    chatIdBefore: String(typeof currentChatId === "undefined" ? "" : (currentChatId || "")),
    historyLenBefore: Array.isArray(chatHistory) ? chatHistory.length : 0,
    sideKindBefore: String(typeof activeSideKind === "undefined" ? "" : (activeSideKind || "")),
    promptKeyBefore: String(typeof activePromptKey === "undefined" ? "" : (activePromptKey || "")),
  };

  // ✅ 发送前先冻结“本轮附件”
  const filesForThisSend = pendingFiles.slice();

  // 仅保存“附件元信息”到历史中（不保存附件本身）
  const attachmentsMeta = filesForThisSend
    .map((f) => ({ name: String(f?.name || ""), size: Number(f?.size) }))
    .filter((a) => a.name && Number.isFinite(a.size) && a.size >= 0);

  const userMsg = { role: "user", content: text };
  if (attachmentsMeta.length > 0) userMsg.attachments = attachmentsMeta;
  const userMsgId = ensureMessageId(userMsg);
  appendMessage("user", text, userMsg);
  lastUserMsgIdForInterrupt = userMsgId;

  // UI：立刻清空附件区
  pendingFiles = [];
  renderAttachList();

  // ✅ 写入“完整历史”（服务端持久化）
  chatHistory.push(userMsg);
  syncLastUserEditUI();

  // 先把用户消息落盘（特别是新会话会拿到 id）
  try {
    await saveCurrentChatToServer();
  } catch (e) {
    appendMessage("assistant", "保存历史失败（仍会继续对话）： " + (e?.message || String(e)));
  }

  ta.value = "";
  syncHeight();

  try {
    // 构造 Poe content[]
    const userParts = await buildUserContentParts(text, filesForThisSend);
    await generateAssistantResponse(text, userParts);
  } catch (err) {
    setSending(false);
    appendMessage("assistant", "请求异常：" + (err?.message || String(err)));
  }
});



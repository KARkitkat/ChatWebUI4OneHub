// ============ ✅ 附件：选择 + 预览 + 发送（Poe content[]） ============
const attachBtn = document.getElementById("attachBtn");
const imageBtn = document.getElementById("imageBtn");
const fileInput = document.getElementById("fileInput");
const imageInput = document.getElementById("imageInput");
const attachListEl = document.getElementById("attachList");
const attachTooltipWrap = document.querySelector(".tooltip-wrap");
const attachTooltipBubble = attachTooltipWrap?.querySelector(".tooltip-bubble");
let isTooltipWrapHover = false;
let isTooltipBubbleHover = false;

function ensureTooltipInBody() {
  if (!attachTooltipBubble) return;
  if (attachTooltipBubble.parentElement !== document.body) {
    document.body.appendChild(attachTooltipBubble);
  }
}

function positionTooltipBubble() {
  if (!attachTooltipBubble || !attachBtn) return;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const btnRect = attachBtn.getBoundingClientRect();
  const bubbleRect = attachTooltipBubble.getBoundingClientRect();

  let left = btnRect.left - 6;
  left = Math.max(8, Math.min(left, viewportW - bubbleRect.width - 8));

  let top = btnRect.top - bubbleRect.height - 12;
  if (top < 8) {
    top = btnRect.bottom + 12;
    if (top + bubbleRect.height > viewportH - 8) {
      top = Math.max(8, viewportH - bubbleRect.height - 8);
    }
  }

  attachTooltipBubble.style.left = `${left}px`;
  attachTooltipBubble.style.top = `${top}px`;
}

function updateTooltipVisibility() {
  if (!attachTooltipBubble) return;
  const hasFiles = pendingFiles.length > 0;
  const shouldShow = (isTooltipWrapHover || isTooltipBubbleHover) && !hasFiles;
  if (shouldShow) {
    ensureTooltipInBody();
    attachTooltipBubble.classList.add("is-floating");
    attachTooltipBubble.classList.add("is-show");
    attachTooltipBubble.setAttribute("aria-hidden", "false");
    requestAnimationFrame(positionTooltipBubble);
  } else {
    attachTooltipBubble.classList.remove("is-show");
    attachTooltipBubble.setAttribute("aria-hidden", "true");
  }
}

if (attachTooltipWrap && attachTooltipBubble) {
  attachTooltipWrap.addEventListener("pointerenter", () => {
    isTooltipWrapHover = true;
    updateTooltipVisibility();
  });
  attachTooltipWrap.addEventListener("pointerleave", () => {
    isTooltipWrapHover = false;
    updateTooltipVisibility();
  });
  attachTooltipWrap.addEventListener("focusin", () => {
    isTooltipWrapHover = true;
    updateTooltipVisibility();
  });
  attachTooltipWrap.addEventListener("focusout", () => {
    isTooltipWrapHover = false;
    updateTooltipVisibility();
  });

  attachTooltipBubble.addEventListener("pointerenter", () => {
    isTooltipBubbleHover = true;
    updateTooltipVisibility();
  });
  attachTooltipBubble.addEventListener("pointerleave", () => {
    isTooltipBubbleHover = false;
    updateTooltipVisibility();
  });

  window.addEventListener("resize", () => {
    if (attachTooltipBubble.classList.contains("is-show")) {
      positionTooltipBubble();
    }
  });
}

// 待发送附件（只针对“本次发送”）
let pendingFiles = [];

// 你可以按需调限制，base64 会膨胀体积（约 1.33x）
const MAX_FILES = 10; // 文件数量
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB / 文件 // 文件大小

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function isImageFile(file) {
  return (file?.type || "").startsWith("image/");
}

function dedupeFiles(files) {
  const seen = new Set(pendingFiles.map(f => `${f.name}|${f.size}|${f.lastModified}`));
  const out = [];
  for (const f of files) {
    const key = `${f.name}|${f.size}|${f.lastModified}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(f);
    }
  }
  return out;
}

function renderAttachList() {
  if (!attachListEl) return;
  attachListEl.innerHTML = "";
  if (attachTooltipWrap) {
    attachTooltipWrap.classList.toggle("has-files", pendingFiles.length > 0);
  }
  if (attachTooltipBubble && pendingFiles.length > 0) {
    attachTooltipBubble.classList.remove("is-show");
    attachTooltipBubble.setAttribute("aria-hidden", "true");
  }

  pendingFiles.forEach((file, idx) => {
    const chip = document.createElement("div");
    chip.className = "attach-chip";

    if (isImageFile(file)) {
      const img = document.createElement("img");
      img.className = "attach-thumb";
      img.alt = file.name;
      img.src = URL.createObjectURL(file);
      // 发送完 / 移除时记得 revoke
      chip.appendChild(img);
    }

    const name = document.createElement("div");
    name.className = "attach-name";
    name.title = `${file.name} (${formatBytes(file.size)})`;
    name.textContent = `${file.name} · ${formatBytes(file.size)}`;
    chip.appendChild(name);

    const rm = document.createElement("button");
    rm.className = "attach-remove";
    rm.type = "button";
    rm.title = "移除";
    rm.textContent = "✕";
    rm.addEventListener("click", () => {
      // 释放图片 blob URL（如果有）
      const img = chip.querySelector("img");
      if (img?.src?.startsWith("blob:")) URL.revokeObjectURL(img.src);

      pendingFiles.splice(idx, 1);
      renderAttachList();
    });
    chip.appendChild(rm);

    attachListEl.appendChild(chip);
  });

  updateComposerSafeArea();
}

function pickFiles(inputEl) {
  if (!inputEl) return;
  inputEl.click();
}

attachBtn?.addEventListener("click", () => pickFiles(fileInput));
imageBtn?.addEventListener("click", () => pickFiles(imageInput));

function handlePickedFiles(files) {
  if (!files || files.length === 0) return;

  if (pendingFiles.length + files.length > MAX_FILES) {
    showToast(`最多可选择 ${MAX_FILES} 个文件`, "warn");
  }

  // 校验
  const valid = [];
  for (const f of files) {
    if (pendingFiles.length + valid.length >= MAX_FILES) break;
    if (f.size > MAX_FILE_BYTES) {
      showToast(`附件过大已跳过：${f.name}（上限 ${formatBytes(MAX_FILE_BYTES)}）`, "warn", 2200);
      continue;
    }
    valid.push(f);
  }

  const toAdd = dedupeFiles(valid);
  if (toAdd.length === 0) return;
  pendingFiles.push(...toAdd);
  renderAttachList();
}

fileInput?.addEventListener("change", () => {
  const files = Array.from(fileInput.files || []);
  fileInput.value = ""; // 允许重复选择同一文件
  handlePickedFiles(files);
  ta?.focus();
});

imageInput?.addEventListener("change", () => {
  const files = Array.from(imageInput.files || []);
  imageInput.value = ""; // 允许重复选择同一文件
  handlePickedFiles(files);
  ta?.focus();
});

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file); // 产出 data:<mime>;base64,....
  });
}

// 将浏览器 File -> Poe content part
async function fileToPoePart(file) {
  const dataUrl = await readFileAsDataURL(file);

  if (isImageFile(file)) {
    return {
      type: "image_url",
      image_url: { url: dataUrl }
    };
  }

  return {
    type: "file",
    file: {
      filename: file.name,
      file_data: dataUrl
    }
  };
}

async function buildUserContentParts(userText, files) {
  const parts = [{ type: "text", text: userText }];

  if (files && files.length > 0) {
    const fileParts = await Promise.all(files.map(fileToPoePart));
    parts.push(...fileParts);
  }

  return parts;
}



(() => {
  const card = document.getElementById("balanceCard");
  const remainingEl = document.getElementById("balanceRemaining");

  if (!card || !remainingEl) return;

  function setText(el, text) {
    if (el) el.textContent = String(text ?? "");
  }

  function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function formatMoney(n) {
    if (!Number.isFinite(n)) return "--";
    return n.toFixed(2);
  }

  async function fetchJson(url) {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + apiToken,
      },
    });
    const text = await resp.text().catch(() => "");
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${text || resp.statusText}`);
    }
    return text ? JSON.parse(text) : null;
  }

  function getMonthRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: formatDate(start), end: formatDate(end) };
  }

  async function loadBalance() {
    if (!apiToken) {
      setText(remainingEl, "--");
      return;
    }

    setText(remainingEl, "加载中");

    try {
      const sub = await fetchJson(
        "https://api.openai.com/v1/dashboard/billing/subscription"
      );
      const total = Number(sub?.system_hard_limit_usd);

      const { start, end } = getMonthRange();
      const usageUrl = new URL(
        "https://api.openai.com/v1/dashboard/billing/usage"
      );
      usageUrl.searchParams.set("start_date", start);
      usageUrl.searchParams.set("end_date", end);

      const usage = await fetchJson(usageUrl.toString());
      const usedRaw = Number(usage?.total_usage);
      const used = Number.isFinite(usedRaw) ? usedRaw / 100 : 0;
      const remaining = Number.isFinite(total) ? Math.max(0, total - used) : NaN;

      setText(remainingEl, formatMoney(remaining));
    } catch (_) {
      setText(remainingEl, "--");
    }
  }

  loadBalance();
  // 每 3 分钟自动刷新一次余额
  setInterval(loadBalance, 3 * 60 * 1000);
})();

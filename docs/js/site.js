const POLL_MS = 30000;
let lastTimestamp = null;

window.agents = [];
window.knownAgents = window.knownAgents || [];

const SUPABASE_FUNCTION_BASE =
    "https://bxnnluhfvqtycaptwjdc.supabase.co/functions/v1/leaderboard";

// Static fallback for GitHub Pages (served from /docs/data/)
function staticJsonUrlForPeriod(period) {
    // cache-bust so Pages/CDN doesn’t serve stale JSON during testing
    const v = Math.floor(Date.now() / 15000);
    return `data/leaderboard-${encodeURIComponent(period)}.json?v=${v}`;
}

const blank = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

const prefersReducedMotion = () =>
    !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

function fmt(v) { return "$" + Number(v).toLocaleString(); }

function getCurrentPeriod() {
    const hash = (location.hash || "#daily").replace("#", "").toLowerCase();
    if (["daily", "weekly", "monthly"].includes(hash)) return hash;
    return "daily";
}

function buildSupabaseUrlForPeriod(period) {
    // Cache-bust for browsers/CDNs
    const cacheKey = Math.floor(Date.now() / 15000); // changes ~every 15s
    return `${SUPABASE_FUNCTION_BASE}?period=${encodeURIComponent(period)}&v=${cacheKey}`;
}

function fullTeamName(code) {
    if (!code) return "";
    switch ((code || "").toLowerCase()) {
        case "n3c": return "N3C Financial";
        case "afg": return "Ascent Financial";
        case "blackoak": return "BlackOak Financial";
        case "wkr": return "WKR Financial";
        case "dialed": return "Dialed Financial";
        case "adaptive": return "Adaptive Financial";
        default: return code;
    }
}

function lookupTeamByName(name) {
    if (!name) return "";
    const found = window.knownAgents.find(a => a.name.toLowerCase() === name.toLowerCase());
    return found ? found.team : "";
}

/* ---------- Optional UI state helpers (safe: no-op if markup not present) ---------- */
let lastSuccessfulFetchAt = null;
let offlineTimer = 0;

function minsAgoText(fromMs) {
    if (!fromMs) return "a moment ago";
    const mins = Math.max(0, Math.floor((Date.now() - fromMs) / 60000));
    if (mins <= 0) return "just now";
    if (mins === 1) return "1 min ago";
    return `${mins} mins ago`;
}

function setOfflineBannerVisible(visible) {
    const banner = document.getElementById("offlineBanner");
    if (!banner) return;
    banner.hidden = !visible;
}

function setEmptyStateVisible(visible) {
    const empty = document.getElementById("emptyState");
    if (!empty) return;
    empty.hidden = !visible;
}

function updateOfflineBannerText() {
    const txt = document.getElementById("offlineText");
    if (!txt) return;
    const when = minsAgoText(lastSuccessfulFetchAt);
    txt.textContent = `Last updated ${when} — reconnecting…`;
}

function showOfflineState() {
    setOfflineBannerVisible(true);
    updateOfflineBannerText();

    clearTimeout(offlineTimer);
    offlineTimer = setTimeout(function tick() {
        updateOfflineBannerText();
        offlineTimer = setTimeout(tick, 15000);
    }, 15000);
}

function clearOfflineState() {
    clearTimeout(offlineTimer);
    offlineTimer = 0;
    setOfflineBannerVisible(false);
}

function clearPodiumUI() {
    const ids = ["name1", "amt1", "sales1", "avatar1", "name2", "amt2", "sales2", "avatar2", "name3", "amt3", "sales3", "avatar3"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id.startsWith("avatar")) el.src = blank;
        else el.textContent = "";
        if (el.dataset && (id.startsWith("amt") || id.startsWith("sales"))) el.dataset.value = "0";
    });
}

/* ---------- Stable IDs ---------- */
function stableIdFromAgent(a) {
    if (a && (a.id != null && String(a.id).trim() !== "")) return String(a.id);
    const name = (a?.name || "").trim().toLowerCase();
    const team = (a?.team || "").trim().toLowerCase();
    return `name:${name}|team:${team}`;
}

/* ---------- Counting animations ---------- */
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function animateNumber(el, from, to, format, durationMs = 650) {
    if (!el) return;

    if (prefersReducedMotion()) {
        el.textContent = format(to);
        el.dataset.value = String(to);
        return;
    }

    const prevRaf = el.dataset.raf ? Number(el.dataset.raf) : 0;
    if (prevRaf) cancelAnimationFrame(prevRaf);

    const start = performance.now();
    const delta = to - from;

    function tick(now) {
        const p = Math.min(1, (now - start) / durationMs);
        const v = from + delta * easeOutCubic(p);
        el.textContent = format(v);
        if (p < 1) {
            const id = requestAnimationFrame(tick);
            el.dataset.raf = String(id);
        } else {
            el.textContent = format(to);
            el.dataset.value = String(to);
            el.dataset.raf = "";
        }
    }

    const id = requestAnimationFrame(tick);
    el.dataset.raf = String(id);
}

function parseMoneyTextToNumber(text) {
    if (!text) return 0;
    const n = Number(String(text).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
}

function parseSalesTextToNumber(text) {
    if (!text) return 0;
    const m = String(text).match(/(\d+)/);
    return m ? Number(m[1]) : 0;
}

function salesFormat(v) {
    const n = Math.round(Number(v) || 0);
    if (n <= 0) return "";
    return n === 1 ? "1 sale" : `${n} Sales`;
}

/* ---------- FLIP helpers ---------- */
function measureRects(mapIdToEl) {
    const rects = new Map();
    for (const [id, el] of mapIdToEl) {
        if (!el || !el.isConnected) continue;
        rects.set(id, el.getBoundingClientRect());
    }
    return rects;
}

function playFLIP(beforeRects, mapIdToEl, options = {}) {
    const { duration = 420, easing = "cubic-bezier(.2,.8,.2,1)" } = options;
    if (prefersReducedMotion()) return;

    for (const [id, el] of mapIdToEl) {
        const first = beforeRects.get(id);
        if (!first || !el || !el.isConnected) continue;

        const last = el.getBoundingClientRect();
        const dx = first.left - last.left;
        const dy = first.top - last.top;

        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;

        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.style.transition = "transform 0s";
        el.style.willChange = "transform";

        el.getBoundingClientRect(); // force reflow

        el.style.transition = `transform ${duration}ms ${easing}`;
        el.style.transform = "";

        window.setTimeout(() => {
            if (!el.isConnected) return;
            el.style.transition = "";
            el.style.transform = "";
            el.style.willChange = "";
        }, duration + 30);
    }
}

/* ---------- Podium crown bounce ---------- */
function ensureCrownEl() {
    const pill = document.querySelector("#pod-1 .pill.gold");
    if (!pill) return null;

    let crown = pill.querySelector(".crown");
    if (!crown) {
        crown = document.createElement("span");
        crown.className = "crown";
        crown.textContent = "👑";
        crown.style.marginRight = "8px";
        crown.style.display = "inline-block";
        crown.style.transformOrigin = "50% 100%";
        pill.insertBefore(crown, pill.firstChild);
    }
    return crown;
}

function crownBounce() {
    if (prefersReducedMotion()) return;
    const crown = ensureCrownEl();
    if (!crown) return;

    crown.animate(
        [
            { transform: "translateY(0) scale(1)" },
            { transform: "translateY(-6px) scale(1.08)" },
            { transform: "translateY(0) scale(1)" }
        ],
        { duration: 520, easing: "cubic-bezier(.2,.9,.2,1)" }
    );
}

/* ---------- DOM builders ---------- */
function makeRow(a) {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.id = a.id;
    row.dataset.name = a.name || "";

    const colRank = document.createElement("div");
    colRank.className = "rank cell cell-rank";
    colRank.textContent = a.rank ?? "";

    const colAgent = document.createElement("div");
    colAgent.className = "agent cell cell-agent";

    const img = document.createElement("img");
    img.src = a.avatar || blank;
    img.alt = a.name || "";

    const nmWrap = document.createElement("div");
    const nm = document.createElement("div");
    nm.className = "agent-name";
    nm.textContent = a.name || "";
    nmWrap.appendChild(nm);

    colAgent.appendChild(img);
    colAgent.appendChild(nmWrap);

    const colTeam = document.createElement("div");
    colTeam.className = "team-col cell cell-team";
    const teamCode = a.team || lookupTeamByName(a.name) || "";
    colTeam.textContent = fullTeamName(teamCode);

    const colAmt = document.createElement("div");
    colAmt.className = "amount-list cell cell-amount";
    colAmt.textContent = (a.amount != null && a.amount > 0) ? fmt(a.amount) : "";
    colAmt.dataset.value = String(a.amount ?? 0);

    const colSales = document.createElement("div");
    colSales.className = "sales-list cell cell-sales";
    colSales.textContent = (a.sales === 1) ? "1 sale" : (a.sales > 1 ? a.sales + " Sales" : "");
    colSales.dataset.value = String(a.sales ?? 0);

    row.appendChild(colRank);
    row.appendChild(colAgent);
    row.appendChild(colTeam);
    row.appendChild(colAmt);
    row.appendChild(colSales);

    return row;
}

function updateRowInPlace(row, a) {
    if (!row) return;

    row.dataset.id = a.id;
    row.dataset.name = a.name || "";

    const rankEl = row.querySelector(".rank");
    if (rankEl) rankEl.textContent = a.rank ?? "";

    const img = row.querySelector(".agent img");
    if (img) {
        const next = a.avatar || blank;
        if (img.src !== next) img.src = next;
        img.alt = a.name || "";
    }

    const nm = row.querySelector(".agent-name");
    if (nm) nm.textContent = a.name || "";

    const teamEl = row.querySelector(".team-col");
    if (teamEl) {
        const teamCode = a.team || lookupTeamByName(a.name) || "";
        teamEl.textContent = fullTeamName(teamCode);
    }

    const amtEl = row.querySelector(".amount-list");
    if (amtEl) {
        const from = Number(amtEl.dataset.value ?? parseMoneyTextToNumber(amtEl.textContent));
        const to = Number(a.amount ?? 0);
        animateNumber(amtEl, from, to, v => (v > 0 ? fmt(v) : ""), 700);
    }

    const salesEl = row.querySelector(".sales-list");
    if (salesEl) {
        const from = Number(salesEl.dataset.value ?? parseSalesTextToNumber(salesEl.textContent));
        const to = Number(a.sales ?? 0);
        animateNumber(salesEl, from, to, salesFormat, 600);
    }
}

/* ---------- Podium updates + FLIP reorder ---------- */
let lastTop1Id = null;

function updatePodiumWithFLIP(agents) {
    const podium = document.querySelector(".podium");
    if (!podium) return;

    const pod1 = document.getElementById("pod-1");
    const pod2 = document.getElementById("pod-2");
    const pod3 = document.getElementById("pod-3");
    if (!pod1 || !pod2 || !pod3) return;

    const podMap = new Map([
        ["pod-1", pod1],
        ["pod-2", pod2],
        ["pod-3", pod3]
    ]);
    const before = measureRects(podMap);

    const top = (agents || []).slice(0, 3);
    const firstId = top[0]?.id ?? null;

    // Keep original DOM order for desktop grid (2,1,3)
    [pod2, pod1, pod3].forEach(el => podium.appendChild(el));

    function setPod(slotIndex, ent, avatarElId) {
        const nameEl = document.getElementById(slotIndex === 1 ? "name1" : slotIndex === 2 ? "name2" : "name3");
        const amtEl = document.getElementById(slotIndex === 1 ? "amt1" : slotIndex === 2 ? "amt2" : "amt3");
        const salesEl = document.getElementById(slotIndex === 1 ? "sales1" : slotIndex === 2 ? "sales2" : "sales3");
        const avatarEl = document.getElementById(avatarElId);

        if (!nameEl || !amtEl || !salesEl) return;

        if (!ent || !ent.name) {
            nameEl.textContent = "";
            amtEl.textContent = "";
            salesEl.textContent = "";
            amtEl.dataset.value = "0";
            salesEl.dataset.value = "0";
            if (avatarEl) avatarEl.src = blank;
            return;
        }

        nameEl.textContent = ent.name;

        const fromAmt = Number(amtEl.dataset.value ?? parseMoneyTextToNumber(amtEl.textContent));
        const toAmt = Number(ent.amount ?? 0);
        animateNumber(amtEl, fromAmt, toAmt, v => (v > 0 ? fmt(v) : ""), 700);

        const fromSales = Number(salesEl.dataset.value ?? parseSalesTextToNumber(salesEl.textContent));
        const toSales = Number(ent.sales ?? 0);
        animateNumber(salesEl, fromSales, toSales, salesFormat, 600);

        if (avatarEl) avatarEl.src = ent.avatar || blank;
    }

    setPod(1, top[0], "avatar1");
    setPod(2, top[1], "avatar2");
    setPod(3, top[2], "avatar3");

    ensureCrownEl();
    if (firstId && lastTop1Id && firstId !== lastTop1Id) crownBounce();
    lastTop1Id = firstId;

    playFLIP(before, podMap, { duration: 420 });
}

/* ---------- List updates + FLIP reorder ---------- */
function updateListWithFLIP(agents) {
    const rowsContainer = document.getElementById("rowsContainer");
    if (!rowsContainer) return;

    const listAgents = (agents || []).slice(3);

    const existing = new Map();
    rowsContainer.querySelectorAll(".row").forEach(r => {
        const id = r.dataset.id;
        if (id) existing.set(id, r);
    });

    const beforeMap = new Map();
    for (const [id, el] of existing) beforeMap.set(id, el);
    const before = measureRects(beforeMap);

    const frag = document.createDocumentFragment();
    for (const a of listAgents) {
        let row = existing.get(a.id);
        if (!row) row = makeRow(a);
        else updateRowInPlace(row, a);
        frag.appendChild(row);
    }

    rowsContainer.replaceChildren(frag);

    const afterMap = new Map();
    rowsContainer.querySelectorAll(".row").forEach(r => {
        const id = r.dataset.id;
        if (id) afterMap.set(id, r);
    });

    playFLIP(before, afterMap, { duration: 440 });
}

/* ---------- Primary render pipeline ---------- */
function applyAgentsAnimated(nextAgents) {
    window.agents = nextAgents;
    updatePodiumWithFLIP(window.agents);
    updateListWithFLIP(window.agents);
}

/* ---------- Fetching ---------- */
async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

async function pollOnce() {
    const period = getCurrentPeriod();

    try {
        // 1) Try Supabase function
        const url = buildSupabaseUrlForPeriod(period);
        const json = await fetchJson(url);

        if (!json || !Array.isArray(json.agents)) throw new Error("Invalid payload");

        lastSuccessfulFetchAt = Date.now();
        clearOfflineState();

        // Empty state
        if (json.agents.length === 0) {
            setEmptyStateVisible(true);
            clearPodiumUI();
            const rows = document.getElementById("rowsContainer");
            if (rows) rows.replaceChildren();
            return;
        }
        setEmptyStateVisible(false);

        if (json.timestamp && json.timestamp === lastTimestamp) return;
        lastTimestamp = json.timestamp || new Date().toISOString();

        const next = json.agents.map((a, i) => ({
            id: stableIdFromAgent(a),
            rank: a.rank ?? (i + 1),
            name: a.name ?? "",
            amount: Number(a.amount ?? 0),
            sales: Number(a.sales ?? 0),
            team: a.team ?? "",
            avatar: a.avatar || ""
        }));

        applyAgentsAnimated(next);
        return;
    } catch {
        // Supabase failed. Fall back to static JSON (GitHub Pages-friendly).
        showOfflineState();
    }

    try {
        const fallbackUrl = staticJsonUrlForPeriod(period);
        const json = await fetchJson(fallbackUrl);

        if (!json || !Array.isArray(json.agents)) return;

        // NOTE: This is still considered "success" for display purposes
        // (but we keep the offline banner visible since Supabase is down).
        if (json.agents.length === 0) {
            setEmptyStateVisible(true);
            clearPodiumUI();
            const rows = document.getElementById("rowsContainer");
            if (rows) rows.replaceChildren();
            return;
        }
        setEmptyStateVisible(false);

        // For static JSON, use timestamp if present, else always render
        const ts = json.timestamp || null;
        if (ts && ts === lastTimestamp) return;
        lastTimestamp = ts || new Date().toISOString();

        const next = json.agents.map((a, i) => ({
            id: stableIdFromAgent(a),
            rank: a.rank ?? (i + 1),
            name: a.name ?? "",
            amount: Number(a.amount ?? 0),
            sales: Number(a.sales ?? 0),
            team: a.team ?? "",
            avatar: a.avatar || ""
        }));

        applyAgentsAnimated(next);
    } catch {
        // Both failed: keep last known data visible; do nothing else.
    }
}

/* ---------- Period switching UI ---------- */
function setActivePeriodUI(period) {
    document.querySelectorAll(".btn.gold").forEach(b => b.classList.toggle("active", b.dataset.period === period));
    document.querySelectorAll(".period-tabs .tab, .tab").forEach(t => t.classList.toggle("active", t.dataset.period === period));

    const label = period.charAt(0).toUpperCase() + period.slice(1);
    const sub = document.getElementById("period-sub");
    if (sub) sub.textContent = `${label} sales — updated automatically`;

    // Allow fetch even if timestamp same across periods
    lastTimestamp = null;
}

function switchPeriod(period) {
    if (!period) return;
    location.hash = period;
}

function wireUi() {
    document.querySelectorAll(".btn.gold").forEach(b => {
        b.addEventListener("click", () => switchPeriod(b.dataset.period));
    });
    document.querySelectorAll(".period-tabs .tab, .tab").forEach(t => {
        t.addEventListener("click", () => switchPeriod(t.dataset.period));
    });

    window.addEventListener("hashchange", () => {
        const period = getCurrentPeriod();
        setActivePeriodUI(period);
        pollOnce();
    });
}

/* ---------- Init ---------- */
wireUi();
setActivePeriodUI(getCurrentPeriod());
pollOnce();
setInterval(pollOnce, POLL_MS);

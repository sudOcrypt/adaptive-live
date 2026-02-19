const POLL_MS = 30000;
let lastTimestamp = null;

window.agents = [];
window.knownAgents = window.knownAgents || [];

const SUPABASE_FUNCTION_BASE =
    "https://bxnnluhfvqtycaptwjdc.supabase.co/functions/v1/leaderboard";

function staticJsonUrlForPeriod(period) {
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
    const cacheKey = Math.floor(Date.now() / 15000);
    return `${SUPABASE_FUNCTION_BASE}?period=${encodeURIComponent(period)}&v=${cacheKey}`;
}

function mapApiAgentsToDisplay(agents) {
    if (!agents || !Array.isArray(agents)) return [];
    return agents.map((a, i) => {
        const amount = Number(a.amount ?? a.points ?? 0);
        return {
            id: stableIdFromAgent(a),
            rank: a.rank ?? (i + 1),
            name: a.name ?? "",
            amount,
            sales: Number(a.sales ?? 0),
            team: a.team ?? "",
            avatar: a.avatar || a.avatar_url || ""
        };
    });
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

function clearTotalsUI(period) {
    updateTotals(period, []);
}

function stableIdFromAgent(a) {
    if (a && (a.id != null && String(a.id).trim() !== "")) return String(a.id);
    const name = (a?.name || "").trim().toLowerCase();
    const team = (a?.team || "").trim().toLowerCase();
    return `name:${name}|team:${team}`;
}

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

function totalsPeriodLabel(period) {
    if (period === "daily") return "today";
    if (period === "weekly") return "this week";
    if (period === "monthly") return "this month";
    return "this period";
}

function updateTotals(period, agents) {
    const apEl = document.getElementById("totalApValue");
    const salesEl = document.getElementById("totalSalesValue");
    const apSub = document.getElementById("totalApSub");
    const salesSub = document.getElementById("totalSalesSub");

    const label = totalsPeriodLabel(period);
    if (apSub) apSub.textContent = `for ${label}`;
    if (salesSub) salesSub.textContent = `for ${label}`;

    const totalAp = (agents || []).reduce((sum, a) => sum + Number(a.amount ?? 0), 0);
    const totalSales = (agents || []).reduce((sum, a) => sum + Number(a.sales ?? 0), 0);

    if (apEl) {
        const fromAp = Number(apEl.dataset.value ?? parseMoneyTextToNumber(apEl.textContent));
        const toAp = Number(totalAp || 0);
        animateNumber(apEl, fromAp, toAp, v => fmt(v), 850);
    }

    if (salesEl) {
        const fromSales = Number(salesEl.dataset.value ?? parseSalesTextToNumber(salesEl.textContent));
        const toSales = Number(totalSales || 0);
        animateNumber(salesEl, fromSales, toSales, v => String(Math.round(Number(v) || 0)), 750);
    }
}

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

        el.getBoundingClientRect();

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

function makeRow(a) {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.id = a.id;
    row.dataset.name = a.name || "";

    const colRank = document.createElement("div");
    colRank.className = "rank cell cell-rank";

    const rankNumber = document.createElement("span");
    rankNumber.className = "rank-number";
    rankNumber.textContent = a.rank ?? "";
    colRank.appendChild(rankNumber);

    const period = getCurrentPeriod();
    const currentDailyRank = period === 'daily' ? a.rank : currentDailyRankings.get(a.id);
    const prevRank = previousDailyRankings.get(a.id);

    console.log(`[Arrow Render] ${a.name}: prevRank=${prevRank}, currentDailyRank=${currentDailyRank}, period=${period}`);

    if (prevRank != null && currentDailyRank != null && prevRank !== currentDailyRank) {
        const arrow = document.createElement("span");
        const diff = Math.abs(prevRank - currentDailyRank);
        arrow.className = prevRank > currentDailyRank ? "rank-arrow up" : "rank-arrow down";
        arrow.textContent = prevRank > currentDailyRank ? `▲${diff}` : `▼${diff}`;
        colRank.appendChild(arrow);
        console.log(`[Arrow Render] ${a.name}: SHOWING ARROW ${arrow.textContent}`);
    }

    const colUser = document.createElement("div");
    colUser.className = "cell cell-user user";

    const teamCode = (a.team || lookupTeamByName(a.name) || "").toLowerCase();
    if (teamCode) {
        const teamDot = document.createElement("span");
        teamDot.className = `team-dot team-${teamCode}`;
        teamDot.setAttribute("aria-hidden", "true");
        colUser.appendChild(teamDot);
    }

    const img = document.createElement("img");
    img.src = a.avatar || a.avatar_url || blank;
    img.alt = a.name || "";
    img.className = "user-avatar";

    const userText = document.createElement("div");
    userText.className = "user-text";

    const nm = document.createElement("div");
    nm.className = "agent-name";
    nm.textContent = a.name || "";

    const team = document.createElement("div");
    team.className = "team-col";
    const teamCode = a.team || lookupTeamByName(a.name) || "";
    team.textContent = fullTeamName(teamCode);

    userText.appendChild(nm);
    userText.appendChild(team);

    colUser.appendChild(img);
    colUser.appendChild(userText);

    const colStats = document.createElement("div");
    colStats.className = "cell cell-stats stats";

    const statsInner = document.createElement("div");
    statsInner.className = "stats-inner";

    const colAmt = document.createElement("div");
    colAmt.className = "amount-list stat amount";
    colAmt.textContent = (a.amount != null && a.amount > 0) ? fmt(a.amount) : "";
    colAmt.dataset.value = String(a.amount ?? 0);

    const maxAmt = (window.agents && window.agents[0]) ? window.agents[0].amount : (a.amount || 1);
    const pct = maxAmt > 0 ? Math.min(100, (Number(a.amount ?? 0) / maxAmt) * 100) : 0;
    const progressBar = document.createElement("div");
    progressBar.className = "amount-progress";
    progressBar.innerHTML = `<div class="amount-progress-fill" style="width:${pct}%"></div>`;

    const colSales = document.createElement("div");
    colSales.className = "sales-list stat sales";
    colSales.textContent = (a.sales === 1) ? "1 sale" : (a.sales > 1 ? a.sales + " Sales" : "");
    colSales.dataset.value = String(a.sales ?? 0);

    statsInner.appendChild(colAmt);
    statsInner.appendChild(progressBar);
    statsInner.appendChild(colSales);
    colStats.appendChild(statsInner);

    row.appendChild(colRank);
    row.appendChild(colUser);
    row.appendChild(colStats);

    return row;
}

function updateRowInPlace(row, a) {
    if (!row) return;

    row.dataset.id = a.id;
    row.dataset.name = a.name || "";

    const rankEl = row.querySelector(".rank");
    if (rankEl) {
        let rankNumber = rankEl.querySelector(".rank-number");
        if (!rankNumber) {
            rankNumber = document.createElement("span");
            rankNumber.className = "rank-number";
            rankEl.appendChild(rankNumber);
        }
        rankNumber.textContent = a.rank ?? "";

        let arrow = rankEl.querySelector(".rank-arrow");
        const period = getCurrentPeriod();
        const currentDailyRank = period === 'daily' ? a.rank : currentDailyRankings.get(a.id);
        const prevRank = previousDailyRankings.get(a.id);

        if (prevRank != null && currentDailyRank != null && prevRank !== currentDailyRank) {
            const diff = Math.abs(prevRank - currentDailyRank);
            if (!arrow) {
                arrow = document.createElement("span");
                arrow.className = prevRank > currentDailyRank ? "rank-arrow up" : "rank-arrow down";
                rankEl.appendChild(arrow);
            } else {
                arrow.className = prevRank > currentDailyRank ? "rank-arrow up" : "rank-arrow down";
            }
            arrow.textContent = prevRank > currentDailyRank ? `▲${diff}` : `▼${diff}`;
        } else if (arrow) {
            arrow.remove();
        }
    }

    const maxAmt = (window.agents && window.agents[0]) ? window.agents[0].amount : (a.amount || 1);
    const pct = maxAmt > 0 ? Math.min(100, (Number(a.amount ?? 0) / maxAmt) * 100) : 0;
    const progressFill = row.querySelector(".amount-progress-fill");
    if (progressFill) progressFill.style.width = `${pct}%`;

    let teamDot = row.querySelector(".team-dot");
    const teamCode = (a.team || lookupTeamByName(a.name) || "").toLowerCase();
    if (teamCode) {
        if (!teamDot) {
            teamDot = document.createElement("span");
            teamDot.className = `team-dot team-${teamCode}`;
            teamDot.setAttribute("aria-hidden", "true");
            const colUser = row.querySelector(".cell-user");
            if (colUser) colUser.insertBefore(teamDot, colUser.firstChild);
        } else {
            teamDot.className = `team-dot team-${teamCode}`;
        }
    } else if (teamDot) {
        teamDot.remove();
    }

    const img = row.querySelector(".user-avatar");
    if (img) {
        const next = a.avatar || a.avatar_url || blank;
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

let lastTop1Id = null;
let previousDailyRankings = new Map();
let currentDailyRankings = new Map();

function loadRankingsFromStorage() {
    try {
        const stored = localStorage.getItem('dailyRankings');
        if (stored) {
            const data = JSON.parse(stored);
            if (data.current) {
                currentDailyRankings = new Map(Object.entries(data.current));
            }
            if (data.previous) {
                previousDailyRankings = new Map(Object.entries(data.previous));
            }
            console.log('[Storage] Loaded rankings from localStorage:', {
                current: currentDailyRankings.size,
                previous: previousDailyRankings.size
            });
        }
    } catch (e) {
        console.error('[Storage] Failed to load rankings:', e);
    }
}

function saveRankingsToStorage() {
    try {
        const data = {
            current: Object.fromEntries(currentDailyRankings),
            previous: Object.fromEntries(previousDailyRankings)
        };
        localStorage.setItem('dailyRankings', JSON.stringify(data));
        console.log('[Storage] Saved rankings to localStorage');
    } catch (e) {
        console.error('[Storage] Failed to save rankings:', e);
    }
}

loadRankingsFromStorage();

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

        if (avatarEl) avatarEl.src = ent.avatar || ent.avatar_url || blank;
    }

    setPod(1, top[0], "avatar1");
    setPod(2, top[1], "avatar2");
    setPod(3, top[2], "avatar3");

    ensureCrownEl();
    if (firstId && lastTop1Id && firstId !== lastTop1Id) crownBounce();
    lastTop1Id = firstId;

    playFLIP(before, podMap, { duration: 420 });
}

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

function applyAgentsAnimated(nextAgents) {
    window.agents = nextAgents;

    const period = getCurrentPeriod();
    if (period === 'daily') {
        nextAgents.forEach(agent => {
            const currentRank = currentDailyRankings.get(agent.id);
            if (currentRank != null) {
                previousDailyRankings.set(agent.id, currentRank);
                console.log(`[Arrow Debug] ${agent.name}: prev=${currentRank} -> current=${agent.rank}`);
            } else {
                console.log(`[Arrow Debug] ${agent.name}: First time seen, rank=${agent.rank}`);
            }
            currentDailyRankings.set(agent.id, agent.rank);
        });
        saveRankingsToStorage();
    }

    updatePodiumWithFLIP(window.agents);
    updateListWithFLIP(window.agents);
}

async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

async function fetchDailyRankingsForArrows() {
    try {
        const url = buildSupabaseUrlForPeriod('daily');
        const json = await fetchJson(url);

        if (!json || !Array.isArray(json.agents)) return;

        const dailyAgents = json.agents.map((a, i) => ({
            id: stableIdFromAgent(a),
            rank: a.rank ?? (i + 1),
        }));

        dailyAgents.forEach(agent => {
            const currentRank = currentDailyRankings.get(agent.id);
            if (currentRank != null) {
                previousDailyRankings.set(agent.id, currentRank);
                console.log(`[Arrow Fetch] ${agent.id}: prev=${currentRank} -> current=${agent.rank}`);
            } else {
                console.log(`[Arrow Fetch] ${agent.id}: First time seen, rank=${agent.rank}`);
            }
            currentDailyRankings.set(agent.id, agent.rank);
        });
        saveRankingsToStorage();
    } catch {
    }
}

async function pollOnce() {
    const period = getCurrentPeriod();

    if (period !== 'daily') {
        await fetchDailyRankingsForArrows();
    }

    try {
        const url = buildSupabaseUrlForPeriod(period);
        const json = await fetchJson(url);

        if (!json || !Array.isArray(json.agents)) throw new Error("Invalid payload");

        lastSuccessfulFetchAt = Date.now();
        clearOfflineState();
        updateLastUpdatedBadge();

        if (json.agents.length === 0) {
            setEmptyStateVisible(true);
            clearPodiumUI();
            clearTotalsUI(period);
            const rows = document.getElementById("rowsContainer");
            if (rows) rows.replaceChildren();
            return;
        }
        setEmptyStateVisible(false);

        if (json.timestamp && json.timestamp === lastTimestamp) return;
        lastTimestamp = json.timestamp || new Date().toISOString();

        const next = mapApiAgentsToDisplay(json.agents);
        applyAgentsAnimated(next);
        updateTotals(period, next);
        return;
    } catch {
        showOfflineState();
    }

    try {
        const fallbackUrl = staticJsonUrlForPeriod(period);
        const json = await fetchJson(fallbackUrl);

        if (!json || !Array.isArray(json.agents)) return;

        if (json.agents.length === 0) {
            setEmptyStateVisible(true);
            clearPodiumUI();
            clearTotalsUI(period);
            const rows = document.getElementById("rowsContainer");
            if (rows) rows.replaceChildren();
            return;
        }
        setEmptyStateVisible(false);

        const ts = json.timestamp || null;
        if (ts && ts === lastTimestamp) return;
        lastTimestamp = ts || new Date().toISOString();

        const next = mapApiAgentsToDisplay(json.agents);

        applyAgentsAnimated(next);
        updateTotals(period, next);
    } catch {
    }
}

function updateLastUpdatedBadge() {
    const el = document.getElementById("lastUpdatedText");
    if (!el) return;
    el.textContent = `Updated ${minsAgoText(lastSuccessfulFetchAt)}`;
}

function setActivePeriodUI(period) {
    document.querySelectorAll(".btn.gold").forEach(b => b.classList.toggle("active", b.dataset.period === period));
    document.querySelectorAll(".period-tabs .tab, .tab").forEach(t => t.classList.toggle("active", t.dataset.period === period));

    const label = period.charAt(0).toUpperCase() + period.slice(1);
    const sub = document.getElementById("period-sub");
    if (sub) sub.textContent = `${label} sales`;

    updateTotals(period, window.agents || []);
    updateLastUpdatedBadge();

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

wireUi();
setActivePeriodUI(getCurrentPeriod());
pollOnce();
setInterval(pollOnce, POLL_MS);
setInterval(updateLastUpdatedBadge, 15000);

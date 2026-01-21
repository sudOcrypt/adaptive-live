// GitHub Pages mode: loads from /docs/data/leaderboard-<period>.json
const POLL_MS = 30000;
let lastTimestamp = null;

window.agents = window.agents || [];
window.knownAgents = window.knownAgents || [];

window.knownAgents = [
    { name: "Trevor Berends", team: "adaptive" },
    { name: "Tommy Sheridan", team: "n3c" },
    { name: "Aaron Masters", team: "dialed" },
    { name: "Darien Meza", team: "n3c" },
    { name: "Mason Pin-Bowder", team: "adaptive" },
    { name: "Matt Walker", team: "wkr" },
    { name: "Reese Trujillo", team: "afg" },
    { name: "Sean Fisher", team: "afg" },
    { name: "Tyler Harshbarger", team: "blackoak" },
    { name: "Andrew S", team: "adaptive" },
    { name: "Kaden Ramey", team: "dialed" },
    { name: "Jack Warren", team: "wkr" },
    { name: "Max Hanson", team: "wkr" },
    { name: "Seamus Hayes", team: "adaptive" },
    { name: "Tanner Forston", team: "dialed" },
    { name: "Caleb Dotterer", team: "adaptive" },
    { name: "Gino", team: "afg" },
    { name: "Peewee", team: "wkr" },
    { name: "Aiden Verdi", team: "afg" },
    { name: "Darrell H", team: "dialed" },
    { name: "Elijah Wilburn", team: "dialed" },
    { name: "Johan Serna", team: "afg" },
    { name: "Eric Eggatt", team: "afg" },
    { name: "Caden Harshbarger", team: "blackoak" },
    { name: "Brandon Richardson", team: "afg" },
    { name: "Noah Doddridge", team: "n3c" },
    { name: "Orison Nakvoss", team: "adaptive" },
    { name: "Landen Krantz", team: "wkr" },
    { name: "Deangelo Weekly", team: "dialed" },
    { name: "Decarlos Frazier", team: "adaptive" },
    { name: "Rylan P", team: "afg" },
    { name: "Joshua Taylor", team: "afg" },
    { name: "Daniel Zelenko", team: "afg" },
    { name: "Ahjay Baez", team: "dialed" },
    { name: "Alex Pappas", team: "dialed" },
    { name: "Donovon P. Rogers", team: "adaptive" },
    { name: "Dovi Clermont", team: "blackoak" },
    { name: "Freedom", team: "blackoak" },
    { name: "Giancarlo Palmeri", team: "adaptive" },
    { name: "Jared Aigner", team: "afg" },
    { name: "Jocelyn", team: "blackoak" },
    { name: "Joel Rodriguez", team: "wkr" },
    { name: "Josh Z", team: "afg" },
    { name: "Kaelyn Jones", team: "n3c" },
    { name: "Matthew Hedquist", team: "adaptive" },
    { name: "Tayden Tindle", team: "adaptive" },
    { name: "Irv Bevelle", team: "n3c" }
];

const blank = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

function fmt(v) { return '$' + Number(v).toLocaleString(); }

function fullTeamName(code) {
    if (!code) return '';
    switch ((code || '').toLowerCase()) {
        case 'n3c': return 'N3C Financial';
        case 'afg': return 'Ascent Financial';
        case 'blackoak': return 'BlackOak Financial';
        case 'wkr': return 'WKR Financial';
        case 'dialed': return 'Dialed Financial';
        case 'adaptive': return 'Adaptive Financial';
        default: return code;
    }
}

function lookupTeamByName(name) {
    if (!name) return '';
    const found = window.knownAgents.find(a => a.name.toLowerCase() === name.toLowerCase());
    return found ? found.team : '';
}

function getCurrentPeriod() {
    const hash = (location.hash || '#daily').replace('#', '').toLowerCase();
    if (['daily', 'weekly', 'monthly'].includes(hash)) return hash;
    return 'daily';
}

function buildUrlForPeriod() {
    const period = getCurrentPeriod();
    return `data/leaderboard-${encodeURIComponent(period)}.json`;
}

function makeRow(a) {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.name = a.name || '';

    const colRank = document.createElement('div');
    colRank.className = 'rank';
    colRank.textContent = a.rank ?? '';

    const colAgent = document.createElement('div');
    colAgent.className = 'agent';

    const img = document.createElement('img');
    img.src = a.avatar || blank;
    img.alt = a.name || '';

    const nmWrap = document.createElement('div');
    const nm = document.createElement('div');
    nm.className = 'agent-name';
    nm.textContent = a.name || '';
    nmWrap.appendChild(nm);

    colAgent.appendChild(img);
    colAgent.appendChild(nmWrap);

    const colTeam = document.createElement('div');
    colTeam.className = 'team-col';
    const teamCode = a.team || lookupTeamByName(a.name) || '';
    colTeam.textContent = fullTeamName(teamCode);

    const colAmt = document.createElement('div');
    colAmt.className = 'amount-list';
    colAmt.textContent = (a.amount != null && a.amount > 0) ? fmt(a.amount) : '';

    const colSales = document.createElement('div');
    colSales.className = 'sales-list';
    colSales.textContent = (a.sales === 1) ? '1 sale' : (a.sales > 1 ? `${a.sales} Sales` : '');

    row.appendChild(colRank);
    row.appendChild(colAgent);
    row.appendChild(colTeam);
    row.appendChild(colAmt);
    row.appendChild(colSales);

    return row;
}

function updatePodiumUI() {
    const top = (window.agents || []).slice(0, 3);

    function setPod(place, ent, avatarElId) {
        const nameEl = document.getElementById(place === 1 ? 'name1' : place === 2 ? 'name2' : 'name3');
        const amtEl = document.getElementById(place === 1 ? 'amt1' : place === 2 ? 'amt2' : 'amt3');
        const salesEl = document.getElementById(place === 1 ? 'sales1' : place === 2 ? 'sales2' : 'sales3');
        const avatarEl = document.getElementById(avatarElId);

        if (!ent || !ent.name) {
            nameEl.textContent = '';
            amtEl.textContent = '';
            salesEl.textContent = '';
            if (avatarEl) avatarEl.src = blank;
            return;
        }

        nameEl.textContent = ent.name;
        amtEl.textContent = (ent.amount != null && ent.amount > 0) ? fmt(ent.amount) : '';
        salesEl.textContent = (ent.sales === 1) ? '1 sale' : (ent.sales > 1 ? `${ent.sales} Sales` : '');
        if (avatarEl) avatarEl.src = ent.avatar || blank;
    }

    setPod(1, top[0], 'avatar1');
    setPod(2, top[1], 'avatar2');
    setPod(3, top[2], 'avatar3');
}

function renderList() {
    const rows = document.getElementById('rowsContainer');
    rows.innerHTML = '';
    if (Array.isArray(window.agents) && window.agents.length) {
        window.agents.slice(3).forEach(a => rows.appendChild(makeRow(a)));
    }
    updatePodiumUI();
}

async function pollOnce() {
    try {
        const url = buildUrlForPeriod();
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) return;

        const json = await res.json();
        if (!json || !Array.isArray(json.agents)) return;
        if (json.timestamp && json.timestamp === lastTimestamp) return;

        lastTimestamp = json.timestamp || new Date().toISOString();

        window.agents = json.agents.map((a, i) => ({
            rank: a.rank ?? (i + 1),
            name: a.name ?? '',
            amount: Number(a.amount ?? 0),
            sales: a.sales ?? 0,
            team: a.team ?? '',
            avatar: a.avatar || ''
        }));

        renderList();
    } catch {
        // ignore
    }
}

function setActivePeriodUI(period) {
    document.querySelectorAll('.btn.gold').forEach(b => b.classList.toggle('active', b.dataset.period === period));
    document.querySelectorAll('.period-tabs .tab, .tab').forEach(t => t.classList.toggle('active', t.dataset.period === period));
    const label = period.charAt(0).toUpperCase() + period.slice(1);
    const el = document.getElementById('period-sub');
    if (el) el.textContent = `${label} sales — updated automatically`;
    lastTimestamp = null;
}

function switchPeriod(period) {
    location.hash = period;
    setActivePeriodUI(period);
    pollOnce();
}

document.querySelectorAll('.btn.gold').forEach(b => b.addEventListener('click', () => switchPeriod(b.dataset.period)));
document.querySelectorAll('.period-tabs .tab, .tab').forEach(t => t.addEventListener('click', () => switchPeriod(t.dataset.period)));
window.addEventListener('hashchange', () => setActivePeriodUI(getCurrentPeriod()));

renderList();
setActivePeriodUI(getCurrentPeriod());
pollOnce();
setInterval(pollOnce, POLL_MS);

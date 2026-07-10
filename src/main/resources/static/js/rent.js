let rentTrattative = [];
let rentTrattativeFiltered = [];
let rentContattiNoleggio = [];
let chartRentStato = null;
let chartRentFonte = null;
let chartRentInfoVsRichiesta = null;
let selectedRentMarchio = '';
let selectedRentTipoCliente = '';
let rentTrattativeSortDir = 'desc';
let rentContattiSortDir = 'desc';
let rentDayView = null;
let rtdEditId = null;

const RENT_STATO_LIST = ['SOLO_INFO', 'TRATTATIVA_IN_CORSO', 'DA_RICHIAMARE', 'CONCLUSA', 'FALLITO'];
const RENT_STATO_LABELS = {
    'SOLO_INFO': 'Solo Info',
    'TRATTATIVA_IN_CORSO': 'Trattativa in corso',
    'DA_RICHIAMARE': 'Da richiamare',
    'CONCLUSA': 'Conclusa',
    'FALLITO': 'Fallito'
};
const RENT_STATO_COLORS = {
    'SOLO_INFO': '#f0c040',
    'TRATTATIVA_IN_CORSO': '#7c4dff',
    'DA_RICHIAMARE': '#e91e63',
    'CONCLUSA': '#00c853',
    'FALLITO': '#ff3d3d'
};

const RENT_FONTE_LIST = ['Sito', 'Google ADS', 'Autoscout', 'Facebook', 'Instagram', 'TikTok', 'Richiesta cliente', 'Non ricorda', 'Ingresso', 'Cliente Personale'];
const RENT_FONTE_COLORS = ['#1a4080', '#f0c040', '#e91e63', '#4a90d9', '#7c4dff', '#ff3d3d', '#00c853', '#8a8faa', '#ff6b35', '#26a69a'];

const RENT_TIPO_CLIENTE_LIST = ['Privato', 'Partita IVA', 'Noleggio per aziende'];

function loadRentDashboard() {
    const today = todayStr();
    const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const fromEl = document.getElementById('rentContattiFrom');
    const toEl = document.getElementById('rentContattiTo');
    if (fromEl && !fromEl.value) fromEl.value = firstDay;
    if (toEl && !toEl.value) toEl.value = today;

    if (typeof populateMultiSelectOptions === 'function' && document.getElementById('rentStatoFilterMulti-options')) {
        const optionsContainer = document.getElementById('rentStatoFilterMulti-options');
        if (optionsContainer && !optionsContainer.dataset.populated) {
            optionsContainer.dataset.populated = '1';
            if (typeof updateMultiSelectLabel === 'function') updateMultiSelectLabel('rentStatoFilterMulti');
        }
    }

    loadRentTrattative();
    loadRentContattiNoleggio();
    checkRentRecallOggi();
}

async function loadRentTrattative() {
    try {
        const res = await fetch('/api/noleggio/trattative');
        if (!res.ok) return;
        rentTrattative = await res.json();
        rentTrattative.sort((a, b) => rentTrattativeSortDir === 'desc'
            ? (b.createdAt || '').localeCompare(a.createdAt || '')
            : (a.createdAt || '').localeCompare(b.createdAt || ''));
        populateRentFilters();
        applyRentFilters();
    } catch (err) {
        console.error('Errore caricamento trattative noleggio:', err);
    }
}

function populateRentFilters() {
    if (typeof populateMultiSelectOptions !== 'function') return;

    const marchi = [...new Set(rentTrattative.map(t => t.marchio).filter(Boolean))].sort();
    populateMultiSelectOptions('rentMarchioFilterMulti', marchi);

    const fonti = [...new Set(rentTrattative.map(t => t.fonte).filter(Boolean))].sort();
    populateMultiSelectOptions('rentFonteFilterMulti', fonti);

    const operatori = [...new Set(rentTrattative.map(t => t.user?.fullName).filter(Boolean))].sort();
    populateMultiSelectOptions('rentOperatoreFilterMulti', operatori);
}

function applyRentFilters() {
    const statoSelezionati = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('rentStatoFilterMulti') : [];
    const marchiSelezionati = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('rentMarchioFilterMulti') : [];
    const fontiSelezionate = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('rentFonteFilterMulti') : [];
    const operatoriSelezionati = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('rentOperatoreFilterMulti') : [];
    const ruolo = document.getElementById('rentRuoloFilter')?.value || '';

    rentTrattativeFiltered = rentTrattative.filter(t => {
        if (statoSelezionati.length > 0 && !statoSelezionati.includes(t.stato)) return false;
        if (marchiSelezionati.length > 0 && !marchiSelezionati.includes(t.marchio)) return false;
        if (fontiSelezionate.length > 0 && !fontiSelezionate.includes(t.fonte)) return false;
        if (ruolo === 'NOLEGGIO' && t.user?.role !== 'NOLEGGIO') return false;
        if (ruolo === 'BDC' && t.user?.role === 'NOLEGGIO') return false;
        if (operatoriSelezionati.length > 0 && !operatoriSelezionati.includes(t.user?.fullName)) return false;
        return true;
    });

    if (rentDayView) {
        renderRentDayView(rentDayView);
    } else {
        renderRentTrattative(rentTrattativeFiltered);
    }
    renderRentStats(rentTrattativeFiltered);
    renderChartRentStato(rentTrattativeFiltered);
    renderChartRentFonte(rentTrattativeFiltered);
    renderChartRentMarchi(rentTrattativeFiltered);
}

function renderRentStats(list) {
    const el = id => document.getElementById(id);
    if (el('rentStatTotal')) el('rentStatTotal').textContent = list.length;
    if (el('rentStatSoloInfo')) el('rentStatSoloInfo').textContent = list.filter(t => t.stato === 'SOLO_INFO').length;
    if (el('rentStatInCorso')) el('rentStatInCorso').textContent = list.filter(t => t.stato === 'TRATTATIVA_IN_CORSO').length;
    if (el('rentStatDaRichiamare')) el('rentStatDaRichiamare').textContent = list.filter(t => t.stato === 'DA_RICHIAMARE').length;
    if (el('rentStatConcluse')) el('rentStatConcluse').textContent = list.filter(t => t.stato === 'CONCLUSA').length;
}

function toggleRentTrattativeSortDir() {
    rentTrattativeSortDir = rentTrattativeSortDir === 'desc' ? 'asc' : 'desc';
    const btn = document.getElementById('rentTrattativeSortBtn');
    if (btn) btn.textContent = rentTrattativeSortDir === 'desc' ? '⬇️ Più recenti prima' : '⬆️ Meno recenti prima';
    loadRentTrattative();
}

function toggleRentContattiSortDir() {
    rentContattiSortDir = rentContattiSortDir === 'desc' ? 'asc' : 'desc';
    const btn = document.getElementById('rentContattiSortBtn');
    if (btn) btn.textContent = rentContattiSortDir === 'desc' ? '⬇️ Più recenti prima' : '⬆️ Meno recenti prima';
    loadRentContattiNoleggio();
}

// ============================================================
// VISTA GIORNALIERA
// ============================================================

function showRentDayView(date) {
    rentDayView = date;
    renderRentDayView(date);
}

function closeRentDayView() {
    rentDayView = null;
    renderRentTrattative(rentTrattativeFiltered);
}

function renderRentDayView(date) {
    const container = document.getElementById('rentTrattativeList');
    if (!container) return;
    const items = rentTrattativeFiltered
        .filter(t => (t.createdAt || '').split('T')[0] === date)
        .sort((a, b) => rentTrattativeSortDir === 'desc'
            ? (b.createdAt || '').localeCompare(a.createdAt || '')
            : (a.createdAt || '').localeCompare(b.createdAt || ''));

    container.innerHTML = `
        <div style="margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <button class="btn-secondary" onclick="closeRentDayView()" style="padding:8px 16px;font-size:12px">← INDIETRO</button>
            <span style="font-size:16px;font-weight:800;color:var(--text-primary)">${formatDateIT(date)}</span>
            <span style="font-size:12px;color:var(--text-secondary);font-weight:700">${items.length} trattativ${items.length===1?'a':'e'}</span>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
            ${items.length > 0 ? items.map(t => renderRentTrattativaCard(t)).join('') : '<div class="empty-state" style="padding:20px;width:100%"><p>Nessuna trattativa per questo giorno</p></div>'}
        </div>`;
}

function renderRentTrattative(list) {
    const container = document.getElementById('rentTrattativeList');
    if (!container) return;
    if (list.length === 0) {
        container.innerHTML = `<div class="empty-state"><h3>🚗</h3><p>Nessuna trattativa registrata</p></div>`;
        return;
    }

    const tree = {};
    list.forEach(t => {
        const date = (t.createdAt || '').split('T')[0];
        if (!date) return;
        const d = parseLocalDate(date);
        const year = d.getFullYear().toString();
        const month = d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
        const week = getWeekKey(date);
        if (!tree[year]) tree[year] = {};
        if (!tree[year][month]) tree[year][month] = {};
        if (!tree[year][month][week]) tree[year][month][week] = { days: {}, monday: getISOWeekMonday(date) };
        if (!tree[year][month][week].days[date]) tree[year][month][week].days[date] = [];
        tree[year][month][week].days[date].push(t);
    });

    const today = todayStr();
    const currentYear = new Date().getFullYear().toString();
    const todayMonday = getISOWeekMonday(today);

    container.innerHTML = `<div style="position:relative;padding-left:4px">
        ${Object.entries(tree).sort((a,b) => b[0]-a[0]).map(([year, months]) => {
            const yearKey = `rtl-year-${year}`;
            const flat = Object.values(months).flatMap(w => Object.values(w)).flatMap(w => Object.values(w.days)).flat();
            const yearCount = flat.length;
            const yearRichiamare = flat.filter(t => t.stato === 'DA_RICHIAMARE').length;
            const isYearOpen = year === currentYear;
            return `
            <div style="position:relative;padding-left:22px;margin-bottom:14px;border-left:2px solid rgba(46,204,113,0.35)">
                <div onclick="toggleTree('${yearKey}')" style="cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-card);border:1.5px solid var(--border);border-radius:12px;margin-left:-24px;box-shadow:var(--shadow)">
                    <span style="width:10px;height:10px;border-radius:50%;background:#2ecc71;flex-shrink:0;box-shadow:0 0 0 3px rgba(46,204,113,0.2)"></span>
                    <span style="font-size:15px;font-weight:900;color:var(--text-primary);letter-spacing:0.5px">${year}</span>
                    <span style="font-size:11px;color:var(--text-secondary);font-weight:600">${yearCount} trattativ${yearCount===1?'a':'e'}${yearRichiamare>0?` · <span style="color:#e91e63;font-weight:800">⚠️ ${yearRichiamare} da richiamare</span>`:''}</span>
                    <span id="arrow-${yearKey}" style="margin-left:auto;color:var(--text-secondary);font-size:11px;transition:transform 0.3s;${isYearOpen?'':'transform:rotate(-90deg)'}">▼</span>
                </div>
                <div id="body-${yearKey}" style="display:${isYearOpen?'block':'none'};margin-top:10px">
                    ${Object.entries(months).sort().map(([month, weeks]) => {
                        const monthKey = `rtl-month-${year}-${month.replace(/\s/g,'_')}`;
                        const monthFlat = Object.values(weeks).flatMap(w => Object.values(w.days)).flat();
                        const monthCount = monthFlat.length;
                        const monthRichiamare = monthFlat.filter(t => t.stato === 'DA_RICHIAMARE').length;
                        const isCurrentMonth = month === new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
                        return `
                        <div style="position:relative;padding-left:20px;margin-bottom:10px;border-left:2px dashed rgba(46,204,113,0.25)">
                            <div onclick="toggleTree('${monthKey}')" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--step-bg);border:1px solid var(--border);border-radius:10px;margin-left:-22px">
                                <span style="width:7px;height:7px;border-radius:50%;background:#7c4dff;flex-shrink:0"></span>
                                <span style="font-size:13px;font-weight:800;color:var(--text-primary);text-transform:capitalize">${month}</span>
                                <span style="font-size:10px;color:var(--text-secondary);font-weight:600">${monthCount} trattativ${monthCount===1?'a':'e'}${monthRichiamare>0?` · <span style="color:#e91e63">⚠️ ${monthRichiamare}</span>`:''}</span>
                                <span id="arrow-${monthKey}" style="margin-left:auto;color:var(--text-secondary);font-size:10px;transition:transform 0.3s;${isCurrentMonth?'':'transform:rotate(-90deg)'}">▼</span>
                            </div>
                            <div id="body-${monthKey}" style="display:${isCurrentMonth?'block':'none'};margin-top:8px">
                                ${Object.entries(weeks).sort().map(([week, weekData]) => {
                                    const weekKey = `rtl-week-${week.replace(/[\s—]/g,'_')}-${month.replace(/\s/g,'_')}`;
                                    const weekFlat = Object.values(weekData.days).flat();
                                    const weekCount = weekFlat.length;
                                    const isCurrentWeek = weekData.monday.getTime() === todayMonday.getTime();
                                    return `
                                    <div style="position:relative;padding-left:18px;margin-bottom:8px">
                                        <div onclick="toggleTree('${weekKey}')" style="cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 10px;font-size:11px;color:var(--text-secondary);font-weight:700">
                                            <span style="width:5px;height:5px;border-radius:50%;background:#4a90d9;flex-shrink:0"></span>
                                            <span>${week}</span>
                                            <span style="opacity:0.7">(${weekCount})</span>
                                            <span id="arrow-${weekKey}" style="margin-left:auto;font-size:9px;transition:transform 0.3s;${isCurrentWeek?'':'transform:rotate(-90deg)'}">▼</span>
                                        </div>
                                        <div id="body-${weekKey}" style="display:${isCurrentWeek?'block':'none'}">
                                            ${Object.entries(weekData.days).sort((a,b) => b[0].localeCompare(a[0])).map(([date, items]) => {
                                                const itemsSorted = [...items].sort((a,b) => rentTrattativeSortDir === 'desc'
                                                    ? (b.createdAt||'').localeCompare(a.createdAt||'')
                                                    : (a.createdAt||'').localeCompare(b.createdAt||''));
                                                return `
                                                <div style="margin-bottom:10px;padding-left:14px">
                                                    <div onclick="showRentDayView('${date}')" style="cursor:pointer;display:inline-flex;align-items:center;gap:8px;font-size:10px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;padding:4px 10px;border-radius:8px;transition:background 0.15s" onmouseover="this.style.background='rgba(46,204,113,0.10)'" onmouseout="this.style.background='transparent'">
                                                        📅 ${formatDateIT(date)}
                                                        <span style="color:#2ecc71;font-weight:900">👁 vedi solo questo giorno</span>
                                                    </div>
                                                    <div style="display:flex;gap:10px;flex-wrap:wrap">
                                                        ${itemsSorted.map(t => renderRentTrattativaCard(t)).join('')}
                                                    </div>
                                                </div>`;
                                            }).join('')}
                                        </div>
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        }).join('')}
    </div>`;
}

// Card cliccabile ovunque -> apre il modal di dettaglio/gestione completo.
// I pulsanti interni (modifica rapida, elimina, link) fermano la propagazione
// del click con event.stopPropagation() per non aprire il modal per errore.
function renderRentTrattativaCard(t) {
    const today = todayStr();
    const isRecallToday = t.stato === 'DA_RICHIAMARE' && t.dataRichiamo === today;
    const isRecallPast = t.stato === 'DA_RICHIAMARE' && t.dataRichiamo && t.dataRichiamo < today;
    const color = RENT_STATO_COLORS[t.stato] || '#8a8faa';

    const links = [];
    if (t.linkLeadspark) links.push(`<a href="${t.linkLeadspark}" target="_blank" rel="noopener" title="Leadspark" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:rgba(0,200,83,0.15);color:#00c853;text-decoration:none;font-size:13px">🔗</a>`);
    if (t.linkAutoRichiesta) links.push(`<a href="${t.linkAutoRichiesta}" target="_blank" rel="noopener" title="Auto richiesta" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:rgba(74,144,217,0.15);color:#4a90d9;text-decoration:none;font-size:13px">🔗</a>`);

    return `<div onclick="openRentTrattativaModal(${t.id})" style="width:260px;cursor:pointer;background:var(--bg-card);border:1.5px solid ${isRecallToday||isRecallPast?color:'var(--border)'};border-left:4px solid ${color};border-radius:10px;padding:12px;box-shadow:var(--shadow);transition:transform 0.15s;${isRecallToday?'box-shadow:0 0 12px rgba(233,30,99,0.25)':''}" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
        <div style="font-weight:800;color:var(--text-primary);font-size:13px">${t.nome} ${t.cognome}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;line-height:1.6">
            🚗 ${t.marchio}${t.modello?' '+t.modello:''}<br>
            ${t.cellulare ? `📞 ${t.cellulare}<br>` : ''}
            ${t.fonte ? `🌐 ${t.fonte}<br>` : ''}
            ${t.tipoCliente ? `🏷️ ${t.tipoCliente}<br>` : ''}
            👤 ${t.user?.fullName || '—'}${t.user?.role === 'NOLEGGIO' ? ' <span style="color:#2ecc71;font-weight:700">(Noleggio)</span>' : ''}
        </div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <span style="font-size:10px;font-weight:800;padding:3px 8px;border-radius:10px;background:${color}22;color:${color}">${RENT_STATO_LABELS[t.stato] || t.stato}</span>
            ${t.dataRichiamo ? `<span style="font-size:10px;font-weight:700;color:${isRecallPast?'#e91e63':isRecallToday?'#f0c040':'var(--text-secondary)'}">📅 ${formatDateIT(t.dataRichiamo)}</span>` : ''}
        </div>
        ${t.stato === 'FALLITO' && t.noteFallimento ? `<div style="margin-top:8px;font-size:10px;color:#ff3d3d;background:rgba(255,61,61,0.08);padding:6px 8px;border-radius:6px">❌ ${t.noteFallimento}</div>` : ''}
        <div style="margin-top:8px;display:flex;gap:6px;align-items:center">
            <button class="btn-small btn-blue" onclick="event.stopPropagation();editRentTrattativa(${t.id})" title="Modifica rapida">✏️</button>
            <button class="btn-small btn-red" onclick="event.stopPropagation();deleteRentTrattativa(${t.id})" title="Elimina">🗑️</button>
            ${links.length > 0 ? `<span style="margin-left:auto;display:flex;gap:6px">${links.join('')}</span>` : ''}
        </div>
    </div>`;
}

// ============================================================
// MODAL DETTAGLIO/GESTIONE TRATTATIVA — click sulla card
// ============================================================

function openRentTrattativaModal(id) {
    const t = rentTrattative.find(x => x.id === id);
    if (!t) return;
    rtdEditId = id;

    document.getElementById('rtdNome').value = t.nome || '';
    document.getElementById('rtdCognome').value = t.cognome || '';
    document.getElementById('rtdCellulare').value = t.cellulare || '';
    document.getElementById('rtdEmail').value = t.email || '';
    document.getElementById('rtdMarca').value = t.marchio || '';
    document.getElementById('rtdModello').value = t.modello || '';
    document.getElementById('rtdFonte').value = t.fonte || '';
    document.getElementById('rtdTipoCliente').value = t.tipoCliente || '';
    document.getElementById('rtdNote').value = t.note || '';
    document.getElementById('rtdLinkLeadspark').value = t.linkLeadspark || '';
    document.getElementById('rtdLinkAutoRichiesta').value = t.linkAutoRichiesta || '';
    document.getElementById('rtdStato').value = t.stato || 'SOLO_INFO';
    document.getElementById('rtdDataRichiamo').value = t.dataRichiamo || '';
    document.getElementById('rtdNoteFallimento').value = t.noteFallimento || '';

    const opInfo = document.getElementById('rtdOperatoreInfo');
    if (opInfo) opInfo.textContent = `${t.user?.fullName || '—'}${t.user?.role === 'NOLEGGIO' ? ' (Noleggio)' : ''}`;

    const createdInfo = document.getElementById('rtdCreatedInfo');
    if (createdInfo) {
        if (t.createdAt) {
            const date = t.createdAt.split('T')[0];
            const time = (t.createdAt.split('T')[1] || '').substring(0,5);
            createdInfo.textContent = `${formatDateIT(date)} · ${time}`;
        } else {
            createdInfo.textContent = '—';
        }
    }

    onRtdStatoChange();

    const modal = document.getElementById('rentTrattativaModal');
    if (modal) modal.style.display = 'flex';
}

function closeRentTrattativaModal(event) {
    if (event && event.target.id !== 'rentTrattativaModal') return;
    const modal = document.getElementById('rentTrattativaModal');
    if (modal) modal.style.display = 'none';
    rtdEditId = null;
}

function onRtdStatoChange() {
    const stato = document.getElementById('rtdStato').value;
    const row = document.getElementById('rtdDataRichiamoRow');
    if (row) row.style.display = stato === 'DA_RICHIAMARE' ? 'block' : 'none';
    const noteFallimentoRow = document.getElementById('rtdNoteFallimentoRow');
    if (noteFallimentoRow) noteFallimentoRow.style.display = stato === 'FALLITO' ? 'block' : 'none';
}

async function saveRentTrattativaDetail() {
    if (!rtdEditId) return;
    const nome = document.getElementById('rtdNome').value.trim();
    const cognome = document.getElementById('rtdCognome').value.trim();
    const cellulare = document.getElementById('rtdCellulare').value.trim();
    const email = document.getElementById('rtdEmail').value.trim();
    const marchio = document.getElementById('rtdMarca').value.trim();
    const modello = document.getElementById('rtdModello').value.trim();
    const fonte = document.getElementById('rtdFonte').value;
    const tipoCliente = document.getElementById('rtdTipoCliente').value;
    const note = document.getElementById('rtdNote').value.trim();
    const linkLeadspark = document.getElementById('rtdLinkLeadspark').value.trim();
    const linkAutoRichiesta = document.getElementById('rtdLinkAutoRichiesta').value.trim();
    const stato = document.getElementById('rtdStato').value;
    const dataRichiamo = document.getElementById('rtdDataRichiamo').value;
    const noteFallimento = document.getElementById('rtdNoteFallimento').value.trim();

    if (!nome) { alert('Il nome è obbligatorio'); return; }
    if (!cognome) { alert('Il cognome è obbligatorio'); return; }
    if (!cellulare) { alert('Il cellulare è obbligatorio'); return; }
    if (!marchio) { alert('Il marchio è obbligatorio'); return; }
    if (stato === 'DA_RICHIAMARE' && !dataRichiamo) { alert('Inserisci la data di richiamo'); return; }

    const payload = {
        nome, cognome, cellulare,
        email: email || null,
        marchio,
        modello: modello || null,
        note: note || null,
        fonte: fonte || null,
        stato,
        dataRichiamo: stato === 'DA_RICHIAMARE' ? dataRichiamo : null,
        noteFallimento: stato === 'FALLITO' ? (noteFallimento || null) : null,
        tipoCliente: tipoCliente || null,
        linkLeadspark: linkLeadspark || null,
        linkAutoRichiesta: linkAutoRichiesta || null
    };

    try {
        const res = await fetch(`/api/noleggio/trattative/${rtdEditId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
            alert(data.error || 'Errore nel salvataggio');
            return;
        }
        closeRentTrattativaModal();
        loadRentTrattative();
    } catch (err) {
        console.error('Errore salvataggio dettaglio trattativa:', err);
    }
}

async function deleteRentTrattativaFromModal() {
    if (!rtdEditId) return;
    if (!confirm('Eliminare questa trattativa?')) return;
    try {
        await fetch(`/api/noleggio/trattative/${rtdEditId}`, { method: 'DELETE' });
        closeRentTrattativaModal();
        loadRentTrattative();
    } catch (err) {
        console.error('Errore eliminazione trattativa:', err);
    }
}

// ============================================================
// FORM NUOVA / MODIFICA RAPIDA (invariati)
// ============================================================

function showNewRentForm() {
    document.getElementById('rentFormTitle').textContent = 'NUOVA TRATTATIVA';
    document.getElementById('rentEditId').value = '';
    document.getElementById('newRentForm').style.display = 'block';
    document.getElementById('newRentForm').scrollIntoView({ behavior: 'smooth' });
}

function hideNewRentForm() {
    document.getElementById('newRentForm').style.display = 'none';
    document.getElementById('rentEditId').value = '';
    ['rentNome','rentCognome','rentCellulare','rentEmail','rentModello','rentNote',
     'rentLinkLeadspark','rentLinkAutoRichiesta','rentDataRichiamo','rentMarcaInput','rentMarchio',
     'rentNoteFallimento'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('rentStato').value = 'SOLO_INFO';
    document.getElementById('rentDataRichiamoRow').style.display = 'none';
    const noteFallimentoRow = document.getElementById('rentNoteFallimentoRow');
    if (noteFallimentoRow) noteFallimentoRow.style.display = 'none';
    selectedRentMarchio = '';
    selectedRentTipoCliente = '';
    const rentTipoClienteHidden = document.getElementById('rentTipoCliente');
    if (rentTipoClienteHidden) rentTipoClienteHidden.value = '';

    const fonteKeyMap = { 'Sito':'Sito','Google ADS':'GoogleADS','Autoscout':'Autoscout','Facebook':'Facebook','Instagram':'Instagram','TikTok':'TikTok','Richiesta cliente':'RichiestaCliente','Non ricorda':'NonRicorda','Ingresso':'Ingresso','Cliente Personale':'ClientePersonale' };
    document.getElementById('rentFonteValue').value = '';
    Object.values(fonteKeyMap).forEach(k => {
        const btn = document.getElementById(`rentFonte-${k}`);
        if (btn) btn.classList.remove('btn-sede-active');
    });

    const tipoClienteKeyMap = { 'Privato':'Privato','Partita IVA':'PIVA','Noleggio per aziende':'Aziende' };
    Object.values(tipoClienteKeyMap).forEach(k => {
        const btn = document.getElementById(`rentTipoCliente-${k}`);
        if (btn) btn.classList.remove('btn-sede-active');
    });
}

function selectRentFonte(fonte) {
    document.getElementById('rentFonteValue').value = fonte;
    const fonteKeyMap = { 'Sito':'Sito','Google ADS':'GoogleADS','Autoscout':'Autoscout','Facebook':'Facebook','Instagram':'Instagram','TikTok':'TikTok','Richiesta cliente':'RichiestaCliente','Non ricorda':'NonRicorda','Ingresso':'Ingresso','Cliente Personale':'ClientePersonale' };
    Object.keys(fonteKeyMap).forEach(f => {
        const btn = document.getElementById(`rentFonte-${fonteKeyMap[f]}`);
        if (btn) btn.classList.toggle('btn-sede-active', f === fonte);
    });
}

function selectRentTipoCliente(tipo) {
    selectedRentTipoCliente = tipo;
    const hidden = document.getElementById('rentTipoCliente');
    if (hidden) hidden.value = tipo;
    const tipoClienteKeyMap = { 'Privato':'Privato','Partita IVA':'PIVA','Noleggio per aziende':'Aziende' };
    Object.keys(tipoClienteKeyMap).forEach(t => {
        const btn = document.getElementById(`rentTipoCliente-${tipoClienteKeyMap[t]}`);
        if (btn) btn.classList.toggle('btn-sede-active', t === tipo);
    });
}

function showRentMarcheDropdown() { filterRentMarche('', true); }

function filterRentMarche(query, showAll) {
    const dropdown = document.getElementById('rentMarcaDropdown');
    if (!dropdown) return;
    const matches = (!query || query.trim() === '' || showAll)
        ? MARCHE_NORMALIZED
        : MARCHE_NORMALIZED.filter(m => m.normalized.includes(normalizeText(query.trim())));
    if (matches.length === 0) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(m => `
        <div onclick="selectRentMarca('${m.original}')"
             style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)"
             onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
            ${m.original}
        </div>`).join('');
    dropdown.style.display = 'block';
}

function selectRentMarca(marca) {
    document.getElementById('rentMarcaInput').value = marca;
    document.getElementById('rentMarchio').value = marca;
    selectedRentMarchio = marca;
    document.getElementById('rentMarcaDropdown').style.display = 'none';
}

document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('rentMarcaDropdown');
    const input = document.getElementById('rentMarcaInput');
    if (dropdown && input && !input.contains(e.target) && !dropdown.contains(e.target)) dropdown.style.display = 'none';
});

function onRentStatoChange() {
    const stato = document.getElementById('rentStato').value;
    const row = document.getElementById('rentDataRichiamoRow');
    if (row) row.style.display = stato === 'DA_RICHIAMARE' ? 'block' : 'none';
    const noteFallimentoRow = document.getElementById('rentNoteFallimentoRow');
    if (noteFallimentoRow) noteFallimentoRow.style.display = stato === 'FALLITO' ? 'block' : 'none';
}

async function saveRentTrattativa() {
    const editId = document.getElementById('rentEditId').value;
    const nome = document.getElementById('rentNome').value.trim();
    const cognome = document.getElementById('rentCognome').value.trim();
    const cellulare = document.getElementById('rentCellulare').value.trim();
    const email = document.getElementById('rentEmail').value.trim();
    const marchio = document.getElementById('rentMarchio').value.trim();
    const modello = document.getElementById('rentModello').value.trim();
    const note = document.getElementById('rentNote').value.trim();
    const linkLeadspark = document.getElementById('rentLinkLeadspark').value.trim();
    const linkAutoRichiesta = document.getElementById('rentLinkAutoRichiesta').value.trim();
    const stato = document.getElementById('rentStato').value;
    const dataRichiamo = document.getElementById('rentDataRichiamo').value;
    const fonte = document.getElementById('rentFonteValue').value;
    const tipoCliente = document.getElementById('rentTipoCliente')?.value || '';
    const noteFallimento = document.getElementById('rentNoteFallimento')?.value.trim() || '';

    if (!nome) { alert('Il nome è obbligatorio'); return; }
    if (!cognome) { alert('Il cognome è obbligatorio'); return; }
    if (!cellulare) { alert('Il cellulare è obbligatorio'); return; }
    if (!marchio) { alert('Seleziona il marchio dal menù a tendina'); return; }
    if (stato === 'DA_RICHIAMARE' && !dataRichiamo) { alert('Inserisci la data di richiamo'); return; }

    const payload = {
        nome, cognome, cellulare,
        email: email || null,
        marchio,
        modello: modello || null,
        note: note || null,
        fonte: fonte || null,
        stato,
        dataRichiamo: stato === 'DA_RICHIAMARE' ? dataRichiamo : null,
        noteFallimento: stato === 'FALLITO' ? (noteFallimento || null) : null,
        tipoCliente: tipoCliente || null,
        linkLeadspark: linkLeadspark || null,
        linkAutoRichiesta: linkAutoRichiesta || null
    };

    try {
        const url = editId ? `/api/noleggio/trattative/${editId}` : '/api/noleggio/trattative';
        const method = editId ? 'PATCH' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
            alert(data.error || 'Errore nel salvataggio');
            return;
        }
        hideNewRentForm();
        loadRentTrattative();
    } catch (err) {
        console.error('Errore salvataggio trattativa:', err);
    }
}

function editRentTrattativa(id) {
    const t = rentTrattative.find(x => x.id === id);
    if (!t) return;

    document.getElementById('rentFormTitle').textContent = 'MODIFICA TRATTATIVA';
    document.getElementById('rentEditId').value = t.id;
    document.getElementById('rentNome').value = t.nome || '';
    document.getElementById('rentCognome').value = t.cognome || '';
    document.getElementById('rentCellulare').value = t.cellulare || '';
    document.getElementById('rentEmail').value = t.email || '';
    document.getElementById('rentMarcaInput').value = t.marchio || '';
    document.getElementById('rentMarchio').value = t.marchio || '';
    document.getElementById('rentModello').value = t.modello || '';
    document.getElementById('rentNote').value = t.note || '';
    document.getElementById('rentLinkLeadspark').value = t.linkLeadspark || '';
    document.getElementById('rentLinkAutoRichiesta').value = t.linkAutoRichiesta || '';
    document.getElementById('rentStato').value = t.stato || 'SOLO_INFO';
    document.getElementById('rentDataRichiamo').value = t.dataRichiamo || '';
    const noteFallimentoEl = document.getElementById('rentNoteFallimento');
    if (noteFallimentoEl) noteFallimentoEl.value = t.noteFallimento || '';
    onRentStatoChange();

    if (t.fonte) selectRentFonte(t.fonte);
    if (t.tipoCliente) selectRentTipoCliente(t.tipoCliente);

    document.getElementById('newRentForm').style.display = 'block';
    document.getElementById('newRentForm').scrollIntoView({ behavior: 'smooth' });
}

async function deleteRentTrattativa(id) {
    if (!confirm('Eliminare questa trattativa?')) return;
    try {
        await fetch(`/api/noleggio/trattative/${id}`, { method: 'DELETE' });
        loadRentTrattative();
    } catch (err) {
        console.error('Errore eliminazione trattativa:', err);
    }
}

function exportRentExcel() {
    const statoSelezionati = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('rentStatoFilterMulti') : [];
    const marchiSelezionati = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('rentMarchioFilterMulti') : [];
    const fontiSelezionate = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('rentFonteFilterMulti') : [];
    const operatoriSelezionati = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('rentOperatoreFilterMulti') : [];
    const ruolo = document.getElementById('rentRuoloFilter')?.value || '';
    let url = '/api/noleggio/trattative/export-excel?';
    if (statoSelezionati.length > 0) url += `stato=${encodeURIComponent(statoSelezionati.join(','))}&`;
    if (marchiSelezionati.length > 0) url += `marchio=${encodeURIComponent(marchiSelezionati.join(','))}&`;
    if (fontiSelezionate.length > 0) url += `fonte=${encodeURIComponent(fontiSelezionate.join(','))}&`;
    if (ruolo) url += `ruolo=${encodeURIComponent(ruolo)}&`;
    if (operatoriSelezionati.length > 0) url += `operatore=${encodeURIComponent(operatoriSelezionati.join(','))}&`;
    downloadFile(url);
}

function renderChartRentStato(list) {
    const ctx = document.getElementById('chartRentStato');
    if (!ctx) return;
    if (chartRentStato) chartRentStato.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const counts = {};
    RENT_STATO_LIST.forEach(s => counts[s] = 0);
    list.forEach(t => { if (counts[t.stato] !== undefined) counts[t.stato]++; });
    const total = list.length;
    const colors = RENT_STATO_LIST.map(s => RENT_STATO_COLORS[s]);
    const legendColor = getLegendColor();

    chartRentStato = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: RENT_STATO_LIST.map(s => RENT_STATO_LABELS[s]),
            datasets: [{ data: RENT_STATO_LIST.map(s => counts[s]), backgroundColor: colors, borderWidth: 2, borderColor: isDark ? '#0d0f1a' : '#ffffff' }]
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            onClick: (evt, elements) => { if (elements.length > 0) showRentTrattativeDetail('stato', RENT_STATO_LIST[elements[0].index]); },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: {
                legend: { position: 'bottom', labels: { color: legendColor, font: { size: 11 }, padding: 10, boxWidth: 12,
                    generateLabels: chart => chart.data.labels.map((label, i) => {
                        const val = chart.data.datasets[0].data[i];
                        const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                        return { text: `${label}: ${val} (${pct}%)`, fillStyle: colors[i], strokeStyle: colors[i], fontColor: legendColor, lineWidth: 0, index: i };
                    })
                } },
                tooltip: { callbacks: { label: ctx => { const val = ctx.raw; const pct = total > 0 ? Math.round(val*1000/total)/10 : 0; return ` Valore: ${val} — ${pct}%`; } } }
            }
        }
    });
}

function renderChartRentFonte(list) {
    const ctx = document.getElementById('chartRentFonte');
    if (!ctx) return;
    if (chartRentFonte) chartRentFonte.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const counts = {};
    RENT_FONTE_LIST.forEach(f => counts[f] = 0);
    list.forEach(t => { if (t.fonte && counts[t.fonte] !== undefined) counts[t.fonte]++; });
    const total = Object.values(counts).reduce((a,b) => a+b, 0);
    const legendColor = getLegendColor();

    chartRentFonte = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: { labels: RENT_FONTE_LIST, datasets: [{ data: RENT_FONTE_LIST.map(f => counts[f]), backgroundColor: RENT_FONTE_COLORS, borderWidth: 2, borderColor: isDark ? '#0d0f1a' : '#ffffff' }] },
        options: {
            responsive: true, maintainAspectRatio: true,
            onClick: (evt, elements) => { if (elements.length > 0) showRentTrattativeDetail('fonte', RENT_FONTE_LIST[elements[0].index]); },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: {
                legend: { position: 'bottom', labels: { color: legendColor, font: { size: 10 }, padding: 8, boxWidth: 10,
                    generateLabels: chart => chart.data.labels.map((label, i) => {
                        const val = chart.data.datasets[0].data[i];
                        const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                        return { text: `${label}: ${val} (${pct}%)`, fillStyle: RENT_FONTE_COLORS[i], strokeStyle: RENT_FONTE_COLORS[i], fontColor: legendColor, lineWidth: 0, index: i };
                    })
                } },
                tooltip: { callbacks: { label: ctx => { const val = ctx.raw; const pct = total > 0 ? Math.round(val*1000/total)/10 : 0; return ` Valore: ${val} — ${pct}%`; } } }
            }
        }
    });
}

function renderChartRentMarchi(list) {
    const container = document.getElementById('chartRentMarchiCustom');
    if (!container) return;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const counts = {};
    list.forEach(t => { if (t.marchio) { const m = t.marchio.trim().toUpperCase(); counts[m] = (counts[m]||0) + 1; } });
    if (Object.keys(counts).length === 0) {
        container.innerHTML = `<div style="color:var(--text-secondary);font-size:13px;padding:20px 0">Nessun dato disponibile</div>`;
        return;
    }
    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,10);
    const maxVal = sorted[0][1];
    const totalMarchi = sorted.reduce((a,b) => a+b[1], 0);
    const barColor = isDark ? '#00c853' : '#007a30';
    container.innerHTML = sorted.map(([marchio, val]) => {
        const pct = Math.round(val/maxVal*100);
        const pctTot = totalMarchi > 0 ? Math.round(val*1000/totalMarchi)/10 : 0;
        return `<div onclick="showRentTrattativeDetail('marchioUpper', '${marchio.replace(/'/g,"\\'")}')" style="display:flex;align-items:center;gap:12px;padding:4px 0;cursor:pointer" title="${marchio}: ${val} (${pctTot}%)">
            <div style="width:120px;font-size:12px;font-weight:700;color:var(--text-primary);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0">${marchio}</div>
            <div style="flex:1;background:var(--border);border-radius:4px;height:10px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${barColor};border-radius:4px;transition:width 0.4s ease"></div>
            </div>
            <div style="width:32px;font-size:12px;font-weight:800;color:${barColor};text-align:right;flex-shrink:0">${val}</div>
        </div>`;
    }).join('');
}

function renderChartRentInfoVsRichiesta(list) {
    const ctx = document.getElementById('chartRentInfoVsRichiesta');
    if (!ctx) return;
    if (chartRentInfoVsRichiesta) chartRentInfoVsRichiesta.destroy();
    const soloInfo = list.filter(c => c.noleggioRichiesta === 'SOLO_INFO').length;
    const richiesta = list.filter(c => c.noleggioRichiesta === 'RICHIESTA_CLIENTE').length;
    const total = soloInfo + richiesta;
    const legendColor = getLegendColor();
    const richiestaTypes = ['SOLO_INFO', 'RICHIESTA_CLIENTE'];

    chartRentInfoVsRichiesta = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Solo Info', 'Richiesta Cliente'],
            datasets: [{ data: [soloInfo, richiesta], backgroundColor: ['#8a8faa99','#00c85399'], borderColor: ['#8a8faa','#00c853'], borderWidth: 2 }]
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            onClick: (evt, elements) => { if (elements.length > 0) showRentContattiRichiestaDetail(richiestaTypes[elements[0].index]); },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: {
                legend: { position: 'bottom', labels: { color: legendColor, font: { size: 11 }, padding: 10, boxWidth: 12,
                    generateLabels: chart => chart.data.labels.map((label, i) => {
                        const val = chart.data.datasets[0].data[i];
                        const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                        const colors = ['#8a8faa','#00c853'];
                        return { text: `${label}: ${val} (${pct}%)`, fillStyle: colors[i], strokeStyle: colors[i], fontColor: legendColor, lineWidth: 0, index: i };
                    })
                } },
                tooltip: { callbacks: { label: ctx => { const val = ctx.raw; const pct = total > 0 ? Math.round(val*1000/total)/10 : 0; return ` Valore: ${val} — ${pct}%`; } } }
            }
        }
    });
}

function refreshRentChartsOnThemeChange() {
    renderChartRentStato(rentTrattativeFiltered);
    renderChartRentFonte(rentTrattativeFiltered);
    renderChartRentMarchi(rentTrattativeFiltered);
    renderChartRentInfoVsRichiesta(rentContattiNoleggio);
}

function showRentTrattativeDetail(filterField, filterValue) {
    let items;
    if (filterField === 'marchioUpper') {
        items = rentTrattativeFiltered.filter(t => (t.marchio || '').trim().toUpperCase() === filterValue);
    } else {
        items = rentTrattativeFiltered.filter(t => t[filterField] === filterValue);
    }
    const modal = document.getElementById('rentDetailModal');
    const title = document.getElementById('rentDetailTitle');
    const list = document.getElementById('rentDetailList');
    if (!modal || !title || !list) return;

    const labelMap = filterField === 'stato' ? RENT_STATO_LABELS : {};
    const displayLabel = labelMap[filterValue] || filterValue;
    title.textContent = `Trattative — ${displayLabel} (${items.length})`;

    if (items.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding:20px"><p>Nessuna trattativa per questo filtro</p></div>';
    } else {
        list.innerHTML = items.map(t => {
            const links = [];
            if (t.linkLeadspark) links.push(`<a href="${t.linkLeadspark}" target="_blank" rel="noopener" title="Leadspark" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:rgba(0,200,83,0.15);color:#00c853;text-decoration:none;font-size:13px">🔗</a>`);
            if (t.linkAutoRichiesta) links.push(`<a href="${t.linkAutoRichiesta}" target="_blank" rel="noopener" title="Auto richiesta" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:rgba(74,144,217,0.15);color:#4a90d9;text-decoration:none;font-size:13px">🔗</a>`);
            return `<div class="followup-card" style="margin-bottom:10px;cursor:pointer" onclick="closeRentDetailModal();openRentTrattativaModal(${t.id})">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
                    <div>
                        <div style="font-weight:800;color:var(--text-primary);font-size:14px">${t.nome} ${t.cognome}</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">🚗 ${t.marchio}${t.modello?' '+t.modello:''}</div>
                        ${t.cellulare ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">📞 ${t.cellulare}</div>` : ''}
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">👤 ${t.user?.fullName || '—'}</div>
                    </div>
                    ${links.length > 0 ? `<div style="display:flex;gap:6px;flex-shrink:0" onclick="event.stopPropagation()">${links.join('')}</div>` : ''}
                </div>
            </div>`;
        }).join('');
    }
    modal.style.display = 'flex';
}

function showRentContattiRichiestaDetail(richiestaValue) {
    const items = rentContattiNoleggio.filter(c => c.noleggioRichiesta === richiestaValue);
    const modal = document.getElementById('rentDetailModal');
    const title = document.getElementById('rentDetailTitle');
    const list = document.getElementById('rentDetailList');
    if (!modal || !title || !list) return;

    const label = richiestaValue === 'RICHIESTA_CLIENTE' ? 'Richiesta Cliente' : 'Solo Info';
    title.textContent = `Info Noleggio — ${label} (${items.length})`;

    if (items.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding:20px"><p>Nessun contatto per questo filtro</p></div>';
    } else {
        list.innerHTML = items.map(c => {
            const nomeCompleto = [c.noleggioNomeCliente, c.noleggioCognomeCliente].filter(Boolean).join(' ') || [c.clienteNome, c.clienteCognome].filter(Boolean).join(' ');
            const date = c.contactDate.split('T')[0];
            const time = c.contactDate.split('T')[1]?.substring(0,5) || '';
            const links = [];
            if (c.noleggioLink) links.push(`<a href="${c.noleggioLink}" target="_blank" rel="noopener" title="Lead" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:rgba(0,200,83,0.15);color:#00c853;text-decoration:none;font-size:13px">🔗</a>`);
            if (c.linkAuto) links.push(`<a href="${c.linkAuto}" target="_blank" rel="noopener" title="Lead veicolo" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:rgba(124,77,255,0.15);color:#7c4dff;text-decoration:none;font-size:13px">🔗</a>`);
            return `<div class="followup-card" style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
                    <div>
                        <div style="font-weight:800;color:var(--text-primary);font-size:14px">${nomeCompleto || 'Nominativo non specificato'}</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">📅 ${formatDateIT(date)} · 🕐 ${time}</div>
                        ${c.marca ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">🚗 ${c.marca}${c.modello?' · '+c.modello:''}</div>` : ''}
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">👤 ${c.user?.fullName || '—'}</div>
                    </div>
                    ${links.length > 0 ? `<div style="display:flex;gap:6px;flex-shrink:0">${links.join('')}</div>` : ''}
                </div>
            </div>`;
        }).join('');
    }
    modal.style.display = 'flex';
}

function closeRentDetailModal(event) {
    if (event && event.target.id !== 'rentDetailModal') return;
    const modal = document.getElementById('rentDetailModal');
    if (modal) modal.style.display = 'none';
}

async function checkRentRecallOggi() {
    try {
        const res = await fetch('/api/noleggio/trattative/recall-oggi');
        if (!res.ok) return;
        const items = await res.json();
        if (items.length === 0) return;

        const list = document.getElementById('rentRecallList');
        const today = todayStr();
        list.innerHTML = items.map(t => {
            const isPast = t.dataRichiamo < today;
            return `<div class="followup-card" style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start">
                    <div>
                        <div style="font-weight:800;color:var(--text-primary);font-size:14px">${t.nome} ${t.cognome}</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">🚗 ${t.marchio}${t.modello ? ' ' + t.modello : ''}</div>
                        ${t.cellulare ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">📞 ${t.cellulare}</div>` : ''}
                        <div style="font-size:12px;margin-top:6px">
                            <span class="recall-badge ${isPast ? 'recall-past' : 'recall-today'}">${isPast ? '⚠️ SCADUTO' : '🔔 OGGI'} · ${formatDateIT(t.dataRichiamo)}</span>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');

        document.getElementById('rentRecallModal').style.display = 'flex';
    } catch (err) {
        console.error('Errore controllo recall noleggio:', err);
    }
}

function closeRentRecallModal(event) {
    if (event && event.target.id !== 'rentRecallModal') return;
    document.getElementById('rentRecallModal').style.display = 'none';
}

async function loadRentContattiNoleggio() {
    try {
        const from = document.getElementById('rentContattiFrom')?.value;
        const to = document.getElementById('rentContattiTo')?.value;
        let url = '/api/noleggio/contatti';
        if (from && to) url += `?from=${from}&to=${to}`;
        const res = await fetch(url);
        if (!res.ok) return;
        rentContattiNoleggio = await res.json();
        rentContattiNoleggio.sort((a, b) => rentContattiSortDir === 'desc'
            ? (b.contactDate || '').localeCompare(a.contactDate || '')
            : (a.contactDate || '').localeCompare(b.contactDate || ''));
        renderRentContattiNoleggio(rentContattiNoleggio);
        renderChartRentInfoVsRichiesta(rentContattiNoleggio);
    } catch (err) {
        console.error('Errore caricamento info noleggio da registro contatti:', err);
    }
}

function renderRentContattiNoleggio(list) {
    const container = document.getElementById('rentContattiNoleggioList');
    if (!container) return;
    if (list.length === 0) {
        container.innerHTML = `<div class="empty-state"><h3>📋</h3><p>Nessuna info noleggio nel periodo selezionato</p></div>`;
        return;
    }

    const tipoLabel = (tipo) => {
        if (tipo === 'Privato') return '👤 Privato';
        if (tipo === 'Partita IVA') return '🏢 Partita IVA';
        if (tipo === 'Noleggio per aziende') return '🏭 Noleggio per aziende';
        return '—';
    };

    // classe "rent-contatti-table" aggiunta: attiva le regole CSS dedicate
    // per questa tabella a 8 colonne (vedi fix in style.css)
    container.innerHTML = `<div class="contact-table-wrapper"><table class="contact-table rent-contatti-table">
        <thead><tr><th>Data</th><th>Richiesta</th><th>Tipologia</th><th>Cliente</th><th>Marca/Modello</th><th>Lead</th><th>Operatore</th><th>Azioni</th></tr></thead>
        <tbody>${list.map(c => {
            const date = c.contactDate.split('T')[0];
            const time = c.contactDate.split('T')[1]?.substring(0,5) || '';
            const nomeCompleto = [c.noleggioNomeCliente, c.noleggioCognomeCliente].filter(Boolean).join(' ') || [c.clienteNome, c.clienteCognome].filter(Boolean).join(' ');
            const cellulare = c.noleggioCellulare || c.clienteNumero;
            const isRichiesta = c.noleggioRichiesta === 'RICHIESTA_CLIENTE';
            const links = [];
            if (c.noleggioLink) links.push(`<a href="${c.noleggioLink}" target="_blank" rel="noopener" title="Lead" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;background:rgba(0,200,83,0.15);color:#00c853;text-decoration:none;font-size:12px">🔗</a>`);
            else if (c.linkAuto) links.push(`<a href="${c.linkAuto}" target="_blank" rel="noopener" title="Lead veicolo" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;background:rgba(124,77,255,0.15);color:#7c4dff;text-decoration:none;font-size:12px">🔗</a>`);
            return `<tr>
                <td>${formatDateIT(date)} · ${time}</td>
                <td>${isRichiesta ? '<span style="color:#00c853;font-weight:700">📞 Richiesta cliente</span>' : '<span style="color:var(--text-secondary)">ℹ️ Solo Info</span>'}</td>
                <td>${tipoLabel(c.noleggioTipo)}</td>
                <td>${nomeCompleto || '—'}${cellulare ? `<br><span style="font-size:11px;color:var(--text-secondary)">📞 ${cellulare}</span>` : ''}</td>
                <td>${c.marca ? c.marca + (c.modello ? ' ' + c.modello : '') : '—'}</td>
                <td>${links.length > 0 ? links.join('') : '—'}</td>
                <td>${c.user?.fullName || '—'}</td>
                <td><button class="btn-small btn-gold" onclick="generateTrattativaFromContatto(${c.id})" style="white-space:nowrap">➡️ Genera trattativa</button></td>
            </tr>`;
        }).join('')}</tbody>
    </table></div>`;
}

function generateTrattativaFromContatto(id) {
    const c = rentContattiNoleggio.find(x => x.id === id);
    if (!c) return;

    showNewRentForm();

    document.getElementById('rentNome').value = c.noleggioNomeCliente || c.clienteNome || '';
    document.getElementById('rentCognome').value = c.noleggioCognomeCliente || c.clienteCognome || '';
    document.getElementById('rentCellulare').value = c.noleggioCellulare || c.clienteNumero || '';
    if (c.marca) selectRentMarca(c.marca);
    document.getElementById('rentModello').value = c.modello || '';
    document.getElementById('rentLinkAutoRichiesta').value = c.noleggioLink || c.linkAuto || '';
    document.getElementById('rentNote').value = `Generata da Info Noleggio registrata il ${formatDateIT(c.contactDate.split('T')[0])} da ${c.user?.fullName || '—'}`;
    document.getElementById('rentStato').value = 'TRATTATIVA_IN_CORSO';
    onRentStatoChange();

    if (c.noleggioTipo) selectRentTipoCliente(c.noleggioTipo);

    if (!c.noleggioCellulare && !c.clienteNumero) {
        setTimeout(() => alert('Ricordati di inserire il cellulare: è obbligatorio per salvare la trattativa.'), 300);
    }
}

// ===== RICERCA CLIENTE RENT (nome, cognome, cellulare) =====

function searchRentTrattative(query) {
    const resultsWrapper = document.getElementById('rentSearchResults');
    const resultsList = document.getElementById('rentSearchResultsList');
    if (!resultsWrapper || !resultsList) return;
    const q = query.trim();
    if (!q) { resultsWrapper.style.display = 'none'; return; }

    const qLower = q.toLowerCase();
    const matches = rentTrattative.filter(t => {
        const nome = (t.nome || '').toLowerCase();
        const cognome = (t.cognome || '').toLowerCase();
        const cellulare = (t.cellulare || '').toLowerCase();
        return nome.includes(qLower) || cognome.includes(qLower) || cellulare.includes(qLower);
    }).slice(0, 50);

    if (matches.length === 0) {
        resultsList.innerHTML = `<div class="empty-state" style="padding:20px"><p>Nessuna trattativa trovata</p></div>`;
    } else {
        resultsList.innerHTML = matches.map(t => {
            const color = RENT_STATO_COLORS[t.stato] || '#8a8faa';
            return `<div class="followup-card" style="margin-bottom:8px;cursor:pointer" onclick="closeRentSearch();openRentTrattativaModal(${t.id})">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <div style="font-weight:800;color:var(--text-primary);font-size:14px">${t.nome} ${t.cognome}</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
                            📞 ${t.cellulare || '—'} · 🚗 ${t.marchio}${t.modello?' '+t.modello:''}
                            · <span style="font-weight:700;color:${color}">${RENT_STATO_LABELS[t.stato] || t.stato}</span>
                            · 👤 ${t.user?.fullName || '—'}
                        </div>
                    </div>
                    <span style="color:#f0c040;font-size:16px">→</span>
                </div>
            </div>`;
        }).join('');
    }
    resultsWrapper.style.display = 'block';
}

function closeRentSearch() {
    const resultsWrapper = document.getElementById('rentSearchResults');
    const input = document.getElementById('rentSearchInput');
    if (resultsWrapper) resultsWrapper.style.display = 'none';
    if (input) input.value = '';
}
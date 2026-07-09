let rentTrattative = [];
let rentTrattativeFiltered = [];
let rentContattiNoleggio = [];
let chartRentStato = null;
let chartRentFonte = null;
let chartRentInfoVsRichiesta = null;
let selectedRentMarchio = '';

const RENT_STATO_LIST = ['SOLO_INFO', 'TRATTATIVA_IN_CORSO', 'DA_RICHIAMARE', 'CONCLUSA'];
const RENT_STATO_LABELS = {
    'SOLO_INFO': 'Solo Info',
    'TRATTATIVA_IN_CORSO': 'Trattativa in corso',
    'DA_RICHIAMARE': 'Da richiamare',
    'CONCLUSA': 'Conclusa'
};
const RENT_STATO_COLORS = {
    'SOLO_INFO': '#f0c040',
    'TRATTATIVA_IN_CORSO': '#7c4dff',
    'DA_RICHIAMARE': '#e91e63',
    'CONCLUSA': '#00c853'
};

// ===== INGRESSO NELLA DASHBOARD RENT =====

function loadRentDashboard() {
    const today = todayStr();
    const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const fromEl = document.getElementById('rentContattiFrom');
    const toEl = document.getElementById('rentContattiTo');
    if (fromEl && !fromEl.value) fromEl.value = firstDay;
    if (toEl && !toEl.value) toEl.value = today;

    loadRentTrattative();
    loadRentContattiNoleggio();
    checkRentRecallOggi();
}

// ===== TRATTATIVE: CARICAMENTO E RENDER =====

async function loadRentTrattative() {
    try {
        const res = await fetch('/api/noleggio/trattative');
        if (!res.ok) return;
        rentTrattative = await res.json();
        populateRentFilters();
        applyRentFilters();
    } catch (err) {
        console.error('Errore caricamento trattative noleggio:', err);
    }
}

function populateRentFilters() {
    const marchioSelect = document.getElementById('rentMarchioFilter');
    const fonteSelect = document.getElementById('rentFonteFilter');
    const operatoreSelect = document.getElementById('rentOperatoreFilter');
    if (marchioSelect) {
        const current = marchioSelect.value;
        const marchi = [...new Set(rentTrattative.map(t => t.marchio).filter(Boolean))].sort();
        marchioSelect.innerHTML = '<option value="">Tutti i marchi</option>' +
            marchi.map(m => `<option value="${m}" ${m===current?'selected':''}>${m}</option>`).join('');
    }
    if (fonteSelect) {
        const current = fonteSelect.value;
        const fonti = [...new Set(rentTrattative.map(t => t.fonte).filter(Boolean))].sort();
        fonteSelect.innerHTML = '<option value="">Tutte le fonti</option>' +
            fonti.map(f => `<option value="${f}" ${f===current?'selected':''}>${f}</option>`).join('');
    }
    if (operatoreSelect) {
        const current = operatoreSelect.value;
        const operatori = [...new Set(rentTrattative.map(t => t.user?.fullName).filter(Boolean))].sort();
        operatoreSelect.innerHTML = '<option value="">Tutti gli operatori</option>' +
            operatori.map(op => `<option value="${op}" ${op===current?'selected':''}>${op}</option>`).join('');
    }
}

function applyRentFilters() {
    const stato = document.getElementById('rentStatoFilter')?.value || '';
    const marchio = document.getElementById('rentMarchioFilter')?.value || '';
    const fonte = document.getElementById('rentFonteFilter')?.value || '';
    const ruolo = document.getElementById('rentRuoloFilter')?.value || '';
    const operatore = document.getElementById('rentOperatoreFilter')?.value || '';

    rentTrattativeFiltered = rentTrattative.filter(t => {
        if (stato && t.stato !== stato) return false;
        if (marchio && t.marchio !== marchio) return false;
        if (fonte && t.fonte !== fonte) return false;
        if (ruolo === 'NOLEGGIO' && t.user?.role !== 'NOLEGGIO') return false;
        if (ruolo === 'BDC' && t.user?.role === 'NOLEGGIO') return false;
        if (operatore && t.user?.fullName !== operatore) return false;
        return true;
    });

    renderRentTrattative(rentTrattativeFiltered);
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

// ============================================================
// TIMELINE TRATTATIVE — design a linea temporale verticale,
// distinto dal sistema a cartelle del Registro Contatti
// ============================================================

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
                                            ${Object.entries(weekData.days).sort((a,b) => b[0].localeCompare(a[0])).map(([date, items]) => `
                                                <div style="margin-bottom:10px;padding-left:14px">
                                                    <div style="font-size:10px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">${formatDateIT(date)}</div>
                                                    <div style="display:flex;gap:10px;flex-wrap:wrap">
                                                        ${items.map(t => renderRentTrattativaCard(t)).join('')}
                                                    </div>
                                                </div>
                                            `).join('')}
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

function renderRentTrattativaCard(t) {
    const today = todayStr();
    const isRecallToday = t.stato === 'DA_RICHIAMARE' && t.dataRichiamo === today;
    const isRecallPast = t.stato === 'DA_RICHIAMARE' && t.dataRichiamo && t.dataRichiamo < today;
    const color = RENT_STATO_COLORS[t.stato] || '#8a8faa';

    return `<div style="width:260px;background:var(--bg-card);border:1.5px solid ${isRecallToday||isRecallPast?color:'var(--border)'};border-left:4px solid ${color};border-radius:10px;padding:12px;box-shadow:var(--shadow);${isRecallToday?'box-shadow:0 0 12px rgba(233,30,99,0.25)':''}">
        <div style="font-weight:800;color:var(--text-primary);font-size:13px">${t.nome} ${t.cognome}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;line-height:1.6">
            🚗 ${t.marchio}${t.modello?' '+t.modello:''}<br>
            ${t.cellulare ? `📞 ${t.cellulare}<br>` : ''}
            ${t.fonte ? `🌐 ${t.fonte}<br>` : ''}
            👤 ${t.user?.fullName || '—'}${t.user?.role === 'NOLEGGIO' ? ' <span style="color:#2ecc71;font-weight:700">(Noleggio)</span>' : ''}
        </div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <span style="font-size:10px;font-weight:800;padding:3px 8px;border-radius:10px;background:${color}22;color:${color}">${RENT_STATO_LABELS[t.stato] || t.stato}</span>
            ${t.dataRichiamo ? `<span style="font-size:10px;font-weight:700;color:${isRecallPast?'#e91e63':isRecallToday?'#f0c040':'var(--text-secondary)'}">📅 ${formatDateIT(t.dataRichiamo)}</span>` : ''}
        </div>
        <div style="margin-top:8px;display:flex;gap:6px">
            <button class="btn-small btn-blue" onclick="editRentTrattativa(${t.id})">✏️</button>
            <button class="btn-small btn-red" onclick="deleteRentTrattativa(${t.id})">🗑️</button>
        </div>
    </div>`;
}

// ===== FORM NUOVA / MODIFICA TRATTATIVA =====

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
     'rentLinkLeadspark','rentLinkAutoRichiesta','rentDataRichiamo','rentMarcaInput','rentMarchio'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('rentStato').value = 'SOLO_INFO';
    document.getElementById('rentDataRichiamoRow').style.display = 'none';
    selectedRentMarchio = '';
    const fonteKeyMap = { 'Sito':'Sito','Google ADS':'GoogleADS','Autoscout':'Autoscout','Facebook':'Facebook','Instagram':'Instagram','TikTok':'TikTok','Richiesta cliente':'RichiestaCliente','Non ricorda':'NonRicorda' };
    document.getElementById('rentFonteValue').value = '';
    Object.values(fonteKeyMap).forEach(k => {
        const btn = document.getElementById(`rentFonte-${k}`);
        if (btn) btn.classList.remove('btn-sede-active');
    });
}

function selectRentFonte(fonte) {
    document.getElementById('rentFonteValue').value = fonte;
    const fonteKeyMap = { 'Sito':'Sito','Google ADS':'GoogleADS','Autoscout':'Autoscout','Facebook':'Facebook','Instagram':'Instagram','TikTok':'TikTok','Richiesta cliente':'RichiestaCliente','Non ricorda':'NonRicorda' };
    Object.keys(fonteKeyMap).forEach(f => {
        const btn = document.getElementById(`rentFonte-${fonteKeyMap[f]}`);
        if (btn) btn.classList.toggle('btn-sede-active', f === fonte);
    });
}

// ===== AUTOCOMPLETE MARCHIO (stesso motore di Info Vendita) =====

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
    onRentStatoChange();

    if (t.fonte) selectRentFonte(t.fonte);

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

// ===== EXCEL EXPORT =====

function exportRentExcel() {
    window.open('/api/noleggio/trattative/export-excel', '_blank');
}

// ===== GRAFICI =====

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
    FONTE_LIST.forEach(f => counts[f] = 0);
    list.forEach(t => { if (t.fonte && counts[t.fonte] !== undefined) counts[t.fonte]++; });
    const total = Object.values(counts).reduce((a,b) => a+b, 0);
    const legendColor = getLegendColor();

    chartRentFonte = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: { labels: FONTE_LIST, datasets: [{ data: FONTE_LIST.map(f => counts[f]), backgroundColor: FONTE_COLORS, borderWidth: 2, borderColor: isDark ? '#0d0f1a' : '#ffffff' }] },
        options: {
            responsive: true, maintainAspectRatio: true,
            plugins: {
                legend: { position: 'bottom', labels: { color: legendColor, font: { size: 10 }, padding: 8, boxWidth: 10,
                    generateLabels: chart => chart.data.labels.map((label, i) => {
                        const val = chart.data.datasets[0].data[i];
                        const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                        return { text: `${label}: ${val} (${pct}%)`, fillStyle: FONTE_COLORS[i], strokeStyle: FONTE_COLORS[i], fontColor: legendColor, lineWidth: 0, index: i };
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
        return `<div style="display:flex;align-items:center;gap:12px;padding:4px 0" title="${marchio}: ${val} (${pctTot}%)">
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
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const soloInfo = list.filter(c => c.noleggioRichiesta === 'SOLO_INFO').length;
    const richiesta = list.filter(c => c.noleggioRichiesta === 'RICHIESTA_CLIENTE').length;
    const total = soloInfo + richiesta;
    const legendColor = getLegendColor();

    chartRentInfoVsRichiesta = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Solo Info', 'Richiesta Cliente'],
            datasets: [{ data: [soloInfo, richiesta], backgroundColor: ['#8a8faa99','#00c85399'], borderColor: ['#8a8faa','#00c853'], borderWidth: 2, backgroundColor2: isDark ? '#0d0f1a' : '#ffffff' }]
        },
        options: {
            responsive: true, maintainAspectRatio: true,
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

// ===== POPUP RECALL DI OGGI/SCADUTI =====

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

// ===== INFO NOLEGGIO DA REGISTRO CONTATTI (sola lettura, tutti gli operatori) =====

async function loadRentContattiNoleggio() {
    try {
        const from = document.getElementById('rentContattiFrom')?.value;
        const to = document.getElementById('rentContattiTo')?.value;
        let url = '/api/noleggio/contatti';
        if (from && to) url += `?from=${from}&to=${to}`;
        const res = await fetch(url);
        if (!res.ok) return;
        rentContattiNoleggio = await res.json();
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

    container.innerHTML = `<div class="contact-table-wrapper"><table class="contact-table">
        <thead><tr><th>Data</th><th>Richiesta</th><th>Tipologia</th><th>Cliente</th><th>Marca/Modello</th><th>Lead</th><th>Operatore</th><th>Azioni</th></tr></thead>
        <tbody>${list.map(c => {
            const date = c.contactDate.split('T')[0];
            const time = c.contactDate.split('T')[1]?.substring(0,5) || '';
            const nomeCompleto = [c.noleggioNomeCliente, c.noleggioCognomeCliente].filter(Boolean).join(' ');
            const isRichiesta = c.noleggioRichiesta === 'RICHIESTA_CLIENTE';
            return `<tr>
                <td>${formatDateIT(date)} · ${time}</td>
                <td>${isRichiesta ? '<span style="color:#00c853;font-weight:700">📞 Richiesta cliente</span>' : '<span style="color:var(--text-secondary)">ℹ️ Solo Info</span>'}</td>
                <td>${c.noleggioTipo === 'Privato' ? '👤 Privato' : c.noleggioTipo === 'Partita IVA' ? '🏢 Partita IVA' : '—'}</td>
                <td>${nomeCompleto || '—'}${c.noleggioCellulare ? `<br><span style="font-size:11px;color:var(--text-secondary)">📞 ${c.noleggioCellulare}</span>` : ''}</td>
                <td>${c.marca ? c.marca + (c.modello ? ' ' + c.modello : '') : '—'}</td>
                <td>${c.noleggioLink ? `<a href="${c.noleggioLink}" target="_blank" rel="noopener">🔗 Lead</a>` : (c.linkAuto ? `<a href="${c.linkAuto}" target="_blank" rel="noopener">🔗 Lead</a>` : '—')}</td>
                <td>${c.user?.fullName || '—'}</td>
                <td><button class="btn-small btn-gold" onclick="generateTrattativaFromContatto(${c.id})" style="white-space:nowrap">➡️ Genera trattativa</button></td>
            </tr>`;
        }).join('')}</tbody>
    </table></div>`;
}

// ===== GENERA TRATTATIVA DA CONTATTO INFO NOLEGGIO =====

function generateTrattativaFromContatto(id) {
    const c = rentContattiNoleggio.find(x => x.id === id);
    if (!c) return;

    showNewRentForm();

    document.getElementById('rentNome').value = c.noleggioNomeCliente || '';
    document.getElementById('rentCognome').value = c.noleggioCognomeCliente || '';
    document.getElementById('rentCellulare').value = c.noleggioCellulare || '';
    if (c.marca) selectRentMarca(c.marca);
    document.getElementById('rentModello').value = c.modello || '';
    document.getElementById('rentLinkAutoRichiesta').value = c.noleggioLink || c.linkAuto || '';
    document.getElementById('rentNote').value = `Generata da Info Noleggio registrata il ${formatDateIT(c.contactDate.split('T')[0])} da ${c.user?.fullName || '—'}`;
    document.getElementById('rentStato').value = 'TRATTATIVA_IN_CORSO';
    onRentStatoChange();

    if (!c.cellulare && !c.noleggioCellulare) {
        setTimeout(() => alert('Ricordati di inserire il cellulare: è obbligatorio per salvare la trattativa.'), 300);
    }
}
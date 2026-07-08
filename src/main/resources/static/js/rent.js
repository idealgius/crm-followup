let rentTrattative = [];
let rentTrattativeFiltered = [];
let rentContattiNoleggio = [];
let chartRentStato = null;
let chartRentFonte = null;

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
    if (marchioSelect) {
        const currentMarchio = marchioSelect.value;
        const marchi = [...new Set(rentTrattative.map(t => t.marchio).filter(Boolean))].sort();
        marchioSelect.innerHTML = '<option value="">Tutti i marchi</option>' +
            marchi.map(m => `<option value="${m}" ${m===currentMarchio?'selected':''}>${m}</option>`).join('');
    }
    if (fonteSelect) {
        const currentFonte = fonteSelect.value;
        const fonti = [...new Set(rentTrattative.map(t => t.fonte).filter(Boolean))].sort();
        fonteSelect.innerHTML = '<option value="">Tutte le fonti</option>' +
            fonti.map(f => `<option value="${f}" ${f===currentFonte?'selected':''}>${f}</option>`).join('');
    }
}

function applyRentFilters() {
    const stato = document.getElementById('rentStatoFilter')?.value || '';
    const marchio = document.getElementById('rentMarchioFilter')?.value || '';
    const fonte = document.getElementById('rentFonteFilter')?.value || '';

    rentTrattativeFiltered = rentTrattative.filter(t => {
        if (stato && t.stato !== stato) return false;
        if (marchio && t.marchio !== marchio) return false;
        if (fonte && t.fonte !== fonte) return false;
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

function renderRentTrattative(list) {
    const container = document.getElementById('rentTrattativeList');
    if (!container) return;
    if (list.length === 0) {
        container.innerHTML = `<div class="empty-state"><h3>🚗</h3><p>Nessuna trattativa registrata</p></div>`;
        return;
    }

    const today = todayStr();

    container.innerHTML = list.map(t => {
        const isRecallToday = t.stato === 'DA_RICHIAMARE' && t.dataRichiamo === today;
        const isRecallPast = t.stato === 'DA_RICHIAMARE' && t.dataRichiamo && t.dataRichiamo < today;

        let recallBadge = '';
        if (t.stato === 'DA_RICHIAMARE' && t.dataRichiamo) {
            if (isRecallToday) {
                recallBadge = `<span class="recall-badge recall-today">🔔 RICHIAMO OGGI · ${formatDateIT(t.dataRichiamo)}</span>`;
            } else if (isRecallPast) {
                recallBadge = `<span class="recall-badge recall-past">⚠️ RICHIAMO SCADUTO · ${formatDateIT(t.dataRichiamo)}</span>`;
            } else {
                recallBadge = `<span class="recall-badge recall-future">📅 RICHIAMO · ${formatDateIT(t.dataRichiamo)}</span>`;
            }
        }

        return `
        <div class="waiting-card ${isRecallToday ? 'recall-card-today' : isRecallPast ? 'recall-card-past' : ''}">
            <div>
                <div class="waiting-name">${t.nome} ${t.cognome}</div>
                <div class="waiting-details">
                    🚗 ${t.marchio}${t.modello ? ' ' + t.modello : ''}
                    ${t.cellulare ? ' · 📞 ' + t.cellulare : ''}
                    ${t.email ? ' · ✉️ ' + t.email : ''}
                    ${t.fonte ? ' · 🌐 ' + t.fonte : ''}
                    ${t.note ? '<br>📝 ' + t.note : ''}
                    ${t.linkLeadspark ? `<br>🔗 <a href="${t.linkLeadspark}" target="_blank" rel="noopener">Leadspark</a>` : ''}
                    ${t.linkAutoRichiesta ? ` · <a href="${t.linkAutoRichiesta}" target="_blank" rel="noopener">Auto richiesta</a>` : ''}
                    <br><span style="opacity:0.7">👤 Inserito da ${t.user?.fullName || '—'}</span>
                </div>
                <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                    <span class="status-badge" style="background:${RENT_STATO_COLORS[t.stato]}22;color:${RENT_STATO_COLORS[t.stato]}">${RENT_STATO_LABELS[t.stato] || t.stato}</span>
                    ${recallBadge}
                </div>
            </div>
            <div class="waiting-actions">
                <select class="input-dark" onchange="quickChangeRentStato(${t.id}, this.value)" style="font-size:12px">
                    <option value="SOLO_INFO" ${t.stato==='SOLO_INFO'?'selected':''}>Solo Info</option>
                    <option value="TRATTATIVA_IN_CORSO" ${t.stato==='TRATTATIVA_IN_CORSO'?'selected':''}>Trattativa in corso</option>
                    <option value="DA_RICHIAMARE" ${t.stato==='DA_RICHIAMARE'?'selected':''}>Da richiamare</option>
                    <option value="CONCLUSA" ${t.stato==='CONCLUSA'?'selected':''}>Conclusa</option>
                </select>
                <button class="btn-small btn-blue" onclick="editRentTrattativa(${t.id})">✏️</button>
                <button class="btn-small btn-red" onclick="deleteRentTrattativa(${t.id})">🗑️</button>
            </div>
        </div>`;
    }).join('');
}

// ===== CAMBIO STATO RAPIDO DALLA LISTA =====

async function quickChangeRentStato(id, newStato) {
    let dataRichiamo = null;
    if (newStato === 'DA_RICHIAMARE') {
        const t = rentTrattative.find(x => x.id === id);
        const proposta = t?.dataRichiamo || todayStr();
        dataRichiamo = prompt('Data richiamo (YYYY-MM-DD):', proposta);
        if (!dataRichiamo) { loadRentTrattative(); return; }
    }
    try {
        const body = { stato: newStato };
        if (dataRichiamo) body.dataRichiamo = dataRichiamo;
        const res = await fetch(`/api/noleggio/trattative/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const data = await res.json();
            alert(data.error || 'Errore aggiornamento stato');
        }
        loadRentTrattative();
    } catch (err) {
        console.error('Errore cambio stato trattativa:', err);
    }
}

// ===== FORM NUOVA / MODIFICA TRATTATIVA =====

let selectedRentFonte = '';

function showNewRentForm() {
    document.getElementById('rentFormTitle').textContent = 'NUOVA TRATTATIVA';
    document.getElementById('rentEditId').value = '';
    document.getElementById('newRentForm').style.display = 'block';
    document.getElementById('newRentForm').scrollIntoView({ behavior: 'smooth' });
}

function hideNewRentForm() {
    document.getElementById('newRentForm').style.display = 'none';
    document.getElementById('rentEditId').value = '';
    ['rentNome','rentCognome','rentCellulare','rentEmail','rentMarchio','rentModello','rentNote',
     'rentLinkLeadspark','rentLinkAutoRichiesta','rentDataRichiamo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('rentStato').value = 'SOLO_INFO';
    document.getElementById('rentDataRichiamoRow').style.display = 'none';
    selectedRentFonte = '';
    document.getElementById('rentFonteValue').value = '';
    FONTE_LIST.forEach(f => {
        const keyMap = { 'Sito':'Sito','Google ADS':'GoogleADS','Autoscout':'Autoscout','Facebook':'Facebook','Instagram':'Instagram','TikTok':'TikTok','Richiesta cliente':'RichiestaCliente','Non ricorda':'NonRicorda' };
        const btn = document.getElementById(`rentFonte-${keyMap[f]}`);
        if (btn) btn.classList.remove('btn-sede-active');
    });
}

function selectRentFonte(fonte) {
    selectedRentFonte = fonte;
    document.getElementById('rentFonteValue').value = fonte;
    const fonteKeyMap = { 'Sito':'Sito','Google ADS':'GoogleADS','Autoscout':'Autoscout','Facebook':'Facebook','Instagram':'Instagram','TikTok':'TikTok','Richiesta cliente':'RichiestaCliente','Non ricorda':'NonRicorda' };
    Object.keys(fonteKeyMap).forEach(f => {
        const btn = document.getElementById(`rentFonte-${fonteKeyMap[f]}`);
        if (btn) btn.classList.toggle('btn-sede-active', f === fonte);
    });
}

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
    if (!marchio) { alert('Il marchio è obbligatorio'); return; }
    if (stato === 'DA_RICHIAMARE' && !dataRichiamo) { alert('Inserisci la data di richiamo'); return; }

    const payload = {
        nome, cognome,
        cellulare: cellulare || null,
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

function refreshRentChartsOnThemeChange() {
    renderChartRentStato(rentTrattativeFiltered);
    renderChartRentFonte(rentTrattativeFiltered);
    renderChartRentMarchi(rentTrattativeFiltered);
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
        <thead><tr><th>Data</th><th>Tipologia</th><th>Marca/Modello</th><th>Lead</th><th>Operatore</th></tr></thead>
        <tbody>${list.map(c => {
            const date = c.contactDate.split('T')[0];
            const time = c.contactDate.split('T')[1]?.substring(0,5) || '';
            return `<tr>
                <td>${formatDateIT(date)} · ${time}</td>
                <td>${c.noleggioTipo === 'Privato' ? '👤 Privato' : c.noleggioTipo === 'Partita IVA' ? '🏢 Partita IVA' : '—'}</td>
                <td>${c.marca ? c.marca + (c.modello ? ' ' + c.modello : '') : '—'}</td>
                <td>${c.noleggioLink ? `<a href="${c.noleggioLink}" target="_blank" rel="noopener">🔗 Lead</a>` : (c.linkAuto ? `<a href="${c.linkAuto}" target="_blank" rel="noopener">🔗 Lead</a>` : '—')}</td>
                <td>${c.user?.fullName || '—'}</td>
            </tr>`;
        }).join('')}</tbody>
    </table></div>`;
}
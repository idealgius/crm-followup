// ============================================================
// PREVENTIVI TELEFONICI — creazione, rendering, workflow di stato
// Riusa MARCHE_LIST / MARCHE_NORMALIZED gia' definiti in contact.js
// (stesso scope globale, contact.js viene caricato prima di questo file).
// ============================================================

let preventiviData = [];
let preventiviFiltered = [];

async function loadPreventivi() {
    const from = document.getElementById('pvFrom')?.value;
    const to = document.getElementById('pvTo')?.value;
    let url = '/api/preventivi-telefonici';
    const params = [];
    if (from) params.push('from=' + from);
    if (to) params.push('to=' + to);
    if (params.length) url += '?' + params.join('&');

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Errore nel caricamento dei preventivi telefonici');
        preventiviData = await res.json();
    } catch (err) {
        console.error('Errore caricamento preventivi telefonici:', err);
        preventiviData = [];
    }
    populatePreventiviOperatoreFilter();
    applyPreventiviFilters();
}

// Popola la tendina operatore con gli operatori davvero presenti nel
// periodo caricato (non un elenco fisso) — mantiene la selezione corrente
// se ancora valida dopo il ricaricamento.
function populatePreventiviOperatoreFilter() {
    const select = document.getElementById('pvFilterOperatore');
    if (!select) return;
    const current = select.value;
    const nomi = [...new Set(preventiviData.map(p => p.user?.fullName).filter(Boolean))].sort();
    select.innerHTML = '<option value="">Tutti gli operatori</option>' + nomi.map(n => `<option>${n}</option>`).join('');
    if (nomi.includes(current)) select.value = current;
}

// Applica i 4 filtri (operatore/consulente/tipo/status) sui dati già
// caricati (preventiviData, gia' filtrato per periodo dal backend) e
// ridisegna tutto — nessuna nuova chiamata al server.
function applyPreventiviFilters() {
    const operatore = document.getElementById('pvFilterOperatore')?.value || '';
    const consulente = document.getElementById('pvFilterConsulente')?.value || '';
    const tipo = document.getElementById('pvFilterTipo')?.value || '';
    const status = document.getElementById('pvFilterStatus')?.value || '';

    preventiviFiltered = preventiviData.filter(p =>
        (!operatore || p.user?.fullName === operatore) &&
        (!consulente || p.consultantName === consulente) &&
        (!tipo || p.tipo === tipo) &&
        (!status || p.status === status)
    );

    renderPreventiviList('VENDITA', 'preventiviVenditaList', 'preventiviVenditaCount');
    renderPreventiviList('NOLEGGIO', 'preventiviNoleggioList', 'preventiviNoleggioCount');
    renderPreventiviStatCards();
    renderPreventiviCalendar();
    renderPreventiviCharts();
}

function resetPreventiviFilters() {
    ['pvFilterOperatore', 'pvFilterConsulente', 'pvFilterTipo', 'pvFilterStatus'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    applyPreventiviFilters();
}

function renderPreventiviStatCards() {
    const totale = preventiviFiltered.length;
    const vendita = preventiviFiltered.filter(p => p.tipo === 'VENDITA').length;
    const noleggio = preventiviFiltered.filter(p => p.tipo === 'NOLEGGIO').length;
    const pctVendita = totale > 0 ? Math.round(vendita * 1000 / totale) / 10 : 0;
    const pctNoleggio = totale > 0 ? Math.round(noleggio * 1000 / totale) / 10 : 0;
    const statVendita = document.getElementById('pvStatVendita');
    const statNoleggio = document.getElementById('pvStatNoleggio');
    if (statVendita) statVendita.textContent = `${vendita} (${pctVendita}%)`;
    if (statNoleggio) statNoleggio.textContent = `${noleggio} (${pctNoleggio}%)`;
}

// --- FORM DI CREAZIONE ---

function showNewPreventivoForm() {
    const form = document.getElementById('newPreventivoForm');
    if (form) form.style.display = 'block';
}

function hideNewPreventivoForm() {
    const form = document.getElementById('newPreventivoForm');
    if (form) form.style.display = 'none';
    ['pvTipo', 'pvNome', 'pvCognome', 'pvMarcaInput', 'pvMarca', 'pvModello', 'pvTargaTelaio', 'pvLinkLead', 'pvConsultant']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const dropdown = document.getElementById('pvMarcaDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

// Tendina marca con ricerca — stessa logica di filterMarche/selectMarca in
// contact.js, ma puntata sui campi del form Preventivi Telefonici.
function showPreventivoMarcheDropdown() { filterPreventivoMarche('', true); }

function filterPreventivoMarche(query, showAll) {
    const dropdown = document.getElementById('pvMarcaDropdown');
    if (!dropdown) return;
    const q = (query || '').toLowerCase().trim();
    let matches = MARCHE_NORMALIZED;
    if (q && !showAll) matches = MARCHE_NORMALIZED.filter(m => m.normalized.includes(q));
    if (matches.length === 0) {
        dropdown.innerHTML = `<div style="padding:10px 12px;color:var(--text-secondary);font-size:13px">Nessuna marca trovata</div>`;
        dropdown.style.display = 'block';
        return;
    }
    dropdown.innerHTML = matches.map(m =>
        `<div onclick="selectPreventivoMarca('${m.original.replace(/'/g, "\\'")}')" style="padding:8px 12px;cursor:pointer;font-size:13px" onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background='transparent'">${m.original}</div>`
    ).join('');
    dropdown.style.display = 'block';
}

function selectPreventivoMarca(marca) {
    const input = document.getElementById('pvMarcaInput');
    const hidden = document.getElementById('pvMarca');
    if (input) input.value = marca;
    if (hidden) hidden.value = marca;
    const dropdown = document.getElementById('pvMarcaDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('pvMarcaDropdown');
    const input = document.getElementById('pvMarcaInput');
    if (dropdown && input && !input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

async function createPreventivo() {
    const tipo = document.getElementById('pvTipo').value;
    const clienteNome = document.getElementById('pvNome').value.trim();
    const clienteCognome = document.getElementById('pvCognome').value.trim();
    const marca = document.getElementById('pvMarca').value.trim();
    const modello = document.getElementById('pvModello').value.trim();
    const targaTelaio = document.getElementById('pvTargaTelaio').value.trim();
    const linkLead = document.getElementById('pvLinkLead').value.trim();
    const consultantName = document.getElementById('pvConsultant').value;

    const mancanti = [];
    if (!tipo) mancanti.push('Tipo');
    if (!clienteNome) mancanti.push('Nome');
    if (!clienteCognome) mancanti.push('Cognome');
    if (!marca) mancanti.push('Marchio');
    if (!modello) mancanti.push('Modello');
    if (!linkLead) mancanti.push('Link lead');
    if (!consultantName) mancanti.push('Consulente');
    if (mancanti.length > 0) {
        alert('Campi obbligatori mancanti: ' + mancanti.join(', '));
        return;
    }

    try {
        const res = await fetch('/api/preventivi-telefonici', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tipo, clienteNome, clienteCognome, marca, modello,
                targaTelaio: targaTelaio || null, linkLead, consultantName
            })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.error || 'Errore nella creazione del preventivo');
            return;
        }
        hideNewPreventivoForm();
        await loadPreventivi();
    } catch (err) {
        console.error('Errore creazione preventivo telefonico:', err);
        alert('Errore di rete nella creazione del preventivo');
    }
}

// --- STATO E RENDERING ---

const PREVENTIVO_STATUS_LABELS = {
    GENERATO: 'Preventivo telefonico generato',
    NON_RISPONDE: 'Cliente non risponde',
    TRATTATIVA_GENERATA: 'Trattativa generata',
    CHIUSA: 'Trattativa chiusa',
    FALLITA: 'Trattativa fallita'
};

function formatPreventivoDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function preventivoInitials(nome, cognome) {
    const a = (nome || '').trim()[0] || '';
    const b = (cognome || '').trim()[0] || '';
    return (a + b).toUpperCase() || '?';
}

function preventivoRef(p) {
    const prefix = p.tipo === 'VENDITA' ? 'VEN' : 'NOL';
    return prefix + '-' + String(p.id).padStart(4, '0');
}

const TERMINAL_STATUSES = ['NON_RISPONDE', 'CHIUSA', 'FALLITA'];
const TERMINAL_ICONS = { NON_RISPONDE: '📵', CHIUSA: '✅', FALLITA: '❌' };

function renderPreventiviList(tipo, containerId, countId) {
    const container = document.getElementById(containerId);
    const countEl = document.getElementById(countId);
    if (!container) return;

    const items = preventiviFiltered.filter(p => p.tipo === tipo);
    if (countEl) countEl.textContent = items.length;

    if (items.length === 0) {
        container.innerHTML = `<div class="preventivo-empty">🚘<div>Nessun preventivo telefonico in questo periodo</div></div>`;
        return;
    }

    const cardClass = tipo === 'VENDITA' ? 'vendita' : 'noleggio';

    container.innerHTML = items.map(p => {
        const isTerminal = TERMINAL_STATUSES.includes(p.status);
        const initials = preventivoInitials(p.clienteNome, p.clienteCognome);
        const metaLine1 = `🚘 ${p.marca} — ${p.modello}${p.targaTelaio ? ' — ' + p.targaTelaio : ''}`;
        const metaLine2 = isTerminal
            ? `${p.marca} — ${p.modello} · ${p.consultantName}`
            : `👤 ${p.consultantName} <span style="color:var(--border);margin:0 3px;font-size:10px">●</span> ${p.user?.fullName || '—'}, ${formatPreventivoDateTime(p.createdAt)}`;

        const historyHtml = (p.statusHistory || []).map(h => `
            <div class="preventivo-history-row">
                <span class="status-badge status-${h.status}">${PREVENTIVO_STATUS_LABELS[h.status] || h.status}</span>
                — ${formatPreventivoDateTime(h.changedAt)} — <b>${h.changedBy?.fullName || '—'}</b>
            </div>`).join('');

        const utilityButtons = `
            ${p.linkLead ? `<a href="${p.linkLead}" target="_blank" onclick="event.stopPropagation()" class="preventivo-icon-btn" title="Link lead">🔗</a>` : ''}
            <button onclick="event.stopPropagation();togglePreventivoDetail(${p.id})" class="preventivo-icon-btn" title="Storico">🕓</button>
            <button onclick="event.stopPropagation();openEditPreventivoModal(${p.id})" class="preventivo-icon-btn" title="Modifica">✏️</button>
            <button onclick="event.stopPropagation();deletePreventivo(${p.id})" class="preventivo-icon-btn danger" title="Elimina">🗑️</button>`;

        if (isTerminal) {
            return `<div class="preventivo-card ${cardClass} terminal" onclick="togglePreventivoDetail(${p.id})">
                <div class="preventivo-header">
                    <div class="preventivo-client">
                        <div class="preventivo-avatar ${cardClass}">${initials}</div>
                        <div>
                            <div class="preventivo-name-row"><span class="preventivo-name">${p.clienteNome} ${p.clienteCognome}</span><span class="preventivo-ref">${preventivoRef(p)}</span></div>
                            <div class="preventivo-meta">${metaLine2}</div>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px">
                        <div class="preventivo-terminal-status st-${p.status}">
                            <i>${TERMINAL_ICONS[p.status]}</i>
                            <span class="label">${PREVENTIVO_STATUS_LABELS[p.status]}</span>
                            <span class="date">${formatPreventivoDateTime(p.lastModifiedAt || p.createdAt)}</span>
                        </div>
                        <div class="preventivo-actions-utility">${utilityButtons}</div>
                    </div>
                </div>
                <div id="preventivoDetail-${p.id}" class="preventivo-detail" style="display:none">${historyHtml}</div>
            </div>`;
        }

        const activeColor = p.status === 'TRATTATIVA_GENERATA' ? 'active-orange' : 'active-blue';
        const step2Filled = p.status === 'TRATTATIVA_GENERATA';
        const step2Label = p.status === 'TRATTATIVA_GENERATA' ? `style="color:#ff9800"` : '';

        let actionButtons = '';
        if (p.status === 'GENERATO') {
            actionButtons = `
                <button onclick="event.stopPropagation();changePreventivoStatus(${p.id},'NON_RISPONDE')" class="preventivo-pill-btn">📵 Non risponde</button>
                <button onclick="event.stopPropagation();changePreventivoStatus(${p.id},'TRATTATIVA_GENERATA')" class="preventivo-pill-btn solid-orange">➡️ Trattativa generata</button>`;
        } else if (p.status === 'TRATTATIVA_GENERATA') {
            actionButtons = `
                <button onclick="event.stopPropagation();changePreventivoStatus(${p.id},'CHIUSA')" class="preventivo-pill-btn solid-green">✅ Chiusa</button>
                <button onclick="event.stopPropagation();changePreventivoStatus(${p.id},'FALLITA')" class="preventivo-pill-btn outline-red">❌ Fallita</button>`;
        }

        return `<div class="preventivo-card ${cardClass}" onclick="togglePreventivoDetail(${p.id})">
            <div class="preventivo-header">
                <div class="preventivo-client">
                    <div class="preventivo-avatar ${cardClass}">${initials}</div>
                    <div>
                        <div class="preventivo-name-row"><span class="preventivo-name">${p.clienteNome} ${p.clienteCognome}</span><span class="preventivo-ref">${preventivoRef(p)}</span></div>
                        <div class="preventivo-meta">${metaLine1}</div>
                        <div class="preventivo-meta">${metaLine2}</div>
                    </div>
                </div>
                <span class="preventivo-status-dot" style="background:${p.status === 'TRATTATIVA_GENERATA' ? '#ff9800' : 'var(--badge-in-progress-color)'}"></span>
            </div>

            <div class="preventivo-stepper">
                <div class="preventivo-step-dot filled ${activeColor}"></div>
                <div class="preventivo-step-line ${step2Filled ? activeColor : ''}"></div>
                <div class="preventivo-step-dot ${step2Filled ? 'filled ' + activeColor : ''}"></div>
                <div class="preventivo-step-line"></div>
                <div class="preventivo-step-dot"></div>
            </div>
            <div class="preventivo-stepper-labels">
                <span></span><span>Generato</span><span></span><span ${step2Label}>Trattativa</span><span></span>
            </div>

            <div class="preventivo-divider"></div>

            <div class="preventivo-actions-row">
                <div class="preventivo-actions-primary">${actionButtons}</div>
                <div class="preventivo-actions-utility">${utilityButtons}</div>
            </div>

            <div id="preventivoDetail-${p.id}" class="preventivo-detail" style="display:none">${historyHtml}</div>
        </div>`;
    }).join('');
}

function togglePreventivoDetail(id) {
    const el = document.getElementById('preventivoDetail-' + id);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function deletePreventivo(id) {
    if (!confirm('Eliminare definitivamente questo preventivo telefonico? L\'azione non è reversibile.')) return;
    try {
        const res = await fetch(`/api/preventivi-telefonici/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.error || 'Errore nell\'eliminazione del preventivo');
            return;
        }
        await loadPreventivi();
    } catch (err) {
        console.error('Errore eliminazione preventivo telefonico:', err);
        alert('Errore di rete nell\'eliminazione del preventivo');
    }
}

async function changePreventivoStatus(id, newStatus) {
    if (!confirm(`Confermi il cambio di stato in "${PREVENTIVO_STATUS_LABELS[newStatus] || newStatus}"?`)) return;
    try {
        const res = await fetch(`/api/preventivi-telefonici/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.error || 'Errore nel cambio di stato');
            return;
        }
        await loadPreventivi();
    } catch (err) {
        console.error('Errore cambio stato preventivo telefonico:', err);
        alert('Errore di rete nel cambio di stato');
    }
}

// ============================================================
// CALENDARIO — un giorno per data di creazione (createdAt), colorato in
// base all'esito dei preventivi generati quel giorno. Naviga i mesi
// cambiando direttamente il filtro periodo (pvFrom/pvTo) e ricaricando,
// cosi' calendario, grafici e liste restano sempre sincronizzati sulla
// stessa fonte dati — stesso principio del calendario Follow-up.
function getPreventiviCalendarFocus() {
    const fromVal = document.getElementById('pvFrom')?.value;
    if (fromVal) {
        const d = new Date(fromVal + 'T00:00:00');
        return { year: d.getFullYear(), month: d.getMonth() + 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function changePreventiviCalendarMonth(delta) {
    const { year, month } = getPreventiviCalendarFocus();
    let newMonth = month + delta, newYear = year;
    if (newMonth > 12) { newMonth = 1; newYear++; }
    else if (newMonth < 1) { newMonth = 12; newYear--; }
    const first = new Date(newYear, newMonth - 1, 1).toISOString().split('T')[0];
    const last = new Date(newYear, newMonth, 0).toISOString().split('T')[0];
    document.getElementById('pvFrom').value = first;
    document.getElementById('pvTo').value = last;
    loadPreventivi();
}

function renderPreventiviCalendar() {
    const container = document.getElementById('pvCalendar');
    const title = document.getElementById('pvCalendarTitle');
    if (!container || !title) return;

    const { year, month } = getPreventiviCalendarFocus();
    title.textContent = `Calendario Preventivi — ${MONTH_NAMES[month - 1]} ${year}`;

    const firstDay = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    let startWeekday = firstDay.getDay();
    startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;

    const byDay = {};
    preventiviFiltered.forEach(p => {
        if (!p.createdAt) return;
        const dateStr = p.createdAt.split('T')[0];
        if (!byDay[dateStr]) byDay[dateStr] = [];
        byDay[dateStr].push(p);
    });

    const weekdays = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
    let html = weekdays.map(d => `<div class="cal-weekday">${d}</div>`).join('');

    for (let i = 0; i < startWeekday; i++) {
        html += '<div class="cal-day cal-day-empty"></div>';
    }

    const today = new Date().toISOString().split('T')[0];

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const items = byDay[dateStr] || [];
        let dayClass = 'cal-day';
        let bgStyle = '', borderStyle = '';

        if (items.length > 0) {
            const hasChiusa = items.some(p => p.status === 'CHIUSA');
            const hasAperto = items.some(p => p.status === 'GENERATO' || p.status === 'TRATTATIVA_GENERATA');
            if (hasChiusa) { bgStyle = 'background:rgba(0,200,83,0.28);'; borderStyle = 'border-color:#00c853;'; }
            else if (hasAperto) { bgStyle = 'background:rgba(240,192,64,0.35);'; borderStyle = 'border-color:#f0c040;'; }
            else { bgStyle = 'background:rgba(255,61,61,0.2);'; borderStyle = 'border-color:#ff3d3d;'; }
        }
        if (dateStr === today) dayClass += ' cal-day-today';

        const clickable = items.length > 0 ? ` onclick="openPreventiviCalendarDay('${dateStr}')" style="cursor:pointer;${bgStyle}${borderStyle}"` : ` style="${bgStyle}${borderStyle}"`;
        html += `<button type="button" class="${dayClass}"${clickable}>${day}${items.length > 0 ? `<span style="display:block;font-size:9px;font-weight:900">${items.length}</span>` : ''}</button>`;
    }

    container.innerHTML = html;
}

function openPreventiviCalendarDay(dateStr) {
    document.getElementById('pvFrom').value = dateStr;
    document.getElementById('pvTo').value = dateStr;
    loadPreventivi();
    document.getElementById('preventiviVenditaList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================================
// GRAFICI — tutti calcolati da preventiviFiltered (il periodo attualmente
// filtrato), nessuna chiamata backend dedicata.
function renderPreventiviCharts() {
    renderPreventivoBarChart('pvChartMarche', groupCount(preventiviFiltered, p => p.marca), '#4a90d9', 'marca');
    renderPreventivoOperatoreDoughnut();
    renderPreventivoBarChart('pvChartConsulente', groupCount(preventiviFiltered, p => p.consultantName || '—'), '#00bcd4', 'consulente');
    renderPreventivoTrattativeDoughnut();
    renderPreventivoEsitoDoughnut();
    renderPreventivoPerConsulente();
}

function groupCount(items, keyFn) {
    const counts = {};
    items.forEach(p => {
        const key = keyFn(p);
        if (!key) return;
        counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
}

// Barra orizzontale cliccabile — stesso stile di renderChartMarcheCustom
// in contact.js (Registro Contatti), per restare visivamente coerenti.
function renderPreventivoBarChart(containerId, counts, barColor, drillKey) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (entries.length === 0) {
        container.innerHTML = `<div style="color:var(--text-secondary);font-size:13px;padding:12px 0">Nessun dato disponibile</div>`;
        return;
    }
    const maxVal = entries[0][1];
    const total = entries.reduce((a, b) => a + b[1], 0);
    container.innerHTML = entries.map(([label, val]) => {
        const pct = Math.round(val / maxVal * 100);
        const pctTot = total > 0 ? Math.round(val * 1000 / total) / 10 : 0;
        return `<div onclick="showPreventivoDrilldown('${drillKey}','${label.replace(/'/g, "\\'")}')" style="display:flex;align-items:center;gap:12px;padding:4px 0;cursor:pointer" title="${label}: ${val} (${pctTot}%)">
            <div style="width:110px;font-size:12px;font-weight:700;color:var(--text-primary);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0">${label}</div>
            <div style="flex:1;background:var(--border);border-radius:4px;height:10px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${barColor};border-radius:4px;transition:width 0.4s ease"></div>
            </div>
            <div style="min-width:70px;font-size:12px;font-weight:800;color:${barColor};text-align:right;flex-shrink:0">${val} <span style="font-weight:600;opacity:0.75">(${pctTot}%)</span></div>
        </div>`;
    }).join('');
}

let pvChartOperatoreInstance = null;
function renderPreventivoOperatoreDoughnut() {
    const ctx = document.getElementById('pvChartOperatore');
    if (!ctx || typeof Chart === 'undefined') return;
    const counts = groupCount(preventiviFiltered, p => p.user?.fullName || '—');
    const labels = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const values = labels.map(l => counts[l]);
    const total = values.reduce((a, b) => a + b, 0);
    const colors = labels.map((_, i) => OPERATOR_COLORS[i % OPERATOR_COLORS.length]);

    if (pvChartOperatoreInstance) { pvChartOperatoreInstance.destroy(); pvChartOperatoreInstance = null; }
    if (labels.length === 0) return;

    pvChartOperatoreInstance = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: colors.map(c => c + '99'), borderColor: colors, borderWidth: 2 }] },
        options: {
            animation: false, responsive: true, maintainAspectRatio: true,
            onClick: (evt, elements) => {
                if (elements.length === 0) return;
                showPreventivoDrilldown('operatore', labels[elements[0].index]);
            },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: {
                legend: { position: 'bottom', labels: { color: getLegendColor(), font: { size: 11 }, padding: 10, boxWidth: 12,
                    generateLabels: chart => chart.data.labels.map((label, i) => {
                        const val = chart.data.datasets[0].data[i];
                        const pct = total > 0 ? Math.round(val * 1000 / total) / 10 : 0;
                        return { text: `${label}: ${val} (${pct}%)`, fillStyle: colors[i], strokeStyle: colors[i], fontColor: getLegendColor(), lineWidth: 0, index: i };
                    })
                } },
                tooltip: { callbacks: { label: ctx2 => {
                    const val = ctx2.raw;
                    const pct = total > 0 ? Math.round(val * 1000 / total) / 10 : 0;
                    return ` Valore: ${val} — ${pct}%`;
                } } }
            }
        }
    });
}

let pvChartTrattativeInstance = null;
function renderPreventivoTrattativeDoughnut() {
    const ctx = document.getElementById('pvChartTrattative');
    if (!ctx || typeof Chart === 'undefined') return;
    const generata = preventiviFiltered.filter(p => ['TRATTATIVA_GENERATA', 'CHIUSA', 'FALLITA'].includes(p.status)).length;
    const nonGenerata = preventiviFiltered.length - generata;
    const total = preventiviFiltered.length;
    if (pvChartTrattativeInstance) { pvChartTrattativeInstance.destroy(); pvChartTrattativeInstance = null; }
    const colors = ['#00c853', '#8a8faa'];
    pvChartTrattativeInstance = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: { labels: ['Generata', 'Non generata'], datasets: [{ data: [generata, nonGenerata], backgroundColor: colors.map(c => c + '99'), borderColor: colors, borderWidth: 2 }] },
        options: {
            animation: false, responsive: true, maintainAspectRatio: true,
            onClick: (evt, elements) => {
                if (elements.length === 0) return;
                const isGenerata = elements[0].index === 0;
                const items = preventiviFiltered.filter(p => isGenerata
                    ? ['TRATTATIVA_GENERATA', 'CHIUSA', 'FALLITA'].includes(p.status)
                    : !['TRATTATIVA_GENERATA', 'CHIUSA', 'FALLITA'].includes(p.status));
                showPreventivoDrilldownItems(isGenerata ? 'Trattativa generata' : 'Trattativa non generata', items);
            },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: {
                legend: { position: 'bottom', labels: { color: getLegendColor(), font: { size: 11 }, padding: 10, boxWidth: 12,
                    generateLabels: chart => chart.data.labels.map((label, i) => {
                        const val = chart.data.datasets[0].data[i];
                        const pct = total > 0 ? Math.round(val * 1000 / total) / 10 : 0;
                        return { text: `${label}: ${val} (${pct}%)`, fillStyle: colors[i], strokeStyle: colors[i], fontColor: getLegendColor(), lineWidth: 0, index: i };
                    })
                } },
                tooltip: { callbacks: { label: ctx2 => {
                    const val = ctx2.raw;
                    const pct = total > 0 ? Math.round(val * 1000 / total) / 10 : 0;
                    return ` Valore: ${val} — ${pct}%`;
                } } }
            }
        }
    });
}

let pvChartEsitoInstance = null;
function renderPreventivoEsitoDoughnut() {
    const ctx = document.getElementById('pvChartEsito');
    if (!ctx || typeof Chart === 'undefined') return;
    const chiuse = preventiviFiltered.filter(p => p.status === 'CHIUSA').length;
    const fallite = preventiviFiltered.filter(p => p.status === 'FALLITA').length;
    const total = chiuse + fallite;
    if (pvChartEsitoInstance) { pvChartEsitoInstance.destroy(); pvChartEsitoInstance = null; }
    const colors = ['#00c853', '#ff3d3d'];
    pvChartEsitoInstance = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: { labels: ['Chiuse', 'Fallite'], datasets: [{ data: [chiuse, fallite], backgroundColor: colors.map(c => c + '99'), borderColor: colors, borderWidth: 2 }] },
        options: {
            animation: false, responsive: true, maintainAspectRatio: true,
            onClick: (evt, elements) => {
                if (elements.length === 0) return;
                const status = elements[0].index === 0 ? 'CHIUSA' : 'FALLITA';
                const items = preventiviFiltered.filter(p => p.status === status);
                showPreventivoDrilldownItems(PREVENTIVO_STATUS_LABELS[status], items);
            },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: {
                legend: { position: 'bottom', labels: { color: getLegendColor(), font: { size: 11 }, padding: 10, boxWidth: 12,
                    generateLabels: chart => chart.data.labels.map((label, i) => {
                        const val = chart.data.datasets[0].data[i];
                        const pct = total > 0 ? Math.round(val * 1000 / total) / 10 : 0;
                        return { text: `${label}: ${val} (${pct}%)`, fillStyle: colors[i], strokeStyle: colors[i], fontColor: getLegendColor(), lineWidth: 0, index: i };
                    })
                } },
                tooltip: { callbacks: { label: ctx2 => {
                    const val = ctx2.raw;
                    const pct = total > 0 ? Math.round(val * 1000 / total) / 10 : 0;
                    return ` Valore: ${val} — ${pct}%`;
                } } }
            }
        }
    });
}

// Riepilogo per consulente — barra orizzontale impilata, una riga per
// consulente: in un colpo d'occhio mostra sia il volume (lunghezza totale)
// sia la qualita' (quanto verde/chiuse ha) di ognuno, senza un grafico
// separato per persona.
const PV_CONSULENTE_SEGMENT_COLORS = {
    GENERATO: '#4a90d9',
    NON_RISPONDE: '#8a8faa',
    TRATTATIVA_GENERATA: '#ff9800',
    CHIUSA: '#00c853',
    FALLITA: '#ff3d3d'
};

function renderPreventivoPerConsulente() {
    const container = document.getElementById('pvChartPerConsulente');
    if (!container) return;

    const byConsulente = {};
    preventiviFiltered.forEach(p => {
        const key = p.consultantName || '—';
        if (!byConsulente[key]) byConsulente[key] = { GENERATO: 0, NON_RISPONDE: 0, TRATTATIVA_GENERATA: 0, CHIUSA: 0, FALLITA: 0 };
        byConsulente[key][p.status] = (byConsulente[key][p.status] || 0) + 1;
    });

    const rows = Object.entries(byConsulente)
        .map(([nome, counts]) => ({ nome, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) }))
        .sort((a, b) => b.total - a.total);

    if (rows.length === 0) {
        container.innerHTML = `<div style="color:var(--text-secondary);font-size:13px;padding:12px 0">Nessun dato disponibile</div>`;
        return;
    }

    const maxTotal = rows[0].total;

    container.innerHTML = rows.map(row => {
        const segments = Object.entries(row.counts)
            .filter(([, val]) => val > 0)
            .map(([status, val]) => {
                const widthPct = maxTotal > 0 ? (val / maxTotal * 100) : 0;
                return `<div onclick="showPreventivoDrilldownItems('${row.nome.replace(/'/g, "\\'")} — ${PREVENTIVO_STATUS_LABELS[status]}', preventiviFiltered.filter(p=>p.consultantName==='${row.nome.replace(/'/g, "\\'")}'&&p.status==='${status}'))" style="width:${widthPct}%;height:100%;background:${PV_CONSULENTE_SEGMENT_COLORS[status]};cursor:pointer" title="${PREVENTIVO_STATUS_LABELS[status]}: ${val}"></div>`;
            }).join('');
        return `<div style="display:flex;align-items:center;gap:12px;padding:6px 0">
            <div style="width:130px;font-size:12px;font-weight:700;color:var(--text-primary);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0">${row.nome}</div>
            <div style="flex:1;display:flex;height:16px;border-radius:4px;overflow:hidden;background:var(--border)">${segments}</div>
            <div style="width:28px;font-size:12px;font-weight:800;color:var(--text-primary);text-align:right;flex-shrink:0">${row.total}</div>
        </div>`;
    }).join('') + `
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:14px;padding-top:10px;border-top:1px solid var(--border);font-size:11px;color:var(--text-secondary)">
            ${Object.entries(PREVENTIVO_STATUS_LABELS).map(([status, label]) => `<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:${PV_CONSULENTE_SEGMENT_COLORS[status]};display:inline-block"></span>${label}</span>`).join('')}
        </div>`;
}

// ============================================================
// DRILL-DOWN — popup con l'elenco delle lead dietro a un click su
// qualunque grafico (barra, torta, segmento del riepilogo consulenti).
function showPreventivoDrilldown(kind, value) {
    let items = [];
    let title = '';
    if (kind === 'marca') { items = preventiviFiltered.filter(p => p.marca === value); title = `Marca — ${value}`; }
    else if (kind === 'operatore') { items = preventiviFiltered.filter(p => (p.user?.fullName || '—') === value); title = `Operatore — ${value}`; }
    else if (kind === 'consulente') { items = preventiviFiltered.filter(p => (p.consultantName || '—') === value); title = `Consulente — ${value}`; }
    showPreventivoDrilldownItems(title, items);
}

function showPreventivoDrilldownItems(title, items) {
    const modal = document.getElementById('preventivoDrilldownModal');
    const titleEl = document.getElementById('preventivoDrilldownTitle');
    const list = document.getElementById('preventivoDrilldownList');
    if (!modal || !titleEl || !list) return;

    titleEl.textContent = `${title} (${items.length})`;
    if (items.length === 0) {
        list.innerHTML = `<div style="color:var(--text-secondary);font-size:13px;padding:20px 0">Nessun risultato</div>`;
    } else {
        list.innerHTML = items.map(p => `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
                <div>
                    <div style="font-weight:700;font-size:13px;color:var(--text-primary)">${p.clienteNome} ${p.clienteCognome}</div>
                    <div style="font-size:12px;color:var(--text-secondary)">${p.marca} — ${p.modello} · ${p.consultantName}</div>
                </div>
                <span class="status-badge status-${p.status}">${PREVENTIVO_STATUS_LABELS[p.status] || p.status}</span>
            </div>`).join('');
    }
    modal.style.display = 'flex';
}

function closePreventivoDrilldown(event) {
    if (event && event.target.id !== 'preventivoDrilldownModal') return;
    const modal = document.getElementById('preventivoDrilldownModal');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// IMPORT LEAD DA CSV — carica il file, mostra un riepilogo
// (creati/duplicati/errori riga per riga) nello stesso modal usato per i
// drill-down dei grafici, poi ricarica la lista.
async function importPreventiviLeadCsv(file) {
    if (!file) return;
    const input = document.getElementById('pvImportLeadInput');
    if (!confirm(`Importare i lead dal file "${file.name}"? I lead già importati in precedenza (stesso ID) verranno aggiornati con lo stato e i dati più recenti, non duplicati.`)) {
        if (input) input.value = '';
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/preventivi-telefonici/import-lead', { method: 'POST', body: formData });
        const data = await res.json().catch(() => ({}));
        if (input) input.value = '';

        if (!res.ok) {
            alert(data.error || 'Errore durante l\'import');
            return;
        }

        const modal = document.getElementById('preventivoDrilldownModal');
        const titleEl = document.getElementById('preventivoDrilldownTitle');
        const list = document.getElementById('preventivoDrilldownList');
        titleEl.textContent = 'Risultato Import Lead';
        list.innerHTML = `
            <div style="display:flex;gap:20px;margin-bottom:16px">
                <div><div style="font-size:22px;font-weight:800;color:#00c853">${data.creati || 0}</div><div style="font-size:12px;color:var(--text-secondary)">Creati</div></div>
                <div><div style="font-size:22px;font-weight:800;color:#ff9800">${data.aggiornati || 0}</div><div style="font-size:12px;color:var(--text-secondary)">Aggiornati</div></div>
                <div><div style="font-size:22px;font-weight:800;color:var(--text-secondary)">${data.invariati || 0}</div><div style="font-size:12px;color:var(--text-secondary)">Invariati</div></div>
                <div><div style="font-size:22px;font-weight:800;color:#ff3d3d">${(data.errori || []).length}</div><div style="font-size:12px;color:var(--text-secondary)">Errori</div></div>
            </div>
            ${(data.errori || []).length > 0 ? `<div style="border-top:1px solid var(--border);padding-top:10px">${data.errori.map(e => `<div style="font-size:12px;color:var(--text-secondary);padding:3px 0">⚠️ ${e}</div>`).join('')}</div>` : ''}
        `;
        modal.style.display = 'flex';
        await loadPreventivi();
    } catch (err) {
        console.error('Errore import lead CSV:', err);
        alert('Errore di rete durante l\'import');
        if (input) input.value = '';
    }
}

// Aggancio al cambio tema (☾/☀ in navbar) — stesso pattern di
// refreshRentChartsOnThemeChange/refreshServiceChartsOnThemeChange in
// app.js. Senza questo, i grafici Chart.js gia' disegnati restano col
// colore legenda "congelato" a quello del tema precedente finche' non
// arriva un nuovo caricamento dati.
function refreshPreventiviChartsOnThemeChange() {
    if (typeof preventiviFiltered !== 'undefined') renderPreventiviCharts();
}

// ============================================================
// MODIFICA — nome, cognome, marca, modello, targa/telaio, link lead.
// Non tocca lo stato (quello resta su changePreventivoStatus). Pensato
// soprattutto per completare i record creati da import (aggiungere il
// link lead mancante), ma utilizzabile anche per correggere dati.
function openEditPreventivoModal(id) {
    const p = preventiviData.find(x => x.id === id);
    if (!p) return;
    document.getElementById('editPvId').value = p.id;
    document.getElementById('editPvNome').value = p.clienteNome || '';
    document.getElementById('editPvCognome').value = p.clienteCognome || '';
    document.getElementById('editPvMarcaInput').value = p.marca || '';
    document.getElementById('editPvMarca').value = p.marca || '';
    document.getElementById('editPvModello').value = p.modello || '';
    document.getElementById('editPvTargaTelaio').value = p.targaTelaio || '';
    document.getElementById('editPvLinkLead').value = p.linkLead || '';
    document.getElementById('editPreventivoModal').style.display = 'flex';
}

function closeEditPreventivoModal(event) {
    if (event && event.target.id !== 'editPreventivoModal') return;
    document.getElementById('editPreventivoModal').style.display = 'none';
}

// Tendina marca del modal di modifica — stessa logica di
// filterPreventivoMarche/selectPreventivoMarca usata nel form di
// creazione, puntata sui campi del modal di modifica.
function showEditPreventivoMarcheDropdown() { filterEditPreventivoMarche('', true); }

function filterEditPreventivoMarche(query, showAll) {
    const dropdown = document.getElementById('editPvMarcaDropdown');
    if (!dropdown) return;
    const q = (query || '').toLowerCase().trim();
    let matches = MARCHE_NORMALIZED;
    if (q && !showAll) matches = MARCHE_NORMALIZED.filter(m => m.normalized.includes(q));
    if (matches.length === 0) {
        dropdown.innerHTML = `<div style="padding:10px 12px;color:var(--text-secondary);font-size:13px">Nessuna marca trovata</div>`;
        dropdown.style.display = 'block';
        return;
    }
    dropdown.innerHTML = matches.map(m =>
        `<div onclick="selectEditPreventivoMarca('${m.original.replace(/'/g, "\\'")}')" style="padding:8px 12px;cursor:pointer;font-size:13px" onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background='transparent'">${m.original}</div>`
    ).join('');
    dropdown.style.display = 'block';
}

function selectEditPreventivoMarca(marca) {
    document.getElementById('editPvMarcaInput').value = marca;
    document.getElementById('editPvMarca').value = marca;
    document.getElementById('editPvMarcaDropdown').style.display = 'none';
}

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('editPvMarcaDropdown');
    const input = document.getElementById('editPvMarcaInput');
    if (dropdown && input && !input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

async function saveEditPreventivo() {
    const id = document.getElementById('editPvId').value;
    const clienteNome = document.getElementById('editPvNome').value.trim();
    const clienteCognome = document.getElementById('editPvCognome').value.trim();
    const marca = document.getElementById('editPvMarca').value.trim();
    const modello = document.getElementById('editPvModello').value.trim();
    const targaTelaio = document.getElementById('editPvTargaTelaio').value.trim();
    const linkLead = document.getElementById('editPvLinkLead').value.trim();

    const mancanti = [];
    if (!clienteNome) mancanti.push('Nome');
    if (!clienteCognome) mancanti.push('Cognome');
    if (!marca) mancanti.push('Marchio');
    if (!modello) mancanti.push('Modello');
    if (mancanti.length > 0) {
        alert('Campi obbligatori mancanti: ' + mancanti.join(', '));
        return;
    }

    try {
        const res = await fetch(`/api/preventivi-telefonici/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clienteNome, clienteCognome, marca, modello, targaTelaio: targaTelaio || null, linkLead: linkLead || null })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.error || 'Errore nel salvataggio delle modifiche');
            return;
        }
        closeEditPreventivoModal();
        await loadPreventivi();
    } catch (err) {
        console.error('Errore modifica preventivo telefonico:', err);
        alert('Errore di rete nel salvataggio delle modifiche');
    }
}
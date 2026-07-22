// ============================================================
// RECALL — waiting.js completo, con stat-card cliccabili aggiunte
// ============================================================

let waitingEntries = [];
let waitingEntriesFiltered = [];
let waitingView = 'attivi'; // 'attivi' | 'archivio'
let waitingDetailId = null;
let waitingAlertShownThisSession = false;

const WAITING_STATUS_LIST = ['WAITING', 'CALLED', 'APPOINTMENT', 'INTERESTED', 'CLOSED', 'FAILED'];
const WAITING_STATUS_LABELS = {
    'WAITING': 'In Attesa',
    'CALLED': 'Richiamato',
    'APPOINTMENT': 'Appuntamento',
    'INTERESTED': 'Interessato',
    'CLOSED': 'Chiuso',
    'FAILED': 'Fallito'
};
const WAITING_STATUS_COLORS = {
    'WAITING': '#4a90d9',
    'CALLED': '#ff9800',
    'APPOINTMENT': '#f0c040',
    'INTERESTED': '#00c853',
    'CLOSED': '#7c4dff',
    'FAILED': '#ff3d3d'
};
const WAITING_ARCHIVE_STATUSES = ['CLOSED', 'FAILED'];

// ============================================================
// CARICAMENTO
// ============================================================

async function loadWaitingList() {
    try {
        const res = await fetch('/api/waiting');
        if (!res.ok) return;
        waitingEntries = await res.json();
        waitingEntries.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        applyWaitingFilters();
        checkWaitingRecallOggi();
    } catch (err) {
        console.error('Errore caricamento lista recall:', err);
    }
}

function applyWaitingFilters() {
    if (waitingView === 'attivi') {
        waitingEntriesFiltered = waitingEntries.filter(e => !WAITING_ARCHIVE_STATUSES.includes(e.status));
    } else {
        waitingEntriesFiltered = waitingEntries.filter(e => WAITING_ARCHIVE_STATUSES.includes(e.status));
    }
    renderWaitingStats();
    renderWaitingList(waitingEntriesFiltered);
}

// ============================================================
// NAV INTERNO — Attivi / Archivio
// ============================================================

function switchWaitingView(view) {
    waitingView = view;
    const btnAttivi = document.getElementById('waitingNavAttivi');
    const btnArchivio = document.getElementById('waitingNavArchivio');
    if (btnAttivi) btnAttivi.classList.toggle('waiting-nav-active', view === 'attivi');
    if (btnArchivio) btnArchivio.classList.toggle('waiting-nav-active', view === 'archivio');
    applyWaitingFilters();
}

// ============================================================
// STATISTICHE — ora ogni stat-card è cliccabile e apre il dettaglio
// filtrato corrispondente (usa lo stesso modal del popup recall)
// ============================================================

function renderWaitingStats() {
    const all = waitingEntries;
    const total = all.length;
    const el = id => document.getElementById(id);

    const countByStatus = st => all.filter(e => e.status === st).length;
    const pct = n => total > 0 ? Math.round(n * 1000 / total) /10 : 0;

    if (el('waitingStatTotal')) el('waitingStatTotal').textContent = total;
    if (el('waitingStatInteressati')) el('waitingStatInteressati').textContent = pct(countByStatus('INTERESTED')) + '%';
    if (el('waitingStatAppuntamenti')) el('waitingStatAppuntamenti').textContent = pct(countByStatus('APPOINTMENT')) + '%';
    if (el('waitingStatChiusi')) el('waitingStatChiusi').textContent = pct(countByStatus('CLOSED')) + '%';
    if (el('waitingStatFalliti')) el('waitingStatFalliti').textContent = pct(countByStatus('FAILED')) + '%';
    if (el('waitingStatDaRichiamare')) {
        const daRichiamare = all.filter(e => !WAITING_ARCHIVE_STATUSES.includes(e.status) && !e.richiamato && e.recallDate).length;
        el('waitingStatDaRichiamare').textContent = daRichiamare;
    }

    attachWaitingStatClickHandlers();
}

// Aggancia il click a ogni stat-card, trovando il div .stat-card che
// contiene il valore — stesso pattern usato in contact.js.
function attachWaitingStatClickHandlers() {
    const map = {
        waitingStatTotal: 'total',
        waitingStatInteressati: 'interessati',
        waitingStatAppuntamenti: 'appuntamenti',
        waitingStatChiusi: 'chiusi',
        waitingStatFalliti: 'falliti',
        waitingStatDaRichiamare: 'darichiamare'
    };
    Object.entries(map).forEach(([elId, type]) => {
        const valueEl = document.getElementById(elId);
        if (!valueEl) return;
        const card = valueEl.closest('.stat-card');
        if (!card) return;
        card.style.cursor = 'pointer';
        card.classList.add('stat-card-clickable');
        card.onclick = () => showWaitingStatDetail(type);
    });
}

function showWaitingStatDetail(type) {
    let items = [];
    let title = '';
    switch (type) {
        case 'total':
            items = waitingEntries;
            title = 'Totale Clienti Recall';
            break;
        case 'interessati':
            items = waitingEntries.filter(e => e.status === 'INTERESTED');
            title = 'Interessati';
            break;
        case 'appuntamenti':
            items = waitingEntries.filter(e => e.status === 'APPOINTMENT');
            title = 'Appuntamenti';
            break;
        case 'chiusi':
            items = waitingEntries.filter(e => e.status === 'CLOSED');
            title = 'Chiusi';
            break;
        case 'falliti':
            items = waitingEntries.filter(e => e.status === 'FAILED');
            title = 'Falliti';
            break;
        case 'darichiamare':
            items = waitingEntries.filter(e => !WAITING_ARCHIVE_STATUSES.includes(e.status) && !e.richiamato && e.recallDate);
            title = 'Da Richiamare';
            break;
    }
    showGenericWaitingDetail(title, items);
}

// Dettaglio generico riusabile — usa lo stesso modal del popup recall
// automatico (waitingRecallModal), così non serve aggiungere HTML nuovo.
function showGenericWaitingDetail(title, items) {
    const modal = document.getElementById('waitingRecallModal');
    const list = document.getElementById('waitingRecallModalList');
    if (!modal || !list) return;

    const modalHeader = modal.querySelector('.modal-header h3');
    if (modalHeader) modalHeader.textContent = `${title} (${items.length})`;

    if (items.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding:20px"><p>Nessun cliente per questo filtro</p></div>';
    } else {
        list.innerHTML = items.map(e => {
            const color = WAITING_STATUS_COLORS[e.status] || '#8a8faa';
            return `<div class="followup-card" style="margin-bottom:10px;cursor:pointer" onclick="closeWaitingRecallModal();openWaitingDetailModal(${e.id})">
                <div style="display:flex;justify-content:space-between;align-items:flex-start">
                    <div>
                        <div style="font-weight:800;color:var(--text-primary);font-size:14px">${e.fullName}</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">🚗 ${e.brand} ${e.model}</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">📞 ${e.contact}</div>
                        <div style="margin-top:6px">
                            <span class="status-badge" style="background:${color}22;color:${color}">${WAITING_STATUS_LABELS[e.status] || e.status}</span>
                            ${e.recallDate ? `<span class="recall-badge recall-future" style="margin-left:6px">📅 ${formatDateITWaiting(e.recallDate)}</span>` : ''}
                        </div>
                    </div>
                    <span style="color:#f0c040;font-size:18px">→</span>
                </div>
            </div>`;
        }).join('');
    }

    modal.style.display = 'flex';
}

// ============================================================
// RENDER LISTA
// ============================================================

function renderWaitingList(entries) {
    const container = document.getElementById('waitingList');
    if (!container) return;

    if (entries.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>🚗</h3>
                <p>${waitingView === 'attivi' ? 'Nessun cliente in lista recall' : 'Nessun cliente in archivio'}</p>
            </div>`;
        return;
    }

    const today = todayStrWaiting();

    container.innerHTML = entries.map(e => renderWaitingCard(e, today)).join('');
}

function todayStrWaiting() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function renderWaitingCard(e, today) {
    const isRecallToday = e.recallDate === today && !e.richiamato;
    const isRecallPast = e.recallDate && e.recallDate < today && !e.richiamato;
    const isRecallSoon = e.recallDate && e.recallDate > today && !e.richiamato;

    let recallBadge = '';
    if (e.recallDate) {
        if (e.richiamato) {
            recallBadge = `<span class="recall-badge" style="background:rgba(0,200,83,0.15);color:#00c853;border:1.5px solid #00c853">✅ RICHIAMATO · ${formatDateITWaiting(e.recallDate)}</span>`;
        } else if (isRecallToday) {
            recallBadge = `<span class="recall-badge recall-today">🔔 RECALL OGGI · ${formatDateITWaiting(e.recallDate)}</span>`;
        } else if (isRecallPast) {
            recallBadge = `<span class="recall-badge recall-past">⚠️ RECALL SCADUTO · ${formatDateITWaiting(e.recallDate)}</span>`;
        } else {
            recallBadge = `<span class="recall-badge recall-future">📅 RECALL · ${formatDateITWaiting(e.recallDate)}</span>`;
        }
    }

    const historyCount = (e.recallHistory && e.recallHistory.length) ? e.recallHistory.length : 0;
    const createdInfo = e.createdAt ? `<span style="font-size:11px;color:var(--text-secondary)">📅 Inserito: ${formatDateTimeWaiting(e.createdAt)}</span>` : '';

    return `
        <div class="waiting-card ${isRecallToday ? 'recall-card-today' : isRecallPast ? 'recall-card-past' : ''}" onclick="openWaitingDetailModal(${e.id})" style="cursor:pointer">
            <div>
                <div class="waiting-name">${e.fullName}</div>
                <div class="waiting-details">
                    📞 ${e.contact} · 🚗 ${e.brand} ${e.model}
                    ${e.price ? ' · 💰 €' + Number(e.price).toLocaleString('it-IT') : ''}
                    ${e.notes ? '<br>📝 ' + e.notes : ''}
                </div>
                <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                    <span class="status-badge status-${e.status}" style="background:${WAITING_STATUS_COLORS[e.status]}22;color:${WAITING_STATUS_COLORS[e.status]}">${WAITING_STATUS_LABELS[e.status] || e.status}</span>
                    ${recallBadge}
                    ${historyCount > 0 ? `<span style="font-size:10px;font-weight:700;color:var(--text-secondary);background:var(--step-bg);padding:2px 8px;border-radius:10px">🕐 ${historyCount} recall precedent${historyCount===1?'e':'i'}</span>` : ''}
                </div>
                ${createdInfo ? `<div style="margin-top:6px">${createdInfo}</div>` : ''}
            </div>
            <div class="waiting-actions" onclick="event.stopPropagation()">
                <button class="btn-small btn-blue" onclick="openWaitingDetailModal(${e.id})">✏️ Gestisci</button>
                <button class="btn-small btn-red" onclick="deleteWaiting(${e.id})">🗑️</button>
            </div>
        </div>
    `;
}

function formatDateITWaiting(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// FIX: il backend restituisce createdAt come LocalDateTime senza indicazione
// di fuso orario (es. "2026-07-21T11:45:00"). Senza la 'Z' finale, JS lo
// interpreta erroneamente già come ora locale, causando uno sfasamento di
// 2 ore (l'orario salvato è in realtà UTC). Aggiungendo 'Z' se assente,
// forziamo JS a trattarlo come UTC e convertirlo correttamente in locale.
function formatDateTimeWaiting(isoStr) {
    if (!isoStr) return '';
    const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(isoStr);
    const normalized = hasTimezone ? isoStr : isoStr + 'Z';
    const d = new Date(normalized);
    const date = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return `${date} · ${time}`;
}

// ============================================================
// POPUP AUTOMATICO RECALL DI OGGI/SCADUTI
// ============================================================

function checkWaitingRecallOggi() {
    const modal = document.getElementById('waitingRecallModal');
    const list = document.getElementById('waitingRecallModalList');
    if (!modal || !list) return;
    if (waitingAlertShownThisSession) return;

    const today = todayStrWaiting();
    const daRichiamare = waitingEntries.filter(e =>
        !WAITING_ARCHIVE_STATUSES.includes(e.status) &&
        e.recallDate &&
        e.recallDate <= today &&
        !e.richiamato
    );

    if (daRichiamare.length === 0) return;

    waitingAlertShownThisSession = true;

    const modalHeader = modal.querySelector('.modal-header h3');
    if (modalHeader) modalHeader.textContent = '🔔 Recall Da Effettuare';

    list.innerHTML = daRichiamare.map(e => {
        const isPast = e.recallDate < today;
        return `<div class="followup-card" style="margin-bottom:10px;cursor:pointer" onclick="closeWaitingRecallModal();openWaitingDetailModal(${e.id})">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div>
                    <div style="font-weight:800;color:var(--text-primary);font-size:14px">${e.fullName}</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">🚗 ${e.brand} ${e.model}</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">📞 ${e.contact}</div>
                    <div style="font-size:12px;margin-top:6px">
                        <span class="recall-badge ${isPast ? 'recall-past' : 'recall-today'}">${isPast ? '⚠️ SCADUTO' : '🔔 OGGI'} · ${formatDateITWaiting(e.recallDate)}</span>
                    </div>
                </div>
                <span style="color:#f0c040;font-size:18px">→</span>
            </div>
        </div>`;
    }).join('');

    modal.style.display = 'flex';
}

function closeWaitingRecallModal(event) {
    if (event && event.target.id !== 'waitingRecallModal') return;
    const modal = document.getElementById('waitingRecallModal');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// MODAL DETTAGLIO/GESTIONE CLIENTE — scheda completa editabile
// ============================================================

function openWaitingDetailModal(id) {
    const e = waitingEntries.find(x => x.id === id);
    if (!e) return;
    waitingDetailId = id;

    const setVal = (elId, val) => {
        const el = document.getElementById(elId);
        if (el) el.value = val || '';
    };

    setVal('wdFullName', e.fullName);
    setVal('wdContact', e.contact);
    setVal('wdBrand', e.brand);
    setVal('wdBrandInput', e.brand);
    setVal('wdModel', e.model);
    setVal('wdPrice', e.price);
    setVal('wdNotes', e.notes);
    setVal('wdRecallDate', e.recallDate);
    setVal('wdStatus', e.status);

    const richiamatoBtn = document.getElementById('wdRichiamatoBtn');
    if (richiamatoBtn) {
        richiamatoBtn.classList.toggle('btn-sede-active', !!e.richiamato);
        richiamatoBtn.textContent = e.richiamato ? '✅ Richiamato: Sì' : '⭕ Richiamato: No';
    }

    const createdInfo = document.getElementById('wdCreatedInfo');
    if (createdInfo) createdInfo.textContent = e.createdAt ? formatDateTimeWaiting(e.createdAt) : '—';

    renderWaitingHistory(e);

    const modal = document.getElementById('waitingDetailModal');
    if (modal) modal.style.display = 'flex';
}

function renderWaitingHistory(e) {
    const container = document.getElementById('wdHistoryList');
    if (!container) return;

    const history = e.recallHistory || [];
    if (history.length === 0) {
        container.innerHTML = `<div style="font-size:12px;color:var(--text-secondary);padding:10px 0">Nessun recall precedente registrato</div>`;
        return;
    }

    container.innerHTML = history.slice().reverse().map(h => `
        <div style="background:var(--step-bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px">
            <div style="font-size:12px;font-weight:700;color:var(--text-primary)">📅 ${formatDateITWaiting(h.data)}</div>
            ${h.esito ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">Esito: ${WAITING_STATUS_LABELS[h.esito] || h.esito}</div>` : ''}
            ${h.note ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">📝 ${h.note}</div>` : ''}
        </div>
    `).join('');
}

function closeWaitingDetailModal(event) {
    if (event && event.target.id !== 'waitingDetailModal') return;
    const modal = document.getElementById('waitingDetailModal');
    if (modal) modal.style.display = 'none';
    waitingDetailId = null;
}

function toggleWaitingRichiamato() {
    if (!waitingDetailId) return;
    const e = waitingEntries.find(x => x.id === waitingDetailId);
    if (!e) return;
    const newVal = !e.richiamato;

    fetch(`/api/waiting/${waitingDetailId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ richiamato: newVal })
    }).then(async res => {
        if (!res.ok) return;
        e.richiamato = newVal;
        const btn = document.getElementById('wdRichiamatoBtn');
        if (btn) {
            btn.classList.toggle('btn-sede-active', newVal);
            btn.textContent = newVal ? '✅ Richiamato: Sì' : '⭕ Richiamato: No';
        }
        applyWaitingFilters();
    }).catch(err => console.error('Errore aggiornamento richiamato:', err));
}

async function saveWaitingDetail() {
    if (!waitingDetailId) return;

    const fullName = document.getElementById('wdFullName')?.value.trim() || '';
    const contact = document.getElementById('wdContact')?.value.trim() || '';
    const brand = document.getElementById('wdBrand')?.value.trim() || '';
    const model = document.getElementById('wdModel')?.value.trim() || '';
    const price = document.getElementById('wdPrice')?.value.trim() || '';
    const notes = document.getElementById('wdNotes')?.value.trim() || '';
    const recallDate = document.getElementById('wdRecallDate')?.value || '';
    const status = document.getElementById('wdStatus')?.value || '';

    if (!fullName || !contact || !brand || !model) {
        alert('Nome, contatto, marchio e modello sono obbligatori');
        return;
    }

    try {
        const res = await fetch(`/api/waiting/${waitingDetailId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fullName, contact, brand, model,
                price: price || null,
                notes: notes || null,
                recallDate: recallDate || null,
                status
            })
        });
        if (!res.ok) {
            const data = await res.json().catch(() => null);
            alert(data?.error || 'Errore nel salvataggio');
            return;
        }
        closeWaitingDetailModal();
        loadWaitingList();
    } catch (err) {
        console.error('Errore salvataggio scheda recall:', err);
    }
}

async function registraNuovoRecall() {
    if (!waitingDetailId) return;
    const e = waitingEntries.find(x => x.id === waitingDetailId);
    if (!e) return;

    if (!e.recallDate) {
        alert('Non c\'è nessuna data di recall attiva da archiviare. Imposta prima una data recall.');
        return;
    }

    const nuovaData = prompt('Inserisci la nuova data di recall (AAAA-MM-GG):', '');
    if (!nuovaData) return;

    const notaPrecedente = document.getElementById('wdNotes')?.value.trim() || '';

    try {
        const res = await fetch(`/api/waiting/${waitingDetailId}/nuovo-recall`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nuovaDataRecall: nuovaData,
                notaRecallPrecedente: notaPrecedente || null
            })
        });
        if (!res.ok) {
            const data = await res.json().catch(() => null);
            alert(data?.error || 'Errore nella registrazione del nuovo recall');
            return;
        }
        const updated = await res.json();
        const idx = waitingEntries.findIndex(x => x.id === updated.id);
        if (idx !== -1) waitingEntries[idx] = updated;
        openWaitingDetailModal(updated.id);
        applyWaitingFilters();
    } catch (err) {
        console.error('Errore registrazione nuovo recall:', err);
    }
}

async function deleteWaitingFromDetail() {
    if (!waitingDetailId) return;
    if (!confirm('Eliminare definitivamente questo cliente?')) return;
    try {
        await fetch(`/api/waiting/${waitingDetailId}`, { method: 'DELETE' });
        closeWaitingDetailModal();
        loadWaitingList();
    } catch (err) {
        console.error('Errore eliminazione:', err);
    }
}

async function deleteWaiting(id) {
    if (!confirm('Sei sicuro di voler eliminare questo cliente?')) return;
    try {
        await fetch(`/api/waiting/${id}`, { method: 'DELETE' });
        loadWaitingList();
    } catch (err) {
        console.error('Errore eliminazione:', err);
    }
}

// ============================================================
// FORM NUOVO CLIENTE
// ============================================================

async function createWaiting() {
    const fullName = document.getElementById('wFullName').value.trim();
    const contact = document.getElementById('wContact').value.trim();
    const brand = document.getElementById('wBrand').value.trim();
    const model = document.getElementById('wModel').value.trim();
    const price = document.getElementById('wPrice').value.trim();
    const notes = document.getElementById('wNotes').value.trim();
    const recallDate = document.getElementById('wRecallDate').value;

    if (!fullName || !contact || !brand || !model) {
        alert('Nome, contatto, marchio e modello sono obbligatori');
        return;
    }

    try {
        const res = await fetch('/api/waiting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fullName, contact, brand, model,
                price: price || null,
                notes: notes || null,
                recallDate: recallDate || null
            })
        });
        if (!res.ok) {
            const data = await res.json();
            alert(data.error || 'Errore nella creazione');
            return;
        }
        hideNewWaiting();
        loadWaitingList();
    } catch (err) {
        console.error('Errore creazione cliente attesa:', err);
    }
}

function showNewWaiting() {
    document.getElementById('newWaitingForm').style.display = 'block';
    document.getElementById('newWaitingForm').scrollIntoView({ behavior: 'smooth' });
}

function hideNewWaiting() {
    document.getElementById('newWaitingForm').style.display = 'none';
    document.getElementById('wFullName').value = '';
    document.getElementById('wContact').value = '';
    document.getElementById('wBrand').value = '';
    document.getElementById('wBrandInput').value = '';
    document.getElementById('wModel').value = '';
    document.getElementById('wPrice').value = '';
    document.getElementById('wNotes').value = '';
    document.getElementById('wRecallDate').value = '';
}

// ============================================================
// TENDINA MARCHIO — riusa MARCHE_NORMALIZED già definita in contact.js
// Applicata sia al form "Nuovo Cliente Recall" (wBrand) sia al modal
// di dettaglio/modifica (wdBrand).
// ============================================================

// --- Form "Nuovo Cliente Recall" ---
function showWaitingMarcheDropdown() { filterWaitingMarche('', true); }
function filterWaitingMarche(query, showAll) {
    const dropdown = document.getElementById('waitingMarcaDropdown');
    if (!dropdown) return;
    const matches = (!query || query.trim() === '' || showAll) ? MARCHE_NORMALIZED : MARCHE_NORMALIZED.filter(m => m.normalized.includes(normalizeText(query.trim())));
    if (matches.length === 0) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(m => `
        <div onclick="selectWaitingMarca('${m.original}')" style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
            ${m.original}
        </div>`).join('');
    dropdown.style.display = 'block';
}
function selectWaitingMarca(marca) {
    document.getElementById('wBrandInput').value = marca;
    document.getElementById('wBrand').value = marca;
    document.getElementById('waitingMarcaDropdown').style.display = 'none';
}

// --- Modal di dettaglio/modifica ---
function showWdMarcheDropdown() { filterWdMarche('', true); }
function filterWdMarche(query, showAll) {
    const dropdown = document.getElementById('wdMarcaDropdown');
    if (!dropdown) return;
    const matches = (!query || query.trim() === '' || showAll) ? MARCHE_NORMALIZED : MARCHE_NORMALIZED.filter(m => m.normalized.includes(normalizeText(query.trim())));
    if (matches.length === 0) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(m => `
        <div onclick="selectWdMarca('${m.original}')" style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
            ${m.original}
        </div>`).join('');
    dropdown.style.display = 'block';
}
function selectWdMarca(marca) {
    document.getElementById('wdBrandInput').value = marca;
    document.getElementById('wdBrand').value = marca;
    document.getElementById('wdMarcaDropdown').style.display = 'none';
}

// Chiude i dropdown se si clicca fuori
document.addEventListener('click', function(e) {
    const waitingDropdown = document.getElementById('waitingMarcaDropdown');
    const waitingInput = document.getElementById('wBrandInput');
    if (waitingDropdown && waitingInput && !waitingInput.contains(e.target) && !waitingDropdown.contains(e.target)) waitingDropdown.style.display = 'none';

    const wdDropdown = document.getElementById('wdMarcaDropdown');
    const wdInput = document.getElementById('wdBrandInput');
    if (wdDropdown && wdInput && !wdInput.contains(e.target) && !wdDropdown.contains(e.target)) wdDropdown.style.display = 'none';
});
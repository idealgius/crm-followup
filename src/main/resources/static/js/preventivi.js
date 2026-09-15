// ============================================================
// PREVENTIVI TELEFONICI — creazione, rendering, workflow di stato
// Riusa MARCHE_LIST / MARCHE_NORMALIZED gia' definiti in contact.js
// (stesso scope globale, contact.js viene caricato prima di questo file).
// ============================================================

let preventiviData = [];

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
    renderPreventiviList('VENDITA', 'preventiviVenditaList', 'preventiviVenditaCount');
    renderPreventiviList('NOLEGGIO', 'preventiviNoleggioList', 'preventiviNoleggioCount');
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

    const items = preventiviData.filter(p => p.tipo === tipo);
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
            <a href="${p.linkLead}" target="_blank" onclick="event.stopPropagation()" class="preventivo-icon-btn" title="Link lead">🔗</a>
            <button onclick="event.stopPropagation();togglePreventivoDetail(${p.id})" class="preventivo-icon-btn" title="Storico">🕓</button>
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
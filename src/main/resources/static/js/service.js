// ============================================================
// SERVICE — gestione pratiche officina (tagliandi, ricambi, appuntamenti)
// Mirror di rent.js, adattato agli stati e ai campi Service.
// ============================================================

let servicePratiche = [];
let servicePraticheFiltered = [];
let serviceContattiRegistro = [];
let chartServiceStato = null;
let chartServiceChiamateAppuntamenti = null;
let chartServiceLavorazioni = null;
let selectedServiceSede2 = '';       // sede nella nuova pratica (nome diverso da selectedServiceSede già usato in contact.js)
let selectedServiceTipologia = '';
let spEditId = null;
let serviceRicambioAlertShown = false;
let serviceAppuntamentiDomaniShown = false;
let currentAppEsitoId = null;   // pratica attualmente in gestione nel flusso "esito appuntamento"

const SERVICE_STATO_LIST = ['SOLO_INFO', 'IN_CONTATTO', 'ORDINE_RICAMBIO', 'APPUNTAMENTO', 'PROBLEMATICA', 'FALLITA', 'CONCLUSA'];
const SERVICE_STATO_LABELS = {
    'SOLO_INFO': 'Solo Info',
    'IN_CONTATTO': 'In Contatto',
    'ORDINE_RICAMBIO': 'Ordine Ricambio/Accessori',
    'APPUNTAMENTO': 'Appuntamento',
    'PROBLEMATICA': 'Problematica',
    'FALLITA': 'Fallita',
    'CONCLUSA': 'Conclusa'
};
const SERVICE_STATO_COLORS = {
    'SOLO_INFO': '#8a8faa',
    'IN_CONTATTO': '#4a90d9',
    'ORDINE_RICAMBIO': '#f0c040',
    'APPUNTAMENTO': '#7c4dff',
    'PROBLEMATICA': '#ff9800',
    'FALLITA': '#ff3d3d',
    'CONCLUSA': '#00c853'
};
const SERVICE_TIPOLOGIA_LIST = ['Tagliando', 'Dispositivo satellitare', 'Prenotazione', 'Lavorazione in corso', 'Doctor Glass', 'Cambio Gomme', 'Altro'];
const SERVICE_SEDI_LIST_PAGE = ['Agnano', 'Salerno'];

const SERVICE_GESTIONE_ROLES = ['SERVICE', 'MODERATORE', 'GESTORE', 'ADMIN'];
function canManageServiceGestione() {
    return currentUser && SERVICE_GESTIONE_ROLES.includes(currentUser.role);
}

// ============================================================
// CARICAMENTO
// ============================================================

function loadServiceDashboard() {
    const today = todayStr();
    const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const fromEl = document.getElementById('serviceContattiFrom');
    const toEl = document.getElementById('serviceContattiTo');
    if (fromEl && !fromEl.value) fromEl.value = firstDay;
    if (toEl && !toEl.value) toEl.value = today;

    loadServicePratiche();
    loadServiceContatti();
    checkServiceRicambioDaGestire();
    checkServiceAppuntamentiDomani();
    checkServiceAppuntamentiDaGestire();
}

async function loadServicePratiche() {
    try {
        const res = await fetch('/api/service/pratiche');
        if (!res.ok) return;
        servicePratiche = await res.json();
        servicePratiche.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        populateServiceFilters();
        applyServiceFilters();
    } catch (err) {
        console.error('Errore caricamento pratiche service:', err);
    }
}

function populateServiceFilters() {
    if (typeof populateMultiSelectOptions !== 'function') return;
    const marche = [...new Set(servicePratiche.map(p => p.marca).filter(Boolean))].sort();
    if (document.getElementById('serviceMarcaFilterMulti-options')) populateMultiSelectOptions('serviceMarcaFilterMulti', marche);
    const operatori = [...new Set(servicePratiche.map(p => p.user?.fullName).filter(Boolean))].sort();
    if (document.getElementById('serviceOperatoreFilterMulti-options')) populateMultiSelectOptions('serviceOperatoreFilterMulti', operatori);
}

function serviceGestioneStatoOf(p) {
    return p.gestitoDa ? 'GESTITA' : 'DA_GESTIRE';
}

function applyServiceFilters() {
    const from = document.getElementById('servicePraticheFrom')?.value || '';
    const to = document.getElementById('servicePraticheTo')?.value || '';
    const statiSelezionati = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('serviceStatoFilterMulti') : [];
    const marcheSelezionate = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('serviceMarcaFilterMulti') : [];
    const operatoriSelezionati = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('serviceOperatoreFilterMulti') : [];
    const sede = document.getElementById('serviceSedeFilter')?.value || '';

    servicePraticheFiltered = servicePratiche.filter(p => {
        const dataCreazione = (p.createdAt || '').split('T')[0];
        if (from && dataCreazione && dataCreazione < from) return false;
        if (to && dataCreazione && dataCreazione > to) return false;
        if (statiSelezionati.length > 0 && !statiSelezionati.includes(p.stato)) return false;
        if (marcheSelezionate.length > 0 && !marcheSelezionate.includes(p.marca)) return false;
        if (operatoriSelezionati.length > 0 && !operatoriSelezionati.includes(p.user?.fullName)) return false;
        if (sede && p.sede !== sede) return false;
        return true;
    });

    renderServicePratiche(servicePraticheFiltered);
    renderServiceStats(servicePraticheFiltered);
    renderChartServiceStato(servicePraticheFiltered);
    renderServicePlanning(servicePratiche);
    renderChartServiceChiamateAppuntamenti();
    renderChartServiceLavorazioni(servicePraticheFiltered);
}

function showServiceResetBtn() {
    const btn = document.getElementById('serviceResetBtn');
    const from = document.getElementById('servicePraticheFrom')?.value;
    const to = document.getElementById('servicePraticheTo')?.value;
    if (btn) btn.style.display = (from || to) ? 'inline-block' : 'none';
}
function resetServiceDateFilters() {
    const fromEl = document.getElementById('servicePraticheFrom');
    const toEl = document.getElementById('servicePraticheTo');
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
    showServiceResetBtn();
    applyServiceFilters();
}

// ============================================================
// STATISTICHE
// ============================================================

function renderServiceStats(list) {
    const el = id => document.getElementById(id);
    if (el('serviceStatTotal')) el('serviceStatTotal').textContent = list.length;
    if (el('serviceStatInContatto')) el('serviceStatInContatto').textContent = list.filter(p => p.stato === 'IN_CONTATTO').length;
    if (el('serviceStatOrdine')) el('serviceStatOrdine').textContent = list.filter(p => p.stato === 'ORDINE_RICAMBIO').length;
    if (el('serviceStatAppuntamento')) el('serviceStatAppuntamento').textContent = list.filter(p => p.stato === 'APPUNTAMENTO').length;
    if (el('serviceStatProblematica')) el('serviceStatProblematica').textContent = list.filter(p => p.stato === 'PROBLEMATICA').length;
    if (el('serviceStatConclusa')) el('serviceStatConclusa').textContent = list.filter(p => p.stato === 'CONCLUSA').length;
    if (el('serviceStatDaGestire')) el('serviceStatDaGestire').textContent = list.filter(p => !p.gestitoDa).length;
    attachServiceStatClickHandlers();
}

function attachServiceStatClickHandlers() {
    const map = {
        serviceStatTotal: null,
        serviceStatInContatto: 'IN_CONTATTO',
        serviceStatOrdine: 'ORDINE_RICAMBIO',
        serviceStatAppuntamento: 'APPUNTAMENTO',
        serviceStatProblematica: 'PROBLEMATICA',
        serviceStatConclusa: 'CONCLUSA'
    };
    Object.entries(map).forEach(([elId, stato]) => {
        const valueEl = document.getElementById(elId);
        if (!valueEl) return;
        const card = valueEl.closest('.stat-card');
        if (!card) return;
        card.style.cursor = 'pointer';
        card.classList.add('stat-card-clickable');
        card.onclick = () => {
            const items = stato ? servicePraticheFiltered.filter(p => p.stato === stato) : servicePraticheFiltered;
            showServiceGenericDetail(stato ? SERVICE_STATO_LABELS[stato] : 'Tutte le Pratiche', items);
        };
    });
}

// ============================================================
// LISTA PRATICHE — lista semplice ordinata per data, raggruppata per giorno
// ============================================================

function renderServicePratiche(list) {
    const container = document.getElementById('servicePraticheList');
    if (!container) return;
    if (list.length === 0) {
        container.innerHTML = `<div class="empty-state"><h3>🔧</h3><p>Nessuna pratica registrata</p></div>`;
        return;
    }

    const byDay = {};
    list.forEach(p => {
        const date = (p.createdAt || '').split('T')[0];
        if (!byDay[date]) byDay[date] = [];
        byDay[date].push(p);
    });

    container.innerHTML = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0])).map(([date, items]) => `
        <div style="margin-bottom:18px">
            <div style="font-size:12px;font-weight:800;color:var(--accent-service, #4a90d9);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">📅 ${formatDateIT(date)} <span style="opacity:0.7;font-weight:600">(${items.length})</span></div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
                ${items.map(p => renderServicePraticaCard(p)).join('')}
            </div>
        </div>
    `).join('');
}

function renderServicePraticaCard(p) {
    const color = SERVICE_STATO_COLORS[p.stato] || '#8a8faa';
    const daGestire = !p.gestitoDa;
    const gestioneBadge = p.gestitoDa
        ? `<span style="font-size:10px;font-weight:800;padding:3px 8px;border-radius:10px;background:rgba(0,200,83,0.15);color:#00c853">✅ Gestita · ${p.gestitoDa.fullName}</span>`
        : `<span style="font-size:10px;font-weight:800;padding:3px 8px;border-radius:10px;background:rgba(255,152,0,0.15);color:#ff9800">🔔 Da Gestire</span>`;

    return `<div onclick="openServicePraticaModal(${p.id})" style="width:260px;cursor:pointer;background:var(--bg-card);border:1.5px solid ${daGestire ? '#ff9800' : 'var(--border)'};border-left:4px solid ${color};border-radius:10px;padding:12px;box-shadow:var(--shadow)">
        <div style="font-weight:800;color:var(--text-primary);font-size:13px">${p.nome} ${p.cognome}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;line-height:1.6">
            🚗 ${p.marca}${p.modello ? ' ' + p.modello : ''}<br>
            📞 ${p.cellulare}<br>
            ${p.tipologiaService ? `🔧 ${p.tipologiaService}<br>` : ''}
            ${p.sede ? `📍 ${p.sede}<br>` : ''}
            👤 ${p.user?.fullName || '—'}
        </div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <span style="font-size:10px;font-weight:800;padding:3px 8px;border-radius:10px;background:${color}22;color:${color}">${SERVICE_STATO_LABELS[p.stato] || p.stato}</span>
            ${p.dataAppuntamento ? `<span style="font-size:10px;font-weight:700;color:var(--text-secondary)">📅 ${formatDateTimeServiceShort(p.dataAppuntamento)}</span>` : ''}
            ${gestioneBadge}
        </div>
        ${p.stato === 'FALLITA' && p.noteFallimento ? `<div style="margin-top:8px;font-size:10px;color:#ff3d3d;background:rgba(255,61,61,0.08);padding:6px 8px;border-radius:6px">❌ ${p.noteFallimento}</div>` : ''}
    </div>`;
}

function formatDateTimeServiceShort(isoStr) {
    if (!isoStr) return '';
    const date = isoStr.split('T')[0];
    const time = (isoStr.split('T')[1] || '').substring(0, 5);
    return `${formatDateIT(date)} · ${time}`;
}

// ============================================================
// DETTAGLIO GENERICO
// ============================================================

function showServiceGenericDetail(title, items) {
    const modal = document.getElementById('serviceDetailModal');
    const titleEl = document.getElementById('serviceDetailTitle');
    const list = document.getElementById('serviceDetailList');
    if (!modal || !titleEl || !list) return;

    titleEl.textContent = `${title} (${items.length})`;
    if (items.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding:20px"><p>Nessuna pratica per questo filtro</p></div>';
    } else {
        list.innerHTML = items.map(p => {
            const color = SERVICE_STATO_COLORS[p.stato] || '#8a8faa';
            return `<div class="followup-card" style="margin-bottom:10px;cursor:pointer" onclick="closeServiceDetailModal();openServicePraticaModal(${p.id})">
                <div style="font-weight:800;color:var(--text-primary);font-size:14px">${p.nome} ${p.cognome}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">🚗 ${p.marca}${p.modello ? ' ' + p.modello : ''} · 📞 ${p.cellulare}</div>
                <div style="margin-top:6px"><span style="font-size:10px;font-weight:800;padding:3px 8px;border-radius:10px;background:${color}22;color:${color}">${SERVICE_STATO_LABELS[p.stato] || p.stato}</span></div>
            </div>`;
        }).join('');
    }
    modal.style.display = 'flex';
}
function closeServiceDetailModal(event) {
    if (event && event.target.id !== 'serviceDetailModal') return;
    const modal = document.getElementById('serviceDetailModal');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// MODAL NUOVA PRATICA
// ============================================================

function showNewServiceForm() {
    document.getElementById('serviceFormTitle').textContent = 'NUOVA PRATICA';
    document.getElementById('serviceEditId').value = '';
    document.getElementById('newServiceForm').style.display = 'block';
    document.getElementById('newServiceForm').scrollIntoView({ behavior: 'smooth' });
}
function hideNewServiceForm() {
    document.getElementById('newServiceForm').style.display = 'none';
    document.getElementById('serviceEditId').value = '';
    ['spNome','spCognome','spCellulare','spEmail','spMarcaInput','spMarca','spModello','spTarga','spNote'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    selectedServiceSede2 = '';
    selectedServiceTipologia = '';
    SERVICE_SEDI_LIST_PAGE.forEach(s => { const b = document.getElementById(`spSede-${s}`); if (b) b.classList.remove('btn-sede-active'); });
    const tipoKeyMap = { 'Tagliando':'Tagliando','Dispositivo satellitare':'DispositivoSatellitare','Prenotazione':'Prenotazione','Lavorazione in corso':'LavorazioneInCorso','Doctor Glass':'DoctorGlass','Cambio Gomme':'CambioGomme','Altro':'Altro' };
    Object.values(tipoKeyMap).forEach(k => { const b = document.getElementById(`spTipo-${k}`); if (b) b.classList.remove('btn-sede-active'); });
}
function selectSpSede(sede) {
    selectedServiceSede2 = sede;
    SERVICE_SEDI_LIST_PAGE.forEach(s => { const b = document.getElementById(`spSede-${s}`); if (b) b.classList.toggle('btn-sede-active', s === sede); });
}
function selectSpTipologia(tipo) {
    selectedServiceTipologia = tipo;
    const tipoKeyMap = { 'Tagliando':'Tagliando','Dispositivo satellitare':'DispositivoSatellitare','Prenotazione':'Prenotazione','Lavorazione in corso':'LavorazioneInCorso','Doctor Glass':'DoctorGlass','Cambio Gomme':'CambioGomme','Altro':'Altro' };
    Object.keys(tipoKeyMap).forEach(t => { const b = document.getElementById(`spTipo-${tipoKeyMap[t]}`); if (b) b.classList.toggle('btn-sede-active', t === tipo); });
}
function showSpMarcheDropdown() { filterSpMarche('', true); }
function filterSpMarche(query, showAll) {
    const dropdown = document.getElementById('spMarcaDropdown');
    if (!dropdown) return;
    const matches = (!query || query.trim() === '' || showAll) ? MARCHE_NORMALIZED : MARCHE_NORMALIZED.filter(m => m.normalized.includes(normalizeText(query.trim())));
    if (matches.length === 0) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(m => `
        <div onclick="selectSpMarca('${m.original}')" style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
            ${m.original}
        </div>`).join('');
    dropdown.style.display = 'block';
}
function selectSpMarca(marca) {
    document.getElementById('spMarcaInput').value = marca;
    document.getElementById('spMarca').value = marca;
    document.getElementById('spMarcaDropdown').style.display = 'none';
}
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('spMarcaDropdown');
    const input = document.getElementById('spMarcaInput');
    if (dropdown && input && !input.contains(e.target) && !dropdown.contains(e.target)) dropdown.style.display = 'none';
});

async function saveNewServicePratica() {
    const nome = document.getElementById('spNome').value.trim();
    const cognome = document.getElementById('spCognome').value.trim();
    const cellulare = document.getElementById('spCellulare').value.trim();
    const email = document.getElementById('spEmail').value.trim();
    const marca = document.getElementById('spMarca').value.trim();
    const modello = document.getElementById('spModello').value.trim();
    const targa = document.getElementById('spTarga').value.trim();
    const note = document.getElementById('spNote').value.trim();

    if (!nome) { alert('Il nome è obbligatorio'); return; }
    if (!cognome) { alert('Il cognome è obbligatorio'); return; }
    if (!cellulare) { alert('Il cellulare è obbligatorio'); return; }
    if (!marca) { alert('Seleziona la marca dal menù a tendina'); return; }

    const payload = {
        nome, cognome, cellulare,
        email: email || null,
        marca, modello: modello || null,
        targa: targa || null,
        sede: selectedServiceSede2 || null,
        tipologiaService: selectedServiceTipologia || null,
        note: note || null,
        stato: 'SOLO_INFO'
    };

    try {
        const res = await fetch('/api/service/pratiche', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error || 'Errore nel salvataggio'); return; }
        hideNewServiceForm();
        loadServicePratiche();
    } catch (err) {
        console.error('Errore creazione pratica service:', err);
    }
}

// ============================================================
// MODAL DETTAGLIO/GESTIONE PRATICA
// ============================================================

function openServicePraticaModal(id) {
    const p = servicePratiche.find(x => x.id === id);
    if (!p) return;
    spEditId = id;

    document.getElementById('spdNome').value = p.nome || '';
    document.getElementById('spdCognome').value = p.cognome || '';
    document.getElementById('spdCellulare').value = p.cellulare || '';
    document.getElementById('spdEmail').value = p.email || '';
    document.getElementById('spdMarca').value = p.marca || '';
    document.getElementById('spdModello').value = p.modello || '';
    document.getElementById('spdTarga').value = p.targa || '';
    document.getElementById('spdNote').value = p.note || '';
    document.getElementById('spdStato').value = p.stato || 'SOLO_INFO';
    document.getElementById('spdNoteFallimento').value = p.noteFallimento || '';
    document.getElementById('spdNoteConclusa').value = p.noteConclusa || '';
    document.getElementById('spdNoteProblematica').value = p.noteProblematica || '';

    if (p.dataOrdineRicambio) document.getElementById('spdDataOrdineRicambio').value = p.dataOrdineRicambio;
    if (p.dataAppuntamento) {
        document.getElementById('spdDataAppuntamento').value = p.dataAppuntamento.split('T')[0];
        document.getElementById('spdOraAppuntamento').value = (p.dataAppuntamento.split('T')[1] || '').substring(0, 5);
    }

    const opInfo = document.getElementById('spdOperatoreInfo');
    if (opInfo) opInfo.textContent = p.user?.fullName || '—';
    const createdInfo = document.getElementById('spdCreatedInfo');
    if (createdInfo) createdInfo.textContent = formatDateTimeServiceShort(p.createdAt);

    onSpdStatoChange();
    populateServiceGestioneSection(p);

    const modal = document.getElementById('servicePraticaModal');
    if (modal) modal.style.display = 'flex';
}

function populateServiceGestioneSection(p) {
    const statusEl = document.getElementById('spdGestioneStatus');
    const btnGestisci = document.getElementById('spdGestioneBtn');
    const btnAnnulla = document.getElementById('spdAnnullaGestioneBtn');
    if (statusEl) {
        if (p.gestitoDa) { statusEl.textContent = `✅ Gestita da ${p.gestitoDa.fullName}`; statusEl.style.color = '#00c853'; }
        else { statusEl.textContent = '🔔 Da gestire'; statusEl.style.color = '#ff9800'; }
    }
    const canManage = canManageServiceGestione();
    if (btnGestisci) btnGestisci.style.display = (canManage && !p.gestitoDa) ? 'inline-block' : 'none';
    if (btnAnnulla) btnAnnulla.style.display = (canManage && p.gestitoDa) ? 'inline-block' : 'none';
}

async function gestisciServicePratica(id) {
    const targetId = id || spEditId;
    if (!targetId || !canManageServiceGestione()) return;
    try {
        const res = await fetch(`/api/service/pratiche/${targetId}/gestisci`, { method: 'PATCH' });
        if (!res.ok) return;
        await loadServicePratiche();
        const p = servicePratiche.find(x => x.id === targetId);
        if (p) populateServiceGestioneSection(p);
    } catch (err) {
        console.error('Errore gestisci pratica service:', err);
    }
}
async function annullaGestioneServicePratica(id) {
    const targetId = id || spEditId;
    if (!targetId || !canManageServiceGestione()) return;
    if (!confirm('Rimuovere la gestione da questa pratica?')) return;
    try {
        const res = await fetch(`/api/service/pratiche/${targetId}/annulla-gestione`, { method: 'PATCH' });
        if (!res.ok) return;
        await loadServicePratiche();
        const p = servicePratiche.find(x => x.id === targetId);
        if (p) populateServiceGestioneSection(p);
    } catch (err) {
        console.error('Errore annulla gestione pratica service:', err);
    }
}

function closeServicePraticaModal(event) {
    if (event && event.target.id !== 'servicePraticaModal') return;
    const modal = document.getElementById('servicePraticaModal');
    if (modal) modal.style.display = 'none';
    spEditId = null;
}

// Mostra/nasconde i campi extra in base allo stato selezionato nel modal
function onSpdStatoChange() {
    const stato = document.getElementById('spdStato').value;
    const rowFallimento = document.getElementById('spdNoteFallimentoRow');
    const rowConclusa = document.getElementById('spdNoteConclusaRow');
    const rowProblematica = document.getElementById('spdNoteProblematicaRow');
    const rowOrdine = document.getElementById('spdOrdineRicambioRow');
    const rowAppuntamento = document.getElementById('spdAppuntamentoRow');
    if (rowFallimento) rowFallimento.style.display = stato === 'FALLITA' ? 'block' : 'none';
    if (rowConclusa) rowConclusa.style.display = stato === 'CONCLUSA' ? 'block' : 'none';
    if (rowProblematica) rowProblematica.style.display = stato === 'PROBLEMATICA' ? 'block' : 'none';
    if (rowOrdine) rowOrdine.style.display = stato === 'ORDINE_RICAMBIO' ? 'block' : 'none';
    if (rowAppuntamento) rowAppuntamento.style.display = stato === 'APPUNTAMENTO' ? 'block' : 'none';
}

async function saveServicePraticaDetail() {
    if (!spEditId) return;
    const nome = document.getElementById('spdNome').value.trim();
    const cognome = document.getElementById('spdCognome').value.trim();
    const cellulare = document.getElementById('spdCellulare').value.trim();
    const email = document.getElementById('spdEmail').value.trim();
    const marca = document.getElementById('spdMarca').value.trim();
    const modello = document.getElementById('spdModello').value.trim();
    const targa = document.getElementById('spdTarga').value.trim();
    const note = document.getElementById('spdNote').value.trim();
    const stato = document.getElementById('spdStato').value;
    const noteFallimento = document.getElementById('spdNoteFallimento').value.trim();
    const noteConclusa = document.getElementById('spdNoteConclusa').value.trim();
    const noteProblematica = document.getElementById('spdNoteProblematica').value.trim();
    const dataOrdineRicambio = document.getElementById('spdDataOrdineRicambio').value;
    const dataApp = document.getElementById('spdDataAppuntamento').value;
    const oraApp = document.getElementById('spdOraAppuntamento').value;

    if (!nome) { alert('Il nome è obbligatorio'); return; }
    if (!cognome) { alert('Il cognome è obbligatorio'); return; }
    if (!cellulare) { alert('Il cellulare è obbligatorio'); return; }
    if (!marca) { alert('La marca è obbligatoria'); return; }
    if (stato === 'APPUNTAMENTO' && (!dataApp || !oraApp)) { alert('Inserisci data e orario dell\'appuntamento'); return; }

    const payload = {
        nome, cognome, cellulare,
        email: email || null,
        marca, modello: modello || null,
        targa: targa || null,
        note: note || null,
        stato,
        noteFallimento: stato === 'FALLITA' ? (noteFallimento || null) : null,
        noteConclusa: stato === 'CONCLUSA' ? (noteConclusa || null) : null,
        noteProblematica: stato === 'PROBLEMATICA' ? (noteProblematica || null) : null
    };
    if (stato === 'ORDINE_RICAMBIO' && dataOrdineRicambio) payload.dataOrdineRicambio = dataOrdineRicambio;
    if (stato === 'APPUNTAMENTO' && dataApp && oraApp) payload.dataAppuntamento = `${dataApp}T${oraApp}:00`;

    try {
        const res = await fetch(`/api/service/pratiche/${spEditId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error || 'Errore nel salvataggio'); return; }
        closeServicePraticaModal();
        loadServicePratiche();
    } catch (err) {
        console.error('Errore salvataggio pratica service:', err);
    }
}

async function deleteServicePraticaFromModal() {
    if (!spEditId) return;
    if (!confirm('Eliminare questa pratica?')) return;
    try {
        await fetch(`/api/service/pratiche/${spEditId}`, { method: 'DELETE' });
        closeServicePraticaModal();
        loadServicePratiche();
    } catch (err) {
        console.error('Errore eliminazione pratica service:', err);
    }
}

// ============================================================
// PLANNING — prossimi appuntamenti e ordini ricambio in attesa
// ============================================================

function renderServicePlanning(list) {
    const apptContainer = document.getElementById('servicePlanningAppuntamenti');
    const ordiniContainer = document.getElementById('servicePlanningOrdini');
    if (apptContainer) {
        const appuntamenti = list
            .filter(p => p.stato === 'APPUNTAMENTO' && p.dataAppuntamento)
            .sort((a, b) => a.dataAppuntamento.localeCompare(b.dataAppuntamento));
        apptContainer.innerHTML = appuntamenti.length === 0
            ? `<div class="empty-state" style="padding:16px"><p>Nessun appuntamento in programma</p></div>`
            : appuntamenti.map(p => `
                <div class="followup-card" style="margin-bottom:8px;cursor:pointer" onclick="openServicePraticaModal(${p.id})">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <div>
                            <div style="font-weight:800;color:var(--text-primary);font-size:13px">${p.nome} ${p.cognome}</div>
                            <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">🚗 ${p.marca}${p.modello ? ' ' + p.modello : ''} · 📞 ${p.cellulare}</div>
                        </div>
                        <span style="font-size:11px;font-weight:800;color:#7c4dff">📅 ${formatDateTimeServiceShort(p.dataAppuntamento)}</span>
                    </div>
                </div>`).join('');
    }
    if (ordiniContainer) {
        const ordini = list
            .filter(p => p.stato === 'ORDINE_RICAMBIO' && p.dataOrdineRicambio)
            .sort((a, b) => (a.dataOrdineRicambio || '').localeCompare(b.dataOrdineRicambio || ''));
        ordiniContainer.innerHTML = ordini.length === 0
            ? `<div class="empty-state" style="padding:16px"><p>Nessun ordine ricambio in attesa</p></div>`
            : ordini.map(p => `
                <div class="followup-card" style="margin-bottom:8px;cursor:pointer" onclick="openServicePraticaModal(${p.id})">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <div>
                            <div style="font-weight:800;color:var(--text-primary);font-size:13px">${p.nome} ${p.cognome}</div>
                            <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">🚗 ${p.marca}${p.modello ? ' ' + p.modello : ''} · 📞 ${p.cellulare}</div>
                        </div>
                        <span style="font-size:11px;font-weight:800;color:#f0c040">📦 Ordinato: ${formatDateIT(p.dataOrdineRicambio)}</span>
                    </div>
                </div>`).join('');
    }
}

// ============================================================
// GRAFICI — distribuzione stato e performance marche
// (i due grafici "chiamate vs appuntamenti" e "lavorazioni concluse"
// arrivano nella Fase 5, insieme all'automazione dei popup)
// ============================================================

function renderChartServiceStato(list) {
    const ctx = document.getElementById('chartServiceStato2');
    if (!ctx) return;
    if (chartServiceStato) chartServiceStato.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const counts = {};
    SERVICE_STATO_LIST.forEach(s => counts[s] = 0);
    list.forEach(p => { if (counts[p.stato] !== undefined) counts[p.stato]++; });
    const total = list.length;
    const colors = SERVICE_STATO_LIST.map(s => SERVICE_STATO_COLORS[s]);
    const legendColor = getLegendColor();

    chartServiceStato = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: SERVICE_STATO_LIST.map(s => SERVICE_STATO_LABELS[s]),
            datasets: [{ data: SERVICE_STATO_LIST.map(s => counts[s]), backgroundColor: colors, borderWidth: 2, borderColor: isDark ? '#0d0f1a' : '#ffffff' }]
        },
        options: {
            // FIX: con maintainAspectRatio:true Chart.js ignora l'altezza del
            // contenitore CSS e calcola l'altezza da solo in base alla
            // larghezza, "esplodendo" ben oltre i 260px del wrapper e
            // allungando tutta la pagina. false fa sì che il canvas rispetti
            // davvero l'altezza fissata dal contenitore in index.html.
            responsive: true, maintainAspectRatio: false,
            onClick: (evt, elements) => { if (elements.length > 0) showServiceGenericDetail(SERVICE_STATO_LABELS[SERVICE_STATO_LIST[elements[0].index]], list.filter(p => p.stato === SERVICE_STATO_LIST[elements[0].index])); },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: {
                legend: { position: 'bottom', labels: { color: legendColor, font: { size: 10 }, padding: 8, boxWidth: 10,
                    generateLabels: chart => chart.data.labels.map((label, i) => {
                        const val = chart.data.datasets[0].data[i];
                        const pct = total > 0 ? Math.round(val * 1000 / total) / 10 : 0;
                        return { text: `${label}: ${val} (${pct}%)`, fillStyle: colors[i], strokeStyle: colors[i], fontColor: legendColor, lineWidth: 0, index: i };
                    })
                } }
            }
        }
    });
}

// ============================================================
// CONTATTI — sola lettura, dal Registro Contatti generale (categoria Service)
// Vista ad ALBERO navigabile Anno → Mese → Settimana → Giorno, stessa
// identica struttura/logica del Registro Contatti generale (non tendine di
// filtro sopra una tabella piatta) — pieghevole con toggleTree(), già
// definita globalmente in contact.js.
// ============================================================

let serviceContattiSortDir = 'desc';

function toggleServiceContattiSortDir() {
    serviceContattiSortDir = serviceContattiSortDir === 'desc' ? 'asc' : 'desc';
    const btn = document.getElementById('serviceContattiSortBtn2');
    if (btn) btn.textContent = serviceContattiSortDir === 'desc' ? '⬇️ Più recenti prima' : '⬆️ Meno recenti prima';
    renderServiceContattiRegistro(serviceContattiRegistro);
}

function sortServiceTreeEntries(entries) {
    return entries.sort((a, b) => {
        const cmp = a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0);
        return serviceContattiSortDir === 'desc' ? -cmp : cmp;
    });
}

async function loadServiceContatti() {
    try {
        const from = document.getElementById('serviceContattiFrom')?.value;
        const to = document.getElementById('serviceContattiTo')?.value;
        let url = '/api/service/contatti';
        if (from && to) url += `?from=${from}&to=${to}`;
        const res = await fetch(url);
        if (!res.ok) return;
        serviceContattiRegistro = await res.json();
        renderServiceContattiRegistro(serviceContattiRegistro);
        renderChartServiceChiamateAppuntamenti();
    } catch (err) {
        console.error('Errore caricamento contatti service:', err);
    }
}

function renderServiceContattiRow(c) {
    const time = c.contactDate.split('T')[1]?.substring(0, 5) || '';
    const nome = [c.clienteNome, c.clienteCognome].filter(Boolean).join(' ') || '—';

    const badgeStyle = (bg, color) => `font-size:11px;background:${bg};color:${color};padding:3px 10px;border-radius:8px;font-weight:700;white-space:nowrap;display:inline-block;margin-right:6px`;
    const badges = [];
    if (c.serviceTipo) badges.push(`<span style="${badgeStyle('rgba(58,90,140,0.18)', '#8fa8cc')}">🔧 ${c.serviceTipo}</span>`);
    if (c.serviceSede) badges.push(`<span style="${badgeStyle('rgba(30,58,95,0.2)', '#7a92b8')}">📍 ${c.serviceSede}</span>`);
    if (c.marca) badges.push(`<span style="${badgeStyle('rgba(58,90,140,0.12)', '#a8bede')}">🚗 ${c.marca}${c.modello ? ' ' + c.modello : ''}</span>`);
    if (c.serviceTarga) badges.push(`<span style="${badgeStyle('rgba(30,58,95,0.12)', '#6a86ae')}">🔖 ${c.serviceTarga}</span>`);
    if (c.serviceTipoCliente) badges.push(`<span style="${badgeStyle('rgba(58,90,140,0.15)', '#90a8cc')}">${c.serviceTipoCliente === 'CLIENTE' ? '👤 Cliente' : '❓ Non Cliente'}</span>`);

    return `<tr>
        <td style="font-weight:700;color:var(--text-primary);white-space:nowrap">${time}</td>
        <td style="font-size:12px;color:var(--text-primary);font-weight:700;white-space:nowrap">${nome}<br><span style="font-weight:400;color:var(--text-secondary)">📞 ${c.clienteNumero || '—'}</span></td>
        <td>${badges.join('')}</td>
        <td style="font-size:12px;color:var(--text-secondary)">${c.serviceNote || '—'}</td>
        <td style="font-size:12px;color:var(--text-secondary);white-space:nowrap">${c.user?.fullName || '—'}</td>
        <td><button class="btn-small btn-gold" onclick="generateServiceFromContatto(${c.id})" style="white-space:nowrap">➡️ Genera pratica</button></td>
    </tr>`;
}

function renderServiceDayTable(dayContacts) {
    const sorted = dayContacts.slice().sort((a, b) => serviceContattiSortDir === 'desc'
        ? (b.contactDate || '').localeCompare(a.contactDate || '')
        : (a.contactDate || '').localeCompare(b.contactDate || ''));
    return `<div class="contact-table-wrapper"><table class="contact-table rent-contatti-table">
        <thead><tr><th>Orario</th><th>Cliente</th><th>Dettagli</th><th>Nota</th><th>Operatore</th><th>Azioni</th></tr></thead>
        <tbody>${sorted.map(renderServiceContattiRow).join('')}</tbody>
    </table></div>`;
}

function renderServiceContattiRegistro(list) {
    const container = document.getElementById('serviceContattiRegistroList');
    if (!container) return;
    if (list.length === 0) {
        container.innerHTML = `<div class="empty-state"><h3>📋</h3><p>Nessun contatto Service nel periodo selezionato</p></div>`;
        return;
    }

    // Costruzione albero con chiavi ordinabili cronologicamente (stesso fix
    // già applicato al Registro Contatti generale — niente ordinamento
    // alfabetico sui nomi di mese/settimana).
    const tree = {};
    list.forEach(c => {
        const date = c.contactDate.split('T')[0];
        const d = parseLocalDate(date);
        const year = d.getFullYear().toString();
        const monthLabel = d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
        const monthKey = `${year}-${String(d.getMonth()).padStart(2, '0')}`;
        const weekLabel = getWeekKey(date);
        const weekMonday = getISOWeekMonday(date);
        const weekNumMatch = weekLabel.match(/Settimana (\d+)/);
        const weekNum = weekNumMatch ? parseInt(weekNumMatch[1], 10) : 0;
        const weekSortKey = `${weekMonday.getFullYear()}-${String(weekNum).padStart(2, '0')}`;

        if (!tree[year]) tree[year] = {};
        if (!tree[year][monthKey]) tree[year][monthKey] = { label: monthLabel, weeks: {} };
        if (!tree[year][monthKey].weeks[weekSortKey]) tree[year][monthKey].weeks[weekSortKey] = { label: weekLabel, days: {} };
        if (!tree[year][monthKey].weeks[weekSortKey].days[date]) tree[year][monthKey].weeks[weekSortKey].days[date] = [];
        tree[year][monthKey].weeks[weekSortKey].days[date].push(c);
    });

    const today = typeof todayStr === 'function' ? todayStr() : new Date().toISOString().split('T')[0];
    const todayMonday = getISOWeekMonday(today);

    container.innerHTML = sortServiceTreeEntries(Object.entries(tree)).map(([year, months]) => {
        const yearKey = `svc-year-${year}`;
        const yearCount = Object.values(months).flatMap(m => Object.values(m.weeks)).flatMap(w => Object.values(w.days)).flat().length;
        const isCurrentYear = year === new Date().getFullYear().toString();
        return `<div class="contact-tree-section">
            <div class="contact-tree-header contact-tree-year" onclick="toggleTree('${yearKey}')">
                <span>📁 ${year} <span class="tree-count">${yearCount} contatti</span></span>
                <span class="folder-arrow" id="arrow-${yearKey}">▼</span>
            </div>
            <div id="body-${yearKey}" style="display:${isCurrentYear ? 'block' : 'none'}">
                ${sortServiceTreeEntries(Object.entries(months)).map(([monthKey, monthData]) => {
                    const monthDomKey = `svc-month-${year}-${monthKey.replace(/\s/g,'_')}`;
                    const monthCount = Object.values(monthData.weeks).flatMap(w => Object.values(w.days)).flat().length;
                    const isCurrentMonth = monthKey === `${new Date().getFullYear()}-${String(new Date().getMonth()).padStart(2,'0')}`;
                    return `<div class="contact-tree-indent">
                        <div class="contact-tree-header contact-tree-month" onclick="toggleTree('${monthDomKey}')">
                            <span>📂 ${monthData.label} <span class="tree-count">${monthCount} contatti</span></span>
                            <span class="folder-arrow" id="arrow-${monthDomKey}">▼</span>
                        </div>
                        <div id="body-${monthDomKey}" style="display:${isCurrentMonth ? 'block' : 'none'}">
                            ${sortServiceTreeEntries(Object.entries(monthData.weeks)).map(([weekSortKey, weekData]) => {
                                const weekDomKey = `svc-week-${weekSortKey.replace(/[\s—]/g,'_')}`;
                                const weekCount = Object.values(weekData.days).flat().length;
                                const isCurrentWeek = weekSortKey === `${todayMonday.getFullYear()}-${String(parseInt((getWeekKey(today).match(/Settimana (\d+)/) || [0,0])[1],10)).padStart(2,'0')}`;
                                return `<div class="contact-tree-indent">
                                    <div class="contact-tree-header contact-tree-week" onclick="toggleTree('${weekDomKey}')">
                                        <span>🗓️ ${weekData.label} <span class="tree-count">${weekCount} contatti</span></span>
                                        <span class="folder-arrow" id="arrow-${weekDomKey}">▼</span>
                                    </div>
                                    <div id="body-${weekDomKey}" style="display:${isCurrentWeek ? 'block' : 'none'}">
                                        ${Object.entries(weekData.days).sort((a,b) => serviceContattiSortDir === 'desc' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])).map(([date, dayContacts]) => {
                                            const dayDomKey = `svc-day-${date}`;
                                            const isToday = date === today;
                                            return `
                                            <div class="contact-tree-indent" style="margin:6px 0">
                                                <div class="contact-tree-header" style="padding:8px 12px;font-size:11px;font-weight:800;color:var(--text-secondary);text-transform:capitalize" onclick="toggleTree('${dayDomKey}')">
                                                    <span>📅 ${formatDateIT(date)} <span class="tree-count">${dayContacts.length}</span></span>
                                                    <span class="folder-arrow" id="arrow-${dayDomKey}">▼</span>
                                                </div>
                                                <div id="body-${dayDomKey}" style="display:${isToday ? 'block' : 'none'}">
                                                    ${renderServiceDayTable(dayContacts)}
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
    }).join('');
}

// "Chiamate ricevute" = contatti Service registrati nel Registro Contatti
// generale nel periodo selezionato (serviceContattiRegistro). "Appuntamenti
// fissati" = pratiche che hanno avuto almeno una data di appuntamento
// impostata (anche se poi concluse/fallite/riprogrammate).
function renderChartServiceChiamateAppuntamenti() {
    const ctx = document.getElementById('chartServiceChiamateAppuntamenti');
    if (!ctx) return;
    if (chartServiceChiamateAppuntamenti) chartServiceChiamateAppuntamenti.destroy();

    const chiamate = serviceContattiRegistro.length;
    const appuntamenti = servicePratiche.filter(p => p.dataAppuntamento || p.esitoAppuntamento).length;
    const total = chiamate + appuntamenti;
    const legendColor = getLegendColor();
    const colors = ['#4a90d9', '#7c4dff'];

    chartServiceChiamateAppuntamenti = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Chiamate Ricevute', 'Appuntamenti Fissati'],
            datasets: [{ data: [chiamate, appuntamenti], backgroundColor: colors.map(c => c + 'aa'), borderColor: colors, borderWidth: 2, borderRadius: 8 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx2 => {
                    const val = ctx2.raw;
                    const pct = total > 0 ? Math.round(val * 1000 / total) / 10 : 0;
                    return ` Valore: ${val} — ${pct}% del totale`;
                } } }
            },
            scales: {
                x: { ticks: { color: legendColor, font: { size: 11, weight: '700' } }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: legendColor, precision: 0 } }
            }
        }
    });
}

// Tra le pratiche che hanno avuto un appuntamento, quante sono arrivate a
// Conclusa, quante Fallite, quante ancora in corso (in attesa di esito).
function renderChartServiceLavorazioni(list) {
    const ctx = document.getElementById('chartServiceLavorazioni');
    if (!ctx) return;
    if (chartServiceLavorazioni) chartServiceLavorazioni.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    const conApp = list.filter(p => p.dataAppuntamento || p.esitoAppuntamento);
    const concluse = conApp.filter(p => p.stato === 'CONCLUSA').length;
    const fallite = conApp.filter(p => p.stato === 'FALLITA').length;
    const inCorso = conApp.length - concluse - fallite;
    const total = conApp.length;
    const legendColor = getLegendColor();
    const colors = ['#00c853', '#ff3d3d', '#f0c040'];

    chartServiceLavorazioni = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Concluse', 'Fallite', 'In corso'],
            datasets: [{ data: [concluse, fallite, inCorso], backgroundColor: colors, borderWidth: 2, borderColor: isDark ? '#0d0f1a' : '#ffffff' }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: legendColor, font: { size: 11 }, padding: 10, boxWidth: 12,
                    generateLabels: chart => chart.data.labels.map((label, i) => {
                        const val = chart.data.datasets[0].data[i];
                        const pct = total > 0 ? Math.round(val * 1000 / total) / 10 : 0;
                        return { text: `${label}: ${val} (${pct}%)`, fillStyle: colors[i], strokeStyle: colors[i], fontColor: legendColor, lineWidth: 0, index: i };
                    })
                } }
            }
        }
    });
}

function refreshServiceChartsOnThemeChange() {
    renderChartServiceStato(servicePraticheFiltered);
    renderChartServiceChiamateAppuntamenti();
    renderChartServiceLavorazioni(servicePraticheFiltered);
}

// ============================================================
// EXPORT EXCEL
// ============================================================

function exportServiceExcel() {
    const from = document.getElementById('servicePraticheFrom')?.value || '';
    const to = document.getElementById('servicePraticheTo')?.value || '';
    const statiSelezionati = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('serviceStatoFilterMulti') : [];
    const marcheSelezionate = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('serviceMarcaFilterMulti') : [];
    const operatoriSelezionati = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('serviceOperatoreFilterMulti') : [];
    const sede = document.getElementById('serviceSedeFilter')?.value || '';

    let url = '/api/service/pratiche/export-excel?';
    if (from) url += `from=${encodeURIComponent(from)}&`;
    if (to) url += `to=${encodeURIComponent(to)}&`;
    if (statiSelezionati.length > 0) url += `stato=${encodeURIComponent(statiSelezionati.join(','))}&`;
    if (marcheSelezionate.length > 0) url += `marca=${encodeURIComponent(marcheSelezionate.join(','))}&`;
    if (operatoriSelezionati.length > 0) url += `operatore=${encodeURIComponent(operatoriSelezionati.join(','))}&`;
    if (sede) url += `sede=${encodeURIComponent(sede)}&`;
    downloadFile(url);
}

// Pre-compila il form "Nuova Pratica" a partire da un contatto Service già
// registrato nel Registro Contatti generale — stesso pattern di
// generateTrattativaFromContatto in Rent.
function generateServiceFromContatto(id) {
    const c = serviceContattiRegistro.find(x => x.id === id);
    if (!c) return;

    showNewServiceForm();

    document.getElementById('spNome').value = c.clienteNome || '';
    document.getElementById('spCognome').value = c.clienteCognome || '';
    document.getElementById('spCellulare').value = c.clienteNumero || '';
    if (c.marca) selectSpMarca(c.marca);
    document.getElementById('spModello').value = c.modello || '';
    document.getElementById('spTarga').value = c.serviceTarga || '';
    document.getElementById('spNote').value = c.serviceNote
        ? `${c.serviceNote} (da contatto registrato il ${formatDateIT(c.contactDate.split('T')[0])} da ${c.user?.fullName || '—'})`
        : `Generata da contatto Service registrato il ${formatDateIT(c.contactDate.split('T')[0])} da ${c.user?.fullName || '—'}`;

    if (c.serviceSede) selectSpSede(c.serviceSede);
    if (c.serviceTipo) selectSpTipologia(c.serviceTipo);

    if (!c.clienteNumero) {
        setTimeout(() => alert('Ricordati di inserire il cellulare: è obbligatorio per salvare la pratica.'), 300);
    }
}

// ============================================================
// RICERCA CLIENTE
// ============================================================

function searchServicePratiche(query) {
    const resultsWrapper = document.getElementById('serviceSearchResults');
    const resultsList = document.getElementById('serviceSearchResultsList');
    if (!resultsWrapper || !resultsList) return;
    const q = query.trim();
    if (!q) { resultsWrapper.style.display = 'none'; return; }

    const qLower = q.toLowerCase();
    const matches = servicePratiche.filter(p => {
        const nome = (p.nome || '').toLowerCase();
        const cognome = (p.cognome || '').toLowerCase();
        const cellulare = (p.cellulare || '').toLowerCase();
        return nome.includes(qLower) || cognome.includes(qLower) || cellulare.includes(qLower);
    }).slice(0, 50);

    if (matches.length === 0) {
        resultsList.innerHTML = `<div class="empty-state" style="padding:20px"><p>Nessuna pratica trovata</p></div>`;
    } else {
        resultsList.innerHTML = matches.map(p => {
            const color = SERVICE_STATO_COLORS[p.stato] || '#8a8faa';
            return `<div class="followup-card" style="margin-bottom:8px;cursor:pointer" onclick="closeServiceSearch();openServicePraticaModal(${p.id})">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <div style="font-weight:800;color:var(--text-primary);font-size:14px">${p.nome} ${p.cognome}</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
                            📞 ${p.cellulare || '—'} · 🚗 ${p.marca}${p.modello ? ' ' + p.modello : ''}
                            · <span style="font-weight:700;color:${color}">${SERVICE_STATO_LABELS[p.stato] || p.stato}</span>
                        </div>
                    </div>
                    <span style="color:#f0c040;font-size:16px">→</span>
                </div>
            </div>`;
        }).join('');
    }
    resultsWrapper.style.display = 'block';
}
function closeServiceSearch() {
    const resultsWrapper = document.getElementById('serviceSearchResults');
    const input = document.getElementById('serviceSearchInput');
    if (resultsWrapper) resultsWrapper.style.display = 'none';
    if (input) input.value = '';
}

// ============================================================
// FASE 4 — POPUP 1: "È arrivato il ricambio?"
// ============================================================

async function checkServiceRicambioDaGestire() {
    if (serviceRicambioAlertShown) return;
    try {
        const res = await fetch('/api/service/pratiche/ricambio-da-gestire');
        if (!res.ok) return;
        const items = await res.json();
        if (items.length === 0) return;
        serviceRicambioAlertShown = true;

        const list = document.getElementById('serviceRicambioList');
        const modal = document.getElementById('serviceRicambioModal');
        if (!list || !modal) return;

        list.innerHTML = items.map(p => `
            <div class="followup-card" style="margin-bottom:10px">
                <div style="font-weight:800;color:var(--text-primary);font-size:14px">${p.nome} ${p.cognome}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">🚗 ${p.marca}${p.modello ? ' ' + p.modello : ''} · 📞 ${p.cellulare}</div>
                <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-top:8px">
                    Ricambio ordinato in data: <strong>${formatDateIT(p.dataOrdineRicambio)}</strong>. Il ricambio è arrivato?
                </div>
                <div class="form-actions" style="margin-top:10px">
                    <button class="btn-gold" onclick="rispondiRicambioArrivato(${p.id}, true)">✅ Sì, arrivato</button>
                    <button class="btn-secondary" onclick="rispondiRicambioArrivato(${p.id}, false)">⏳ Rimanda</button>
                </div>
            </div>`).join('');

        modal.style.display = 'flex';
    } catch (err) {
        console.error('Errore controllo ricambi da gestire:', err);
    }
}

async function rispondiRicambioArrivato(id, arrivato) {
    try {
        const res = await fetch(`/api/service/pratiche/${id}/ricambio-risposta`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ arrivato })
        });
        if (!res.ok) return;
        await loadServicePratiche();
        // Rimuove la card gestita dalla lista ancora aperta nel modal, senza richiudere tutto
        checkServiceRicambioDaGestire_refreshList();
        if (arrivato) {
            alert('Ricambio segnato come arrivato. Apri la pratica per fissare l\'appuntamento di ritiro (cambia stato in "Appuntamento").');
        }
    } catch (err) {
        console.error('Errore risposta ricambio:', err);
    }
}
// Ricarica il contenuto del modal "ricambio da gestire" senza far ripartire
// il flag di sessione (altrimenti, avendolo già mostrato, non si aggiornerebbe più).
async function checkServiceRicambioDaGestire_refreshList() {
    try {
        const res = await fetch('/api/service/pratiche/ricambio-da-gestire');
        if (!res.ok) return;
        const items = await res.json();
        const modal = document.getElementById('serviceRicambioModal');
        if (items.length === 0) { if (modal) modal.style.display = 'none'; return; }
        const list = document.getElementById('serviceRicambioList');
        if (list) {
            list.innerHTML = items.map(p => `
                <div class="followup-card" style="margin-bottom:10px">
                    <div style="font-weight:800;color:var(--text-primary);font-size:14px">${p.nome} ${p.cognome}</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">🚗 ${p.marca}${p.modello ? ' ' + p.modello : ''} · 📞 ${p.cellulare}</div>
                    <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-top:8px">
                        Ricambio ordinato in data: <strong>${formatDateIT(p.dataOrdineRicambio)}</strong>. Il ricambio è arrivato?
                    </div>
                    <div class="form-actions" style="margin-top:10px">
                        <button class="btn-gold" onclick="rispondiRicambioArrivato(${p.id}, true)">✅ Sì, arrivato</button>
                        <button class="btn-secondary" onclick="rispondiRicambioArrivato(${p.id}, false)">⏳ Rimanda</button>
                    </div>
                </div>`).join('');
        }
    } catch (err) {
        console.error('Errore refresh ricambi da gestire:', err);
    }
}
function closeServiceRicambioModal(event) {
    if (event && event.target.id !== 'serviceRicambioModal') return;
    const modal = document.getElementById('serviceRicambioModal');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// FASE 4 — POPUP 2a: promemoria appuntamenti di domani
// ============================================================

async function checkServiceAppuntamentiDomani() {
    if (serviceAppuntamentiDomaniShown) return;
    try {
        const res = await fetch('/api/service/pratiche/appuntamenti-domani');
        if (!res.ok) return;
        const items = await res.json();
        if (items.length === 0) return;
        serviceAppuntamentiDomaniShown = true;

        const list = document.getElementById('serviceAppuntamentiDomaniList');
        const modal = document.getElementById('serviceAppuntamentiDomaniModal');
        if (!list || !modal) return;

        list.innerHTML = items.map(p => {
            const motivazione = [p.tipologiaService, p.note].filter(Boolean).join(' — ') || 'Appuntamento service';
            return `<div class="followup-card" style="margin-bottom:10px;cursor:pointer" onclick="closeServiceAppuntamentiDomaniModal();openServicePraticaModal(${p.id})">
                <div style="font-weight:800;color:var(--text-primary);font-size:14px">📅 ${p.nome} ${p.cognome}</div>
                <div style="font-size:13px;color:var(--text-primary);margin-top:6px">
                    Ha una prenotazione per domani per: <strong>${motivazione}</strong>
                </div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">🕐 ${formatDateTimeServiceShort(p.dataAppuntamento)} · 🚗 ${p.marca}${p.modello ? ' ' + p.modello : ''} · 📞 ${p.cellulare}</div>
            </div>`;
        }).join('');

        modal.style.display = 'flex';
    } catch (err) {
        console.error('Errore controllo appuntamenti di domani:', err);
    }
}
function closeServiceAppuntamentiDomaniModal(event) {
    if (event && event.target.id !== 'serviceAppuntamentiDomaniModal') return;
    const modal = document.getElementById('serviceAppuntamentiDomaniModal');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// FASE 4 — POPUP 2b: esito appuntamenti con orario passato
// ============================================================

async function checkServiceAppuntamentiDaGestire() {
    try {
        const res = await fetch('/api/service/pratiche/appuntamenti-da-gestire');
        if (!res.ok) return;
        const items = await res.json();
        const modal = document.getElementById('serviceAppuntamentiDaGestireModal');
        if (items.length === 0) { if (modal) modal.style.display = 'none'; return; }
        renderServiceAppuntamentiDaGestireList(items);
        if (modal) modal.style.display = 'flex';
    } catch (err) {
        console.error('Errore controllo esito appuntamenti:', err);
    }
}

function renderServiceAppuntamentiDaGestireList(items) {
    const list = document.getElementById('serviceAppuntamentiDaGestireList');
    if (!list) return;
    list.innerHTML = items.map(p => `
        <div class="followup-card" style="margin-bottom:10px" id="app-esito-card-${p.id}">
            <div style="font-weight:800;color:var(--text-primary);font-size:14px">${p.nome} ${p.cognome}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">🚗 ${p.marca}${p.modello ? ' ' + p.modello : ''} · 📞 ${p.cellulare} · 🕐 ${formatDateTimeServiceShort(p.dataAppuntamento)}</div>
            <div id="app-esito-step1-${p.id}">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-top:8px">Il cliente si è presentato all'appuntamento?</div>
                <div class="form-actions" style="margin-top:10px;flex-wrap:wrap">
                    <button class="btn-gold" onclick="rispondiEsitoAppuntamento(${p.id}, 'VENUTO')">✅ Sì, venuto</button>
                    <button class="btn-secondary" onclick="rispondiEsitoAppuntamento(${p.id}, 'DISDETTO')">📵 Ha disdetto</button>
                    <button class="btn-secondary" onclick="rispondiEsitoAppuntamento(${p.id}, 'NON_PRESENTATO')">⭕ Non presentato</button>
                </div>
            </div>
            <div id="app-esito-step2-${p.id}" style="display:none;margin-top:10px;border-top:1px solid var(--border);padding-top:10px">
                <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:8px">Vuoi richiamarlo per un nuovo appuntamento o segnare la pratica come fallita?</div>
                <div style="display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap">
                    <input type="date" id="app-nuova-data-${p.id}" class="input-field" style="margin-bottom:0;width:auto">
                    <input type="time" id="app-nuova-ora-${p.id}" class="input-field" style="margin-bottom:0;width:auto">
                    <button class="btn-gold" onclick="richiamaNuovoAppuntamento(${p.id})">🔄 Nuovo Appuntamento</button>
                </div>
                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                    <input type="text" id="app-note-fallimento-${p.id}" placeholder="Motivazione (opzionale)" class="input-field" style="margin-bottom:0;flex:1;min-width:200px">
                    <button class="btn-secondary" style="color:#ff3d3d;border-color:#ff3d3d" onclick="fallisciAppuntamento(${p.id})">❌ Segna come Fallita</button>
                </div>
            </div>
        </div>`).join('');
}

async function rispondiEsitoAppuntamento(id, esito) {
    if (esito === 'VENUTO') {
        try {
            const res = await fetch(`/api/service/pratiche/${id}/appuntamento-esito`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ esito })
            });
            if (!res.ok) return;
            await loadServicePratiche();
            const card = document.getElementById(`app-esito-card-${id}`);
            if (card) card.remove();
            const remaining = document.querySelectorAll('#serviceAppuntamentiDaGestireList [id^="app-esito-card-"]');
            if (remaining.length === 0) closeServiceAppuntamentiDaGestireModal();
        } catch (err) {
            console.error('Errore esito appuntamento:', err);
        }
        return;
    }
    // DISDETTO / NON_PRESENTATO: registra l'esito e mostra lo step 2 (nuovo appuntamento o fallita)
    try {
        const res = await fetch(`/api/service/pratiche/${id}/appuntamento-esito`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ esito })
        });
        if (!res.ok) return;
        const step1 = document.getElementById(`app-esito-step1-${id}`);
        const step2 = document.getElementById(`app-esito-step2-${id}`);
        if (step1) step1.style.display = 'none';
        if (step2) step2.style.display = 'block';
    } catch (err) {
        console.error('Errore esito appuntamento:', err);
    }
}

async function richiamaNuovoAppuntamento(id) {
    const data = document.getElementById(`app-nuova-data-${id}`)?.value;
    const ora = document.getElementById(`app-nuova-ora-${id}`)?.value;
    if (!data || !ora) { alert('Inserisci data e orario del nuovo appuntamento'); return; }
    try {
        const res = await fetch(`/api/service/pratiche/${id}/nuovo-appuntamento`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data, ora })
        });
        if (!res.ok) return;
        await loadServicePratiche();
        const card = document.getElementById(`app-esito-card-${id}`);
        if (card) card.remove();
        const remaining = document.querySelectorAll('#serviceAppuntamentiDaGestireList [id^="app-esito-card-"]');
        if (remaining.length === 0) closeServiceAppuntamentiDaGestireModal();
    } catch (err) {
        console.error('Errore nuovo appuntamento:', err);
    }
}

async function fallisciAppuntamento(id) {
    const noteFallimento = document.getElementById(`app-note-fallimento-${id}`)?.value.trim() || '';
    try {
        const res = await fetch(`/api/service/pratiche/${id}/fallisci-da-appuntamento`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ noteFallimento: noteFallimento || null })
        });
        if (!res.ok) return;
        await loadServicePratiche();
        const card = document.getElementById(`app-esito-card-${id}`);
        if (card) card.remove();
        const remaining = document.querySelectorAll('#serviceAppuntamentiDaGestireList [id^="app-esito-card-"]');
        if (remaining.length === 0) closeServiceAppuntamentiDaGestireModal();
    } catch (err) {
        console.error('Errore fallimento appuntamento:', err);
    }
}

function closeServiceAppuntamentiDaGestireModal(event) {
    if (event && event.target.id !== 'serviceAppuntamentiDaGestireModal') return;
    const modal = document.getElementById('serviceAppuntamentiDaGestireModal');
    if (modal) modal.style.display = 'none';
}
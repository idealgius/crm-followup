// ===== VETTURE IN CONSEGNA =====

const VEICOLI_LAVORAZIONI = [
    { tipo: 'TAGLIANDO', label: 'Tagliando' },
    { tipo: 'LOJACK', label: 'Lojack' },
    { tipo: 'BLOCKSHAFT', label: 'Blockshaft' },
    { tipo: 'POLIZZA_FIR', label: 'Polizza FIR' },
    { tipo: 'IMMATRICOLAZIONE', label: 'Immatricolazione' },
    { tipo: 'IMMATRICOLAZIONE_ESTERA', label: 'Immatricolazione Estera' },
    { tipo: 'PASSAGGIO', label: 'Passaggio', opzioni: ['24', '36', '48', '60'], opzioniLabel: 'Mesi' },
    { tipo: 'SOSTITUZIONE_PNEUMATICI', label: 'Sostituzione Pneumatici' },
    { tipo: 'BULLONI_ANTIFURTO', label: 'Bulloni Antifurto', opzioni: ['OMAGGIO', 'PAGATI'], opzioniLabel: 'Tipo' },
    { tipo: 'METASYSTEM', label: 'Metasystem' },
    { tipo: 'RETROCAMERA_POSTERIORE', label: 'Retrocamera posteriore' },
    { tipo: 'LAVORAZIONE_CARROZZERIA', label: 'Lavorazione Carrozzeria', note: true },
    { tipo: 'LAVAGGIO', label: 'Lavaggio' },
    { tipo: 'ALTRA_LAVORAZIONE', label: 'Altra lavorazione', note: true }
];
const VEICOLI_LAVORAZIONI_LABEL = Object.fromEntries(VEICOLI_LAVORAZIONI.map(l => [l.tipo, l.label]));

const VEICOLI_STATI = [
    { tipo: 'RICHIESTA_PRATICA_FINANZIAMENTO', label: 'Richiesta pratica finanziamento', metodi: ['FINANZIAMENTO_ANTICIPO', 'FINANZIAMENTO_MAXIRATA', 'FINANZIAMENTO_ANTICIPO_MAXIRATA'] },
    { tipo: 'RICHIESTA_PRATICA_LEASING', label: 'Richiesta pratica leasing', metodi: ['LEASING'] },
    { tipo: 'ATTESA_SALDO', label: 'Attesa saldo' },
    { tipo: 'PRATICA_FINANZIAMENTO_AVVIATA', label: 'Pratica finanziamento avviata', metodi: ['FINANZIAMENTO_ANTICIPO', 'FINANZIAMENTO_MAXIRATA', 'FINANZIAMENTO_ANTICIPO_MAXIRATA'] },
    { tipo: 'PRATICA_LEASING_AVVIATA', label: 'Pratica leasing avviata', metodi: ['LEASING'] },
    { tipo: 'IN_ATTESA_LAVORAZIONE', label: 'In attesa lavorazione' },
    { tipo: 'IN_LAVORAZIONE', label: 'In lavorazione' },
    { tipo: 'PERMESSINO_PRONTO', label: 'Permessino pronto' },
    { tipo: 'LIBRETTO_PRONTO', label: 'Libretto pronto' },
    { tipo: 'LIBRETTO_IN_SEDE', label: 'Libretto in sede' },
    { tipo: 'TARGHE_IN_SEDE', label: 'Targhe in sede' },
    { tipo: 'PRONTA_PER_CONSEGNA', label: 'Pronta per la consegna' },
    { tipo: 'APPUNTAMENTO_CONSEGNA_FISSATO', label: 'Appuntamento di consegna fissato' }
];
const VEICOLI_STATI_LABEL = Object.fromEntries(VEICOLI_STATI.map(s => [s.tipo, s.label]));

const VEICOLI_FINANZIARIE = ['COMPASS', 'DEUTSCHE_BANK', 'CA_BANK', 'SANTANDER', 'AGOS', 'STELLANTIS', 'MOBILIZE_RENAULT', 'MOBILIZE_DACIA', 'FIN_FIAT'];
const VEICOLI_FINANZIARIE_LABEL = { COMPASS: 'Compass', DEUTSCHE_BANK: 'Deutsche Bank', CA_BANK: 'CA Bank', SANTANDER: 'Santander', AGOS: 'Agos', STELLANTIS: 'Stellantis', MOBILIZE_RENAULT: 'Mobilize Renault', MOBILIZE_DACIA: 'Mobilize Dacia', FIN_FIAT: 'Fin Fiat' };
const VEICOLI_FINANZIARIE_LEASING = ['SANTANDER_LEASING', 'CA_BANK_LEASING'];
const VEICOLI_FINANZIARIE_LEASING_LABEL = { SANTANDER_LEASING: 'Santander Leasing', CA_BANK_LEASING: 'CA Bank Leasing' };
const VEICOLI_SEDE_LABEL = { AGNANO: 'Agnano', CASAMARCIANO: 'Casamarciano', SALERNO: 'Salerno', CONSEGNA_CLIENTE: 'Consegna presso cliente', ALTRO: 'Altro' };
const VEICOLI_METODO_LABEL = { UNICA_SOLUZIONE: 'Unica soluzione', FINANZIAMENTO_ANTICIPO: 'Finanziamento con Anticipo', FINANZIAMENTO_MAXIRATA: 'Finanziamento con Maxi Rata', FINANZIAMENTO_ANTICIPO_MAXIRATA: 'Finanziamento con Anticipo e Maxi Rata', LEASING: 'Pratica Leasing' };

let veicoliCurrentTab = 'IN_CORSO';
let veicoliSelectedSedi = new Set(); // vuoto = tutte
let veicoliCache = [];
let veicoliEditId = null;
let veicoliCalendarioMese = new Date();

function canWriteVeicolo(v) {
    if (typeof canWrite !== 'function') return false;
    const isAdminOwned = v && v.user && v.user.role === 'ADMIN';
    return isAdminOwned ? canWriteAdminOwned('VEICOLI') : canWrite('VEICOLI');
}

// ===== TAB =====
function switchVeicoliTab(tab) {
    veicoliCurrentTab = tab;
    ['IN_CORSO', 'CONSEGNATA', 'ANNULLATA', 'CALENDARIO'].forEach(t => {
        document.getElementById(`veicoliTab${t}Btn`)?.classList.toggle('btn-sede-active', t === tab);
    });
    document.getElementById('veicoliPeriodoFilterWrapper').style.display = (tab === 'CONSEGNATA') ? 'block' : 'none';
    document.getElementById('veicoliSedeFilterWrapper').style.display = (tab === 'CALENDARIO') ? 'none' : 'block';
    document.getElementById('veicoliSearchWrapper').style.display = (tab === 'CALENDARIO') ? 'none' : 'block';
    document.getElementById('veicoliListContainer').style.display = (tab === 'CALENDARIO') ? 'none' : 'block';
    document.getElementById('veicoliCalendarioContainer').style.display = (tab === 'CALENDARIO') ? 'block' : 'none';
    hideNewVeicoloForm();
    loadVeicoliDashboard();
}

function toggleVeicoliSede(sede) {
    if (sede === 'TUTTE') {
        veicoliSelectedSedi.clear();
    } else {
        if (veicoliSelectedSedi.has(sede)) veicoliSelectedSedi.delete(sede);
        else veicoliSelectedSedi.add(sede);
    }
    ['TUTTE', 'AGNANO', 'CASAMARCIANO', 'SALERNO'].forEach(s => {
        const active = s === 'TUTTE' ? veicoliSelectedSedi.size === 0 : veicoliSelectedSedi.has(s);
        document.getElementById(`veicoliSedeBtn-${s}`)?.classList.toggle('btn-sede-active', active);
    });
    loadVeicoliDashboard();
}

function onVeicoliPeriodoModoChange() {
    const modo = document.getElementById('veicoliPeriodoModo').value;
    document.getElementById('veicoliPeriodoMese').style.display = modo === 'MESE' ? 'inline-block' : 'none';
    document.getElementById('veicoliPeriodoAnno').style.display = modo === 'ANNO' ? 'inline-block' : 'none';
    loadVeicoliDashboard();
}

// ===== CARICAMENTO =====
async function loadVeicoliDashboard() {
    if (veicoliCurrentTab === 'CALENDARIO') { renderVeicoliCalendario(); return; }

    const q = document.getElementById('veicoliSearchInput')?.value?.trim();
    if (q) {
        try {
            const res = await fetch(`/api/veicoli/search?q=${encodeURIComponent(q)}`);
            if (res.ok) {
                const all = await res.json();
                veicoliCache = all.filter(v => v.statoPratica === veicoliCurrentTab);
                renderVeicoliList(veicoliCache);
            }
        } catch (err) { console.error('Errore ricerca veicoli:', err); }
        return;
    }

    const params = new URLSearchParams();
    params.set('stato', veicoliCurrentTab);
    if (veicoliSelectedSedi.size > 0) params.set('sedi', Array.from(veicoliSelectedSedi).join(','));

    if (veicoliCurrentTab === 'CONSEGNATA') {
        const modo = document.getElementById('veicoliPeriodoModo')?.value || 'MESE';
        if (modo === 'MESE') {
            const mese = document.getElementById('veicoliPeriodoMese')?.value;
            if (mese) { params.set('from', mese); params.set('to', mese); }
        } else {
            const anno = document.getElementById('veicoliPeriodoAnno')?.value;
            if (anno) { params.set('from', anno); params.set('to', anno); }
        }
    }

    try {
        const res = await fetch(`/api/veicoli?${params.toString()}`);
        if (!res.ok) { veicoliCache = []; renderVeicoliList([]); return; }
        veicoliCache = await res.json();
        renderVeicoliList(veicoliCache);
    } catch (err) {
        console.error('Errore caricamento veicoli:', err);
    }
}

// ===== RENDER LISTA =====
function renderVeicoliList(list) {
    const container = document.getElementById('veicoliListContainer');
    if (!list || list.length === 0) {
        container.innerHTML = `<div class="empty-state"><h3>🚙</h3><p>Nessuna scheda in questa sezione</p></div>`;
        return;
    }
    container.innerHTML = list.map(v => renderVeicoloCard(v)).join('');
}

function renderVeicoloCard(v) {
    const canWriteThis = canWriteVeicolo(v);
    const statoColor = v.statoPratica === 'CONSEGNATA' ? '#00c853' : v.statoPratica === 'ANNULLATA' ? '#ff3d3d' : '#4a90d9';

    const lavorazioniHtml = v.lavorazioni.map(l => `
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;padding:4px 0;${l.completata ? 'opacity:0.6;text-decoration:line-through' : ''}">
            <input type="checkbox" ${l.completata ? 'checked' : ''} ${canWriteThis ? '' : 'disabled'}
                onchange="toggleVeicoloLavorazione(${v.id}, ${l.id}, this.checked)">
            ${VEICOLI_LAVORAZIONI_LABEL[l.tipo] || l.tipo}${l.dettaglio ? ' (' + l.dettaglio + (l.tipo === 'PASSAGGIO' ? ' mesi' : '') + ')' : ''}
            ${l.note ? `<span style="color:var(--text-secondary)">— ${l.note}</span>` : ''}
        </label>`).join('');

    const statiOptions = VEICOLI_STATI
        .filter(s => !s.metodi || s.metodi.includes(v.metodoPagamento))
        .map(s => `<option value="${s.tipo}">${s.label}</option>`).join('');

    const statiLogHtml = v.statiLog.map(s => `
        <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;background:rgba(74,144,217,0.12);color:#4a90d9;padding:3px 8px;border-radius:12px;margin:2px 4px 2px 0">
            ${VEICOLI_STATI_LABEL[s.tipo] || s.tipo} · ${formatDateIt(s.data)}
            ${canWriteThis ? `<span style="cursor:pointer" onclick="removeVeicoloStato(${v.id}, ${s.id})">✕</span>` : ''}
        </span>`).join('');

    let permutaHtml = '';
    if (v.tipoPermutaRottamazione !== 'NESSUNA') {
        permutaHtml = `<div style="font-size:12px;color:var(--text-secondary);margin-top:6px">🔁 ${v.tipoPermutaRottamazione === 'PERMUTA' ? 'Permuta' : 'Rottamazione'}: ${v.marchioPermuta || ''} ${v.modelloPermuta || ''} ${v.valorePermuta ? '· € ' + v.valorePermuta : ''}</div>`;
    }

    let pagamentoHtml = `${VEICOLI_METODO_LABEL[v.metodoPagamento] || v.metodoPagamento}`;
    if (v.metodoPagamento === 'UNICA_SOLUZIONE' && v.anticipoPresente) pagamentoHtml += ` · Anticipo € ${v.importoAnticipo || 0}`;
    if (v.finanziaria) {
        const label = v.metodoPagamento === 'LEASING' ? VEICOLI_FINANZIARIE_LEASING_LABEL[v.finanziaria] : VEICOLI_FINANZIARIE_LABEL[v.finanziaria];
        pagamentoHtml += ` · ${label || v.finanziaria}`;
    }

    return `
    <div class="waiting-card" style="flex-direction:column;align-items:stretch;margin-bottom:16px" id="veicoloCard-${v.id}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
            <div>
                <div class="waiting-name">${v.targa} — ${v.marchio} ${v.modello}</div>
                <div class="waiting-details" style="margin-top:4px">👤 ${v.intestatario}${v.numeroCliente ? ' · 📱 ' + v.numeroCliente : ''}${v.consulenteRiferimento ? ' · 🧑‍💼 ' + v.consulenteRiferimento : ''}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">📍 Consegna: ${VEICOLI_SEDE_LABEL[v.sedeConsegna]} · Ubicazione iniziale: ${VEICOLI_SEDE_LABEL[v.ubicazioneIniziale]}${v.ubicazioneAltroNote ? ' (' + v.ubicazioneAltroNote + ')' : ''}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">💳 ${pagamentoHtml}</div>
                ${permutaHtml}
            </div>
            <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:${statoColor}22;color:${statoColor};white-space:nowrap">${v.statoPratica}</span>
        </div>

        <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px">
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:4px">LAVORAZIONI</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">${lavorazioniHtml || '<span style="font-size:12px;color:var(--text-secondary)">Nessuna</span>'}</div>
        </div>

        <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px">
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">STATO PRATICA</div>
            <div style="margin-bottom:8px">${statiLogHtml || '<span style="font-size:12px;color:var(--text-secondary)">Nessuno stato attivo</span>'}</div>
            ${canWriteThis && v.statoPratica === 'IN_CORSO' ? `
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                <select id="veicoloStatoSelect-${v.id}" class="input-dark" style="padding:6px;font-size:12px">${statiOptions}</select>
                <input type="date" id="veicoloStatoData-${v.id}" class="input-dark" style="padding:6px;font-size:12px" value="${new Date().toISOString().split('T')[0]}">
                <button class="btn-small btn-blue" onclick="addVeicoloStato(${v.id})">+ Aggiungi stato</button>
            </div>` : ''}
        </div>

        ${v.statoPratica === 'IN_CORSO' ? `
        <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px">
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">APPUNTAMENTO DI CONSEGNA</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                <input type="date" id="veicoloAppData-${v.id}" class="input-dark" style="padding:6px;font-size:12px" value="${v.dataAppuntamentoConsegna || ''}" ${canWriteThis ? '' : 'disabled'}>
                <input type="time" id="veicoloAppOra-${v.id}" class="input-dark" style="padding:6px;font-size:12px" value="${v.oraAppuntamentoConsegna || ''}" ${canWriteThis ? '' : 'disabled'}>
                ${canWriteThis ? `<button class="btn-small btn-blue" onclick="saveVeicoloAppuntamento(${v.id})">Salva appuntamento</button>` : ''}
            </div>
        </div>` : v.statoPratica === 'CONSEGNATA' ? `
        <div style="margin-top:10px;font-size:12px;color:var(--text-secondary)">✅ Consegnata il ${formatDateTimeIt(v.dataConsegnaEffettiva)}</div>
        ` : `
        <div style="margin-top:10px;font-size:12px;color:#ff3d3d">🚫 Annullata il ${formatDateTimeIt(v.dataAnnullamento)}${v.motivoAnnullamento ? ' — ' + v.motivoAnnullamento : ''}</div>
        `}

        ${canWriteThis ? `
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn-small btn-orange" onclick="editVeicolo(${v.id})">✏️ Modifica</button>
            ${v.statoPratica === 'IN_CORSO' ? `
                <button class="btn-small btn-green" onclick="consegnaVeicolo(${v.id})">✅ Consegnata</button>
                <button class="btn-small btn-red" onclick="annullaVeicolo(${v.id})">🚫 Annulla pratica</button>
            ` : ''}
            <button class="btn-small btn-red" onclick="deleteVeicolo(${v.id})">🗑️ Elimina</button>
        </div>` : ''}
    </div>`;
}

function formatDateIt(d) { if (!d) return ''; const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; }
function formatDateTimeIt(dt) { if (!dt) return ''; const d = new Date(dt); return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); }

// ===== AZIONI CARD =====
async function toggleVeicoloLavorazione(veicoloId, lavorazioneId, completata) {
    try {
        const res = await fetch(`/api/veicoli/${veicoloId}/lavorazioni/${lavorazioneId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completata })
        });
        if (!res.ok) { const d = await res.json().catch(() => null); alert(d?.error || 'Non autorizzato'); }
        loadVeicoliDashboard();
    } catch (err) { console.error('Errore toggle lavorazione:', err); }
}

async function addVeicoloStato(veicoloId) {
    const tipo = document.getElementById(`veicoloStatoSelect-${veicoloId}`).value;
    const data = document.getElementById(`veicoloStatoData-${veicoloId}`).value;
    try {
        const res = await fetch(`/api/veicoli/${veicoloId}/stati`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, data })
        });
        if (!res.ok) { const d = await res.json().catch(() => null); alert(d?.error || 'Non autorizzato'); return; }
        loadVeicoliDashboard();
    } catch (err) { console.error('Errore aggiunta stato:', err); }
}

async function removeVeicoloStato(veicoloId, statoId) {
    try {
        const res = await fetch(`/api/veicoli/${veicoloId}/stati/${statoId}`, { method: 'DELETE' });
        if (!res.ok) { const d = await res.json().catch(() => null); alert(d?.error || 'Non autorizzato'); return; }
        loadVeicoliDashboard();
    } catch (err) { console.error('Errore rimozione stato:', err); }
}

async function saveVeicoloAppuntamento(veicoloId) {
    const dataAppuntamentoConsegna = document.getElementById(`veicoloAppData-${veicoloId}`).value || null;
    const oraAppuntamentoConsegna = document.getElementById(`veicoloAppOra-${veicoloId}`).value || null;
    try {
        const res = await fetch(`/api/veicoli/${veicoloId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataAppuntamentoConsegna, oraAppuntamentoConsegna })
        });
        if (!res.ok) { const d = await res.json().catch(() => null); alert(d?.error || 'Non autorizzato'); return; }
        loadVeicoliDashboard();
    } catch (err) { console.error('Errore salvataggio appuntamento:', err); }
}

async function consegnaVeicolo(id) {
    const v = veicoliCache.find(x => x.id === id);
    if (!canWriteVeicolo(v)) { alert('Non hai i permessi per questa azione.'); return; }
    if (!confirm('Segnare questo veicolo come consegnato?')) return;
    try {
        const res = await fetch(`/api/veicoli/${id}/consegna`, { method: 'PATCH' });
        if (!res.ok) { const d = await res.json().catch(() => null); alert(d?.error || 'Non autorizzato'); return; }
        loadVeicoliDashboard();
    } catch (err) { console.error('Errore consegna veicolo:', err); }
}

async function annullaVeicolo(id) {
    const v = veicoliCache.find(x => x.id === id);
    if (!canWriteVeicolo(v)) { alert('Non hai i permessi per questa azione.'); return; }
    const motivo = prompt('Motivo dell\'annullamento (opzionale):') || '';
    if (!confirm('Annullare questa pratica?')) return;
    try {
        const res = await fetch(`/api/veicoli/${id}/annulla`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo })
        });
        if (!res.ok) { const d = await res.json().catch(() => null); alert(d?.error || 'Non autorizzato'); return; }
        loadVeicoliDashboard();
    } catch (err) { console.error('Errore annullamento veicolo:', err); }
}

async function deleteVeicolo(id) {
    const v = veicoliCache.find(x => x.id === id);
    if (!canWriteVeicolo(v)) { alert('Non hai i permessi per questa azione.'); return; }
    if (!confirm('Eliminare definitivamente questa scheda?')) return;
    try {
        const res = await fetch(`/api/veicoli/${id}`, { method: 'DELETE' });
        if (!res.ok) { const d = await res.json().catch(() => null); alert(d?.error || 'Non autorizzato'); return; }
        loadVeicoliDashboard();
    } catch (err) { console.error('Errore eliminazione veicolo:', err); }
}

// ===== FORM NUOVA / MODIFICA SCHEDA =====
function renderVeicoliLavorazioniCheckboxes(selezionate) {
    selezionate = selezionate || [];
    const container = document.getElementById('vLavorazioniContainer');
    container.innerHTML = VEICOLI_LAVORAZIONI.map(l => {
        const existing = selezionate.find(s => s.tipo === l.tipo);
        const checked = !!existing;
        let extra = '';
        if (l.opzioni) {
            extra = `<select id="vLav-${l.tipo}-dettaglio" class="input-dark" style="padding:4px;font-size:11px;margin-left:8px;display:${checked ? 'inline-block' : 'none'}">
                ${l.opzioni.map(o => `<option value="${o}" ${existing && existing.dettaglio === o ? 'selected' : ''}>${o}${l.tipo === 'PASSAGGIO' ? ' mesi' : ''}</option>`).join('')}
            </select>`;
        }
        if (l.note) {
            extra = `<input type="text" id="vLav-${l.tipo}-note" class="input-field" placeholder="Note..." style="margin-top:4px;display:${checked ? 'block' : 'none'}" value="${existing && existing.note ? existing.note.replace(/"/g, '&quot;') : ''}">`;
        }
        return `<div>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px">
                <input type="checkbox" id="vLav-${l.tipo}" ${checked ? 'checked' : ''} onchange="onVeicoloLavorazioneToggle('${l.tipo}')">
                ${l.label}${l.opzioni ? extra : ''}
            </label>
            ${l.note ? extra : ''}
        </div>`;
    }).join('');
}
function onVeicoloLavorazioneToggle(tipo) {
    const checked = document.getElementById(`vLav-${tipo}`).checked;
    const dettaglioEl = document.getElementById(`vLav-${tipo}-dettaglio`);
    const noteEl = document.getElementById(`vLav-${tipo}-note`);
    if (dettaglioEl) dettaglioEl.style.display = checked ? 'inline-block' : 'none';
    if (noteEl) noteEl.style.display = checked ? 'block' : 'none';
}

function onVeicoloPermutaChange() {
    const tipo = document.getElementById('vTipoPermuta').value;
    const show = tipo !== 'NESSUNA';
    ['vPermutaMarchioWrap', 'vPermutaModelloWrap', 'vPermutaValoreWrap'].forEach(id => {
        document.getElementById(id).style.display = show ? 'block' : 'none';
    });
}
function onVeicoloUbicazioneChange() {
    document.getElementById('vUbicazioneAltroWrap').style.display = document.getElementById('vUbicazioneIniziale').value === 'ALTRO' ? 'block' : 'none';
}
function onVeicoloMetodoPagamentoChange() {
    const metodo = document.getElementById('vMetodoPagamento').value;
    const isUnica = metodo === 'UNICA_SOLUZIONE';
    const isLeasing = metodo === 'LEASING';
    const isFinanziamento = metodo.startsWith('FINANZIAMENTO_');
    document.getElementById('vAnticipoPresenteWrap').style.display = isUnica ? 'block' : 'none';
    document.getElementById('vFinanziariaWrap').style.display = (isFinanziamento || isLeasing) ? 'block' : 'none';
    if (!isUnica) document.getElementById('vImportoAnticipoWrap').style.display = 'none';
    else onVeicoloAnticipoChange();

    const sel = document.getElementById('vFinanziaria');
    if (isLeasing) {
        sel.innerHTML = VEICOLI_FINANZIARIE_LEASING.map(f => `<option value="${f}">${VEICOLI_FINANZIARIE_LEASING_LABEL[f]}</option>`).join('');
    } else if (isFinanziamento) {
        sel.innerHTML = VEICOLI_FINANZIARIE.map(f => `<option value="${f}">${VEICOLI_FINANZIARIE_LABEL[f]}</option>`).join('');
    }
}
function onVeicoloAnticipoChange() {
    const presente = document.getElementById('vAnticipoPresente').value === 'true';
    document.getElementById('vImportoAnticipoWrap').style.display = presente ? 'block' : 'none';
}

function showNewVeicoloForm() {
    if (typeof canWrite === 'function' && !canWrite('VEICOLI')) { alert('Non hai i permessi per creare una scheda.'); return; }
    veicoliEditId = null;
    document.getElementById('veicoloFormTitle').textContent = 'NUOVA SCHEDA';
    document.getElementById('veicoloEditId').value = '';
    ['vTarga', 'vMarchio', 'vModello', 'vIntestatario', 'vNumeroCliente', 'vConsulente', 'vPermutaMarchio', 'vPermutaModello', 'vPermutaValore', 'vImportoAnticipo', 'vUbicazioneAltroNote']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('vTipoPermuta').value = 'NESSUNA';
    document.getElementById('vSedeConsegna').value = 'AGNANO';
    document.getElementById('vUbicazioneIniziale').value = 'AGNANO';
    document.getElementById('vMetodoPagamento').value = 'UNICA_SOLUZIONE';
    document.getElementById('vAnticipoPresente').value = 'false';
    renderVeicoliLavorazioniCheckboxes([]);
    onVeicoloPermutaChange();
    onVeicoloUbicazioneChange();
    onVeicoloMetodoPagamentoChange();
    document.getElementById('newVeicoloForm').style.display = 'flex';
    document.getElementById('newVeicoloForm').scrollIntoView({ behavior: 'smooth' });
}
function hideNewVeicoloForm() {
    document.getElementById('newVeicoloForm').style.display = 'none';
}

function editVeicolo(id) {
    const v = veicoliCache.find(x => x.id === id);
    if (!v) return;
    if (!canWriteVeicolo(v)) { alert('Non hai i permessi per modificare questa scheda.'); return; }
    veicoliEditId = id;
    document.getElementById('veicoloFormTitle').textContent = 'MODIFICA SCHEDA';
    document.getElementById('veicoloEditId').value = id;
    document.getElementById('vTarga').value = v.targa;
    document.getElementById('vMarchio').value = v.marchio;
    document.getElementById('vModello').value = v.modello;
    document.getElementById('vIntestatario').value = v.intestatario;
    document.getElementById('vNumeroCliente').value = v.numeroCliente || '';
    document.getElementById('vConsulente').value = v.consulenteRiferimento || '';
    document.getElementById('vTipoPermuta').value = v.tipoPermutaRottamazione;
    document.getElementById('vPermutaMarchio').value = v.marchioPermuta || '';
    document.getElementById('vPermutaModello').value = v.modelloPermuta || '';
    document.getElementById('vPermutaValore').value = v.valorePermuta || '';
    document.getElementById('vSedeConsegna').value = v.sedeConsegna;
    document.getElementById('vUbicazioneIniziale').value = v.ubicazioneIniziale;
    document.getElementById('vUbicazioneAltroNote').value = v.ubicazioneAltroNote || '';
    document.getElementById('vMetodoPagamento').value = v.metodoPagamento;
    document.getElementById('vAnticipoPresente').value = v.anticipoPresente ? 'true' : 'false';
    document.getElementById('vImportoAnticipo').value = v.importoAnticipo || '';
    renderVeicoliLavorazioniCheckboxes(v.lavorazioni);
    onVeicoloPermutaChange();
    onVeicoloUbicazioneChange();
    onVeicoloMetodoPagamentoChange();
    if (v.finanziaria) document.getElementById('vFinanziaria').value = v.finanziaria;
    document.getElementById('newVeicoloForm').style.display = 'flex';
    document.getElementById('newVeicoloForm').scrollIntoView({ behavior: 'smooth' });
}

async function saveVeicolo() {
    const targa = document.getElementById('vTarga').value.trim();
    const marchio = document.getElementById('vMarchio').value.trim();
    const modello = document.getElementById('vModello').value.trim();
    const intestatario = document.getElementById('vIntestatario').value.trim();
    if (!targa || !marchio || !modello || !intestatario) { alert('Targa, marchio, modello e intestatario sono obbligatori'); return; }

    const metodoPagamento = document.getElementById('vMetodoPagamento').value;
    const payload = {
        targa, marchio, modello, intestatario,
        numeroCliente: document.getElementById('vNumeroCliente').value.trim(),
        consulenteRiferimento: document.getElementById('vConsulente').value.trim(),
        tipoPermutaRottamazione: document.getElementById('vTipoPermuta').value,
        marchioPermuta: document.getElementById('vPermutaMarchio').value.trim(),
        modelloPermuta: document.getElementById('vPermutaModello').value.trim(),
        valorePermuta: document.getElementById('vPermutaValore').value || null,
        sedeConsegna: document.getElementById('vSedeConsegna').value,
        ubicazioneIniziale: document.getElementById('vUbicazioneIniziale').value,
        ubicazioneAltroNote: document.getElementById('vUbicazioneAltroNote').value.trim(),
        metodoPagamento,
        anticipoPresente: document.getElementById('vAnticipoPresente').value === 'true',
        importoAnticipo: document.getElementById('vImportoAnticipo').value || null,
        finanziaria: document.getElementById('vFinanziariaWrap').style.display !== 'none' ? document.getElementById('vFinanziaria').value : null
    };

    if (!veicoliEditId) {
        payload.lavorazioni = VEICOLI_LAVORAZIONI
            .filter(l => document.getElementById(`vLav-${l.tipo}`).checked)
            .map(l => ({
                tipo: l.tipo,
                dettaglio: l.opzioni ? document.getElementById(`vLav-${l.tipo}-dettaglio`).value : null,
                note: l.note ? document.getElementById(`vLav-${l.tipo}-note`).value.trim() : null
            }));
    }

    try {
        const url = veicoliEditId ? `/api/veicoli/${veicoliEditId}` : '/api/veicoli';
        const method = veicoliEditId ? 'PATCH' : 'POST';
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) { const d = await res.json().catch(() => null); alert(d?.error || 'Errore nel salvataggio'); return; }
        hideNewVeicoloForm();
        loadVeicoliDashboard();
    } catch (err) { console.error('Errore salvataggio veicolo:', err); }
}

// ===== CALENDARIO CONSEGNE =====
function renderVeicoliCalendario() {
    const container = document.getElementById('veicoliCalendarioContainer');
    const anno = veicoliCalendarioMese.getFullYear();
    const mese = veicoliCalendarioMese.getMonth();
    const primoGiorno = new Date(anno, mese, 1);
    const ultimoGiorno = new Date(anno, mese + 1, 0);
    const from = primoGiorno.toISOString().split('T')[0];
    const to = ultimoGiorno.toISOString().split('T')[0];
    const meseLabel = primoGiorno.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

    container.innerHTML = `<div class="empty-state"><p>Caricamento calendario…</p></div>`;

    fetch(`/api/veicoli/calendario?from=${from}&to=${to}`).then(res => res.ok ? res.json() : []).then(appuntamenti => {
        const perGiorno = {};
        appuntamenti.forEach(a => {
            if (!a.dataAppuntamentoConsegna) return;
            (perGiorno[a.dataAppuntamentoConsegna] = perGiorno[a.dataAppuntamentoConsegna] || []).push(a);
        });

        const primoGiornoSettimana = (primoGiorno.getDay() + 6) % 7; // lunedì = 0
        let celle = '';
        for (let i = 0; i < primoGiornoSettimana; i++) celle += `<div></div>`;
        for (let d = 1; d <= ultimoGiorno.getDate(); d++) {
            const dataStr = `${anno}-${String(mese + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const appsGiorno = perGiorno[dataStr] || [];
            celle += `<div style="min-height:70px;border:1px solid var(--border);border-radius:8px;padding:6px;font-size:12px;${appsGiorno.length ? 'background:rgba(74,144,217,0.08)' : ''}">
                <div style="font-weight:700;margin-bottom:4px">${d}</div>
                ${appsGiorno.map(a => `<div style="font-size:11px;color:#4a90d9;cursor:pointer" onclick="showVeicoloDaCalendario(${a.id})" title="${a.targa} - ${a.intestatario}">🚙 ${a.oraAppuntamentoConsegna || ''} ${a.targa}</div>`).join('')}
            </div>`;
        }

        container.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <button class="btn-small btn-blue" onclick="cambiaMeseVeicoliCalendario(-1)">◀ Mese prec.</button>
                <h3 style="margin:0;text-transform:capitalize">${meseLabel}</h3>
                <button class="btn-small btn-blue" onclick="cambiaMeseVeicoliCalendario(1)">Mese succ. ▶</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:6px;font-size:11px;font-weight:700;color:var(--text-secondary);text-align:center">
                <div>LUN</div><div>MAR</div><div>MER</div><div>GIO</div><div>VEN</div><div>SAB</div><div>DOM</div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">${celle}</div>
        `;
    }).catch(err => {
        console.error('Errore caricamento calendario:', err);
        container.innerHTML = `<div class="empty-state"><p>Errore nel caricamento del calendario</p></div>`;
    });
}
function cambiaMeseVeicoliCalendario(delta) {
    veicoliCalendarioMese = new Date(veicoliCalendarioMese.getFullYear(), veicoliCalendarioMese.getMonth() + delta, 1);
    renderVeicoliCalendario();
}
function showVeicoloDaCalendario(id) {
    switchVeicoliTab('IN_CORSO');
    setTimeout(() => {
        const card = document.getElementById(`veicoloCard-${id}`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
}
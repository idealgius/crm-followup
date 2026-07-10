let contactLogs = [];
let contactLogsFiltered = [];
let contactCalendarYear = new Date().getFullYear();
let contactCalendarMonth = new Date().getMonth() + 1;
let selectedSede = '';
let selectedAcquisto = '';
let selectedFonte = '';
let selectedService = '';
let selectedServiceSede = '';
let selectedNoleggioTipo = '';
let selectedNoleggioRichiesta = '';
let selectedServiceTipoCliente = '';
let contactChartByOperator = null;
let contactChartSede = null;
let contactChartAcquisto = null;
let contactChartFonte = null;
let contactChartServiceAgnano = null;
let contactChartServiceSalerno = null;
let contactChartNoleggioTipo = null;
let contactChartNoleggioLead = null;
let contactPromoCharts = {};
let contactSortDir = 'desc';
let lastDetailItems = [];
let lastDetailTitle = '';
let detailOnlyNominativo = false;
let dayViewSecondaryFilter = '';
let editingContactId = null;

const CATEGORY_COLORS = {
    'Info Vendita': '#1a4080', 'Info Noleggio': '#00c853', 'Service': '#f0c040',
    'Info Acquisto effettuato': '#4a90d9', 'Pratica Leasing': '#7c4dff',
    'Pratica Finanziamento': '#ff9800', 'Amministrazione': '#00bcd4',
    'Info + Appuntamento': '#e91e63', 'Info Vendita in Promo': '#f0c040',
    'Altro': '#8a8faa'
};

const ALL_CATEGORIES = [
    'Info Vendita', 'Info Noleggio', 'Service', 'Info Acquisto effettuato',
    'Pratica Leasing', 'Pratica Finanziamento', 'Amministrazione',
    'Info + Appuntamento', 'Info Vendita in Promo', 'Altro'
];

const ACQUISTO_LIST = ['Info Consegna', 'Ritardo Consegna', 'Info Documentazione', 'Seconda chiave', 'Info generiche'];
const ACQUISTO_COLORS = ['#4a90d9', '#ff3d3d', '#00bcd4', '#f0c040', '#7c4dff'];
const FONTE_LIST = ['Sito', 'Google ADS', 'Autoscout', 'Facebook', 'Instagram', 'TikTok', 'Richiesta cliente', 'Non ricorda'];
const FONTE_COLORS = ['#1a4080', '#f0c040', '#e91e63', '#4a90d9', '#7c4dff', '#ff3d3d', '#00c853', '#8a8faa'];
const SERVICE_LIST = ['Tagliando', 'Dispositivo satellitare', 'Prenotazione', 'Lavorazione in corso', 'Doctor Glass', 'Cambio Gomme', 'Altro'];
const SERVICE_COLORS = ['#f0c040', '#4a90d9', '#00c853', '#7c4dff', '#ff9800', '#00bcd4', '#8a8faa'];
const SERVICE_SEDI_LIST = ['Agnano', 'Salerno'];
const SEDI_LIST = ['Agnano', 'Casamarciano', 'Salerno'];
const SEDE_COLORS = ['#e91e63', '#1a4080', '#00c853'];
const NOLEGGIO_TIPO_LIST = ['Privato', 'Partita IVA', 'Noleggio per aziende'];
const NOLEGGIO_RICHIESTA_LABELS = { 'SOLO_INFO': 'Solo Info', 'RICHIESTA_CLIENTE': 'Richiesta Cliente' };

const MARCHE_LIST = [
    'ALFA ROMEO', 'AUDI', 'BMW', 'BYD', 'CITROEN', 'CUPRA', 'DACIA', 'DR', 'DS',
    'EVO', 'FIAT', 'FORD', 'FERRARI', 'HYUNDAI', 'ICH-X', 'INFINITI',
    'IVECO', 'JEEP', 'KIA', 'LAMBORGHINI', 'LANCIA', 'LAND ROVER', 'LEAPMOTOR', 'MAXUS',
    'MAZDA', 'MERCEDES-BENZ', 'MG', 'MINI', 'MASERATI', 'MITSUBISHI', 'NISSAN',
    'OPEL', 'PEUGEOT', 'PORSCHE', 'RENAULT', 'SAAB', 'SEAT', 'SKODA', 'SMART',
    'SPORTEQUIPE', 'SUZUKI', 'SWM', 'TIGER', 'TOYOTA', 'VOLKSWAGEN'
];

const MARCHE_NORMALIZED = MARCHE_LIST.map(m => ({
    original: m,
    normalized: m.toLowerCase()
        .replace(/ë/g,'e').replace(/é/g,'e').replace(/è/g,'e')
        .replace(/ä/g,'a').replace(/ü/g,'u').replace(/ö/g,'o')
        .replace(/š/g,'s').replace(/č/g,'c').replace(/ž/g,'z')
}));

const MONTH_NAMES_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const DAY_NAMES_SHORT = ['Lun','Mar','Mer','Gio','Ven','Sab'];
const OPERATOR_COLORS = ['#1a4080','#00c853','#f0c040','#e91e63','#7c4dff','#ff9800','#00bcd4','#ff3d3d','#4a90d9','#8a8faa'];

function parseLocalDate(dateStr) {
    const [y,m,d] = dateStr.split('-').map(Number);
    return new Date(y, m-1, d);
}

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getLegendColor() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? '#333333' : '#c0c4d0';
}

function normalizeText(str) {
    return str.toLowerCase()
        .replace(/ë/g,'e').replace(/é/g,'e').replace(/è/g,'e')
        .replace(/ä/g,'a').replace(/ü/g,'u').replace(/ö/g,'o')
        .replace(/š/g,'s').replace(/č/g,'c').replace(/ž/g,'z');
}

// ===== FALLBACK NOMINATIVO/NUMERO — recupera dati salvati con versioni precedenti del form =====
function clienteNomeCompleto(log) {
    if (log.clienteNome || log.clienteCognome) {
        return [log.clienteNome, log.clienteCognome].filter(Boolean).join(' ');
    }
    if (log.serviceNomeCliente || log.serviceCognomeCliente) {
        return [log.serviceNomeCliente, log.serviceCognomeCliente].filter(Boolean).join(' ');
    }
    if (log.noleggioNomeCliente || log.noleggioCognomeCliente) {
        return [log.noleggioNomeCliente, log.noleggioCognomeCliente].filter(Boolean).join(' ');
    }
    if (log.nominativoAppuntamento) {
        return log.nominativoAppuntamento;
    }
    if (log.nonComunicaNominativo) return 'Nominativo non comunicato';
    return 'Nominativo non specificato';
}

function clienteNumeroDisplay(log) {
    return log.clienteNumero || log.noleggioCellulare || log.serviceNumeroTelefono || '—';
}

function downloadFile(url) {
    window.location.href = url;
}

// ===== AUTOCOMPLETE MARCA — Blocco generico (Info Vendita/Appuntamento/Promo) =====

function showMarcheDropdown() { filterMarche('', true); }

function filterMarche(query, showAll) {
    const dropdown = document.getElementById('marcaDropdown');
    if (!dropdown) return;
    const matches = (!query || query.trim() === '' || showAll)
        ? MARCHE_NORMALIZED
        : MARCHE_NORMALIZED.filter(m => m.normalized.includes(normalizeText(query.trim())));
    if (matches.length === 0) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(m => `
        <div onclick="selectMarca('${m.original}')"
             style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)"
             onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
            ${m.original}
        </div>`).join('');
    dropdown.style.display = 'block';
}

function selectMarca(marca) {
    document.getElementById('contactMarcaInput').value = marca;
    document.getElementById('contactMarca').value = marca;
    document.getElementById('marcaDropdown').style.display = 'none';
}

// ===== AUTOCOMPLETE MARCA — Blocco dedicato Info Noleggio =====

function showNoleggioMarcheDropdown() { filterNoleggioMarche('', true); }

function filterNoleggioMarche(query, showAll) {
    const dropdown = document.getElementById('noleggioMarcaDropdown');
    if (!dropdown) return;
    const matches = (!query || query.trim() === '' || showAll)
        ? MARCHE_NORMALIZED
        : MARCHE_NORMALIZED.filter(m => m.normalized.includes(normalizeText(query.trim())));
    if (matches.length === 0) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(m => `
        <div onclick="selectNoleggioMarca('${m.original}')"
             style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)"
             onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
            ${m.original}
        </div>`).join('');
    dropdown.style.display = 'block';
}

function selectNoleggioMarca(marca) {
    document.getElementById('contactNoleggioMarcaInput').value = marca;
    document.getElementById('contactNoleggioMarca').value = marca;
    document.getElementById('noleggioMarcaDropdown').style.display = 'none';
}

function showPromoModelliDropdown() {
    const promoAttiva = typeof promoAttive !== 'undefined' && promoAttive.length > 0 ? promoAttive[0] : null;
    if (!promoAttiva) return;
    const modelliPromo = promoAttiva.modelli ? promoAttiva.modelli.split('\n').filter(m => m.trim()) : [];
    if (modelliPromo.length === 0) return;
    const dropdown = document.getElementById('promoModelloDropdown');
    if (!dropdown) return;
    dropdown.innerHTML = modelliPromo.map(m => `
        <div onclick="selectPromoModello('${m.replace(/'/g,"\\'")}')"
             style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)"
             onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
            ${m}
        </div>`).join('');
    dropdown.style.display = 'block';
}

function filterPromoModelli(query) {
    const promoAttiva = typeof promoAttive !== 'undefined' && promoAttive.length > 0 ? promoAttive[0] : null;
    if (!promoAttiva) return;
    const modelliPromo = promoAttiva.modelli ? promoAttiva.modelli.split('\n').filter(m => m.trim()) : [];
    const consentiManuale = promoAttiva.consentiInserimentoManuale !== false;
    const dropdown = document.getElementById('promoModelloDropdown');
    if (!dropdown) return;
    if (!query || !query.trim()) { showPromoModelliDropdown(); return; }
    const q = query.toLowerCase().trim();
    const matches = modelliPromo.filter(m => m.toLowerCase().includes(q));
    let html = matches.map(m => `
        <div onclick="selectPromoModello('${m.replace(/'/g,"\\'")}')"
             style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)"
             onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
            ${m}
        </div>`).join('');
    if (consentiManuale && !modelliPromo.some(m => m.toLowerCase() === q)) {
        html += `<div onclick="selectPromoModello('${query.trim().replace(/'/g,"\\'")}')"
                 style="padding:10px 14px;cursor:pointer;font-size:13px;color:var(--text-secondary);border-top:1px solid var(--border)"
                 onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
                 ✏️ Inserisci: "${query.trim()}"
             </div>`;
    }
    if (!html) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
}

function selectPromoModello(modello) {
    const input = document.getElementById('promoModelloInput');
    if (input) input.value = modello;
    document.getElementById('promoModelloRichiesto').value = modello;
    document.getElementById('promoModelloDropdown').style.display = 'none';
}

function selectPromoModelloFromSelect(val) {
    document.getElementById('promoModelloRichiesto').value = val;
}

function updatePromoModelloField() {
    const promoAttiva = typeof promoAttive !== 'undefined' && promoAttive.length > 0 ? promoAttive[0] : null;
    const inputWrapper = document.getElementById('promoModelloInputWrapper');
    const selectWrapper = document.getElementById('promoModelloSelectWrapper');
    const sel = document.getElementById('promoModelloSelect');
    if (!promoAttiva || !inputWrapper || !selectWrapper) return;
    const consentiManuale = promoAttiva.consentiInserimentoManuale !== false;
    const modelli = promoAttiva.modelli ? promoAttiva.modelli.split('\n').filter(m => m.trim()) : [];
    if (!consentiManuale && modelli.length > 0) {
        inputWrapper.style.display = 'none';
        selectWrapper.style.display = 'block';
        sel.innerHTML = '<option value="">Seleziona modello...</option>' +
            modelli.map(m => `<option value="${m}">${m}</option>`).join('');
    } else {
        inputWrapper.style.display = 'block';
        selectWrapper.style.display = 'none';
    }
}

document.addEventListener('click', function(e) {
    const marcaDropdown = document.getElementById('marcaDropdown');
    const marcaInput = document.getElementById('contactMarcaInput');
    if (marcaDropdown && marcaInput && !marcaInput.contains(e.target) && !marcaDropdown.contains(e.target)) marcaDropdown.style.display = 'none';

    const noleggioMarcaDropdown = document.getElementById('noleggioMarcaDropdown');
    const noleggioMarcaInput = document.getElementById('contactNoleggioMarcaInput');
    if (noleggioMarcaDropdown && noleggioMarcaInput && !noleggioMarcaInput.contains(e.target) && !noleggioMarcaDropdown.contains(e.target)) noleggioMarcaDropdown.style.display = 'none';

    const promoDropdown = document.getElementById('promoModelloDropdown');
    const promoInput = document.getElementById('promoModelloInput');
    if (promoDropdown && promoInput && !promoInput.contains(e.target) && !promoDropdown.contains(e.target)) promoDropdown.style.display = 'none';
});

async function loadContactLogs(from, to, restoreDayView) {
    try {
        let url = '/api/contacts';
        if (from && to) url += `?from=${from}&to=${to}`;
        const res = await fetch(url);
        if (!res.ok) return;
        contactLogs = await res.json();
        contactLogs.sort((a, b) => (b.contactDate || '').localeCompare(a.contactDate || ''));
        populateOperatorFilter();
        applyContactFilters(restoreDayView);
    } catch (err) { console.error('Errore caricamento contatti:', err); }
}

function populateOperatorFilter() {
    const select = document.getElementById('contactOperatorFilter');
    if (!select) return;
    const current = select.value;
    const operators = [...new Set(contactLogs.map(l => l.user.fullName))].sort();
    select.innerHTML = '<option value="">Tutti gli operatori</option>' +
        operators.map(op => `<option value="${op}" ${op===current?'selected':''}>${op}</option>`).join('');
}

function applyContactFilters(restoreDayView) {
    const operator = document.getElementById('contactOperatorFilter')?.value || '';
    const category = document.getElementById('contactCategoryFilter')?.value || '';
    contactLogsFiltered = contactLogs.filter(l => {
        if (operator && l.user.fullName !== operator) return false;
        if (category && l.category !== category) return false;
        return true;
    });
    if (restoreDayView) { showDayView(restoreDayView); } else { renderContactLogs(contactLogsFiltered); }
    renderContactCalendar();
    renderContactChartByOperator();
    renderContactStatsFromLogs(contactLogsFiltered);
    renderContactChartFromLogs(contactLogsFiltered);
    renderChartAppuntamentiSede(contactLogsFiltered);
    renderChartInfoAcquisto(contactLogsFiltered);
    renderChartFonteVendita(contactLogsFiltered);
    renderChartServiceAgnano(contactLogsFiltered);
    renderChartServiceSalerno(contactLogsFiltered);
    renderChartMarcheCustom(contactLogsFiltered);
    renderChartNoleggio(contactLogsFiltered);
    updateContactPromoCharts(contactLogsFiltered);
}

function showContactResetBtn() {
    const btn = document.getElementById('contactResetBtn');
    if (btn && currentUser?.role !== 'UTENTE') btn.style.display = 'inline-block';
}

function resetContactFilters() {
    const today = todayStr();
    const firstDay = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; })();
    document.getElementById('contactFrom').value = firstDay;
    document.getElementById('contactTo').value = today;
    const op = document.getElementById('contactOperatorFilter');
    if (op) op.value = '';
    const cat = document.getElementById('contactCategoryFilter');
    if (cat) cat.value = '';
    currentDayView = null;
    dayViewCategoryFilter = '';
    dayViewSubFilter = '';
    dayViewSecondaryFilter = '';
    const btn = document.getElementById('contactResetBtn');
    if (btn) btn.style.display = 'none';
    loadContactLogs(firstDay, today);
}

// ===== RICERCA CLIENTE (nome, cognome, numero — con fallback su campi legacy) =====

function searchContactLogs(query) {
    const resultsWrapper = document.getElementById('contactSearchResults');
    const resultsList = document.getElementById('contactSearchResultsList');
    if (!resultsWrapper || !resultsList) return;
    const q = query.trim();
    if (!q) { resultsWrapper.style.display = 'none'; return; }

    const qNorm = normalizeText(q);
    const matches = contactLogs.filter(l => {
        const nomeCompleto = normalizeText(clienteNomeCompleto(l));
        const numero = clienteNumeroDisplay(l).toLowerCase();
        return nomeCompleto.includes(qNorm) || numero.includes(q.toLowerCase());
    }).slice(0, 50);

    if (matches.length === 0) {
        resultsList.innerHTML = `<div class="empty-state" style="padding:20px"><p>Nessun cliente trovato</p></div>`;
    } else {
        resultsList.innerHTML = matches.map(l => {
            const date = l.contactDate.split('T')[0];
            const time = l.contactDate.split('T')[1]?.substring(0,5) || '';
            return `<div class="followup-card" style="margin-bottom:8px;cursor:pointer" onclick="goToContactSearchResult('${date}')">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <div style="font-weight:800;color:var(--text-primary);font-size:14px">${clienteNomeCompleto(l)}</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
                            📞 ${clienteNumeroDisplay(l)} · <span class="contact-category-badge cat-${l.category.replace(/[\s+]/g,'_')}">${l.category}</span>
                            · 📅 ${formatDateIT(date)} ${time} · 👤 ${l.user.fullName}
                        </div>
                    </div>
                    <span style="color:#f0c040;font-size:16px">→</span>
                </div>
            </div>`;
        }).join('');
    }
    resultsWrapper.style.display = 'block';
}

function goToContactSearchResult(date) {
    closeContactSearch();
    showDayView(date);
}

function closeContactSearch() {
    const resultsWrapper = document.getElementById('contactSearchResults');
    const input = document.getElementById('contactSearchInput');
    if (resultsWrapper) resultsWrapper.style.display = 'none';
    if (input) input.value = '';
}

function renderContactStatsFromLogs(logs) {
    const total = logs.length;
    const byCategory = {};
    logs.forEach(log => { byCategory[log.category] = (byCategory[log.category] || 0) + 1; });
    const infoVendita = (byCategory['Info Vendita']||0) + (byCategory['Info + Appuntamento']||0) + (byCategory['Info Vendita in Promo']||0);
    const el = id => document.getElementById(id);
    if (el('statContactTotal')) el('statContactTotal').textContent = total;
    if (el('statInfoVendita')) el('statInfoVendita').textContent = (total > 0 ? Math.round(infoVendita*1000/total)/10 : 0)+'%';
    if (el('statInfoNoleggio')) el('statInfoNoleggio').textContent = (total > 0 ? Math.round((byCategory['Info Noleggio']||0)*1000/total)/10 : 0)+'%';
    if (el('statService')) el('statService').textContent = (total > 0 ? Math.round((byCategory['Service']||0)*1000/total)/10 : 0)+'%';
}

// ===== DETTAGLIO GENERICO PER GRAFICI =====

function showGenericContactDetail(title, items) {
    lastDetailTitle = title;
    lastDetailItems = items;
    detailOnlyNominativo = false;
    renderGenericContactDetail();
}

function renderGenericContactDetail() {
    const modal = document.getElementById('sedeDetailModal');
    const titleEl = document.getElementById('sedeDetailTitle');
    const list = document.getElementById('sedeDetailList');
    if (!modal || !titleEl || !list) return;

    const items = detailOnlyNominativo
        ? lastDetailItems.filter(l => l.clienteNome || l.clienteCognome || l.serviceNomeCliente || l.noleggioNomeCliente || l.nominativoAppuntamento)
        : lastDetailItems;

    titleEl.textContent = `${lastDetailTitle} (${items.length})`;

    let html = `<div class="detail-filter-bar">
        <input type="checkbox" id="detailNominativoCheck" ${detailOnlyNominativo?'checked':''} onchange="toggleDetailNominativoFilter()">
        <label for="detailNominativoCheck" style="cursor:pointer">Mostra solo contatti con nome o cognome</label>
    </div>`;

    if (items.length === 0) {
        html += '<div class="empty-state" style="padding:20px"><p>Nessun contatto per questo filtro</p></div>';
    } else {
        html += items.map(log => {
            const date = log.contactDate.split('T')[0];
            const time = log.contactDate.split('T')[1].substring(0,5);
            const catClass = log.category.replace(/[\s+]/g, '_');
            const noteText = (log.category !== 'Info Acquisto effettuato' && log.category !== 'Service')
                ? (log.otherNote || '')
                : (log.acquistoNote || log.serviceNote || '');
            const links = [];
            if (log.linkAuto) links.push(`<a href="${log.linkAuto}" target="_blank" rel="noopener" title="Lead veicolo" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:rgba(124,77,255,0.15);color:#7c4dff;text-decoration:none;font-size:13px">🔗</a>`);
            if (log.linkAppuntamento) links.push(`<a href="${log.linkAppuntamento}" target="_blank" rel="noopener" title="Link appuntamento" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:rgba(74,144,217,0.15);color:#4a90d9;text-decoration:none;font-size:13px">🔗</a>`);
            if (log.noleggioLink) links.push(`<a href="${log.noleggioLink}" target="_blank" rel="noopener" title="Lead noleggio" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:rgba(0,200,83,0.15);color:#00c853;text-decoration:none;font-size:13px">🔗</a>`);
            return `<div class="followup-card" style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
                    <div>
                        <div style="font-weight:800;color:var(--text-primary);font-size:14px">${clienteNomeCompleto(log)}</div>
                        <div style="margin-top:5px"><span class="contact-category-badge cat-${catClass}">${log.category}</span></div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">📅 ${formatDateIT(date)} · 🕐 ${time}</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">📞 ${clienteNumeroDisplay(log)}</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">👤 ${log.user.fullName}</div>
                        ${log.marca ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">🚗 ${log.marca}${log.modello?' · '+log.modello:''}</div>` : ''}
                        ${log.serviceSede ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">📍 Service ${log.serviceSede}</div>` : ''}
                        ${log.serviceTarga ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">🔖 ${log.serviceTarga}</div>` : ''}
                        ${noteText ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">📝 ${noteText}</div>` : ''}
                    </div>
                    ${links.length > 0 ? `<div style="display:flex;gap:6px;flex-shrink:0">${links.join('')}</div>` : ''}
                </div>
            </div>`;
        }).join('');
    }
    list.innerHTML = html;
    modal.style.display = 'flex';
}

function toggleDetailNominativoFilter() {
    detailOnlyNominativo = document.getElementById('detailNominativoCheck')?.checked || false;
    renderGenericContactDetail();
}

let contactChart = null;

function renderContactChartFromLogs(logs) {
    const ctx = document.getElementById('chartContacts');
    if (!ctx) return;
    if (contactChart) contactChart.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const byCategory = {};
    logs.forEach(log => {
        const cat = (log.category === 'Info + Appuntamento' || log.category === 'Info Vendita in Promo') ? 'Info Vendita' : log.category;
        byCategory[cat] = (byCategory[cat] || 0) + 1;
    });
    const total = logs.length;
    const labels = Object.keys(byCategory);
    const data = Object.values(byCategory);
    const colors = labels.map(l => CATEGORY_COLORS[l] || '#8a8faa');
    const legendColor = getLegendColor();
    contactChart = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: isDark ? '#0d0f1a' : '#ffffff' }] },
        options: {
            responsive: true, maintainAspectRatio: true,
            onClick: (evt, elements) => {
                if (elements.length === 0) return;
                const label = labels[elements[0].index];
                const items = logs.filter(l => {
                    const cat = (l.category === 'Info + Appuntamento' || l.category === 'Info Vendita in Promo') ? 'Info Vendita' : l.category;
                    return cat === label;
                });
                showGenericContactDetail(`Categoria — ${label}`, items);
            },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: {
                legend: { position: 'right', labels: { color: legendColor, font: { size: 11 }, padding: 8, boxWidth: 12,
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

function renderChartAppuntamentiSede(logs) {
    const ctx = document.getElementById('chartAppuntamentiSede');
    if (!ctx) return;
    if (contactChartSede) contactChartSede.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const counts = { 'Agnano': 0, 'Casamarciano': 0, 'Salerno': 0 };
    logs.forEach(log => { if (log.category === 'Info + Appuntamento' && log.otherNote && counts[log.otherNote.trim()] !== undefined) counts[log.otherNote.trim()]++; });
    const total = SEDI_LIST.reduce((a, s) => a + counts[s], 0);
    const textColor = isDark ? '#8a8faa' : '#555555';
    const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
    contactChartSede = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: { labels: SEDI_LIST, datasets: [{ data: SEDI_LIST.map(s => counts[s]), backgroundColor: ['#e91e6399','#1a408099','#00c85399'], borderColor: SEDE_COLORS, borderWidth: 2, borderRadius: 8, borderSkipped: false }] },
        options: {
            responsive: true, maintainAspectRatio: true,
            onClick: (evt, elements) => { if (elements.length > 0) showSedeDetail(SEDI_LIST[elements[0].index]); },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => { const val = ctx.raw; const pct = total > 0 ? Math.round(val*1000/total)/10 : 0; return ` Valore: ${val} — ${pct}%`; } } } },
            scales: {
                x: { ticks: { color: textColor, font: { size: 11, weight: '700' }, maxRotation: 0 }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: textColor, precision: 0 }, grid: { color: gridColor } }
            }
        }
    });
}

function showSedeDetail(sede) {
    const items = contactLogsFiltered.filter(log => log.category === 'Info + Appuntamento' && log.otherNote === sede);
    showGenericContactDetail(`Appuntamenti — ${sede}`, items);
}

function closeSedeDetail(event) {
    if (event && event.target.id !== 'sedeDetailModal') return;
    document.getElementById('sedeDetailModal').style.display = 'none';
}

function renderChartInfoAcquisto(logs) {
    const ctx = document.getElementById('chartInfoAcquisto');
    if (!ctx) return;
    if (contactChartAcquisto) contactChartAcquisto.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const counts = {};
    ACQUISTO_LIST.forEach(a => counts[a] = 0);
    logs.forEach(log => { if (log.category === 'Info Acquisto effettuato' && log.otherNote && counts[log.otherNote.trim()] !== undefined) counts[log.otherNote.trim()]++; });
    const total = ACQUISTO_LIST.reduce((a,t) => a+counts[t], 0);
    const legendColor = getLegendColor();
    contactChartAcquisto = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: { labels: ACQUISTO_LIST, datasets: [{ data: ACQUISTO_LIST.map(t => counts[t]), backgroundColor: ACQUISTO_COLORS, borderWidth: 2, borderColor: isDark ? '#0d0f1a' : '#ffffff' }] },
        options: {
            responsive: true, maintainAspectRatio: true,
            layout: { padding: { bottom: 10 } },
            onClick: (evt, elements) => {
                if (elements.length === 0) return;
                const tipo = ACQUISTO_LIST[elements[0].index];
                const items = logs.filter(l => l.category === 'Info Acquisto effettuato' && l.otherNote === tipo);
                showGenericContactDetail(`Info Acquisto — ${tipo}`, items);
            },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: {
                legend: { position: 'bottom', labels: { color: legendColor, font: { size: 10 }, padding: 8, boxWidth: 10,
                    generateLabels: chart => chart.data.labels.map((label, i) => {
                        const val = chart.data.datasets[0].data[i];
                        const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                        return { text: `${label}: ${val} (${pct}%)`, fillStyle: ACQUISTO_COLORS[i], strokeStyle: ACQUISTO_COLORS[i], fontColor: legendColor, lineWidth: 0, index: i };
                    })
                } },
                tooltip: { callbacks: { label: ctx => { const val = ctx.raw; const pct = total > 0 ? Math.round(val*1000/total)/10 : 0; return ` Valore: ${val} — ${pct}%`; } } }
            }
        }
    });
}

function renderChartFonteVendita(logs) {
    const ctx = document.getElementById('chartFonteVendita');
    if (!ctx) return;
    if (contactChartFonte) contactChartFonte.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const counts = {};
    FONTE_LIST.forEach(f => counts[f] = 0);
    logs.forEach(log => {
        if ((log.category === 'Info Vendita' || log.category === 'Info + Appuntamento') && log.otherNote && counts[log.otherNote.trim()] !== undefined) counts[log.otherNote.trim()]++;
    });
    const total = Object.values(counts).reduce((a,b) => a+b, 0);
    const wrapper = document.getElementById('chartFonteWrapper');
    if (wrapper) wrapper.style.display = 'block';
    const legendColor = getLegendColor();
    contactChartFonte = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: { labels: FONTE_LIST, datasets: [{ data: FONTE_LIST.map(f => counts[f]), backgroundColor: FONTE_COLORS, borderWidth: 2, borderColor: isDark ? '#0d0f1a' : '#ffffff' }] },
        options: {
            responsive: true, maintainAspectRatio: true,
            onClick: (evt, elements) => {
                if (elements.length === 0) return;
                const fonte = FONTE_LIST[elements[0].index];
                const items = logs.filter(l => (l.category === 'Info Vendita' || l.category === 'Info + Appuntamento') && l.otherNote === fonte);
                showGenericContactDetail(`Fonte Vendita — ${fonte}`, items);
            },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
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

// ===== SERVICE — DUE GRAFICI SEPARATI PER SEDE (compatti, per stare in linea) =====

function buildServiceSedeChart(canvasId, existingChart, logs, sede) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return existingChart;
    if (existingChart) existingChart.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const counts = {};
    SERVICE_LIST.forEach(s => counts[s] = 0);
    logs.forEach(log => { if (log.category === 'Service' && log.serviceSede === sede && log.serviceTipo && counts[log.serviceTipo.trim()] !== undefined) counts[log.serviceTipo.trim()]++; });
    const total = SERVICE_LIST.reduce((a,s) => a+counts[s], 0);
    const textColor = isDark ? '#8a8faa' : '#555555';
    const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
    return new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: { labels: SERVICE_LIST, datasets: [{ data: SERVICE_LIST.map(s => counts[s]), backgroundColor: SERVICE_COLORS.map(c => c+'99'), borderColor: SERVICE_COLORS, borderWidth: 2, borderRadius: 5, borderSkipped: false }] },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            onClick: (evt, elements) => { if (elements.length > 0) showServiceDetail(SERVICE_LIST[elements[0].index], sede); },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => { const val = ctx.raw; const pct = total > 0 ? Math.round(val*1000/total)/10 : 0; return ` Valore: ${val} — ${pct}%`; } } } },
            scales: {
                x: { beginAtZero: true, ticks: { color: textColor, precision: 0, font: { size: 10 } }, grid: { color: gridColor } },
                y: { ticks: { color: textColor, font: { size: 10, weight: '600' } }, grid: { display: false } }
            }
        }
    });
}

function renderChartServiceAgnano(logs) {
    contactChartServiceAgnano = buildServiceSedeChart('chartServiceAgnano', contactChartServiceAgnano, logs, 'Agnano');
}

function renderChartServiceSalerno(logs) {
    contactChartServiceSalerno = buildServiceSedeChart('chartServiceSalerno', contactChartServiceSalerno, logs, 'Salerno');
}

function showServiceDetail(tipo, sede) {
    const items = contactLogsFiltered.filter(log => log.category === 'Service' && log.serviceTipo === tipo && (!sede || log.serviceSede === sede));
    showGenericContactDetail(`Service${sede ? ' — ' + sede : ''} — ${tipo}`, items);
}

// ===== PERFORMANCE MARCHE — SOLO Info Vendita e Info + Appuntamento
// (un veicolo già acquistato/service non è "performance" di potenziale acquisto) =====

function renderChartMarcheCustom(logs) {
    const container = document.getElementById('chartMarcheCustom');
    if (!container) return;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const counts = {};
    logs.filter(log => log.category === 'Info Vendita' || log.category === 'Info + Appuntamento')
        .forEach(log => { if (log.marca) { const mUpper = log.marca.trim().toUpperCase(); counts[mUpper] = (counts[mUpper]||0) + 1; } });
    if (Object.keys(counts).length === 0) { container.innerHTML = `<div style="color:var(--text-secondary);font-size:13px;padding:20px 0">Nessun dato disponibile</div>`; return; }
    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,10);
    const maxVal = sorted[0][1];
    const totalMarche = sorted.reduce((a,b) => a+b[1], 0);
    const barColor = isDark ? '#4a90d9' : '#1a4080';
    container.innerHTML = sorted.map(([marca, val]) => {
        const pct = Math.round(val/maxVal*100);
        const pctTot = totalMarche > 0 ? Math.round(val*1000/totalMarche)/10 : 0;
        return `<div onclick="showMarcaContactDetail('${marca.replace(/'/g,"\\'")}')" style="display:flex;align-items:center;gap:12px;padding:4px 0;cursor:pointer" title="${marca}: ${val} (${pctTot}%)">
            <div style="width:120px;font-size:12px;font-weight:700;color:var(--text-primary);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0">${marca}</div>
            <div style="flex:1;background:var(--border);border-radius:4px;height:10px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${barColor};border-radius:4px;transition:width 0.4s ease"></div>
            </div>
            <div style="width:32px;font-size:12px;font-weight:800;color:${barColor};text-align:right;flex-shrink:0">${val}</div>
        </div>`;
    }).join('');
}

function showMarcaContactDetail(marcaUpper) {
    const items = contactLogsFiltered.filter(l => {
        if (l.category !== 'Info Vendita' && l.category !== 'Info + Appuntamento') return false;
        return l.marca && l.marca.trim().toUpperCase() === marcaUpper;
    });
    showGenericContactDetail(`Marca — ${marcaUpper}`, items);
}

function renderChartNoleggio(logs) {
    const wrapper = document.getElementById('chartNoleggioWrapper');
    const noleggioLogs = logs.filter(l => l.category === 'Info Noleggio');
    if (!wrapper) return;
    if (noleggioLogs.length === 0) { wrapper.style.display = 'none'; return; }
    wrapper.style.display = 'flex';
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const legendColor = getLegendColor();
    const textColor = isDark ? '#8a8faa' : '#555555';
    const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';

    if (contactChartNoleggioTipo) { contactChartNoleggioTipo.destroy(); contactChartNoleggioTipo = null; }
    const ctxTipo = document.getElementById('chartNoleggioTipo');
    if (ctxTipo) {
        const counts = {};
        NOLEGGIO_TIPO_LIST.forEach(t => counts[t] = 0);
        noleggioLogs.forEach(l => { if (l.noleggioTipo && counts[l.noleggioTipo] !== undefined) counts[l.noleggioTipo]++; });
        const total = NOLEGGIO_TIPO_LIST.reduce((a,t) => a+counts[t], 0);
        const tipoColors = ['#4a90d9','#e91e63','#ff9800'];
        contactChartNoleggioTipo = new Chart(ctxTipo.getContext('2d'), {
            type: 'doughnut',
            data: { labels: NOLEGGIO_TIPO_LIST, datasets: [{ data: NOLEGGIO_TIPO_LIST.map(t => counts[t]), backgroundColor: tipoColors.map(c=>c+'99'), borderColor: tipoColors, borderWidth: 2 }] },
            options: {
                responsive: true, maintainAspectRatio: true,
                onClick: (evt, elements) => {
                    if (elements.length === 0) return;
                    const tipo = NOLEGGIO_TIPO_LIST[elements[0].index];
                    const items = noleggioLogs.filter(l => l.noleggioTipo === tipo);
                    showGenericContactDetail(`Tipologia Noleggio — ${tipo}`, items);
                },
                onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
                plugins: {
                    legend: { position: 'bottom', labels: { color: legendColor, font: { size: 11 }, padding: 12, boxWidth: 12,
                        generateLabels: chart => chart.data.labels.map((label, i) => {
                            const val = chart.data.datasets[0].data[i];
                            const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                            return { text: `${label}: ${val} (${pct}%)`, fillStyle: tipoColors[i]+'99', strokeStyle: tipoColors[i], fontColor: legendColor, lineWidth: 0, index: i };
                        })
                    } },
                    tooltip: { callbacks: { label: ctx => { const val = ctx.raw; const pct = total > 0 ? Math.round(val*1000/total)/10 : 0; return ` Valore: ${val} — ${pct}%`; } } }
                }
            }
        });
    }

    if (contactChartNoleggioLead) { contactChartNoleggioLead.destroy(); contactChartNoleggioLead = null; }
    const ctxLead = document.getElementById('chartNoleggioLead');
    if (ctxLead) {
        const soloInfo = noleggioLogs.filter(l => !l.noleggioLink).length;
        const leadGenerata = noleggioLogs.filter(l => l.noleggioLink).length;
        const total = soloInfo + leadGenerata;
        const leadLabels = ['Solo info', 'Lead generata'];
        contactChartNoleggioLead = new Chart(ctxLead.getContext('2d'), {
            type: 'bar',
            data: { labels: leadLabels, datasets: [{ data: [soloInfo, leadGenerata], backgroundColor: ['#8a8faa99','#00c85399'], borderColor: ['#8a8faa','#00c853'], borderWidth: 2, borderRadius: 8, borderSkipped: false }] },
            options: {
                responsive: true, maintainAspectRatio: true,
                onClick: (evt, elements) => {
                    if (elements.length === 0) return;
                    const hasLink = elements[0].index === 1;
                    const items = noleggioLogs.filter(l => Boolean(l.noleggioLink) === hasLink);
                    showGenericContactDetail(`Noleggio — ${leadLabels[elements[0].index]}`, items);
                },
                onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => { const val = ctx.raw; const pct = total > 0 ? Math.round(val*1000/total)/10 : 0; return ` Valore: ${val} — ${pct}%`; } } } },
                scales: {
                    x: { ticks: { color: textColor, font: { size: 11, weight: '700' }, maxRotation: 0 }, grid: { display: false } },
                    y: { beginAtZero: true, ticks: { color: textColor, precision: 0 }, grid: { color: gridColor } }
                }
            }
        });
    }
}

function updateContactPromoCharts(logs) {
    const section = document.getElementById('contactPromoChartsSection');
    if (!section) return;
    const promoLogs = logs.filter(l => l.category === 'Info Vendita in Promo');
    if (promoLogs.length === 0) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    const content = document.getElementById('contactPromoChartsContent');
    if (content && content.style.display !== 'none') drawContactPromoCharts(logs);
}

function toggleContactPromoCharts() {
    const content = document.getElementById('contactPromoChartsContent');
    const btn = document.getElementById('toggleContactPromoBtn');
    if (!content) return;
    const isHidden = content.style.display === 'none';
    if (isHidden) {
        content.style.display = 'block';
        if (btn) btn.textContent = '▲ Nascondi';
        drawContactPromoCharts(contactLogsFiltered);
    } else {
        content.style.display = 'none';
        if (btn) btn.textContent = '▼ Mostra';
    }
}

function drawContactPromoCharts(logs) {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const legendColor = getLegendColor();
    const textColor = isDark ? '#8a8faa' : '#555555';
    const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
    const promoLogs = logs.filter(l => l.category === 'Info Vendita in Promo');
    const total = promoLogs.length;
    if (contactPromoCharts.app) { contactPromoCharts.app.destroy(); contactPromoCharts.app = null; }
    if (contactPromoCharts.richiesta) { contactPromoCharts.richiesta.destroy(); contactPromoCharts.richiesta = null; }

    const statsContainer = document.getElementById('contactPromoStatCards');
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div class="stat-card blue"><div class="stat-label">CONTATTI PROMO</div><div class="stat-value">${total}</div></div>
            <div class="stat-card green"><div class="stat-label">CON MODELLO</div><div class="stat-value">${promoLogs.filter(l => l.modello).length}</div></div>
        `;
    }

    const modelliContainer = document.getElementById('chartPromoModelliCustom');
    if (modelliContainer) {
        const perModello = {};
        promoLogs.forEach(l => { if (l.modello) perModello[l.modello] = (perModello[l.modello]||0) + 1; });
        const sorted = Object.entries(perModello).sort((a,b) => b[1]-a[1]);
        if (sorted.length === 0) {
            modelliContainer.innerHTML = `<div style="color:var(--text-secondary);font-size:13px;padding:10px 0">Nessun modello registrato</div>`;
        } else {
            const maxVal = sorted[0][1];
            modelliContainer.innerHTML = sorted.map(([modello, val]) => {
                const pct = Math.round(val/maxVal*100);
                return `<div onclick="showPromoModelloDetail('${modello.replace(/'/g,"\\'")}')" style="display:flex;align-items:center;gap:12px;padding:5px 0;cursor:pointer">
                    <div style="width:180px;font-size:12px;font-weight:700;color:var(--text-primary);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0" title="${modello}">${modello}</div>
                    <div style="flex:1;background:var(--border);border-radius:4px;height:10px;overflow:hidden">
                        <div style="width:${pct}%;height:100%;background:#f0c040;border-radius:4px;transition:width 0.4s ease"></div>
                    </div>
                    <div style="width:28px;font-size:12px;font-weight:800;color:#f0c040;text-align:right;flex-shrink:0">${val}</div>
                </div>`;
            }).join('');
        }
    }
    loadPromoStatsForContactCharts(total, textColor, gridColor, legendColor);
}

function showPromoModelloDetail(modello) {
    const items = contactLogsFiltered.filter(l => l.category === 'Info Vendita in Promo' && l.modello === modello);
    showGenericContactDetail(`Promo — ${modello}`, items);
}

async function loadPromoStatsForContactCharts(totalFromLogs, textColor, gridColor, legendColor) {
    const promoAttiva = typeof promoAttive !== 'undefined' && promoAttive.length > 0 ? promoAttive[0] : null;
    if (!promoAttiva) return;
    try {
        const res = await fetch(`/api/promos/${promoAttiva.id}/stats`);
        if (!res.ok) return;
        const stats = await res.json();
        const realTotal = totalFromLogs;
        const statsContainer = document.getElementById('contactPromoStatCards');
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="stat-card blue"><div class="stat-label">CONTATTI PROMO</div><div class="stat-value">${realTotal}</div></div>
                <div class="stat-card gold"><div class="stat-label">APPUNTAMENTI</div><div class="stat-value">${stats.appuntamenti}</div></div>
                <div class="stat-card green"><div class="stat-label">RICHIESTA PROMO SÌ</div><div class="stat-value">${stats.richiestaPromoSi}</div></div>
                <div class="stat-card purple"><div class="stat-label">TEST DRIVE SÌ</div><div class="stat-value">${stats.testDriveSi}</div></div>
            `;
        }
        if (contactPromoCharts.app) { contactPromoCharts.app.destroy(); contactPromoCharts.app = null; }
        const ctxApp = document.getElementById('chartPromoAppContact');
        if (ctxApp && realTotal > 0) {
            contactPromoCharts.app = new Chart(ctxApp.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: ['Contatti', 'Appuntamenti', 'Rich. Promo', 'Test Drive'],
                    datasets: [{ data: [realTotal, stats.appuntamenti, stats.richiestaPromoSi, stats.testDriveSi],
                        backgroundColor: ['#1a408099','#e91e6399','#00c85399','#7c4dff99'],
                        borderColor: ['#1a4080','#e91e63','#00c853','#7c4dff'],
                        borderWidth: 2, borderRadius: 8, borderSkipped: false }]
                },
                options: {
                    responsive: true, maintainAspectRatio: true,
                    plugins: { legend: { display: false }, tooltip: { callbacks: {
                        title: ctx => ['Totale contatti promo','Appuntamenti fissati','Richiesta promo Sì','Test Drive Sì'][ctx[0].dataIndex],
                        label: ctx => { const val = ctx.raw; const pct = realTotal > 0 ? Math.round(val*1000/realTotal)/10 : 0; return ` Valore: ${val} — ${pct}%`; }
                    } } },
                    scales: {
                        x: { ticks: { color: textColor, font: { size: 11, weight: '600' }, maxRotation: 0 }, grid: { display: false } },
                        y: { beginAtZero: true, ticks: { color: textColor, precision: 0 }, grid: { color: gridColor } }
                    }
                }
            });
        }
        if (contactPromoCharts.richiesta) { contactPromoCharts.richiesta.destroy(); contactPromoCharts.richiesta = null; }
        const ctxRichiesta = document.getElementById('chartPromoRichiestaContact');
        if (ctxRichiesta && realTotal > 0) {
            const si = stats.richiestaPromoSi;
            const no = realTotal - si;
            contactPromoCharts.richiesta = new Chart(ctxRichiesta.getContext('2d'), {
                type: 'doughnut',
                data: { labels: ['Richiesta Sì', 'Richiesta No'], datasets: [{ data: [si, no], backgroundColor: ['#00c85399','#ff3d3d99'], borderColor: ['#00c853','#ff3d3d'], borderWidth: 2 }] },
                options: {
                    responsive: true, maintainAspectRatio: true,
                    plugins: { legend: { position: 'bottom', labels: { color: legendColor, font: { size: 11 }, padding: 12, boxWidth: 12,
                        generateLabels: chart => chart.data.labels.map((label, i) => { const val = chart.data.datasets[0].data[i]; const t = si+no; const pct = t > 0 ? Math.round(val*1000/t)/10 : 0; return { text: `${label}: ${val} (${pct}%)`, fillStyle: ['#00c85399','#ff3d3d99'][i], strokeStyle: ['#00c853','#ff3d3d'][i], fontColor: legendColor, lineWidth: 0, index: i }; })
                    } }, tooltip: { callbacks: { label: ctx => { const val = ctx.raw; const t = si+no; const pct = t > 0 ? Math.round(val*1000/t)/10 : 0; return ` Valore: ${val} — ${pct}%`; } } } }
                }
            });
        }
    } catch (err) { console.error('Errore stats promo grafici:', err); }
}

function exportContactsExcel() {
    if (!contactLogsFiltered || contactLogsFiltered.length === 0) { alert('Nessun dato da esportare'); return; }
    const from = document.getElementById('contactFrom')?.value || '';
    const to = document.getElementById('contactTo')?.value || '';
    const operator = document.getElementById('contactOperatorFilter')?.value || '';
    const category = document.getElementById('contactCategoryFilter')?.value || '';
    let url = '/api/contacts/export-excel?';
    if (from) url += `from=${from}&`;
    if (to) url += `to=${to}&`;
    if (operator) url += `operator=${encodeURIComponent(operator)}&`;
    if (category) url += `category=${encodeURIComponent(category)}&`;
    downloadFile(url);
}

// ============================================================
// VISTA GIORNALIERA
// ============================================================

let currentDayView = null;
let dayViewCategoryFilter = '';
let dayViewSubFilter = '';

function getSubcategoryList(category) {
    switch (category) {
        case 'Info Vendita':
        case 'Info Vendita in Promo':
        case 'Info + Appuntamento':
            return FONTE_LIST;
        case 'Service':
            return SERVICE_LIST;
        case 'Info Noleggio':
            return NOLEGGIO_TIPO_LIST;
        case 'Info Acquisto effettuato':
            return ACQUISTO_LIST;
        default:
            return null;
    }
}

function getSubcategoryValue(log) {
    switch (log.category) {
        case 'Info Vendita':
        case 'Info Vendita in Promo':
            return log.otherNote || '';
        case 'Info + Appuntamento':
            return log.serviceTipo || '';
        case 'Service':
            return log.serviceTipo || '';
        case 'Info Noleggio':
            return log.noleggioTipo || '';
        case 'Info Acquisto effettuato':
            return log.otherNote || '';
        default:
            return '';
    }
}

function getSecondaryFilterConfig(category) {
    if (category === 'Service') {
        return { values: SERVICE_SEDI_LIST, valueFn: log => log.serviceSede || '', labelFn: v => v, label: 'Sede' };
    }
    if (category === 'Info Noleggio') {
        return { values: ['SOLO_INFO','RICHIESTA_CLIENTE'], valueFn: log => log.noleggioRichiesta || '', labelFn: v => NOLEGGIO_RICHIESTA_LABELS[v] || v, label: 'Richiesta' };
    }
    return null;
}

function getDayViewBaseItems(date) {
    return contactLogsFiltered.filter(l => l.contactDate.split('T')[0] === date);
}

function getDayViewFilteredItems(date) {
    let items = getDayViewBaseItems(date);
    if (dayViewCategoryFilter) {
        items = items.filter(l => l.category === dayViewCategoryFilter);
        if (dayViewSubFilter) items = items.filter(l => getSubcategoryValue(l) === dayViewSubFilter);
        const secConfig = getSecondaryFilterConfig(dayViewCategoryFilter);
        if (secConfig && dayViewSecondaryFilter) {
            items = items.filter(l => secConfig.valueFn(l) === dayViewSecondaryFilter);
        }
    }
    const sorted = [...items].sort((a, b) => (b.contactDate || '').localeCompare(a.contactDate || ''));
    return contactSortDir === 'desc' ? sorted : sorted.reverse();
}

function toggleContactSortDir() {
    contactSortDir = contactSortDir === 'desc' ? 'asc' : 'desc';
    renderDayView();
}

function showDayView(date) {
    currentDayView = date;
    dayViewCategoryFilter = '';
    dayViewSubFilter = '';
    dayViewSecondaryFilter = '';
    renderDayView();
}

function renderDayView() {
    const date = currentDayView;
    if (!date) return;
    const container = document.getElementById('contactLogsList');
    if (!container) return;

    const baseItems = getDayViewBaseItems(date);
    const items = getDayViewFilteredItems(date);

    renderContactStatsFromLogs(items);
    renderContactChartFromLogs(items);
    renderChartAppuntamentiSede(items);
    renderChartInfoAcquisto(items);
    renderChartFonteVendita(items);
    renderChartServiceAgnano(items);
    renderChartServiceSalerno(items);
    renderChartMarcheCustom(items);
    renderChartNoleggio(items);

    const categoriesPresent = ALL_CATEGORIES.filter(c => baseItems.some(l => l.category === c));

    const subList = dayViewCategoryFilter ? getSubcategoryList(dayViewCategoryFilter) : null;
    const subPresent = subList
        ? subList.filter(s => baseItems.some(l => l.category === dayViewCategoryFilter && getSubcategoryValue(l) === s))
        : [];

    const secConfig = dayViewCategoryFilter ? getSecondaryFilterConfig(dayViewCategoryFilter) : null;
    const secPresent = secConfig
        ? secConfig.values.filter(v => baseItems.some(l => l.category === dayViewCategoryFilter && secConfig.valueFn(l) === v))
        : [];

    const filtersActive = !!(dayViewCategoryFilter || dayViewSubFilter || dayViewSecondaryFilter);

    container.innerHTML = `
        <div style="margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <button class="btn-secondary" onclick="closeDayView()" style="padding:8px 16px;font-size:12px">← INDIETRO</button>
            <span style="font-size:16px;font-weight:800;color:var(--text-primary)">${formatDateIT(date)}</span>

            <select id="dayViewCategoryFilter" class="input-dark" style="min-width:190px" onchange="onDayViewCategoryChange(this.value)">
                <option value="">Tutte le categorie</option>
                ${categoriesPresent.map(c => `<option value="${c}" ${c===dayViewCategoryFilter?'selected':''}>${c}</option>`).join('')}
            </select>

            ${subList ? `
            <select id="dayViewSubFilter" class="input-dark" style="min-width:190px" onchange="onDayViewSubFilterChange(this.value)">
                <option value="">Tutte le sottocategorie</option>
                ${subPresent.map(s => `<option value="${s}" ${s===dayViewSubFilter?'selected':''}>${s}</option>`).join('')}
            </select>` : ''}

            ${secConfig ? `
            <select id="dayViewSecondaryFilter" class="input-dark" style="min-width:190px" onchange="onDayViewSecondaryFilterChange(this.value)">
                <option value="">Tutte (${secConfig.label})</option>
                ${secPresent.map(v => `<option value="${v}" ${v===dayViewSecondaryFilter?'selected':''}>${secConfig.labelFn(v)}</option>`).join('')}
            </select>` : ''}

            ${filtersActive ? `<button class="btn-secondary" onclick="resetDayViewFilters()" style="padding:8px 16px;font-size:12px">↺ RESET</button>` : ''}

            <button class="btn-sort-toggle" onclick="toggleContactSortDir()">${contactSortDir === 'desc' ? '⬇️ Più recenti prima' : '⬆️ Meno recenti prima'}</button>

            <span style="font-size:12px;color:var(--text-secondary);font-weight:700">${items.length} contatt${items.length===1?'o':'i'}</span>

            <button class="btn-small btn-secondary" onclick="printDay('${date}')" style="margin-left:auto">🖨️ STAMPA</button>
        </div>
        <div class="contact-day-section">
            <div class="contact-table-wrapper">
                <table class="contact-table">
                    <thead><tr><th>Orario</th><th>Cliente</th><th>Categoria</th><th>Note</th><th>Operatore</th><th>Azioni</th></tr></thead>
                    <tbody>${items.length > 0 ? items.map(log => renderContactRow(log)).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:20px">Nessun contatto per i filtri selezionati</td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
}

function onDayViewCategoryChange(value) {
    dayViewCategoryFilter = value;
    dayViewSubFilter = '';
    dayViewSecondaryFilter = '';
    renderDayView();
}

function onDayViewSubFilterChange(value) {
    dayViewSubFilter = value;
    renderDayView();
}

function onDayViewSecondaryFilterChange(value) {
    dayViewSecondaryFilter = value;
    renderDayView();
}

function resetDayViewFilters() {
    dayViewCategoryFilter = '';
    dayViewSubFilter = '';
    dayViewSecondaryFilter = '';
    renderDayView();
}

function closeDayView() {
    currentDayView = null;
    dayViewCategoryFilter = '';
    dayViewSubFilter = '';
    dayViewSecondaryFilter = '';
    renderContactLogs(contactLogsFiltered);
    renderContactStatsFromLogs(contactLogsFiltered);
    renderContactChartFromLogs(contactLogsFiltered);
    renderChartAppuntamentiSede(contactLogsFiltered);
    renderChartInfoAcquisto(contactLogsFiltered);
    renderChartFonteVendita(contactLogsFiltered);
    renderChartServiceAgnano(contactLogsFiltered);
    renderChartServiceSalerno(contactLogsFiltered);
    renderChartMarcheCustom(contactLogsFiltered);
    renderChartNoleggio(contactLogsFiltered);
}

// ============================================================
// FINE VISTA GIORNALIERA
// ============================================================

function getISOWeekMonday(dateStr) {
    const d = parseLocalDate(dateStr);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - (day-1));
    d.setHours(0,0,0,0);
    return d;
}

function renderContactLogs(logs) {
    const container = document.getElementById('contactLogsList');
    if (!container) return;
    if (logs.length === 0) { container.innerHTML = `<div class="empty-state"><div style="font-size:40px">📞</div><p>Nessun contatto registrato</p></div>`; return; }
    const tree = {};
    logs.forEach(log => {
        const date = log.contactDate.split('T')[0];
        const d = parseLocalDate(date);
        const year = d.getFullYear().toString();
        const month = d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
        const week = getWeekKey(date);
        if (!tree[year]) tree[year] = {};
        if (!tree[year][month]) tree[year][month] = {};
        if (!tree[year][month][week]) tree[year][month][week] = { days: {}, monday: getISOWeekMonday(date) };
        if (!tree[year][month][week].days[date]) tree[year][month][week].days[date] = [];
        tree[year][month][week].days[date].push(log);
    });
    const today = todayStr();
    container.innerHTML = Object.entries(tree).sort((a,b) => b[0]-a[0]).map(([year, months]) => {
        const yearKey = `year-${year}`;
        const yearCount = Object.values(months).flatMap(w => Object.values(w)).flatMap(w => Object.values(w.days)).flat().length;
        return `<div class="contact-tree-section">
            <div class="contact-tree-header contact-tree-year" onclick="toggleTree('${yearKey}')">
                <span>📁 ${year} <span class="tree-count">${yearCount} contatti</span></span>
                <span class="folder-arrow" id="arrow-${yearKey}">▼</span>
            </div>
            <div id="body-${yearKey}">
                ${Object.entries(months).sort().map(([month, weeks]) => {
                    const monthKey = `month-${year}-${month.replace(/\s/g,'_')}`;
                    const monthCount = Object.values(weeks).flatMap(w => Object.values(w.days)).flat().length;
                    return `<div class="contact-tree-indent">
                        <div class="contact-tree-header contact-tree-month" onclick="toggleTree('${monthKey}')">
                            <span>📂 ${month} <span class="tree-count">${monthCount} contatti</span></span>
                            <span class="folder-arrow" id="arrow-${monthKey}">▼</span>
                        </div>
                        <div id="body-${monthKey}">
                            ${Object.entries(weeks).sort().map(([week, weekData]) => {
                                const weekKey = `week-${week.replace(/[\s—]/g,'_')}`;
                                const weekCount = Object.values(weekData.days).flat().length;
                                const todayMonday = getISOWeekMonday(today);
                                const isCurrentWeek = weekData.monday.getTime() === todayMonday.getTime();
                                return `<div class="contact-tree-indent">
                                    <div class="contact-tree-header contact-tree-week" onclick="toggleTree('${weekKey}')">
                                        <span>🗓️ ${week} <span class="tree-count">${weekCount} contatti</span></span>
                                        <span class="folder-arrow" id="arrow-${weekKey}">▼</span>
                                    </div>
                                    <div id="body-${weekKey}" style="display:${isCurrentWeek?'block':'none'}">
                                        ${renderWeekDayCards(weekData.days, weekData.monday)}
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

function renderWeekDayCards(days, monday) {
    const weekDates = [];
    for (let i = 0; i < 6; i++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        weekDates.push(`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`);
    }
    return `<div class="contact-day-cards-grid">
        ${weekDates.map((date, idx) => {
            const items = days[date] || [];
            const dayName = DAY_NAMES_SHORT[idx];
            const dayNum = parseLocalDate(date).getDate();
            const hasData = items.length > 0;
            const dominantColor = hasData ? getDominantColor(items) : null;
            const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
            const emptyBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
            const bgStyle = hasData ? `background:${dominantColor}22;border-color:${dominantColor};` : `background:${emptyBg};`;
            return `<div class="contact-day-card ${hasData?'contact-day-card-active':'contact-day-card-empty'}" style="${bgStyle}" ${hasData?`onclick="showDayView('${date}')"`:''}> 
                <div class="contact-day-card-name">${dayName}</div>
                <div class="contact-day-card-num" style="${hasData?`color:${dominantColor}`:''}">${dayNum}</div>
                ${hasData?`<div class="contact-day-card-count">${items.length}</div><div class="contact-day-card-label">contatti</div>`:`<div class="contact-day-card-empty-label">—</div>`}
            </div>`;
        }).join('')}
    </div>`;
}

function getDominantColor(items) {
    const counts = {};
    items.forEach(log => { counts[log.category] = (counts[log.category]||0) + 1; });
    const dominant = Object.entries(counts).sort((a,b) => b[1]-a[1])[0][0];
    return CATEGORY_COLORS[dominant] || '#1a4080';
}

function toggleTree(key) {
    const body = document.getElementById(`body-${key}`);
    const arrow = document.getElementById(`arrow-${key}`);
    if (body) {
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'block' : 'none';
        if (arrow) arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
    }
}

function renderContactRow(log) {
    const time = log.contactDate.split('T')[1].substring(0, 5);
    const isOwner = currentUser && log.user.id === currentUser.id;
    const isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'GESTORE');
    const isMod = currentUser && currentUser.role === 'MODERATORE';
    const targetIsAdmin = log.user.role === 'ADMIN' || log.user.role === 'GESTORE';
    const canEdit = isAdmin || isOwner || (isMod && !targetIsAdmin);
    const catClass = log.category.replace(/[\s+]/g, '_');
    const marca = log.marca || log.noleggioMarca;
    const modello = log.modello || log.noleggioModello;
    return `<tr id="contact-row-${log.id}">
        <td style="font-weight:700;color:var(--text-primary)">${time}</td>
        <td style="font-size:12px;color:var(--text-primary);font-weight:700">${clienteNomeCompleto(log)}<br><span style="font-weight:400;color:var(--text-secondary)">📞 ${clienteNumeroDisplay(log)}</span></td>
        <td>
            <span class="contact-category-badge cat-${catClass}">${log.category}</span>
            ${log.category === 'Info + Appuntamento' && log.otherNote ? `<span style="font-size:11px;background:rgba(233,30,99,0.1);color:#e91e63;padding:2px 8px;border-radius:8px;margin-left:6px">📍 ${log.otherNote}</span>` : ''}
            ${log.category === 'Info + Appuntamento' && log.linkAppuntamento ? `<a href="${log.linkAppuntamento}" target="_blank" rel="noopener" style="font-size:11px;background:rgba(74,144,217,0.1);color:#4a90d9;padding:2px 8px;border-radius:8px;margin-left:6px;text-decoration:none">🔗 Link</a>` : ''}
            ${log.category === 'Info Acquisto effettuato' && log.otherNote ? `<span style="font-size:11px;background:rgba(74,144,217,0.1);color:#4a90d9;padding:2px 8px;border-radius:8px;margin-left:6px">📋 ${log.otherNote}</span>` : ''}
            ${(log.category === 'Info Vendita' || log.category === 'Info + Appuntamento') && log.otherNote && FONTE_LIST.includes(log.otherNote) ? `<span style="font-size:11px;background:rgba(26,64,128,0.1);color:#1a4080;padding:2px 8px;border-radius:8px;margin-left:6px">🌐 ${log.otherNote}</span>` : ''}
            ${log.category === 'Service' && log.serviceSede ? `<span style="font-size:11px;background:rgba(233,30,99,0.1);color:#e91e63;padding:2px 8px;border-radius:8px;margin-left:6px">📍 ${log.serviceSede}</span>` : ''}
            ${log.category === 'Service' && log.serviceTipo ? `<span style="font-size:11px;background:rgba(240,192,64,0.1);color:#f0c040;padding:2px 8px;border-radius:8px;margin-left:6px">🔧 ${log.serviceTipo}</span>` : ''}
            ${log.category === 'Service' && log.serviceTarga ? `<span style="font-size:11px;background:rgba(240,192,64,0.08);color:#f0c040;padding:2px 8px;border-radius:8px;margin-left:6px">🔖 ${log.serviceTarga}</span>` : ''}
            ${log.category === 'Info Noleggio' && log.noleggioRichiesta ? `<span style="font-size:11px;background:rgba(0,200,83,0.1);color:#00c853;padding:2px 8px;border-radius:8px;margin-left:6px">${log.noleggioRichiesta === 'RICHIESTA_CLIENTE' ? '📞 Richiesta cliente' : 'ℹ️ Solo Info'}</span>` : ''}
            ${log.category === 'Info Noleggio' && log.noleggioTipo ? `<span style="font-size:11px;background:rgba(0,200,83,0.1);color:#00c853;padding:2px 8px;border-radius:8px;margin-left:6px">🏷️ ${log.noleggioTipo}</span>` : ''}
            ${log.category === 'Info Noleggio' && log.noleggioLink ? `<a href="${log.noleggioLink}" target="_blank" rel="noopener" style="font-size:11px;background:rgba(0,200,83,0.1);color:#00c853;padding:2px 8px;border-radius:8px;margin-left:6px;text-decoration:none">🔗 Lead</a>` : ''}
            ${log.category === 'Info Vendita in Promo' ? `<span style="font-size:11px;background:rgba(240,192,64,0.15);color:#f0c040;padding:2px 8px;border-radius:8px;margin-left:6px">🎯 PROMO</span>` : ''}
            ${marca ? `<span style="font-size:11px;background:rgba(0,200,83,0.1);color:#00c853;padding:2px 8px;border-radius:8px;margin-left:6px">🚗 ${marca}${modello?' '+modello:''}</span>` : ''}
            ${log.linkAuto ? `<a href="${log.linkAuto}" target="_blank" rel="noopener" style="font-size:11px;background:rgba(124,77,255,0.1);color:#7c4dff;padding:2px 8px;border-radius:8px;margin-left:6px;text-decoration:none">🔗 Lead</a>` : ''}
        </td>
        <td style="font-size:12px;color:var(--text-secondary)">${(log.category !== 'Info Acquisto effettuato' && log.category !== 'Service') ? (log.otherNote||'—') : (log.acquistoNote||log.serviceNote||'—')}</td>
        <td style="font-size:12px;color:var(--text-secondary)">${log.user.fullName}</td>
        <td>${canEdit ? `<button class="btn-contact-action btn-orange" onclick="openEditContactModal(${log.id})" title="Modifica">✏️</button><button class="btn-contact-action btn-red" onclick="deleteContactLog(${log.id})" title="Elimina">🗑️</button>` : ''}</td>
    </tr>`;
}

function printDay(date) {
    const dayLogs = (currentDayView === date)
        ? getDayViewFilteredItems(date)
        : contactLogsFiltered.filter(l => l.contactDate.split('T')[0] === date);
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Registro ${date}</title><style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px}h2{font-size:16px;margin-bottom:10px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}th{background:#f0f0f0;font-weight:700;font-size:10px;text-transform:uppercase}@page{margin:15mm}</style></head><body>
        <h2>Registro Contatti — ${formatDateIT(date)}</h2>
        <table><thead><tr><th>Orario</th><th>Cliente</th><th>Categoria</th><th>Dettaglio</th><th>Marca/Modello</th><th>Operatore</th></tr></thead><tbody>
        ${dayLogs.map(log => `<tr><td>${log.contactDate.split('T')[1].substring(0,5)}</td><td>${clienteNomeCompleto(log)}<br>${clienteNumeroDisplay(log)}</td><td>${log.category}</td><td>${log.noleggioTipo||log.serviceTipo||log.otherNote||'—'}</td><td>${(log.marca||log.noleggioMarca)?(log.marca||log.noleggioMarca)+((log.modello||log.noleggioModello)?' '+(log.modello||log.noleggioModello):''):'—'}</td><td>${log.user.fullName}</td></tr>`).join('')}
        </tbody></table></body></html>`);
    win.document.close(); win.print();
}

function renderContactCalendar() {
    const container = document.getElementById('contactCalendar');
    const title = document.getElementById('contactCalendarTitle');
    if (!container || !title) return;
    title.textContent = `${MONTH_NAMES_IT[contactCalendarMonth-1]} ${contactCalendarYear}`;
    const firstDay = new Date(contactCalendarYear, contactCalendarMonth-1, 1);
    const daysInMonth = new Date(contactCalendarYear, contactCalendarMonth, 0).getDate();
    let startWeekday = firstDay.getDay();
    startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;
    const weekdays = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
    let html = weekdays.map(d => `<div class="cal-weekday">${d}</div>`).join('');
    for (let i = 0; i < startWeekday; i++) html += '<div class="cal-day cal-day-empty"></div>';
    const today = todayStr();
    const byDay = {};
    contactLogsFiltered.forEach(log => { const date = log.contactDate.split('T')[0]; if (!byDay[date]) byDay[date] = []; byDay[date].push(log); });
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${contactCalendarYear}-${String(contactCalendarMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const items = byDay[dateStr] || [];
        const isToday = dateStr === today;
        let bgStyle = '', borderStyle = '';
        if (items.length > 0) { const color = getDominantColor(items); bgStyle = `background:${color}33;`; borderStyle = `border-color:${color};`; }
        html += `<button type="button" class="cal-day ${isToday?'cal-day-today':''}" style="${bgStyle}${borderStyle}" onclick="showDayView('${dateStr}')">${day}</button>`;
    }
    container.innerHTML = html;
}

function changeContactCalendarMonth(delta) {
    contactCalendarMonth += delta;
    if (contactCalendarMonth > 12) { contactCalendarMonth = 1; contactCalendarYear++; }
    else if (contactCalendarMonth < 1) { contactCalendarMonth = 12; contactCalendarYear--; }
    renderContactCalendar();
}

function renderContactChartByOperator() {
    const ctx = document.getElementById('chartContactsByOperator');
    if (!ctx) return;
    if (contactChartByOperator) contactChartByOperator.destroy();
    const byOperator = {};
    contactLogs.forEach(log => { byOperator[log.user.fullName] = (byOperator[log.user.fullName]||0) + 1; });
    const total = Object.values(byOperator).reduce((a,b) => a+b, 0);
    const labels = Object.keys(byOperator);
    const data = labels.map(op => byOperator[op]);
    const colors = labels.map((_,i) => OPERATOR_COLORS[i%OPERATOR_COLORS.length]);
    const legendColor = getLegendColor();
    contactChartByOperator = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors.map(c => c+'bb'), borderColor: colors, borderWidth: 2 }] },
        options: {
            responsive: true, maintainAspectRatio: true,
            onClick: (evt, elements) => {
                if (elements.length === 0) return;
                const op = labels[elements[0].index];
                const items = contactLogs.filter(l => l.user.fullName === op);
                showGenericContactDetail(`Operatore — ${op}`, items);
            },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: { legend: { position: 'right', labels: { color: legendColor, font: { size: 12 }, padding: 14, boxWidth: 14,
                generateLabels: chart => chart.data.labels.map((label,i) => { const val = chart.data.datasets[0].data[i]; const pct = total > 0 ? Math.round(val*1000/total)/10 : 0; return { text: `${label}: ${val} (${pct}%)`, fillStyle: colors[i]+'bb', strokeStyle: colors[i], fontColor: legendColor, lineWidth: 0, index: i }; })
            } }, tooltip: { callbacks: { label: ctx => { const val = ctx.raw; const pct = total > 0 ? Math.round(val*1000/total)/10 : 0; return ` Valore: ${val} — ${pct}%`; } } } }
        }
    });
}

function selectSede(sede) {
    selectedSede = sede;
    document.getElementById('contactAppuntamentoSede').value = sede;
    SEDI_LIST.forEach(s => { const btn = document.getElementById(`sede-${s}`); if (btn) btn.classList.toggle('btn-sede-active', s===sede); });
}

function selectServiceSede(sede) {
    selectedServiceSede = sede;
    document.getElementById('contactServiceSede').value = sede;
    SERVICE_SEDI_LIST.forEach(s => { const btn = document.getElementById(`serviceSede-${s}`); if (btn) btn.classList.toggle('btn-sede-active', s===sede); });
}

function selectNoleggioRichiesta(richiesta) {
    selectedNoleggioRichiesta = richiesta;
    document.getElementById('contactNoleggioRichiesta').value = richiesta;
    ['SOLO_INFO','RICHIESTA_CLIENTE'].forEach(k => { const btn = document.getElementById(`noleggioRichiesta-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    const btn = document.getElementById(`noleggioRichiesta-${richiesta}`);
    if (btn) btn.classList.add('btn-sede-active');

    const dettagli = document.getElementById('contactNoleggioRichiestaDettagli');
    if (dettagli) dettagli.style.display = richiesta === 'RICHIESTA_CLIENTE' ? 'block' : 'none';

    if (richiesta === 'SOLO_INFO') {
        selectedNoleggioTipo = '';
        const tipoEl = document.getElementById('contactNoleggioTipo'); if (tipoEl) tipoEl.value = '';
        ['Privato','PIVA','Aziende'].forEach(k => { const b = document.getElementById(`noleggio-${k}`); if (b) b.classList.remove('btn-sede-active'); });
        const linkEl = document.getElementById('contactNoleggioLink'); if (linkEl) linkEl.value = '';
    }
}

function selectNoleggioTipo(tipo) {
    selectedNoleggioTipo = tipo;
    document.getElementById('contactNoleggioTipo').value = tipo;
    const keyMap = { 'Privato': 'Privato', 'Partita IVA': 'PIVA', 'Noleggio per aziende': 'Aziende' };
    Object.values(keyMap).forEach(k => { const btn = document.getElementById(`noleggio-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    const btn = document.getElementById(`noleggio-${keyMap[tipo]}`);
    if (btn) btn.classList.add('btn-sede-active');
}

function selectAcquisto(tipo) {
    selectedAcquisto = tipo;
    document.getElementById('contactAcquistoTipo').value = tipo;
    ['InfoConsegna','RitardoConsegna','InfoDocumentazione','SecondaChiave','InfoGeneriche'].forEach(k => { const btn = document.getElementById(`acquisto-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    const keyMap = { 'Info Consegna':'InfoConsegna','Ritardo Consegna':'RitardoConsegna','Info Documentazione':'InfoDocumentazione','Seconda chiave':'SecondaChiave','Info generiche':'InfoGeneriche' };
    const btn = document.getElementById(`acquisto-${keyMap[tipo]}`);
    if (btn) btn.classList.add('btn-sede-active');
    const noteRow = document.getElementById('contactAcquistoNoteRow');
    if (noteRow) noteRow.style.display = tipo === 'Info generiche' ? 'block' : 'none';
}

function selectService(tipo) {
    selectedService = tipo;
    document.getElementById('contactServiceTipo').value = tipo;
    ['Tagliando','DispositivoSatellitare','Prenotazione','LavorazioneInCorso','DoctorGlass','CambioGomme','Altro'].forEach(k => { const btn = document.getElementById(`service-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    const keyMap = { 'Tagliando':'Tagliando','Dispositivo satellitare':'DispositivoSatellitare','Prenotazione':'Prenotazione','Lavorazione in corso':'LavorazioneInCorso','Doctor Glass':'DoctorGlass','Cambio Gomme':'CambioGomme','Altro':'Altro' };
    const btn = document.getElementById(`service-${keyMap[tipo]}`);
    if (btn) btn.classList.add('btn-sede-active');

    const noteRow = document.getElementById('contactServiceNoteRow');
    const noteLabel = document.getElementById('contactServiceNoteLabel');
    if (tipo === 'Altro') {
        if (noteRow) noteRow.style.display = 'block';
        if (noteLabel) noteLabel.textContent = 'NOTA / MOTIVAZIONE *';
    } else if (tipo === 'Prenotazione') {
        if (noteRow) noteRow.style.display = 'block';
        if (noteLabel) noteLabel.textContent = 'PRENOTAZIONE PER... (opzionale)';
    } else {
        if (noteRow) noteRow.style.display = 'none';
        const noteEl = document.getElementById('contactServiceNote'); if (noteEl) noteEl.value = '';
    }
}

function selectServiceTipoCliente(tipo) {
    selectedServiceTipoCliente = tipo;
    document.getElementById('serviceTipoCliente').value = tipo;
    ['CLIENTE','NON_CLIENTE'].forEach(k => { const btn = document.getElementById(`serviceCliente-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    const btn = document.getElementById(`serviceCliente-${tipo}`);
    if (btn) btn.classList.add('btn-sede-active');

    const isCliente = tipo === 'CLIENTE';
    const targaLabel = document.getElementById('serviceTargaLabel');
    if (targaLabel) targaLabel.textContent = isCliente ? 'TARGA *' : 'TARGA (opzionale)';
}

function selectFonte(fonte) {
    selectedFonte = fonte;
    document.getElementById('contactFonte').value = fonte;
    const fonteKeyMap = { 'Sito':'Sito','Google ADS':'GoogleADS','Autoscout':'Autoscout','Facebook':'Facebook','Instagram':'Instagram','TikTok':'TikTok','Richiesta cliente':'RichiestaCliente','Non ricorda':'NonRicorda' };
    Object.keys(fonteKeyMap).forEach(f => { const btn = document.getElementById(`fonte-${fonteKeyMap[f]}`); if (btn) btn.classList.toggle('btn-sede-active', f===fonte); });
}

function toggleNonComunicaNominativo() {
    const checked = document.getElementById('nonComunicaNominativo')?.checked || false;
    const nomeEl = document.getElementById('clienteNome');
    const cognomeEl = document.getElementById('clienteCognome');
    if (checked) {
        nomeEl.placeholder = 'Nome Cliente (opzionale)';
        cognomeEl.placeholder = 'Cognome Cliente (opzionale)';
        nomeEl.value = '';
        cognomeEl.value = '';
    } else {
        nomeEl.placeholder = 'Nome Cliente *';
        cognomeEl.placeholder = 'Cognome Cliente *';
    }
}

async function createContactLog() {
    const category = document.getElementById('contactCategory').value;
    const clienteNome = document.getElementById('clienteNome')?.value.trim() || '';
    const clienteCognome = document.getElementById('clienteCognome')?.value.trim() || '';
    const clienteNumero = document.getElementById('clienteNumero')?.value.trim() || '';
    const nonComunicaNominativo = document.getElementById('nonComunicaNominativo')?.checked || false;
    const otherNote = document.getElementById('contactOtherNote').value.trim();
    const dateVal = document.getElementById('contactDate').value;
    const timeVal = document.getElementById('contactTime').value;
    const sede = document.getElementById('contactAppuntamentoSede')?.value || '';
    const link = document.getElementById('contactAppuntamentoLink')?.value.trim() || '';
    const acquistoTipo = document.getElementById('contactAcquistoTipo')?.value || '';
    const acquistoNote = document.getElementById('contactAcquistoNote')?.value.trim() || '';
    const fonte = document.getElementById('contactFonte')?.value || '';
    const serviceTipo = document.getElementById('contactServiceTipo')?.value || '';
    const serviceSede = document.getElementById('contactServiceSede')?.value || '';
    const serviceNote = document.getElementById('contactServiceNote')?.value.trim() || '';

    const marca = document.getElementById('contactMarca')?.value.trim() || '';
    const modello = document.getElementById('contactModello')?.value.trim() || '';
    const linkAuto = document.getElementById('contactLinkAuto')?.value.trim() || '';

    const noleggioMarca = document.getElementById('contactNoleggioMarca')?.value.trim() || '';
    const noleggioModello = document.getElementById('contactNoleggioModello')?.value.trim() || '';

    const noleggioRichiesta = document.getElementById('contactNoleggioRichiesta')?.value || '';
    const noleggioTipo = document.getElementById('contactNoleggioTipo')?.value || '';
    const noleggioLink = document.getElementById('contactNoleggioLink')?.value.trim() || '';
    const serviceTarga = document.getElementById('serviceTarga')?.value.trim() || '';
    const serviceTipoCliente = document.getElementById('serviceTipoCliente')?.value || '';

    if (!category) { alert('Seleziona una categoria'); return; }
    if (!nonComunicaNominativo) {
        if (!clienteNome) { alert('Inserisci il nome del cliente (o spunta "Non comunica nominativo")'); return; }
        if (!clienteCognome) { alert('Inserisci il cognome del cliente (o spunta "Non comunica nominativo")'); return; }
    }
    if (!clienteNumero) { alert('Inserisci il numero del cliente'); return; }
    if (!dateVal || !timeVal) { alert('Inserisci data e orario'); return; }
    if (category === 'Altro' && !otherNote) { alert('Inserisci la motivazione per "Altro"'); return; }
    if (category === 'Info + Appuntamento' && !sede) { alert('Seleziona la sede'); return; }
    if (category === 'Info + Appuntamento' && !fonte) { alert('Seleziona la fonte'); return; }
    if (category === 'Info Acquisto effettuato' && !acquistoTipo) { alert('Seleziona la tipologia acquisto'); return; }
    if (category === 'Info Vendita' && !fonte) { alert('Seleziona la fonte'); return; }
    if (category === 'Service' && !serviceSede) { alert('Seleziona la sede Service'); return; }
    if (category === 'Service' && !serviceTipo) { alert('Seleziona la tipologia service'); return; }
    if (category === 'Service' && serviceTipo === 'Altro' && !serviceNote) { alert('Inserisci la nota per Service Altro'); return; }
    if (category === 'Service' && !serviceTipoCliente) { alert('Seleziona Cliente o Non Cliente'); return; }
    if (category === 'Service' && serviceTipoCliente === 'CLIENTE' && !serviceTarga) { alert('Inserisci la targa'); return; }
    if (category === 'Info Noleggio' && !noleggioRichiesta) { alert('Seleziona Solo Info o Richiesta cliente'); return; }
    if (category === 'Info Noleggio' && noleggioRichiesta === 'RICHIESTA_CLIENTE' && !noleggioTipo) { alert('Seleziona la tipologia cliente'); return; }
    if (category === 'Info Vendita in Promo' && !fonte) { alert('Seleziona la fonte'); return; }

    if (category === 'Info Vendita in Promo') {
        const modelloRichiesto = document.getElementById('promoModelloRichiesto')?.value || '';
        if (!modelloRichiesto) { alert('Inserisci il modello richiesto'); return; }
        if (typeof promoFields === 'undefined' || promoFields.richiestaPromo === null) { alert('Seleziona Richiesta Promo'); return; }
        if (promoFields.propostaPromo === null) { alert('Seleziona Proposta Promo'); return; }
        if (promoFields.testDrive === null) { alert('Seleziona Test Drive'); return; }
        if (promoFields.appuntamento === null) { alert('Seleziona Appuntamento'); return; }
        if (promoFields.appuntamento === true && !document.getElementById('promoSedeAppuntamento')?.value) { alert('Seleziona la sede appuntamento'); return; }
    }

    const contactDate = `${dateVal}T${timeVal}:00`;
    const savedDayView = currentDayView || dateVal;

    let finalNote = otherNote;
    if (category === 'Info + Appuntamento') finalNote = sede;
    if (category === 'Info Acquisto effettuato') finalNote = acquistoTipo;
    if (category === 'Info Vendita') finalNote = fonte;
    if (category === 'Info Vendita in Promo') finalNote = fonte;

    const isNoleggio = category === 'Info Noleggio';
    const isRichiestaCliente = isNoleggio && noleggioRichiesta === 'RICHIESTA_CLIENTE';
    const isService = category === 'Service';

    const payload = {
        category,
        clienteNome: nonComunicaNominativo ? (clienteNome || null) : clienteNome,
        clienteCognome: nonComunicaNominativo ? (clienteCognome || null) : clienteCognome,
        clienteNumero,
        nonComunicaNominativo,
        otherNote: finalNote, contactDate,
        marca: isNoleggio ? (noleggioMarca || null) : (marca || null),
        modello: isNoleggio ? (noleggioModello || null) : (modello || null),
        linkAuto: isNoleggio ? null : (linkAuto || null),
        serviceTipo: serviceTipo||null,
        serviceNote: isService ? (serviceNote || null) : null,
        serviceSede: isService ? (serviceSede || null) : null,
        acquistoNote: acquistoNote||null,
        noleggioTipo: isRichiestaCliente ? (noleggioTipo||null) : null,
        noleggioLink: isRichiestaCliente ? (noleggioLink||null) : null,
        serviceTarga: isService ? (serviceTarga || null) : null,
        serviceTipoCliente: isService ? serviceTipoCliente : null,
        noleggioRichiesta: isNoleggio ? noleggioRichiesta : null
    };
    if (category === 'Info + Appuntamento') { payload.linkAppuntamento = link||null; payload.serviceTipo = fonte||null; }

    try {
        const res = await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) {
            const data = await res.json().catch(() => null);
            alert(data?.error || 'Errore nella creazione');
            return;
        }
        const savedLog = await res.json();
        if (category === 'Info Vendita in Promo' && typeof savePromoContact === 'function') await savePromoContact(savedLog.id);
        hideNewContactForm();
        const from = document.getElementById('contactFrom')?.value;
        const to = document.getElementById('contactTo')?.value;
        await loadContactLogs(from, to, savedDayView);
    } catch (err) { console.error('Errore creazione contatto:', err); }
}

async function deleteContactLog(id) {
    if (!confirm('Eliminare questo contatto?')) return;
    const savedDayView = currentDayView;
    try {
        await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
        const from = document.getElementById('contactFrom')?.value;
        const to = document.getElementById('contactTo')?.value;
        await loadContactLogs(from, to, savedDayView);
    } catch (err) { console.error('Errore eliminazione:', err); }
}

function openEditContactModal(id) {
    const log = contactLogs.find(l => l.id === id);
    if (!log) return;
    editingContactId = id;

    const categorySelect = document.getElementById('editContactCategory');
    if (categorySelect) {
        categorySelect.innerHTML = ALL_CATEGORIES.map(c => `<option value="${c}" ${c===log.category?'selected':''}>${c}</option>`).join('');
    }
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    setVal('editContactNome', log.clienteNome);
    setVal('editContactCognome', log.clienteCognome);
    setVal('editContactNumero', log.clienteNumero || (clienteNumeroDisplay(log) !== '—' ? clienteNumeroDisplay(log) : ''));
    setVal('editContactTarga', log.serviceTarga);

    const modal = document.getElementById('editContactModal');
    if (modal) modal.style.display = 'flex';
}

function closeEditContactModal(event) {
    if (event && event.target.id !== 'editContactModal') return;
    const modal = document.getElementById('editContactModal');
    if (modal) modal.style.display = 'none';
    editingContactId = null;
}

async function saveEditContactLog() {
    if (!editingContactId) return;
    const category = document.getElementById('editContactCategory')?.value || '';
    const clienteNome = document.getElementById('editContactNome')?.value.trim() || '';
    const clienteCognome = document.getElementById('editContactCognome')?.value.trim() || '';
    const clienteNumero = document.getElementById('editContactNumero')?.value.trim() || '';
    const serviceTarga = document.getElementById('editContactTarga')?.value.trim() || '';

    if (!category) { alert('Seleziona una categoria'); return; }
    if (!clienteNumero) { alert('Il numero cliente è obbligatorio'); return; }

    const savedDayView = currentDayView;
    try {
        const res = await fetch(`/api/contacts/${editingContactId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                category,
                clienteNome: clienteNome || null,
                clienteCognome: clienteCognome || null,
                clienteNumero,
                serviceTarga: serviceTarga || null
            })
        });
        if (!res.ok) {
            const data = await res.json().catch(() => null);
            alert(data?.error || 'Errore nel salvataggio');
            return;
        }
        closeEditContactModal();
        const from = document.getElementById('contactFrom')?.value;
        const to = document.getElementById('contactTo')?.value;
        await loadContactLogs(from, to, savedDayView);
    } catch (err) { console.error('Errore modifica:', err); }
}

function showNewContactForm() {
    const dateStr = currentDayView || todayStr();
    const now = new Date();
    document.getElementById('contactDate').value = dateStr;
    document.getElementById('contactTime').value = now.toTimeString().substring(0,5);
    document.getElementById('newContactForm').style.display = 'block';
    document.getElementById('newContactForm').scrollIntoView({ behavior: 'smooth' });
    updatePromoModelloField();
}

function hideNewContactForm() {
    document.getElementById('newContactForm').style.display = 'none';
    document.getElementById('contactCategory').value = '';
    document.getElementById('contactOtherNote').value = '';
    ['contactOtherNoteRow','contactAppuntamentoRow','contactAcquistoRow','contactAcquistoNoteRow',
     'contactFonteRow','contactServiceRow','contactMarcaModelloRow','contactLinkAutoRow',
     'contactPromoRow','contactNoleggioRow','contactServiceNoteRow']
        .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    const noleggioDettagli = document.getElementById('contactNoleggioRichiestaDettagli');
    if (noleggioDettagli) noleggioDettagli.style.display = 'none';
    ['clienteNome','clienteCognome','clienteNumero',
     'contactAppuntamentoSede','contactAppuntamentoLink',
     'contactAcquistoTipo','contactFonte','contactServiceTipo','contactServiceSede','contactServiceNote',
     'contactMarcaInput','contactMarca','contactModello','contactLinkAuto','contactAcquistoNote',
     'contactNoleggioMarcaInput','contactNoleggioMarca','contactNoleggioModello',
     'contactNoleggioTipo','contactNoleggioLink','contactNoleggioRichiesta',
     'serviceTarga','serviceTipoCliente']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const nonComEl = document.getElementById('nonComunicaNominativo');
    if (nonComEl) nonComEl.checked = false;
    document.getElementById('clienteNome').placeholder = 'Nome Cliente *';
    document.getElementById('clienteCognome').placeholder = 'Cognome Cliente *';
    selectedSede = ''; selectedAcquisto = ''; selectedFonte = ''; selectedService = ''; selectedServiceSede = ''; selectedNoleggioTipo = ''; selectedNoleggioRichiesta = '';
    SEDI_LIST.forEach(s => { const btn = document.getElementById(`sede-${s}`); if (btn) btn.classList.remove('btn-sede-active'); });
    SERVICE_SEDI_LIST.forEach(s => { const btn = document.getElementById(`serviceSede-${s}`); if (btn) btn.classList.remove('btn-sede-active'); });
    ['InfoConsegna','RitardoConsegna','InfoDocumentazione','SecondaChiave','InfoGeneriche'].forEach(k => { const btn = document.getElementById(`acquisto-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    ['Sito','GoogleADS','Autoscout','Facebook','Instagram','TikTok','RichiestaCliente','NonRicorda'].forEach(k => { const btn = document.getElementById(`fonte-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    ['Tagliando','DispositivoSatellitare','Prenotazione','LavorazioneInCorso','DoctorGlass','CambioGomme','Altro'].forEach(k => { const btn = document.getElementById(`service-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    ['Privato','PIVA','Aziende'].forEach(k => { const btn = document.getElementById(`noleggio-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    ['SOLO_INFO','RICHIESTA_CLIENTE'].forEach(k => { const btn = document.getElementById(`noleggioRichiesta-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    ['CLIENTE','NON_CLIENTE'].forEach(k => { const btn = document.getElementById(`serviceCliente-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    selectedServiceTipoCliente = '';
    const targaLabelReset = document.getElementById('serviceTargaLabel'); if (targaLabelReset) targaLabelReset.textContent = 'TARGA (opzionale)';
    if (typeof resetPromoForm === 'function') resetPromoForm();
}

function onCategoryChange() {
    const cat = document.getElementById('contactCategory').value;

    document.getElementById('contactOtherNoteRow').style.display = cat === 'Altro' ? 'block' : 'none';
    document.getElementById('contactAppuntamentoRow').style.display = cat === 'Info + Appuntamento' ? 'block' : 'none';
    document.getElementById('contactAcquistoRow').style.display = cat === 'Info Acquisto effettuato' ? 'block' : 'none';
    document.getElementById('contactServiceRow').style.display = cat === 'Service' ? 'block' : 'none';
    document.getElementById('contactNoleggioRow').style.display = cat === 'Info Noleggio' ? 'block' : 'none';
    document.getElementById('contactFonteRow').style.display = (cat === 'Info Vendita' || cat === 'Info + Appuntamento' || cat === 'Info Vendita in Promo') ? 'block' : 'none';

    const isVenditaLike = cat === 'Info Vendita' || cat === 'Info + Appuntamento' || cat === 'Info Vendita in Promo';
    document.getElementById('contactMarcaModelloRow').style.display = isVenditaLike ? 'block' : 'none';
    document.getElementById('contactLinkAutoRow').style.display = isVenditaLike ? 'block' : 'none';

    document.getElementById('contactPromoRow').style.display = cat === 'Info Vendita in Promo' ? 'block' : 'none';
    if (cat === 'Info Vendita in Promo') updatePromoModelloField();

    if (cat !== 'Info Noleggio') {
        selectedNoleggioTipo = ''; selectedNoleggioRichiesta = '';
        ['contactNoleggioTipo','contactNoleggioLink','contactNoleggioRichiesta','contactNoleggioMarcaInput','contactNoleggioMarca','contactNoleggioModello'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        ['Privato','PIVA','Aziende'].forEach(k=>{const b=document.getElementById(`noleggio-${k}`);if(b)b.classList.remove('btn-sede-active');});
        ['SOLO_INFO','RICHIESTA_CLIENTE'].forEach(k=>{const b=document.getElementById(`noleggioRichiesta-${k}`);if(b)b.classList.remove('btn-sede-active');});
        const dettagli = document.getElementById('contactNoleggioRichiestaDettagli'); if (dettagli) dettagli.style.display = 'none';
    }
    if (cat !== 'Info + Appuntamento') { selectedSede=''; const el=document.getElementById('contactAppuntamentoSede'); if(el) el.value=''; const l=document.getElementById('contactAppuntamentoLink'); if(l) l.value=''; SEDI_LIST.forEach(s=>{const b=document.getElementById(`sede-${s}`);if(b)b.classList.remove('btn-sede-active');}); }
    if (cat !== 'Info Acquisto effettuato') { selectedAcquisto=''; const el=document.getElementById('contactAcquistoTipo'); if(el) el.value=''; const nr=document.getElementById('contactAcquistoNoteRow'); if(nr) nr.style.display='none'; ['InfoConsegna','RitardoConsegna','InfoDocumentazione','SecondaChiave','InfoGeneriche'].forEach(k=>{const b=document.getElementById(`acquisto-${k}`);if(b)b.classList.remove('btn-sede-active');}); }
    if (cat !== 'Service') {
        selectedService=''; selectedServiceSede=''; selectedServiceTipoCliente='';
        const el=document.getElementById('contactServiceTipo'); if(el) el.value='';
        SERVICE_SEDI_LIST.forEach(s=>{const b=document.getElementById(`serviceSede-${s}`);if(b)b.classList.remove('btn-sede-active');});
        ['Tagliando','DispositivoSatellitare','Prenotazione','LavorazioneInCorso','DoctorGlass','CambioGomme','Altro'].forEach(k=>{const b=document.getElementById(`service-${k}`);if(b)b.classList.remove('btn-sede-active');});
        ['CLIENTE','NON_CLIENTE'].forEach(k=>{const b=document.getElementById(`serviceCliente-${k}`);if(b)b.classList.remove('btn-sede-active');});
        ['serviceTarga','serviceTipoCliente','contactServiceSede','contactServiceNote'].forEach(id=>{const e=document.getElementById(id);if(e) e.value='';});
        const noteRow = document.getElementById('contactServiceNoteRow'); if (noteRow) noteRow.style.display = 'none';
        const tl = document.getElementById('serviceTargaLabel'); if (tl) tl.textContent = 'TARGA (opzionale)';
    }
    if (!isVenditaLike) { selectedFonte=''; const el=document.getElementById('contactFonte'); if(el) el.value=''; ['Sito','GoogleADS','Autoscout','Facebook','Instagram','TikTok','RichiestaCliente','NonRicorda'].forEach(k=>{const b=document.getElementById(`fonte-${k}`);if(b)b.classList.remove('btn-sede-active');}); }
    if (!isVenditaLike) { ['contactMarcaInput','contactMarca','contactModello','contactLinkAuto'].forEach(id=>{const el=document.getElementById(id);if(el) el.value='';}); }
    if (cat !== 'Info Vendita in Promo' && typeof resetPromoForm === 'function') resetPromoForm();
}

function printContactLogs() { window.print(); }

function getWeekKey(dateStr) {
    const d = parseLocalDate(dateStr);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - day);
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `Settimana ${weekNo} — ${d.getFullYear()}`;
}

function formatDateIT(dateStr) {
    const d = parseLocalDate(dateStr);
    return d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}
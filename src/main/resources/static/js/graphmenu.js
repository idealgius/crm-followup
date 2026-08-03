// ===== MENU ☰ E PAGINA "TUTTI I GRAFICI" =====
// Il menu è pensato per contenere più opzioni in futuro — per ora solo
// "Mostra Grafici". Visibile solo se hasAccess('GRAFICI') (vedi app.js),
// controllato dalla matrice permessi (default: Moderatore in su).

// Definizione di ogni grafico disponibile: id univoco per la checkbox,
// etichetta, gruppo (per l'ordinamento nella pagina e per capire quali dati
// servono), tipo di elemento da creare (canvas per Chart.js, div per i bar
// custom di "Performance Marchi"), altezza consigliata, e la funzione di
// rendering (già parametrizzata per accettare un ID target diverso da
// quello originale — vedi contact.js/rent.js/service.js/charts.js).
const CHART_DEFINITIONS = [
    // --- Registro Contatti (usano il periodo scelto in questa pagina) ---
    { id: 'distribuzioneCategorie', label: 'Distribuzione Categorie', group: 'Registro Contatti', needs: 'contacts', type: 'canvas', height: 300,
      render: (id, data) => renderContactChartFromLogs(data.contacts, id) },
    { id: 'chiamateOperatore', label: 'Chiamate per Operatore', group: 'Registro Contatti', needs: 'contacts', type: 'canvas', height: 300,
      render: (id, data) => renderContactChartByOperator(id, data.contacts) },
    { id: 'appuntamentiSede', label: 'Appuntamenti per Sede', group: 'Registro Contatti', needs: 'contacts', type: 'canvas', height: 300,
      render: (id, data) => renderChartAppuntamentiSede(data.contacts, id) },
    { id: 'infoAcquisto', label: 'Info Acquisto Effettuato', group: 'Registro Contatti', needs: 'contacts', type: 'canvas', height: 300,
      render: (id, data) => renderChartInfoAcquisto(data.contacts, id) },
    { id: 'fonteVendita', label: 'Fonte Info Vendita', group: 'Registro Contatti', needs: 'contacts', type: 'canvas', height: 300,
      render: (id, data) => renderChartFonteVendita(data.contacts, id) },

    // --- Noleggio (dati correnti, non filtrati per data) ---
    { id: 'rentStato', label: 'Distribuzione Stato Trattative', group: 'Noleggio', needs: 'rent', type: 'canvas', height: 300,
      render: (id, data) => renderChartRentStato(data.rent, id) },
    { id: 'rentFonte', label: 'Fonte Trattative', group: 'Noleggio', needs: 'rent', type: 'canvas', height: 300,
      render: (id, data) => renderChartRentFonte(data.rent, id) },
    { id: 'rentMarchi', label: 'Performance Marchi', group: 'Noleggio', needs: 'rent', type: 'div', height: 'auto',
      render: (id, data) => renderChartRentMarchi(data.rent, id) },
    { id: 'rentInfoVsRichiesta', label: 'Info vs Richiesta Cliente', group: 'Noleggio', needs: 'rent', type: 'canvas', height: 300,
      render: (id, data) => renderChartRentInfoVsRichiesta(data.rent, id) },

    // --- Service (dati correnti, non filtrati per data) ---
    { id: 'serviceStato', label: 'Distribuzione Stato Pratiche', group: 'Service', needs: 'service', type: 'canvas', height: 300,
      render: (id, data) => renderChartServiceStato(data.service, id) },
    { id: 'serviceLavorazioni', label: 'Esito Appuntamenti/Lavorazioni', group: 'Service', needs: 'service', type: 'canvas', height: 300,
      render: (id, data) => renderChartServiceLavorazioni(data.service, id) },

    // --- Dashboard Follow-up ---
    { id: 'followUpChart', label: 'Follow-up Totali/Risposte/Appuntamenti', group: 'Dashboard', needs: 'followupStats', type: 'canvas', height: 300,
      render: (id, data) => renderFollowUpChart(data.followupStats, id) },
    { id: 'waitingChart', label: 'Recall (Attesa)', group: 'Dashboard', needs: 'waitingStats', type: 'canvas', height: 300,
      render: (id, data) => renderWaitingChart(data.waitingStats, id) }
];

const CHART_GROUP_ORDER = ['Registro Contatti', 'Noleggio', 'Service', 'Dashboard'];

let allChartsPreviousPage = null;
let allChartsLastSelection = [];

function toggleHamburgerMenu() {
    const dropdown = document.getElementById('hamburgerMenuDropdown');
    if (!dropdown) return;
    const isOpen = dropdown.style.display === 'block';
    dropdown.style.display = isOpen ? 'none' : 'block';
}

document.addEventListener('click', function(e) {
    const wrapper = document.getElementById('hamburgerMenuWrapper');
    const dropdown = document.getElementById('hamburgerMenuDropdown');
    if (!wrapper || !dropdown) return;
    if (!wrapper.contains(e.target)) dropdown.style.display = 'none';
});

function toggleGraphMenuSection() {
    const section = document.getElementById('graphMenuSection');
    const arrow = document.getElementById('graphMenuArrow');
    if (!section) return;
    const isOpen = section.style.display === 'block';
    section.style.display = isOpen ? 'none' : 'block';
    if (arrow) arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
    if (!isOpen && !document.getElementById('graphCheckboxList').dataset.built) {
        buildGraphCheckboxList();
    }
}

function buildGraphCheckboxList() {
    const list = document.getElementById('graphCheckboxList');
    if (!list) return;
    let html = '';
    CHART_GROUP_ORDER.forEach(group => {
        const items = CHART_DEFINITIONS.filter(c => c.group === group);
        if (items.length === 0) return;
        html += `<div style="font-size:10px;font-weight:700;color:#aab0c0;letter-spacing:0.5px;text-transform:uppercase;margin:10px 0 4px">${group}</div>`;
        items.forEach(c => {
            html += `<label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;color:#ffffff;cursor:pointer">
                <input type="checkbox" class="graph-checkbox" value="${c.id}" onchange="updateGraphSelectAllState()"> ${c.label}
            </label>`;
        });
    });
    list.innerHTML = html;
    list.dataset.built = '1';
}

function updateGraphSelectAllState() {
    const boxes = document.querySelectorAll('.graph-checkbox');
    const allChecked = Array.from(boxes).every(b => b.checked);
    const selectAll = document.getElementById('graphSelectAll');
    if (selectAll) selectAll.checked = allChecked;
}

function toggleSelectAllGraphs() {
    const selectAll = document.getElementById('graphSelectAll');
    document.querySelectorAll('.graph-checkbox').forEach(b => { b.checked = selectAll.checked; });
}

// ===== APERTURA PAGINA "TUTTI I GRAFICI" =====
async function openAllChartsPage() {
    const selected = Array.from(document.querySelectorAll('.graph-checkbox:checked')).map(b => b.value);
    if (selected.length === 0) {
        alert('Seleziona almeno un grafico prima di procedere.');
        return;
    }
    allChartsLastSelection = selected;

    // Ricorda la pagina attuale per poterci tornare con "Indietro".
    allChartsPreviousPage = sessionStorage.getItem('currentPage') || 'dashboard';

    document.getElementById('hamburgerMenuDropdown').style.display = 'none';
    document.querySelectorAll('.page').forEach(p => { if (!p.closest('#allChartsPage')) p.style.display = 'none'; });
    document.getElementById('allChartsPage').style.display = 'block';
    window.scrollTo(0, 0);

    if (!document.getElementById('allChartsFrom').value) {
        const today = new Date().toISOString().split('T')[0];
        const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
        document.getElementById('allChartsFrom').value = firstDay;
        document.getElementById('allChartsTo').value = today;
    }

    await renderAllChartsSelection();
}

function closeAllChartsPage() {
    document.getElementById('allChartsPage').style.display = 'none';
    if (typeof showPage === 'function') showPage(allChartsPreviousPage || 'dashboard', false);
}

async function reloadAllChartsPage() {
    await renderAllChartsSelection();
}

// Recupera solo i dati effettivamente necessari per i grafici selezionati
// (non tutti e 4 i gruppi ogni volta) — evita richieste inutili quando, per
// esempio, si è scelto di vedere solo i grafici di Service.
async function fetchDataForSelection(defs) {
    const needsSet = new Set(defs.map(d => d.needs));
    const data = {};

    if (needsSet.has('contacts')) {
        const from = document.getElementById('allChartsFrom').value;
        const to = document.getElementById('allChartsTo').value;
        try {
            const res = await fetch(`/api/contacts?from=${from}&to=${to}`);
            data.contacts = res.ok ? await res.json() : [];
        } catch (err) { console.error('Errore caricamento contatti per Grafici:', err); data.contacts = []; }
        // Allineata alla globale usata da exportContactsExcel() e dalle
        // funzioni grafico stesse, così anche l'export Excel da questa
        // pagina funziona con lo stesso periodo scelto qui.
        if (typeof contactLogsFiltered !== 'undefined') contactLogsFiltered = data.contacts;
        if (typeof contactLogs !== 'undefined') contactLogs = data.contacts;
    }
    if (needsSet.has('rent')) {
        try {
            const res = await fetch('/api/noleggio/trattative');
            data.rent = res.ok ? await res.json() : [];
        } catch (err) { console.error('Errore caricamento trattative per Grafici:', err); data.rent = []; }
    }
    if (needsSet.has('service')) {
        try {
            const res = await fetch('/api/service/pratiche');
            data.service = res.ok ? await res.json() : [];
        } catch (err) { console.error('Errore caricamento pratiche per Grafici:', err); data.service = []; }
    }
    if (needsSet.has('followupStats')) {
        const from = document.getElementById('allChartsFrom').value;
        const to = document.getElementById('allChartsTo').value;
        try {
            const res = await fetch(`/api/stats/followups?from=${from}&to=${to}`);
            data.followupStats = res.ok ? await res.json() : { total: 0, responded: 0, appointments: 0, abandoned: 0 };
        } catch (err) { console.error('Errore caricamento stats follow-up per Grafici:', err); }
    }
    if (needsSet.has('waitingStats')) {
        try {
            const res = await fetch('/api/stats/waiting');
            data.waitingStats = res.ok ? await res.json() : {};
        } catch (err) { console.error('Errore caricamento stats recall per Grafici:', err); }
    }
    return data;
}

const CHART_GROUP_ICON = { 'Registro Contatti': '📞', 'Noleggio': '🚗', 'Service': '🔧', 'Dashboard': '📊' };

async function renderAllChartsSelection() {
    const container = document.getElementById('allChartsContainer');
    if (!container) return;
    const defs = CHART_DEFINITIONS.filter(c => allChartsLastSelection.includes(c.id));
    container.innerHTML = `<div class="empty-state"><p>Caricamento grafici…</p></div>`;

    const data = await fetchDataForSelection(defs);

    // FIX: prima ogni gruppo (Registro Contatti/Noleggio/Service/Dashboard)
    // aveva la sua griglia separata — se si selezionava un solo grafico per
    // gruppo, finivano ognuno da solo sulla propria riga anche quando c'era
    // spazio per stare affiancati. Ora è UN'UNICA griglia per tutti i
    // grafici selezionati (ordinati per gruppo, ma senza titoli di sezione
    // che "spezzano" la riga) — il gruppo di appartenenza diventa una
    // piccola etichetta sulla card stessa, non più un divisore.
    const orderedDefs = CHART_GROUP_ORDER.flatMap(group => defs.filter(d => d.group === group));

    // FIX: prima la dimensione era sempre la stessa, che se ne scegliesse 1
    // o 13. Ora, se se ne scelgono pochi (1-3), le card sono un po' più
    // grandi per sfruttare meglio lo spazio libero — da 4 in su (compreso
    // "tutti") resta la dimensione standard di sempre, che già funzionava
    // bene e non va toccata.
    const n = orderedDefs.length;
    let colMin = 380, colMax = 520, heightBonus = 0;
    if (n === 1) { colMin = 600; colMax = 820; heightBonus = 110; }
    else if (n === 2) { colMin = 480; colMax = 620; heightBonus = 60; }
    else if (n === 3) { colMin = 420; colMax = 540; heightBonus = 30; }

    let html = `<div class="chart-grid-allcharts" style="grid-template-columns:repeat(auto-fit, minmax(${colMin}px, ${colMax}px))">`;
    orderedDefs.forEach(d => {
        const targetId = `ac_${d.id}`;
        const inner = d.type === 'canvas'
            ? `<canvas id="${targetId}"></canvas>`
            : `<div id="${targetId}"></div>`;
        const cardHeight = d.height === 'auto' ? 'auto' : (d.height + heightBonus) + 'px';
        html += `<div class="chart-card">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px">
                <h3 style="margin-bottom:0">${d.label}</h3>
                <span style="font-size:10px;font-weight:700;color:var(--text-secondary);background:var(--step-bg);border:1px solid var(--border);border-radius:8px;padding:2px 8px;white-space:nowrap">${CHART_GROUP_ICON[d.group] || ''} ${d.group}</span>
            </div>
            <!-- NUOVO: totale voci del periodo — visibile SOLO in questa
                 pagina (Mostra Grafici), popolato dopo il rendering perché
                 dipende dai dati appena caricati. -->
            <div id="total_${d.id}" style="font-size:11px;font-weight:800;color:#f0c040;background:rgba(240,192,64,0.12);display:inline-block;padding:3px 10px;border-radius:10px;margin-bottom:8px"></div>
            <div style="height:${cardHeight}">${inner}</div>
        </div>`;
    });
    html += `</div>`;
    container.innerHTML = html;

    // Rendering dopo aver inserito i canvas/div nel DOM (getElementById
    // deve trovarli già presenti). Ogni funzione ora restituisce la
    // propria istanza Chart.js (o, per "Performance Marchi" che non usa
    // Chart.js, direttamente il totale come numero) — da lì si ricava il
    // totale voci del periodo, mostrato SOLO in questa pagina.
    defs.forEach(d => {
        try {
            const result = d.render(`ac_${d.id}`, data);
            const totalEl = document.getElementById(`total_${d.id}`);
            if (!totalEl) return;
            let total = null;
            if (typeof result === 'number') {
                total = result;
            } else if (result && result.data && result.data.datasets && result.data.datasets[0]) {
                total = result.data.datasets[0].data.reduce((a, b) => a + (Number(b) || 0), 0);
            }
            totalEl.textContent = total !== null ? `Totale periodo: ${total}` : '';
        } catch (err) {
            console.error(`Errore rendering grafico "${d.label}":`, err);
        }
    });
}

function printAllChartsPage() {
    window.print();
}

// FIX: non esiste (ancora) un unico export Excel che combini dati di
// Contatti/Noleggio/Service/Dashboard in un solo file — servirebbe un nuovo
// endpoint dedicato sul backend. Per ora si riusano gli export già
// esistenti e funzionanti di ogni sezione: se sono selezionati grafici di
// più gruppi, si scaricano più file distinti (uno per gruppo), invece di
// bloccare la funzione o costruire qualcosa di nuovo e non testato.
function exportAllChartsExcel() {
    const groups = new Set(CHART_DEFINITIONS.filter(c => allChartsLastSelection.includes(c.id)).map(c => c.group));
    let exported = 0;
    if (groups.has('Registro Contatti') && typeof exportContactsExcel === 'function') { exportContactsExcel(); exported++; }
    if (groups.has('Noleggio') && typeof exportRentExcel === 'function') { exportRentExcel(); exported++; }
    if (groups.has('Service') && typeof exportServiceExcel === 'function') { exportServiceExcel(); exported++; }
    if (groups.has('Dashboard')) {
        alert('I grafici della Dashboard non hanno ancora un export Excel dedicato.');
    }
    if (exported > 1) {
        alert(`Sono stati avviati ${exported} download separati (uno per ogni area: Registro Contatti/Noleggio/Service) — non esiste ancora un unico file Excel combinato.`);
    }
}
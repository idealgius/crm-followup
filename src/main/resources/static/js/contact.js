let contactLogs = [];

// FIX: "Totale storico" nei badge sotto i grafici NON deve mai cambiare in
// base ai filtri attivi (data, operatore, categoria) — prima veniva
// calcolato su contactLogs, che è limitato all'intervallo di date filtrato,
// quindi cambiava ogni volta che si cambiavano le date. Ora arriva da un
// endpoint dedicato che conta su TUTTO il database, senza alcun filtro.
let contactStatsTotaliStorici = null;

// Per l'icona 📁 Storico Cliente — Set con numeri/nomi che hanno DAVVERO
// più di una registrazione in tutta la storia (non solo nel periodo
// caricato). Ricaricati insieme ai contatti, stesso schema di
// loadContactStatsTotaliStorici sopra.
let clientiConStoricoNumeri = new Set();
let clientiConStoricoNomi = new Set();
async function loadClientiConStorico() {
    try {
        const res = await fetch('/api/contacts/clienti-con-storico');
        if (!res.ok) return;
        const data = await res.json();
        clientiConStoricoNumeri = new Set(data.numeri || []);
        clientiConStoricoNomi = new Set(data.nomi || []);
    } catch (err) {
        console.error('Errore caricamento clienti con storico:', err);
    }
}

async function loadContactStatsTotaliStorici() {
    try {
        const res = await fetch('/api/contacts/stats-totali-storici');
        if (!res.ok) return;
        contactStatsTotaliStorici = await res.json();
    } catch (err) {
        console.error('Errore caricamento totali storici:', err);
    }
}
let contactLogsFiltered = [];
let contactCalendarYear = new Date().getFullYear();
let contactCalendarMonth = new Date().getMonth() + 1;
let selectedSede = '';
let selectedAcquisto = '';
let selectedAcquistoAlert = false;
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
let detailOnlyAlert = false;
let detailGestioneFilter = '';
let detailCategoryFilter = '';
let dayViewSecondaryFilter = '';
let dayViewTertiaryFilter = '';
let editingContactId = null;
let acquistoAlertModalId = null;
let acquistoAlertNoteGestioneVisible = false;
let acquistoAlertNoteGestitaVisible = false;
let acquistoAlertDaGestireShownThisSession = false;

// Controlla ogni minuto se sono passati i 30 minuti dall'ultima volta che
// il popup "Da Gestire" è stato mostrato — se sì e ci sono ancora allert
// non gestiti, lo rimostra da solo (vedi checkAcquistoAlertDaGestire).
setInterval(() => { if (typeof checkAcquistoAlertDaGestire === 'function') checkAcquistoAlertDaGestire(); }, 60 * 1000);

const CATEGORY_COLORS = {
    'Info Vendita': '#1a4080',
    'Info Noleggio': '#00c853',
    'Service': '#f0c040',
    'Info Acquisto effettuato': '#4a90d9',
    'Pratica Leasing': '#7c4dff',
    'Pratica Finanziamento': '#ff9800',
    'Amministrazione': '#00bcd4',
    'Info + Appuntamento': '#e91e63',
    'Info Vendita in Promo': '#f0c040',
    'Altro': '#8a8faa'
};
const ALL_CATEGORIES = [
    'Info Vendita', 'Info Noleggio', 'Service', 'Info Acquisto effettuato',
    'Pratica Leasing', 'Pratica Finanziamento', 'Amministrazione',
    'Info + Appuntamento', 'Info Vendita in Promo', 'Altro'
];
const ACQUISTO_LIST = ['Info Consegna', 'Ritardo Consegna', 'Info Documentazione', 'Seconda chiave', 'Furto', 'Saldo', 'Info generiche'];

// FIX: "Altro" è grigio (#8a8faa) — corretto in modalità chiara, ma poco
// leggibile in modalità scura (sia nella legenda del grafico Distribuzione
// Categorie, sia nelle celle del calendario). Diventa bianco solo in
// modalità scura. Funzione condivisa, usata in entrambi i punti così
// restano sempre coerenti tra loro.
function getCategoryColor(category) {
    if (category === 'Altro') {
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        return isDark ? '#ffffff' : '#8a8faa';
    }
    return CATEGORY_COLORS[category] || '#1a4080';
}
// FIX v3: il rosso di Ritardo Consegna andava bene, il problema era Furto
// (magenta troppo vicino al rosso). Furto passa a un magenta/orchidea più
// acceso e distante — 7 tinte: blu, rosso, verde acqua, oro, magenta
// acceso, verde, viola.
const ACQUISTO_COLORS = ['#4a90d9', '#ff3d3d', '#009688', '#f0c040', '#e040fb', '#00c853', '#7c4dff'];
const FONTE_LIST = ['Sito', 'Google ADS', 'Autoscout', 'Facebook', 'Instagram', 'TikTok', 'Richiesta cliente', 'Non ricorda'];
const FONTE_COLORS = ['#1a4080', '#f0c040', '#e91e63', '#4a90d9', '#7c4dff', '#ff3d3d', '#00c853', '#8a8faa'];
const SERVICE_LIST = ['Tagliando', 'Dispositivo satellitare', 'Prenotazione', 'Lavorazione in corso', 'Doctor Glass', 'Cambio Gomme', 'Altro'];
const SERVICE_COLORS = ['#f0c040', '#4a90d9', '#00c853', '#7c4dff', '#ff9800', '#00bcd4', '#8a8faa'];
const SERVICE_SEDI_LIST = ['Agnano', 'Salerno'];
const SEDI_LIST = ['Agnano', 'Casamarciano', 'Salerno'];
const SEDE_COLORS = ['#e91e63', '#1a4080', '#00c853'];
const NOLEGGIO_TIPO_LIST = ['Privato', 'Partita IVA', 'Noleggio per aziende'];
const NOLEGGIO_RICHIESTA_LABELS = { 'SOLO_INFO': 'Solo Info', 'RICHIESTA_CLIENTE': 'Richiesta Cliente' };
const ACQUISTO_ALERT_LABELS = { 'SI': '🔔 Con Allert', 'NO': 'Senza Allert' };
const ACQUISTO_ALERT_STATUS_LABELS = { 'DA_GESTIRE': '⚪ Da gestire', 'IN_GESTIONE': '🟡 In gestione', 'GESTITA': '🟢 Gestita' };
const MARCHE_LIST = [
    'ALFA ROMEO', 'AUDI', 'BMW', 'BYD', 'CITROEN', 'CUPRA', 'DACIA', 'DR', 'DS', 'EVO',
    'FIAT', 'FORD', 'FERRARI', 'HYUNDAI', 'ICH-X', 'INFINITI', 'IVECO', 'JAECOO', 'JEEP',
    'KIA', 'LAMBORGHINI', 'LANCIA', 'LAND ROVER', 'LEAPMOTOR', 'MAXUS', 'MAZDA',
    'MARCA GENERICA', 'MASERATI', 'MERCEDES-BENZ', 'MG', 'MINI', 'MITSUBISHI', 'NISSAN', 'OMODA', 'OPEL',
    'PEUGEOT', 'PORSCHE', 'RENAULT', 'SAAB', 'SEAT', 'SKODA', 'SMART', 'SPORTEQUIPE',
    'SUZUKI', 'SWM', 'TIGER', 'TOYOTA', 'TESLA', 'VOLKSWAGEN'
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
// ============================================================
// NOTIFICA ISTANTANEA NUOVI ALLERT — suono + titolo scheda lampeggiante +
// notifica desktop del sistema operativo. Si attivano quando un evento
// WebSocket porta un allert che diventa "da gestire e visibile" per
// l'utente corrente, senza aspettare refresh, cambio finestra o il
// ricontrollo periodico (checkAcquistoAlertDaGestire).
// ============================================================

let notifTitleFlashIntervalId = null;
const notifOriginalTitle = document.title;

// Beep generato via Web Audio API (nessun file audio da caricare/servire).
function playAlertSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const beep = (freq, startOffset, dur) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime + startOffset);
            gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + startOffset + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startOffset + dur);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + startOffset);
            osc.stop(ctx.currentTime + startOffset + dur + 0.05);
        };
        beep(880, 0, 0.15);
        beep(1046, 0.18, 0.18);
    } catch (err) {
        console.warn('Audio non disponibile per notifica allert:', err);
    }
}

// Fa lampeggiare il titolo della scheda del browser finché l'utente non
// torna sulla finestra/scheda (focus) — visibile anche se il CRM è in una
// scheda in background o dietro ad altre finestre.
function flashPageTitle(message) {
    if (notifTitleFlashIntervalId) return; // già in corso, non sovrapporre
    let toggled = false;
    notifTitleFlashIntervalId = setInterval(() => {
        document.title = toggled ? notifOriginalTitle : message;
        toggled = !toggled;
    }, 1000);
    const stop = () => {
        if (notifTitleFlashIntervalId) {
            clearInterval(notifTitleFlashIntervalId);
            notifTitleFlashIntervalId = null;
            document.title = notifOriginalTitle;
        }
        window.removeEventListener('focus', stop);
        document.removeEventListener('visibilitychange', onVis);
    };
    const onVis = () => { if (!document.hidden) stop(); };
    window.addEventListener('focus', stop);
    document.addEventListener('visibilitychange', onVis);
}

// Chiesto UNA volta (se non già concesso/negato) appena sappiamo che
// l'utente può gestire allert — deve restare una richiesta "silenziosa" via
// codice, il browser mostra comunque il proprio popup di conferma nativo.
function ensureNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
    }
}

// Notifica di sistema (fuori dal browser, visibile anche con altre finestre
// in primo piano) — richiede permesso già concesso, altrimenti non fa nulla
// silenziosamente (niente popup di richiesta permesso a metà flusso).
function showDesktopNotification(log) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
        const n = new Notification('🔔 Nuovo Allert — ' + clienteNomeCompleto(log), {
            body: `Segnalato da ${log.user?.fullName || '—'}`,
            tag: 'acquisto-alert-' + log.id // stesso id -> aggiorna invece di accumulare notifiche duplicate
        });
        n.onclick = () => {
            window.focus();
            closeAcquistoAlertDaGestireModal();
            openAcquistoAlertModal(log.id);
            n.close();
        };
    } catch (err) {
        console.warn('Notifica desktop non disponibile:', err);
    }
}

function notifyNewAcquistoAlert(log) {
    playAlertSound();
    flashPageTitle('🔔 Nuovo Allert!');
    showDesktopNotification(log);
}

// Chi vede il popup "Da Gestire" per un dato allert:
// - se l'allert è "a tutti" (alertNotifyAll true/default) -> comportamento
//   storico invariato, solo chi ha permessi di gestione lo vede (è la coda
//   generale di lavoro dei gestori)
// - se l'allert è mirato a destinatari specifici (alertNotifyAll false) ->
//   lo vede SOLO chi è nella lista destinatari, qualunque sia il suo ruolo,
//   perché è stato scelto esplicitamente (anche un semplice UTENTE deve
//   poterlo vedere, altrimenti la funzione "invia a un utente specifico"
//   non avrebbe alcun effetto per lui).
function canSeeAlertPopup(log) {
    if (log.alertNotifyAll === false) return alertIsVisibleToCurrentUser(log);
    return canManageAlerts();
}

// Un log "conta" come allert nuovo/da notificare per l'utente corrente se:
// ha un allert attivo, non è ancora GESTITA, ed è visibile a lui secondo
// canSeeAlertPopup (coda generale per i gestori, oppure destinatario
// specifico per chiunque altro).
function isAlertPendingForCurrentUser(log) {
    return !!log && hasAcquistoAlert(log) && log.acquistoAlertStatus !== 'GESTITA' && canSeeAlertPopup(log);
}

function canManageAlerts() {
    // NUOVO ruolo BACKOFFICE: stesso potere del Moderatore per la gestione
    // allert Info Acquisto — ma NON per l'eliminazione/modifica dei contatti
    // altrui (quella resta gestita separatamente in renderContactRow, dove
    // BACKOFFICE non viene aggiunto alla lista dei ruoli con pieni poteri,
    // quindi può modificare/eliminare solo i propri, come un UTENTE/BDC).
    return currentUser && (currentUser.role === 'MODERATORE' || currentUser.role === 'GESTORE' || currentUser.role === 'ADMIN' || currentUser.role === 'BACK_OFFICE');
}
// L'allert è condiviso da Info Acquisto effettuato, Pratica Leasing e
// Pratica Finanziamento — stesso meccanismo, tre categorie.
const ALERT_ELIGIBLE_CATEGORIES = ['Info Acquisto effettuato', 'Pratica Leasing', 'Pratica Finanziamento', 'Amministrazione'];
function hasAcquistoAlert(log) {
    return ALERT_ELIGIBLE_CATEGORIES.includes(log.category) && !!log.acquistoAlert;
}
function acquistoAlertVisual(log) {
    if (log.acquistoAlertStatus === 'GESTITA') return { color: '#00c853', bg: 'rgba(0,200,83,0.15)', icon: '🟢', label: 'Gestita' };
    if (log.acquistoAlertStatus === 'IN_GESTIONE') return { color: '#f0c040', bg: 'rgba(240,192,64,0.18)', icon: '🟡', label: 'In gestione' };
    return { color: '#ff9800', bg: 'rgba(255,152,0,0.15)', icon: '🔔', label: 'Da gestire' };
}
function acquistoAlertNameColor(log) {
    if (!ALERT_ELIGIBLE_CATEGORIES.includes(log.category) || !log.acquistoAlert) return null;
    return acquistoAlertVisual(log).color;
}
// FIX: il backend restituisce acquistoAlertInGestioneAt/acquistoAlertGestitaAt
// come LocalDateTime senza indicazione di fuso orario (es. "2026-07-21T11:45:00").
// Senza la 'Z' finale, JS lo interpreta erroneamente già come ora locale,
// causando uno sfasamento di 2 ore (l'orario salvato è in realtà UTC).
// Aggiungendo 'Z' se assente, forziamo JS a trattarlo come UTC e convertirlo
// correttamente in locale — stesso fix già applicato in waiting.js
// (formatDateTimeWaiting).
function formatDateTimeIT(isoString) {
    if (!isoString) return null;
    try {
        const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(isoString);
        const normalized = hasTimezone ? isoString : isoString + 'Z';
        const d = new Date(normalized);
        if (isNaN(d.getTime())) return null;
        const date = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        return `${date} · ${time}`;
    } catch (e) { return null; }
}
// FIX: gestisce sia il caso in cui acquistoAlertInGestioneDa/acquistoAlertGestitaDa
// siano una stringa semplice, sia il caso in cui il backend restituisca un
// oggetto {id, fullName, role} (come già visto con gestitoDa in Rent). Senza
// questo fix, stampare un oggetto dentro un template literal produce
// letteralmente "[object Object]" invece del nome dell'operatore.
function acquistoAlertAuditInfo(log) {
    const nameOf = (val) => {
        if (!val) return null;
        if (typeof val === 'string') return val;
        if (typeof val === 'object') return val.fullName || val.name || null;
        return null;
    };
    const build = (nomeField, atField) => {
        const nome = nameOf(log[nomeField]);
        const when = formatDateTimeIT(log[atField]);
        if (!nome && !when) return null;
        return `👤 ${nome || '—'}${when ? ' · 🕐 ' + when : ''}`;
    };
    return {
        inGestione: build('acquistoAlertInGestioneDa', 'acquistoAlertInGestioneAt'),
        gestita: build('acquistoAlertGestitaDa', 'acquistoAlertGestitaAt'),
        noteGestioneInserita: build('acquistoAlertNoteGestioneInseritaDa', 'acquistoAlertNoteGestioneInseritaAt'),
        noteGestioneModificata: build('acquistoAlertNoteGestioneModificataDa', 'acquistoAlertNoteGestioneModificataAt'),
        noteGestitaInserita: build('acquistoAlertNoteGestitaInseritaDa', 'acquistoAlertNoteGestitaInseritaAt'),
        noteGestitaModificata: build('acquistoAlertNoteGestitaModificataDa', 'acquistoAlertNoteGestitaModificataAt')
    };
}
// NUOVO: apre il popup di dettaglio con TUTTI i contatti di una categoria,
// su tutta la storia (non limitati al periodo attualmente filtrato a
// schermo) — così un allert "da gestire" creato prima del periodo scelto in
// "DATA" non sparisce semplicemente perché non è nel giro di date corrente.
// Riusa showGenericContactDetail, che ha già i filtri "solo con allert" e
// Da gestire/In gestione/Gestita — qui si parte con "solo con allert" già
// attivo, dato che è lo scopo per cui si clicca questa barra.
async function openCategoryStoricoDetail(category, titlePrefix) {
    try {
        const res = await fetch(`/api/contacts/by-category-storico?category=${encodeURIComponent(category)}`);
        if (!res.ok) { alert('Errore nel caricamento dello storico completo'); return; }
        const items = await res.json();
        showGenericContactDetail(`${titlePrefix} — Storico completo`, items);
        detailOnlyAlert = true;
        renderGenericContactDetail();
    } catch (err) {
        console.error('Errore caricamento storico categoria:', err);
        alert('Errore nel caricamento dello storico completo');
    }
}

function findChartTitleElement(canvas) {
    if (!canvas) return null;
    const sizedWrapper = canvas.parentElement;
    // NUOVO: struttura attuale — l'h3 è fratello del div che dà l'altezza
    // al grafico (non più suo genitore diretto), entrambi dentro un div
    // "gruppo" comune. Cercare qui PRIMA evita che il fallback più sotto
    // prenda il primo h3 di TUTTA la card quando la card contiene più
    // grafici (es. Info Acquisto + Fonte Vendita nella stessa card) — bug
    // che faceva sovrascrivere il badge sbagliato al grafico sbagliato.
    if (sizedWrapper && sizedWrapper.previousElementSibling && sizedWrapper.previousElementSibling.tagName === 'H3') {
        return sizedWrapper.previousElementSibling;
    }
    // Struttura precedente: h3 diretto fratello del canvas stesso.
    let h3 = sizedWrapper ? sizedWrapper.querySelector(':scope > h3') : null;
    if (h3) return h3;
    // Fallback più mirato: h3 dentro lo stesso "gruppo" immediato (il nonno
    // del canvas), non l'intera .chart-card.
    const group = sizedWrapper ? sizedWrapper.parentElement : null;
    h3 = group ? group.querySelector(':scope > h3') : null;
    if (h3) return h3;
    // Ultima spiaggia, come prima.
    const card = canvas.closest('.chart-card');
    return card ? card.querySelector('h3') : null;
}
function setChartCounterBadge(afterElement, count, label, onClick) {
    if (!afterElement) return;
    let badge = afterElement.nextElementSibling;
    if (!badge || !badge.classList || !badge.classList.contains('chart-counter-badge')) {
        badge = document.createElement('div');
        badge.className = 'chart-counter-badge';
        badge.style.cssText = 'font-size:11px;font-weight:800;color:#f0c040;background:rgba(240,192,64,0.12);display:inline-block;padding:3px 10px;border-radius:10px;margin-bottom:10px';
        afterElement.insertAdjacentElement('afterend', badge);
    }
    badge.textContent = `${label}: ${count}`;
    // NUOVO: se viene passato un gestore click, la barra intera diventa
    // cliccabile — usata per esempio dal badge "Totale storico" di Info
    // Acquisto, che apre la lista di TUTTI gli allert (anche più vecchi del
    // periodo filtrato a schermo).
    if (onClick) {
        badge.style.cursor = 'pointer';
        badge.title = 'Clicca per vedere tutti gli allert, su tutta la storia';
        badge.onclick = onClick;
    } else {
        badge.style.cursor = '';
        badge.onclick = null;
    }
}
function updateServiceCounterBadge() {
    const canvas = document.getElementById('chartServiceAgnano');
    const h3 = findChartTitleElement(canvas);
    if (!h3) return;
    const total = contactStatsTotaliStorici?.service ?? contactLogs.filter(l => l.category === 'Service').length;
    setChartCounterBadge(h3, total, 'Totale storico');
}
function showMarcheDropdown() { filterMarche('', true); }
function filterMarche(query, showAll) {
    const dropdown = document.getElementById('marcaDropdown');
    if (!dropdown) return;
    const matches = (!query || query.trim() === '' || showAll) ? MARCHE_NORMALIZED : MARCHE_NORMALIZED.filter(m => m.normalized.includes(normalizeText(query.trim())));
    if (matches.length === 0) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(m => `
        <div onclick="selectMarca('${m.original}')" style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
            ${m.original}
        </div>`).join('');
    dropdown.style.display = 'block';
}
function selectMarca(marca) {
    document.getElementById('contactMarcaInput').value = marca;
    document.getElementById('contactMarca').value = marca;
    document.getElementById('marcaDropdown').style.display = 'none';
}
function showNoleggioMarcheDropdown() { filterNoleggioMarche('', true); }
function filterNoleggioMarche(query, showAll) {
    const dropdown = document.getElementById('noleggioMarcaDropdown');
    if (!dropdown) return;
    const matches = (!query || query.trim() === '' || showAll) ? MARCHE_NORMALIZED : MARCHE_NORMALIZED.filter(m => m.normalized.includes(normalizeText(query.trim())));
    if (matches.length === 0) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(m => `
        <div onclick="selectNoleggioMarca('${m.original}')" style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
            ${m.original}
        </div>`).join('');
    dropdown.style.display = 'block';
}
function selectNoleggioMarca(marca) {
    document.getElementById('contactNoleggioMarcaInput').value = marca;
    document.getElementById('contactNoleggioMarca').value = marca;
    document.getElementById('noleggioMarcaDropdown').style.display = 'none';
}
function showAcquistoMarcheDropdown() { filterAcquistoMarche('', true); }
function filterAcquistoMarche(query, showAll) {
    const dropdown = document.getElementById('contactAcquistoMarcaDropdown');
    if (!dropdown) return;
    const matches = (!query || query.trim() === '' || showAll) ? MARCHE_NORMALIZED : MARCHE_NORMALIZED.filter(m => m.normalized.includes(normalizeText(query.trim())));
    if (matches.length === 0) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(m => `
        <div onclick="selectAcquistoMarca('${m.original}')" style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
            ${m.original}
        </div>`).join('');
    dropdown.style.display = 'block';
}
function selectAcquistoMarca(marca) {
    document.getElementById('contactAcquistoMarcaInput').value = marca;
    document.getElementById('contactAcquistoMarca').value = marca;
    document.getElementById('contactAcquistoMarcaDropdown').style.display = 'none';
}
// ===== Tendina marca — Pratica Leasing/Finanziamento (nuovo contatto) =====
function showLeasingMarcheDropdown() { filterLeasingMarche('', true); }
function filterLeasingMarche(query, showAll) {
    const dropdown = document.getElementById('contactLeasingMarcaDropdown');
    if (!dropdown) return;
    const matches = (!query || query.trim() === '' || showAll) ? MARCHE_NORMALIZED : MARCHE_NORMALIZED.filter(m => m.normalized.includes(normalizeText(query.trim())));
    if (matches.length === 0) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(m => `
        <div onclick="selectLeasingMarca('${m.original}')" style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
            ${m.original}
        </div>`).join('');
    dropdown.style.display = 'block';
}
function selectLeasingMarca(marca) {
    document.getElementById('contactLeasingMarcaInput').value = marca;
    document.getElementById('contactLeasingMarca').value = marca;
    document.getElementById('contactLeasingMarcaDropdown').style.display = 'none';
}
// ===== Tendina marca — Service (nuovo contatto) =====
function showServiceMarcheDropdown() { filterServiceMarche('', true); }
function filterServiceMarche(query, showAll) {
    const dropdown = document.getElementById('serviceMarcaDropdown');
    if (!dropdown) return;
    const matches = (!query || query.trim() === '' || showAll) ? MARCHE_NORMALIZED : MARCHE_NORMALIZED.filter(m => m.normalized.includes(normalizeText(query.trim())));
    if (matches.length === 0) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(m => `
        <div onclick="selectServiceMarca('${m.original}')" style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
            ${m.original}
        </div>`).join('');
    dropdown.style.display = 'block';
}
function selectServiceMarca(marca) {
    document.getElementById('contactServiceMarcaInput').value = marca;
    document.getElementById('contactServiceMarca').value = marca;
    document.getElementById('serviceMarcaDropdown').style.display = 'none';
}
// ===== Tendina marca — Service (modal "Modifica Contatto") =====
function showEditServiceMarcheDropdown() { filterEditServiceMarche('', true); }
function filterEditServiceMarche(query, showAll) {
    const dropdown = document.getElementById('editServiceMarcaDropdown');
    if (!dropdown) return;
    const matches = (!query || query.trim() === '' || showAll) ? MARCHE_NORMALIZED : MARCHE_NORMALIZED.filter(m => m.normalized.includes(normalizeText(query.trim())));
    if (matches.length === 0) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(m => `
        <div onclick="selectEditServiceMarca('${m.original}')" style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
            ${m.original}
        </div>`).join('');
    dropdown.style.display = 'block';
}
function selectEditServiceMarca(marca) {
    document.getElementById('editContactServiceMarcaInput').value = marca;
    document.getElementById('editContactServiceMarca').value = marca;
    document.getElementById('editServiceMarcaDropdown').style.display = 'none';
}
function showPromoModelliDropdown() {
    const promoAttiva = typeof promoAttive !== 'undefined' && promoAttive.length > 0 ? promoAttive[0] : null;
    if (!promoAttiva) return;
    const modelliPromo = promoAttiva.modelli ? promoAttiva.modelli.split('\n').filter(m => m.trim()) : [];
    if (modelliPromo.length === 0) return;
    const dropdown = document.getElementById('promoModelloDropdown');
    if (!dropdown) return;
    dropdown.innerHTML = modelliPromo.map(m => `
        <div onclick="selectPromoModello('${m.replace(/'/g,"\\'")}')" style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
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
        <div onclick="selectPromoModello('${m.replace(/'/g,"\\'")}')" style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
            ${m}
        </div>`).join('');
    if (consentiManuale && !modelliPromo.some(m => m.toLowerCase() === q)) {
        html += `<div onclick="selectPromoModello('${query.trim().replace(/'/g,"\\'")}')" style="padding:10px 14px;cursor:pointer;font-size:13px;color:var(--text-secondary);border-top:1px solid var(--border)" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
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
        sel.innerHTML = '<option value="">Seleziona modello...</option>' + modelli.map(m => `<option value="${m}">${m}</option>`).join('');
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

    const acquistoMarcaDropdown = document.getElementById('contactAcquistoMarcaDropdown');
    const acquistoMarcaInput = document.getElementById('contactAcquistoMarcaInput');
    if (acquistoMarcaDropdown && acquistoMarcaInput && !acquistoMarcaInput.contains(e.target) && !acquistoMarcaDropdown.contains(e.target)) acquistoMarcaDropdown.style.display = 'none';

    const leasingMarcaDropdown = document.getElementById('contactLeasingMarcaDropdown');
    const leasingMarcaInput = document.getElementById('contactLeasingMarcaInput');
    if (leasingMarcaDropdown && leasingMarcaInput && !leasingMarcaInput.contains(e.target) && !leasingMarcaDropdown.contains(e.target)) leasingMarcaDropdown.style.display = 'none';

    const promoDropdown = document.getElementById('promoModelloDropdown');
    const promoInput = document.getElementById('promoModelloInput');
    if (promoDropdown && promoInput && !promoInput.contains(e.target) && !promoDropdown.contains(e.target)) promoDropdown.style.display = 'none';

    const serviceMarcaDropdown = document.getElementById('serviceMarcaDropdown');
    const serviceMarcaInput = document.getElementById('contactServiceMarcaInput');
    if (serviceMarcaDropdown && serviceMarcaInput && !serviceMarcaInput.contains(e.target) && !serviceMarcaDropdown.contains(e.target)) serviceMarcaDropdown.style.display = 'none';

    const editServiceMarcaDropdown = document.getElementById('editServiceMarcaDropdown');
    const editServiceMarcaInput = document.getElementById('editContactServiceMarcaInput');
    if (editServiceMarcaDropdown && editServiceMarcaInput && !editServiceMarcaInput.contains(e.target) && !editServiceMarcaDropdown.contains(e.target)) editServiceMarcaDropdown.style.display = 'none';
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
        checkAcquistoAlertDaGestire();
        loadClientiConStorico();
        loadContactStatsTotaliStorici().then(() => {
            renderChartInfoAcquisto(contactLogsFiltered);
            renderChartFonteVendita(contactLogsFiltered);
            renderChartNoleggio(contactLogsFiltered);
            updateServiceCounterBadge();
        });
    } catch (err) {
        console.error('Errore caricamento contatti:', err);
    }
}

// NUOVO: invece di mostrare il popup una sola volta per sessione, ora
// ricompare ogni 30 minuti finché restano allert non gestiti — nessun
// refresh o riapertura pagina necessari, basta che il CRM resti aperto.
let acquistoAlertDaGestireLastShownAt = 0;
const ACQUISTO_ALERT_REPOPUP_INTERVAL_MS = 30 * 60 * 1000;

function checkAcquistoAlertDaGestire() {
    const modal = document.getElementById('acquistoAlertDaGestireModal');
    const list = document.getElementById('acquistoAlertDaGestireList');
    if (!modal || !list) return;
    if (modal.style.display === 'flex') return; // già aperto

    const now = Date.now();
    if (acquistoAlertDaGestireLastShownAt !== 0 && (now - acquistoAlertDaGestireLastShownAt) < ACQUISTO_ALERT_REPOPUP_INTERVAL_MS) return;

    // FIX: filtra con canSeeAlertPopup — i gestori vedono la coda generale
    // "a tutti", chiunque altro (anche un UTENTE comune) vede il popup SOLO
    // se è stato scelto come destinatario specifico di quell'allert.
    const alertAttivi = contactLogs.filter(l => hasAcquistoAlert(l) && l.acquistoAlertStatus !== 'GESTITA' && canSeeAlertPopup(l));
    if (alertAttivi.length === 0) return;

    acquistoAlertDaGestireLastShownAt = now;

    // FIX: anche la ripresentazione periodica (ogni 30 min, per allert
    // ancora non gestiti) deve far scattare suono/titolo/notifica desktop,
    // non solo la primissima comparsa istantanea — altrimenti il popup
    // ricompare in silenzio e passa facilmente inosservato se l'operatore
    // non sta fissando lo schermo in quel preciso momento.
    notifyNewAcquistoAlert(alertAttivi[0]);

    const daGestire = alertAttivi.filter(l => !l.acquistoAlertStatus || l.acquistoAlertStatus === 'DA_GESTIRE');
    const inGestione = alertAttivi.filter(l => l.acquistoAlertStatus === 'IN_GESTIONE');

    const renderCard = (log) => {
        const date = log.contactDate.split('T')[0];
        const time = log.contactDate.split('T')[1]?.substring(0,5) || '';
        const visual = acquistoAlertVisual(log);
        return `<div class="followup-card" style="margin-bottom:10px;cursor:pointer;border-left:4px solid ${visual.color}" onclick="closeAcquistoAlertDaGestireModal();openAcquistoAlertModal(${log.id})">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
                <div>
                    <div style="font-weight:800;color:${visual.color};font-size:14px">${visual.icon} ${clienteNomeCompleto(log)}</div>
                    <div style="margin-top:4px"><span style="font-size:11px;font-weight:700;background:${visual.bg};color:${visual.color};padding:2px 8px;border-radius:8px">${visual.icon} ${visual.label}</span></div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">📅 ${formatDateIT(date)} · 🕐 ${time}</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">📞 ${clienteNumeroDisplay(log)}</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">📋 ${log.otherNote || '—'}${log.acquistoNote ? ' · ' + log.acquistoNote : ''}</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">👤 Segnalato da ${log.user?.fullName || '—'}</div>
                    ${log.alertNotifyAll === false && Array.isArray(log.alertRecipients) && log.alertRecipients.length > 0
                        ? `<div style="font-size:12px;color:#f0c040;font-weight:700;margin-top:2px">🎯 Per: ${log.alertRecipients.map(u => u.fullName).join(', ')}</div>`
                        : ''}
                </div>
                <span style="color:${visual.color};font-size:18px">→</span>
            </div>
        </div>`;
    };

    let html = '';
    if (daGestire.length > 0) {
        html += `<div style="font-size:11px;font-weight:800;letter-spacing:1px;color:#ff9800;text-transform:uppercase;margin-bottom:10px">🔔 Da Gestire (${daGestire.length})</div>`;
        html += daGestire.map(renderCard).join('');
    }
    if (inGestione.length > 0) {
        html += `<div style="font-size:11px;font-weight:800;letter-spacing:1px;color:#f0c040;text-transform:uppercase;margin:16px 0 10px">🟡 In Gestione (${inGestione.length})</div>`;
        html += inGestione.map(renderCard).join('');
    }

    list.innerHTML = html;
    modal.style.display = 'flex';
}
function closeAcquistoAlertDaGestireModal(event) {
    if (event && event.target.id !== 'acquistoAlertDaGestireModal') return;
    const modal = document.getElementById('acquistoAlertDaGestireModal');
    if (modal) modal.style.display = 'none';
}

function populateOperatorFilter() {
    const operators = [...new Set(contactLogs.map(l => l.user.fullName))].sort();
    if (typeof populateMultiSelectOptions === 'function' && document.getElementById('contactOperatorFilterMulti-options')) {
        populateMultiSelectOptions('contactOperatorFilterMulti', operators);
    }
    const select = document.getElementById('contactOperatorFilter');
    if (select) {
        const current = select.value;
        select.innerHTML = '<option value="">Tutti gli operatori</option>' + operators.map(op => `<option value="${op}" ${op===current?'selected':''}>${op}</option>`).join('');
    }
    populateContactYearFilter();
}

// ============================================================
// FILTRO PERIODO — Anno / Mese / Settimana (vero filtro, non solo
// ordinamento). Il Giorno resta accessibile cliccando su una card giorno
// o sul calendario, che aprono già la vista giornaliera dedicata.
// ============================================================

function populateContactYearFilter() {
    const sel = document.getElementById('contactYearFilter');
    if (!sel) return;
    const years = [...new Set(contactLogs.map(l => l.contactDate.split('T')[0].split('-')[0]))].sort((a, b) => b - a);
    const current = sel.value;
    sel.innerHTML = '<option value="">Tutti gli anni</option>' + years.map(y => `<option value="${y}" ${y === current ? 'selected' : ''}>${y}</option>`).join('');
    populateContactWeekFilter();
}

// Le settimane disponibili dipendono da anno/mese eventualmente già
// selezionati, così la tendina mostra solo settimane che esistono davvero
// nel sottoinsieme corrente, non tutte le 52 dell'anno.
function populateContactWeekFilter() {
    const sel = document.getElementById('contactWeekFilter');
    if (!sel) return;
    const yearFilter = document.getElementById('contactYearFilter')?.value || '';
    const monthFilter = document.getElementById('contactMonthFilter')?.value || '';

    const scoped = contactLogs.filter(l => {
        const d = parseLocalDate(l.contactDate.split('T')[0]);
        if (yearFilter && d.getFullYear().toString() !== yearFilter) return false;
        if (monthFilter && (d.getMonth() + 1).toString() !== monthFilter) return false;
        return true;
    });

    const weeksSet = new Map(); // sortKey -> label
    scoped.forEach(l => {
        const date = l.contactDate.split('T')[0];
        const label = getWeekKey(date);
        const monday = getISOWeekMonday(date);
        const match = label.match(/Settimana (\d+)/);
        const num = match ? parseInt(match[1], 10) : 0;
        const sortKey = `${monday.getFullYear()}-${String(num).padStart(2, '0')}`;
        weeksSet.set(sortKey, label);
    });
    const sortedWeeks = [...weeksSet.entries()].sort((a, b) => b[0].localeCompare(a[0]));

    const current = sel.value;
    sel.innerHTML = '<option value="">Tutte le settimane</option>' + sortedWeeks.map(([key, label]) => `<option value="${key}" ${key === current ? 'selected' : ''}>${label}</option>`).join('');
}

function onContactPeriodFilterChange() {
    populateContactWeekFilter();
    applyContactFilters();
}

function applyContactFilters(restoreDayView) {
    const operatorsSelected = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('contactOperatorFilterMulti') : [];
    const categoriesSelected = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('contactCategoryFilterMulti') : [];
    const yearFilter = document.getElementById('contactYearFilter')?.value || '';
    const monthFilter = document.getElementById('contactMonthFilter')?.value || '';
    const weekFilter = document.getElementById('contactWeekFilter')?.value || '';

    contactLogsFiltered = contactLogs.filter(l => {
        if (operatorsSelected.length > 0 && !operatorsSelected.includes(l.user.fullName)) return false;
        if (categoriesSelected.length > 0 && !categoriesSelected.includes(l.category)) return false;
        if (yearFilter || monthFilter || weekFilter) {
            const date = l.contactDate.split('T')[0];
            const d = parseLocalDate(date);
            if (yearFilter && d.getFullYear().toString() !== yearFilter) return false;
            if (monthFilter && (d.getMonth() + 1).toString() !== monthFilter) return false;
            if (weekFilter) {
                const monday = getISOWeekMonday(date);
                const label = getWeekKey(date);
                const match = label.match(/Settimana (\d+)/);
                const num = match ? parseInt(match[1], 10) : 0;
                const sortKey = `${monday.getFullYear()}-${String(num).padStart(2, '0')}`;
                if (sortKey !== weekFilter) return false;
            }
        }
        return true;
    });

    if (restoreDayView) {
        showDayView(restoreDayView);
    } else {
        renderContactLogs(contactLogsFiltered);
    }

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
    const firstDay = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
    })();
    document.getElementById('contactFrom').value = firstDay;
    document.getElementById('contactTo').value = today;
    if (typeof multiSelectClear === 'function') {
        multiSelectClear('contactOperatorFilterMulti');
        multiSelectClear('contactCategoryFilterMulti');
    }
    const yearFilterEl = document.getElementById('contactYearFilter');
    const monthFilterEl = document.getElementById('contactMonthFilter');
    const weekFilterEl = document.getElementById('contactWeekFilter');
    if (yearFilterEl) yearFilterEl.value = '';
    if (monthFilterEl) monthFilterEl.value = '';
    if (weekFilterEl) weekFilterEl.value = '';
    currentDayView = null;
    dayViewCategoryFilter = '';
    dayViewSubFilter = '';
    dayViewSecondaryFilter = '';
    dayViewTertiaryFilter = '';
    const btn = document.getElementById('contactResetBtn');
    if (btn) btn.style.display = 'none';
    loadContactLogs(firstDay, today);
}

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
                            📞 ${clienteNumeroDisplay(l)} ·
                            <span class="contact-category-badge cat-${l.category.replace(/[\s+]/g,'_')}">${l.category}</span> ·
                            📅 ${formatDateIT(date)} ${time} · 👤 ${l.user.fullName}
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
    if (el('statInfoAcquisto')) el('statInfoAcquisto').textContent = (total > 0 ? Math.round((byCategory['Info Acquisto effettuato']||0)*1000/total)/10 : 0)+'%';
    attachContactStatClickHandlers();
}

function showContactStatDetail(type) {
    let items = [];
    let title = '';
    switch (type) {
        case 'total': items = contactLogsFiltered; title = 'Totale Contatti'; break;
        case 'vendita': items = contactLogsFiltered.filter(l => l.category === 'Info Vendita' || l.category === 'Info + Appuntamento' || l.category === 'Info Vendita in Promo'); title = 'Info Vendita'; break;
        case 'noleggio': items = contactLogsFiltered.filter(l => l.category === 'Info Noleggio'); title = 'Info Noleggio'; break;
        case 'service': items = contactLogsFiltered.filter(l => l.category === 'Service'); title = 'Service'; break;
        case 'acquisto': items = contactLogsFiltered.filter(l => l.category === 'Info Acquisto effettuato'); title = 'Info Acquisto Effettuato'; break;
    }
    showGenericContactDetail(title, items);
}

function attachContactStatClickHandlers() {
    const map = {
        statContactTotal: 'total',
        statInfoVendita: 'vendita',
        statInfoNoleggio: 'noleggio',
        statService: 'service',
        statInfoAcquisto: 'acquisto'
    };
    Object.entries(map).forEach(([elId, type]) => {
        const valueEl = document.getElementById(elId);
        if (!valueEl) return;
        const card = valueEl.closest('.stat-card');
        if (!card) return;
        card.style.cursor = 'pointer';
        card.classList.add('stat-card-clickable');
        card.onclick = () => showContactStatDetail(type);
    });
}

function showGenericContactDetail(title, items) {
    lastDetailTitle = title;
    lastDetailItems = items;
    detailOnlyNominativo = false;
    detailOnlyAlert = false;
    detailGestioneFilter = '';
    detailCategoryFilter = '';
    renderGenericContactDetail();
}

// NUOVO: apre il popup unificato con TUTTI gli allert, su tutta la storia,
// aggregando TUTTE le categorie che possono averne (non solo Info Acquisto)
// — pulsante 🔔 ALLERT nella barra del Registro Contatti. Ignora sempre il
// periodo filtrato a schermo per costruzione (l'endpoint non riceve mai
// from/to).
async function openAllAlertsModal() {
    try {
        const res = await fetch('/api/contacts/alerts-storico');
        if (!res.ok) { alert('Errore nel caricamento degli allert'); return; }
        const items = await res.json();
        showGenericContactDetail('🔔 Tutti gli Allert — Storico completo', items);
        detailOnlyAlert = true;
        renderGenericContactDetail();
    } catch (err) {
        console.error('Errore caricamento tutti gli allert:', err);
        alert('Errore nel caricamento degli allert');
    }
}

// ============================================================
// FIX: aggiunti due nuovi filtri nel popup di dettaglio:
// 1) "Mostra solo con allert" — checkbox, visibile solo se nella lista
//    ci sono contatti di categoria "Info Acquisto effettuato".
// 2) Sotto-filtro a pillole Da gestire / In gestione / Gestita — visibile
//    solo quando il filtro allert è attivo.
// ============================================================
function renderGenericContactDetail() {
    const modal = document.getElementById('sedeDetailModal');
    const titleEl = document.getElementById('sedeDetailTitle');
    const list = document.getElementById('sedeDetailList');
    if (!modal || !titleEl || !list) return;

    let items = detailOnlyNominativo
        ? lastDetailItems.filter(l => l.clienteNome || l.clienteCognome || l.serviceNomeCliente || l.noleggioNomeCliente || l.nominativoAppuntamento)
        : lastDetailItems;

    const hasAcquistoItems = lastDetailItems.some(l => ALERT_ELIGIBLE_CATEGORIES.includes(l.category));
    // NUOVO: quante categorie diverse (tra quelle con allert) sono presenti
    // in questa lista — se più di una, mostra il filtro a tendina per
    // categoria (usato dal popup 🔔 Tutti gli Allert, che le aggrega tutte).
    const categoriesPresent = [...new Set(lastDetailItems.filter(l => ALERT_ELIGIBLE_CATEGORIES.includes(l.category)).map(l => l.category))];

    if (detailOnlyAlert) {
        items = items.filter(l => hasAcquistoAlert(l));
    }
    if (detailGestioneFilter) {
        items = items.filter(l => hasAcquistoAlert(l) && (l.acquistoAlertStatus || 'DA_GESTIRE') === detailGestioneFilter);
    }
    if (detailOnlyAlert && detailCategoryFilter) {
        items = items.filter(l => l.category === detailCategoryFilter);
    }
    // NUOVO: filtro per destinatario — "Tutti" (nessun filtro) oppure un
    // operatore specifico, che mostra solo gli allert visibili a lui
    // (invio a tutti, oppure lui esplicitamente tra i destinatari scelti).
    if (detailOnlyAlert && detailDestinatarioFilter) {
        const filterId = Number(detailDestinatarioFilter);
        items = items.filter(l => {
            if (!hasAcquistoAlert(l)) return true;
            if (l.alertNotifyAll === false && Array.isArray(l.alertRecipients)) {
                return l.alertRecipients.some(u => u.id === filterId);
            }
            return true; // "invia a tutti" -> visibile a chiunque, incluso il filtro scelto
        });
    }

    titleEl.textContent = `${lastDetailTitle} (${items.length})`;

    let html = `<div class="detail-filter-bar">
        <input type="checkbox" id="detailNominativoCheck" ${detailOnlyNominativo?'checked':''} onchange="toggleDetailNominativoFilter()">
        <label for="detailNominativoCheck" style="cursor:pointer">Mostra solo contatti con nome o cognome</label>
    </div>`;

    if (hasAcquistoItems) {
        html += `<div class="detail-filter-bar" style="margin-top:6px">
            <input type="checkbox" id="detailAlertCheck" ${detailOnlyAlert?'checked':''} onchange="toggleDetailAlertFilter()">
            <label for="detailAlertCheck" style="cursor:pointer">🔔 Mostra solo con allert</label>
        </div>`;

        if (detailOnlyAlert) {
            const gestioneOptions = [
                { key: '', label: 'Tutti' },
                { key: 'DA_GESTIRE', label: '⚪ Da gestire' },
                { key: 'IN_GESTIONE', label: '🟡 In gestione' },
                { key: 'GESTITA', label: '🟢 Gestita' }
            ];
            html += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 10px">
                ${gestioneOptions.map(o => `
                    <button type="button" onclick="setDetailGestioneFilter('${o.key}')"
                        class="btn-small ${detailGestioneFilter===o.key?'btn-sede-active':'btn-secondary'}"
                        style="padding:5px 12px;font-size:11px">${o.label}</button>
                `).join('')}
            </div>`;

            // NUOVO: filtro per categoria — solo se la lista contiene più
            // di una categoria diversa con allert (es. il popup aggregato
            // 🔔 Tutti gli Allert). Per una singola categoria (es. aperto
            // dal badge di un grafico specifico) non ha senso mostrarlo.
            if (categoriesPresent.length > 1) {
                html += `<div style="margin-bottom:10px">
                    <select id="detailCategorySelect" class="input-dark" style="font-size:12px;padding:6px 10px" onchange="setDetailCategoryFilter(this.value)">
                        <option value="">📁 Tutte le categorie</option>
                        ${categoriesPresent.map(c => `<option value="${c}" ${detailCategoryFilter === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </div>`;
            }

            // NUOVO: filtro per destinatario — "Tutti" o un operatore specifico
            html += `<div style="margin-bottom:14px">
                <select id="detailDestinatarioSelect" class="input-dark" style="font-size:12px;padding:6px 10px" onchange="setDetailDestinatarioFilter(this.value)">
                    <option value="">👥 Tutti gli operatori</option>
                    ${(alertDestinatariUsersCache || []).map(u => `<option value="${u.id}" ${detailDestinatarioFilter === String(u.id) ? 'selected' : ''}>🎯 ${u.fullName}</option>`).join('')}
                </select>
            </div>`;
            if (!alertDestinatariUsersCache) loadUsersForDetailDestinatariFilter();
        }
    }

    if (items.length === 0) {
        html += '<div class="empty-state" style="padding:20px"><p>Nessun contatto per questo filtro</p></div>';
    } else {
        html += items.map(log => {
            const date = log.contactDate.split('T')[0];
            const time = log.contactDate.split('T')[1].substring(0,5);
            const catClass = log.category.replace(/[\s+]/g, '_');
            const noteTextParts = [];
            const notePrimary = (log.category !== 'Info Acquisto effettuato' && log.category !== 'Service') ? log.otherNote : (log.acquistoNote || log.serviceNote);
            if (notePrimary) noteTextParts.push(notePrimary);
            if (log.notaAggiuntiva) noteTextParts.push('📝 ' + log.notaAggiuntiva);
            const noteText = noteTextParts.join(' · ');
            const alert = hasAcquistoAlert(log);
            const alertVisual = alert ? acquistoAlertVisual(log) : null;
            const links = [];
            if (log.linkAuto) links.push(`<a href="${log.linkAuto}" target="_blank" rel="noopener" title="Lead veicolo" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:rgba(124,77,255,0.15);color:#7c4dff;text-decoration:none;font-size:13px">🔗</a>`);
            if (log.linkAppuntamento) links.push(`<a href="${log.linkAppuntamento}" target="_blank" rel="noopener" title="Link appuntamento" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:rgba(74,144,217,0.15);color:#4a90d9;text-decoration:none;font-size:13px">🔗</a>`);
            if (log.noleggioLink) links.push(`<a href="${log.noleggioLink}" target="_blank" rel="noopener" title="Lead noleggio" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:rgba(0,200,83,0.15);color:#00c853;text-decoration:none;font-size:13px">🔗</a>`);
            if (alert) links.push(`<button onclick="event.stopPropagation();openAcquistoAlertModal(${log.id})" title="Gestisci Allert — ${alertVisual.label}" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:${alertVisual.bg};color:${alertVisual.color};border:none;cursor:pointer;font-size:13px">${alertVisual.icon}</button>`);
            return `<div class="followup-card" style="margin-bottom:10px;cursor:pointer" onclick="closeGenericDetailAndEdit(${log.id})">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
                    <div>
                        <div style="font-weight:800;color:${acquistoAlertNameColor(log) || 'var(--text-primary)'};font-size:14px">${alert ? alertVisual.icon + ' ' : ''}${clienteNomeCompleto(log)}</div>
                        <div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap">
                            <span class="contact-category-badge cat-${catClass}">${log.category}</span>
                            ${alert ? `<span onclick="openAcquistoAlertModal(${log.id})" style="cursor:pointer;font-size:11px;font-weight:700;background:${alertVisual.bg};color:${alertVisual.color};padding:2px 8px;border-radius:8px">${alertVisual.icon} ${alertVisual.label}</span>` : ''}
                        </div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">📅 ${formatDateIT(date)} · 🕐 ${time}</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">📞 ${clienteNumeroDisplay(log)}</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">👤 ${log.user.fullName}</div>
                        ${log.marca ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">🚗 ${log.marca}${log.modello?' · '+log.modello:''}</div>` : ''}
                        ${log.serviceSede ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">📍 Service ${log.serviceSede}</div>` : ''}
                        ${log.serviceTarga ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">🔖 ${log.serviceTarga}</div>` : ''}
                        ${noteText ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">📝 ${noteText}</div>` : ''}
                        ${alert ? (
                            log.alertNotifyAll === false && Array.isArray(log.alertRecipients) && log.alertRecipients.length > 0
                                ? `<div style="font-size:12px;color:#f0c040;font-weight:700;margin-top:2px">🎯 Per: ${log.alertRecipients.map(u => u.fullName).join(', ')}</div>`
                                : `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">👥 A tutti i gestori</div>`
                        ) : ''}
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

// FIX: nuova funzione — attiva/disattiva il filtro "solo con allert".
// Quando viene disattivato, azzera anche il sotto-filtro di stato gestione,
// altrimenti resterebbe "appeso" un filtro nascosto e invisibile.
function toggleDetailAlertFilter() {
    detailOnlyAlert = document.getElementById('detailAlertCheck')?.checked || false;
    if (!detailOnlyAlert) { detailGestioneFilter = ''; detailDestinatarioFilter = ''; }
    renderGenericContactDetail();
}

// FIX: nuova funzione — imposta il sotto-filtro di stato gestione
// (Da gestire / In gestione / Gestita / Tutti) e ridisegna la lista.
function setDetailGestioneFilter(status) {
    detailGestioneFilter = status;
    renderGenericContactDetail();
}

// NUOVO: filtro per categoria nel popup aggregato 🔔 Tutti gli Allert.
function setDetailCategoryFilter(category) {
    detailCategoryFilter = category;
    renderGenericContactDetail();
}

// NUOVO: filtro per destinatario nella lista Info Acquisto/Leasing/
// Finanziamento/Amministrazione — "Tutti gli operatori" (nessun filtro) o
// un operatore specifico, per vedere solo gli allert visibili a lui.
let detailDestinatarioFilter = '';
function setDetailDestinatarioFilter(userId) {
    detailDestinatarioFilter = userId;
    renderGenericContactDetail();
}
async function loadUsersForDetailDestinatariFilter() {
    if (alertDestinatariUsersCache) return;
    try {
        // /api/auth/users/basic (non /api/auth/users): questo filtro deve
        // essere usabile da qualsiasi utente che vede il popup, non solo da
        // ADMIN/GESTORE, altrimenti la select resta vuota per gli altri.
        const res = await fetch('/api/auth/users/basic');
        if (!res.ok) return;
        alertDestinatariUsersCache = await res.json();
        renderGenericContactDetail();
    } catch (err) {
        console.error('Errore caricamento utenti per filtro destinatario:', err);
    }
}

let contactChart = null;
function renderContactChartFromLogs(logs, targetCanvasId) {
    const ctx = document.getElementById(targetCanvasId || 'chartContacts');
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
    const colors = labels.map(l => getCategoryColor(l));
    const legendColor = getLegendColor();

    contactChart = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: isDark ? '#0d0f1a' : '#ffffff' }] },
        options: {
            animation: false,
            responsive: true, maintainAspectRatio: false,
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
                tooltip: { callbacks: { label: ctx => {
                    const val = ctx.raw;
                    const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                    return ` Valore: ${val} — ${pct}%`;
                } } }
            }
        }
    });
    return contactChart;
}

function renderChartAppuntamentiSede(logs, targetCanvasId) {
    const ctx = document.getElementById(targetCanvasId || 'chartAppuntamentiSede');
    if (!ctx) return;
    if (contactChartSede) contactChartSede.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const counts = { 'Agnano': 0, 'Casamarciano': 0, 'Salerno': 0 };
    logs.forEach(log => {
        if (log.category === 'Info + Appuntamento' && log.otherNote && counts[log.otherNote.trim()] !== undefined) counts[log.otherNote.trim()]++;
    });
    const total = SEDI_LIST.reduce((a, s) => a + counts[s], 0);
    const textColor = isDark ? '#8a8faa' : '#555555';
    const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';

    contactChartSede = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: { labels: SEDI_LIST, datasets: [{ data: SEDI_LIST.map(s => counts[s]), backgroundColor: ['#e91e6399','#1a408099','#00c85399'], borderColor: SEDE_COLORS, borderWidth: 2, borderRadius: 8, borderSkipped: false }] },
        options: {
            animation: false,
            responsive: true, maintainAspectRatio: false,
            onClick: (evt, elements) => { if (elements.length > 0) showSedeDetail(SEDI_LIST[elements[0].index]); },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => {
                    const val = ctx.raw;
                    const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                    return ` Valore: ${val} — ${pct}%`;
                } } }
            },
            scales: {
                x: { ticks: { color: textColor, font: { size: 11, weight: '700' }, maxRotation: 0 }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: textColor, precision: 0 }, grid: { color: gridColor } }
            }
        }
    });
    return contactChartSede;
}
function showSedeDetail(sede) {
    const items = contactLogsFiltered.filter(log => log.category === 'Info + Appuntamento' && log.otherNote === sede);
    showGenericContactDetail(`Appuntamenti — ${sede}`, items);
}
function closeSedeDetail(event) {
    if (event && event.target.id !== 'sedeDetailModal') return;
    document.getElementById('sedeDetailModal').style.display = 'none';
}

function closeGenericDetailAndEdit(id) {
    const modal = document.getElementById('sedeDetailModal');
    if (modal) modal.style.display = 'none';
    openEditContactModal(id);
}

function renderChartInfoAcquisto(logs, targetCanvasId) {
    const ctx = document.getElementById(targetCanvasId || 'chartInfoAcquisto');
    if (!ctx) return;
    if (contactChartAcquisto) contactChartAcquisto.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const counts = {};
    ACQUISTO_LIST.forEach(a => counts[a] = 0);
    logs.forEach(log => {
        if (log.category === 'Info Acquisto effettuato' && log.otherNote && counts[log.otherNote.trim()] !== undefined) counts[log.otherNote.trim()]++;
    });
    const total = ACQUISTO_LIST.reduce((a,t) => a+counts[t], 0);
    const legendColor = getLegendColor();

    contactChartAcquisto = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: { labels: ACQUISTO_LIST, datasets: [{ data: ACQUISTO_LIST.map(t => counts[t]), backgroundColor: ACQUISTO_COLORS, borderWidth: 2, borderColor: isDark ? '#0d0f1a' : '#ffffff' }] },
        options: {
            animation: false,
            responsive: true, maintainAspectRatio: false,
            onClick: (evt, elements) => {
                if (elements.length === 0) return;
                const tipo = ACQUISTO_LIST[elements[0].index];
                const items = logs.filter(l => l.category === 'Info Acquisto effettuato' && l.otherNote === tipo);
                showGenericContactDetail(`Info Acquisto — ${tipo}`, items);
            },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: {
                legend: { position: 'right', labels: { color: legendColor, font: { size: 10 }, padding: 6, boxWidth: 10,
                    generateLabels: chart => chart.data.labels.map((label, i) => {
                        const val = chart.data.datasets[0].data[i];
                        const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                        return { text: `${label}: ${val} (${pct}%)`, fillStyle: ACQUISTO_COLORS[i], strokeStyle: ACQUISTO_COLORS[i], fontColor: legendColor, lineWidth: 0, index: i };
                    })
                } },
                tooltip: { callbacks: { label: ctx => {
                    const val = ctx.raw;
                    const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                    return ` Valore: ${val} — ${pct}%`;
                } } }
            }
        }
    });

    // FIX: prima calcolato su contactLogs (limitato dal filtro date attivo),
    // quindi "storico" cambiava ogni volta che si cambiavano le date — ora
    // usa i totali veri, indipendenti da qualunque filtro.
    const totalAll = contactStatsTotaliStorici?.infoAcquisto ?? contactLogs.filter(l => l.category === 'Info Acquisto effettuato').length;
    const totalDaGestire = contactStatsTotaliStorici?.acquistoDaGestire ?? contactLogs.filter(l => l.category === 'Info Acquisto effettuato' && l.acquistoAlert && (!l.acquistoAlertStatus || l.acquistoAlertStatus === 'DA_GESTIRE')).length;
    const totalInGestione = contactStatsTotaliStorici?.acquistoInGestione ?? contactLogs.filter(l => l.category === 'Info Acquisto effettuato' && l.acquistoAlertStatus === 'IN_GESTIONE').length;
    const totalGestita = contactStatsTotaliStorici?.acquistoGestita ?? contactLogs.filter(l => l.category === 'Info Acquisto effettuato' && l.acquistoAlertStatus === 'GESTITA').length;
    const alertBreakdown = [];
    if (totalDaGestire > 0) alertBreakdown.push(`🔔 ${totalDaGestire} da gestire`);
    if (totalInGestione > 0) alertBreakdown.push(`🟡 ${totalInGestione} in gestione`);
    if (totalGestita > 0) alertBreakdown.push(`🟢 ${totalGestita} gestite`);
    setChartCounterBadge(findChartTitleElement(ctx), totalAll, `Totale storico${alertBreakdown.length ? ' · ' + alertBreakdown.join(' · ') : ''}`,
        () => openCategoryStoricoDetail('Info Acquisto effettuato', 'Info Acquisto Effettuato'));
    return contactChartAcquisto;
}

function renderChartFonteVendita(logs, targetCanvasId) {
    const ctx = document.getElementById(targetCanvasId || 'chartFonteVendita');
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
            animation: false,
            responsive: true, maintainAspectRatio: false,
            onClick: (evt, elements) => {
                if (elements.length === 0) return;
                const fonte = FONTE_LIST[elements[0].index];
                const items = logs.filter(l => (l.category === 'Info Vendita' || l.category === 'Info + Appuntamento') && l.otherNote === fonte);
                showGenericContactDetail(`Fonte Vendita — ${fonte}`, items);
            },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: {
                legend: { position: 'right', labels: { color: legendColor, font: { size: 10 }, padding: 6, boxWidth: 10,
                    generateLabels: chart => chart.data.labels.map((label, i) => {
                        const val = chart.data.datasets[0].data[i];
                        const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                        return { text: `${label}: ${val} (${pct}%)`, fillStyle: FONTE_COLORS[i], strokeStyle: FONTE_COLORS[i], fontColor: legendColor, lineWidth: 0, index: i };
                    })
                } },
                tooltip: { callbacks: { label: ctx => {
                    const val = ctx.raw;
                    const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                    return ` Valore: ${val} — ${pct}%`;
                } } }
            }
        }
    });

    const totalVenditaAll = contactStatsTotaliStorici?.infoVendita ?? contactLogs.filter(l => l.category === 'Info Vendita' || l.category === 'Info + Appuntamento' || l.category === 'Info Vendita in Promo').length;
    setChartCounterBadge(findChartTitleElement(ctx), totalVenditaAll, 'Totale storico Info Vendita');
    return contactChartFonte;
}

function buildServiceSedeChart(canvasId, existingChart, logs, sede) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return existingChart;
    if (existingChart) existingChart.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const counts = {};
    SERVICE_LIST.forEach(s => counts[s] = 0);
    logs.forEach(log => {
        if (log.category === 'Service' && log.serviceSede === sede && log.serviceTipo && counts[log.serviceTipo.trim()] !== undefined) counts[log.serviceTipo.trim()]++;
    });
    const total = SERVICE_LIST.reduce((a,s) => a+counts[s], 0);
    const legendColor = getLegendColor();

    const chart = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: { labels: SERVICE_LIST, datasets: [{ data: SERVICE_LIST.map(s => counts[s]), backgroundColor: SERVICE_COLORS, borderWidth: 2, borderColor: isDark ? '#0d0f1a' : '#ffffff' }] },
        options: {
            animation: false,
            responsive: true, maintainAspectRatio: true,
            onClick: (evt, elements) => { if (elements.length > 0) showServiceDetail(SERVICE_LIST[elements[0].index], sede); },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: {
                legend: { position: 'bottom', labels: { color: legendColor, font: { size: 10 }, padding: 6, boxWidth: 10,
                    generateLabels: chart => chart.data.labels.map((label, i) => {
                        const val = chart.data.datasets[0].data[i];
                        const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                        return { text: `${label}: ${val} (${pct}%)`, fillStyle: SERVICE_COLORS[i], strokeStyle: SERVICE_COLORS[i], fontColor: legendColor, lineWidth: 0, index: i };
                    })
                } },
                tooltip: { callbacks: { label: ctx => {
                    const val = ctx.raw;
                    const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                    return ` Valore: ${val} — ${pct}%`;
                } } }
            }
        }
    });
    updateServiceCounterBadge();
    return chart;
}
function renderChartServiceAgnano(logs) { contactChartServiceAgnano = buildServiceSedeChart('chartServiceAgnano', contactChartServiceAgnano, logs, 'Agnano'); }
function renderChartServiceSalerno(logs) { contactChartServiceSalerno = buildServiceSedeChart('chartServiceSalerno', contactChartServiceSalerno, logs, 'Salerno'); }
function showServiceDetail(tipo, sede) {
    const items = contactLogsFiltered.filter(log => log.category === 'Service' && log.serviceTipo === tipo && (!sede || log.serviceSede === sede));
    showGenericContactDetail(`Service${sede ? ' — ' + sede : ''} — ${tipo}`, items);
}

function renderChartMarcheCustom(logs) {
    const container = document.getElementById('chartMarcheCustom');
    if (!container) return;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const counts = {};
    logs.filter(log => log.category === 'Info Vendita' || log.category === 'Info + Appuntamento')
        .forEach(log => {
            if (log.marca) {
                const mUpper = log.marca.trim().toUpperCase();
                counts[mUpper] = (counts[mUpper]||0) + 1;
            }
        });
    if (Object.keys(counts).length === 0) {
        container.innerHTML = `<div style="color:var(--text-secondary);font-size:13px;padding:20px 0">Nessun dato disponibile</div>`;
        return;
    }
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
                animation: false,
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
                    tooltip: { callbacks: { label: ctx => {
                        const val = ctx.raw;
                        const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                        return ` Valore: ${val} — ${pct}%`;
                    } } }
                }
            }
        });
        const totalNoleggioAll = contactStatsTotaliStorici?.infoNoleggio ?? contactLogs.filter(l => l.category === 'Info Noleggio').length;
        setChartCounterBadge(findChartTitleElement(ctxTipo), totalNoleggioAll, 'Totale storico');
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
                animation: false,
                responsive: true, maintainAspectRatio: true,
                onClick: (evt, elements) => {
                    if (elements.length === 0) return;
                    const hasLink = elements[0].index === 1;
                    const items = noleggioLogs.filter(l => Boolean(l.noleggioLink) === hasLink);
                    showGenericContactDetail(`Noleggio — ${leadLabels[elements[0].index]}`, items);
                },
                onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => {
                        const val = ctx.raw;
                        const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                        return ` Valore: ${val} — ${pct}%`;
                    } } }
                },
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
                data: { labels: ['Contatti', 'Appuntamenti', 'Rich. Promo', 'Test Drive'], datasets: [{ data: [realTotal, stats.appuntamenti, stats.richiestaPromoSi, stats.testDriveSi], backgroundColor: ['#1a408099','#e91e6399','#00c85399','#7c4dff99'], borderColor: ['#1a4080','#e91e63','#00c853','#7c4dff'], borderWidth: 2, borderRadius: 8, borderSkipped: false }] },
                options: {
                    animation: false,
                    responsive: true, maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: {
                            title: ctx => ['Totale contatti promo','Appuntamenti fissati','Richiesta promo Sì','Test Drive Sì'][ctx[0].dataIndex],
                            label: ctx => {
                                const val = ctx.raw;
                                const pct = realTotal > 0 ? Math.round(val*1000/realTotal)/10 : 0;
                                return ` Valore: ${val} — ${pct}%`;
                            }
                        } }
                    },
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
                    animation: false,
                    responsive: true, maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: legendColor, font: { size: 11 }, padding: 12, boxWidth: 12,
                            generateLabels: chart => chart.data.labels.map((label, i) => {
                                const val = chart.data.datasets[0].data[i];
                                const t = si+no;
                                const pct = t > 0 ? Math.round(val*1000/t)/10 : 0;
                                return { text: `${label}: ${val} (${pct}%)`, fillStyle: ['#00c85399','#ff3d3d99'][i], strokeStyle: ['#00c853','#ff3d3d'][i], fontColor: legendColor, lineWidth: 0, index: i };
                            })
                        } },
                        tooltip: { callbacks: { label: ctx => {
                            const val = ctx.raw;
                            const t = si+no;
                            const pct = t > 0 ? Math.round(val*1000/t)/10 : 0;
                            return ` Valore: ${val} — ${pct}%`;
                        } } }
                    }
                }
            });
        }
    } catch (err) {
        console.error('Errore stats promo grafici:', err);
    }
}

function exportContactsExcel() {
    if (!contactLogsFiltered || contactLogsFiltered.length === 0) { alert('Nessun dato da esportare'); return; }
    const from = document.getElementById('contactFrom')?.value || '';
    const to = document.getElementById('contactTo')?.value || '';
    const operatorsSelected = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('contactOperatorFilterMulti') : [];
    const categoriesSelected = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('contactCategoryFilterMulti') : [];
    let url = '/api/contacts/export-excel?';
    if (from) url += `from=${from}&`;
    if (to) url += `to=${to}&`;
    if (operatorsSelected.length > 0) url += `operator=${encodeURIComponent(operatorsSelected.join(','))}&`;
    if (categoriesSelected.length > 0) url += `category=${encodeURIComponent(categoriesSelected.join(','))}&`;
    downloadFile(url);
}

function toggleAcquistoAlert() {
    selectedAcquistoAlert = !selectedAcquistoAlert;
    const btn = document.getElementById('contactAcquistoAlertBtn');
    if (btn) btn.classList.toggle('btn-sede-active', selectedAcquistoAlert);
    const hidden = document.getElementById('contactAcquistoAlert');
    if (hidden) hidden.value = selectedAcquistoAlert ? 'true' : 'false';
    updateAlertDestinatariVisibility();
}

// Stesso toggle ma per Pratica Leasing/Pratica Finanziamento — condivide lo
// stesso selettore destinatari dell'Acquisto (le categorie sono mutuamente
// esclusive: una sola alla volta è attiva nel form).
let selectedLeasingAlert = false;
function toggleLeasingAlert() {
    selectedLeasingAlert = !selectedLeasingAlert;
    const btn = document.getElementById('contactLeasingAlertBtn');
    if (btn) btn.classList.toggle('btn-sede-active', selectedLeasingAlert);
    const hidden = document.getElementById('contactLeasingAlert');
    if (hidden) hidden.value = selectedLeasingAlert ? 'true' : 'false';
    updateAlertDestinatariVisibility();
}

function updateAlertDestinatariVisibility() {
    const row = document.getElementById('contactAlertDestinatariRow');
    if (!row) return;
    const attivo = selectedAcquistoAlert || selectedLeasingAlert;
    row.style.display = attivo ? 'block' : 'none';
    if (attivo) loadUsersForAlertDestinatari();
}

// ============================================================
// DESTINATARI ALLERT — "invia a tutti" oppure uno o più utenti specifici.
// Se non è "tutti", solo i selezionati vedranno l'allert nel popup
// automatico e nella lista "Da Gestire" (il badge sulla riga resta
// visibile a chiunque veda comunque il contatto — è solo il "push"
// automatico ad essere mirato).
// ============================================================

let alertDestinatariUsersCache = null;

async function loadUsersForAlertDestinatari() {
    if (alertDestinatariUsersCache) { renderAlertDestinatariList(alertDestinatariUsersCache); return; }
    try {
        // /api/auth/users/basic (non /api/auth/users) perché è accessibile a
        // QUALSIASI utente autenticato, non solo ADMIN/GESTORE — altrimenti
        // un utente comune riceve 403 e la lista resta vuota.
        const res = await fetch('/api/auth/users/basic');
        if (!res.ok) return;
        alertDestinatariUsersCache = await res.json();
        renderAlertDestinatariList(alertDestinatariUsersCache);
    } catch (err) {
        console.error('Errore caricamento utenti per destinatari allert:', err);
    }
}

function renderAlertDestinatariList(users) {
    const list = document.getElementById('contactAlertDestinatariList');
    if (!list) return;
    list.innerHTML = users.map(u => `
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-primary);cursor:pointer;padding:4px 2px">
            <input type="checkbox" class="contact-alert-destinatario-checkbox" value="${u.id}" style="width:15px;height:15px;cursor:pointer;accent-color:#f0c040">
            ${u.fullName}
        </label>
    `).join('');
}

function toggleAlertInviaATutti() {
    const checked = document.getElementById('contactAlertInviaATutti')?.checked;
    const wrapper = document.getElementById('contactAlertDestinatariListWrapper');
    if (wrapper) wrapper.style.display = checked ? 'none' : 'block';
    if (!checked) loadUsersForAlertDestinatari();
}

// Letto al salvataggio — nomi dei campi allineati a quello che
// ContactLogController.java si aspetta: alertNotifyAll + alertRecipientIds.
function getAlertDestinatariPayload() {
    const inviaATutti = document.getElementById('contactAlertInviaATutti')?.checked !== false;
    if (inviaATutti) return { alertNotifyAll: true, alertRecipientIds: null };
    const checked = Array.from(document.querySelectorAll('.contact-alert-destinatario-checkbox:checked')).map(cb => Number(cb.value));
    return { alertNotifyAll: false, alertRecipientIds: checked };
}

// Un allert è visibile (popup automatico / lista Da Gestire) per l'utente
// corrente se: alertNotifyAll è true, oppure il suo ID compare tra
// alertRecipients (oggetti {id, fullName, ...} come restituiti dal backend).
function alertIsVisibleToCurrentUser(log) {
    if (!currentUser) return false;
    if (log.alertNotifyAll === false && Array.isArray(log.alertRecipients)) {
        return log.alertRecipients.some(u => u.id === currentUser.id);
    }
    return true; // default: invia a tutti (compatibilità con allert vecchi)
}

function openAcquistoAlertModal(id) {
    const log = contactLogs.find(l => l.id === id);
    if (!log || !log.acquistoAlert) return;
    acquistoAlertModalId = id;
    acquistoAlertNoteGestioneVisible = log.acquistoAlertStatus === 'IN_GESTIONE' || !!log.acquistoAlertNoteGestione;
    acquistoAlertNoteGestitaVisible = log.acquistoAlertStatus === 'GESTITA' || !!log.acquistoAlertNoteGestita;
    // Il pannello "a chi è segnalato" riparte sempre chiuso all'apertura,
    // per lasciare subito spazio e leggibilità alle note dell'allert (il
    // motivo per cui si apre il modal), invece di occupare tutto lo spazio
    // sopra di esse.
    const collapseBody = document.getElementById('acquistoAlertModalDestinatariCollapseBody');
    const collapseIcon = document.getElementById('acquistoAlertModalDestinatariCollapseIcon');
    if (collapseBody) collapseBody.style.display = 'none';
    if (collapseIcon) collapseIcon.style.transform = 'rotate(0deg)';
    refreshAcquistoAlertModalDisplay(log);
    const modal = document.getElementById('acquistoAlertModal');
    if (modal) modal.style.display = 'flex';
}

// Apre/chiude il pannello di modifica destinatari nel modal di gestione
// allert — chiuso di default (vedi openAcquistoAlertModal), così le note
// restano subito leggibili senza dover scrollare.
function toggleAcquistoAlertModalDestinatariCollapse() {
    const body = document.getElementById('acquistoAlertModalDestinatariCollapseBody');
    const icon = document.getElementById('acquistoAlertModalDestinatariCollapseIcon');
    if (!body) return;
    const isOpen = body.style.display === 'block';
    body.style.display = isOpen ? 'none' : 'block';
    if (icon) icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
}

function refreshAcquistoAlertModalDisplay(log) {
    const titleEl = document.getElementById('acquistoAlertModalTitle');
    if (titleEl) titleEl.textContent = `🔔 Gestione Allert — ${clienteNomeCompleto(log)}`;
    const visual = acquistoAlertVisual(log);
    const statusEl = document.getElementById('acquistoAlertModalStatus');
    if (statusEl) { statusEl.textContent = `${visual.icon} ${visual.label}`; statusEl.style.color = visual.color; }

    const clientInfoEl = document.getElementById('acquistoAlertModalClientInfo');
    if (clientInfoEl) {
        const date = log.contactDate.split('T')[0];
        const time = log.contactDate.split('T')[1]?.substring(0,5) || '';
        const linkParts = [];
        if (log.linkAuto) linkParts.push(`<a href="${log.linkAuto}" target="_blank" rel="noopener" style="color:#7c4dff;font-weight:700;text-decoration:none">🔗 Lead</a>`);
        clientInfoEl.innerHTML = `
            <div style="font-size:12px;color:var(--text-secondary);line-height:1.9">
                📅 ${formatDateIT(date)} · 🕐 ${time}<br>
                📞 ${clienteNumeroDisplay(log)}<br>
                👤 Operatore: ${log.user?.fullName || '—'}<br>
                📋 Tipologia: ${log.otherNote || '—'}
                ${log.acquistoNote ? `<br>📝 Nota: ${log.acquistoNote}` : ''}
                ${log.notaAggiuntiva ? `<br>📝 Nota aggiuntiva: ${log.notaAggiuntiva}` : ''}
                ${log.marca ? `<br>🚗 Veicolo: ${log.marca}${log.modello ? ' ' + log.modello : ''}` : ''}
                ${log.serviceTarga ? `<br>🔖 Targa: ${log.serviceTarga}` : ''}
                ${linkParts.length ? `<br>${linkParts.join(' · ')}` : ''}
                ${log.alertNotifyAll === false && Array.isArray(log.alertRecipients) && log.alertRecipients.length > 0
                    ? `<br><span style="color:#f0c040;font-weight:700">🎯 Destinatario/i: ${log.alertRecipients.map(u => u.fullName).join(', ')}</span>`
                    : ''}
            </div>`;
    } else {
        const infoEl = document.getElementById('acquistoAlertModalInfo');
        if (infoEl) infoEl.textContent = `${log.otherNote || ''}${log.acquistoNote ? ' · ' + log.acquistoNote : ''} · segnalato da ${log.user?.fullName || '—'}`;
    }

    const audit = acquistoAlertAuditInfo(log);
    const auditInGestioneEl = document.getElementById('acquistoAlertInGestioneInfo');
    if (auditInGestioneEl) { auditInGestioneEl.textContent = audit.inGestione || ''; auditInGestioneEl.style.display = audit.inGestione ? 'block' : 'none'; }
    const auditGestitaEl = document.getElementById('acquistoAlertGestitaInfo');
    if (auditGestitaEl) { auditGestitaEl.textContent = audit.gestita || ''; auditGestitaEl.style.display = audit.gestita ? 'block' : 'none'; }

    // NUOVO: chi ha inserito la nota la prima volta (separato da chi l'ha
    // modificata l'ultima volta)
    const noteGestioneInsEl = document.getElementById('acquistoAlertNoteGestioneInseritaInfo');
    if (noteGestioneInsEl) { noteGestioneInsEl.textContent = audit.noteGestioneInserita ? '✍️ Inserita da: ' + audit.noteGestioneInserita : ''; noteGestioneInsEl.style.display = audit.noteGestioneInserita ? 'block' : 'none'; }
    const noteGestitaInsEl = document.getElementById('acquistoAlertNoteGestitaInseritaInfo');
    if (noteGestitaInsEl) { noteGestitaInsEl.textContent = audit.noteGestitaInserita ? '✍️ Inserita da: ' + audit.noteGestitaInserita : ''; noteGestitaInsEl.style.display = audit.noteGestitaInserita ? 'block' : 'none'; }

    // NUOVO: ultima modifica alle note (chi/quando), anche per cancellazioni
    const noteGestioneModEl = document.getElementById('acquistoAlertNoteGestioneModificataInfo');
    if (noteGestioneModEl) { noteGestioneModEl.textContent = audit.noteGestioneModificata ? '✏️ Ultima modifica: ' + audit.noteGestioneModificata : ''; noteGestioneModEl.style.display = audit.noteGestioneModificata ? 'block' : 'none'; }
    const noteGestitaModEl = document.getElementById('acquistoAlertNoteGestitaModificataInfo');
    if (noteGestitaModEl) { noteGestitaModEl.textContent = audit.noteGestitaModificata ? '✏️ Ultima modifica: ' + audit.noteGestitaModificata : ''; noteGestitaModEl.style.display = audit.noteGestitaModificata ? 'block' : 'none'; }

    const noteGestioneRow = document.getElementById('acquistoAlertNoteGestioneRow');
    const noteGestitaRow = document.getElementById('acquistoAlertNoteGestitaRow');
    if (noteGestioneRow) noteGestioneRow.style.display = acquistoAlertNoteGestioneVisible ? 'block' : 'none';
    if (noteGestitaRow) noteGestitaRow.style.display = acquistoAlertNoteGestitaVisible ? 'block' : 'none';

    const noteGestioneEl = document.getElementById('acquistoAlertNoteGestione');
    const noteGestitaEl = document.getElementById('acquistoAlertNoteGestita');
    if (noteGestioneEl && document.activeElement !== noteGestioneEl) noteGestioneEl.value = log.acquistoAlertNoteGestione || '';
    if (noteGestitaEl && document.activeElement !== noteGestitaEl) noteGestitaEl.value = log.acquistoAlertNoteGestita || '';

    const readOnly = !canManageAlerts();
    if (noteGestioneEl) noteGestioneEl.disabled = readOnly;
    if (noteGestitaEl) noteGestitaEl.disabled = readOnly;
    ['acquistoAlertBtnInGestione','acquistoAlertBtnGestita','acquistoAlertBtnRimuovi'].forEach(elId => {
        const el = document.getElementById(elId);
        if (el) el.style.display = readOnly ? 'none' : 'inline-block';
    });
    const readOnlyNote = document.getElementById('acquistoAlertReadOnlyNote');
    if (readOnlyNote) readOnlyNote.style.display = readOnly ? 'block' : 'none';

    // NUOVO: mostra/popola il blocco "a chi è segnalato", modificabile solo
    // da chi ha i permessi di gestione allert (stessa regola di sopra).
    const destBlock = document.getElementById('acquistoAlertModalDestinatariBlock');
    if (destBlock) {
        destBlock.style.display = readOnly ? 'none' : 'block';
        if (!readOnly) {
            const inviaATuttiCheck = document.getElementById('acquistoAlertModalInviaATutti');
            const listWrapper = document.getElementById('acquistoAlertModalDestinatariListWrapper');
            const inviaATutti = log.alertNotifyAll !== false;
            if (inviaATuttiCheck) inviaATuttiCheck.checked = inviaATutti;
            if (listWrapper) listWrapper.style.display = inviaATutti ? 'none' : 'block';
            const selectedIds = (log.alertRecipients || []).map(u => u.id);
            loadUsersForAcquistoAlertModalDestinatari(selectedIds);
        }
    }
}

async function loadUsersForAcquistoAlertModalDestinatari(selectedIds) {
    const list = document.getElementById('acquistoAlertModalDestinatariList');
    if (!list) return;
    try {
        if (!alertDestinatariUsersCache) {
            // /api/auth/users/basic: MODERATORE e BACK_OFFICE possono gestire
            // gli allert (canManageAlerts) ma non hanno accesso a
            // /api/auth/users, riservato ad ADMIN/GESTORE.
            const res = await fetch('/api/auth/users/basic');
            if (res.ok) alertDestinatariUsersCache = await res.json();
        }
        list.innerHTML = (alertDestinatariUsersCache || []).map(u => `
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-primary);cursor:pointer;padding:4px 2px">
                <input type="checkbox" class="acquisto-alert-modal-destinatario-checkbox" value="${u.id}" ${selectedIds.includes(u.id) ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer;accent-color:#f0c040">
                ${u.fullName}
            </label>
        `).join('');
    } catch (err) {
        console.error('Errore caricamento utenti per destinatari allert (modal gestione):', err);
    }
}

function onAcquistoAlertModalDestinatariChange() {
    const checked = document.getElementById('acquistoAlertModalInviaATutti')?.checked;
    const wrapper = document.getElementById('acquistoAlertModalDestinatariListWrapper');
    if (wrapper) wrapper.style.display = checked ? 'none' : 'block';
}

// NUOVO: salva a posteriori la modifica dei destinatari di un allert già
// esistente — usa lo stesso PATCH già supportato dal backend per la
// creazione, chiamato qui su un contatto già salvato.
async function saveAcquistoAlertDestinatari() {
    if (!acquistoAlertModalId) return;
    const inviaATutti = document.getElementById('acquistoAlertModalInviaATutti')?.checked !== false;
    const alertRecipientIds = inviaATutti ? [] : Array.from(document.querySelectorAll('.acquisto-alert-modal-destinatario-checkbox:checked')).map(cb => Number(cb.value));
    try {
        const res = await fetch(`/api/contacts/${acquistoAlertModalId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alertNotifyAll: inviaATutti, alertRecipientIds })
        });
        if (!res.ok) { alert('Errore nel salvataggio dei destinatari'); return; }
        const updatedLog = await res.json();
        applyUpdatedLogEverywhere(updatedLog);
        alert('Destinatari aggiornati.');
    } catch (err) {
        console.error('Errore salvataggio destinatari allert:', err);
    }
}

function closeAcquistoAlertModal(event) {
    if (event && event.target.id !== 'acquistoAlertModal') return;
    const modal = document.getElementById('acquistoAlertModal');
    if (modal) modal.style.display = 'none';
    acquistoAlertModalId = null;
    acquistoAlertNoteGestioneVisible = false;
    acquistoAlertNoteGestitaVisible = false;
}

async function setAcquistoAlertStatus(status) {
    if (!acquistoAlertModalId || !canManageAlerts()) return;
    if (status === 'IN_GESTIONE') { acquistoAlertNoteGestioneVisible = true; }
    else if (status === 'GESTITA') { acquistoAlertNoteGestitaVisible = true; }
    else { acquistoAlertNoteGestioneVisible = false; acquistoAlertNoteGestitaVisible = false; }
    try {
        const res = await fetch(`/api/contacts/${acquistoAlertModalId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acquistoAlertStatus: status })
        });
        if (!res.ok) { const data = await res.json().catch(() => null); alert(data?.error || 'Errore nel salvataggio'); return; }
        const updatedLog = await res.json();
        applyUpdatedLogEverywhere(updatedLog);
        refreshAcquistoAlertModalDisplay(updatedLog);
    } catch (err) {
        console.error('Errore gestione allert:', err);
    }
}

async function saveAcquistoAlertNote(field) {
    if (!acquistoAlertModalId || !canManageAlerts()) return;
    const el = document.getElementById(field);
    const value = el ? el.value.trim() : '';
    try {
        const res = await fetch(`/api/contacts/${acquistoAlertModalId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [field]: value || null })
        });
        if (!res.ok) return;
        const updatedLog = await res.json();
        applyUpdatedLogEverywhere(updatedLog);
    } catch (err) {
        console.error('Errore salvataggio nota allert:', err);
    }
}

function applyUpdatedLogEverywhere(updatedLog) {
    const idx = contactLogs.findIndex(l => l.id === updatedLog.id);
    if (idx !== -1) contactLogs[idx] = updatedLog;
    const filteredIdx = contactLogsFiltered.findIndex(l => l.id === updatedLog.id);
    if (filteredIdx !== -1) contactLogsFiltered[filteredIdx] = updatedLog;

    if (currentDayView) { renderDayView(); }
    else { renderContactLogs(contactLogsFiltered); }

    renderChartInfoAcquisto(contactLogsFiltered);
    loadContactStatsTotaliStorici().then(() => renderChartInfoAcquisto(contactLogsFiltered));

    // FIX: se è aperto un modal "dettaglio" (da click su stat-card o grafico),
    // conteneva uno SNAPSHOT della lista preso al momento dell'apertura —
    // senza questo, cambiare stato/nota di un allert da lì (o da qualunque
    // altro punto mentre quel modal resta aperto dietro) non si vedeva finché
    // non si ricaricava la pagina. Ora si aggiorna anche lui, dal vivo.
    const detailIdx = lastDetailItems.findIndex(l => l.id === updatedLog.id);
    if (detailIdx !== -1) {
        lastDetailItems[detailIdx] = updatedLog;
        const detailModal = document.getElementById('sedeDetailModal');
        if (detailModal && detailModal.style.display === 'flex') {
            renderGenericContactDetail();
        }
    }

    // FIX: stesso discorso per il popup automatico "Info Acquisto Da Gestire"
    // — se è aperto e l'allert appena aggiornato non è più "da gestire" o
    // "in gestione", va tolto dalla lista subito, non solo al prossimo login.
    const daGestireModal = document.getElementById('acquistoAlertDaGestireModal');
    if (daGestireModal && daGestireModal.style.display === 'flex') {
        refreshAcquistoAlertDaGestireModalLive();
    }
}

// Ridisegna il contenuto del popup "Info Acquisto Da Gestire" già aperto,
// usando i dati aggiornati in contactLogs — non tocca il flag di sessione,
// quindi non lo riapre da solo se l'utente lo ha già chiuso.
function refreshAcquistoAlertDaGestireModalLive() {
    const modal = document.getElementById('acquistoAlertDaGestireModal');
    const list = document.getElementById('acquistoAlertDaGestireList');
    if (!modal || !list) return;

    const alertAttivi = contactLogs.filter(l => hasAcquistoAlert(l) && l.acquistoAlertStatus !== 'GESTITA');
    if (alertAttivi.length === 0) { modal.style.display = 'none'; return; }

    const daGestire = alertAttivi.filter(l => !l.acquistoAlertStatus || l.acquistoAlertStatus === 'DA_GESTIRE');
    const inGestione = alertAttivi.filter(l => l.acquistoAlertStatus === 'IN_GESTIONE');

    const renderCard = (log) => {
        const date = log.contactDate.split('T')[0];
        const time = log.contactDate.split('T')[1]?.substring(0,5) || '';
        const visual = acquistoAlertVisual(log);
        return `<div class="followup-card" style="margin-bottom:10px;cursor:pointer;border-left:4px solid ${visual.color}" onclick="closeAcquistoAlertDaGestireModal();openAcquistoAlertModal(${log.id})">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
                <div>
                    <div style="font-weight:800;color:${visual.color};font-size:14px">${visual.icon} ${clienteNomeCompleto(log)}</div>
                    <div style="margin-top:4px"><span style="font-size:11px;font-weight:700;background:${visual.bg};color:${visual.color};padding:2px 8px;border-radius:8px">${visual.icon} ${visual.label}</span></div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">📅 ${formatDateIT(date)} · 🕐 ${time}</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">📞 ${clienteNumeroDisplay(log)}</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">📋 ${log.otherNote || '—'}${log.acquistoNote ? ' · ' + log.acquistoNote : ''}</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">👤 Segnalato da ${log.user?.fullName || '—'}</div>
                    ${log.alertNotifyAll === false && Array.isArray(log.alertRecipients) && log.alertRecipients.length > 0
                        ? `<div style="font-size:12px;color:#f0c040;font-weight:700;margin-top:2px">🎯 Per: ${log.alertRecipients.map(u => u.fullName).join(', ')}</div>`
                        : ''}
                </div>
                <span style="color:${visual.color};font-size:18px">→</span>
            </div>
        </div>`;
    };

    let html = '';
    if (daGestire.length > 0) {
        html += `<div style="font-size:11px;font-weight:800;letter-spacing:1px;color:#ff9800;text-transform:uppercase;margin-bottom:10px">🔔 Da Gestire (${daGestire.length})</div>`;
        html += daGestire.map(renderCard).join('');
    }
    if (inGestione.length > 0) {
        html += `<div style="font-size:11px;font-weight:800;letter-spacing:1px;color:#f0c040;text-transform:uppercase;margin:16px 0 10px">🟡 In Gestione (${inGestione.length})</div>`;
        html += inGestione.map(renderCard).join('');
    }
    list.innerHTML = html;
}

let currentDayView = null;

// ============================================================
// SINCRONIZZAZIONE "LIVE" TRA OPERATORI — polling leggero.
// Non è un vero push in tempo reale (richiederebbe WebSocket, quindi
// modifiche al backend che non abbiamo ancora fatto) — ma un controllo
// automatico ogni 15 secondi che confronta i dati col server e aggiorna
// SOLO se qualcosa è davvero cambiato, senza disturbare chi sta scrivendo
// in un form o in una nota allert in quel momento.
// ============================================================

let contactPollIntervalId = null;
const CONTACT_POLL_INTERVAL_MS = 15000;

// ============================================================
// WEBSOCKET (STOMP su /ws, topic /topic/contacts) — push reale.
// Il polling qui sotto resta attivo in parallelo come rete di sicurezza:
// se il WS è connesso i dati arrivano istantanei, se per qualche motivo
// cade la connessione il polling ogni 15s copre comunque l'aggiornamento.
// ============================================================

let contactStompClient = null;
let contactWsConnected = false;

function connectContactWebSocket() {
    if (contactStompClient) return; // già creato (in fase di connessione o connesso)

    contactStompClient = new StompJs.Client({
        webSocketFactory: () => new SockJS('/ws'),
        reconnectDelay: 5000,
        onConnect: () => {
            contactWsConnected = true;
            console.log('%c✅ WebSocket contatti CONNESSO', 'color:#00c853;font-weight:bold');
            // Chiesto a QUALSIASI utente, non solo ai gestori: ora anche un
            // UTENTE comune può essere destinatario specifico di un allert.
            ensureNotificationPermission();
            contactStompClient.subscribe('/topic/contacts', (message) => {
                try {
                    const event = JSON.parse(message.body);
                    console.log('📩 Evento WebSocket ricevuto:', event);
                    handleContactWsEvent(event);
                } catch (err) {
                    console.error('Errore parsing evento WebSocket contatti:', err);
                }
            });
        },
        onDisconnect: () => {
            contactWsConnected = false;
            console.warn('⚠️ WebSocket contatti DISCONNESSO');
        },
        onWebSocketClose: () => {
            contactWsConnected = false;
            console.warn('⚠️ WebSocket contatti: connessione chiusa (onWebSocketClose)');
        },
        onStompError: (frame) => {
            console.error('❌ Errore STOMP contatti:', frame.headers && frame.headers['message']);
        }
    });

    console.log('🔌 Tentativo di connessione WebSocket contatti in corso...');
    contactStompClient.activate();
}

function disconnectContactWebSocket() {
    if (contactStompClient) {
        contactStompClient.deactivate();
        contactStompClient = null;
    }
    contactWsConnected = false;
}

function handleContactWsEvent(event) {
    if (!event || !event.type) return;

    // Stessa protezione già usata dal polling: non toccare la lista se
    // l'operatore ha il form "Nuovo Contatto" aperto o sta scrivendo
    // dentro una nota allert, altrimenti perderebbe quello che sta scrivendo.
    if (document.getElementById('newContactForm')?.style.display === 'block') return;
    const activeEl = document.activeElement;
    const isTypingNote = activeEl && (activeEl.id === 'acquistoAlertNoteGestione' || activeEl.id === 'acquistoAlertNoteGestita');
    if (isTypingNote) return;

    const { type, data } = event;

    // Serve il valore PRIMA della sovrascrittura per capire se l'allert è
    // "nuovo" per l'utente corrente (creato ora, oppure diventato visibile/
    // da-gestire ora e non lo era prima di questo evento).
    const previousLog = contactLogs.find(l => l.id === data.id);
    const wasPendingBefore = isAlertPendingForCurrentUser(previousLog);

    if (type === 'created') {
        if (!contactLogs.some(l => l.id === data.id)) {
            contactLogs.push(data);
        }
    } else if (type === 'updated') {
        const idx = contactLogs.findIndex(l => l.id === data.id);
        if (idx !== -1) contactLogs[idx] = data;
        else contactLogs.push(data);
    } else if (type === 'deleted') {
        contactLogs = contactLogs.filter(l => l.id !== data.id);
    } else {
        return;
    }

    contactLogs.sort((a, b) => (b.contactDate || '').localeCompare(a.contactDate || ''));
    applyContactFilters(currentDayView || undefined);
    loadContactStatsTotaliStorici().then(() => renderChartInfoAcquisto(contactLogsFiltered));

    // FIX: mancava qui lo stesso aggiornamento già fatto per le modifiche
    // fatte dall'utente stesso — un popup "dettaglio" aperto (da click su
    // grafico/stat-card, es. "Info Acquisto Effettuato (11)") teneva uno
    // SNAPSHOT congelato e non si accorgeva di contatti/allert nuovi o
    // modificati arrivati da un ALTRO utente via WebSocket. Ora si aggiorna
    // anche lui in tempo reale, non solo la lista principale.
    if (type === 'created' || type === 'updated') {
        const detailIdx = lastDetailItems.findIndex(l => l.id === data.id);
        if (detailIdx !== -1) {
            lastDetailItems[detailIdx] = data;
            const detailModal = document.getElementById('sedeDetailModal');
            if (detailModal && detailModal.style.display === 'flex') renderGenericContactDetail();
        } else if (type === 'created' && lastDetailItems.length > 0) {
            // Se il popup aperto sta mostrando "tutti quelli di categoria X"
            // e arriva un contatto NUOVO di quella stessa categoria, va
            // aggiunto alla lista aperta, non solo a quella di sfondo.
            const sampleCategory = lastDetailItems[0]?.category;
            if (sampleCategory && data.category === sampleCategory) {
                lastDetailItems.push(data);
                const detailModal = document.getElementById('sedeDetailModal');
                if (detailModal && detailModal.style.display === 'flex') renderGenericContactDetail();
            }
        }
    } else if (type === 'deleted') {
        const detailIdx = lastDetailItems.findIndex(l => l.id === data.id);
        if (detailIdx !== -1) {
            lastDetailItems.splice(detailIdx, 1);
            const detailModal = document.getElementById('sedeDetailModal');
            if (detailModal && detailModal.style.display === 'flex') renderGenericContactDetail();
        }
    }

    // Se l'allert è appena diventato "da gestire e visibile" per l'utente
    // corrente (e prima di questo evento non lo era), notifica ISTANTANEA:
    // suono + titolo lampeggiante + notifica desktop + apertura immediata
    // del popup "Da Gestire", senza aspettare il ricontrollo periodico né
    // un refresh/cambio finestra. La notifica vera e propria (suono ecc.)
    // parte dentro checkAcquistoAlertDaGestire stesso — non va duplicata
    // qui, altrimenti suonerebbe due volte.
    if (type === 'created' || type === 'updated') {
        const nowPending = isAlertPendingForCurrentUser(data);
        if (nowPending && !wasPendingBefore) {
            acquistoAlertDaGestireLastShownAt = 0; // bypassa il gate dei 30 min: è un allert genuinamente nuovo
            checkAcquistoAlertDaGestire();
        }
    }

    const daGestireModalWs = document.getElementById('acquistoAlertDaGestireModal');
    if (daGestireModalWs && daGestireModalWs.style.display === 'flex') {
        refreshAcquistoAlertDaGestireModalLive();
    }

    // Se il modal Allert è aperto sul contatto toccato dall'evento,
    // aggiornalo dal vivo (stesso comportamento del polling).
    if (acquistoAlertModalId) {
        const updated = contactLogs.find(l => l.id === acquistoAlertModalId);
        if (updated) refreshAcquistoAlertModalDisplay(updated);
    }
}

// FIX: il polling ogni 15 secondi confrontava i dati appena arrivati dal
// server (nell'ordine naturale del database) con quelli già in memoria
// (riordinati per data) — l'ordine risultava quindi SEMPRE "diverso" anche
// quando i dati erano identici, facendo ridisegnare tutto (grafici compresi,
// da cui l'effetto "si ricaricano da soli ogni tanto") ogni 15 secondi per
// niente. Ora che il WebSocket funziona in modo affidabile, il polling non
// serve più: lo rimuoviamo del tutto invece di ripararlo, così i grafici
// restano fermi finché non arriva davvero un cambiamento.
function startContactPolling() {
    connectContactWebSocket();
}

function stopContactPolling() {
    disconnectContactWebSocket();
}
let dayViewCategoryFilter = '';
let dayViewSubFilter = '';

function getSubcategoryList(category) {
    switch (category) {
        case 'Info Vendita': case 'Info Vendita in Promo': case 'Info + Appuntamento': return FONTE_LIST;
        case 'Service': return SERVICE_LIST;
        case 'Info Noleggio': return NOLEGGIO_TIPO_LIST;
        case 'Info Acquisto effettuato': return ACQUISTO_LIST;
        default: return null;
    }
}
function getSubcategoryValue(log) {
    switch (log.category) {
        case 'Info Vendita': case 'Info Vendita in Promo': return log.otherNote || '';
        case 'Info + Appuntamento': return log.serviceTipo || '';
        case 'Service': return log.serviceTipo || '';
        case 'Info Noleggio': return log.noleggioTipo || '';
        case 'Info Acquisto effettuato': return log.otherNote || '';
        default: return '';
    }
}
function getSecondaryFilterConfig(category) {
    if (category === 'Service') {
        return { values: SERVICE_SEDI_LIST, valueFn: log => log.serviceSede || '', labelFn: v => v, label: 'Sede', allLabel: 'Tutte le sedi', alwaysShowAll: false };
    }
    if (category === 'Info Noleggio') {
        return { values: ['SOLO_INFO','RICHIESTA_CLIENTE'], valueFn: log => log.noleggioRichiesta || '', labelFn: v => NOLEGGIO_RICHIESTA_LABELS[v] || v, label: 'Richiesta', allLabel: 'Tutte le richieste', alwaysShowAll: false };
    }
    if (category === 'Info Acquisto effettuato') {
        return { values: ['NO','SI'], valueFn: log => log.acquistoAlert ? 'SI' : 'NO', labelFn: v => ACQUISTO_ALERT_LABELS[v] || v, label: 'Allert', allLabel: 'Tutti', alwaysShowAll: true };
    }
    return null;
}
function getTertiaryFilterConfig(category, secondaryValue) {
    if (category === 'Info Acquisto effettuato' && secondaryValue === 'SI') {
        return { values: ['DA_GESTIRE', 'IN_GESTIONE', 'GESTITA'], valueFn: log => log.acquistoAlertStatus || 'DA_GESTIRE', labelFn: v => ACQUISTO_ALERT_STATUS_LABELS[v] || v, label: 'Stato Gestione', allLabel: 'Tutti gli stati', alwaysShowAll: true };
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
            const terConfig = getTertiaryFilterConfig(dayViewCategoryFilter, dayViewSecondaryFilter);
            if (terConfig && dayViewTertiaryFilter) {
                items = items.filter(l => terConfig.valueFn(l) === dayViewTertiaryFilter);
            }
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
    dayViewTertiaryFilter = '';
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
    const subPresent = subList ? subList.filter(s => baseItems.some(l => l.category === dayViewCategoryFilter && getSubcategoryValue(l) === s)) : [];
    const secConfig = dayViewCategoryFilter ? getSecondaryFilterConfig(dayViewCategoryFilter) : null;
    const secPresent = secConfig ? (secConfig.alwaysShowAll ? secConfig.values : secConfig.values.filter(v => baseItems.some(l => l.category === dayViewCategoryFilter && secConfig.valueFn(l) === v))) : [];
    const terConfig = (dayViewCategoryFilter && dayViewSecondaryFilter) ? getTertiaryFilterConfig(dayViewCategoryFilter, dayViewSecondaryFilter) : null;
    const terBaseItems = secConfig && dayViewSecondaryFilter ? baseItems.filter(l => l.category === dayViewCategoryFilter && secConfig.valueFn(l) === dayViewSecondaryFilter) : [];
    const terPresent = terConfig ? (terConfig.alwaysShowAll ? terConfig.values : terConfig.values.filter(v => terBaseItems.some(l => terConfig.valueFn(l) === v))) : [];
    const filtersActive = !!(dayViewCategoryFilter || dayViewSubFilter || dayViewSecondaryFilter || dayViewTertiaryFilter);

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
                <option value="">${secConfig.allLabel || `Tutte (${secConfig.label})`}</option>
                ${secPresent.map(v => `<option value="${v}" ${v===dayViewSecondaryFilter?'selected':''}>${secConfig.labelFn(v)}</option>`).join('')}
            </select>` : ''}
            ${terConfig ? `
            <select id="dayViewTertiaryFilter" class="input-dark" style="min-width:190px" onchange="onDayViewTertiaryFilterChange(this.value)">
                <option value="">${terConfig.allLabel || `Tutti (${terConfig.label})`}</option>
                ${terPresent.map(v => `<option value="${v}" ${v===dayViewTertiaryFilter?'selected':''}>${terConfig.labelFn(v)}</option>`).join('')}
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
function onDayViewCategoryChange(value) { dayViewCategoryFilter = value; dayViewSubFilter = ''; dayViewSecondaryFilter = ''; dayViewTertiaryFilter = ''; renderDayView(); }
function onDayViewSubFilterChange(value) { dayViewSubFilter = value; renderDayView(); }
function onDayViewSecondaryFilterChange(value) { dayViewSecondaryFilter = value; dayViewTertiaryFilter = ''; renderDayView(); }
function onDayViewTertiaryFilterChange(value) { dayViewTertiaryFilter = value; renderDayView(); }
function resetDayViewFilters() { dayViewCategoryFilter = ''; dayViewSubFilter = ''; dayViewSecondaryFilter = ''; dayViewTertiaryFilter = ''; renderDayView(); }
function closeDayView() {
    currentDayView = null;
    dayViewCategoryFilter = '';
    dayViewSubFilter = '';
    dayViewSecondaryFilter = '';
    dayViewTertiaryFilter = '';
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

function getISOWeekMonday(dateStr) {
    const d = parseLocalDate(dateStr);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - (day-1));
    d.setHours(0,0,0,0);
    return d;
}

let contactTreeSortDir = 'desc';

// FIX: prima l'ordinamento di mesi e settimane era alfabetico sulla label
// visualizzata (es. "agosto" prima di "luglio" perché A viene prima di L
// nell'alfabeto, anche se luglio è cronologicamente precedente), e le
// settimane a doppia cifra finivano fuori posto ("Settimana 10" prima di
// "Settimana 9"). Ora si ordina su chiavi numeriche reali (anno-mese,
// anno-numero settimana), con un toggle crescente/decrescente.
function toggleContactTreeSortDir() {
    contactTreeSortDir = contactTreeSortDir === 'desc' ? 'asc' : 'desc';
    const btn = document.getElementById('contactTreeSortBtn');
    if (btn) btn.textContent = contactTreeSortDir === 'desc' ? '⬇️ Più recenti prima' : '⬆️ Meno recenti prima';
    renderContactLogs(contactLogsFiltered);
}

function sortTreeEntries(entries) {
    return entries.sort((a, b) => {
        const cmp = a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0);
        return contactTreeSortDir === 'desc' ? -cmp : cmp;
    });
}

function renderContactLogs(logs) {
    const container = document.getElementById('contactLogsList');
    if (!container) return;
    if (logs.length === 0) {
        container.innerHTML = `<div class="empty-state"><div style="font-size:40px">📞</div><p>Nessun contatto registrato</p></div>`;
        return;
    }
    const tree = {};
    logs.forEach(log => {
        const date = log.contactDate.split('T')[0];
        const d = parseLocalDate(date);
        const year = d.getFullYear().toString();
        const monthLabel = d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
        const monthKey = `${year}-${String(d.getMonth()).padStart(2,'0')}`;
        const weekLabel = getWeekKey(date);
        const weekMonday = getISOWeekMonday(date);
        const weekNumMatch = weekLabel.match(/Settimana (\d+)/);
        const weekNum = weekNumMatch ? parseInt(weekNumMatch[1], 10) : 0;
        const weekSortKey = `${weekMonday.getFullYear()}-${String(weekNum).padStart(2,'0')}`;

        if (!tree[year]) tree[year] = {};
        if (!tree[year][monthKey]) tree[year][monthKey] = { label: monthLabel, weeks: {} };
        if (!tree[year][monthKey].weeks[weekSortKey]) tree[year][monthKey].weeks[weekSortKey] = { label: weekLabel, days: {}, monday: weekMonday };
        if (!tree[year][monthKey].weeks[weekSortKey].days[date]) tree[year][monthKey].weeks[weekSortKey].days[date] = [];
        tree[year][monthKey].weeks[weekSortKey].days[date].push(log);
    });

    const today = todayStr();
    container.innerHTML = sortTreeEntries(Object.entries(tree)).map(([year, months]) => {
        const yearKey = `year-${year}`;
        const yearCount = Object.values(months).flatMap(m => Object.values(m.weeks)).flatMap(w => Object.values(w.days)).flat().length;
        return `<div class="contact-tree-section">
            <div class="contact-tree-header contact-tree-year" onclick="toggleTree('${yearKey}')">
                <span>📁 ${year} <span class="tree-count">${yearCount} contatti</span></span>
                <span class="folder-arrow" id="arrow-${yearKey}">▼</span>
            </div>
            <div id="body-${yearKey}">
                ${sortTreeEntries(Object.entries(months)).map(([monthKey, monthData]) => {
                    const monthDomKey = `month-${year}-${monthKey.replace(/\s/g,'_')}`;
                    const monthCount = Object.values(monthData.weeks).flatMap(w => Object.values(w.days)).flat().length;
                    return `<div class="contact-tree-indent">
                        <div class="contact-tree-header contact-tree-month" onclick="toggleTree('${monthDomKey}')">
                            <span>📂 ${monthData.label} <span class="tree-count">${monthCount} contatti</span></span>
                            <span class="folder-arrow" id="arrow-${monthDomKey}">▼</span>
                        </div>
                        <div id="body-${monthDomKey}">
                            ${sortTreeEntries(Object.entries(monthData.weeks)).map(([weekSortKey, weekData]) => {
                                const weekDomKey = `week-${weekSortKey.replace(/[\s—]/g,'_')}`;
                                const weekCount = Object.values(weekData.days).flat().length;
                                const todayMonday = getISOWeekMonday(today);
                                const isCurrentWeek = weekData.monday.getTime() === todayMonday.getTime();
                                return `<div class="contact-tree-indent">
                                    <div class="contact-tree-header contact-tree-week" onclick="toggleTree('${weekDomKey}')">
                                        <span>🗓️ ${weekData.label} <span class="tree-count">${weekCount} contatti</span></span>
                                        <span class="folder-arrow" id="arrow-${weekDomKey}">▼</span>
                                    </div>
                                    <div id="body-${weekDomKey}" style="display:${isCurrentWeek?'block':'none'}">
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
    return getCategoryColor(dominant);
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
    const alert = hasAcquistoAlert(log);
    const alertVisual = alert ? acquistoAlertVisual(log) : null;
    const nomeHtml = alert ? `<span onclick="openAcquistoAlertModal(${log.id})" style="cursor:pointer;color:${alertVisual.color}" title="Gestisci Allert — ${alertVisual.label}">${alertVisual.icon} ${clienteNomeCompleto(log)}</span>` : clienteNomeCompleto(log);
    // Pulsante "Storico" — mostrato solo se, tra i contatti già caricati in
    // questa vista, esiste ALMENO un altro contatto dello stesso cliente
    // (stesso numero, oppure stesso nome+cognome). È solo un'euristica
    // economica per decidere se mostrare l'icona senza fare una chiamata al
    // server per ogni riga: il click apre comunque una ricerca completa su
    // tutto il database (vedi openCustomerHistoryModal), quindi anche se
    // l'euristica qui sotto non vede un match che esiste solo fuori dal
    // periodo caricato, non è un problema di correttezza dei dati — solo
    // l'icona potrebbe non comparire in quel caso limite.
    // FIX: prima l'icona compariva SOLO se un altro contatto dello stesso
    // cliente era già caricato nel periodo corrente (nascosta per chi ha
    // storico solo fuori da quel periodo), poi era stata resa sempre
    // visibile (mostrandola anche a chi ha una sola registrazione, inutile
    // da aprire). Ora usa gli aggregati calcolati dal server su TUTTA la
    // storia (clientiConStoricoNumeri/Nomi) — compare solo quando c'è
    // davvero più di una registrazione, indipendentemente dal periodo.
    const numeroNorm = (log.clienteNumero || '').trim();
    const nomeNormKey = (log.clienteNome && log.clienteCognome)
        ? `${log.clienteNome.trim().toLowerCase()}|${log.clienteCognome.trim().toLowerCase()}`
        : null;
    const hasHistory = (numeroNorm && clientiConStoricoNumeri.has(numeroNorm))
        || (nomeNormKey && clientiConStoricoNomi.has(nomeNormKey));
    const storicoBtn = hasHistory ? ` <button type="button" onclick="openCustomerHistoryModal('${(log.clienteNome||'').replace(/'/g,"\\'")}', '${(log.clienteCognome||'').replace(/'/g,"\\'")}', '${(log.clienteNumero||'').replace(/'/g,"\\'")}')" title="Storico cliente" style="background:none;border:none;cursor:pointer;font-size:13px;padding:0;margin-left:4px;vertical-align:middle">📁</button>` : '';
    return `<tr id="contact-row-${log.id}">
        <td style="font-weight:700;color:var(--text-primary)">${time}</td>
        <td style="font-size:12px;color:var(--text-primary);font-weight:700">${nomeHtml}${storicoBtn}<br><span style="font-weight:400;color:var(--text-secondary)">📞 ${clienteNumeroDisplay(log)}</span></td>
        <td>
            <span class="contact-category-badge cat-${catClass}">${log.category}</span>
            ${log.category === 'Info + Appuntamento' && log.otherNote ? `<span style="font-size:11px;background:rgba(233,30,99,0.1);color:#e91e63;padding:2px 8px;border-radius:8px;margin-left:6px">📍 ${log.otherNote}</span>` : ''}
            ${log.category === 'Info + Appuntamento' && log.linkAppuntamento ? `<a href="${log.linkAppuntamento}" target="_blank" rel="noopener" style="font-size:11px;background:rgba(74,144,217,0.1);color:#4a90d9;padding:2px 8px;border-radius:8px;margin-left:6px;text-decoration:none">🔗 Link</a>` : ''}
            ${log.category === 'Info Acquisto effettuato' && log.otherNote ? `<span style="font-size:11px;background:rgba(74,144,217,0.1);color:#4a90d9;padding:2px 8px;border-radius:8px;margin-left:6px">📋 ${log.otherNote}</span>` : ''}
            ${alert ? `<span onclick="openAcquistoAlertModal(${log.id})" style="cursor:pointer;font-size:11px;font-weight:700;background:${alertVisual.bg};color:${alertVisual.color};padding:2px 8px;border-radius:8px;margin-left:6px" title="Gestisci Allert">${alertVisual.icon} ${alertVisual.label}</span>` : ''}
            ${(log.category === 'Info Vendita' || log.category === 'Info + Appuntamento') && log.otherNote && FONTE_LIST.includes(log.otherNote) ? `<span style="font-size:11px;background:rgba(26,64,128,0.1);color:#1a4080;padding:2px 8px;border-radius:8px;margin-left:6px">🌐 ${log.otherNote}</span>` : ''}
            ${log.category === 'Service' && log.serviceSede ? `<span style="font-size:11px;background:rgba(233,30,99,0.1);color:#e91e63;padding:2px 8px;border-radius:8px;margin-left:6px">📍 ${log.serviceSede}</span>` : ''}
            ${log.category === 'Service' && log.serviceTipo ? `<span style="font-size:11px;background:rgba(240,192,64,0.1);color:#f0c040;padding:2px 8px;border-radius:8px;margin-left:6px">🔧 ${log.serviceTipo}</span>` : ''}
            ${log.category === 'Info Noleggio' && log.noleggioRichiesta ? `<span style="font-size:11px;background:rgba(0,200,83,0.1);color:#00c853;padding:2px 8px;border-radius:8px;margin-left:6px">${log.noleggioRichiesta === 'RICHIESTA_CLIENTE' ? '📞 Richiesta cliente' : 'ℹ️ Solo Info'}</span>` : ''}
            ${log.category === 'Info Noleggio' && log.noleggioTipo ? `<span style="font-size:11px;background:rgba(0,200,83,0.1);color:#00c853;padding:2px 8px;border-radius:8px;margin-left:6px">🏷️ ${log.noleggioTipo}</span>` : ''}
            ${log.category === 'Info Noleggio' && log.noleggioLink ? `<a href="${log.noleggioLink}" target="_blank" rel="noopener" style="font-size:11px;background:rgba(0,200,83,0.1);color:#00c853;padding:2px 8px;border-radius:8px;margin-left:6px;text-decoration:none">🔗 Lead</a>` : ''}
            ${log.category === 'Info Vendita in Promo' ? `<span style="font-size:11px;background:rgba(240,192,64,0.15);color:#f0c040;padding:2px 8px;border-radius:8px;margin-left:6px">🎯 PROMO</span>` : ''}
            ${marca ? `<span style="font-size:11px;background:rgba(0,200,83,0.1);color:#00c853;padding:2px 8px;border-radius:8px;margin-left:6px">🚗 ${marca}${modello?' '+modello:''}</span>` : ''}
            ${log.serviceTarga ? `<span style="font-size:11px;background:rgba(240,192,64,0.08);color:#f0c040;padding:2px 8px;border-radius:8px;margin-left:6px">🔖 ${log.serviceTarga}</span>` : ''}
            ${log.linkAuto ? `<a href="${log.linkAuto}" target="_blank" rel="noopener" style="font-size:11px;background:rgba(124,77,255,0.1);color:#7c4dff;padding:2px 8px;border-radius:8px;margin-left:6px;text-decoration:none">🔗 Lead</a>` : ''}
        </td>
        <td style="font-size:12px;color:var(--text-secondary)">${(() => {
            const parts = [];
            const primary = (log.category !== 'Info Acquisto effettuato' && log.category !== 'Service') ? log.otherNote : (log.acquistoNote || log.serviceNote);
            if (primary) parts.push(primary);
            if (log.notaAggiuntiva) parts.push('📝 ' + log.notaAggiuntiva);
            return parts.length > 0 ? parts.join(' · ') : '—';
        })()}</td>
        <td style="font-size:12px;color:var(--text-secondary)">${log.user.fullName}</td>
        <td>${canEdit
            ? `<button class="btn-contact-action btn-orange" onclick="openEditContactModal(${log.id})" title="Modifica">✏️</button><button class="btn-contact-action btn-red" onclick="deleteContactLog(${log.id})" title="Elimina">🗑️</button>`
            // FIX: prima qui c'era una stringa vuota '' quando canEdit è
            // false — la cella restava senza contenuto e la riga risultava
            // più bassa di quelle con i bottoni, dando l'effetto "a scalini"
            // (linee non allineate) nella tabella. Ora mettiamo gli STESSI
            // bottoni (stessa classe = stessa identica altezza/padding) ma
            // invisibili e non cliccabili, così ogni riga ha sempre
            // esattamente la stessa altezza, con o senza permessi.
            : `<button class="btn-contact-action btn-orange" style="visibility:hidden;pointer-events:none" tabindex="-1" aria-hidden="true">✏️</button><button class="btn-contact-action btn-red" style="visibility:hidden;pointer-events:none" tabindex="-1" aria-hidden="true">🗑️</button>`
        }</td>
    </tr>`;
}

function printDay(date) {
    const dayLogs = (currentDayView === date) ? getDayViewFilteredItems(date) : contactLogsFiltered.filter(l => l.contactDate.split('T')[0] === date);
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Registro ${date}</title><style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px}h2{font-size:16px;margin-bottom:10px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}th{background:#f0f0f0;font-weight:700;font-size:10px;text-transform:uppercase}@page{margin:15mm}</style></head><body>
        <h2>Registro Contatti — ${formatDateIT(date)}</h2>
        <table><thead><tr><th>Orario</th><th>Cliente</th><th>Categoria</th><th>Dettaglio</th><th>Marca/Modello</th><th>Operatore</th></tr></thead><tbody>
        ${dayLogs.map(log => `<tr><td>${log.contactDate.split('T')[1].substring(0,5)}</td><td>${clienteNomeCompleto(log)}<br>${clienteNumeroDisplay(log)}</td><td>${log.category}</td><td>${log.noleggioTipo||log.serviceTipo||log.otherNote||'—'}</td><td>${(log.marca||log.noleggioMarca)?(log.marca||log.noleggioMarca)+((log.modello||log.noleggioModello)?' '+(log.modello||log.noleggioModello):''):'—'}</td><td>${log.user.fullName}</td></tr>`).join('')}
        </tbody></table></body></html>`);
    win.document.close();
    win.print();
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
    contactLogsFiltered.forEach(log => {
        const date = log.contactDate.split('T')[0];
        if (!byDay[date]) byDay[date] = [];
        byDay[date].push(log);
    });
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${contactCalendarYear}-${String(contactCalendarMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const items = byDay[dateStr] || [];
        const isToday = dateStr === today;
        let bgStyle = '', borderStyle = '';
        if (items.length > 0) {
            const color = getDominantColor(items);
            bgStyle = `background:${color}73;`;
            borderStyle = `border-color:${color};`;
        }
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

function renderContactChartByOperator(targetCanvasId, logsOverride) {
    const ctx = document.getElementById(targetCanvasId || 'chartContactsByOperator');
    if (!ctx) return;
    if (contactChartByOperator) contactChartByOperator.destroy();
    const sourceLogs = logsOverride || contactLogs;
    const byOperator = {};
    sourceLogs.forEach(log => { byOperator[log.user.fullName] = (byOperator[log.user.fullName]||0) + 1; });
    const total = Object.values(byOperator).reduce((a,b) => a+b, 0);
    const labels = Object.keys(byOperator);
    const data = labels.map(op => byOperator[op]);
    const colors = labels.map((_,i) => OPERATOR_COLORS[i%OPERATOR_COLORS.length]);
    const legendColor = getLegendColor();

    contactChartByOperator = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors.map(c => c+'bb'), borderColor: colors, borderWidth: 2 }] },
        options: {
            animation: false,
            responsive: true, maintainAspectRatio: false,
            onClick: (evt, elements) => {
                if (elements.length === 0) return;
                const op = labels[elements[0].index];
                const items = contactLogs.filter(l => l.user.fullName === op);
                showGenericContactDetail(`Operatore — ${op}`, items);
            },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: {
                legend: { position: 'right', labels: { color: legendColor, font: { size: 11 }, padding: 8, boxWidth: 12,
                    generateLabels: chart => chart.data.labels.map((label,i) => {
                        const val = chart.data.datasets[0].data[i];
                        const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                        return { text: `${label}: ${val} (${pct}%)`, fillStyle: colors[i]+'bb', strokeStyle: colors[i], fontColor: legendColor, lineWidth: 0, index: i };
                    })
                } },
                tooltip: { callbacks: { label: ctx => {
                    const val = ctx.raw;
                    const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                    return ` Valore: ${val} — ${pct}%`;
                } } }
            }
        }
    });
    return contactChartByOperator;
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
        const tipoEl = document.getElementById('contactNoleggioTipo');
        if (tipoEl) tipoEl.value = '';
        ['Privato','PIVA','Aziende'].forEach(k => { const b = document.getElementById(`noleggio-${k}`); if (b) b.classList.remove('btn-sede-active'); });
        const linkEl = document.getElementById('contactNoleggioLink');
        if (linkEl) linkEl.value = '';
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
    ['InfoConsegna','RitardoConsegna','InfoDocumentazione','SecondaChiave','InfoGeneriche','Furto','Saldo'].forEach(k => { const btn = document.getElementById(`acquisto-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    const keyMap = { 'Info Consegna':'InfoConsegna','Ritardo Consegna':'RitardoConsegna','Info Documentazione':'InfoDocumentazione','Seconda chiave':'SecondaChiave','Info generiche':'InfoGeneriche','Furto':'Furto','Saldo':'Saldo' };
    const btn = document.getElementById(`acquisto-${keyMap[tipo]}`);
    if (btn) btn.classList.add('btn-sede-active');
    const noteRow = document.getElementById('contactAcquistoNoteRow');
    if (noteRow) noteRow.style.display = tipo === 'Info generiche' ? 'block' : 'none';
    // FIX: "Info generiche" ha una nota dedicata -> nasconde la nota universale
    // per evitare il doppione. Le altre sottotipologie di Acquisto non hanno
    // nota propria, quindi la nota universale resta visibile.
    const notaUniversaleRowAcq = document.getElementById('contactNotaUniversaleRow');
    if (notaUniversaleRowAcq) notaUniversaleRowAcq.style.display = tipo === 'Info generiche' ? 'none' : 'block';
}
function selectService(tipo) {
    selectedService = tipo;
    document.getElementById('contactServiceTipo').value = tipo;
    ['Tagliando','DispositivoSatellitare','Prenotazione','LavorazioneInCorso','DoctorGlass','CambioGomme','Altro'].forEach(k => { const btn = document.getElementById(`service-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    const keyMap = { 'Tagliando':'Tagliando','Dispositivo satellitare':'DispositivoSatellitare','Prenotazione':'Prenotazione','Lavorazione in corso':'LavorazioneInCorso','Doctor Glass':'DoctorGlass','Cambio Gomme':'CambioGomme','Altro':'Altro' };
    const btn = document.getElementById(`service-${keyMap[tipo]}`);
    if (btn) btn.classList.add('btn-sede-active');
    // FIX: la nota è ora sempre visibile per qualsiasi tipologia service
    // (Tagliando, Doctor Glass, Cambio Gomme ecc.), non solo per Altro/Prenotazione.
    // Cambia solo l'etichetta/placeholder per guidare l'operatore.
    const noteLabel = document.getElementById('contactServiceNoteLabel');
    if (tipo === 'Altro') { if (noteLabel) noteLabel.textContent = 'NOTA / MOTIVAZIONE *'; }
    else if (tipo === 'Prenotazione') { if (noteLabel) noteLabel.textContent = 'PRENOTAZIONE PER... (opzionale)'; }
    else { if (noteLabel) noteLabel.textContent = 'NOTA (opzionale)'; }
    // FIX: la nota dedicata di Service (sopra) e' ormai sempre visibile per
    // qualunque tipologia (Tagliando, Doctor Glass, Cambio Gomme, Altro...),
    // quindi la nota universale sotto al form sarebbe SEMPRE ridondante in
    // Service, non solo per "Altro" — la nascondiamo a prescindere dalla
    // tipologia scelta (onCategoryChange la nasconde già appena si entra in
    // Service; qui lo ribadiamo per sicurezza).
    const notaUniversaleRow = document.getElementById('contactNotaUniversaleRow');
    if (notaUniversaleRow) notaUniversaleRow.style.display = 'none';
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
    if (typeof isReadOnlySection === 'function' && isReadOnlySection('CONTACTS')) { alert('Non hai i permessi per creare contatti.'); return; }
    const category = document.getElementById('contactCategory').value;
    const clienteNome = document.getElementById('clienteNome')?.value.trim() || '';
    const clienteCognome = document.getElementById('clienteCognome')?.value.trim() || '';
    const clienteNumero = document.getElementById('clienteNumero')?.value.trim() || '';
    const nonComunicaNominativo = document.getElementById('nonComunicaNominativo')?.checked || false;
    const notaAggiuntiva = document.getElementById('contactNotaAggiuntiva')?.value.trim() || '';
    const otherNote = document.getElementById('contactOtherNote').value.trim();
    const dateVal = document.getElementById('contactDate').value;
    const timeVal = document.getElementById('contactTime').value;
    const sede = document.getElementById('contactAppuntamentoSede')?.value || '';
    const acquistoTipo = document.getElementById('contactAcquistoTipo')?.value || '';
    const acquistoNote = document.getElementById('contactAcquistoNote')?.value.trim() || '';
    const acquistoAlert = document.getElementById('contactAcquistoAlert')?.value === 'true';
    const acquistoMarca = document.getElementById('contactAcquistoMarca')?.value.trim() || '';
    const acquistoModello = document.getElementById('contactAcquistoModello')?.value.trim() || '';
    const acquistoTarga = document.getElementById('contactAcquistoTarga')?.value.trim() || '';
    // NUOVO: campi Pratica Leasing/Pratica Finanziamento — stesso schema
    // di Info Acquisto (marca/modello/targa opzionali + allert)
    const leasingMarca = document.getElementById('contactLeasingMarca')?.value.trim() || '';
    const leasingModello = document.getElementById('contactLeasingModello')?.value.trim() || '';
    const leasingTarga = document.getElementById('contactLeasingTarga')?.value.trim() || '';
    const leasingAlert = document.getElementById('contactLeasingAlert')?.value === 'true';
    const fonte = document.getElementById('contactFonte')?.value || '';
    const serviceTipo = document.getElementById('contactServiceTipo')?.value || '';
    const serviceSede = document.getElementById('contactServiceSede')?.value || '';
    const serviceNote = document.getElementById('contactServiceNote')?.value.trim() || '';
    const serviceMarca = document.getElementById('contactServiceMarca')?.value.trim() || '';
    const serviceModello = document.getElementById('contactServiceModello')?.value.trim() || '';
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
    // FIX: marca/modello Service ora opzionali su richiesta (prima erano
    // obbligatori) — l'operatore può salvare un contatto Service anche senza
    // sapere ancora il veicolo del cliente.
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

    // ANTI-DOPPIONE: cerca su TUTTA la storia del database (non solo i
    // contatti già caricati in memoria) se lo stesso cliente — identificato
    // per nome+cognome (senza distinguere maiuscole/minuscole o spazi) OPPURE
    // per lo stesso numero di telefono, basta una delle due — è già stato
    // registrato in passato.
    // - Se il match è nello STESSO GIORNO scelto in "DATA": popup bloccante
    //   che chiede conferma prima di salvare comunque (come prima).
    // - Se il match è su GIORNI DIVERSI (anche più di uno): avviso puramente
    //   informativo, non bloccante, con l'elenco di tutte le chiamate
    //   passate trovate (data, ora, categoria, tipologia/nota).
    {
        const nomeOk = !nonComunicaNominativo && clienteNome && clienteNome.trim() && clienteCognome && clienteCognome.trim();
        const numeroOk = clienteNumero && clienteNumero.trim();
        if (nomeOk || numeroOk) {
            try {
                const params = new URLSearchParams();
                if (nomeOk) { params.set('nome', clienteNome.trim()); params.set('cognome', clienteCognome.trim()); }
                if (numeroOk) params.set('numero', clienteNumero.trim());
                const storicoRes = await fetch(`/api/contacts/customer-history?${params.toString()}`);
                if (storicoRes.ok) {
                    const storico = await storicoRes.json();
                    const stessoGiorno = storico.filter(l => l.contactDate.split('T')[0] === dateVal);
                    const altriGiorni = storico.filter(l => l.contactDate.split('T')[0] !== dateVal);

                    if (stessoGiorno.length > 0) {
                        const l = stessoGiorno[0];
                        const oraGia = l.contactDate.split('T')[1]?.substring(0, 5) || '';
                        const notaGia = l.otherNote || l.acquistoNote || l.serviceNote || l.notaAggiuntiva || '';
                        const messaggio = `Il cliente ${clienteNome || ''} ${clienteCognome || ''} (${clienteNumero || 'numero non specificato'}) ha già chiamato oggi alle ${oraGia} per "${l.category}"${notaGia ? ` — nota: ${notaGia}` : ''}.\n\nDesideri inserirlo ugualmente?`;
                        if (!confirm(messaggio)) return;
                    }

                    if (altriGiorni.length > 0) {
                        const righe = altriGiorni.map(l => {
                            const [y, m, d] = l.contactDate.split('T')[0].split('-');
                            const dataFmt = `${d}/${m}/${y}`;
                            const oraFmt = l.contactDate.split('T')[1]?.substring(0, 5) || '';
                            const tipo = l.otherNote || l.acquistoNote || l.serviceNote || '';
                            const notaExtra = l.notaAggiuntiva || '';
                            return `• ${dataFmt} alle ${oraFmt} — ${l.category}${tipo ? ' / ' + tipo : ''}${notaExtra ? ' — ' + notaExtra : ''}`;
                        }).join('\n');
                        alert(`Il cliente ${clienteNome || ''} ${clienteCognome || ''} (${clienteNumero || 'numero non specificato'}) risulta già presente in archivio in date precedenti:\n\n${righe}`);
                    }
                }
            } catch (err) {
                console.error('Errore controllo storico cliente:', err);
            }
        }
    }

    const savedDayView = currentDayView || dateVal;

    let finalNote = otherNote;
    if (category === 'Info + Appuntamento') finalNote = sede;
    if (category === 'Info Acquisto effettuato') finalNote = acquistoTipo;
    if (category === 'Info Vendita') finalNote = fonte;
    if (category === 'Info Vendita in Promo') finalNote = fonte;

    const isNoleggio = category === 'Info Noleggio';
    const isRichiestaCliente = isNoleggio && noleggioRichiesta === 'RICHIESTA_CLIENTE';
    const isService = category === 'Service';
    const isAcquisto = category === 'Info Acquisto effettuato';
    const isLeasingFin = category === 'Pratica Leasing' || category === 'Pratica Finanziamento' || category === 'Amministrazione';

    // Destinatari — condiviso da Acquisto e Leasing/Finanziamento, letto
    // solo se una segnalazione è effettivamente attiva.
    const alertAttivoOra = (isAcquisto && acquistoAlert) || (isLeasingFin && leasingAlert);
    const destinatariPayload = alertAttivoOra ? getAlertDestinatariPayload() : { alertNotifyAll: true, alertRecipientIds: null };

    const payload = {
        category,
        clienteNome: nonComunicaNominativo ? (clienteNome || null) : clienteNome,
        clienteCognome: nonComunicaNominativo ? (clienteCognome || null) : clienteCognome,
        clienteNumero,
        nonComunicaNominativo,
        otherNote: finalNote,
        notaAggiuntiva: notaAggiuntiva || null,
        contactDate,
        marca: isNoleggio ? (noleggioMarca || null) : (isAcquisto ? (acquistoMarca || null) : (isService ? (serviceMarca || null) : (isLeasingFin ? (leasingMarca || null) : (marca || null)))),
        modello: isNoleggio ? (noleggioModello || null) : (isAcquisto ? (acquistoModello || null) : (isService ? (serviceModello || null) : (isLeasingFin ? (leasingModello || null) : (modello || null)))),
        linkAuto: (isNoleggio || isAcquisto) ? null : (linkAuto || null),
        serviceTipo: serviceTipo||null,
        serviceNote: isService ? (serviceNote || null) : null,
        serviceSede: isService ? (serviceSede || null) : null,
        acquistoNote: acquistoNote||null,
        acquistoAlert: isAcquisto ? acquistoAlert : (isLeasingFin ? leasingAlert : false),
        alertNotifyAll: destinatariPayload.alertNotifyAll,
        alertRecipientIds: destinatariPayload.alertRecipientIds,
        noleggioTipo: isRichiestaCliente ? (noleggioTipo||null) : null,
        noleggioLink: isRichiestaCliente ? (noleggioLink||null) : null,
        serviceTarga: isService ? (serviceTarga || null) : (isAcquisto ? (acquistoTarga || null) : (isLeasingFin ? (leasingTarga || null) : null)),
        serviceTipoCliente: isService ? serviceTipoCliente : null,
        noleggioRichiesta: isNoleggio ? noleggioRichiesta : null
    };
    if (category === 'Info + Appuntamento') {
        payload.serviceTipo = fonte||null;
    }

    try {
        const res = await fetch('/api/contacts', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) { const data = await res.json().catch(() => null); alert(data?.error || 'Errore nella creazione'); return; }
        const savedLog = await res.json();
        if (category === 'Info Vendita in Promo' && typeof savePromoContact === 'function') await savePromoContact(savedLog.id);
        hideNewContactForm();
        const from = document.getElementById('contactFrom')?.value;
        const to = document.getElementById('contactTo')?.value;
        await loadContactLogs(from, to, savedDayView);
    } catch (err) {
        console.error('Errore creazione contatto:', err);
    }
}

async function deleteContactLog(id) {
    if (typeof isReadOnlySection === 'function' && isReadOnlySection('CONTACTS')) { alert('Non hai i permessi per eliminare contatti.'); return; }
    if (!confirm('Eliminare questo contatto?')) return;
    const savedDayView = currentDayView;
    try {
        await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
        const from = document.getElementById('contactFrom')?.value;
        const to = document.getElementById('contactTo')?.value;
        await loadContactLogs(from, to, savedDayView);
    } catch (err) {
        console.error('Errore eliminazione:', err);
    }
}

function openEditContactModal(id, logData) {
    // FIX: se il log arriva da fuori contactLogs (es. dallo Storico Cliente,
    // che può includere contatti di QUALSIASI data, non solo il periodo
    // attualmente caricato in memoria), passarlo direttamente come secondo
    // argomento evita una contactLogs.find() che altrimenti fallirebbe
    // silenziosamente per le date non caricate.
    const log = logData || contactLogs.find(l => l.id === id);
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
    setVal('editContactServiceMarcaInput', log.marca);
    setVal('editContactServiceMarca', log.marca);
    setVal('editContactServiceModello', log.modello);
    setVal('editContactServiceNote', log.serviceNote);
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
    if (typeof isReadOnlySection === 'function' && isReadOnlySection('CONTACTS')) { alert('Non hai i permessi per modificare contatti.'); return; }
    if (!editingContactId) return;
    const category = document.getElementById('editContactCategory')?.value || '';
    const clienteNome = document.getElementById('editContactNome')?.value.trim() || '';
    const clienteCognome = document.getElementById('editContactCognome')?.value.trim() || '';
    const clienteNumero = document.getElementById('editContactNumero')?.value.trim() || '';
    const serviceTarga = document.getElementById('editContactTarga')?.value.trim() || '';
    const editServiceMarca = document.getElementById('editContactServiceMarca')?.value.trim() || '';
    const editServiceModello = document.getElementById('editContactServiceModello')?.value.trim() || '';
    const editServiceNote = document.getElementById('editContactServiceNote')?.value.trim() || '';
    if (!category) { alert('Seleziona una categoria'); return; }
    if (!clienteNumero) { alert('Il numero cliente è obbligatorio'); return; }
    const savedDayView = currentDayView;
    try {
        const payload = { category, clienteNome: clienteNome || null, clienteCognome: clienteCognome || null, clienteNumero, serviceTarga: serviceTarga || null };
        if (category === 'Service') {
            payload.marca = editServiceMarca || null;
            payload.modello = editServiceModello || null;
            payload.serviceNote = editServiceNote || null;
        }
        const res = await fetch(`/api/contacts/${editingContactId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) { const data = await res.json().catch(() => null); alert(data?.error || 'Errore nel salvataggio'); return; }
        closeEditContactModal();
        const from = document.getElementById('contactFrom')?.value;
        const to = document.getElementById('contactTo')?.value;
        await loadContactLogs(from, to, savedDayView);
    } catch (err) {
        console.error('Errore modifica:', err);
    }
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
    const notaAggiuntivaEl = document.getElementById('contactNotaAggiuntiva');
    if (notaAggiuntivaEl) notaAggiuntivaEl.value = '';
    const notaUniversaleRowReset = document.getElementById('contactNotaUniversaleRow');
    if (notaUniversaleRowReset) notaUniversaleRowReset.style.display = 'block';
    ['contactOtherNoteRow','contactAppuntamentoRow','contactAcquistoRow','contactAcquistoNoteRow',
     'contactFonteRow','contactServiceRow','contactMarcaModelloRow','contactLinkAutoRow',
     'contactPromoRow','contactNoleggioRow','contactServiceNoteRow','contactLeasingFinRow',
     'contactAlertDestinatariRow','contactAlertDestinatariListWrapper']
        .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    const noleggioDettagli = document.getElementById('contactNoleggioRichiestaDettagli');
    if (noleggioDettagli) noleggioDettagli.style.display = 'none';
    ['clienteNome','clienteCognome','clienteNumero',
     'contactAppuntamentoSede',
     'contactAcquistoTipo','contactFonte','contactServiceTipo','contactServiceSede','contactServiceNote',
     'contactMarcaInput','contactMarca','contactModello','contactLinkAuto','contactAcquistoNote',
     'contactAcquistoMarcaInput','contactAcquistoMarca','contactAcquistoModello','contactAcquistoTarga',
     'contactLeasingMarcaInput','contactLeasingMarca','contactLeasingModello','contactLeasingTarga',
     'contactNoleggioMarcaInput','contactNoleggioMarca','contactNoleggioModello',
     'contactNoleggioTipo','contactNoleggioLink','contactNoleggioRichiesta',
     'contactServiceMarcaInput','contactServiceMarca','contactServiceModello',
     'serviceTarga','serviceTipoCliente']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    selectedLeasingAlert = false;
    const leasingAlertBtnReset = document.getElementById('contactLeasingAlertBtn');
    if (leasingAlertBtnReset) leasingAlertBtnReset.classList.remove('btn-sede-active');
    const leasingAlertHiddenReset = document.getElementById('contactLeasingAlert');
    if (leasingAlertHiddenReset) leasingAlertHiddenReset.value = 'false';
    const inviaATuttiEl = document.getElementById('contactAlertInviaATutti');
    if (inviaATuttiEl) inviaATuttiEl.checked = true;
    const nonComEl = document.getElementById('nonComunicaNominativo');
    if (nonComEl) nonComEl.checked = false;
    document.getElementById('clienteNome').placeholder = 'Nome Cliente *';
    document.getElementById('clienteCognome').placeholder = 'Cognome Cliente *';
    selectedSede = ''; selectedAcquisto = ''; selectedFonte = ''; selectedService = '';
    selectedServiceSede = ''; selectedNoleggioTipo = ''; selectedNoleggioRichiesta = '';
    selectedAcquistoAlert = false;
    const acquistoAlertBtn = document.getElementById('contactAcquistoAlertBtn');
    if (acquistoAlertBtn) acquistoAlertBtn.classList.remove('btn-sede-active');
    const acquistoAlertHidden = document.getElementById('contactAcquistoAlert');
    if (acquistoAlertHidden) acquistoAlertHidden.value = 'false';
    SEDI_LIST.forEach(s => { const btn = document.getElementById(`sede-${s}`); if (btn) btn.classList.remove('btn-sede-active'); });
    SERVICE_SEDI_LIST.forEach(s => { const btn = document.getElementById(`serviceSede-${s}`); if (btn) btn.classList.remove('btn-sede-active'); });
    ['InfoConsegna','RitardoConsegna','InfoDocumentazione','SecondaChiave','InfoGeneriche','Furto','Saldo'].forEach(k => { const btn = document.getElementById(`acquisto-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    ['Sito','GoogleADS','Autoscout','Facebook','Instagram','TikTok','RichiestaCliente','NonRicorda'].forEach(k => { const btn = document.getElementById(`fonte-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    ['Tagliando','DispositivoSatellitare','Prenotazione','LavorazioneInCorso','DoctorGlass','CambioGomme','Altro'].forEach(k => { const btn = document.getElementById(`service-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    ['Privato','PIVA','Aziende'].forEach(k => { const btn = document.getElementById(`noleggio-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    ['SOLO_INFO','RICHIESTA_CLIENTE'].forEach(k => { const btn = document.getElementById(`noleggioRichiesta-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    ['CLIENTE','NON_CLIENTE'].forEach(k => { const btn = document.getElementById(`serviceCliente-${k}`); if (btn) btn.classList.remove('btn-sede-active'); });
    selectedServiceTipoCliente = '';
    const targaLabelReset = document.getElementById('serviceTargaLabel');
    if (targaLabelReset) targaLabelReset.textContent = 'TARGA (opzionale)';
    if (typeof resetPromoForm === 'function') resetPromoForm();
}

function onCategoryChange() {
    const cat = document.getElementById('contactCategory').value;
    // FIX: la nota universale in fondo al form serve solo per le categorie
    // che NON hanno già una propria nota dedicata. "Altro" e "Service" hanno
    // sempre una nota dedicata visibile, quindi qui la nota universale va
    // nascosta a prescindere dalla tipologia selezionata (per "Info Acquisto
    // effettuato" ci pensa selectAcquisto(), che dipende dalla sottotipologia).
    const notaUniversaleRowCat = document.getElementById('contactNotaUniversaleRow');
    if (notaUniversaleRowCat) notaUniversaleRowCat.style.display = (cat === 'Altro' || cat === 'Service') ? 'none' : 'block';
    document.getElementById('contactOtherNoteRow').style.display = cat === 'Altro' ? 'block' : 'none';
    document.getElementById('contactAppuntamentoRow').style.display = cat === 'Info + Appuntamento' ? 'block' : 'none';
    document.getElementById('contactAcquistoRow').style.display = cat === 'Info Acquisto effettuato' ? 'block' : 'none';
    const leasingFinRowEl = document.getElementById('contactLeasingFinRow');
    if (leasingFinRowEl) leasingFinRowEl.style.display = (cat === 'Pratica Leasing' || cat === 'Pratica Finanziamento' || cat === 'Amministrazione') ? 'block' : 'none';
    document.getElementById('contactServiceRow').style.display = cat === 'Service' ? 'block' : 'none';
    // FIX: senza questa riga, se si lasciava Service e poi ci si tornava,
    // la nota restava nascosta per sempre — il codice più sotto la nasconde
    // quando si esce da Service ma nessuno la faceva ricomparire al rientro.
    const serviceNoteRowEl = document.getElementById('contactServiceNoteRow');
    if (serviceNoteRowEl && cat === 'Service') serviceNoteRowEl.style.display = 'block';
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
        const dettagli = document.getElementById('contactNoleggioRichiestaDettagli');
        if (dettagli) dettagli.style.display = 'none';
    }
    if (cat !== 'Info + Appuntamento') {
        selectedSede='';
        const el=document.getElementById('contactAppuntamentoSede'); if(el) el.value='';
        SEDI_LIST.forEach(s=>{const b=document.getElementById(`sede-${s}`);if(b)b.classList.remove('btn-sede-active');});
    }
    if (cat !== 'Info Acquisto effettuato') {
        selectedAcquisto=''; selectedAcquistoAlert = false;
        const el=document.getElementById('contactAcquistoTipo'); if(el) el.value='';
        const nr=document.getElementById('contactAcquistoNoteRow'); if(nr) nr.style.display='none';
        const acquistoAlertBtn = document.getElementById('contactAcquistoAlertBtn');
        if (acquistoAlertBtn) acquistoAlertBtn.classList.remove('btn-sede-active');
        const acquistoAlertHidden = document.getElementById('contactAcquistoAlert');
        if (acquistoAlertHidden) acquistoAlertHidden.value = 'false';
        ['contactAcquistoMarcaInput','contactAcquistoMarca','contactAcquistoModello','contactAcquistoTarga'].forEach(id=>{const el2=document.getElementById(id);if(el2) el2.value='';});
        ['InfoConsegna','RitardoConsegna','InfoDocumentazione','SecondaChiave','InfoGeneriche','Furto','Saldo'].forEach(k=>{const b=document.getElementById(`acquisto-${k}`);if(b)b.classList.remove('btn-sede-active');});
    }
    if (cat !== 'Pratica Leasing' && cat !== 'Pratica Finanziamento' && cat !== 'Amministrazione') {
        selectedLeasingAlert = false;
        const leasingAlertBtn = document.getElementById('contactLeasingAlertBtn');
        if (leasingAlertBtn) leasingAlertBtn.classList.remove('btn-sede-active');
        const leasingAlertHidden = document.getElementById('contactLeasingAlert');
        if (leasingAlertHidden) leasingAlertHidden.value = 'false';
        ['contactLeasingMarcaInput','contactLeasingMarca','contactLeasingModello','contactLeasingTarga'].forEach(id=>{const el2=document.getElementById(id);if(el2) el2.value='';});
    }
    // Il selettore destinatari è condiviso da Acquisto/Leasing/Finanziamento:
    // va richiuso quando nessuna delle due segnalazioni resta attiva (es. si
    // cambia categoria del tutto).
    if (typeof updateAlertDestinatariVisibility === 'function') updateAlertDestinatariVisibility();
    if (cat !== 'Service') {
        selectedService=''; selectedServiceSede=''; selectedServiceTipoCliente='';
        const el=document.getElementById('contactServiceTipo'); if(el) el.value='';
        SERVICE_SEDI_LIST.forEach(s=>{const b=document.getElementById(`serviceSede-${s}`);if(b)b.classList.remove('btn-sede-active');});
        ['Tagliando','DispositivoSatellitare','Prenotazione','LavorazioneInCorso','DoctorGlass','CambioGomme','Altro'].forEach(k=>{const b=document.getElementById(`service-${k}`);if(b)b.classList.remove('btn-sede-active');});
        ['CLIENTE','NON_CLIENTE'].forEach(k=>{const b=document.getElementById(`serviceCliente-${k}`);if(b)b.classList.remove('btn-sede-active');});
        ['serviceTarga','serviceTipoCliente','contactServiceSede','contactServiceNote','contactServiceMarcaInput','contactServiceMarca','contactServiceModello'].forEach(id=>{const e=document.getElementById(id);if(e) e.value='';});
        const noteRow = document.getElementById('contactServiceNoteRow'); if (noteRow) noteRow.style.display = 'none';
        const tl = document.getElementById('serviceTargaLabel'); if (tl) tl.textContent = 'TARGA (opzionale)';
        const notaUniversaleRow = document.getElementById('contactNotaUniversaleRow'); if (notaUniversaleRow) notaUniversaleRow.style.display = 'block';
    }
    if (!isVenditaLike) {
        selectedFonte='';
        const el=document.getElementById('contactFonte'); if(el) el.value='';
        ['Sito','GoogleADS','Autoscout','Facebook','Instagram','TikTok','RichiestaCliente','NonRicorda'].forEach(k=>{const b=document.getElementById(`fonte-${k}`);if(b)b.classList.remove('btn-sede-active');});
    }
    if (!isVenditaLike) {
        ['contactMarcaInput','contactMarca','contactModello','contactLinkAuto'].forEach(id=>{const el=document.getElementById(id);if(el) el.value='';});
    }
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
// ===== STORICO CLIENTE =====
// Apre un modal con TUTTO lo storico di un cliente (nome+cognome e/o
// numero), interrogando sempre il backend su tutto il database — a
// differenza dell'anti-doppione al salvataggio, qui non c'è bisogno di
// distinguere per giorno: è semplicemente l'elenco completo, più recente
// per primo (il backend ordina già per data DESC).
let customerHistoryCache = [];

// Apre il dettaglio di una card cliccata nel modal Storico Cliente. Usa i
// dati già scaricati (customerHistoryCache), non contactLogs, perché lo
// storico può includere contatti di qualsiasi data, anche mai caricata
// nella vista corrente del Registro Contatti.
function openHistoryCardDetail(id) {
    const log = customerHistoryCache.find(l => l.id === id);
    if (!log) return;
    closeCustomerHistoryModal();
    openEditContactModal(id, log);
}

async function openCustomerHistoryModal(nome, cognome, numero) {
    const modal = document.getElementById('customerHistoryModal');
    const body = document.getElementById('customerHistoryModalBody');
    const title = document.getElementById('customerHistoryModalTitle');
    if (!modal || !body) return;

    const nomeCompleto = [nome, cognome].filter(Boolean).join(' ') || (numero || 'Cliente');
    if (title) title.textContent = `📁 Storico — ${nomeCompleto}`;
    body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-secondary)">Caricamento…</div>`;
    modal.style.display = 'flex';

    try {
        const params = new URLSearchParams();
        if (nome && cognome) { params.set('nome', nome); params.set('cognome', cognome); }
        if (numero) params.set('numero', numero);
        const res = await fetch(`/api/contacts/customer-history?${params.toString()}`);
        if (!res.ok) {
            body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-secondary)">Errore nel caricamento dello storico.</div>`;
            return;
        }
        const storico = await res.json();
        if (!storico || storico.length === 0) {
            body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-secondary)">Nessuno storico trovato per questo cliente.</div>`;
            return;
        }
        // Salvata per il click sulla card (vedi openHistoryCardDetail) — i
        // dati vengono da customer-history, non da contactLogs, quindi
        // potrebbero riguardare date mai caricate nella vista corrente.
        customerHistoryCache = storico;
        body.innerHTML = storico.map(l => {
            const [y, m, d] = l.contactDate.split('T')[0].split('-');
            const dataFmt = `${d}/${m}/${y}`;
            const oraFmt = l.contactDate.split('T')[1]?.substring(0, 5) || '';
            const tipo = l.otherNote || l.acquistoNote || l.serviceNote || '';
            const notaExtra = l.notaAggiuntiva || '';
            return `<div onclick="openHistoryCardDetail(${l.id})" style="cursor:pointer;background:var(--step-bg);border:1.5px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px" onmouseover="this.style.borderColor='var(--accent, #4a90d9)'" onmouseout="this.style.borderColor='var(--border)'">
                <div style="font-weight:700;color:var(--text-primary);margin-bottom:4px">📅 ${dataFmt} · 🕐 ${oraFmt}</div>
                <div style="font-size:12px;color:var(--text-secondary)">
                    <span class="contact-category-badge">${l.category}</span>
                    ${tipo ? `<br>📋 ${tipo}` : ''}
                    ${notaExtra ? `<br>📝 ${notaExtra}` : ''}
                    <br>👤 Operatore: ${l.user?.fullName || '—'}
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        console.error('Errore caricamento storico cliente:', err);
        body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-secondary)">Errore nel caricamento dello storico.</div>`;
    }
}

function closeCustomerHistoryModal(event) {
    if (event && event.target.id !== 'customerHistoryModal') return;
    document.getElementById('customerHistoryModal').style.display = 'none';
}
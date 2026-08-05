let currentUser = null;

// ===== SISTEMA PERMESSI PER RUOLO =====
// Matrice ruolo × sezione caricata dal server (GET /api/permissions),
// personalizzabile dall'admin nella pagina Permessi. Finché nessuno la
// personalizza, i valori di default replicano esattamente il comportamento
// storico (vedi RolePermissionService.java sul backend).
let permissionMatrix = {};

// NUOVO: permesso EFFETTIVO (ruolo + eventuale override personale) per
// l'utente attualmente loggato, sezione per sezione — a differenza di
// permissionMatrix (tabella per-ruolo intera, usata solo dalla pagina
// "Permessi per Ruolo"), tiene conto anche di un'eventuale eccezione
// impostata su questo specifico utente da "Permessi per Operatore".
let myEffectivePermissions = {};

const PAGE_TO_SECTION = {
    dashboard: 'DASHBOARD', followups: 'FOLLOWUPS', waiting: 'WAITING',
    contacts: 'CONTACTS', promo: 'PROMO', admin: 'ADMIN',
    rent: 'RENT', service: 'SERVICE', veicoli: 'VEICOLI'
};

// FIX: se il caricamento della matrice permessi fallisce (endpoint non
// ancora deployato sul server, problema di rete temporaneo, ecc.),
// permissionMatrix restava vuoto {} — e con la mappa vuota, hasAccess()
// nega TUTTO per chiunque, navbar compresa (anche il link della pagina su
// cui ci si trova già). Ora, in caso di fallimento, si usa questa mappa di
// riserva — identica al comportamento storico dell'app prima del sistema
// di permessi — così un problema di rete/deploy non blocca mai la
// navigazione, nel peggiore dei casi si torna al comportamento di sempre.
const PERMISSION_MATRIX_FALLBACK = {
    UTENTE: { CONTACTS: 'FULL' },
    BACK_OFFICE: { CONTACTS: 'FULL' },
    MODERATORE: { DASHBOARD: 'FULL', FOLLOWUPS: 'FULL', WAITING: 'FULL', CONTACTS: 'FULL', PROMO: 'FULL', RENT: 'FULL', SERVICE: 'FULL', GRAFICI: 'FULL' },
    GESTORE: { DASHBOARD: 'ADMIN_FULL', FOLLOWUPS: 'ADMIN_FULL', WAITING: 'ADMIN_FULL', CONTACTS: 'ADMIN_FULL', PROMO: 'ADMIN_FULL', RENT: 'ADMIN_FULL', SERVICE: 'ADMIN_FULL', GRAFICI: 'ADMIN_FULL', ADMIN: 'ADMIN_FULL' },
    ADMIN: { DASHBOARD: 'ADMIN_FULL', FOLLOWUPS: 'ADMIN_FULL', WAITING: 'ADMIN_FULL', CONTACTS: 'ADMIN_FULL', PROMO: 'ADMIN_FULL', RENT: 'ADMIN_FULL', SERVICE: 'ADMIN_FULL', GRAFICI: 'ADMIN_FULL', ADMIN: 'ADMIN_FULL', VEICOLI: 'ADMIN_FULL' },
    NOLEGGIO: { RENT: 'FULL' },
    SERVICE: { SERVICE: 'FULL' }
};

async function loadPermissionMatrix() {
    try {
        const res = await fetch('/api/permissions');
        if (!res.ok) { permissionMatrix = PERMISSION_MATRIX_FALLBACK; myEffectivePermissions = {}; return; }
        const data = await res.json();
        permissionMatrix = (data.matrix && Object.keys(data.matrix).length > 0) ? data.matrix : PERMISSION_MATRIX_FALLBACK;
        myEffectivePermissions = data.myEffective || {};
    } catch (err) {
        console.error('Errore caricamento permessi, uso la mappa di riserva:', err);
        permissionMatrix = PERMISSION_MATRIX_FALLBACK;
        myEffectivePermissions = {};
    }
}

// 'NONE' | 'READ_ONLY' | 'FULL' | 'ADMIN_FULL' — per il ruolo dell'utente
// loggato, a meno che non si passi esplicitamente un altro ruolo (usato
// dalla pagina Permessi per Ruolo, che deve leggere la matrice per TUTTI i
// ruoli, ignorando gli override personali di chiunque).
function getAccess(section, role) {
    if ((!role || role === currentUser?.role) && Object.keys(myEffectivePermissions).length > 0) {
        return myEffectivePermissions[section] || 'NONE';
    }
    role = role || currentUser?.role || 'UTENTE';
    return permissionMatrix?.[role]?.[section] || 'NONE';
}

function hasAccess(section, role) {
    return getAccess(section, role) !== 'NONE';
}

function isReadOnlySection(section, role) {
    return getAccess(section, role) === 'READ_ONLY';
}

// Può creare/modificare/eliminare in questa sezione (qualunque contenuto
// tranne quello creato da un ADMIN) — corrisponde a FULL o ADMIN_FULL.
function canWrite(section, role) {
    const access = getAccess(section, role);
    return access === 'FULL' || access === 'ADMIN_FULL';
}

// Può toccare ANCHE i contenuti creati da un utente ADMIN — solo ADMIN_FULL.
function canWriteAdminOwned(section, role) {
    return getAccess(section, role) === 'ADMIN_FULL';
}

// FIX: la scrollbar di .nav-links era completamente nascosta (solo
// estetica) — questo lasciava il mouse senza modo nativo di scrollare in
// orizzontale quando i link non ci stanno tutti. Touch (swipe) e tastiera
// (focus che si scrolla automaticamente in vista) funzionavano già.
// Prima si era provato a reimplementare un "trascina per scrollare" via
// JS (mousedown/mousemove, poi Pointer Events) ma risultava inaffidabile a
// seconda di browser/sistema operativo. Soluzione finale, più robusta:
// una scrollbar VERA (sottile, discreta, in tema) invece di nasconderla —
// vedi style.css — che si trascina in modo nativo col mouse, senza
// bisogno di alcun JS per il trascinamento stesso. Qui resta solo il
// supporto alla rotellina (verticale -> orizzontale), che è l'unica cosa
// che il browser non offre già di suo.
document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;

    navLinks.addEventListener('wheel', function(e) {
        if (navLinks.scrollWidth <= navLinks.clientWidth) return; // niente da scrollare
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // già scroll orizzontale nativo (trackpad), non toccarlo
        e.preventDefault();
        navLinks.scrollLeft += e.deltaY;
    }, { passive: false });
});

function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') !== 'light';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
    refreshChartsOnThemeChange();
}

function refreshChartsOnThemeChange() {
    if (typeof contactLogsFiltered !== 'undefined' && contactLogsFiltered) {
        if (typeof renderContactChartFromLogs === 'function') renderContactChartFromLogs(contactLogsFiltered);
        if (typeof renderContactChartByOperator === 'function') renderContactChartByOperator();
        if (typeof renderChartAppuntamentiSede === 'function') renderChartAppuntamentiSede(contactLogsFiltered);
        if (typeof renderChartInfoAcquisto === 'function') renderChartInfoAcquisto(contactLogsFiltered);
        if (typeof renderChartFonteVendita === 'function') renderChartFonteVendita(contactLogsFiltered);
        if (typeof renderChartServiceAgnano === 'function') renderChartServiceAgnano(contactLogsFiltered);
        if (typeof renderChartServiceSalerno === 'function') renderChartServiceSalerno(contactLogsFiltered);
        if (typeof renderChartService === 'function') renderChartService(contactLogsFiltered);
        if (typeof renderChartMarche === 'function') renderChartMarche(contactLogsFiltered);
        if (typeof renderContactCalendar === 'function') renderContactCalendar();
        if (typeof renderContactLogs === 'function') renderContactLogs(contactLogsFiltered);
    }
    if (typeof loadStats === 'function' && document.getElementById('dashboardPage')?.style.display === 'block') {
        loadStats();
    }
    if (document.getElementById('dashboardPage')?.style.display === 'block') {
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof renderRecallCalendar === 'function') renderRecallCalendar();
    }
    if (typeof refreshRentChartsOnThemeChange === 'function' && document.getElementById('rentPage')?.style.display === 'block') {
        refreshRentChartsOnThemeChange();
    }
    if (typeof refreshServiceChartsOnThemeChange === 'function' && document.getElementById('servicePage')?.style.display === 'block') {
        refreshServiceChartsOnThemeChange();
    }
}

// Pagine valide riconosciute dal router — usato per validare l'hash dell'URL
// (evita che un hash sporco o obsoleto mandi l'app in uno stato indefinito)
const VALID_PAGES = ['dashboard', 'followups', 'waiting', 'contacts', 'promo', 'admin', 'rent', 'service', 'veicoli'];

// FIX: prima qui c'erano RENT_ROLES/SERVICE_ROLES (array fissi di nomi
// ruolo) e un blocco di if/else per ogni singolo link di navbar — ora la
// visibilità di ognuno segue semplicemente la matrice permessi, che è
// personalizzabile dall'admin invece di essere scritta nel codice.
const NAV_ID_BY_SECTION = {
    DASHBOARD: 'navDashboard', FOLLOWUPS: 'navFollowups', WAITING: 'navWaiting',
    CONTACTS: 'navContacts', PROMO: 'navPromo', ADMIN: 'adminLink',
    RENT: 'navRent', SERVICE: 'navService', VEICOLI: 'navVeicoli'
};

function applyRolePermissions(role) {
    Object.entries(NAV_ID_BY_SECTION).forEach(([section, navId]) => {
        const el = document.getElementById(navId);
        if (!el) return;
        el.style.display = hasAccess(section, role) ? 'inline-block' : 'none';
    });

    // NUOVO: menu ☰ (per ora solo "Mostra Grafici") — visibile solo a chi ha
    // accesso alla sezione GRAFICI (default: Moderatore in su, personalizzabile
    // da Admin → Permessi).
    const hamburgerWrapper = document.getElementById('hamburgerMenuWrapper');
    if (hamburgerWrapper) hamburgerWrapper.style.display = hasAccess('GRAFICI', role) ? 'block' : 'none';

    if (role === 'UTENTE') {
        const wrapper = document.getElementById('contactOperatorFilterWrapper');
        if (wrapper) wrapper.style.display = 'none';
        const resetBtn = document.getElementById('contactResetBtn');
        if (resetBtn) resetBtn.style.display = 'none';
        const chartOp = document.getElementById('chartOperatoreWrapper');
        if (chartOp) chartOp.style.display = 'none';
    } else {
        const wrapper = document.getElementById('contactOperatorFilterWrapper');
        if (wrapper) wrapper.style.display = 'inline-block';
        const chartOp = document.getElementById('chartOperatoreWrapper');
        if (chartOp) chartOp.style.display = 'block';
    }
}

// Il tema di una dashboard verticale (navbar colorata + badge) dipende dalla
// pagina in cui ci si trova, non solo dal ruolo: NOLEGGIO/SERVICE lo vedono
// sempre, gli altri ruoli gestionali solo quando sono dentro quella pagina,
// tornando al tema normale altrove. Service ha priorità su Rent nel caso
// (teorico, non dovrebbe capitare) in cui entrambe le condizioni fossero vere.
function applyPageTheme(page, role) {
    const isNoleggio = role === 'NOLEGGIO';
    const isService = role === 'SERVICE';
    const isRentPage = page === 'rent';
    const isServicePage = page === 'service';
    const showRentTheme = isNoleggio || isRentPage;
    const showServiceTheme = isService || isServicePage;

    const body = document.body;
    const badge = document.getElementById('navBrandBadge');
    if (showServiceTheme) {
        body.setAttribute('data-role-theme', 'service');
        if (badge) badge.textContent = 'SERVICE';
    } else if (showRentTheme) {
        body.setAttribute('data-role-theme', 'noleggio');
        if (badge) badge.textContent = 'RENT';
    } else {
        body.removeAttribute('data-role-theme');
        if (badge) badge.textContent = 'BDC';
    }
}

// Ordine di priorità con cui scegliere la pagina "di default" per un ruolo,
// quando quella richiesta non è accessibile. NOLEGGIO/SERVICE restano un
// caso a parte perché, anche se in teoria avessero accesso ad altro, la loro
// "casa" naturale resta la propria dashboard dedicata.
const DEFAULT_PAGE_PRIORITY = ['dashboard', 'contacts', 'followups', 'waiting', 'promo', 'rent', 'service', 'veicoli', 'admin'];

function getDefaultPageForRole(role) {
    if (role === 'NOLEGGIO' && hasAccess('RENT', role)) return 'rent';
    if (role === 'SERVICE' && hasAccess('SERVICE', role)) return 'service';
    for (const page of DEFAULT_PAGE_PRIORITY) {
        if (hasAccess(PAGE_TO_SECTION[page], role)) return page;
    }
    return 'contacts';
}

// updateHash=true (default): scrive la pagina nell'hash dell'URL (#rent, #contacts...),
// così il tasto destro "apri in nuova scheda" e il refresh (F5) portano davvero
// alla pagina corretta invece di ripartire sempre dalla dashboard.
// updateHash=false: usato dal listener hashchange per evitare un loop infinito
// (altrimenti ogni cambio pagina riscriverebbe l'hash, che a sua volta rilancia
// showPage all'infinito).
function showPage(page, updateHash = true) {
    const role = currentUser?.role || 'UTENTE';

    if (!VALID_PAGES.includes(page)) page = 'dashboard';

    // FIX: prima qui c'erano controlli espliciti isNoleggio/isService/
    // canSeeAll — ora è la matrice permessi (personalizzabile dall'admin) a
    // decidere se il ruolo può vedere la pagina richiesta. Se non può, va
    // alla prima pagina accessibile secondo l'ordine di priorità.
    if (!hasAccess(PAGE_TO_SECTION[page], role)) {
        page = getDefaultPageForRole(role);
    }

    sessionStorage.setItem('currentPage', page);

    // Ferma polling/WebSocket dei Contatti ogni volta che si cambia pagina —
    // no-op sicuro se non erano attivi, evita che girino a vuoto quando non
    // si è sul Registro Contatti.
    if (typeof stopContactPolling === 'function') stopContactPolling();
    if (typeof disconnectContactWebSocket === 'function') disconnectContactWebSocket();
    if (typeof disconnectRentWebSocket === 'function') disconnectRentWebSocket();
    if (typeof disconnectServiceWebSocket === 'function') disconnectServiceWebSocket();

    // FIX: senza questo reset, la posizione di scroll della pagina precedente
    // resta invariata al cambio pagina (mostra/nascondi div, non una vera
    // navigazione). Se si arrivava da una pagina scrollata più in basso, la
    // pagina nuova sembrava "vuota" finché non si scorreva manualmente,
    // perché in realtà si era già scrollati oltre il suo contenuto iniziale.
    window.scrollTo(0, 0);

    if (updateHash) {
        // replaceState invece di location.hash diretto: evita di intasare la
        // cronologia del browser con una entry per ogni cambio pagina (il
        // tasto "indietro" del browser resterebbe altrimenti bloccato tra le
        // varie sezioni dell'app invece di uscire dal sito)
        history.replaceState(null, '', `#${page}`);
    }

    document.getElementById('dashboardPage').style.display = 'none';
    document.getElementById('followupsPage').style.display = 'none';
    document.getElementById('waitingPage').style.display = 'none';
    document.getElementById('contactsPage').style.display = 'none';
    document.getElementById('promoPage').style.display = 'none';
    document.getElementById('adminPage').style.display = 'none';
    const rentPageEl = document.getElementById('rentPage');
    if (rentPageEl) rentPageEl.style.display = 'none';
    const servicePageEl = document.getElementById('servicePage');
    if (servicePageEl) servicePageEl.style.display = 'none';
    const veicoliPageEl = document.getElementById('veicoliPage');
    if (veicoliPageEl) veicoliPageEl.style.display = 'none';

    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    if (page === 'dashboard') {
        document.getElementById('dashboardPage').style.display = 'block';
        document.getElementById('navDashboard').classList.add('active');
        loadStats();
    } else if (page === 'followups') {
        document.getElementById('followupsPage').style.display = 'block';
        document.getElementById('navFollowups').classList.add('active');
        const today = new Date().toISOString().split('T')[0];
        if (!document.getElementById('workDateFilter').value) {
            document.getElementById('workDateFilter').value = today;
        }
        loadFollowUps();
    } else if (page === 'waiting') {
        document.getElementById('waitingPage').style.display = 'block';
        document.getElementById('navWaiting').classList.add('active');
        loadWaitingList();
    } else if (page === 'contacts') {
        document.getElementById('contactsPage').style.display = 'block';
        document.getElementById('navContacts').classList.add('active');
        const today = new Date().toISOString().split('T')[0];
        const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            .toISOString().split('T')[0];
        if (!document.getElementById('contactFrom').value) {
            document.getElementById('contactFrom').value = firstDay;
            document.getElementById('contactTo').value = today;
        }
        setTimeout(() => {
            loadContactLogs(
                document.getElementById('contactFrom').value,
                document.getElementById('contactTo').value
            );
            // Avvia la connessione WebSocket per gli aggiornamenti istantanei
            // (con il polling ogni 15s come rete di sicurezza in parallelo,
            // già gestito da startContactPolling stesso).
            if (typeof startContactPolling === 'function') startContactPolling();
        }, 0);
    } else if (page === 'promo') {
        document.getElementById('promoPage').style.display = 'block';
        document.getElementById('navPromo').classList.add('active');
        if (typeof loadPromo === 'function') loadPromo();
        if (typeof renderPromoMarchiButtons === 'function') renderPromoMarchiButtons();
    } else if (page === 'admin') {
        document.getElementById('adminPage').style.display = 'block';
        document.getElementById('adminLink').classList.add('active');
        loadUsers();
    } else if (page === 'rent') {
        if (rentPageEl) rentPageEl.style.display = 'block';
        const navRent = document.getElementById('navRent');
        if (navRent) navRent.classList.add('active');
        if (typeof loadRentDashboard === 'function') loadRentDashboard();
    } else if (page === 'service') {
        if (servicePageEl) servicePageEl.style.display = 'block';
        const navService = document.getElementById('navService');
        if (navService) navService.classList.add('active');
        if (typeof loadServiceDashboard === 'function') loadServiceDashboard();
    } else if (page === 'veicoli') {
        if (veicoliPageEl) veicoliPageEl.style.display = 'block';
        const navVeicoli = document.getElementById('navVeicoli');
        if (navVeicoli) navVeicoli.classList.add('active');
        if (typeof loadVeicoliDashboard === 'function') loadVeicoliDashboard();
    }

    applyPageTheme(page, role);
}

// Legge la pagina corrente dall'hash dell'URL (es. "#rent" -> "rent").
// Usata sia all'avvio (per aprire subito la pagina giusta dopo login/refresh)
// sia dal listener hashchange (per gestire il tasto indietro/avanti del browser).
function getPageFromHash() {
    const hash = window.location.hash.replace('#', '').trim();
    return VALID_PAGES.includes(hash) ? hash : null;
}

// Reagisce ai cambi di hash che NON arrivano da showPage stesso (es. utente
// preme il pulsante indietro/avanti del browser, o modifica l'URL a mano).
// updateHash=false per non ri-scrivere l'hash che ha appena generato l'evento.
window.addEventListener('hashchange', function() {
    const page = getPageFromHash();
    if (page && currentUser) {
        showPage(page, false);
    }
});

window.onload = function() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('loginPage').style.display = 'none';

    const today = new Date().toISOString().split('T')[0];
    const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString().split('T')[0];
    document.getElementById('statsFrom').value = firstDay;
    document.getElementById('statsTo').value = today;

    fetch('/api/auth/me')
        .then(res => {
            if (res.ok) return res.json();
            throw new Error('Non autenticato');
        })
        .then(async data => {
            currentUser = data;
            document.getElementById('navUserName').textContent = data.fullName || data.email;

            // NUOVO: la matrice permessi va caricata prima di
            // applyRolePermissions/showPage, che ora la usano per decidere
            // cosa mostrare — senza aspettarla, la navbar si costruirebbe
            // ancora vuota (nessun permesso trovato = tutto nascosto).
            await loadPermissionMatrix();

            applyRolePermissions(data.role);
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';

            // Priorità alla pagina indicata nell'URL (hash) — così un refresh (F5)
            // o un "apri in nuova scheda" riaprono esattamente dove si era, invece
            // di tornare sempre alla pagina di default del ruolo.
            const hashPage = getPageFromHash();
            const defaultPage = getDefaultPageForRole(data.role);
            showPage(hashPage || defaultPage);

            // FIX PRESTAZIONI: loadStats() veniva chiamata QUI e poi anche
            // dentro showPage() quando la pagina è "dashboard" (poche righe
            // sopra) — due volte di seguito, raddoppiando le 4 richieste
            // parallele della Dashboard a 8 proprio al primo caricamento.
            // showPage() la richiama già da sola quando serve davvero.
            if (hasAccess('PROMO', data.role)) {
                if (typeof loadPromo === 'function') loadPromo();
            }

            // FIX: la sessione scadeva per inattività se il CRM restava aperto
            // senza interazioni (es. una scheda dimenticata aperta), costringendo
            // poi a refresh + nuovo login. Un "ping" leggero ogni 10 minuti tiene
            // viva la sessione automaticamente finché la scheda resta aperta,
            // così l'inattività dell'operatore non fa mai scadere nulla.
            startSessionKeepAlive();
        })
        .catch(() => {
            document.getElementById('loginPage').style.display = 'flex';
            document.getElementById('mainApp').style.display = 'none';
        });
};

let sessionKeepAliveIntervalId = null;
const SESSION_KEEPALIVE_INTERVAL_MS = 10 * 60 * 1000; // 10 minuti

function startSessionKeepAlive() {
    if (sessionKeepAliveIntervalId) return; // già attivo
    sessionKeepAliveIntervalId = setInterval(async () => {
        try {
            const res = await fetch('/api/auth/me');
            if (!res.ok) {
                // La sessione è scaduta comunque (es. riavvio del server) —
                // avvisa con calma invece di lasciare che le prossime azioni
                // falliscano silenziosamente con errori poco chiari.
                clearInterval(sessionKeepAliveIntervalId);
                sessionKeepAliveIntervalId = null;
                showSessionExpiredNotice();
            }
        } catch (err) {
            // Errore di rete temporaneo: non trattarlo come sessione scaduta,
            // ci riprova al giro successivo.
            console.warn('Ping sessione fallito (probabile problema di rete):', err);
        }
    }, SESSION_KEEPALIVE_INTERVAL_MS);
}

function showSessionExpiredNotice() {
    if (document.getElementById('sessionExpiredOverlay')) return; // già mostrato
    const overlay = document.createElement('div');
    overlay.id = 'sessionExpiredOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
        <div style="background:var(--bg-card,#14162a);border:1.5px solid var(--border,#2a2d3e);border-radius:16px;padding:32px;max-width:420px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5)">
            <div style="font-size:36px;margin-bottom:12px">🔒</div>
            <h3 style="color:var(--text-primary,#fff);font-size:16px;font-weight:800;margin-bottom:10px">Sessione scaduta</h3>
            <p style="color:var(--text-secondary,#8a8faa);font-size:13px;margin-bottom:20px">La tua sessione non è più valida. Ricarica la pagina per accedere di nuovo.</p>
            <button onclick="window.location.reload()" style="background:linear-gradient(135deg,#f0c040,#d4a820);color:#1a1200;border:none;border-radius:8px;padding:12px 28px;font-size:13px;font-weight:800;letter-spacing:1px;cursor:pointer;text-transform:uppercase">Ricarica ora</button>
        </div>`;
    document.body.appendChild(overlay);
}
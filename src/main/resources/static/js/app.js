let currentUser = null;

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
        if (typeof renderChartService === 'function') renderChartService(contactLogsFiltered);
        if (typeof renderChartMarche === 'function') renderChartMarche(contactLogsFiltered);
    }
    if (typeof loadStats === 'function' && document.getElementById('dashboardPage')?.style.display === 'block') {
        loadStats();
    }
    if (typeof refreshRentChartsOnThemeChange === 'function' && document.getElementById('rentPage')?.style.display === 'block') {
        refreshRentChartsOnThemeChange();
    }
    if (typeof refreshServiceChartsOnThemeChange === 'function' && document.getElementById('servicePage')?.style.display === 'block') {
        refreshServiceChartsOnThemeChange();
    }
}

// Ruoli che vedono la dashboard Rent (in aggiunta o in esclusiva)
const RENT_ROLES = ['NOLEGGIO', 'MODERATORE', 'GESTORE', 'ADMIN'];

// Ruoli che vedono la dashboard Service (in aggiunta o in esclusiva) —
// stesso pattern di RENT_ROLES.
const SERVICE_ROLES = ['SERVICE', 'MODERATORE', 'GESTORE', 'ADMIN'];

// Pagine valide riconosciute dal router — usato per validare l'hash dell'URL
// (evita che un hash sporco o obsoleto mandi l'app in uno stato indefinito)
const VALID_PAGES = ['dashboard', 'followups', 'waiting', 'contacts', 'promo', 'admin', 'rent', 'service'];

function applyRolePermissions(role) {
    const isAdmin = role === 'ADMIN';
    const isGestore = role === 'GESTORE';
    const isModerator = role === 'MODERATORE';
    const isNoleggio = role === 'NOLEGGIO';
    const isService = role === 'SERVICE';
    const canSeeAll = isAdmin || isGestore || isModerator;
    const canSeeRent = RENT_ROLES.includes(role);
    const canSeeService = SERVICE_ROLES.includes(role);

    // I ruoli NOLEGGIO e SERVICE vedono SOLO la propria dashboard dedicata:
    // tutto il resto (Dashboard, Follow-up, Recall, Registro Contatti, Promo,
    // Utenti) resta nascosto. Moderatore/Gestore/Admin vedono tutto, incluse
    // entrambe le dashboard verticali.
    document.getElementById('navDashboard').style.display = (canSeeAll && !isNoleggio && !isService) ? 'inline-block' : 'none';
    document.getElementById('navFollowups').style.display = (canSeeAll && !isNoleggio && !isService) ? 'inline-block' : 'none';
    document.getElementById('navWaiting').style.display = (canSeeAll && !isNoleggio && !isService) ? 'inline-block' : 'none';
    document.getElementById('navContacts').style.display = (isNoleggio || isService) ? 'none' : 'inline-block';
    document.getElementById('navPromo').style.display = (canSeeAll && !isNoleggio && !isService) ? 'inline-block' : 'none';
    document.getElementById('adminLink').style.display = ((isAdmin || isGestore) && !isNoleggio && !isService) ? 'inline-block' : 'none';

    const navRent = document.getElementById('navRent');
    if (navRent) navRent.style.display = canSeeRent ? 'inline-block' : 'none';

    const navService = document.getElementById('navService');
    if (navService) navService.style.display = canSeeService ? 'inline-block' : 'none';

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

// updateHash=true (default): scrive la pagina nell'hash dell'URL (#rent, #contacts...),
// così il tasto destro "apri in nuova scheda" e il refresh (F5) portano davvero
// alla pagina corretta invece di ripartire sempre dalla dashboard.
// updateHash=false: usato dal listener hashchange per evitare un loop infinito
// (altrimenti ogni cambio pagina riscriverebbe l'hash, che a sua volta rilancia
// showPage all'infinito).
function showPage(page, updateHash = true) {
    const role = currentUser?.role || 'UTENTE';
    const canSeeAll = role === 'ADMIN' || role === 'GESTORE' || role === 'MODERATORE';
    const isNoleggio = role === 'NOLEGGIO';
    const isService = role === 'SERVICE';

    if (!VALID_PAGES.includes(page)) page = 'dashboard';

    // I ruoli NOLEGGIO e SERVICE sono forzati sempre sulla propria pagina,
    // come UTENTE è forzato su contacts.
    if (isNoleggio && page !== 'rent') page = 'rent';
    else if (isService && page !== 'service') page = 'service';
    else if (!canSeeAll && !isNoleggio && !isService && page !== 'contacts') page = 'contacts';

    sessionStorage.setItem('currentPage', page);

    // Ferma polling/WebSocket dei Contatti ogni volta che si cambia pagina —
    // no-op sicuro se non erano attivi, evita che girino a vuoto quando non
    // si è sul Registro Contatti.
    if (typeof stopContactPolling === 'function') stopContactPolling();
    if (typeof disconnectContactWebSocket === 'function') disconnectContactWebSocket();
    if (typeof disconnectRentWebSocket === 'function') disconnectRentWebSocket();

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
        .then(data => {
            currentUser = data;
            document.getElementById('navUserName').textContent = data.fullName || data.email;
            applyRolePermissions(data.role);
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';

            // Priorità alla pagina indicata nell'URL (hash) — così un refresh (F5)
            // o un "apri in nuova scheda" riaprono esattamente dove si era, invece
            // di tornare sempre alla pagina di default del ruolo.
            const isNoleggio = data.role === 'NOLEGGIO';
            const isService = data.role === 'SERVICE';
            const hashPage = getPageFromHash();
            const defaultPage = isNoleggio ? 'rent' : (isService ? 'service' : (data.role === 'UTENTE' ? 'contacts' : 'dashboard'));
            showPage(hashPage || defaultPage);

            // FIX PRESTAZIONI: loadStats() veniva chiamata QUI e poi anche
            // dentro showPage() quando la pagina è "dashboard" (poche righe
            // sopra) — due volte di seguito, raddoppiando le 4 richieste
            // parallele della Dashboard a 8 proprio al primo caricamento.
            // showPage() la richiama già da sola quando serve davvero.
            if (data.role !== 'UTENTE' && !isNoleggio && !isService) {
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
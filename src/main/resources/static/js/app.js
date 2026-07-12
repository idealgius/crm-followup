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
}

// Ruoli che vedono la dashboard Rent (in aggiunta o in esclusiva)
const RENT_ROLES = ['NOLEGGIO', 'MODERATORE', 'GESTORE', 'ADMIN'];

// Pagine valide riconosciute dal router — usato per validare l'hash dell'URL
// (evita che un hash sporco o obsoleto mandi l'app in uno stato indefinito)
const VALID_PAGES = ['dashboard', 'followups', 'waiting', 'contacts', 'promo', 'admin', 'rent'];

function applyRolePermissions(role) {
    const isAdmin = role === 'ADMIN';
    const isGestore = role === 'GESTORE';
    const isModerator = role === 'MODERATORE';
    const isNoleggio = role === 'NOLEGGIO';
    const canSeeAll = isAdmin || isGestore || isModerator;
    const canSeeRent = RENT_ROLES.includes(role);

    // Il ruolo NOLEGGIO vede SOLO la dashboard Rent: tutto il resto nascosto
    document.getElementById('navDashboard').style.display = (canSeeAll && !isNoleggio) ? 'inline-block' : 'none';
    document.getElementById('navFollowups').style.display = (canSeeAll && !isNoleggio) ? 'inline-block' : 'none';
    document.getElementById('navWaiting').style.display = (canSeeAll && !isNoleggio) ? 'inline-block' : 'none';
    document.getElementById('navContacts').style.display = isNoleggio ? 'none' : 'inline-block';
    document.getElementById('navPromo').style.display = (canSeeAll && !isNoleggio) ? 'inline-block' : 'none';
    document.getElementById('adminLink').style.display = ((isAdmin || isGestore) && !isNoleggio) ? 'inline-block' : 'none';

    const navRent = document.getElementById('navRent');
    if (navRent) navRent.style.display = canSeeRent ? 'inline-block' : 'none';

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

// Il tema Rent (navbar verde + badge "RENT") dipende dalla pagina in cui ci si trova,
// non solo dal ruolo: NOLEGGIO lo vede sempre, gli altri ruoli gestionali solo
// quando sono dentro la pagina Rent, tornando al tema normale altrove.
function applyPageTheme(page, role) {
    const isNoleggio = role === 'NOLEGGIO';
    const isRentPage = page === 'rent';
    const showRentTheme = isNoleggio || isRentPage;

    const body = document.body;
    const badge = document.getElementById('navBrandBadge');
    if (showRentTheme) {
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

    if (!VALID_PAGES.includes(page)) page = 'dashboard';

    // Il ruolo NOLEGGIO è forzato sempre sulla pagina Rent, come UTENTE è forzato su contacts
    if (isNoleggio && page !== 'rent') page = 'rent';
    else if (!canSeeAll && !isNoleggio && page !== 'contacts') page = 'contacts';

    sessionStorage.setItem('currentPage', page);

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
            const hashPage = getPageFromHash();
            const defaultPage = isNoleggio ? 'rent' : (data.role === 'UTENTE' ? 'contacts' : 'dashboard');
            showPage(hashPage || defaultPage);

            if (data.role !== 'UTENTE' && !isNoleggio) {
                loadStats();
                if (typeof loadPromo === 'function') loadPromo();
            }
        })
        .catch(() => {
            document.getElementById('loginPage').style.display = 'flex';
            document.getElementById('mainApp').style.display = 'none';
        });
};
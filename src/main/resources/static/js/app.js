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
    }
    if (typeof loadStats === 'function' && document.getElementById('dashboardPage')?.style.display === 'block') {
        loadStats();
    }
}

function applyRolePermissions(role) {
    const isAdmin = role === 'ADMIN';
    const isGestore = role === 'GESTORE';
    const isModerator = role === 'MODERATORE';
    const canSeeAll = isAdmin || isGestore || isModerator;

    document.getElementById('navDashboard').style.display = canSeeAll ? 'inline-block' : 'none';
    document.getElementById('navFollowups').style.display = canSeeAll ? 'inline-block' : 'none';
    document.getElementById('navWaiting').style.display = canSeeAll ? 'inline-block' : 'none';
    document.getElementById('navContacts').style.display = 'inline-block';
    document.getElementById('adminLink').style.display = (isAdmin || isGestore) ? 'inline-block' : 'none';

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

function showPage(page) {
    const role = currentUser?.role || 'UTENTE';
    const canSeeAll = role === 'ADMIN' || role === 'GESTORE' || role === 'MODERATORE';

    if (!canSeeAll && page !== 'contacts') page = 'contacts';

    sessionStorage.setItem('currentPage', page);

    document.getElementById('dashboardPage').style.display = 'none';
    document.getElementById('followupsPage').style.display = 'none';
    document.getElementById('waitingPage').style.display = 'none';
    document.getElementById('contactsPage').style.display = 'none';
    document.getElementById('adminPage').style.display = 'none';

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
        // Il canvas è ora visibile (display:block appena impostato sopra),
        // ma diamo un tick al browser per il reflow prima che Chart.js calcoli le dimensioni
        setTimeout(() => {
            loadContactLogs(
                document.getElementById('contactFrom').value,
                document.getElementById('contactTo').value
            );
        }, 0);
    } else if (page === 'admin') {
        document.getElementById('adminPage').style.display = 'block';
        document.getElementById('adminLink').classList.add('active');
        loadUsers();
    }
}

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
            sessionStorage.removeItem('currentPage');
            document.getElementById('navUserName').textContent = data.fullName || data.email;
            applyRolePermissions(data.role);
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';

            const defaultPage = data.role === 'UTENTE' ? 'contacts' : 'dashboard';
            showPage(defaultPage);

            if (data.role !== 'UTENTE') loadStats();
        })
        .catch(() => {
            document.getElementById('loginPage').style.display = 'flex';
            document.getElementById('mainApp').style.display = 'none';
        });
};
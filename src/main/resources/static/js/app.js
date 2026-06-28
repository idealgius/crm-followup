let currentUser = null;

function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') !== 'light';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
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

    // UTENTE: nasconde filtro operatore nel registro contatti
    if (role === 'UTENTE') {
        const opFilter = document.getElementById('contactOperatorFilter');
        if (opFilter) opFilter.style.display = 'none';
    }
}

function showPage(page) {
    const role = currentUser?.role || 'UTENTE';
    const canSeeAll = role === 'ADMIN' || role === 'GESTORE' || role === 'MODERATORE';

    if (!canSeeAll && page !== 'contacts') return;

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
        loadContactLogs(
            document.getElementById('contactFrom').value,
            document.getElementById('contactTo').value
        );
    } else if (page === 'admin') {
        document.getElementById('adminPage').style.display = 'block';
        document.getElementById('adminLink').classList.add('active');
        loadUsers();
    }
}

window.onload = function() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

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
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            applyRolePermissions(data.role);

            const savedPage = sessionStorage.getItem('currentPage');
            const defaultPage = data.role === 'UTENTE' ? 'contacts' : 'dashboard';
            const startPage = savedPage || defaultPage;
            showPage(startPage);

            if (data.role !== 'UTENTE') loadStats();
        })
        .catch(() => {
            document.getElementById('loginPage').style.display = 'flex';
        });
};
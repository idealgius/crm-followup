let currentUser = null;

function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') !== 'light';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
}

function showPage(page) {
    document.getElementById('dashboardPage').style.display = 'none';
    document.getElementById('followupsPage').style.display = 'none';
    document.getElementById('waitingPage').style.display = 'none';
    document.getElementById('adminPage').style.display = 'none';

    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    if (page === 'dashboard') {
        document.getElementById('dashboardPage').style.display = 'block';
        document.querySelectorAll('.nav-link')[0].classList.add('active');
    } else if (page === 'followups') {
        document.getElementById('followupsPage').style.display = 'block';
        document.querySelectorAll('.nav-link')[1].classList.add('active');
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('workDateFilter').value = today;
        loadFollowUps();
    } else if (page === 'waiting') {
        document.getElementById('waitingPage').style.display = 'block';
        document.querySelectorAll('.nav-link')[2].classList.add('active');
        loadWaitingList();
    } else if (page === 'admin') {
        document.getElementById('adminPage').style.display = 'block';
        loadUsers();
    }
}

window.onload = function() {
    // Ripristina tema salvato
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
            if (data.role === 'ADMIN') {
                document.getElementById('adminLink').style.display = 'inline-block';
            }
            showPage('dashboard');
            loadStats();
        })
        .catch(() => {
            document.getElementById('loginPage').style.display = 'flex';
        });
};
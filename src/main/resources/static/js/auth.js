async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');

    if (!email || !password) {
        errorDiv.textContent = 'Inserisci email e password';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (!res.ok) {
            errorDiv.textContent = data.error || 'Errore di accesso';
            errorDiv.style.display = 'block';
            return;
        }

        currentUser = data;
        sessionStorage.removeItem('currentPage');

        document.getElementById('navUserName').textContent = data.fullName || data.email;
        applyRolePermissions(data.role);

        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';

        const defaultPage = data.role === 'UTENTE' ? 'contacts' : 'dashboard';
        showPage(defaultPage);

        if (data.role !== 'UTENTE') loadStats();

    } catch (err) {
        errorDiv.textContent = 'Errore di connessione: ' + err.message;
        errorDiv.style.display = 'block';
    }
}

async function register() {
    const fullName = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const errorDiv = document.getElementById('registerError');

    if (!fullName || !email || !password) {
        errorDiv.textContent = 'Compila tutti i campi';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ fullName, email, password })
        });

        const data = await res.json();

        if (!res.ok) {
            errorDiv.textContent = data.error || 'Errore di registrazione';
            errorDiv.style.display = 'block';
            return;
        }

        showLogin();
        alert('Registrazione completata! Ora puoi accedere.');

    } catch (err) {
        errorDiv.textContent = 'Errore di connessione: ' + err.message;
        errorDiv.style.display = 'block';
    }
}

async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    currentUser = null;
    sessionStorage.removeItem('currentPage');

    // Reset navbar: nasconde tutto finché il prossimo login non riapplica i permessi corretti
    document.getElementById('navDashboard').style.display = 'none';
    document.getElementById('navFollowups').style.display = 'none';
    document.getElementById('navWaiting').style.display = 'none';
    document.getElementById('adminLink').style.display = 'none';
    const chartOp = document.getElementById('chartOperatoreWrapper');
    if (chartOp) chartOp.style.display = 'none';
    const wrapper = document.getElementById('contactOperatorFilterWrapper');
    if (wrapper) wrapper.style.display = 'inline-block';
    const resetBtn = document.getElementById('contactResetBtn');
    if (resetBtn) resetBtn.style.display = 'none';

    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('loginPage').style.display = 'flex';
}

function showRegister() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('registerPage').style.display = 'flex';
}

function showLogin() {
    document.getElementById('registerPage').style.display = 'none';
    document.getElementById('loginPage').style.display = 'flex';
}

// ===== DROPDOWN NOME UTENTE =====
function toggleUserDropdown() {
    const menu = document.getElementById('userDropdownMenu');
    if (!menu) return;
    const isOpen = menu.style.display === 'block';
    menu.style.display = isOpen ? 'none' : 'block';
}

// Chiude il dropdown se si clicca fuori
document.addEventListener('click', function(e) {
    const wrapper = document.querySelector('.user-dropdown-wrapper');
    const menu = document.getElementById('userDropdownMenu');
    if (!wrapper || !menu) return;
    if (!wrapper.contains(e.target)) {
        menu.style.display = 'none';
    }
});

// ===== MODAL CAMBIO PASSWORD =====
function openChangePasswordModal() {
    document.getElementById('userDropdownMenu').style.display = 'none';
    document.getElementById('currentPasswordInput').value = '';
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('confirmPasswordInput').value = '';
    document.getElementById('changePasswordError').style.display = 'none';
    document.getElementById('changePasswordSuccess').style.display = 'none';
    document.getElementById('changePasswordModal').style.display = 'flex';
}

function closeChangePasswordModal(event) {
    if (event && event.target.id !== 'changePasswordModal') return;
    document.getElementById('changePasswordModal').style.display = 'none';
}

async function submitChangePassword() {
    const currentPassword = document.getElementById('currentPasswordInput').value;
    const newPassword = document.getElementById('newPasswordInput').value;
    const confirmPassword = document.getElementById('confirmPasswordInput').value;
    const errorDiv = document.getElementById('changePasswordError');
    const successDiv = document.getElementById('changePasswordSuccess');

    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';

    if (!currentPassword || !newPassword || !confirmPassword) {
        errorDiv.textContent = 'Compila tutti i campi';
        errorDiv.style.display = 'block';
        return;
    }
    if (newPassword.length < 6) {
        errorDiv.textContent = 'La nuova password deve avere almeno 6 caratteri';
        errorDiv.style.display = 'block';
        return;
    }
    if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'Le due password non coincidono';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        const res = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
        });

        const data = await res.json();

        if (!res.ok) {
            errorDiv.textContent = data.error || 'Errore durante il cambio password';
            errorDiv.style.display = 'block';
            return;
        }

        successDiv.textContent = 'Password aggiornata con successo!';
        successDiv.style.display = 'block';
        document.getElementById('currentPasswordInput').value = '';
        document.getElementById('newPasswordInput').value = '';
        document.getElementById('confirmPasswordInput').value = '';

        setTimeout(() => {
            closeChangePasswordModal();
        }, 1500);

    } catch (err) {
        errorDiv.textContent = 'Errore di connessione: ' + err.message;
        errorDiv.style.display = 'block';
    }
}
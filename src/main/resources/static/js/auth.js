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
        document.getElementById('navUserName').textContent = data.fullName || data.email;
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        showPage('dashboard');
        loadStats();

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
async function loadUsers() {
    try {
        const res = await fetch('/api/auth/users');
        if (!res.ok) return;
        const users = await res.json();
        renderUsers(users);
    } catch (err) {
        console.error('Errore caricamento utenti:', err);
    }
}

function renderUsers(users) {
    const container = document.getElementById('usersList');
    if (!users || users.length === 0) {
        container.innerHTML = `<div class="empty-state"><h3>👤</h3><p>Nessun utente trovato</p></div>`;
        return;
    }
    container.innerHTML = users.map(u => `
        <div class="waiting-card">
            <div>
                <div class="waiting-name">${u.fullName}</div>
                <div class="waiting-details">${u.email} · <span class="status-badge status-${u.role}">${u.role}</span></div>
            </div>
            <div class="waiting-actions">
                <button class="btn-small btn-red" onclick="deleteUser(${u.id})">🗑️ Elimina</button>
            </div>
        </div>
    `).join('');
}

async function createUser() {
    const fullName = document.getElementById('newUserName').value;
    const email = document.getElementById('newUserEmail').value;
    const password = document.getElementById('newUserPassword').value;

    if (!fullName || !email || !password) {
        alert('Compila tutti i campi');
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
            alert(data.error || 'Errore nella creazione');
            return;
        }

        hideNewUserForm();
        loadUsers();
        alert('Utente creato con successo!');
    } catch (err) {
        console.error('Errore creazione utente:', err);
    }
}

async function deleteUser(id) {
    if (!confirm('Sei sicuro di voler eliminare questo utente?')) return;
    try {
        await fetch(`/api/auth/users/${id}`, { method: 'DELETE' });
        loadUsers();
    } catch (err) {
        console.error('Errore eliminazione utente:', err);
    }
}

function showNewUserForm() {
    document.getElementById('newUserForm').style.display = 'block';
}

function hideNewUserForm() {
    document.getElementById('newUserForm').style.display = 'none';
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserEmail').value = '';
    document.getElementById('newUserPassword').value = '';
}
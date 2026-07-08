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

    const isAdmin = currentUser?.role === 'ADMIN';
    const isGestore = currentUser?.role === 'GESTORE';

    container.innerHTML = users.map(u => {
        const isCurrentUser = u.id === currentUser?.id;
        const targetIsAdmin = u.role === 'ADMIN';
        const canChangeRole = (isAdmin || isGestore) && !targetIsAdmin && !isCurrentUser;
        const canDelete = (isAdmin || isGestore) && !targetIsAdmin && !isCurrentUser;

        return `
        <div class="waiting-card">
            <div>
                <div class="waiting-name">${u.fullName}</div>
                <div class="waiting-details" style="margin-top:6px">
                    ${u.email}
                </div>
                <div style="margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                    ${canChangeRole ? `
                        <select class="input-dark" style="font-size:12px;padding:4px 10px;border-radius:6px"
                            onchange="changeUserRole(${u.id}, this.value)">
                            <option value="UTENTE" ${u.role === 'UTENTE' ? 'selected' : ''}>Utente</option>
                            <option value="MODERATORE" ${u.role === 'MODERATORE' ? 'selected' : ''}>Moderatore</option>
                            <option value="GESTORE" ${u.role === 'GESTORE' ? 'selected' : ''}>Gestore</option>
                            <option value="NOLEGGIO" ${u.role === 'NOLEGGIO' ? 'selected' : ''}>Noleggio</option>
                            ${isAdmin ? `<option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>Admin</option>` : ''}
                        </select>
                    ` : `
                        <span class="status-badge status-${u.role}">${formatRole(u.role)}</span>
                    `}
                </div>
            </div>
            <div class="waiting-actions">
                ${canDelete ? `<button class="btn-small btn-red" onclick="deleteUser(${u.id})">🗑️ Elimina</button>` : ''}
            </div>
        </div>
        `;
    }).join('');
}

function formatRole(role) {
    const map = {
        'UTENTE': 'Utente',
        'MODERATORE': 'Moderatore',
        'GESTORE': 'Gestore',
        'ADMIN': 'Admin',
        'NOLEGGIO': 'Noleggio'
    };
    return map[role] || role;
}

async function changeUserRole(userId, newRole) {
    try {
        const res = await fetch(`/api/auth/users/${userId}/role`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });
        if (!res.ok) {
            alert('Errore nel cambio ruolo');
            loadUsers();
            return;
        }
        loadUsers();
    } catch (err) {
        console.error('Errore cambio ruolo:', err);
    }
}

async function createUser() {
    const fullName = document.getElementById('newUserName').value;
    const email = document.getElementById('newUserEmail').value;
    const password = document.getElementById('newUserPassword').value;
    const role = document.getElementById('newUserRole')?.value || 'UTENTE';

    if (!fullName || !email || !password) {
        alert('Compila tutti i campi');
        return;
    }

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ fullName, email, password, role })
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
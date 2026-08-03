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
                            <option value="UTENTE" ${u.role === 'UTENTE' ? 'selected' : ''}>BDC</option>
                            <option value="BACK_OFFICE" ${u.role === 'BACK_OFFICE' ? 'selected' : ''}>Back Office</option>
                            <option value="MODERATORE" ${u.role === 'MODERATORE' ? 'selected' : ''}>Moderatore</option>
                            <option value="GESTORE" ${u.role === 'GESTORE' ? 'selected' : ''}>Gestore</option>
                            <option value="NOLEGGIO" ${u.role === 'NOLEGGIO' ? 'selected' : ''}>Noleggio</option>
                            <option value="SERVICE" ${u.role === 'SERVICE' ? 'selected' : ''}>Service</option>
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
        'UTENTE': 'BDC',
        'BACK_OFFICE': 'Back Office',
        'MODERATORE': 'Moderatore',
        'GESTORE': 'Gestore',
        'ADMIN': 'Admin',
        'NOLEGGIO': 'Noleggio',
        'SERVICE': 'Service'
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

// ===== GESTIONE PERMESSI PER RUOLO =====
// Etichette e icone identiche a quelle già usate nella navbar (stessa fonte
// visiva, per coerenza con il resto dell'app) — vedi i link #dashboard,
// #followups, ecc. in index.html.
const PERMISSION_SECTIONS = [
    { key: 'DASHBOARD', icon: '📊', label: 'Dashboard' },
    { key: 'FOLLOWUPS', icon: '📋', label: 'Follow-up' },
    { key: 'WAITING', icon: '🔔', label: 'Recall' },
    { key: 'CONTACTS', icon: '📞', label: 'Registro Contatti' },
    { key: 'PROMO', icon: '🎯', label: 'Promo' },
    { key: 'RENT', icon: '🚗', label: 'Rent' },
    { key: 'SERVICE', icon: '🔧', label: 'Service' },
    { key: 'GRAFICI', icon: '☰', label: 'Menu Grafici' },
    { key: 'ADMIN', icon: '⚙️', label: 'Utenti/Permessi' }
];

const ACCESS_LEVEL_META = {
    NONE: { icon: '🚫', label: 'Nessuno' },
    READ_ONLY: { icon: '👁', label: 'Solo lettura' },
    FULL: { icon: '✏️', label: 'Completo' }
};

let permissionMatrixCache = null;
let permissionRolesCache = [];

function switchAdminTab(tab) {
    const utentiTab = document.getElementById('adminTabUtenti');
    const permessiTab = document.getElementById('adminTabPermessi');
    const utentiBtn = document.getElementById('adminTabUtentiBtn');
    const permessiBtn = document.getElementById('adminTabPermessiBtn');
    const newUserBtn = document.getElementById('adminNewUserBtn');
    if (!utentiTab || !permessiTab) return;

    const showPermessi = tab === 'permessi';
    utentiTab.style.display = showPermessi ? 'none' : 'block';
    permessiTab.style.display = showPermessi ? 'block' : 'none';
    utentiBtn?.classList.toggle('btn-sede-active', !showPermessi);
    permessiBtn?.classList.toggle('btn-sede-active', showPermessi);
    if (newUserBtn) newUserBtn.style.display = showPermessi ? 'none' : 'inline-block';

    if (showPermessi) loadPermissionMatrixUI();
}

async function loadPermissionMatrixUI() {
    const container = document.getElementById('permissionMatrixContainer');
    if (!container) return;
    container.innerHTML = `<div class="empty-state"><p>Caricamento permessi…</p></div>`;
    try {
        const res = await fetch('/api/permissions');
        if (!res.ok) { container.innerHTML = `<div class="empty-state"><p>Errore nel caricamento dei permessi</p></div>`; return; }
        const data = await res.json();
        permissionMatrixCache = data.matrix || {};
        permissionRolesCache = data.roles || [];
        renderPermissionMatrix();
    } catch (err) {
        console.error('Errore caricamento matrice permessi:', err);
        container.innerHTML = `<div class="empty-state"><p>Errore nel caricamento dei permessi</p></div>`;
    }
}

// "Intelligente" come richiesto: per una coppia ruolo/sezione dove il ruolo
// ha già di base accesso Completo per definizione (es. ADMIN vede sempre
// tutto), non ha senso offrire la scelta — mostriamo un'indicazione fissa
// invece di un controllo cliccabile che non cambierebbe nulla di sensato.
// ADMIN è l'unico caso così assoluto: per tutti gli altri ruoli (compresi
// Moderatore/Gestore, che oggi vedono già tutto ma potrebbero comunque
// essere limitati in futuro) il controllo resta sempre modificabile.
function isPermissionLocked(role) {
    return role === 'ADMIN';
}

function renderPermissionMatrix() {
    const container = document.getElementById('permissionMatrixContainer');
    if (!container || !permissionMatrixCache) return;

    const roleLabel = (r) => formatRole(r);

    let html = `<table class="permission-matrix-table">
        <thead>
            <tr>
                <th style="text-align:left">Sezione</th>
                ${permissionRolesCache.map(r => `<th>${roleLabel(r)}</th>`).join('')}
            </tr>
        </thead>
        <tbody>`;

    PERMISSION_SECTIONS.forEach(section => {
        html += `<tr>
            <td style="text-align:left;font-weight:700;white-space:nowrap">${section.icon} ${section.label}</td>
            ${permissionRolesCache.map(role => {
                const current = permissionMatrixCache[role]?.[section.key] || 'NONE';
                if (isPermissionLocked(role)) {
                    const meta = ACCESS_LEVEL_META[current];
                    return `<td><span title="Admin ha sempre accesso completo a tutto" style="opacity:0.6;font-size:12px">${meta.icon} ${meta.label}</span></td>`;
                }
                return `<td>
                    <div class="permission-cell-group" data-role="${role}" data-section="${section.key}">
                        ${Object.entries(ACCESS_LEVEL_META).map(([level, meta]) => `
                            <button type="button"
                                class="permission-cell-btn ${current === level ? 'active' : ''} level-${level}"
                                title="${meta.label}"
                                onclick="setPermission('${role}','${section.key}','${level}', this)">${meta.icon}</button>
                        `).join('')}
                    </div>
                </td>`;
            }).join('')}
        </tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

async function setPermission(role, section, access, btnEl) {
    const group = btnEl?.closest('.permission-cell-group');
    try {
        const res = await fetch('/api/permissions', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, section, access })
        });
        if (!res.ok) {
            const data = await res.json().catch(() => null);
            alert(data?.error || 'Errore nel salvataggio del permesso');
            return;
        }
        const data = await res.json();
        permissionMatrixCache = data.matrix || permissionMatrixCache;
        // Aggiorna solo il singolo gruppo di pulsanti cliccato, non tutta la
        // tabella — evita uno sfarfallio visivo su una matrice con decine di
        // celle per un cambiamento che ne riguarda solo una.
        if (group) {
            group.querySelectorAll('.permission-cell-btn').forEach(b => {
                b.classList.toggle('active', b.title === ACCESS_LEVEL_META[access].label);
            });
        }
    } catch (err) {
        console.error('Errore salvataggio permesso:', err);
        alert('Errore di connessione nel salvataggio del permesso');
    }
}
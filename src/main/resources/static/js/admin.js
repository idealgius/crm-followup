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

    // NUOVO: isAdmin resta un controllo di RUOLO letterale (non di
    // permesso) — serve SOLO a decidere se mostrare l'opzione "Admin" nel
    // menu a tendina qui sotto. Il ruolo Admin non passa mai dal sistema
    // di permessi, nemmeno con "Accesso Admin" sulla sezione Utenti/
    // Permessi: quel livello riguarda i dati (contatti, follow-up, ecc.),
    // non il ruolo di sistema più alto. Il permesso vero (canWrite) decide
    // solo se puoi aprire il menu di modifica/eliminazione in generale.
    const isAdmin = currentUser?.role === 'ADMIN';
    const canManage = typeof canWrite === 'function' && canWrite('ADMIN');

    container.innerHTML = users.map(u => {
        const isCurrentUser = u.id === currentUser?.id;
        const targetIsAdmin = u.role === 'ADMIN';
        // Toccare un account già Admin richiede essere REALMENTE Admin,
        // indipendentemente dal permesso concesso sulla sezione.
        const canChangeRole = canManage && (!targetIsAdmin || isAdmin) && !isCurrentUser;
        const canDelete = canManage && (!targetIsAdmin || isAdmin) && !isCurrentUser;

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
    // L'opzione "Admin" nel form è nascosta a runtime per chi non è
    // REALMENTE Admin (stesso criterio del menu a tendina qui sopra). Il
    // backend blocca comunque il tentativo anche aggirando questo controllo.
    const adminOption = document.querySelector('#newUserRole option[value="ADMIN"]');
    if (adminOption) adminOption.style.display = (currentUser?.role === 'ADMIN') ? '' : 'none';
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
    { key: 'ADMIN', icon: '⚙️', label: 'Utenti/Permessi' },
    { key: 'VEICOLI', icon: '🚙', label: 'Vetture in Consegna' }
];

const ACCESS_LEVEL_META = {
    NONE: { icon: '🚫', label: 'Nessuno' },
    READ_ONLY: { icon: '👁', label: 'Solo lettura' },
    FULL: { icon: '✏️', label: 'Completo' },
    ADMIN_FULL: { icon: '🛡️', label: 'Accesso Admin' }
};

let permissionMatrixCache = null;
let permissionRolesCache = [];

function switchAdminTab(tab) {
    const utentiTab = document.getElementById('adminTabUtenti');
    const permessiTab = document.getElementById('adminTabPermessi');
    const operatoriTab = document.getElementById('adminTabOperatori');
    const utentiBtn = document.getElementById('adminTabUtentiBtn');
    const permessiBtn = document.getElementById('adminTabPermessiBtn');
    const operatoriBtn = document.getElementById('adminTabOperatoriBtn');
    const newUserBtn = document.getElementById('adminNewUserBtn');
    if (!utentiTab || !permessiTab) return;

    utentiTab.style.display = tab === 'utenti' ? 'block' : 'none';
    permessiTab.style.display = tab === 'permessi' ? 'block' : 'none';
    if (operatoriTab) operatoriTab.style.display = tab === 'operatori' ? 'block' : 'none';
    utentiBtn?.classList.toggle('btn-sede-active', tab === 'utenti');
    permessiBtn?.classList.toggle('btn-sede-active', tab === 'permessi');
    operatoriBtn?.classList.toggle('btn-sede-active', tab === 'operatori');
    if (newUserBtn) newUserBtn.style.display = tab === 'utenti' ? 'inline-block' : 'none';

    if (tab === 'permessi') loadPermissionMatrixUI();
    if (tab === 'operatori') loadOperatorPermissionsUI();
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

// PRIMA: ADMIN era "bloccato" (accesso completo fisso, non modificabile).
// Ora quei controlli sono sostituiti dal permesso vero: ADMIN è un ruolo
// come gli altri e va reso modificabile come tutti.
function isPermissionLocked(role) {
    return false;
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

// ===== GESTIONE PERMESSI PER OPERATORE =====
let operatorPermissionsCache = [];
let operatorSectionsCache = [];
let operatorSearchFilter = '';

async function loadOperatorPermissionsUI() {
    const container = document.getElementById('operatorPermissionsContainer');
    if (!container) return;
    container.innerHTML = `<div class="empty-state"><p>Caricamento operatori…</p></div>`;
    try {
        const res = await fetch('/api/permissions/operators');
        if (!res.ok) {
            const data = await res.json().catch(() => null);
            container.innerHTML = `<div class="empty-state"><p>${data?.error || 'Errore nel caricamento'}</p></div>`;
            return;
        }
        const data = await res.json();
        operatorPermissionsCache = data.users || [];
        operatorSectionsCache = data.sections || [];
        renderOperatorPermissions();
    } catch (err) {
        console.error('Errore caricamento permessi operatore:', err);
        container.innerHTML = `<div class="empty-state"><p>Errore nel caricamento dei permessi</p></div>`;
    }
}

function filterOperatorPermissions(query) {
    operatorSearchFilter = (query || '').trim().toLowerCase();
    renderOperatorPermissions();
}

function renderOperatorPermissions() {
    const container = document.getElementById('operatorPermissionsContainer');
    if (!container) return;

    const sectionMeta = key => PERMISSION_SECTIONS.find(s => s.key === key) || { icon: '', label: key };

    const filtered = operatorSearchFilter
        ? operatorPermissionsCache.filter(u =>
            u.fullName.toLowerCase().includes(operatorSearchFilter) ||
            u.email.toLowerCase().includes(operatorSearchFilter))
        : operatorPermissionsCache;

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><h3>🛡️</h3><p>Nessun operatore trovato</p></div>`;
        return;
    }

    container.innerHTML = filtered.map(u => {
        const overrideCount = Object.keys(u.overrides || {}).length;
        return `
        <div class="waiting-card" style="flex-direction:column;align-items:stretch">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
                <div>
                    <div class="waiting-name">${u.fullName}</div>
                    <div class="waiting-details" style="margin-top:4px">${u.email} · <span class="status-badge status-${u.role}">${formatRole(u.role)}</span></div>
                </div>
                ${overrideCount > 0 ? `<span style="font-size:12px;color:var(--text-secondary)">🛡️ ${overrideCount} eccezion${overrideCount === 1 ? 'e' : 'i'} personalizzat${overrideCount === 1 ? 'a' : 'e'}</span>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
                ${operatorSectionsCache.map(sectionKey => {
                    const meta = sectionMeta(sectionKey);
                    const currentOverride = (u.overrides || {})[sectionKey] || 'INHERIT';
                    return `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid var(--border)">
                        <span style="font-size:13px;font-weight:600;white-space:nowrap">${meta.icon} ${meta.label}</span>
                        <div class="permission-cell-group" data-user="${u.id}" data-section="${sectionKey}">
                            <button type="button" class="permission-cell-btn ${currentOverride === 'INHERIT' ? 'active' : ''}"
                                title="Eredita da ruolo" onclick="setOperatorPermission(${u.id},'${sectionKey}','INHERIT', this)">↩️</button>
                            ${Object.entries(ACCESS_LEVEL_META).map(([level, lm]) => `
                                <button type="button" class="permission-cell-btn ${currentOverride === level ? 'active' : ''} level-${level}"
                                    title="${lm.label}" onclick="setOperatorPermission(${u.id},'${sectionKey}','${level}', this)">${lm.icon}</button>
                            `).join('')}
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }).join('');
}

async function setOperatorPermission(userId, section, access, btnEl) {
    const group = btnEl?.closest('.permission-cell-group');
    try {
        const res = await fetch('/api/permissions/operators', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, section, access })
        });
        if (!res.ok) {
            const data = await res.json().catch(() => null);
            alert(data?.error || 'Errore nel salvataggio del permesso');
            return;
        }
        if (group) {
            group.querySelectorAll('.permission-cell-btn').forEach(b => b.classList.remove('active'));
            btnEl.classList.add('active');
        }
        const user = operatorPermissionsCache.find(u => u.id === userId);
        if (user) {
            if (!user.overrides) user.overrides = {};
            if (access === 'INHERIT') delete user.overrides[section];
            else user.overrides[section] = access;
        }
    } catch (err) {
        console.error('Errore salvataggio permesso operatore:', err);
        alert('Errore di connessione nel salvataggio del permesso');
    }
}
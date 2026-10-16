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
    // NUOVO: gli account disattivati vanno in fondo, in una sezione a parte
    usersCache = users;
    const attivi = users.filter(u => !u.disattivato), spenti = users.filter(u => u.disattivato);

    container.innerHTML = attivi.map(u => {
        const isCurrentUser = u.id === currentUser?.id;
        const targetIsAdmin = u.role === 'ADMIN';
        // Toccare un account già Admin richiede essere REALMENTE Admin,
        // indipendentemente dal permesso concesso sulla sezione.
        const canChangeRole = canManage && (!targetIsAdmin || isAdmin) && !isCurrentUser;
        const canDelete = canManage && (!targetIsAdmin || isAdmin) && !isCurrentUser;

        return `
        <div class="waiting-card">
            <div>
                <div class="waiting-name" id="userNameDisplay-${u.id}">
                    ${u.fullName}
                    ${canManage ? `<span onclick="startEditUserName(${u.id})" style="cursor:pointer;margin-left:8px;font-size:12px" title="Modifica nome">✏️</span>` : ''}
                    ${isAdmin ? `<span class="pres" data-pres="${u.id}" title="Online / disconnesso"><i class="pres-dot"></i><small></small></span>` : ''}
                </div>
                <div id="userNameEdit-${u.id}" style="display:none;margin-top:6px">
                    <input type="text" id="userNameInput-${u.id}" class="input-dark" style="font-size:13px;padding:4px 10px;margin-right:6px" value="${u.fullName}">
                    <button onclick="saveUserName(${u.id})" class="btn-small btn-green">✓ Salva</button>
                    <button onclick="cancelEditUserName(${u.id})" class="btn-small btn-secondary">✕</button>
                </div>
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
                            <option value="FRONT_OFFICE" ${u.role === 'FRONT_OFFICE' ? 'selected' : ''}>Front Office</option>
                            <option value="CONSULENZA" ${u.role === 'CONSULENZA' ? 'selected' : ''}>Consulenza</option>
                            ${isAdmin ? `<option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>Admin</option>` : ''}
                        </select>
                    ` : `
                        <span class="status-badge status-${u.role}">${formatRole(u.role)}</span>
                    `}
                </div>
            </div>
            <div class="waiting-actions">
                ${canDelete ? `<button class="btn-small btn-secondary" onclick="setUserActive(${u.id}, false)" title="Non potrà più accedere, ma i suoi dati restano">⏸ Disattiva</button>
                <button class="btn-small btn-red" onclick="deleteUser(${u.id})">🗑️ Elimina</button>` : ''}
            </div>
        </div>
        `;
    }).join('') + (spenti.length ? `
        <div style="margin:22px 0 8px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
            <b style="font-size:14px;color:var(--text-primary)">⏸ Account disattivati (${spenti.length})</b>
            <small style="color:var(--text-secondary,#8a90a2)">Non possono accedere. I loro dati restano nel CRM: con “Riattiva” tornano com’erano.</small>
        </div>` + spenti.map(u => {
        const canTouch = canManage && (u.role !== 'ADMIN' || isAdmin);
        return `
        <div class="waiting-card" style="opacity:.62">
            <div>
                <div class="waiting-name">${u.fullName} <small style="font-weight:600;color:#e08a8a;margin-left:6px">disattivato</small></div>
                <div class="waiting-details" style="margin-top:6px">${u.email}</div>
                <div style="margin-top:8px"><span class="status-badge status-${u.role}">${formatRole(u.role)}</span></div>
            </div>
            <div class="waiting-actions">
                ${canTouch ? `<button class="btn-small btn-green" onclick="setUserActive(${u.id}, true)">▶ Riattiva</button>
                <button class="btn-small btn-red" onclick="deleteUser(${u.id})">🗑️ Elimina</button>` : ''}
            </div>
        </div>`;
    }).join('') : '');
    if (isAdmin) Presenze.avvia();
}

/* ===== NUOVO: CHI E' ONLINE (solo Admin, pagina Utenti) =====
   verde = CRM aperto adesso (da che ora) · rosso = oggi e' entrato ma ora e' disconnesso (da che ora)
   vuoto = oggi non e' ancora entrato (ultimo accesso). Dati da /api/presenza/utenti (PresenzaController). */
const Presenze = (function () {
    let t = null;
    const F_O = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
    const F_G = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' });
    const oraDi = s => F_O.format(new Date(s));
    const giornoOra = s => { const d = new Date(s), oggi = F_G.format(new Date()), ieri = F_G.format(new Date(Date.now() - 864e5)), g = F_G.format(d);
        return (g === oggi ? 'oggi' : g === ieri ? 'ieri' : g.slice(0, 5) + (g.slice(6) !== oggi.slice(6) ? '/' + g.slice(8) : '')) + ' alle ' + F_O.format(d); };
    const durata = s => { const m = Math.max(0, Math.round((Date.now() - new Date(s)) / 60000)); return m < 1 ? 'adesso' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min'; };
    let ultimi = null;
    // TEMPO REALE: il server manda ogni cambio (presenza.js -> evento "crm:presenze")
    window.addEventListener('crm:presenze', e => { ultimi = e.detail; disegna(); });
    async function aggiorna() {
        const box = document.getElementById('usersList');
        if (!box || !box.querySelector('[data-pres]') || box.offsetParent === null) return;
        try { const r = await fetch('/api/presenza/utenti', { cache: 'no-store' }); if (!r.ok) return; ultimi = await r.json(); } catch (e) { return; }
        disegna();
    }
    function disegna() {
        const box = document.getElementById('usersList'), d = ultimi;
        if (!box || !d) return;
        const U = d.utenti || {};
        box.querySelectorAll('[data-pres]').forEach(el => {
            const x = U[el.dataset.pres] || { stato: 'MAI_OGGI' }, txt = el.querySelector('small');
            el.className = 'pres ' + ({ ONLINE: 'on', OFFLINE: 'off' }[x.stato] || 'mai');
            let t1, tip;
            if (x.stato === 'ONLINE') { t1 = 'online dalle ' + oraDi(x.da); tip = 'CRM aperto adesso · online da ' + durata(x.da); }
            else if (x.stato === 'OFFLINE') { t1 = 'disconnesso dalle ' + oraDi(x.da); tip = 'Oggi è entrato alle ' + oraDi(x.primoOggi) + ' · disconnesso da ' + durata(x.da); }
            else { t1 = x.ultimoVisto ? 'ultimo accesso ' + giornoOra(x.ultimoVisto) : 'nessun accesso registrato'; tip = 'Oggi non è ancora entrato'; }
            txt.textContent = t1; el.title = tip;
        });
    }
    // la lista si ridisegna ogni 30 s anche senza cambi ("da 12 min" sempre giusto); i dati arrivano in tempo reale
    function avvia() { aggiorna(); setTimeout(aggiorna, 3000); if (!t) t = setInterval(() => { if (ultimi) disegna(); aggiorna(); }, 30000); }
    return { avvia, aggiorna };
})();

function formatRole(role) {
    const map = {
        'UTENTE': 'BDC',
        'BACK_OFFICE': 'Back Office',
        'MODERATORE': 'Moderatore',
        'GESTORE': 'Gestore',
        'ADMIN': 'Admin',
        'NOLEGGIO': 'Noleggio',
        'SERVICE': 'Service',
        'FRONT_OFFICE': 'Front Office',
        'CONSULENZA': 'Consulenza'
    };
    return map[role] || role;
}

function startEditUserName(id) {
    document.getElementById(`userNameDisplay-${id}`).style.display = 'none';
    document.getElementById(`userNameEdit-${id}`).style.display = 'block';
}

function cancelEditUserName(id) {
    document.getElementById(`userNameDisplay-${id}`).style.display = 'block';
    document.getElementById(`userNameEdit-${id}`).style.display = 'none';
}

async function saveUserName(id) {
    const newName = document.getElementById(`userNameInput-${id}`).value.trim();
    if (!newName) { alert('Il nome non può essere vuoto'); return; }
    try {
        const res = await fetch(`/api/auth/users/${id}/name`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName: newName })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.error || 'Errore nel salvataggio del nome');
            return;
        }
        loadUsers();
    } catch (err) {
        console.error('Errore modifica nome utente:', err);
        alert('Errore di rete nel salvataggio del nome');
    }
}

async function changeUserRole(userId, newRole) {
    try {
        const res = await fetch(`/api/auth/users/${userId}/role`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });
        if (!res.ok) {
            let msg = '';
            try { msg = (await res.json()).error || ''; } catch (e) { /* */ }
            alert('Errore nel cambio ruolo' + (msg ? ': ' + msg : ''));
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

let usersCache = [];
const nomeUtente = id => (usersCache.find(u => u.id === id) || {}).fullName || 'questo utente';

async function deleteUser(id) {
    const nome = nomeUtente(id);
    if (!confirm('Eliminare definitivamente ' + nome + '?\n\nNon potrà più accedere e l\'account sparisce. Se ha dati collegati nel CRM (follow-up...) non si può eliminare: ti proporrò di disattivarlo.')) return;
    try {
        const res = await fetch(`/api/auth/users/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            let j = {}, msg = '';
            try { const t = await res.text(); try { j = JSON.parse(t); msg = j.error || j.message || ''; } catch (e) { msg = t.slice(0, 300); } } catch (e) { /* */ }
            // ha dati collegati: si propone la disattivazione (i dati restano)
            if (res.status === 409 && j.collegati) {
                if (confirm(nome + ': ' + msg + '\n\nVuoi DISATTIVARLO? Non potrà più accedere, ma i suoi dati e le statistiche restano. Potrai riattivarlo quando vuoi.')) await setUserActive(id, false, true);
            } else alert('Utente non eliminato (errore ' + res.status + ').' + (msg ? '\n\n' + msg : ''));
        }
        loadUsers();
    } catch (err) {
        console.error('Errore eliminazione utente:', err);
        alert('Utente non eliminato: ' + err.message);
    }
}

/* NUOVO: disattiva (non accede più, i dati restano) / riattiva un account */
async function setUserActive(id, attivo, giaConfermato) {
    const nome = nomeUtente(id);
    if (!attivo && !giaConfermato && !confirm('Disattivare ' + nome + '?\n\nNon potrà più accedere (se è dentro ora, esce alla prossima azione). Follow-up, contatti e statistiche restano. Potrai riattivarlo quando vuoi.')) return;
    try {
        const res = await fetch(`/api/auth/users/${id}/attivo`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attivo }) });
        if (!res.ok) { let msg = ''; try { msg = (await res.json()).error || ''; } catch (e) { /* */ } alert((attivo ? 'Account non riattivato' : 'Account non disattivato') + (msg ? ': ' + msg : '')); }
    } catch (err) { alert('Errore di rete: ' + err.message); }
    loadUsers();
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
// Divise in gruppi (righe di titolo nella tabella): In bound, BI, Gestione.
// BI: Solo lettura = vede · Completo = importa i file e modifica (verifiche, motivi...).
const PERMISSION_SECTIONS = [
    { key: 'DASHBOARD', icon: '📊', label: 'Dashboard', group: 'In bound' },
    { key: 'FOLLOWUPS', icon: '📋', label: 'Follow-up', group: 'In bound' },
    { key: 'WAITING', icon: '🔔', label: 'Recall', group: 'In bound' },
    { key: 'CONTACTS', icon: '📞', label: 'Registro Contatti', group: 'In bound' },
    { key: 'PREVENTIVI', icon: '🧾', label: 'Preventivi telefonici (servono anche al Commerciale)', group: 'In bound' },
    { key: 'PROMO', icon: '🎯', label: 'Promo', group: 'In bound' },
    { key: 'RENT', icon: '🚗', label: 'Rent', group: 'In bound' },
    { key: 'SERVICE', icon: '🔧', label: 'Service', group: 'In bound' },
    { key: 'VEICOLI', icon: '🚙', label: 'Vetture in Consegna', group: 'In bound' },
    { key: 'GRAFICI', icon: '☰', label: 'Menu Grafici', group: 'In bound' },
    // BI: la selezione area e la pagina BI le vede chi ha almeno una delle tre sezioni BI;
    // chi non ne ha nessuna entra direttamente in In bound.
    { key: 'CONSEGNE', icon: '🔑', label: 'Consegne', group: 'BI' },
    { key: 'STOCK', icon: '🚘', label: 'Stock', group: 'BI' },
    { key: 'COMMERCIALE', icon: '💼', label: 'Commerciale', group: 'BI' },
    // Salone: Appuntamenti e ingressi (Front Office e Consulenza entrano direttamente qui)
    // Profili con un nome (Consulenza, Solo visione, Front office, Visione + report, Completo)
    { key: 'SALONE', icon: '🚶', label: 'Appuntamenti e ingressi', group: 'Salone' },
    { key: 'ADMIN', icon: '⚙️', label: 'Utenti/Permessi', group: 'Gestione' },
    { key: 'ALLERT', icon: '🔔', label: 'Allert', group: 'Gestione' }
];


const ACCESS_LEVEL_META = {
    NONE: { icon: '🚫', label: 'Nessuno' },
    READ_ONLY: { icon: '👁', label: 'Solo lettura' },
    FULL: { icon: '✏️', label: 'Completo' },
    ADMIN_FULL: { icon: '🛡️', label: 'Accesso Admin' }
};

// NUOVO: "Appuntamenti e ingressi" non usa i livelli ma PROFILI con un nome (uguali in SaloneController.profilo)
const SALONE_LEVEL_META = {
    NONE: { icon: '🚫', label: 'Nessuno' },
    S_CONS: { icon: '🤝', label: 'Consulenza' },
    S_VIS: { icon: '👁', label: 'Solo visione' },
    S_FO: { icon: '🛎️', label: 'Front office' },
    S_REP: { icon: '📊', label: 'Visione + report' },
    S_ALL: { icon: '🛡️', label: 'Completo' }
};
const levelMetaFor = key => key === 'SALONE' ? SALONE_LEVEL_META : ACCESS_LEVEL_META;
// valori vecchi gia' salvati per SALONE (livelli 1-4) -> profilo (come fa il server)
function valoreVisto(section, v, role) {
    if (section !== 'SALONE' || !v) return v || 'NONE';
    return ({ READ_ONLY: role === 'CONSULENZA' ? 'S_CONS' : 'S_VIS', FULL: 'S_FO', ADMIN_FULL: 'S_REP', LIVELLO_4: 'S_ALL', S_BO: 'S_FO' })[v] || v;
}

/* ===== NUOVO: SPIEGAZIONI dei permessi =====
   - passando sopra un pulsante compare cosa permette (riquadro scuro che segue il mouse)
   - cliccando il nome di una sezione si apre la scheda "cosa si puo' fare" con tutti i livelli a confronto */
const LIVELLI_GENERICI = {
    NONE: 'Non vede la sezione: la voce non compare nel menu e le sue pagine non si aprono.',
    READ_ONLY: 'Vede la sezione e i suoi dati, ma non può creare, modificare né eliminare niente.',
    FULL: 'Vede, crea, modifica ed elimina, tranne i contenuti creati da un utente Admin.',
    ADMIN_FULL: 'Come Completo, e in più può modificare ed eliminare anche i contenuti creati da un utente Admin.'
};
const SECTION_INFO = {
    DASHBOARD: { intro: 'La pagina iniziale dell\'In bound con i numeri della giornata.' },
    FOLLOWUPS: { intro: 'I follow-up da fare sui clienti.', FULL: 'Vede, crea, completa, modifica ed elimina i follow-up (non quelli creati da un Admin).' },
    WAITING: { intro: 'I recall: clienti da richiamare.', FULL: 'Vede, crea, modifica ed elimina i recall (non quelli creati da un Admin).' },
    CONTACTS: { intro: 'Il registro dei contatti (chiamate, info vendita, fonti).', READ_ONLY: 'Vede il registro e i grafici dei contatti, senza inserire o modificare.', FULL: 'Registra nuovi contatti, li modifica ed elimina (non quelli di un Admin).' },
    PREVENTIVI: { intro: 'I preventivi telefonici. Servono anche alla BI Commerciale per contare i preventivi.' },
    PROMO: { intro: 'Le promozioni attive.' },
    RENT: { intro: 'Il noleggio: trattative e richieste del Rent.' },
    SERVICE: { intro: 'L\'assistenza: richieste e chiamate del Service.' },
    VEICOLI: { intro: 'Le vetture in consegna.' },
    GRAFICI: { intro: 'Il menu ☰ "Mostra Grafici" in alto a sinistra.', READ_ONLY: 'Vede il menu ☰ e può aprire i grafici che i permessi dei grafici gli lasciano vedere.', FULL: 'Come Solo lettura (per il menu non c\'è differenza).', ADMIN_FULL: 'Come Solo lettura (per il menu non c\'è differenza).' },
    CONSEGNE: { intro: 'BI · Consegne: Tempistiche, Analisi avanzamento, lavorazione officina, ricerca clienti.', READ_ONLY: 'Vede Tempistiche e Analisi, cerca i clienti, apre gli elenchi, scarica gli Excel e può premere "Aggiorna dal foglio Google". Non importa le trattative e non segna verifiche.', FULL: 'Come Solo lettura, in più importa il CSV delle trattative, segna e toglie le verifiche, abbina, conta o elimina le pratiche dubbie.', ADMIN_FULL: 'Come Completo.' },
    STOCK: { intro: 'BI · Stock: giacenza, marchi, motorizzazioni, vetture in stock.', READ_ONLY: 'Vede tutti i grafici e gli elenchi dello stock e scarica gli Excel. Non importa il file.', FULL: 'Come Solo lettura, in più importa il file dello stock.', ADMIN_FULL: 'Come Completo.' },
    COMMERCIALE: { intro: 'BI · Commerciale: contratti, origini, preventivi, consulenti.', READ_ONLY: 'Vede tutte le viste e i grafici del Commerciale e scarica gli Excel. Non importa le trattative.', FULL: 'Come Solo lettura, in più importa il CSV delle trattative del Commerciale.', ADMIN_FULL: 'Come Completo.' },
    ADMIN: { intro: 'Gestione utenti e permessi (questa pagina).', READ_ONLY: 'Vede gli utenti e i permessi, senza cambiare niente.', FULL: 'Crea utenti, cambia ruoli e permessi (non degli utenti Admin).', ADMIN_FULL: 'Come Completo, anche sugli utenti Admin.' },
    ALLERT: { intro: 'Gli allert (avvisi da gestire).', READ_ONLY: 'Vede gli allert, senza gestirli.', FULL: 'Gestisce gli allert (li prende e li chiude).', ADMIN_FULL: 'Come Completo, in più riapre gli allert già gestiti.' }
};
// Appuntamenti e ingressi: cosa fa ogni profilo (✓ / ✗ / testo)
const SALONE_CAPS = [
    ['Vede i walk-in e gli appuntamenti', { S_CONS: 'solo i propri', S_VIS: 1, S_FO: 1, S_REP: 1, S_ALL: 1 }],
    ['Vede lo stato dei consulenti in tempo reale', { S_CONS: 1, S_VIS: 1, S_FO: 1, S_REP: 1, S_ALL: 1 }],
    ['Cambia il proprio stato e prende in carico i propri clienti', { S_CONS: 'se è uno dei consulenti', S_VIS: 'se è uno dei consulenti', S_FO: 'se è uno dei consulenti', S_REP: 'se è uno dei consulenti', S_ALL: 'se è uno dei consulenti' }],
    ['Registra e assegna i walk-in', { S_FO: 1, S_ALL: 1 }],
    ['Cambia lo stato degli altri consulenti (anche "Segna preso in carico" al posto loro)', { S_ALL: 1 }],
    ['Importa gli appuntamenti e vede lo storico degli import', { S_FO: 1, S_ALL: 1 }],
    ['Scheda Report (grafici, tempi, storico degli stati)', { S_REP: 1, S_ALL: 1 }],
    ['Chat del salone (gruppo e private)', { S_CONS: 1, S_FO: 1, S_ALL: 1 }]
];
const SALONE_NOTE = 'Sempre, a prescindere dal profilo: la domanda "sei nuovamente disponibile?" dopo 15 minuti compare solo al ruolo Consulenza; "Elimina storico" (menu ☰) solo al ruolo Admin, con password.';
function descrizioneLivello(section, level) {
    if (section === 'SALONE') {
        if (level === 'NONE') return 'Non vede Appuntamenti e ingressi e non riceve messaggi in chat.';
        const si = SALONE_CAPS.filter(c => c[1][level]).map(c => '✓ ' + c[0] + (typeof c[1][level] === 'string' ? ' (' + c[1][level] + ')' : ''));
        const no = SALONE_CAPS.filter(c => !c[1][level]).map(c => '✗ ' + c[0]);
        return si.concat(no).join('\n');
    }
    if (section === 'INHERIT') return 'Eredita: segue il permesso del suo ruolo.';
    const info = SECTION_INFO[section] || {};
    return info[level] || LIVELLI_GENERICI[level] || '';
}
function tipDi(section, level) {
    const m = levelMetaFor(section)[level] || {};
    const sec = PERMISSION_SECTIONS.find(s => s.key === section);
    return (m.label || level) + (sec ? ' · ' + sec.label.split(' · ')[0] : '') + '\n' + descrizioneLivello(section, level);
}
const escAttr = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
// dati per le panoramiche (permessi dei ruoli + operatori con le eccezioni): riletti ogni volta che si apre
async function permDati() {
    const [pm, op] = await Promise.all([fetch('/api/permissions'), fetch('/api/permissions/operators')]);
    if (!pm.ok) throw new Error('Permessi non disponibili');
    const dm = await pm.json(), dop = op.ok ? await op.json() : { users: [] };
    return { matrix: dm.matrix || {}, roles: dm.roles || [], users: dop.users || [] };
}
const permEsc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const permNomeSez = sec => sec.label.split(' · ')[0].replace(/\s*\(.*\)$/, '');
// badge colorato del livello (stessi colori dei pulsanti della tabella)
const permBadge = (section, v) => { const m = levelMetaFor(section)[v] || { icon: '?', label: v }; return `<span class="perm-lv lv-${v}">${m.icon} ${m.label}</span>`; };
const permIniziali = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
// avviso se il file css/permessi.css non e' arrivato al browser (senza, la pagina e' senza stile)
function avvisoCssPermessi(box) {
    if (!box || getComputedStyle(document.documentElement).getPropertyValue('--perm-css').trim()) return;
    if (box.querySelector('.perm-css-miss')) return;
    box.insertAdjacentHTML('afterbegin', '<div class="perm-css-miss" style="padding:10px 14px;margin:0 0 12px;border-radius:10px;background:#5a1d22;color:#ffd7d9;border:1px solid #e5484d;font-weight:700">⚠ Manca il file <code>static/css/permessi.css</code> (o non è aggiornato): copialo nel progetto, poi Ctrl+F5. Senza, questa pagina resta senza grafica.</div>');
}

/* PANORAMICA DI UNA SEZIONE (clic sul nome della sezione ⓘ):
   cosa permette ogni livello, quali ruoli hanno quel livello e quanti operatori,
   e l'elenco degli operatori con il livello che hanno davvero (eccezioni personali comprese). */
async function apriInfoSezione(key) {
    const sec = PERMISSION_SECTIONS.find(s => s.key === key); if (!sec) return;
    let ov = document.getElementById('permInfoOv');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'permInfoOv'; ov.className = 'perm-info-ov';
    ov.innerHTML = `<div class="perm-info" role="dialog" aria-modal="true" aria-label="${escAttr(permNomeSez(sec))}">
        <header><div class="perm-info-hd"><span class="perm-info-ico">${sec.icon}</span><div><small>PANORAMICA DELLA SEZIONE · ${permEsc(sec.group.toUpperCase())}</small><h3>${permEsc(permNomeSez(sec))}</h3></div></div>
          <button type="button" data-chiudi aria-label="Chiudi">✕</button></header>
        <div class="perm-info-b"><p class="perm-info-note">Caricamento…</p></div></div>`;
    document.body.appendChild(ov);
    const chiudi = () => { ov.remove(); document.removeEventListener('keydown', escK); };
    const escK = e => { if (e.key === 'Escape') chiudi(); };
    document.addEventListener('keydown', escK);
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-chiudi]')) chiudi(); });
    const corpo = ov.querySelector('.perm-info-b');
    let D;
    try { D = await permDati(); } catch (e) { corpo.innerHTML = `<p class="perm-info-note">${permEsc(e.message)}</p>`; return; }
    if (!document.body.contains(ov)) return;

    const metas = levelMetaFor(key), livelli = Object.keys(metas);
    const livRuolo = r => valoreVisto(key, (D.matrix[r] || {})[key] || 'NONE', r);
    const ops = D.users.map(u => {
        const own = (u.overrides || {})[key];
        const base = livRuolo(u.role);
        const v = own ? valoreVisto(key, own, u.role) : base;
        return { u, v, eccezione: !!own && v !== base, base };
    });
    const scrive = v => !['NONE', 'READ_ONLY', 'S_VIS', 'S_REP'].includes(v);
    const ruoliCon = D.roles.filter(r => livRuolo(r) !== 'NONE');
    const opsVede = ops.filter(o => o.v !== 'NONE'), opsScrive = ops.filter(o => scrive(o.v)), ecc = ops.filter(o => o.eccezione);
    const info = SECTION_INFO[key] || {};
    const intro = key === 'SALONE' ? 'Appuntamenti e ingressi: walk-in, appuntamenti, stato dei consulenti in tempo reale, chat e report del salone. Ogni ruolo ha un <b>profilo</b>.' : (info.intro || '');

    const tiles = `<div class="perm-tiles">
        <div><b>${ruoliCon.length}<small>/${D.roles.length}</small></b><span>ruoli con accesso</span></div>
        <div><b>${opsVede.length}<small>/${ops.length}</small></b><span>operatori la vedono</span></div>
        <div><b>${opsScrive.length}</b><span>possono anche modificare</span></div>
        <div><b class="${ecc.length ? 'perm-gold' : ''}">${ecc.length}</b><span>eccezioni personali</span></div></div>`;

    // livello per livello: cosa permette + chi ce l'ha
    const perLivello = livelli.map(l => {
        const ruoli = D.roles.filter(r => livRuolo(r) === l);
        const n = ops.filter(o => o.v === l).length;
        const desc = key === 'SALONE' && l !== 'NONE'
            ? `<ul class="perm-caps">${SALONE_CAPS.map(([t, v]) => `<li class="${v[l] ? 'si' : 'no'}">${v[l] ? '✓' : '✗'} ${permEsc(t)}${typeof v[l] === 'string' ? ` <small>(${permEsc(v[l])})</small>` : ''}</li>`).join('')}</ul>`
            : `<p>${permEsc(descrizioneLivello(key, l))}</p>`;
        return `<div class="perm-livcard lc-${l} ${ruoli.length || n ? '' : 'vuoto'}">
            <div class="perm-livcard-h">${permBadge(key, l)}<span class="perm-livcard-n">${n} operator${n === 1 ? 'e' : 'i'}</span></div>
            ${desc}
            <div class="perm-chips">${ruoli.length ? ruoli.map(r => `<span class="perm-chip">${permEsc(formatRole(r))}</span>`).join('') : '<span class="perm-chip muto">nessun ruolo</span>'}</div>
          </div>`;
    }).join('');

    const ordine = l => livelli.indexOf(l);
    const elenco = ops.slice().sort((a, b) => ordine(b.v) - ordine(a.v) || String(a.u.fullName).localeCompare(String(b.u.fullName)));
    corpo.innerHTML = `${intro ? `<p class="perm-info-intro">${intro}</p>` : ''}${tiles}
        <h4 class="perm-h4">Cosa permette ogni livello e chi ce l’ha</h4>
        <div class="perm-livgrid">${perLivello}</div>
        ${key === 'SALONE' ? `<p class="perm-info-note">${permEsc(SALONE_NOTE)}</p>` : ''}
        <h4 class="perm-h4">Operatori <span>(${ops.length})</span><input type="search" class="perm-cerca" placeholder="Cerca operatore o ruolo…" data-cerca></h4>
        <div class="perm-oplist">${elenco.map(o => `<div class="perm-oprow ${o.v === 'NONE' ? 'off' : ''}" data-txt="${escAttr((o.u.fullName + ' ' + (o.u.email || '') + ' ' + formatRole(o.u.role)).toLowerCase())}">
            <span class="perm-av">${permEsc(permIniziali(o.u.fullName))}</span>
            <div class="perm-opn"><b>${permEsc(o.u.fullName)}</b><span>${permEsc(formatRole(o.u.role))}${o.u.email ? ' · ' + permEsc(o.u.email) : ''}</span></div>
            ${o.eccezione ? `<em class="perm-ecc" title="Il suo ruolo avrebbe: ${escAttr((metas[o.base] || {}).label || o.base)}">🛡️ eccezione personale</em>` : ''}
            ${permBadge(key, o.v)}</div>`).join('') || '<p class="perm-info-note">Nessun operatore.</p>'}</div>`;
    const cerca = corpo.querySelector('[data-cerca]');
    cerca?.addEventListener('input', () => {
        const q = cerca.value.trim().toLowerCase();
        corpo.querySelectorAll('.perm-oprow').forEach(r => { r.style.display = !q || r.dataset.txt.includes(q) ? '' : 'none'; });
    });
}

// riquadro che segue il mouse con la spiegazione (data-tip)
(function () {
    let tip = null;
    document.addEventListener('mouseover', e => {
        const t = e.target.closest && e.target.closest('[data-tip]');
        if (!t) { if (tip) tip.style.display = 'none'; return; }
        if (!tip) { tip = document.createElement('div'); tip.className = 'perm-tip'; document.body.appendChild(tip); }
        const righe = t.dataset.tip.split('\n');
        tip.innerHTML = '<b>' + righe[0].replace(/</g, '&lt;') + '</b>' + righe.slice(1).map(x => `<div class="${x.startsWith('✗') ? 'no' : x.startsWith('✓') ? 'si' : ''}">${x.replace(/</g, '&lt;')}</div>`).join('');
        tip.style.display = 'block';
    });
    document.addEventListener('mousemove', e => {
        if (!tip || tip.style.display === 'none') return;
        const w = tip.offsetWidth, h = tip.offsetHeight;
        tip.style.left = Math.min(e.clientX + 14, window.innerWidth - w - 10) + 'px';
        tip.style.top = (e.clientY + 18 + h > window.innerHeight ? e.clientY - h - 12 : e.clientY + 18) + 'px';
    });
})();

let permissionMatrixCache = null;
let permissionRolesCache = [];

function switchAdminTab(tab) {
    const utentiTab = document.getElementById('adminTabUtenti');
    const permessiTab = document.getElementById('adminTabPermessi');
    const operatoriTab = document.getElementById('adminTabOperatori');
    const utentiBtn = document.getElementById('adminTabUtentiBtn');
    const permessiBtn = document.getElementById('adminTabPermessiBtn');
    const operatoriBtn = document.getElementById('adminTabOperatoriBtn');
    const infoTab = document.getElementById('adminTabInfo'), infoBtn = document.getElementById('adminTabInfoBtn');
    if (infoTab) infoTab.style.display = tab === 'info' ? 'block' : 'none';
    infoBtn?.classList.toggle('btn-sede-active', tab === 'info');
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
    if (tab === 'info') loadInfoRuoli();
    ['adminTabPermessi', 'adminTabOperatori', 'adminTabInfo'].forEach(id => avvisoCssPermessi(document.getElementById(id)));
}

/* ===== INFO RUOLI =====
   A sinistra i ruoli (tessere), a destra la scheda del ruolo scelto:
   a cosa serve, numeri, cosa vede e cosa puo' fare area per area (dai permessi veri di "Permessi per Ruolo"),
   cosa non vede, e gli operatori con le loro eccezioni personali. Cliccando una sezione si apre la sua panoramica. */
const ROLE_INFO = {
    UTENTE: 'Operatore BDC (call center): lavora i contatti, i follow-up e i recall dell\'In bound.',
    BACK_OFFICE: 'Back office: lavora registro contatti e allert.',
    MODERATORE: 'Moderatore: ruolo di coordinamento. Cosa vede e cosa fa lo decidono i permessi qui sotto.',
    GESTORE: 'Gestore: ruolo di responsabilità. Cosa vede e cosa fa lo decidono i permessi qui sotto.',
    ADMIN: 'Admin: accesso a tutto, gestisce utenti e permessi; unico che può eliminare lo storico del salone.',
    NOLEGGIO: 'Noleggio: lavora le richieste del Rent. I consulenti del noleggio di Agnano (Raffaele Crispo, Francesco Sementa) hanno Appuntamenti e ingressi come scheda nella barra in alto accanto a RENT, con il profilo Consulenza: il proprio stato, i propri clienti, gli appuntamenti del noleggio e la chat.',
    SERVICE: 'Service: lavora le richieste dell\'assistenza.',
    FRONT_OFFICE: 'Front office del salone: accoglie i clienti, registra i walk-in e li assegna ai consulenti. Entra direttamente in Appuntamenti e ingressi.',
    CONSULENZA: 'Consulenti di vendita del salone: ricevono i clienti assegnati, cambiano il proprio stato e usano la chat. Entrano direttamente in Appuntamenti e ingressi.'
};
const PERM_ROLE_ICO = { UTENTE: '🎧', BACK_OFFICE: '🗂️', MODERATORE: '🧭', GESTORE: '📈', ADMIN: '🛡️', NOLEGGIO: '🚗', SERVICE: '🔧', FRONT_OFFICE: '🛎️', CONSULENZA: '🤝' };
let infoRuoliDati = null, infoRuoloScelto = null;
async function loadInfoRuoli() {
    const box = document.getElementById('infoRuoliContainer'); if (!box) return;
    if (!infoRuoliDati) box.innerHTML = '<div class="empty-state"><p>Caricamento…</p></div>';
    try { infoRuoliDati = await permDati(); }
    catch (e) { box.innerHTML = `<div class="empty-state"><p>${permEsc(e.message)}</p></div>`; return; }
    renderInfoRuoli(box, infoRuoliDati.matrix, infoRuoliDati.roles, infoRuoliDati.users);
}
function renderInfoRuoli(box, matrix, roles, users) {
    infoRuoliDati = { matrix, roles, users };
    if (!roles.includes(infoRuoloScelto)) infoRuoloScelto = roles[0];
    const liv = (role, key) => valoreVisto(key, (matrix[role] || {})[key] || 'NONE', role);
    const scrive = v => !['NONE', 'READ_ONLY', 'S_VIS', 'S_REP'].includes(v);
    const riassunto = role => {
        const vis = PERMISSION_SECTIONS.filter(s => liv(role, s.key) !== 'NONE');
        return { vis, mod: vis.filter(s => scrive(liv(role, s.key))), persone: users.filter(u => u.role === role) };
    };
    const tessere = roles.map(r => {
        const x = riassunto(r);
        return `<button type="button" class="perm-rtile ${r === infoRuoloScelto ? 'on' : ''}" data-ruolo="${r}" aria-pressed="${r === infoRuoloScelto}">
            <span class="perm-rtile-i">${PERM_ROLE_ICO[r] || '👤'}</span>
            <span class="perm-rtile-t"><b>${permEsc(formatRole(r))}</b><small>${x.vis.length} sezion${x.vis.length === 1 ? 'e' : 'i'} · ${x.persone.length} operator${x.persone.length === 1 ? 'e' : 'i'}</small></span>
          </button>`;
    }).join('');

    const role = infoRuoloScelto, x = riassunto(role);
    const sola = x.vis.length - x.mod.length;
    const nEcc = x.persone.reduce((n, u) => n + Object.keys(u.overrides || {}).length, 0);
    const gruppi = [...new Set(PERMISSION_SECTIONS.map(s => s.group))];
    const aree = gruppi.map(g => {
        const S = PERMISSION_SECTIONS.filter(s => s.group === g);
        const si = S.filter(s => liv(role, s.key) !== 'NONE'), no = S.filter(s => liv(role, s.key) === 'NONE');
        return `<section class="perm-area ${si.length ? '' : 'vuota'}">
            <h5>${permEsc(g)} <span>${si.length}/${S.length}</span></h5>
            ${si.map(s => {
                const v = liv(role, s.key);
                const d = s.key === 'SALONE'
                    ? `<ul class="perm-caps">${SALONE_CAPS.filter(c => c[1][v]).map(([t, c]) => `<li class="si">✓ ${permEsc(t)}${typeof c[v] === 'string' ? ` <small>(${permEsc(c[v])})</small>` : ''}</li>`).join('')}</ul>`
                    : `<p>${permEsc(descrizioneLivello(s.key, v))}</p>`;
                return `<div class="perm-sezcard lc-${v}">
                    <div class="perm-sezcard-h"><button type="button" class="perm-sec" onclick="apriInfoSezione('${s.key}')" title="Panoramica della sezione">${s.icon} ${permEsc(permNomeSez(s))} <span class="perm-i">ⓘ</span></button>${permBadge(s.key, v)}</div>${d}</div>`;
            }).join('')}
            ${no.length ? `<p class="perm-nonvede">🚫 Non vede: ${no.map(s => `<button type="button" class="perm-sec" onclick="apriInfoSezione('${s.key}')">${permEsc(permNomeSez(s))}</button>`).join(', ')}</p>` : ''}
          </section>`;
    }).join('');
    const operatori = x.persone.length ? x.persone.map(u => {
        const ecc = Object.entries(u.overrides || {}).map(([k, v]) => {
            const s = PERMISSION_SECTIONS.find(p => p.key === k);
            return s ? `<li>${s.icon} ${permEsc(permNomeSez(s))}: ${permBadge(k, valoreVisto(k, v, u.role))} <small>invece di ${permEsc((levelMetaFor(k)[liv(role, k)] || {}).label || liv(role, k))}</small></li>` : '';
        }).join('');
        return `<div class="perm-opcard"><span class="perm-av">${permEsc(permIniziali(u.fullName))}</span>
            <div><b>${permEsc(u.fullName)}</b><span>${permEsc(u.email || '')}</span>${ecc ? `<ul class="perm-ecc-l">${ecc}</ul>` : '<em>Segue i permessi del ruolo</em>'}</div></div>`;
    }).join('') : '<p class="perm-info-note">Nessun operatore con questo ruolo.</p>';

    box.innerHTML = `<div class="perm-ir">
        <aside class="perm-ir-side"><p class="perm-ir-lab">RUOLI</p>${tessere}</aside>
        <div class="perm-ir-main">
          <div class="perm-ir-hd"><span class="perm-ir-ico">${PERM_ROLE_ICO[role] || '👤'}</span><div><small>RUOLO</small><h3>${permEsc(formatRole(role))}</h3><p>${permEsc(ROLE_INFO[role] || '')}</p></div></div>
          <div class="perm-tiles">
            <div><b>${x.vis.length}<small>/${PERMISSION_SECTIONS.length}</small></b><span>sezioni che vede</span></div>
            <div><b>${x.mod.length}</b><span>in cui può modificare</span></div>
            <div><b>${sola}</b><span>solo in visione</span></div>
            <div><b>${x.persone.length}</b><span>operatori${nEcc ? ` · <em class="perm-gold">${nEcc} eccezion${nEcc === 1 ? 'e' : 'i'}</em>` : ''}</span></div>
          </div>
          <h4 class="perm-h4">Cosa vede e cosa può fare</h4>
          <div class="perm-aree">${aree}</div>
          <h4 class="perm-h4">Operatori con questo ruolo <span>(${x.persone.length})</span></h4>
          <div class="perm-opgrid">${operatori}</div>
          <p class="perm-info-note">I permessi vengono da “Permessi per Ruolo”; le eccezioni da “Permessi per Operatore”. Clicca il nome di una sezione per vederne la panoramica completa.</p>
        </div></div>`;
    avvisoCssPermessi(box);
    // sul telefono le tessere scorrono in orizzontale: porta in vista quella scelta
    const side = box.querySelector('.perm-ir-side'), on = box.querySelector('.perm-rtile.on');
    if (side && on && side.scrollWidth > side.clientWidth) side.scrollLeft = on.offsetLeft - 12;
    box.querySelectorAll('[data-ruolo]').forEach(b => b.addEventListener('click', () => {
        infoRuoloScelto = b.dataset.ruolo; renderInfoRuoli(box, matrix, roles, users);
        const m = box.querySelector('.perm-ir-main'); if (m && m.getBoundingClientRect().top < 0) m.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
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

    // NUOVO: ripristino dei permessi iniziali (solo Admin). "↺" sotto ogni ruolo = quel
    // ruolo torna come scritto nel programma; "Ripristina tutti i ruoli" = tutti.
    // Non e' "Eredita da ruolo" (quello e' per il singolo operatore, vedi sotto).
    const puoRipristinare = currentUser?.role === 'ADMIN';
    let html = (puoRipristinare ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px">
            <span style="font-size:12.5px;color:var(--text-secondary)">↺ sotto un ruolo = quel ruolo torna ai permessi iniziali (quelli di partenza del CRM), grafici compresi.</span>
            <button type="button" class="btn-small btn-secondary" onclick="resetRolePermissions('TUTTI')">↺ Ripristina tutti i ruoli</button>
        </div>` : '') + `<table class="permission-matrix-table">
        <thead>
            <tr>
                <th style="text-align:left">Sezione</th>
                ${permissionRolesCache.map(r => `<th>${roleLabel(r)}${puoRipristinare ? `<br><button type="button" onclick="resetRolePermissions('${r}')" title="Riporta ${roleLabel(r)} ai permessi iniziali" style="margin-top:4px;border:1px solid var(--border);background:transparent;color:var(--text-secondary);border-radius:6px;font-size:10.5px;font-weight:700;padding:2px 7px;cursor:pointer">↺ Iniziali</button>` : ''}</th>`).join('')}
            </tr>
        </thead>
        <tbody>`;

    let gruppo = null;
    PERMISSION_SECTIONS.forEach(section => {
        if (section.group !== gruppo) {
            gruppo = section.group;
            html += `<tr><td colspan="${permissionRolesCache.length + 1}" style="text-align:left;font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--text-secondary);padding-top:14px">${gruppo}${gruppo === 'BI' ? ' · la pagina BI la vede chi ha almeno una delle tre' : ''}${gruppo === 'Salone' ? ' · profili con un nome: clicca la sezione per il confronto' : ''}</td></tr>`;
        }
        html += `<tr>
            <td style="text-align:left;font-weight:700;white-space:nowrap"><button type="button" class="perm-sec" onclick="apriInfoSezione('${section.key}')" title="Clicca per vedere cosa si può fare con ogni livello">${section.icon} ${section.label.split(' · ')[0]} <span class="perm-i">ⓘ</span></button></td>
            ${permissionRolesCache.map(role => {
                const current = valoreVisto(section.key, permissionMatrixCache[role]?.[section.key] || 'NONE', role);
                return `<td>
                    <div class="permission-cell-group" data-role="${role}" data-section="${section.key}">
                        ${Object.entries(levelMetaFor(section.key)).map(([level, meta]) => `
                            <button type="button"
                                class="permission-cell-btn ${current === level ? 'active' : ''} level-${level}"
                                data-tip="${escAttr(tipDi(section.key, level))}" aria-label="${escAttr(meta.label)}"
                                onclick="setPermission('${role}','${section.key}','${level}', this)">${meta.icon}</button>
                        `).join('')}
                    </div>
                </td>`;
            }).join('')}
        </tr>`;
    });

    html += `</tbody></table>`;
    html += renderChartPermissionTable();
    container.innerHTML = html;
    PermUI.tabelle(container);
}

// ===== NUOVO: PERMESSI DEI GRAFICI (per ruolo) =====
// Tabella separata sotto quella delle sezioni: una riga per ogni grafico
// del CRM (elenco in app.js, CHART_PERMISSIONS), raggruppati per sezione.
// Solo due scelte: 👁 Visibile (READ_ONLY) / 🚫 Nascosto (NONE).
const CHART_ACCESS_META = {
    NONE: { icon: '🚫', label: 'Nascosto' },
    READ_ONLY: { icon: '👁', label: 'Visibile' }
};

function renderChartPermissionTable() {
    if (typeof CHART_PERMISSIONS === 'undefined') return '';
    const groups = [...new Set(CHART_PERMISSIONS.map(c => c.group))];
    let html = `<h3 style="margin:28px 0 6px;font-size:16px">📊 Grafici</h3>
        <p style="margin:0 0 12px;font-size:12.5px;color:var(--text-secondary)">Quali grafici vede ogni ruolo. Un grafico nascosto sparisce sia dalla sua pagina sia da "☰ Mostra Grafici".</p>
        <table class="permission-matrix-table">
        <thead><tr><th style="text-align:left">Grafico</th>${permissionRolesCache.map(r => `<th>${formatRole(r)}</th>`).join('')}</tr></thead>
        <tbody>`;
    groups.forEach(g => {
        html += `<tr><td colspan="${permissionRolesCache.length + 1}" style="text-align:left;font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--text-secondary);padding-top:14px">${g}</td></tr>`;
        CHART_PERMISSIONS.filter(c => c.group === g).forEach(c => {
            html += `<tr>
                <td style="text-align:left;font-weight:600;white-space:nowrap">${c.label}</td>
                ${permissionRolesCache.map(role => {
                    const cur = permissionMatrixCache[role]?.[c.key] === 'NONE' ? 'NONE' : 'READ_ONLY';
                    return `<td><div class="permission-cell-group">
                        ${Object.entries(CHART_ACCESS_META).map(([level, m]) => `
                            <button type="button" class="permission-cell-btn ${cur === level ? 'active' : ''} level-${level}"
                                title="${m.label}" onclick="setChartPermission('${role}','${c.key}','${level}', this)">${m.icon}</button>`).join('')}
                    </div></td>`;
                }).join('')}
            </tr>`;
        });
    });
    return html + `</tbody></table>`;
}

async function setChartPermission(role, key, access, btnEl) {
    const group = btnEl?.closest('.permission-cell-group');
    try {
        const res = await fetch('/api/permissions', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, section: key, access })
        });
        if (!res.ok) {
            const data = await res.json().catch(() => null);
            alert(data?.error || 'Errore nel salvataggio del permesso');
            return;
        }
        const data = await res.json();
        permissionMatrixCache = data.matrix || permissionMatrixCache;
        if (group) {
            group.querySelectorAll('.permission-cell-btn').forEach(b => b.classList.remove('active'));
            btnEl.classList.add('active');
        }
    } catch (err) {
        console.error('Errore salvataggio permesso grafico:', err);
        alert('Errore di connessione nel salvataggio del permesso');
    }
}

// NUOVO: ripristino dei permessi iniziali di un ruolo ('TUTTI' = tutti i ruoli)
async function resetRolePermissions(role) {
    const nome = role === 'TUTTI' ? 'TUTTI i ruoli' : 'il ruolo ' + formatRole(role);
    if (!confirm(`Riportare ${nome} ai permessi iniziali?\n\nLe modifiche fatte a mano su sezioni e grafici si perdono. Le eccezioni dei singoli operatori restano.`)) return;
    try {
        const res = await fetch('/api/permissions/reset/role', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
        const data = await res.json().catch(() => null);
        if (!res.ok) { alert(data?.error || 'Ripristino non riuscito'); return; }
        permissionMatrixCache = data.matrix || permissionMatrixCache;
        renderPermissionMatrix();
        if (typeof loadPermissionMatrix === 'function') { await loadPermissionMatrix(); if (typeof applyRolePermissions === 'function') applyRolePermissions(currentUser?.role); }
        alert(data.tolte ? `Fatto: ${data.tolte} modific${data.tolte === 1 ? 'a tolta' : 'he tolte'}.` : 'Era gia\' tutto ai permessi iniziali.');
    } catch (err) {
        console.error('Errore ripristino permessi ruolo:', err);
        alert('Errore di connessione nel ripristino');
    }
}

// NUOVO: l'operatore perde tutte le sue eccezioni e segue in tutto il suo ruolo
async function resetOperatorPermissions(userId) {
    const u = operatorPermissionsCache.find(x => x.id === userId);
    if (!confirm(`Togliere tutte le eccezioni personali di ${u ? u.fullName : 'questo operatore'}?\n\nSeguirà in tutto i permessi del suo ruolo (${u ? formatRole(u.role) : ''}), come oggi sono impostati.`)) return;
    try {
        const res = await fetch('/api/permissions/reset/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
        const data = await res.json().catch(() => null);
        if (!res.ok) { alert(data?.error || 'Ripristino non riuscito'); return; }
        if (u) u.overrides = {};
        renderOperatorPermissions();
    } catch (err) {
        console.error('Errore ripristino permessi operatore:', err);
        alert('Errore di connessione nel ripristino');
    }
}

// togliere un accesso al PROPRIO ruolo / a se stessi fa sparire la voce anche dal proprio menu: si chiede conferma
function confermaTogliAMe(section, chi) {
    const sec = PERMISSION_SECTIONS.find(s => s.key === section);
    return confirm(`Stai togliendo ${chi} l'accesso a "${sec ? permNomeSez(sec) : section}".\nLa voce sparirà anche dal TUO menu.\n\nVuoi continuare?`);
}
async function setPermission(role, section, access, btnEl) {
    const group = btnEl?.closest('.permission-cell-group');
    if (access === 'NONE' && role === currentUser?.role && !confermaTogliAMe(section, 'al tuo ruolo (' + formatRole(role) + ')')) return;
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
                b.classList.toggle('active', b.classList.contains('level-' + access));
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
                ${overrideCount > 0 ? `<span style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span style="font-size:12px;color:var(--text-secondary)">🛡️ ${overrideCount} eccezion${overrideCount === 1 ? 'e' : 'i'} personalizzat${overrideCount === 1 ? 'a' : 'e'}</span>${currentUser?.role === 'ADMIN' ? `<button type="button" class="btn-small btn-secondary" onclick="resetOperatorPermissions(${u.id})" title="Toglie tutte le eccezioni: l'operatore segue in tutto il suo ruolo">↩️ Eredita tutto dal ruolo</button>` : ''}</span>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
                ${operatorSectionsCache.map(sectionKey => {
                    const meta = sectionMeta(sectionKey);
                    const ov0 = (u.overrides || {})[sectionKey];
                    const currentOverride = ov0 ? valoreVisto(sectionKey, ov0, u.role) : 'INHERIT';
                    return `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid var(--border)">
                        <button type="button" class="perm-sec" style="font-size:13px;font-weight:600" onclick="apriInfoSezione('${sectionKey}')">${meta.icon} ${meta.label.split(' · ')[0]} <span class="perm-i">ⓘ</span></button>
                        <div class="permission-cell-group" data-user="${u.id}" data-section="${sectionKey}">
                            <button type="button" class="permission-cell-btn ${currentOverride === 'INHERIT' ? 'active' : ''}"
                                data-tip="Eredita dal ruolo\nSegue il permesso del suo ruolo (${escAttr(formatRole(u.role))})." onclick="setOperatorPermission(${u.id},'${sectionKey}','INHERIT', this)">↩️</button>
                            ${Object.entries(levelMetaFor(sectionKey)).map(([level, lm]) => `
                                <button type="button" class="permission-cell-btn ${currentOverride === level ? 'active' : ''} level-${level}"
                                    data-tip="${escAttr(tipDi(sectionKey, level))}" aria-label="${escAttr(lm.label)}" onclick="setOperatorPermission(${u.id},'${sectionKey}','${level}', this)">${lm.icon}</button>
                            `).join('')}
                        </div>
                    </div>`;
                }).join('')}
            </div>
            ${renderOperatorChartOverrides(u)}
        </div>`;
    }).join('');
    PermUI.operatori(container, filtered);
}

/* ===== NUOVO: visualizzazione piu' comoda dei permessi (stili in /css/permessi.css) =====
   - la tabella sta in un riquadro alto quanto lo schermo: intestazione e prima colonna restano
     ferme, la barra per scorrere di lato c'e' SOPRA (sempre a portata) e sotto
   - i gruppi (In bound, BI, Salone, Gestione, grafici...) si chiudono e si aprono cliccandoli;
     "Comprimi tutto" / "Espandi tutto" e "Vista compatta" (scelte ricordate nel browser)
   - Permessi per operatore: ogni operatore si apre e si chiude (di partenza chiusi) */
const PermUI = (function () {
    const LS = 'permUiStato';
    let stato = {}; try { stato = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { stato = {}; }
    stato.chiusi = stato.chiusi || {}; stato.aperti = stato.aperti || {};
    const salva = () => { try { localStorage.setItem(LS, JSON.stringify(stato)); } catch (e) { /* */ } };

    function barra(container) {
        let b = container.querySelector(':scope > .perm-bar');
        if (b) return b;
        b = document.createElement('div');
        b.className = 'perm-bar';
        b.innerHTML = `<button type="button" data-pa="chiudi">▸ Comprimi tutti i gruppi</button><button type="button" data-pa="apri">▾ Espandi tutti</button>
            <label><input type="checkbox" data-pa="compatta"> Vista compatta</label>`;
        container.insertBefore(b, container.firstChild);
        return b;
    }
    function compatta(container, on) { container.classList.toggle('perm-compatta', !!on); }

    function tabelle(container) {
        const b = barra(container);
        const chk = b.querySelector('[data-pa="compatta"]');
        chk.checked = !!stato.compatta; compatta(container, stato.compatta);
        chk.onchange = () => { stato.compatta = chk.checked; salva(); compatta(container, chk.checked); allinea(container); };
        container.querySelectorAll('table.permission-matrix-table').forEach((t, ti) => {
            if (t.parentElement.classList.contains('perm-scroll')) return;
            // barra di scorrimento in alto + riquadro che scorre
            const top = document.createElement('div'); top.className = 'perm-topscroll'; top.innerHTML = '<div></div>';
            const box = document.createElement('div'); box.className = 'perm-scroll';
            t.parentElement.insertBefore(top, t); t.parentElement.insertBefore(box, t); box.appendChild(t);
            top.addEventListener('scroll', () => { if (box.scrollLeft !== top.scrollLeft) box.scrollLeft = top.scrollLeft; });
            box.addEventListener('scroll', () => { if (top.scrollLeft !== box.scrollLeft) top.scrollLeft = box.scrollLeft; });
            // gruppi richiudibili: righe con una sola cella che occupa tutta la riga
            let gruppo = null;
            [...t.tBodies[0].rows].forEach(tr => {
                if (tr.cells.length === 1 && tr.cells[0].colSpan > 1) {
                    const nome = ti + '|' + tr.cells[0].textContent.split('·')[0].trim();
                    gruppo = { tr, nome, righe: [] };
                    tr.classList.add('perm-grp'); tr.dataset.grp = nome;
                    tr.cells[0].innerHTML = '<span class="perm-grp-in"><span class="perm-arrow">▾</span>' + tr.cells[0].innerHTML + '</span>';   // resta ferma a sinistra quando si scorre
                    tr._grp = gruppo;
                    tr.addEventListener('click', () => { stato.chiusi[nome] = !stato.chiusi[nome]; salva(); applica(tr); allinea(container); });
                } else if (gruppo) { gruppo.righe.push(tr); }
            });
            t.querySelectorAll('tr.perm-grp').forEach(applica);
        });
        b.onclick = e => {
            const a = e.target.closest('button[data-pa]'); if (!a) return;
            container.querySelectorAll('tr.perm-grp').forEach(tr => { stato.chiusi[tr.dataset.grp] = a.dataset.pa === 'chiudi'; applica(tr); });
            salva(); allinea(container);
        };
        allinea(container);
        if (!window._permResize) { window._permResize = true; window.addEventListener('resize', () => document.querySelectorAll('#permissionMatrixContainer').forEach(allinea)); }
    }
    function applica(tr) {
        const g = tr._grp; if (!g) return;
        const chiuso = !!stato.chiusi[g.nome];
        tr.classList.toggle('chiuso', chiuso);
        tr.querySelector('.perm-arrow').textContent = chiuso ? '▸' : '▾';
        g.righe.forEach(x => { x.style.display = chiuso ? 'none' : ''; });
    }
    function allinea(container) {
        container.querySelectorAll('.perm-scroll').forEach(box => {
            const top = box.previousElementSibling; if (!top || !top.classList.contains('perm-topscroll')) return;
            const t = box.querySelector('table');
            top.firstElementChild.style.width = t.scrollWidth + 'px';
            top.style.display = t.scrollWidth > box.clientWidth + 2 ? '' : 'none';
        });
    }

    // Permessi per operatore: ogni scheda si apre/chiude cliccando l'intestazione
    function operatori(container, utenti) {
        const b = barra(container);
        b.querySelector('label').style.display = 'none';
        b.querySelector('[data-pa="chiudi"]').textContent = '▸ Chiudi tutti gli operatori';
        b.querySelector('[data-pa="apri"]').textContent = '▾ Apri tutti';
        const carte = [...container.querySelectorAll(':scope > .waiting-card')];
        carte.forEach((c, i) => {
            const u = utenti[i]; if (!u) return;
            const testa = c.firstElementChild;
            c.classList.add('perm-op');
            testa.classList.add('perm-op-h');
            (testa.querySelector('.waiting-name') || testa.firstElementChild || testa).insertAdjacentHTML('afterbegin', '<span class="perm-arrow">▸</span>');
            const metti = () => { const ap = !!stato.aperti[u.id]; c.classList.toggle('aperto', ap); testa.querySelector('.perm-arrow').textContent = ap ? '▾' : '▸'; };
            testa.addEventListener('click', e => { if (e.target.closest('button')) return; stato.aperti[u.id] = !stato.aperti[u.id]; salva(); metti(); });
            metti();
        });
        b.onclick = e => {
            const a = e.target.closest('button[data-pa]'); if (!a) return;
            utenti.forEach(u => { stato.aperti[u.id] = a.dataset.pa === 'apri'; });
            salva();
            carte.forEach(c => { const ap = a.dataset.pa === 'apri'; c.classList.toggle('aperto', ap); c.querySelector('.perm-arrow').textContent = ap ? '▾' : '▸'; });
        };
    }
    return { tabelle, operatori };
})();

// NUOVO: eccezioni personali sui grafici, in un blocco richiudibile per non
// allungare troppo la scheda di ogni operatore.
function renderOperatorChartOverrides(u) {
    if (typeof CHART_PERMISSIONS === 'undefined') return '';
    const ov = u.overrides || {};
    const n = CHART_PERMISSIONS.filter(c => ov[c.key]).length;
    const groups = [...new Set(CHART_PERMISSIONS.map(c => c.group))];
    return `<details style="margin-top:10px">
        <summary style="cursor:pointer;font-size:13px;font-weight:700">📊 Grafici${n ? ` · ${n} eccezion${n === 1 ? 'e' : 'i'}` : ''}</summary>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
        ${groups.map(g => `<div style="font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--text-secondary);margin-top:8px">${g}</div>` +
            CHART_PERMISSIONS.filter(c => c.group === g).map(c => {
                const cur = ov[c.key] || 'INHERIT';
                return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:4px 0;border-bottom:1px solid var(--border)">
                    <span style="font-size:13px;font-weight:600">${c.label}</span>
                    <div class="permission-cell-group">
                        <button type="button" class="permission-cell-btn ${cur === 'INHERIT' ? 'active' : ''}" title="Eredita da ruolo"
                            onclick="setOperatorPermission(${u.id},'${c.key}','INHERIT', this)">↩️</button>
                        ${Object.entries(CHART_ACCESS_META).map(([level, m]) => `
                            <button type="button" class="permission-cell-btn ${cur === level ? 'active' : ''} level-${level}" title="${m.label}"
                                onclick="setOperatorPermission(${u.id},'${c.key}','${level}', this)">${m.icon}</button>`).join('')}
                    </div>
                </div>`;
            }).join('')).join('')}
        </div>
    </details>`;
}

async function setOperatorPermission(userId, section, access, btnEl) {
    const group = btnEl?.closest('.permission-cell-group');
    if (access === 'NONE' && userId === currentUser?.id && !confermaTogliAMe(section, 'a te stesso')) return;
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
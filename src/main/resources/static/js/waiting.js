async function loadWaitingList() {
    try {
        const res = await fetch('/api/waiting');
        if (!res.ok) return;
        const entries = await res.json();
        renderWaitingList(entries);
    } catch (err) {
        console.error('Errore caricamento lista attesa:', err);
    }
}

function renderWaitingList(entries) {
    const container = document.getElementById('waitingList');
    if (entries.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>🚗</h3>
                <p>Nessun cliente in lista recall</p>
            </div>`;
        return;
    }

    const today = new Date().toISOString().split('T')[0];

    container.innerHTML = entries.map(e => {
        const isRecallToday = e.recallDate === today;
        const isRecallPast = e.recallDate && e.recallDate < today;
        const isRecallSoon = e.recallDate && e.recallDate > today;

        let recallBadge = '';
        if (e.recallDate) {
            if (isRecallToday) {
                recallBadge = `<span class="recall-badge recall-today">🔔 RECALL OGGI · ${formatDateIT(e.recallDate)}</span>`;
            } else if (isRecallPast) {
                recallBadge = `<span class="recall-badge recall-past">⚠️ RECALL SCADUTO · ${formatDateIT(e.recallDate)}</span>`;
            } else {
                recallBadge = `<span class="recall-badge recall-future">📅 RECALL · ${formatDateIT(e.recallDate)}</span>`;
            }
        }

        return `
        <div class="waiting-card ${isRecallToday ? 'recall-card-today' : isRecallPast ? 'recall-card-past' : ''}">
            <div>
                <div class="waiting-name">${e.fullName}</div>
                <div class="waiting-details">
                    📞 ${e.contact} · 🚗 ${e.brand} ${e.model}
                    ${e.price ? ' · 💰 €' + Number(e.price).toLocaleString('it-IT') : ''}
                    ${e.notes ? '<br>📝 ' + e.notes : ''}
                </div>
                <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                    <span class="status-badge status-${e.status}">${formatWaitingStatus(e.status)}</span>
                    ${recallBadge}
                </div>
            </div>
            <div class="waiting-actions">
                <select class="input-dark" onchange="updateWaitingStatus(${e.id}, this.value)" style="font-size:12px">
                    <option value="WAITING" ${e.status==='WAITING'?'selected':''}>In Attesa</option>
                    <option value="CALLED" ${e.status==='CALLED'?'selected':''}>Richiamato</option>
                    <option value="APPOINTMENT" ${e.status==='APPOINTMENT'?'selected':''}>Appuntamento</option>
                    <option value="INTERESTED" ${e.status==='INTERESTED'?'selected':''}>Interessato</option>
                    <option value="CLOSED" ${e.status==='CLOSED'?'selected':''}>Chiuso</option>
                </select>
                <button class="btn-small btn-blue" onclick="editWaiting(${e.id})">✏️</button>
                <button class="btn-small btn-red" onclick="deleteWaiting(${e.id})">🗑️</button>
            </div>
        </div>
        `;
    }).join('');

    // Alert per recall di oggi
    const recallsToday = entries.filter(e => e.recallDate === today);
    if (recallsToday.length > 0) {
        const names = recallsToday.map(e => e.fullName).join(', ');
        setTimeout(() => {
            alert(`🔔 RECALL DI OGGI:\n${names}`);
        }, 500);
    }
}

function formatDateIT(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function createWaiting() {
    const fullName = document.getElementById('wFullName').value;
    const contact = document.getElementById('wContact').value;
    const brand = document.getElementById('wBrand').value;
    const model = document.getElementById('wModel').value;
    const price = document.getElementById('wPrice').value;
    const notes = document.getElementById('wNotes').value;
    const recallDate = document.getElementById('wRecallDate').value;

    if (!fullName || !contact || !brand || !model) {
        alert('Nome, contatto, marchio e modello sono obbligatori');
        return;
    }

    try {
        const res = await fetch('/api/waiting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, contact, brand, model, price, notes, recallDate })
        });

        if (!res.ok) {
            const data = await res.json();
            alert(data.error || 'Errore nella creazione');
            return;
        }

        hideNewWaiting();
        loadWaitingList();
    } catch (err) {
        console.error('Errore creazione cliente attesa:', err);
    }
}

async function updateWaitingStatus(id, status) {
    try {
        await fetch(`/api/waiting/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        loadWaitingList();
    } catch (err) {
        console.error('Errore aggiornamento stato:', err);
    }
}

async function deleteWaiting(id) {
    if (!confirm('Sei sicuro di voler eliminare questo cliente?')) return;
    try {
        await fetch(`/api/waiting/${id}`, { method: 'DELETE' });
        loadWaitingList();
    } catch (err) {
        console.error('Errore eliminazione:', err);
    }
}

async function editWaiting(id) {
    const res = await fetch(`/api/waiting/${id}`);
    if (!res.ok) return;
    const e = await res.json();

    const newNotes = prompt('Note:', e.notes || '');
    if (newNotes === null) return;

    const newRecallDate = prompt('Data recall (YYYY-MM-DD, lascia vuoto per rimuovere):', e.recallDate || '');
    if (newRecallDate === null) return;

    try {
        await fetch(`/api/waiting/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: newNotes, recallDate: newRecallDate || null })
        });
        loadWaitingList();
    } catch (err) {
        console.error('Errore modifica:', err);
    }
}

function showNewWaiting() {
    document.getElementById('newWaitingForm').style.display = 'block';
}

function hideNewWaiting() {
    document.getElementById('newWaitingForm').style.display = 'none';
    document.getElementById('wFullName').value = '';
    document.getElementById('wContact').value = '';
    document.getElementById('wBrand').value = '';
    document.getElementById('wModel').value = '';
    document.getElementById('wPrice').value = '';
    document.getElementById('wNotes').value = '';
    document.getElementById('wRecallDate').value = '';
}

function formatWaitingStatus(status) {
    const map = {
        'WAITING': 'IN ATTESA',
        'CALLED': 'RICHIAMATO',
        'APPOINTMENT': 'APPUNTAMENTO',
        'INTERESTED': 'INTERESSATO',
        'CLOSED': 'CHIUSO'
    };
    return map[status] || status;
}
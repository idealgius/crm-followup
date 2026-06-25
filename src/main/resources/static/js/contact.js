let contactLogs = [];

async function loadContactLogs(from, to) {
    try {
        let url = '/api/contacts';
        if (from && to) url += `?from=${from}&to=${to}`;
        const res = await fetch(url);
        if (!res.ok) return;
        contactLogs = await res.json();
        renderContactLogs(contactLogs);
        loadContactStats(from, to);
    } catch (err) {
        console.error('Errore caricamento contatti:', err);
    }
}

function renderContactLogs(logs) {
    const container = document.getElementById('contactLogsList');
    if (!container) return;

    if (logs.length === 0) {
        container.innerHTML = `<div class="empty-state"><div style="font-size:40px">📞</div><p>Nessun contatto registrato</p></div>`;
        return;
    }

    // Raggruppa per data
    const grouped = {};
    logs.forEach(log => {
        const date = log.contactDate.split('T')[0];
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(log);
    });

    // Raggruppa per settimana
    const byWeek = {};
    Object.entries(grouped).sort().forEach(([date, items]) => {
        const weekKey = getWeekKey(date);
        if (!byWeek[weekKey]) byWeek[weekKey] = {};
        byWeek[weekKey][date] = items;
    });

    container.innerHTML = Object.entries(byWeek).sort().map(([weekKey, days]) => `
        <div class="contact-week-section">
            <div class="contact-week-header" onclick="toggleContactWeek('${weekKey}')">
                <span>📅 ${weekKey}</span>
                <span class="folder-arrow" id="week-arrow-${weekKey}">▼</span>
            </div>
            <div id="week-body-${weekKey}">
                ${Object.entries(days).sort().map(([date, items]) => `
                    <div class="contact-day-section">
                        <div class="contact-day-header">
                            ${formatDateIT(date)} — <span style="color:var(--text-secondary)">${items.length} contatti</span>
                        </div>
                        <div class="contact-table-wrapper">
                            <table class="contact-table">
                                <thead>
                                    <tr>
                                        <th>Orario</th>
                                        <th>Categoria</th>
                                        <th>Note</th>
                                        <th>Operatore</th>
                                        <th>Azioni</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${items.map(log => renderContactRow(log)).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function renderContactRow(log) {
    const time = log.contactDate.split('T')[1].substring(0, 5);
    const isOwner = currentUser && log.user.id === currentUser.id;
    const isAdmin = currentUser && currentUser.role === 'ADMIN';
    const canEdit = isOwner || isAdmin;

    return `
        <tr id="contact-row-${log.id}">
            <td style="font-weight:700;color:var(--text-primary);white-space:nowrap">${time}</td>
            <td>
                <span class="contact-category-badge cat-${log.category.replace(/\s+/g, '_')}">${log.category}</span>
                ${log.otherNote ? `<span style="font-size:11px;color:var(--text-secondary);margin-left:6px">${log.otherNote}</span>` : ''}
            </td>
            <td style="font-size:12px;color:var(--text-secondary)">${log.otherNote || '—'}</td>
            <td style="font-size:12px;color:var(--text-secondary)">${log.user.fullName}</td>
            <td>
                ${canEdit ? `
                    <button class="btn-small btn-orange" onclick="editContactLog(${log.id})" style="margin-right:4px">✏️</button>
                    <button class="btn-small btn-red" onclick="deleteContactLog(${log.id})">🗑️</button>
                ` : ''}
            </td>
        </tr>
    `;
}

function toggleContactWeek(weekKey) {
    const body = document.getElementById(`week-body-${weekKey}`);
    const arrow = document.getElementById(`week-arrow-${weekKey}`);
    if (body) {
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'block' : 'none';
        if (arrow) arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
    }
}

async function loadContactStats(from, to) {
    try {
        let url = '/api/contacts/stats';
        if (from && to) url += `?from=${from}&to=${to}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const stats = await res.json();
        renderContactStats(stats);
        renderContactChart(stats);
    } catch (err) {
        console.error('Errore statistiche contatti:', err);
    }
}

function renderContactStats(stats) {
    const el = id => document.getElementById(id);
    if (el('statContactTotal')) el('statContactTotal').textContent = stats.total || 0;
    if (el('statInfoVendita')) el('statInfoVendita').textContent = (stats.infoVenditaPct || 0) + '%';
    if (el('statInfoNoleggio')) el('statInfoNoleggio').textContent = (stats.infoNoleggioP_ct || 0) + '%';
    if (el('statService')) el('statService').textContent = (stats.servicePct || 0) + '%';
}

let contactChart = null;

function renderContactChart(stats) {
    const ctx = document.getElementById('chartContacts');
    if (!ctx) return;
    if (contactChart) contactChart.destroy();

    const byCategory = stats.byCategory || {};
    const labels = Object.keys(byCategory);
    const data = Object.values(byCategory);
    const colors = [
        '#1a4080','#f0c040','#00c853','#ff9800','#ff3d3d',
        '#7c4dff','#00bcd4','#e91e63'
    ];

    contactChart = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: 'var(--bg-main)'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: 'var(--text-secondary)', font: { size: 11 }, padding: 12 }
                }
            }
        }
    });
}

async function createContactLog() {
    const category = document.getElementById('contactCategory').value;
    const otherNote = document.getElementById('contactOtherNote').value.trim();
    const dateVal = document.getElementById('contactDate').value;
    const timeVal = document.getElementById('contactTime').value;

    if (!category) { alert('Seleziona una categoria'); return; }
    if (!dateVal || !timeVal) { alert('Inserisci data e orario'); return; }
    if (category === 'Altro' && !otherNote) { alert('Inserisci la motivazione per "Altro"'); return; }

    const contactDate = `${dateVal}T${timeVal}:00`;

    try {
        const res = await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, otherNote, contactDate })
        });
        if (!res.ok) { alert('Errore nella creazione'); return; }
        hideNewContactForm();
        const from = document.getElementById('contactFrom')?.value;
        const to = document.getElementById('contactTo')?.value;
        loadContactLogs(from, to);
    } catch (err) {
        console.error('Errore creazione contatto:', err);
    }
}

async function deleteContactLog(id) {
    if (!confirm('Eliminare questo contatto?')) return;
    try {
        await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
        const from = document.getElementById('contactFrom')?.value;
        const to = document.getElementById('contactTo')?.value;
        loadContactLogs(from, to);
    } catch (err) {
        console.error('Errore eliminazione:', err);
    }
}

async function editContactLog(id) {
    const log = contactLogs.find(l => l.id === id);
    if (!log) return;

    const newCategory = prompt('Categoria:', log.category);
    if (!newCategory) return;
    const newNote = prompt('Note (opzionale):', log.otherNote || '');

    try {
        await fetch(`/api/contacts/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: newCategory, otherNote: newNote })
        });
        const from = document.getElementById('contactFrom')?.value;
        const to = document.getElementById('contactTo')?.value;
        loadContactLogs(from, to);
    } catch (err) {
        console.error('Errore modifica:', err);
    }
}

function showNewContactForm() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().substring(0, 5);
    document.getElementById('contactDate').value = dateStr;
    document.getElementById('contactTime').value = timeStr;
    document.getElementById('newContactForm').style.display = 'block';
    document.getElementById('newContactForm').scrollIntoView({ behavior: 'smooth' });
}

function hideNewContactForm() {
    document.getElementById('newContactForm').style.display = 'none';
    document.getElementById('contactCategory').value = '';
    document.getElementById('contactOtherNote').value = '';
    document.getElementById('contactOtherNoteRow').style.display = 'none';
}

function onCategoryChange() {
    const cat = document.getElementById('contactCategory').value;
    document.getElementById('contactOtherNoteRow').style.display = cat === 'Altro' ? 'block' : 'none';
}

function printContactLogs() {
    window.print();
}

function getWeekKey(dateStr) {
    const d = new Date(dateStr);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - day);
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `Settimana ${weekNo} — ${d.getFullYear()}`;
}

function formatDateIT(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}
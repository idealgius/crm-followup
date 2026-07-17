let chartFollowUp = null;
let chartWaiting = null;
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth() + 1;
let calendarDays = {};
let recallCalendarYear = new Date().getFullYear();
let recallCalendarMonth = new Date().getMonth() + 1;
let recallEntries = [];

const STAT_DETAIL_TITLES = {
    all: 'Follow-up totali',
    responded: 'Risposte ricevute',
    appointments: 'Appuntamenti',
    abandoned: 'Abbandonati'
};

const WAITING_STATUS_TITLES = {
    WAITING: 'In Attesa',
    CALLED: 'Richiamati',
    APPOINTMENT: 'Appuntamento',
    INTERESTED: 'Interessati',
    CLOSED: 'Chiusi'
};

const MONTH_NAMES = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

function getStatsQueryParams() {
    const from = document.getElementById('statsFrom').value;
    const to = document.getElementById('statsTo').value;
    const consultant = document.getElementById('statsConsultant')?.value || '';
    let qs = `from=${from}&to=${to}`;
    if (consultant) qs += `&consultant=${encodeURIComponent(consultant)}`;
    return { from, to, consultant, qs };
}

async function loadStats() {
    const { from, to, qs } = getStatsQueryParams();
    if (!from || !to) return;

    const consultant = document.getElementById('statsConsultant')?.value || '';
    let calQs = `year=${calendarYear}&month=${calendarMonth}`;
    if (consultant) calQs += `&consultant=${encodeURIComponent(consultant)}`;

    try {
        const [fuRes, wRes, calRes, recallRes] = await Promise.all([
            fetch(`/api/stats/followups?${qs}`),
            fetch('/api/stats/waiting'),
            fetch(`/api/stats/calendar?${calQs}`),
            fetch('/api/waiting')
        ]);

        if (fuRes.ok) {
            const fuStats = await fuRes.json();
            document.getElementById('statTotal').textContent = fuStats.total;
            document.getElementById('statResponded').textContent = fuStats.responded;
            document.getElementById('statAppointments').textContent = fuStats.appointments;
            document.getElementById('statResponseRate').textContent = fuStats.responseRate + '%';
            document.getElementById('statAppointmentRate').textContent = fuStats.appointmentRate + '%';
            renderFollowUpChart(fuStats);
        }

        if (wRes.ok) {
            const wStats = await wRes.json();
            renderWaitingChart(wStats);
        }

        if (calRes.ok) {
            const calData = await calRes.json();
            calendarDays = calData.days || {};
            renderCalendar();
        }

        if (recallRes.ok) {
            recallEntries = await recallRes.json();
            renderRecallCalendar();
        }

    } catch (err) {
        console.error('Errore caricamento statistiche:', err);
    }
}

async function loadRecallEntries() {
    try {
        const res = await fetch('/api/waiting');
        if (!res.ok) return;
        recallEntries = await res.json();
        renderRecallCalendar();
    } catch (err) {
        console.error('Errore caricamento recall:', err);
    }
}

async function loadCalendar() {
    const consultant = document.getElementById('statsConsultant')?.value || '';
    let qs = `year=${calendarYear}&month=${calendarMonth}`;
    if (consultant) qs += `&consultant=${encodeURIComponent(consultant)}`;

    try {
        const res = await fetch(`/api/stats/calendar?${qs}`);
        if (!res.ok) return;
        const data = await res.json();
        calendarDays = data.days || {};
        renderCalendar();
    } catch (err) {
        console.error('Errore caricamento calendario:', err);
    }
}

function changeCalendarMonth(delta) {
    calendarMonth += delta;
    if (calendarMonth > 12) { calendarMonth = 1; calendarYear++; }
    else if (calendarMonth < 1) { calendarMonth = 12; calendarYear--; }
    loadCalendar();
}

function changeRecallCalendarMonth(delta) {
    recallCalendarMonth += delta;
    if (recallCalendarMonth > 12) { recallCalendarMonth = 1; recallCalendarYear++; }
    else if (recallCalendarMonth < 1) { recallCalendarMonth = 12; recallCalendarYear--; }
    renderRecallCalendar();
}

function renderCalendar() {
    const container = document.getElementById('fuCalendar');
    const title = document.getElementById('calendarTitle');
    if (!container || !title) return;

    title.textContent = `Calendario Follow Up — ${MONTH_NAMES[calendarMonth - 1]} ${calendarYear}`;

    const firstDay = new Date(calendarYear, calendarMonth - 1, 1);
    const daysInMonth = new Date(calendarYear, calendarMonth, 0).getDate();
    let startWeekday = firstDay.getDay();
    startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;

    const weekdays = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
    let html = weekdays.map(d => `<div class="cal-weekday">${d}</div>`).join('');

    for (let i = 0; i < startWeekday; i++) {
        html += '<div class="cal-day cal-day-empty"></div>';
    }

    const today = new Date().toISOString().split('T')[0];

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const info = calendarDays[dateStr];
        let dayClass = 'cal-day';
        if (info) {
            dayClass += info.complete ? ' cal-day-complete' : ' cal-day-pending';
        }
        if (dateStr === today) dayClass += ' cal-day-today';
        html += `<button type="button" class="${dayClass}" onclick="openCalendarDay('${dateStr}')">${day}</button>`;
    }

    container.innerHTML = html;
}

// ============================================================
// CALENDARIO RECALL — FIX APPLICATI:
// 1) Colore "scaduto" ora ignora le entry già segnate come richiamate
//    (e.richiamato === true): un giorno con SOLO recall già richiamati
//    diventa verde invece di restare rosso per sempre.
// 2) Ogni giorno con recall è ora cliccabile (onclick="openRecallCalendarDay(...)"),
//    prima non aveva alcun gestore di click.
// ============================================================
function renderRecallCalendar() {
    const container = document.getElementById('recallCalendar');
    const title = document.getElementById('recallCalendarTitle');
    if (!container || !title) return;

    title.textContent = `Calendario Recall — ${MONTH_NAMES[recallCalendarMonth - 1]} ${recallCalendarYear}`;

    const firstDay = new Date(recallCalendarYear, recallCalendarMonth - 1, 1);
    const daysInMonth = new Date(recallCalendarYear, recallCalendarMonth, 0).getDate();
    let startWeekday = firstDay.getDay();
    startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;

    const today = new Date().toISOString().split('T')[0];

    const byDay = {};
    recallEntries.forEach(e => {
        if (e.recallDate) {
            if (!byDay[e.recallDate]) byDay[e.recallDate] = [];
            byDay[e.recallDate].push(e);
        }
    });

    const weekdays = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
    let html = weekdays.map(d => `<div class="cal-weekday">${d}</div>`).join('');

    for (let i = 0; i < startWeekday; i++) {
        html += '<div class="cal-day cal-day-empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${recallCalendarYear}-${String(recallCalendarMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const entries = byDay[dateStr] || [];
        const isToday = dateStr === today;
        const isPast = dateStr < today;

        // Solo le entry NON ancora richiamate contano per determinare il colore
        // "da fare" (oggi/scaduto/futuro). Se tutte le entry del giorno sono
        // già state richiamate, il giorno diventa verde ("gestito").
        const daFare = entries.filter(e => !e.richiamato);
        const tutteGestite = entries.length > 0 && daFare.length === 0;

        let bgStyle = '';
        let borderStyle = '';
        let title2 = '';

        if (tutteGestite) {
            bgStyle = 'background:rgba(0,200,83,0.2);';
            borderStyle = 'border-color:#00c853;';
            title2 = `title="${entries.map(e => e.fullName).join(', ')} — tutti richiamati"`;
        } else if (daFare.length > 0) {
            if (isToday) {
                bgStyle = 'background:rgba(240,192,64,0.35);';
                borderStyle = 'border-color:#f0c040;';
            } else if (isPast) {
                bgStyle = 'background:rgba(255,61,61,0.2);';
                borderStyle = 'border-color:#ff3d3d;';
            } else {
                bgStyle = 'background:rgba(74,144,217,0.2);';
                borderStyle = 'border-color:#4a90d9;';
            }
            title2 = `title="${daFare.map(e => e.fullName).join(', ')}"`;
        }

        const todayClass = isToday ? ' cal-day-today' : '';
        const clickable = entries.length > 0 ? ` onclick="openRecallCalendarDay('${dateStr}')" style="cursor:pointer;${bgStyle}${borderStyle}"` : ` style="${bgStyle}${borderStyle}"`;
        html += `<button type="button" class="cal-day${todayClass}"${clickable} ${title2}>${day}${entries.length > 0 ? `<span style="display:block;font-size:9px;font-weight:900">${entries.length}</span>` : ''}</button>`;
    }

    container.innerHTML = html;
}

// Apre l'elenco clienti recall del giorno cliccato. Riusa statDetailModal
// (NON annidato in una pagina nascosta, quindi visibile anche stando sulla
// Dashboard — a differenza di waitingRecallModal/waitingDetailModal che
// sono dentro #waitingPage e non si vedrebbero da qui).
function openRecallCalendarDay(dateStr) {
    const entries = recallEntries.filter(e => e.recallDate === dateStr);
    if (entries.length === 0) return;

    const modal = document.getElementById('statDetailModal');
    const list = document.getElementById('statDetailList');
    const title = document.getElementById('statDetailTitle');
    if (!modal || !list || !title) return;

    const dateLabel = formatDateITChart(dateStr);
    title.textContent = `Recall — ${dateLabel} (${entries.length})`;

    list.innerHTML = entries.map(e => {
        const color = e.richiamato ? '#00c853' : '#ff9800';
        const statusLabel = e.richiamato ? '✅ Richiamato' : '🔔 Da richiamare';
        return `<div class="followup-card stat-detail-card" onclick="goToRecallEntry(${e.id})">
            <div class="followup-header" style="margin-bottom:0">
                <div>
                    <div class="followup-name">${e.fullName}</div>
                    <div class="followup-meta">
                        🚗 ${e.brand} ${e.model}
                        · 📞 ${e.contact}
                    </div>
                </div>
                <div style="display:flex;gap:6px;align-items:center">
                    <span class="status-badge" style="background:${color}22;color:${color}">${statusLabel}</span>
                    <span style="color:#f0c040;font-size:18px">→</span>
                </div>
            </div>
        </div>`;
    }).join('');

    modal.style.display = 'flex';
}

// Passa alla pagina Recall vera, ricarica la lista (necessario perché
// waitingEntries in waiting.js è un array separato da recallEntries qui)
// e apre la scheda completa del cliente selezionato.
async function goToRecallEntry(id) {
    closeStatDetail();
    showPage('waiting');
    if (typeof loadWaitingList === 'function') {
        await loadWaitingList();
    }
    if (typeof openWaitingDetailModal === 'function') {
        openWaitingDetailModal(id);
    }
}

function formatDateITChart(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function openCalendarDay(dateStr) {
    document.getElementById('statsFrom').value = dateStr;
    document.getElementById('statsTo').value = dateStr;
    loadStats();
    showStatDetail('all');
}

async function showStatDetail(type) {
    const { from, to, consultant } = getStatsQueryParams();
    if (!from || !to) return;

    let qs = `from=${from}&to=${to}&type=${type}`;
    if (consultant) qs += `&consultant=${encodeURIComponent(consultant)}`;

    const modal = document.getElementById('statDetailModal');
    const list = document.getElementById('statDetailList');
    const title = document.getElementById('statDetailTitle');

    title.textContent = STAT_DETAIL_TITLES[type] || 'Dettaglio';
    list.innerHTML = '<div class="empty-state" style="padding:30px"><p>Caricamento...</p></div>';
    modal.style.display = 'flex';

    try {
        const res = await fetch(`/api/stats/followups/list?${qs}`);
        if (!res.ok) {
            list.innerHTML = '<div class="empty-state" style="padding:30px"><p>Errore nel caricamento</p></div>';
            return;
        }
        const items = await res.json();
        renderStatDetailList(items, from, to, consultant);
    } catch (err) {
        console.error('Errore dettaglio stats:', err);
        list.innerHTML = '<div class="empty-state" style="padding:30px"><p>Errore nel caricamento</p></div>';
    }
}

function renderStatDetailList(items, from, to, consultant) {
    const list = document.getElementById('statDetailList');
    const filterNote = consultant ? ` · Consulente: ${consultant}` : '';
    const rangeNote = from === to ? from : `${from} → ${to}`;

    if (!items || items.length === 0) {
        list.innerHTML = `<div class="empty-state" style="padding:30px"><p>Nessun risultato (${rangeNote}${filterNote})</p></div>`;
        return;
    }

    list.innerHTML = `
        <div class="stat-detail-meta">${items.length} risultati · ${rangeNote}${filterNote}</div>
        ${items.map(fu => `
            <div class="followup-card stat-detail-card" onclick="goToFollowUpFromDashboard('${fu.workDate}', ${fu.id})">
                <div class="followup-header" style="margin-bottom:0">
                    <div>
                        <div class="followup-name">${fu.customer.fullName}</div>
                        <div class="followup-meta">
                            ${fu.customer.email ? '✉️ ' + fu.customer.email : ''}
                            ${fu.customer.phone ? (fu.customer.email ? ' · ' : '') + '📞 ' + fu.customer.phone : ''}
                            · 📅 ${fu.workDate}
                            · 👤 ${fu.consultantName || 'N/D'}
                        </div>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center">
                        <span class="status-badge status-${fu.status}">${formatStatus(fu.status)}</span>
                        ${fu.hasAppointment ? '<span class="status-badge status-APPOINTMENT">📅 APP.</span>' : ''}
                        <span style="color:#f0c040;font-size:18px">→</span>
                    </div>
                </div>
            </div>
        `).join('')}
    `;
}

function goToFollowUpFromDashboard(date, followUpId) {
    closeStatDetail();
    showPage('followups');
    document.getElementById('workDateFilter').value = date;
    loadFollowUps();
    setTimeout(() => {
        const el = document.getElementById(`fu-${followUpId}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.borderColor = '#f0c040';
            el.style.boxShadow = '0 0 0 3px rgba(240,192,64,0.3)';
            setTimeout(() => {
                el.style.borderColor = '';
                el.style.boxShadow = '';
            }, 3000);
        }
    }, 700);
}

function closeStatDetail(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('statDetailModal').style.display = 'none';
}

function showWaitingDetail(status) {
    const items = recallEntries.filter(e => e.status === status);
    const modal = document.getElementById('statDetailModal');
    const list = document.getElementById('statDetailList');
    const title = document.getElementById('statDetailTitle');
    if (!modal || !list || !title) return;

    title.textContent = WAITING_STATUS_TITLES[status] || 'Dettaglio';
    if (items.length === 0) {
        list.innerHTML = `<div class="empty-state" style="padding:30px"><p>Nessun cliente in questo stato</p></div>`;
    } else {
        list.innerHTML = `
            <div class="stat-detail-meta">${items.length} risultati</div>
            ${items.map(e => `
                <div class="followup-card stat-detail-card" style="cursor:default">
                    <div class="followup-header" style="margin-bottom:0">
                        <div>
                            <div class="followup-name">${e.fullName}</div>
                            <div class="followup-meta">
                                📞 ${e.contact} · 🚗 ${e.brand} ${e.model}
                                ${e.price ? ' · 💰 €' + Number(e.price).toLocaleString('it-IT') : ''}
                                ${e.recallDate ? ' · 📅 ' + e.recallDate : ''}
                            </div>
                        </div>
                        <div>
                            <span class="status-badge status-${e.status}">${formatWaitingStatus ? formatWaitingStatus(e.status) : e.status}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        `;
    }
    modal.style.display = 'flex';
}

function renderFollowUpChart(stats) {
    const ctx = document.getElementById('chartFollowUp').getContext('2d');
    if (chartFollowUp) chartFollowUp.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? '#2a2d3e' : '#e0e0e0';
    const tickColor = isDark ? '#8a8faa' : '#555';

    const labels = ['Totali', 'Risposte', 'Appuntamenti', 'Abbandonati'];
    const types = ['all', 'responded', 'appointments', 'abandoned'];
    const dataValues = [stats.total, stats.responded, stats.appointments, stats.abandoned];
    const total = stats.total || 0;

    chartFollowUp = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Follow-Up',
                data: dataValues,
                backgroundColor: [
                    'rgba(33,150,243,0.7)',
                    'rgba(0,200,83,0.7)',
                    'rgba(240,192,64,0.7)',
                    'rgba(255,68,68,0.7)'
                ],
                borderColor: ['#2196f3','#00c853','#f0c040','#ff4444'],
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            animation: { duration: 300 },
            onClick: (evt, elements) => { if (elements.length > 0) showStatDetail(types[elements[0].index]); },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => {
                    const val = ctx.raw;
                    const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                    return ` Valore: ${val} — ${pct}%`;
                } } }
            },
            scales: {
                x: { ticks: { color: tickColor }, grid: { color: gridColor } },
                y: { ticks: { color: tickColor, precision: 0 }, grid: { color: gridColor }, beginAtZero: true }
            }
        }
    });
}

function renderWaitingChart(stats) {
    const ctx = document.getElementById('chartWaiting').getContext('2d');
    if (chartWaiting) chartWaiting.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const legendColor = isDark ? '#8a8faa' : '#555';

    const labels = ['In Attesa', 'Richiamati', 'Appuntamento', 'Interessati', 'Chiusi'];
    const statuses = ['WAITING', 'CALLED', 'APPOINTMENT', 'INTERESTED', 'CLOSED'];
    const dataValues = [stats.waiting, stats.called, stats.appointments, stats.interested, stats.closed];
    const colors = ['#2196f3','#ff9800','#f0c040','#00c853','#9c27b0'];
    const total = dataValues.reduce((a,b) => a+b, 0);

    chartWaiting = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: dataValues,
                backgroundColor: colors.map(c => c + 'b3'),
                borderColor: colors,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            animation: { duration: 300 },
            onClick: (evt, elements) => { if (elements.length > 0) showWaitingDetail(statuses[elements[0].index]); },
            onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: legendColor, font: { size: 11 }, padding: 10, boxWidth: 12,
                        generateLabels: chart => chart.data.labels.map((label, i) => {
                            const val = chart.data.datasets[0].data[i];
                            const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                            return { text: `${label}: ${val} (${pct}%)`, fillStyle: colors[i]+'b3', strokeStyle: colors[i], fontColor: legendColor, lineWidth: 0, index: i };
                        })
                    }
                },
                tooltip: { callbacks: { label: ctx => {
                    const val = ctx.raw;
                    const pct = total > 0 ? Math.round(val*1000/total)/10 : 0;
                    return ` Valore: ${val} — ${pct}%`;
                } } }
            }
        }
    });
}
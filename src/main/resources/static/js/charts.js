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
    appointments: 'Appuntamenti'
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
        const [fuRes, wRes, calRes] = await Promise.all([
            fetch(`/api/stats/followups?${qs}`),
            fetch('/api/stats/waiting'),
            fetch(`/api/stats/calendar?${calQs}`)
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
            // Carica anche i recall per il calendario
            await loadRecallEntries();
        }

        if (calRes.ok) {
            const calData = await calRes.json();
            calendarDays = calData.days || {};
            renderCalendar();
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

    title.textContent = `${MONTH_NAMES[calendarMonth - 1]} ${calendarYear}`;

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

function renderRecallCalendar() {
    const container = document.getElementById('recallCalendar');
    const title = document.getElementById('recallCalendarTitle');
    if (!container || !title) return;

    title.textContent = `${MONTH_NAMES[recallCalendarMonth - 1]} ${recallCalendarYear}`;

    const firstDay = new Date(recallCalendarYear, recallCalendarMonth - 1, 1);
    const daysInMonth = new Date(recallCalendarYear, recallCalendarMonth, 0).getDate();
    let startWeekday = firstDay.getDay();
    startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;

    const today = new Date().toISOString().split('T')[0];

    // Raggruppa recall per data
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

        let bgStyle = '';
        let borderStyle = '';
        let title2 = '';

        if (entries.length > 0) {
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
            title2 = `title="${entries.map(e => e.fullName).join(', ')}"`;
        }

        const todayClass = isToday ? ' cal-day-today' : '';
        html += `<button type="button" class="cal-day${todayClass}" style="${bgStyle}${borderStyle}" ${title2}>${day}${entries.length > 0 ? `<span style="display:block;font-size:9px;font-weight:900">${entries.length}</span>` : ''}</button>`;
    }

    container.innerHTML = html;
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

function renderFollowUpChart(stats) {
    const ctx = document.getElementById('chartFollowUp').getContext('2d');
    if (chartFollowUp) chartFollowUp.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? '#2a2d3e' : '#e0e0e0';
    const tickColor = isDark ? '#8a8faa' : '#555';

    chartFollowUp = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Totali', 'Risposte', 'Appuntamenti', 'Abbandonati'],
            datasets: [{
                label: 'Follow-Up',
                data: [stats.total, stats.responded, stats.appointments, stats.abandoned],
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
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: tickColor }, grid: { color: gridColor } },
                y: { ticks: { color: tickColor }, grid: { color: gridColor }, beginAtZero: true }
            }
        }
    });
}

function renderWaitingChart(stats) {
    const ctx = document.getElementById('chartWaiting').getContext('2d');
    if (chartWaiting) chartWaiting.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const legendColor = isDark ? '#8a8faa' : '#555';

    chartWaiting = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['In Attesa', 'Richiamati', 'Appuntamento', 'Interessati', 'Chiusi'],
            datasets: [{
                data: [stats.waiting, stats.called, stats.appointments, stats.interested, stats.closed],
                backgroundColor: [
                    'rgba(33,150,243,0.7)',
                    'rgba(255,152,0,0.7)',
                    'rgba(240,192,64,0.7)',
                    'rgba(0,200,83,0.7)',
                    'rgba(156,39,176,0.7)'
                ],
                borderColor: ['#2196f3','#ff9800','#f0c040','#00c853','#9c27b0'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            animation: { duration: 300 },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: legendColor, font: { size: 11 } }
                }
            }
        }
    });
}
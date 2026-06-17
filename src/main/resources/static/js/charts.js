let chartFollowUp = null;
let chartWaiting = null;
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth() + 1;
let calendarDays = {};

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

    try {
        const [fuRes, wRes] = await Promise.all([
            fetch(`/api/stats/followups?${qs}`),
            fetch('/api/stats/waiting'),
            loadCalendar()
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

    } catch (err) {
        console.error('Errore caricamento statistiche:', err);
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
    if (calendarMonth > 12) {
        calendarMonth = 1;
        calendarYear++;
    } else if (calendarMonth < 1) {
        calendarMonth = 12;
        calendarYear--;
    }
    loadCalendar();
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
    const filterNote = consultant
        ? ` · Consulente: ${consultant}`
        : '';
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

    chartFollowUp = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Totali', 'Risposte', 'Appuntamenti', 'Abbandonati'],
            datasets: [{
                label: 'Follow-Up',
                data: [stats.total, stats.responded, stats.appointments, stats.abandoned],
                backgroundColor: [
                    'rgba(33, 150, 243, 0.7)',
                    'rgba(0, 200, 83, 0.7)',
                    'rgba(240, 192, 64, 0.7)',
                    'rgba(255, 68, 68, 0.7)'
                ],
                borderColor: [
                    '#2196f3',
                    '#00c853',
                    '#f0c040',
                    '#ff4444'
                ],
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { color: '#888' },
                    grid: { color: '#2a2d3e' }
                },
                y: {
                    ticks: { color: '#888' },
                    grid: { color: '#2a2d3e' },
                    beginAtZero: true
                }
            }
        }
    });
}

function renderWaitingChart(stats) {
    const ctx = document.getElementById('chartWaiting').getContext('2d');
    if (chartWaiting) chartWaiting.destroy();

    chartWaiting = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['In Attesa', 'Richiamati', 'Appuntamento', 'Interessati', 'Chiusi'],
            datasets: [{
                data: [
                    stats.waiting,
                    stats.called,
                    stats.appointments,
                    stats.interested,
                    stats.closed
                ],
                backgroundColor: [
                    'rgba(33, 150, 243, 0.7)',
                    'rgba(255, 152, 0, 0.7)',
                    'rgba(240, 192, 64, 0.7)',
                    'rgba(0, 200, 83, 0.7)',
                    'rgba(156, 39, 176, 0.7)'
                ],
                borderColor: [
                    '#2196f3',
                    '#ff9800',
                    '#f0c040',
                    '#00c853',
                    '#9c27b0'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#888', font: { size: 11 } }
                }
            }
        }
    });
}

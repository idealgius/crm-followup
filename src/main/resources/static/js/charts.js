let chartFollowUp = null;
let chartWaiting = null;
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth() + 1;
let calendarDays = {};
let recallCalendarYear = new Date().getFullYear();
let recallCalendarMonth = new Date().getMonth() + 1;
let recallEntries = [];
let recallFollowUpCalendarYear = new Date().getFullYear();
let recallFollowUpCalendarMonth = new Date().getMonth() + 1;
let recallFollowUpCalendarDays = {};

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
    CLOSED: 'Chiusi',
    FAILED: 'Falliti'
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

        // FIX: recallEntries deve essere popolato PRIMA di renderWaitingChart,
        // che ora lo usa per calcolare "Falliti" — prima veniva assegnato
        // dopo, quindi al primo caricamento pagina risultava sempre vuoto e
        // "Falliti" mostrava sempre 0.
        if (recallRes.ok) {
            recallEntries = await recallRes.json();
            renderRecallCalendar();
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

        loadRecallFollowUpCalendar();
        loadDailyReport();

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
        const clickable = entries.length > 0
            ? ` onclick="openRecallCalendarDay('${dateStr}')" style="cursor:pointer;${bgStyle}${borderStyle}"`
            : ` style="${bgStyle}${borderStyle}"`;
        html += `<button type="button" class="cal-day${todayClass}"${clickable} ${title2}>${day}${entries.length > 0 ? `<span style="display:block;font-size:9px;font-weight:900">${entries.length}</span>` : ''}</button>`;
    }

    container.innerHTML = html;
}

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

// ===== CALENDARIO RECALL FOLLOW-UP =====
async function loadRecallFollowUpCalendar() {
    try {
        const res = await fetch(`/api/recall-followups/calendar?year=${recallFollowUpCalendarYear}&month=${recallFollowUpCalendarMonth}`);
        if (!res.ok) return;
        const data = await res.json();
        recallFollowUpCalendarDays = data.days || {};
        renderRecallFollowUpCalendar();
    } catch (err) {
        console.error('Errore caricamento calendario recall follow-up:', err);
    }
}

function changeRecallFollowUpCalendarMonth(delta) {
    recallFollowUpCalendarMonth += delta;
    if (recallFollowUpCalendarMonth > 12) { recallFollowUpCalendarMonth = 1; recallFollowUpCalendarYear++; }
    else if (recallFollowUpCalendarMonth < 1) { recallFollowUpCalendarMonth = 12; recallFollowUpCalendarYear--; }
    loadRecallFollowUpCalendar();
}

function renderRecallFollowUpCalendar() {
    const container = document.getElementById('recallFollowUpCalendar');
    const title = document.getElementById('recallFollowUpCalendarTitle');
    if (!container || !title) return;

    title.textContent = `Calendario Recall Follow Up — ${MONTH_NAMES[recallFollowUpCalendarMonth - 1]} ${recallFollowUpCalendarYear}`;

    const firstDay = new Date(recallFollowUpCalendarYear, recallFollowUpCalendarMonth - 1, 1);
    const daysInMonth = new Date(recallFollowUpCalendarYear, recallFollowUpCalendarMonth, 0).getDate();
    let startWeekday = firstDay.getDay();
    startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;

    const today = new Date().toISOString().split('T')[0];

    const weekdays = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
    let html = weekdays.map(d => `<div class="cal-weekday">${d}</div>`).join('');

    for (let i = 0; i < startWeekday; i++) {
        html += '<div class="cal-day cal-day-empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${recallFollowUpCalendarYear}-${String(recallFollowUpCalendarMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const count = recallFollowUpCalendarDays[dateStr] || 0;
        const todayClass = dateStr === today ? ' cal-day-today' : '';
        const style = count > 0 ? 'background:rgba(155,89,182,0.22);border-color:#9b59b6;cursor:pointer' : '';
        const onclick = count > 0 ? ` onclick="openRecallFollowUpDay('${dateStr}')"` : '';
        html += `<button type="button" class="cal-day${todayClass}" style="${style}"${onclick}>${day}${count > 0 ? `<span style="display:block;font-size:9px;font-weight:900">${count}</span>` : ''}</button>`;
    }

    container.innerHTML = html;
}

// Etichette/icone tentativo per step — stesso ordine fisso definito da
// RecallFollowUpService: Step1 Call/Call, Step2 Call/Whatsapp, Step3 Call/Call.
const RECALL_FU_CHANNEL_LABEL = { CALL: '📞 Chiamata', WHATSAPP: '💬 Whatsapp', EMAIL: '✉️ Email' };
const RECALL_FU_SLOT_LABEL = { MORNING: 'Mattina', AFTERNOON: 'Pomeriggio' };

async function openRecallFollowUpDay(dateStr) {
    try {
        const res = await fetch(`/api/recall-followups/by-date?date=${dateStr}`);
        if (!res.ok) return;
        const clients = await res.json();
        if (clients.length === 0) return;

        const modal = document.getElementById('statDetailModal');
        const list = document.getElementById('statDetailList');
        const title = document.getElementById('statDetailTitle');
        if (!modal || !list || !title) return;

        title.textContent = `Recall Follow Up — ${formatDateITChart(dateStr)} (${clients.length})`;
        list.innerHTML = clients.map(c => renderRecallFollowUpCard(c)).join('');
        modal.style.display = 'flex';
    } catch (err) {
        console.error('Errore caricamento recall follow-up del giorno:', err);
    }
}

function renderRecallFollowUpCard(c) {
    const attemptsHtml = c.attempts.map(a => {
        const label = `${RECALL_FU_CHANNEL_LABEL[a.channel] || a.channel}${a.scheduledSlot ? ' · ' + RECALL_FU_SLOT_LABEL[a.scheduledSlot] : ''}`;
        const answered = a.outcome === 'ANSWERED';
        const noAnswer = a.outcome === 'NO_ANSWER';
        return `
        <div style="flex:1;min-width:160px;border:1px solid var(--border);border-radius:8px;padding:8px">
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">${label}</div>
            <div style="display:flex;gap:5px">
                <button class="btn-small btn-green" style="${answered ? 'box-shadow:0 0 8px rgba(0,200,83,0.6)' : ''}"
                    onclick="updateRecallFollowUpAttempt(${a.id}, '${answered ? 'PENDING' : 'ANSWERED'}', '${c.id}')">${answered ? '✓' : '✅'}</button>
                <button class="btn-small btn-red" style="${noAnswer ? 'box-shadow:0 0 8px rgba(255,61,61,0.6)' : ''}"
                    onclick="updateRecallFollowUpAttempt(${a.id}, '${noAnswer ? 'PENDING' : 'NO_ANSWER'}', '${c.id}')">${noAnswer ? '✓' : '❌'}</button>
            </div>
        </div>`;
    }).join('');

    const statusColor = c.status === 'RISPOSTO' ? '#00c853' : c.status === 'FALLITO' ? '#ff3d3d' : '#9b59b6';

    return `
    <div class="followup-card stat-detail-card" style="cursor:default">
        <div class="followup-header" style="margin-bottom:10px">
            <div>
                <div class="followup-name">${c.customer.fullName}</div>
                <div class="followup-meta">
                    ${c.customer.email ? '✉️ ' + c.customer.email : ''}
                    ${c.customer.phone ? (c.customer.email ? ' · ' : '') + '📞 ' + c.customer.phone : ''}
                    ${c.consultantName ? ' · 🧑‍💼 ' + c.consultantName : ''}
                    ${c.trattativaLink ? ` · <a href="${c.trattativaLink}" target="_blank" rel="noopener" style="color:#4a90d9">📎 Trattativa</a>` : ''}
                </div>
            </div>
            <span class="status-badge" style="background:${statusColor}22;color:${statusColor}">STEP ${c.currentStep} · ${c.status}</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${attemptsHtml}</div>
        <textarea class="input-field" placeholder="Note..." style="font-size:12px;padding:8px"
            onblur="saveRecallFollowUpNotes(${c.id}, this.value)">${c.notes || ''}</textarea>
    </div>`;
}

async function updateRecallFollowUpAttempt(attemptId, outcome, dateStr) {
    try {
        const res = await fetch(`/api/recall-followups/steps/${attemptId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ outcome })
        });
        if (!res.ok) {
            const data = await res.json().catch(() => null);
            alert(data?.error || 'Non autorizzato');
            return;
        }
        loadRecallFollowUpCalendar();
        // Ricarica la lista del giorno aperto per riflettere subito
        // l'eventuale avanzamento allo step successivo o la chiusura.
        const title = document.getElementById('statDetailTitle');
        if (title && title.textContent.includes('Recall Follow Up')) {
            const currentDate = title.textContent.match(/(\d{2}\/\d{2}\/\d{4})/);
            if (currentDate) {
                const [d, m, y] = currentDate[1].split('/');
                openRecallFollowUpDay(`${y}-${m}-${d}`);
            }
        }
    } catch (err) {
        console.error('Errore aggiornamento tentativo:', err);
    }
}

async function saveRecallFollowUpNotes(id, notes) {
    try {
        await fetch(`/api/recall-followups/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes })
        });
    } catch (err) {
        console.error('Errore salvataggio note recall follow-up:', err);
    }
}

// ===== REPORT LAVORO GIORNALIERO =====
const REPORT_TYPE_LABEL = { FOLLOW_UP: '📋 Follow-up', RECALL: '🔔 Recall', RECALL_FOLLOW_UP: '🔁 Recall Follow-up' };

function resetDailyReport() {
    document.getElementById('reportFrom').value = '';
    document.getElementById('reportTo').value = '';
    loadDailyReport();
}

async function loadDailyReport() {
    const from = document.getElementById('reportFrom')?.value || '';
    const to = document.getElementById('reportTo')?.value || '';
    let qs = '';
    if (from) qs += `from=${from}`;
    if (to) qs += `${qs ? '&' : ''}to=${to}`;

    try {
        const res = await fetch(`/api/report/daily?${qs}`);
        if (!res.ok) return;
        const data = await res.json();
        renderDailyReport(data);
    } catch (err) {
        console.error('Errore caricamento report:', err);
    }
}

function renderDailyReport(data) {
    document.getElementById('reportTotal').textContent = data.total;

    const summary = document.getElementById('reportSummary');
    const byType = data.byType || {};
    summary.innerHTML = Object.entries(REPORT_TYPE_LABEL).map(([key, label]) => `
        <span style="font-size:12px;background:var(--step-bg);border:1px solid var(--border);padding:6px 12px;border-radius:20px">
            ${label}: <strong>${byType[key] || 0}</strong>
        </span>
    `).join('');

    const tbody = document.getElementById('reportTableBody');
    if (!data.rows || data.rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-secondary)">Nessuna operazione nel periodo</td></tr>`;
        return;
    }
    tbody.innerHTML = data.rows.map(r => `
        <tr>
            <td>${REPORT_TYPE_LABEL[r.tipo] || r.tipo}</td>
            <td>${r.cliente}</td>
            <td>${r.consulente}</td>
            <td>${r.esito}</td>
            <td>${r.operatore}</td>
            <td>${formatDateTime(r.orario)}</td>
        </tr>
    `).join('');
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

    // NUOVO: oltre al totale, mostra quanti hanno già risposto, quanti sono
    // stati abbandonati, e quanti restano ancora da lavorare (il calcolo
    // richiesto: totale - risposto - abbandonati).
    const responded = items.filter(fu => fu.status === 'RESPONDED').length;
    const abandoned = items.filter(fu => fu.status === 'ABANDONED').length;
    const remaining = items.length - responded - abandoned;

    list.innerHTML = `
        <div class="stat-detail-meta">
            ${items.length} risultati · ${rangeNote}${filterNote}<br>
            <span style="font-size:11px;opacity:0.85">✅ ${responded} risposti &nbsp;·&nbsp; ❌ ${abandoned} abbandonati &nbsp;·&nbsp; ⏳ ${remaining} rimanenti</span>
        </div>
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
                            <span class="status-badge status-${e.status}">${WAITING_STATUS_LABELS[e.status] || e.status}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        `;
    }
    modal.style.display = 'flex';
}

function renderFollowUpChart(stats, targetCanvasId) {
    const ctx = document.getElementById(targetCanvasId || 'chartFollowUp').getContext('2d');
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
    return chartFollowUp;
}

function renderWaitingChart(stats, targetCanvasId) {
    const ctx = document.getElementById(targetCanvasId || 'chartWaiting').getContext('2d');
    if (chartWaiting) chartWaiting.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const legendColor = isDark ? '#8a8faa' : '#555';

    const labels = ['In Attesa', 'Richiamati', 'Appuntamento', 'Interessati', 'Chiusi', 'Falliti'];
    const statuses = ['WAITING', 'CALLED', 'APPOINTMENT', 'INTERESTED', 'CLOSED', 'FAILED'];
    // FIX: stats.failed potrebbe non essere calcolato lato server (endpoint
    // /api/stats/waiting non verificato) — lo calcolo qui direttamente da
    // recallEntries, già caricato e sicuramente coerente con quello che il
    // click sulla fetta mostrerà (stessa fonte dati).
    const failedCount = stats.failed || recallEntries.filter(e => e.status === 'FAILED').length;
    const dataValues = [stats.waiting, stats.called, stats.appointments, stats.interested, stats.closed, failedCount];
    const colors = ['#2196f3','#ff9800','#f0c040','#00c853','#9c27b0','#ff3d3d'];
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
    return chartWaiting;
}
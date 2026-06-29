let contactLogs = [];
let contactLogsFiltered = [];
let contactCalendarYear = new Date().getFullYear();
let contactCalendarMonth = new Date().getMonth() + 1;
let selectedSede = '';
let selectedAcquisto = '';
let contactChartByOperator = null;
let contactChartSede = null;
let contactChartAcquisto = null;

const CATEGORY_COLORS = {
    'Info Vendita': '#1a4080',
    'Info Noleggio': '#00c853',
    'Service': '#f0c040',
    'Info Acquisto effettuato': '#4a90d9',
    'Pratica Leasing': '#7c4dff',
    'Pratica Finanziamento': '#ff9800',
    'Amministrazione': '#00bcd4',
    'Info + Appuntamento': '#e91e63',
    'Altro': '#8a8faa'
};

const MONTH_NAMES_IT = [
    'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
    'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'
];

const DAY_NAMES_SHORT = ['Lun','Mar','Mer','Gio','Ven','Sab'];

const OPERATOR_COLORS = [
    '#1a4080','#00c853','#f0c040','#e91e63','#7c4dff',
    '#ff9800','#00bcd4','#ff3d3d','#4a90d9','#8a8faa'
];

// ===== UTILITY =====
function parseLocalDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function loadContactLogs(from, to, restoreDayView) {
    try {
        let url = '/api/contacts';
        if (from && to) url += `?from=${from}&to=${to}`;
        const res = await fetch(url);
        if (!res.ok) return;
        contactLogs = await res.json();
        populateOperatorFilter();
        applyContactFilters(restoreDayView);
    } catch (err) {
        console.error('Errore caricamento contatti:', err);
    }
}

function populateOperatorFilter() {
    const select = document.getElementById('contactOperatorFilter');
    if (!select) return;
    const current = select.value;
    const operators = [...new Set(contactLogs.map(l => l.user.fullName))].sort();
    select.innerHTML = '<option value="">Tutti gli operatori</option>' +
        operators.map(op => `<option value="${op}" ${op === current ? 'selected' : ''}>${op}</option>`).join('');
}

function applyContactFilters(restoreDayView) {
    const operator = document.getElementById('contactOperatorFilter')?.value || '';
    contactLogsFiltered = operator
        ? contactLogs.filter(l => l.user.fullName === operator)
        : [...contactLogs];

    if (restoreDayView) {
        showDayView(restoreDayView);
    } else {
        renderContactLogs(contactLogsFiltered);
    }
    renderContactCalendar();
    renderContactChartByOperator();
    renderContactStatsFromLogs(contactLogsFiltered);
    renderContactChartFromLogs(contactLogsFiltered);
    renderChartAppuntamentiSede(contactLogsFiltered);
    renderChartInfoAcquisto(contactLogsFiltered);
}

// ===== RESET FILTRI =====
function showContactResetBtn() {
    const btn = document.getElementById('contactResetBtn');
    if (btn && currentUser?.role !== 'UTENTE') btn.style.display = 'inline-block';
}

function resetContactFilters() {
    const today = todayStr();
    const firstDay = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
    })();
    document.getElementById('contactFrom').value = firstDay;
    document.getElementById('contactTo').value = today;
    const op = document.getElementById('contactOperatorFilter');
    if (op) op.value = '';
    currentDayView = null;
    const btn = document.getElementById('contactResetBtn');
    if (btn) btn.style.display = 'none';
    loadContactLogs(firstDay, today);
}

// ===== STATS =====
function renderContactStatsFromLogs(logs) {
    const total = logs.length;
    const byCategory = {};
    logs.forEach(log => {
        byCategory[log.category] = (byCategory[log.category] || 0) + 1;
    });

    const infoVendita = (byCategory['Info Vendita'] || 0) + (byCategory['Info + Appuntamento'] || 0);
    const infoNoleggio = byCategory['Info Noleggio'] || 0;
    const service = byCategory['Service'] || 0;

    const el = id => document.getElementById(id);
    if (el('statContactTotal')) el('statContactTotal').textContent = total;
    if (el('statInfoVendita')) el('statInfoVendita').textContent = (total > 0 ? Math.round(infoVendita * 1000 / total) / 10 : 0) + '%';
    if (el('statInfoNoleggio')) el('statInfoNoleggio').textContent = (total > 0 ? Math.round(infoNoleggio * 1000 / total) / 10 : 0) + '%';
    if (el('statService')) el('statService').textContent = (total > 0 ? Math.round(service * 1000 / total) / 10 : 0) + '%';
}

let contactChart = null;

function renderContactChartFromLogs(logs) {
    const ctx = document.getElementById('chartContacts');
    if (!ctx) return;
    if (contactChart) contactChart.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const byCategory = {};
    logs.forEach(log => {
        const cat = log.category === 'Info + Appuntamento' ? 'Info Vendita' : log.category;
        byCategory[cat] = (byCategory[cat] || 0) + 1;
    });

    const total = logs.length;
    const labels = Object.keys(byCategory);
    const data = Object.values(byCategory);
    const colors = labels.map(l => CATEGORY_COLORS[l] || '#8a8faa');

    contactChart = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: isDark ? '#0d0f1a' : '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: isDark ? '#8a8faa' : '#000000',
                        font: { size: 11 },
                        padding: 12,
                        generateLabels: chart => {
                            const d = chart.data;
                            return d.labels.map((label, i) => {
                                const val = d.datasets[0].data[i];
                                const pct = total > 0 ? Math.round(val * 1000 / total) / 10 : 0;
                                return {
                                    text: `${label}: ${val} (${pct}%)`,
                                    fillStyle: d.datasets[0].backgroundColor[i],
                                    strokeStyle: d.datasets[0].backgroundColor[i],
                                    lineWidth: 0,
                                    index: i
                                };
                            });
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const val = ctx.raw;
                            const pct = total > 0 ? Math.round(val * 1000 / total) / 10 : 0;
                            return ` ${ctx.label}: ${val} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ===== GRAFICO APPUNTAMENTI PER SEDE =====
function renderChartAppuntamentiSede(logs) {
    const ctx = document.getElementById('chartAppuntamentiSede');
    if (!ctx) return;
    if (contactChartSede) contactChartSede.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const sedi = ['Agnano', 'Casamarciano', 'Salerno'];
    const counts = { 'Agnano': 0, 'Casamarciano': 0, 'Salerno': 0 };

    logs.forEach(log => {
        if (log.category === 'Info + Appuntamento' && log.otherNote) {
            const sede = log.otherNote.trim();
            if (counts[sede] !== undefined) counts[sede]++;
        }
    });

    const total = sedi.reduce((a, s) => a + counts[s], 0);
    const textColor = isDark ? '#8a8faa' : '#555555';
    const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';

    contactChartSede = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: sedi,
            datasets: [{
                label: 'Appuntamenti',
                data: sedi.map(s => counts[s]),
                backgroundColor: ['#e91e6399', '#1a408099', '#00c85399'],
                borderColor: ['#e91e63', '#1a4080', '#00c853'],
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const val = ctx.raw;
                            const pct = total > 0 ? Math.round(val * 1000 / total) / 10 : 0;
                            return ` ${val} appuntamenti (${pct}%)`;
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { color: textColor, font: { size: 12, weight: '700' } }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor } }
            }
        }
    });
}

// ===== GRAFICO INFO ACQUISTO EFFETTUATO =====
function renderChartInfoAcquisto(logs) {
    const ctx = document.getElementById('chartInfoAcquisto');
    if (!ctx) return;
    if (contactChartAcquisto) contactChartAcquisto.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const tipologie = ['Info Consegna', 'Ritardo Consegna', 'Info Documentazione'];
    const counts = { 'Info Consegna': 0, 'Ritardo Consegna': 0, 'Info Documentazione': 0 };

    logs.forEach(log => {
        if (log.category === 'Info Acquisto effettuato' && log.otherNote) {
            const tipo = log.otherNote.trim();
            if (counts[tipo] !== undefined) counts[tipo]++;
        }
    });

    const total = tipologie.reduce((a, t) => a + counts[t], 0);
    const textColor = isDark ? '#8a8faa' : '#555555';
    const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';

    contactChartAcquisto = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: tipologie,
            datasets: [{
                label: 'Contatti',
                data: tipologie.map(t => counts[t]),
                backgroundColor: ['#4a90d999', '#ff3d3d99', '#00bcd499'],
                borderColor: ['#4a90d9', '#ff3d3d', '#00bcd4'],
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const val = ctx.raw;
                            const pct = total > 0 ? Math.round(val * 1000 / total) / 10 : 0;
                            return ` ${val} contatti (${pct}%)`;
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { color: textColor, font: { size: 11, weight: '700' } }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor } }
            }
        }
    });
}

// ===== EXPORT EXCEL =====
function exportContactsExcel() {
    if (!contactLogsFiltered || contactLogsFiltered.length === 0) {
        alert('Nessun dato da esportare');
        return;
    }

    const total = contactLogsFiltered.length;

    // Calcola percentuale per categoria
    const byCategory = {};
    contactLogsFiltered.forEach(log => {
        const cat = log.category === 'Info + Appuntamento' ? 'Info Vendita' : log.category;
        byCategory[cat] = (byCategory[cat] || 0) + 1;
    });

    // Calcola percentuale per operatore
    const byOperator = {};
    contactLogsFiltered.forEach(log => {
        byOperator[log.user.fullName] = (byOperator[log.user.fullName] || 0) + 1;
    });

    // Calcola sede appuntamenti
    const bySede = { 'Agnano': 0, 'Casamarciano': 0, 'Salerno': 0 };
    contactLogsFiltered.forEach(log => {
        if (log.category === 'Info + Appuntamento' && log.otherNote && bySede[log.otherNote.trim()] !== undefined) {
            bySede[log.otherNote.trim()]++;
        }
    });

    // Calcola info acquisto
    const byAcquisto = { 'Info Consegna': 0, 'Ritardo Consegna': 0, 'Info Documentazione': 0 };
    contactLogsFiltered.forEach(log => {
        if (log.category === 'Info Acquisto effettuato' && log.otherNote && byAcquisto[log.otherNote.trim()] !== undefined) {
            byAcquisto[log.otherNote.trim()]++;
        }
    });

    const wb = XLSX.utils.book_new();

    // ===== FOGLIO 1: DATI COMPLETI =====
    const rows = contactLogsFiltered.map(log => {
        const catForPct = log.category === 'Info + Appuntamento' ? 'Info Vendita' : log.category;
        const catCount = byCategory[catForPct] || 0;
        const catPct = total > 0 ? Math.round(catCount * 1000 / total) / 10 : 0;
        const opCount = byOperator[log.user.fullName] || 0;
        const opPct = total > 0 ? Math.round(opCount * 1000 / total) / 10 : 0;

        return {
            'Data': log.contactDate.split('T')[0],
            'Orario': log.contactDate.split('T')[1].substring(0, 5),
            'Categoria': log.category,
            'Dettaglio': log.otherNote || '',
            'Operatore': log.user.fullName,
            'Ruolo': log.user.role,
            '% Categoria': catPct + '%',
            'N. per Categoria': catCount,
            '% Operatore': opPct + '%',
            'N. per Operatore': opCount
        };
    });

    const ws1 = XLSX.utils.json_to_sheet(rows);
    ws1['!cols'] = [
        { wch: 12 }, { wch: 8 }, { wch: 25 }, { wch: 25 },
        { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 16 },
        { wch: 14 }, { wch: 16 }
    ];
    XLSX.utils.book_append_sheet(wb, ws1, 'Dati Registro');

    // ===== FOGLIO 2: RIEPILOGO CON GRAFICI =====
    const ws2Data = [];

    ws2Data.push({ 'Sezione': '=== DISTRIBUZIONE CATEGORIE ===', 'Valore': '', 'Numero': '', 'Percentuale': '' });
    Object.entries(byCategory).sort((a,b) => b[1]-a[1]).forEach(([cat, cnt]) => {
        ws2Data.push({
            'Sezione': cat,
            'Valore': cat,
            'Numero': cnt,
            'Percentuale': (total > 0 ? Math.round(cnt * 1000 / total) / 10 : 0) + '%'
        });
    });
    ws2Data.push({ 'Sezione': 'TOTALE', 'Valore': '', 'Numero': total, 'Percentuale': '100%' });

    ws2Data.push({ 'Sezione': '', 'Valore': '', 'Numero': '', 'Percentuale': '' });
    ws2Data.push({ 'Sezione': '=== CHIAMATE PER OPERATORE ===', 'Valore': '', 'Numero': '', 'Percentuale': '' });
    Object.entries(byOperator).sort((a,b) => b[1]-a[1]).forEach(([op, cnt]) => {
        ws2Data.push({
            'Sezione': op,
            'Valore': op,
            'Numero': cnt,
            'Percentuale': (total > 0 ? Math.round(cnt * 1000 / total) / 10 : 0) + '%'
        });
    });

    ws2Data.push({ 'Sezione': '', 'Valore': '', 'Numero': '', 'Percentuale': '' });
    ws2Data.push({ 'Sezione': '=== APPUNTAMENTI PER SEDE ===', 'Valore': '', 'Numero': '', 'Percentuale': '' });
    const totalSede = Object.values(bySede).reduce((a,b) => a+b, 0);
    Object.entries(bySede).forEach(([sede, cnt]) => {
        ws2Data.push({
            'Sezione': sede,
            'Valore': sede,
            'Numero': cnt,
            'Percentuale': (totalSede > 0 ? Math.round(cnt * 1000 / totalSede) / 10 : 0) + '%'
        });
    });

    ws2Data.push({ 'Sezione': '', 'Valore': '', 'Numero': '', 'Percentuale': '' });
    ws2Data.push({ 'Sezione': '=== INFO ACQUISTO EFFETTUATO ===', 'Valore': '', 'Numero': '', 'Percentuale': '' });
    const totalAcquisto = Object.values(byAcquisto).reduce((a,b) => a+b, 0);
    Object.entries(byAcquisto).forEach(([tipo, cnt]) => {
        ws2Data.push({
            'Sezione': tipo,
            'Valore': tipo,
            'Numero': cnt,
            'Percentuale': (totalAcquisto > 0 ? Math.round(cnt * 1000 / totalAcquisto) / 10 : 0) + '%'
        });
    });

    const ws2 = XLSX.utils.json_to_sheet(ws2Data);
    ws2['!cols'] = [{ wch: 35 }, { wch: 30 }, { wch: 12 }, { wch: 14 }];

    // Grafici Excel nativi — definiti come chart objects nel workbook
    // SheetJS CE non supporta grafici nativi, ma strutturiamo i dati
    // in modo ottimale per creare pivot/grafici manualmente in Excel

    XLSX.utils.book_append_sheet(wb, ws2, 'Riepilogo Statistiche');

    const from = document.getElementById('contactFrom')?.value || '';
    const to = document.getElementById('contactTo')?.value || '';
    const filename = `registro_contatti_${from}_${to}.xlsx`;
    XLSX.writeFile(wb, filename);
}

// ===== VISTA ELENCO GIORNO =====
let currentDayView = null;

function showDayView(date) {
    currentDayView = date;
    const container = document.getElementById('contactLogsList');
    const items = contactLogsFiltered.filter(l => l.contactDate.split('T')[0] === date);

    renderContactStatsFromLogs(items);
    renderContactChartFromLogs(items);
    renderChartAppuntamentiSede(items);
    renderChartInfoAcquisto(items);

    container.innerHTML = `
        <div style="margin-bottom:16px;display:flex;align-items:center;gap:12px">
            <button class="btn-secondary" onclick="closeDayView()" style="padding:8px 16px;font-size:12px">← INDIETRO</button>
            <span style="font-size:16px;font-weight:800;color:var(--text-primary)">${formatDateIT(date)}</span>
            <button class="btn-small btn-secondary" onclick="printDay('${date}')" style="margin-left:auto">🖨️ STAMPA</button>
        </div>
        <div class="contact-day-section">
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
                        ${items.length > 0
                            ? items.map(log => renderContactRow(log)).join('')
                            : '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:20px">Nessun contatto</td></tr>'
                        }
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function closeDayView() {
    currentDayView = null;
    renderContactLogs(contactLogsFiltered);
    renderContactStatsFromLogs(contactLogsFiltered);
    renderContactChartFromLogs(contactLogsFiltered);
    renderChartAppuntamentiSede(contactLogsFiltered);
    renderChartInfoAcquisto(contactLogsFiltered);
}

// ===== RENDER TREE =====
function getISOWeekMonday(dateStr) {
    const d = parseLocalDate(dateStr);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - (day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
}

function renderContactLogs(logs) {
    const container = document.getElementById('contactLogsList');
    if (!container) return;

    if (logs.length === 0) {
        container.innerHTML = `<div class="empty-state"><div style="font-size:40px">📞</div><p>Nessun contatto registrato</p></div>`;
        return;
    }

    const tree = {};
    logs.forEach(log => {
        const date = log.contactDate.split('T')[0];
        const d = parseLocalDate(date);
        const year = d.getFullYear().toString();
        const month = d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
        const week = getWeekKey(date);

        if (!tree[year]) tree[year] = {};
        if (!tree[year][month]) tree[year][month] = {};
        if (!tree[year][month][week]) tree[year][month][week] = { days: {}, monday: getISOWeekMonday(date) };
        if (!tree[year][month][week].days[date]) tree[year][month][week].days[date] = [];
        tree[year][month][week].days[date].push(log);
    });

    const today = todayStr();

    container.innerHTML = Object.entries(tree).sort((a,b) => b[0]-a[0]).map(([year, months]) => {
        const yearKey = `year-${year}`;
        const yearCount = Object.values(months)
            .flatMap(w => Object.values(w))
            .flatMap(w => Object.values(w.days))
            .flat().length;

        return `
        <div class="contact-tree-section">
            <div class="contact-tree-header contact-tree-year" onclick="toggleTree('${yearKey}')">
                <span>📁 ${year} <span class="tree-count">${yearCount} contatti</span></span>
                <span class="folder-arrow" id="arrow-${yearKey}">▼</span>
            </div>
            <div id="body-${yearKey}">
                ${Object.entries(months).sort().map(([month, weeks]) => {
                    const monthKey = `month-${year}-${month.replace(/\s/g,'_')}`;
                    const monthCount = Object.values(weeks)
                        .flatMap(w => Object.values(w.days))
                        .flat().length;
                    return `
                    <div class="contact-tree-indent">
                        <div class="contact-tree-header contact-tree-month" onclick="toggleTree('${monthKey}')">
                            <span>📂 ${month} <span class="tree-count">${monthCount} contatti</span></span>
                            <span class="folder-arrow" id="arrow-${monthKey}">▼</span>
                        </div>
                        <div id="body-${monthKey}">
                            ${Object.entries(weeks).sort().map(([week, weekData]) => {
                                const weekKey = `week-${week.replace(/[\s—]/g,'_')}`;
                                const weekCount = Object.values(weekData.days).flat().length;
                                const todayMonday = getISOWeekMonday(today);
                                const isCurrentWeek = weekData.monday.getTime() === todayMonday.getTime();
                                return `
                                <div class="contact-tree-indent">
                                    <div class="contact-tree-header contact-tree-week" onclick="toggleTree('${weekKey}')">
                                        <span>🗓️ ${week} <span class="tree-count">${weekCount} contatti</span></span>
                                        <span class="folder-arrow" id="arrow-${weekKey}">▼</span>
                                    </div>
                                    <div id="body-${weekKey}" style="display:${isCurrentWeek ? 'block' : 'none'}">
                                        ${renderWeekDayCards(weekData.days, weekData.monday)}
                                    </div>
                                </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
        `;
    }).join('');
}

function renderWeekDayCards(days, monday) {
    const weekDates = [];
    for (let i = 0; i < 6; i++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        const y = day.getFullYear();
        const m = String(day.getMonth()+1).padStart(2,'0');
        const d = String(day.getDate()).padStart(2,'0');
        weekDates.push(`${y}-${m}-${d}`);
    }

    return `
        <div class="contact-day-cards-grid">
            ${weekDates.map((date, idx) => {
                const items = days[date] || [];
                const dayName = DAY_NAMES_SHORT[idx];
                const dayNum = parseLocalDate(date).getDate();
                const hasData = items.length > 0;
                const dominantColor = hasData ? getDominantColor(items) : null;
                const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
                const emptyBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
                const bgStyle = hasData
                    ? `background: ${dominantColor}22; border-color: ${dominantColor};`
                    : `background: ${emptyBg};`;

                return `
                <div class="contact-day-card ${hasData ? 'contact-day-card-active' : 'contact-day-card-empty'}"
                    style="${bgStyle}"
                    ${hasData ? `onclick="showDayView('${date}')"` : ''}>
                    <div class="contact-day-card-name">${dayName}</div>
                    <div class="contact-day-card-num" style="${hasData ? `color:${dominantColor}` : ''}">${dayNum}</div>
                    ${hasData ? `
                        <div class="contact-day-card-count">${items.length}</div>
                        <div class="contact-day-card-label">contatti</div>
                    ` : `
                        <div class="contact-day-card-empty-label">—</div>
                    `}
                </div>
                `;
            }).join('')}
        </div>
    `;
}

function getDominantColor(items) {
    const counts = {};
    items.forEach(log => {
        counts[log.category] = (counts[log.category] || 0) + 1;
    });
    const dominant = Object.entries(counts).sort((a,b) => b[1]-a[1])[0][0];
    return CATEGORY_COLORS[dominant] || '#1a4080';
}

function toggleTree(key) {
    const body = document.getElementById(`body-${key}`);
    const arrow = document.getElementById(`arrow-${key}`);
    if (body) {
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'block' : 'none';
        if (arrow) arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
    }
}

function renderContactRow(log) {
    const time = log.contactDate.split('T')[1].substring(0, 5);
    const isOwner = currentUser && log.user.id === currentUser.id;
    const isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'GESTORE');
    const isMod = currentUser && currentUser.role === 'MODERATORE';
    const targetIsAdmin = log.user.role === 'ADMIN' || log.user.role === 'GESTORE';
    const canEdit = isAdmin || isOwner || (isMod && !targetIsAdmin);

    const catClass = log.category.replace(/[\s+]/g, '_');

    return `
        <tr id="contact-row-${log.id}">
            <td style="font-weight:700;color:var(--text-primary);white-space:nowrap">${time}</td>
            <td>
                <span class="contact-category-badge cat-${catClass}">${log.category}</span>
                ${log.category === 'Info + Appuntamento' && log.otherNote ? `<span style="font-size:11px;background:rgba(233,30,99,0.1);color:#e91e63;padding:2px 8px;border-radius:8px;margin-left:6px">📍 ${log.otherNote}</span>` : ''}
                ${log.category === 'Info Acquisto effettuato' && log.otherNote ? `<span style="font-size:11px;background:rgba(74,144,217,0.1);color:#4a90d9;padding:2px 8px;border-radius:8px;margin-left:6px">📋 ${log.otherNote}</span>` : ''}
            </td>
            <td style="font-size:12px;color:var(--text-secondary)">${(log.category !== 'Info + Appuntamento' && log.category !== 'Info Acquisto effettuato') ? (log.otherNote || '—') : ''}</td>
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

function printDay(date) {
    const dayLogs = contactLogsFiltered.filter(l => l.contactDate.split('T')[0] === date);
    const win = window.open('', '_blank');
    win.document.write(`
        <html><head><title>Registro ${date}</title>
        <style>
            body { font-family: Arial, sans-serif; font-size: 12px; padding: 20px; }
            h2 { font-size: 16px; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
            th { background: #f0f0f0; font-weight: 700; font-size: 10px; text-transform: uppercase; }
            @page { margin: 15mm; }
        </style></head><body>
        <h2>Registro Contatti — ${formatDateIT(date)}</h2>
        <table>
            <thead><tr><th>Orario</th><th>Categoria</th><th>Dettaglio</th><th>Operatore</th></tr></thead>
            <tbody>
                ${dayLogs.map(log => `
                    <tr>
                        <td>${log.contactDate.split('T')[1].substring(0,5)}</td>
                        <td>${log.category}</td>
                        <td>${log.otherNote || '—'}</td>
                        <td>${log.user.fullName}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        </body></html>
    `);
    win.document.close();
    win.print();
}

// ===== CALENDARIO CONTATTI =====
function renderContactCalendar() {
    const container = document.getElementById('contactCalendar');
    const title = document.getElementById('contactCalendarTitle');
    if (!container || !title) return;

    title.textContent = `${MONTH_NAMES_IT[contactCalendarMonth - 1]} ${contactCalendarYear}`;

    const firstDay = new Date(contactCalendarYear, contactCalendarMonth - 1, 1);
    const daysInMonth = new Date(contactCalendarYear, contactCalendarMonth, 0).getDate();
    let startWeekday = firstDay.getDay();
    startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;

    const weekdays = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
    let html = weekdays.map(d => `<div class="cal-weekday">${d}</div>`).join('');

    for (let i = 0; i < startWeekday; i++) {
        html += '<div class="cal-day cal-day-empty"></div>';
    }

    const today = todayStr();
    const byDay = {};
    contactLogsFiltered.forEach(log => {
        const date = log.contactDate.split('T')[0];
        if (!byDay[date]) byDay[date] = [];
        byDay[date].push(log);
    });

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${contactCalendarYear}-${String(contactCalendarMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const items = byDay[dateStr] || [];
        const isToday = dateStr === today;
        let bgStyle = '';
        let borderStyle = '';
        if (items.length > 0) {
            const color = getDominantColor(items);
            bgStyle = `background:${color}33;`;
            borderStyle = `border-color:${color};`;
        }
        html += `<button type="button" class="cal-day ${isToday ? 'cal-day-today' : ''}"
            style="${bgStyle}${borderStyle}"
            onclick="showDayView('${dateStr}')">${day}</button>`;
    }

    container.innerHTML = html;
}

function changeContactCalendarMonth(delta) {
    contactCalendarMonth += delta;
    if (contactCalendarMonth > 12) { contactCalendarMonth = 1; contactCalendarYear++; }
    else if (contactCalendarMonth < 1) { contactCalendarMonth = 12; contactCalendarYear--; }
    renderContactCalendar();
}

// ===== GRAFICO OPERATORI =====
function renderContactChartByOperator() {
    const ctx = document.getElementById('chartContactsByOperator');
    if (!ctx) return;
    if (contactChartByOperator) contactChartByOperator.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const byOperator = {};
    contactLogs.forEach(log => {
        const op = log.user.fullName;
        if (!byOperator[op]) byOperator[op] = 0;
        byOperator[op]++;
    });

    const total = Object.values(byOperator).reduce((a,b) => a+b, 0);
    const labels = Object.keys(byOperator);
    const data = labels.map(op => byOperator[op]);
    const colors = labels.map((_, i) => OPERATOR_COLORS[i % OPERATOR_COLORS.length]);

    contactChartByOperator = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data, backgroundColor: colors.map(c => c + 'bb'), borderColor: colors, borderWidth: 2 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: isDark ? '#8a8faa' : '#000000',
                        font: { size: 10 },
                        padding: 10,
                        generateLabels: chart => {
                            const d = chart.data;
                            return d.labels.map((label, i) => {
                                const val = d.datasets[0].data[i];
                                const pct = total > 0 ? Math.round(val * 1000 / total) / 10 : 0;
                                return {
                                    text: `${label}: ${val} (${pct}%)`,
                                    fillStyle: colors[i] + 'bb',
                                    strokeStyle: colors[i],
                                    lineWidth: 0,
                                    index: i
                                };
                            });
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const val = ctx.raw;
                            const pct = total > 0 ? Math.round(val * 1000 / total) / 10 : 0;
                            return ` ${ctx.label}: ${val} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ===== SEDE APPUNTAMENTO =====
function selectSede(sede) {
    selectedSede = sede;
    document.getElementById('contactAppuntamentoSede').value = sede;
    ['Agnano','Casamarciano','Salerno'].forEach(s => {
        const btn = document.getElementById(`sede-${s}`);
        if (btn) btn.classList.toggle('btn-sede-active', s === sede);
    });
}

// ===== TIPOLOGIA ACQUISTO =====
function selectAcquisto(tipo) {
    selectedAcquisto = tipo;
    document.getElementById('contactAcquistoTipo').value = tipo;
    ['InfoConsegna','RitardoConsegna','InfoDocumentazione'].forEach(k => {
        const btn = document.getElementById(`acquisto-${k}`);
        if (btn) btn.classList.remove('btn-sede-active');
    });
    const keyMap = {
        'Info Consegna': 'InfoConsegna',
        'Ritardo Consegna': 'RitardoConsegna',
        'Info Documentazione': 'InfoDocumentazione'
    };
    const btn = document.getElementById(`acquisto-${keyMap[tipo]}`);
    if (btn) btn.classList.add('btn-sede-active');
}

// ===== CRUD =====
async function createContactLog() {
    const category = document.getElementById('contactCategory').value;
    const otherNote = document.getElementById('contactOtherNote').value.trim();
    const dateVal = document.getElementById('contactDate').value;
    const timeVal = document.getElementById('contactTime').value;
    const sede = document.getElementById('contactAppuntamentoSede')?.value || '';
    const acquistoTipo = document.getElementById('contactAcquistoTipo')?.value || '';

    if (!category) { alert('Seleziona una categoria'); return; }
    if (!dateVal || !timeVal) { alert('Inserisci data e orario'); return; }
    if (category === 'Altro' && !otherNote) { alert('Inserisci la motivazione per "Altro"'); return; }
    if (category === 'Info + Appuntamento' && !sede) { alert('Seleziona la sede dell\'appuntamento'); return; }
    if (category === 'Info Acquisto effettuato' && !acquistoTipo) { alert('Seleziona la tipologia acquisto'); return; }

    const contactDate = `${dateVal}T${timeVal}:00`;
    const savedDayView = currentDayView || dateVal;
    let finalNote = otherNote;
    if (category === 'Info + Appuntamento') finalNote = sede;
    if (category === 'Info Acquisto effettuato') finalNote = acquistoTipo;

    try {
        const res = await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, otherNote: finalNote, contactDate })
        });
        if (!res.ok) { alert('Errore nella creazione'); return; }
        hideNewContactForm();
        const from = document.getElementById('contactFrom')?.value;
        const to = document.getElementById('contactTo')?.value;
        await loadContactLogs(from, to, savedDayView);
    } catch (err) {
        console.error('Errore creazione contatto:', err);
    }
}

async function deleteContactLog(id) {
    if (!confirm('Eliminare questo contatto?')) return;
    const savedDayView = currentDayView;
    try {
        await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
        const from = document.getElementById('contactFrom')?.value;
        const to = document.getElementById('contactTo')?.value;
        await loadContactLogs(from, to, savedDayView);
    } catch (err) {
        console.error('Errore eliminazione:', err);
    }
}

async function editContactLog(id) {
    const log = contactLogs.find(l => l.id === id);
    if (!log) return;

    const newCategory = prompt('Categoria:', log.category);
    if (!newCategory) return;
    const newNote = prompt('Note/Dettaglio (opzionale):', log.otherNote || '');
    const savedDayView = currentDayView;

    try {
        await fetch(`/api/contacts/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: newCategory, otherNote: newNote })
        });
        const from = document.getElementById('contactFrom')?.value;
        const to = document.getElementById('contactTo')?.value;
        await loadContactLogs(from, to, savedDayView);
    } catch (err) {
        console.error('Errore modifica:', err);
    }
}

function showNewContactForm() {
    const dateStr = currentDayView || todayStr();
    const now = new Date();
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
    document.getElementById('contactAppuntamentoRow').style.display = 'none';
    document.getElementById('contactAcquistoRow').style.display = 'none';
    document.getElementById('contactAppuntamentoSede').value = '';
    document.getElementById('contactAcquistoTipo').value = '';
    selectedSede = '';
    selectedAcquisto = '';
    ['Agnano','Casamarciano','Salerno'].forEach(s => {
        const btn = document.getElementById(`sede-${s}`);
        if (btn) btn.classList.remove('btn-sede-active');
    });
    ['InfoConsegna','RitardoConsegna','InfoDocumentazione'].forEach(k => {
        const btn = document.getElementById(`acquisto-${k}`);
        if (btn) btn.classList.remove('btn-sede-active');
    });
}

function onCategoryChange() {
    const cat = document.getElementById('contactCategory').value;
    document.getElementById('contactOtherNoteRow').style.display = cat === 'Altro' ? 'block' : 'none';
    document.getElementById('contactAppuntamentoRow').style.display = cat === 'Info + Appuntamento' ? 'block' : 'none';
    document.getElementById('contactAcquistoRow').style.display = cat === 'Info Acquisto effettuato' ? 'block' : 'none';

    if (cat !== 'Info + Appuntamento') {
        selectedSede = '';
        document.getElementById('contactAppuntamentoSede').value = '';
        ['Agnano','Casamarciano','Salerno'].forEach(s => {
            const btn = document.getElementById(`sede-${s}`);
            if (btn) btn.classList.remove('btn-sede-active');
        });
    }
    if (cat !== 'Info Acquisto effettuato') {
        selectedAcquisto = '';
        document.getElementById('contactAcquistoTipo').value = '';
        ['InfoConsegna','RitardoConsegna','InfoDocumentazione'].forEach(k => {
            const btn = document.getElementById(`acquisto-${k}`);
            if (btn) btn.classList.remove('btn-sede-active');
        });
    }
}

function printContactLogs() {
    window.print();
}

function getWeekKey(dateStr) {
    const d = parseLocalDate(dateStr);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - day);
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `Settimana ${weekNo} — ${d.getFullYear()}`;
}

function formatDateIT(dateStr) {
    const d = parseLocalDate(dateStr);
    return d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}
let promoAttive = [];
let promoEditingId = null;
let promoSelectedMarchi = [];
let promoFields = { richiestaPromo: null, propostaPromo: null, testDrive: null, appuntamento: null };
let promoChartsVisible = {};
let promoCharts = {};
let currentPromoId = null;

const MARCHE_PROMO = [
    'ALFA ROMEO', 'AUDI', 'BMW', 'BYD', 'CITROEN', 'CUPRA', 'DACIA', 'DR', 'DS',
    'EVO', 'FIAT', 'FORD', 'FERRARI', 'HYUNDAI', 'ICH-X', 'ICKX', 'INFINITI',
    'IVECO', 'JEEP', 'KIA', 'LAMBORGHINI', 'LANCIA', 'LAND ROVER', 'MAXUS',
    'MAZDA', 'MERCEDES-BENZ', 'MG', 'MINI', 'MASERATI', 'MITSUBISHI', 'NISSAN',
    'OPEL', 'PEUGEOT', 'PORSCHE', 'RENAULT', 'SAAB', 'SEAT', 'SKODA', 'SMART',
    'SPORTEQUIPE', 'SUZUKI', 'SWM', 'TIGER', 'TOYOTA', 'VOLKSWAGEN'
];

// ===== CARICA PROMO =====
async function loadPromo() {
    try {
        const [attiveRes, archivioRes] = await Promise.all([
            fetch('/api/promos/attive'),
            fetch('/api/promos/archivio')
        ]);
        if (attiveRes.ok) promoAttive = await attiveRes.json();
        renderPromoAttive();
        if (archivioRes.ok) {
            const archivio = await archivioRes.json();
            renderPromoArchivio(archivio);
        }
        // Aggiorna opzione nel form contatti
        updatePromoOptionInForm();
    } catch (err) { console.error('Errore caricamento promo:', err); }
}

function updatePromoOptionInForm() {
    const opt = document.getElementById('promoOption');
    if (!opt) return;
    opt.style.display = promoAttive.length > 0 ? 'block' : 'none';
}

// ===== RENDER PROMO ATTIVE =====
function renderPromoAttive() {
    const container = document.getElementById('promoAttiveList');
    if (!container) return;
    if (promoAttive.length === 0) {
        container.innerHTML = `<div class="empty-state"><div style="font-size:40px">🎯</div><p>Nessuna promo attiva al momento</p></div>`;
        return;
    }
    container.innerHTML = promoAttive.map(p => renderPromoCard(p, true)).join('');
}

function renderPromoArchivio(archivio) {
    const container = document.getElementById('promoArchivioList');
    if (!container) return;
    if (archivio.length === 0) {
        container.innerHTML = `<div style="color:var(--text-secondary);font-size:13px;padding:20px 0">Nessuna promo in archivio</div>`;
        return;
    }
    container.innerHTML = archivio.map(p => renderPromoCard(p, false)).join('');
}

function renderPromoCard(p, isAttiva) {
    const marchi = p.marchi ? p.marchi.split(',').map(m => m.trim()) : [];
    const modelli = p.modelli ? p.modelli.split('\n').filter(m => m.trim()) : [];
    const statoColor = p.stato === 'ATTIVA' ? '#00c853' : p.stato === 'SCADUTA' ? '#8a8faa' : '#ff3d3d';
    return `
    <div class="followup-card" style="margin-bottom:16px" id="promoCard-${p.id}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
            <div style="flex:1">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                    <span style="font-size:16px;font-weight:800;color:var(--text-primary)">${p.nome}</span>
                    <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:${statoColor}22;color:${statoColor}">${p.stato}</span>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
                    ${marchi.map(m => `<span style="font-size:11px;font-weight:700;background:rgba(26,64,128,0.15);color:#4a90d9;padding:3px 10px;border-radius:20px">🚗 ${m}</span>`).join('')}
                </div>
                ${modelli.length > 0 ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">📋 ${modelli.length} modelli configurati${p.consentiInserimentoManuale ? ' · Inserimento manuale attivo' : ''}</div>` : ''}
                <div style="font-size:12px;color:var(--text-secondary)">📅 ${p.dataInizio} → ${p.dataScadenza} ${p.createdBy ? '· 👤 ' + p.createdBy : ''}</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">
                ${isAttiva ? `
                    <button class="btn-small btn-blue" onclick="showPromoStats(${p.id})">📊 Statistiche</button>
                    <button class="btn-small btn-orange" onclick="editPromo(${p.id})">✏️ Modifica</button>
                    <button class="btn-small btn-red" onclick="annullaPromo(${p.id})">⛔ Annulla</button>
                ` : `
                    <button class="btn-small btn-blue" onclick="showPromoStats(${p.id})">📊 Statistiche</button>
                    <button class="btn-small btn-red" onclick="eliminaPromo(${p.id})">🗑️ Elimina</button>
                `}
            </div>
        </div>

        <!-- SEZIONE STATISTICHE (collassabile) -->
        <div id="promoStats-${p.id}" style="display:none;margin-top:20px;border-top:1px solid var(--border);padding-top:20px">
            <div id="promoStatsContent-${p.id}">
                <div style="color:var(--text-secondary);font-size:13px">Caricamento statistiche...</div>
            </div>
        </div>
    </div>`;
}

// ===== STATISTICHE PROMO =====
async function showPromoStats(promoId) {
    const statsDiv = document.getElementById(`promoStats-${promoId}`);
    if (!statsDiv) return;

    const isVisible = statsDiv.style.display !== 'none';
    if (isVisible) { statsDiv.style.display = 'none'; return; }
    statsDiv.style.display = 'block';

    try {
        const res = await fetch(`/api/promos/${promoId}/stats`);
        if (!res.ok) return;
        const stats = await res.json();
        renderPromoStats(promoId, stats);
    } catch (err) { console.error('Errore statistiche promo:', err); }
}

function renderPromoStats(promoId, stats) {
    const container = document.getElementById(`promoStatsContent-${promoId}`);
    if (!container) return;

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const legendColor = isDark ? '#c0c4d0' : '#333333';
    const textColor = isDark ? '#8a8faa' : '#555555';
    const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
    const total = stats.total;

    // Grafico toggle visibility
    const chartsId = `promoCharts-${promoId}`;

    container.innerHTML = `
        <!-- STATS CARDS -->
        <div class="stats-grid" style="margin-bottom:20px">
            <div class="stat-card blue"><div class="stat-label">TOTALE CONTATTI</div><div class="stat-value">${total}</div></div>
            <div class="stat-card gold"><div class="stat-label">APPUNTAMENTI</div><div class="stat-value">${stats.appuntamenti}</div></div>
            <div class="stat-card green"><div class="stat-label">RICHIESTA PROMO SÌ</div><div class="stat-value">${stats.richiestaPromoSi}</div></div>
            <div class="stat-card purple"><div class="stat-label">TEST DRIVE SÌ</div><div class="stat-value">${stats.testDriveSi}</div></div>
        </div>

        <!-- TOGGLE GRAFICI -->
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <button class="btn-secondary" onclick="togglePromoCharts('${promoId}')" style="padding:8px 16px;font-size:12px" id="toggleBtn-${promoId}">
                📊 Mostra Grafici
            </button>
        </div>

        <!-- GRAFICI (nascosti di default) -->
        <div id="${chartsId}" style="display:none;flex-wrap:wrap;gap:20px;margin-bottom:20px">
            ${Object.keys(stats.perModello).length > 0 ? `
            <div class="chart-card" style="min-width:300px;flex:1">
                <h3>MODELLI RICHIESTI</h3>
                <canvas id="chartPromoModelli-${promoId}" style="max-height:280px"></canvas>
            </div>` : ''}
            ${total > 0 ? `
            <div class="chart-card" style="min-width:280px;flex:1">
                <h3>RICHIESTE vs APPUNTAMENTI</h3>
                <canvas id="chartPromoApp-${promoId}" style="max-height:280px"></canvas>
            </div>
            <div class="chart-card" style="min-width:280px;flex:1">
                <h3>RICHIESTA PROMO</h3>
                <canvas id="chartPromoRichiesta-${promoId}" style="max-height:280px"></canvas>
            </div>` : ''}
        </div>

        <!-- ELENCO CONTATTI -->
        <div style="margin-top:16px">
            <h3 style="font-size:12px;font-weight:700;letter-spacing:1px;color:var(--text-secondary);margin-bottom:12px;text-transform:uppercase">ELENCO CONTATTI</h3>
            ${stats.elenco.length === 0 ? '<div style="color:var(--text-secondary);font-size:13px">Nessun contatto registrato per questa promo</div>' : `
            <div class="contact-table-wrapper">
                <table class="contact-table">
                    <thead><tr><th>Modello</th><th>Rich. Promo</th><th>Prop. Promo</th><th>Test Drive</th><th>Appuntamento</th><th>Sede</th></tr></thead>
                    <tbody>
                        ${stats.elenco.map(c => `
                        <tr>
                            <td style="font-weight:600">${c.modelloRichiesto || '—'}</td>
                            <td>${c.richiestaPromo ? '✅' : '❌'}</td>
                            <td>${c.propostaPromo ? '✅' : '❌'}</td>
                            <td>${c.testDrive ? '✅' : '❌'}</td>
                            <td>${c.appuntamento ? '✅' : '❌'}</td>
                            <td>${c.sedeAppuntamento || '—'}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`}
        </div>
    `;

    // Salva stats per quando si aprono i grafici
    if (!window.promoStatsCache) window.promoStatsCache = {};
    window.promoStatsCache[promoId] = { stats, isDark, legendColor, textColor, gridColor };
}

function togglePromoCharts(promoId) {
    const chartsDiv = document.getElementById(`promoCharts-${promoId}`);
    const btn = document.getElementById(`toggleBtn-${promoId}`);
    if (!chartsDiv) return;

    const isHidden = chartsDiv.style.display === 'none';
    if (isHidden) {
        chartsDiv.style.display = 'flex';
        btn.textContent = '📊 Nascondi Grafici';
        // Disegna grafici solo la prima volta
        if (!window.promoChartsDrawn) window.promoChartsDrawn = {};
        if (!window.promoChartsDrawn[promoId]) {
            window.promoChartsDrawn[promoId] = true;
            const cache = window.promoStatsCache?.[promoId];
            if (cache) drawPromoCharts(promoId, cache.stats, cache.isDark, cache.legendColor, cache.textColor, cache.gridColor);
        }
    } else {
        chartsDiv.style.display = 'none';
        btn.textContent = '📊 Mostra Grafici';
    }
}

function drawPromoCharts(promoId, stats, isDark, legendColor, textColor, gridColor) {
    const total = stats.total;

    // Grafico modelli richiesti (barre orizzontali)
    const ctxModelli = document.getElementById(`chartPromoModelli-${promoId}`);
    if (ctxModelli && Object.keys(stats.perModello).length > 0) {
        const sorted = Object.entries(stats.perModello).sort((a,b) => b[1]-a[1]);
        new Chart(ctxModelli.getContext('2d'), {
            type: 'bar',
            data: {
                labels: sorted.map(e => e[0]),
                datasets: [{ data: sorted.map(e => e[1]), backgroundColor: '#4a90d9cc', borderColor: '#4a90d9', borderWidth: 2, borderRadius: 6 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, ticks: { color: textColor }, grid: { color: gridColor } },
                    y: { ticks: { color: textColor, font: { size: 11, weight: '700' } }, grid: { display: false } }
                }
            }
        });
    }

    // Grafico richieste vs appuntamenti
    const ctxApp = document.getElementById(`chartPromoApp-${promoId}`);
    if (ctxApp && total > 0) {
        new Chart(ctxApp.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Totale contatti', 'Appuntamenti fissati'],
                datasets: [{ data: [total, stats.appuntamenti], backgroundColor: ['#1a408099','#e91e6399'], borderColor: ['#1a4080','#e91e63'], borderWidth: 2, borderRadius: 8 }]
            },
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: textColor }, grid: { display: false } },
                    y: { beginAtZero: true, ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor } }
                }
            }
        });
    }

    // Grafico richiesta promo (torta)
    const ctxRichiesta = document.getElementById(`chartPromoRichiesta-${promoId}`);
    if (ctxRichiesta && total > 0) {
        new Chart(ctxRichiesta.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Richiesta Sì', 'Richiesta No'],
                datasets: [{ data: [stats.richiestaPromoSi, stats.richiestaPromoNo], backgroundColor: ['#00c85399','#ff3d3d99'], borderColor: ['#00c853','#ff3d3d'], borderWidth: 2 }]
            },
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: legendColor, font: { size: 11 }, padding: 10, boxWidth: 12 }
                    }
                }
            }
        });
    }
}

// ===== FORM PROMO =====
function showNewPromoForm() {
    promoEditingId = null;
    document.getElementById('promoFormTitle').textContent = 'NUOVA PROMO';
    document.getElementById('promoSaveBtn').textContent = 'SALVA PROMO';
    document.getElementById('promoNome').value = '';
    document.getElementById('promoModelliInput').value = '';
    document.getElementById('promoDataInizio').value = '';
    document.getElementById('promoDataScadenza').value = '';
    document.getElementById('promoConsentiManuale').checked = true;
    promoSelectedMarchi = [];
    renderPromoMarchiButtons();
    document.getElementById('newPromoForm').style.display = 'block';
    document.getElementById('newPromoForm').scrollIntoView({ behavior: 'smooth' });
}

function hideNewPromoForm() {
    document.getElementById('newPromoForm').style.display = 'none';
    promoEditingId = null;
    promoSelectedMarchi = [];
}

function renderPromoMarchiButtons() {
    const container = document.getElementById('promoMarchiContainer');
    if (!container) return;
    container.innerHTML = MARCHE_PROMO.map(m => `
        <button type="button" class="btn-sede ${promoSelectedMarchi.includes(m) ? 'btn-sede-active' : ''}"
            onclick="toggleMarcaPromo('${m}')" style="font-size:11px;padding:6px 12px">${m}</button>
    `).join('');
    document.getElementById('promoMarchiSelected').value = promoSelectedMarchi.join(',');
}

function toggleMarcaPromo(marca) {
    const idx = promoSelectedMarchi.indexOf(marca);
    if (idx > -1) promoSelectedMarchi.splice(idx, 1);
    else promoSelectedMarchi.push(marca);
    renderPromoMarchiButtons();
}

async function savePromo() {
    const nome = document.getElementById('promoNome').value.trim();
    const modelli = document.getElementById('promoModelliInput').value.trim();
    const dataInizio = document.getElementById('promoDataInizio').value;
    const dataScadenza = document.getElementById('promoDataScadenza').value;
    const consenti = document.getElementById('promoConsentiManuale').checked;

    if (!nome) { alert('Inserisci il nome della promo'); return; }
    if (promoSelectedMarchi.length === 0) { alert('Seleziona almeno un marchio'); return; }
    if (!dataInizio || !dataScadenza) { alert('Inserisci data inizio e scadenza'); return; }
    if (dataScadenza <= dataInizio) { alert('La data di scadenza deve essere successiva alla data di inizio'); return; }

    const payload = {
        nome,
        marchi: promoSelectedMarchi.join(','),
        modelli: modelli || null,
        consentiInserimentoManuale: consenti,
        dataInizio,
        dataScadenza
    };

    try {
        const url = promoEditingId ? `/api/promos/${promoEditingId}` : '/api/promos';
        const method = promoEditingId ? 'PATCH' : 'POST';
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) { alert('Errore nel salvataggio'); return; }
        hideNewPromoForm();
        loadPromo();
    } catch (err) { console.error('Errore salvataggio promo:', err); }
}

function editPromo(promoId) {
    const promo = promoAttive.find(p => p.id === promoId);
    if (!promo) return;
    promoEditingId = promoId;
    document.getElementById('promoFormTitle').textContent = 'MODIFICA PROMO';
    document.getElementById('promoSaveBtn').textContent = 'AGGIORNA PROMO';
    document.getElementById('promoNome').value = promo.nome;
    document.getElementById('promoModelliInput').value = promo.modelli || '';
    document.getElementById('promoDataInizio').value = promo.dataInizio;
    document.getElementById('promoDataScadenza').value = promo.dataScadenza;
    document.getElementById('promoConsentiManuale').checked = promo.consentiInserimentoManuale !== false;
    promoSelectedMarchi = promo.marchi ? promo.marchi.split(',').map(m => m.trim()) : [];
    renderPromoMarchiButtons();
    document.getElementById('newPromoForm').style.display = 'block';
    document.getElementById('newPromoForm').scrollIntoView({ behavior: 'smooth' });
}

async function annullaPromo(promoId) {
    if (!confirm('Annullare questa promo? Verrà spostata nell\'archivio.')) return;
    try {
        await fetch(`/api/promos/${promoId}/annulla`, { method: 'POST' });
        loadPromo();
    } catch (err) { console.error('Errore annullamento promo:', err); }
}

async function eliminaPromo(promoId) {
    if (!confirm('Eliminare definitivamente questa promo? Azione irreversibile.')) return;
    try {
        await fetch(`/api/promos/${promoId}`, { method: 'DELETE' });
        loadPromo();
    } catch (err) { console.error('Errore eliminazione promo:', err); }
}

function toggleArchivioPromo() {
    const list = document.getElementById('promoArchivioList');
    const arrow = document.getElementById('archivioArrow');
    if (!list) return;
    const isHidden = list.style.display === 'none';
    list.style.display = isHidden ? 'block' : 'none';
    if (arrow) arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
}

// ===== FORM CONTATTO PROMO =====
function filterPromoModelli(query) {
    const dropdown = document.getElementById('promoModelloDropdown');
    const hidden = document.getElementById('promoModelloRichiesto');
    if (!dropdown) return;

    // Raccoglie modelli dalla promo attiva + consente manuale
    const promoAttiva = promoAttive[0]; // usa prima promo attiva se ce ne sono più
    if (!promoAttiva) { dropdown.style.display = 'none'; return; }

    const modelliPromo = promoAttiva.modelli ? promoAttiva.modelli.split('\n').filter(m => m.trim()) : [];
    const consentiManuale = promoAttiva.consentiInserimentoManuale !== false;

    if (!query || query.trim() === '') {
        dropdown.style.display = 'none';
        if (hidden) hidden.value = '';
        return;
    }

    const q = query.toLowerCase().trim();
    const matches = modelliPromo.filter(m => m.toLowerCase().includes(q));

    let html = matches.map(m => `
        <div onclick="selectPromoModello('${m.replace(/'/g, "\\'")}')"
             style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)"
             onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
            ${m}
        </div>`).join('');

    if (consentiManuale && query.trim() && !modelliPromo.some(m => m.toLowerCase() === q)) {
        html += `<div onclick="selectPromoModello('${query.trim().replace(/'/g, "\\'")}')"
                 style="padding:10px 14px;cursor:pointer;font-size:13px;color:var(--text-secondary);border-top:1px solid var(--border)"
                 onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
                 ✏️ Inserisci: "${query.trim()}"
             </div>`;
    }

    if (!html) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
}

function selectPromoModello(modello) {
    document.getElementById('promoModelloInput').value = modello;
    document.getElementById('promoModelloRichiesto').value = modello;
    document.getElementById('promoModelloDropdown').style.display = 'none';
}

function selectPromoField(field, value) {
    promoFields[field] = value;
    const siBtn = document.getElementById(`promo-${field}-si`);
    const noBtn = document.getElementById(`promo-${field}-no`);
    if (siBtn) siBtn.classList.toggle('btn-sede-active', value === true);
    if (noBtn) noBtn.classList.toggle('btn-sede-active', value === false);

    // Mostra sede se appuntamento = Sì
    if (field === 'appuntamento') {
        const sedeRow = document.getElementById('promoSedeRow');
        if (sedeRow) sedeRow.style.display = value === true ? 'block' : 'none';
        if (value === false) {
            document.getElementById('promoSedeAppuntamento').value = '';
            ['Agnano','Casamarciano','Salerno'].forEach(s => {
                const btn = document.getElementById(`promoSede-${s}`);
                if (btn) btn.classList.remove('btn-sede-active');
            });
        }
    }
}

function selectPromoSede(sede) {
    document.getElementById('promoSedeAppuntamento').value = sede;
    ['Agnano','Casamarciano','Salerno'].forEach(s => {
        const btn = document.getElementById(`promoSede-${s}`);
        if (btn) btn.classList.toggle('btn-sede-active', s === sede);
    });
}

// Salva contatto promo (chiamato da createContactLog in contact.js quando categoria = 'Info Vendita in Promo')
async function savePromoContact(contactLogId) {
    const promoAttiva = promoAttive[0];
    if (!promoAttiva) return;

    const modelloRichiesto = document.getElementById('promoModelloRichiesto')?.value || '';
    const sedeAppuntamento = document.getElementById('promoSedeAppuntamento')?.value || '';

    if (!modelloRichiesto) { alert('Inserisci il modello richiesto'); return false; }
    if (promoFields.richiestaPromo === null) { alert('Seleziona Richiesta Promo'); return false; }
    if (promoFields.propostaPromo === null) { alert('Seleziona Proposta Promo'); return false; }
    if (promoFields.testDrive === null) { alert('Seleziona Test Drive'); return false; }
    if (promoFields.appuntamento === null) { alert('Seleziona Appuntamento'); return false; }
    if (promoFields.appuntamento === true && !sedeAppuntamento) { alert('Seleziona la sede dell\'appuntamento'); return false; }

    try {
        await fetch(`/api/promos/${promoAttiva.id}/contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                modelloRichiesto,
                richiestaPromo: promoFields.richiestaPromo,
                propostaPromo: promoFields.propostaPromo,
                testDrive: promoFields.testDrive,
                appuntamento: promoFields.appuntamento,
                sedeAppuntamento: sedeAppuntamento || null
            })
        });
        return true;
    } catch (err) {
        console.error('Errore salvataggio contatto promo:', err);
        return false;
    }
}

function resetPromoForm() {
    promoFields = { richiestaPromo: null, propostaPromo: null, testDrive: null, appuntamento: null };
    ['richiestaPromo','propostaPromo','testDrive','appuntamento'].forEach(f => {
        ['si','no'].forEach(v => {
            const btn = document.getElementById(`promo-${f}-${v}`);
            if (btn) btn.classList.remove('btn-sede-active');
        });
    });
    const modelloInput = document.getElementById('promoModelloInput');
    if (modelloInput) modelloInput.value = '';
    const modelloHidden = document.getElementById('promoModelloRichiesto');
    if (modelloHidden) modelloHidden.value = '';
    const sedeRow = document.getElementById('promoSedeRow');
    if (sedeRow) sedeRow.style.display = 'none';
    const sedeHidden = document.getElementById('promoSedeAppuntamento');
    if (sedeHidden) sedeHidden.value = '';
    ['Agnano','Casamarciano','Salerno'].forEach(s => {
        const btn = document.getElementById(`promoSede-${s}`);
        if (btn) btn.classList.remove('btn-sede-active');
    });
}
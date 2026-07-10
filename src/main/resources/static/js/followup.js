let searchTimeout = null;
const collapsedSections = new Set();

const CONSULTANTI_LIST = [
    'Ambrosino Luca','Capitelli Silvio','Castaldo Marco','Castaldo Roberto',
    'Filosa Claudio','Fiore Guido','Gerardi Claudio','Giordano Luca',
    'Montuori Francesco','Palumbo Enrico','Scala Rosario',
    'Zaritto Davide','Zuppa Mattia'
];

// Popola il dropdown multi-select del filtro consulenti in Follow-up (lista statica)
document.addEventListener('DOMContentLoaded', function() {
    if (typeof populateMultiSelectOptions === 'function' && document.getElementById('consultantFilterMulti-options')) {
        populateMultiSelectOptions('consultantFilterMulti', CONSULTANTI_LIST);
    }
});

function isModerator() {
    return currentUser?.role === 'MODERATORE';
}

async function loadFollowUps() {
    const date = document.getElementById('workDateFilter').value;
    if (!date) return;

    const consultantFilters = typeof getMultiSelectValues === 'function' ? getMultiSelectValues('consultantFilterMulti') : [];

    try {
        const res = await fetch(`/api/followups?date=${date}`);
        if (!res.ok) return;
        let followUps = await res.json();

        if (consultantFilters.length > 0) {
            followUps = followUps.filter(fu =>
                consultantFilters.some(c => c.toLowerCase() === (fu.consultantName || '').toLowerCase())
            );
        }

        // Carica tutti gli steps in parallelo
        const stepsMap = {};
        await Promise.all(followUps.map(async fu => {
            try {
                const r = await fetch(`/api/followups/${fu.id}/steps`);
                if (r.ok) stepsMap[fu.id] = await r.json();
                else stepsMap[fu.id] = [];
            } catch { stepsMap[fu.id] = []; }
        }));

        renderFollowUps(followUps, stepsMap);
    } catch (err) {
        console.error('Errore caricamento follow-up:', err);
    }
}

function isConsultantComplete(items) {
    return items.every(fu =>
        fu.status === 'RESPONDED' ||
        fu.status === 'ABANDONED' ||
        fu.hasAppointment === true
    );
}

function toggleSection(consultantKey) {
    if (collapsedSections.has(consultantKey)) {
        collapsedSections.delete(consultantKey);
    } else {
        collapsedSections.add(consultantKey);
    }
    const body = document.getElementById(`section-body-${consultantKey}`);
    const arrow = document.getElementById(`arrow-${consultantKey}`);
    if (body) {
        const isCollapsed = collapsedSections.has(consultantKey);
        body.style.display = isCollapsed ? 'none' : 'block';
        if (arrow) arrow.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
    }
}

function renderFollowUps(followUps, stepsMap) {
    const container = document.getElementById('followUpsList');
    if (followUps.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div style="font-size:40px">📋</div>
                <p>Nessun follow-up per questo giorno</p>
            </div>`;
        return;
    }

    const grouped = {};
    followUps.forEach(fu => {
        const consultant = fu.consultantName && fu.consultantName.trim() !== ''
            ? fu.consultantName
            : '⚠️ Non assegnato';
        if (!grouped[consultant]) grouped[consultant] = [];
        grouped[consultant].push(fu);
    });

    const sorted = Object.entries(grouped).sort((a, b) => {
        if (a[0].startsWith('⚠️')) return 1;
        if (b[0].startsWith('⚠️')) return -1;
        return a[0].localeCompare(b[0]);
    });

    container.innerHTML = sorted.map(([consultant, items]) => {
        const complete = isConsultantComplete(items);
        const key = consultant.replace(/[^a-zA-Z0-9]/g, '_');
        const isCollapsed = collapsedSections.has(key);
        const responded = items.filter(fu => fu.status === 'RESPONDED').length;
        const abandoned = items.filter(fu => fu.status === 'ABANDONED').length;
        const appointments = items.filter(fu => fu.hasAppointment).length;

        return `
        <div class="consultant-folder ${complete ? 'consultant-folder-complete' : ''}">
            <div class="consultant-folder-tab ${complete ? 'tab-complete' : ''}" onclick="toggleSection('${key}')">
                <div class="folder-tab-left">
                    <div class="folder-icon ${complete ? 'folder-icon-complete' : ''}">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                            <path d="M3 7C3 5.9 3.9 5 5 5H10L12 7H19C20.1 7 21 7.9 21 9V17C21 18.1 20.1 19 19 19H5C3.9 19 3 18.1 3 17V7Z"
                                fill="${complete ? '#f0c040' : '#1a4080'}" opacity="0.9"/>
                        </svg>
                    </div>
                    <div>
                        <div class="folder-consultant-name">${consultant}</div>
                        <div class="folder-stats">
                            <span class="folder-stat-item stat-total">${items.length} totali</span>
                            ${responded > 0 ? `<span class="folder-stat-item stat-responded">✅ ${responded}</span>` : ''}
                            ${abandoned > 0 ? `<span class="folder-stat-item stat-abandoned">❌ ${abandoned}</span>` : ''}
                            ${appointments > 0 ? `<span class="folder-stat-item stat-appointment">📅 ${appointments}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="folder-tab-right">
                    ${complete ? '<span class="folder-complete-badge">✓ COMPLETATO</span>' : ''}
                    <span class="folder-arrow" id="arrow-${key}" style="transform:${isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}">▼</span>
                </div>
            </div>
            <div class="consultant-folder-body" id="section-body-${key}" style="display:${isCollapsed ? 'none' : 'block'}">
                ${items.map(fu => renderFollowUpCard(fu, stepsMap[fu.id] || [])).join('')}
            </div>
        </div>
        `;
    }).join('');
}

function renderFollowUpCard(fu, steps) {
    const readOnly = isModerator();
    const stepsHtml = steps.map(s => renderStepCard(s, fu.id)).join('');

    return `
        <div class="followup-card" id="fu-${fu.id}">
            <div class="followup-header">
                <div style="flex:1">
                    <div class="followup-name">${fu.customer.fullName}</div>
                    <div class="followup-meta">
                        ${fu.customer.email ? '✉️ ' + fu.customer.email : ''}
                        ${fu.customer.phone ? (fu.customer.email ? ' · ' : '') + '📞 ' + fu.customer.phone : ''}
                        ${fu.customer.emailOnly ? ' · <span style="color:#f0c040;font-weight:800">SOLO EMAIL</span>' : ''}
                    </div>
                    <div style="margin-top:8px;display:flex;align-items:center;gap:8px">
                        <span style="font-size:10px;font-weight:700;color:var(--text-secondary);letter-spacing:1px">👤</span>
                        ${readOnly
                            ? `<span style="font-size:12px;color:var(--text-secondary);padding:4px 10px">${fu.consultantName || '—'}</span>`
                            : `<select class="input-dark" style="font-size:12px;padding:4px 10px;border-radius:6px"
                                onchange="updateConsultant(${fu.id}, this.value)">
                                <option value="">-- consulente --</option>
                                ${CONSULTANTI_LIST.map(c =>
                                    `<option ${fu.consultantName === c ? 'selected' : ''}>${c}</option>`
                                ).join('')}
                              </select>`
                        }
                    </div>
                </div>
                <div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;justify-content:flex-end">
                    <span class="status-badge status-${fu.status}">${formatStatus(fu.status)}</span>
                    ${fu.hasAppointment ? '<span class="status-badge status-APPOINTMENT">📅 APP.</span>' : ''}
                </div>
            </div>
            ${readOnly ? '' : `
            <div class="followup-actions">
                <button class="btn-small btn-green" onclick="setStatus(${fu.id}, '${fu.status === 'RESPONDED' ? 'IN_PROGRESS' : 'RESPONDED'}')">
                    ${fu.status === 'RESPONDED' ? '↩️ Annulla Risponde' : '✅ Risponde'}
                </button>
                <button class="btn-small btn-red" onclick="setStatus(${fu.id}, '${fu.status === 'ABANDONED' ? 'IN_PROGRESS' : 'ABANDONED'}')">
                    ${fu.status === 'ABANDONED' ? '↩️ Annulla Non Risponde' : '❌ Non Risponde'}
                </button>
                <button class="btn-small btn-blue" onclick="toggleAppointment(${fu.id}, ${fu.hasAppointment})">
                    ${fu.hasAppointment ? '📅 Rimuovi' : '📅 Appuntamento'}
                </button>
                <button class="btn-small btn-orange" onclick="editFollowUp(${fu.id}, '${fu.customer.fullName.replace(/'/g, "\\'")}')">✏️ Modifica</button>
                <button class="btn-small btn-red" onclick="deleteFollowUp(${fu.id})">🗑️</button>
            </div>
            `}
            <div class="steps-grid" id="steps-${fu.id}">
                ${stepsHtml}
            </div>
        </div>
    `;
}

function renderStepCard(step, followUpId) {
    const readOnly = isModerator();
    const isContact3 = step.stepNumber === 3;
    const isSent = step.outcome === 'SENT' || (isContact3 && step.outcome === 'ANSWERED');
    const outcomeClass = isSent ? 'SENT' : step.outcome;
    const executedAt = formatDateTime(step.executedAt);
    const slotLabel = formatSlot(step.scheduledSlot);

    return `
    <div class="step-card">
        <div class="step-title">
            STEP ${step.stepNumber} · GG ${step.dayNumber} · ${formatChannel(step)}
            ${slotLabel ? ' · ' + slotLabel : ''}
        </div>
        <div class="step-outcome outcome-${outcomeClass}">
            ${formatOutcome(step.outcome, step.stepNumber)}
        </div>
        ${executedAt ? `<div class="step-timestamp">🕐 ${executedAt}</div>` : ''}
        ${readOnly ? '' : `
        <div style="display:flex;gap:5px;margin-bottom:8px">
            ${isContact3 ? `
                <button class="btn-small btn-sent ${isSent ? 'btn-sent-active' : ''}"
                    onclick="updateStep(${step.id}, '${isSent ? 'PENDING' : 'SENT'}', ${followUpId})">
                    ${isSent ? '✓ INVIATO' : '📤 INVIA'}
                </button>
            ` : `
                <button class="btn-small btn-green" onclick="updateStep(${step.id}, '${step.outcome === 'ANSWERED' ? 'PENDING' : 'ANSWERED'}', ${followUpId})">
                    ${step.outcome === 'ANSWERED' ? '↩️' : '✅'}
                </button>
                <button class="btn-small btn-red" onclick="updateStep(${step.id}, '${step.outcome === 'NO_ANSWER' ? 'PENDING' : 'NO_ANSWER'}', ${followUpId})">
                    ${step.outcome === 'NO_ANSWER' ? '↩️' : '❌'}
                </button>
            `}
        </div>
        <textarea class="input-field" placeholder="Note..."
            style="font-size:12px;padding:8px;margin-bottom:0"
            onblur="saveNote(${step.id}, this.value)"
        >${step.notes || ''}</textarea>
        `}
        ${readOnly && step.notes ? `<div style="font-size:12px;color:var(--text-secondary);padding:6px 0">${step.notes}</div>` : ''}
    </div>
    `;
}

async function updateConsultant(followUpId, consultantName) {
    if (!consultantName || isModerator()) return;
    try {
        await fetch(`/api/followups/${followUpId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ consultantName })
        });
        loadFollowUps();
    } catch (err) {
        console.error('Errore aggiornamento consulente:', err);
    }
}

function searchFollowUps(query) {
    clearTimeout(searchTimeout);
    const searchResults = document.getElementById('searchResults');
    const searchResultsList = document.getElementById('searchResultsList');
    const consultantFilter = document.getElementById('searchConsultantFilter')?.value || '';

    if (!query || query.length < 2) {
        searchResults.style.display = 'none';
        return;
    }

    searchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`/api/followups/search?q=${encodeURIComponent(query)}`);
            if (!res.ok) return;
            let results = await res.json();

            if (consultantFilter) {
                results = results.filter(fu =>
                    (fu.consultantName || '').toLowerCase() === consultantFilter.toLowerCase()
                );
            }

            searchResults.style.display = 'block';

            if (results.length === 0) {
                searchResultsList.innerHTML = '<div class="empty-state" style="padding:20px"><p>Nessun risultato trovato</p></div>';
                return;
            }

            searchResultsList.innerHTML = results.map(fu => `
                <div class="followup-card" style="cursor:pointer;margin-bottom:10px" onclick="goToFollowUp('${fu.workDate}', ${fu.id})">
                    <div class="followup-header" style="margin-bottom:8px">
                        <div>
                            <div class="followup-name">${fu.customer.fullName}</div>
                            <div class="followup-meta">
                                ${fu.customer.email ? '✉️ ' + fu.customer.email : ''}
                                ${fu.customer.phone ? ' · 📞 ' + fu.customer.phone : ''}
                                · 📅 ${fu.workDate}
                                · 👤 <strong>${fu.consultantName || 'N/D'}</strong>
                            </div>
                        </div>
                        <div style="display:flex;gap:6px;align-items:center">
                            <span class="status-badge status-${fu.status}">${formatStatus(fu.status)}</span>
                            <span style="color:#f0c040;font-size:18px">→</span>
                        </div>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            console.error('Errore ricerca:', err);
        }
    }, 350);
}

function goToFollowUp(date, followUpId) {
    document.getElementById('workDateFilter').value = date;
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').style.display = 'none';
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

async function loadSteps(followUpId) {
    try {
        const res = await fetch(`/api/followups/${followUpId}/steps`);
        if (!res.ok) return;
        const steps = await res.json();
        const container = document.getElementById(`steps-${followUpId}`);
        if (container) {
            container.innerHTML = steps.map(s => renderStepCard(s, followUpId)).join('');
        }
    } catch (err) {
        console.error('Errore caricamento step:', err);
    }
}

function formatDateTime(isoString) {
    if (!isoString) return null;
    const d = new Date(isoString);
    const date = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return `${date} · ${time}`;
}

async function updateStep(stepId, outcome, followUpId) {
    if (isModerator()) return;
    try {
        await fetch(`/api/followups/steps/${stepId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ outcome, executedAt: true })
        });
        loadSteps(followUpId);
    } catch (err) {
        console.error('Errore aggiornamento step:', err);
    }
}

async function saveNote(stepId, notes) {
    if (isModerator()) return;
    try {
        await fetch(`/api/followups/steps/${stepId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes })
        });
    } catch (err) {
        console.error('Errore salvataggio nota:', err);
    }
}

async function setStatus(followUpId, status) {
    if (isModerator()) return;
    try {
        await fetch(`/api/followups/${followUpId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        loadFollowUps();
    } catch (err) {
        console.error('Errore aggiornamento stato:', err);
    }
}

async function toggleAppointment(followUpId, current) {
    if (isModerator()) return;
    try {
        await fetch(`/api/followups/${followUpId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hasAppointment: !current })
        });
        loadFollowUps();
    } catch (err) {
        console.error('Errore aggiornamento appuntamento:', err);
    }
}

async function deleteFollowUp(id) {
    if (isModerator()) return;
    if (!confirm('Sei sicuro di voler eliminare questo follow-up?')) return;
    try {
        await fetch(`/api/followups/${id}`, { method: 'DELETE' });
        loadFollowUps();
    } catch (err) {
        console.error('Errore eliminazione:', err);
    }
}

async function editFollowUp(id, currentName) {
    if (isModerator()) return;
    const newName = prompt('Modifica nome cliente:', currentName);
    if (!newName || newName === currentName) return;
    try {
        await fetch(`/api/followups/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerName: newName })
        });
        loadFollowUps();
    } catch (err) {
        console.error('Errore modifica:', err);
    }
}

async function createFollowUp() {
    if (isModerator()) return;
    const fullName = document.getElementById('fuFullName').value.trim();
    const email = document.getElementById('fuEmail').value.trim();
    const phone = document.getElementById('fuPhone').value.trim();
    const workDate = document.getElementById('fuWorkDate').value;
    const consultant = document.getElementById('fuConsultant').value;
    const emailOnly = document.getElementById('fuEmailOnly').checked;

    if (!fullName || !workDate || !consultant) {
        alert('Nome cliente, data e consulente sono obbligatori');
        return;
    }

    try {
        const checkRes = await fetch(`/api/followups?date=${workDate}`);
        if (checkRes.ok) {
            const existing = await checkRes.json();
            const duplicate = existing.find(fu =>
                fu.customer.fullName.toLowerCase() === fullName.toLowerCase() ||
                (email && fu.customer.email && fu.customer.email.toLowerCase() === email.toLowerCase()) ||
                (phone && fu.customer.phone && fu.customer.phone === phone)
            );
            if (duplicate) {
                const proceed = confirm(
                    `⚠️ Esiste già un cliente simile il ${workDate}:\n` +
                    `"${duplicate.customer.fullName}" · ${duplicate.consultantName || 'N/D'}\n\n` +
                    `Vuoi inserirlo comunque?`
                );
                if (!proceed) return;
            }
        }
    } catch (err) {
        console.error('Errore controllo duplicati:', err);
    }

    try {
        const res = await fetch('/api/followups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, email, phone, workDate, emailOnly, consultantName: consultant })
        });

        if (!res.ok) {
            const data = await res.json();
            alert(data.error || 'Errore nella creazione');
            return;
        }

        hideNewFollowUp();
        document.getElementById('workDateFilter').value = workDate;
        loadFollowUps();
    } catch (err) {
        console.error('Errore creazione follow-up:', err);
    }
}

function showNewFollowUp() {
    if (isModerator()) return;
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('fuWorkDate').value = today;
    document.getElementById('newFollowUpForm').style.display = 'block';
    document.getElementById('newFollowUpForm').scrollIntoView({ behavior: 'smooth' });
}

function hideNewFollowUp() {
    document.getElementById('newFollowUpForm').style.display = 'none';
    document.getElementById('fuFullName').value = '';
    document.getElementById('fuEmail').value = '';
    document.getElementById('fuPhone').value = '';
    document.getElementById('fuEmailOnly').checked = false;
    document.getElementById('fuConsultant').value = '';
}

function formatStatus(status) {
    const map = {
        'IN_PROGRESS': 'IN CORSO',
        'RESPONDED': 'RISPONDE',
        'APPOINTMENT': 'APPUNTAMENTO',
        'ABANDONED': 'ABBANDONATO'
    };
    return map[status] || status;
}

function formatChannel(step) {
    if (step.stepNumber === 3 && step.dayNumber === 2) {
        return 'WhatsApp / Mail';
    }
    const map = {
        'CALL': 'Chiamata',
        'WHATSAPP': 'WhatsApp',
        'EMAIL': 'Email'
    };
    return map[step.channel] || step.channel;
}

function formatSlot(slot) {
    if (!slot) return '';
    const map = { 'MORNING': 'Mattina', 'AFTERNOON': 'Pomeriggio' };
    return map[slot] || slot;
}

function formatOutcome(outcome, stepNumber) {
    if (stepNumber === 3 && (outcome === 'SENT' || outcome === 'ANSWERED')) {
        return '📤 Inviato';
    }
    const map = {
        'PENDING': '⏳ In attesa',
        'ANSWERED': '✅ Risposto',
        'NO_ANSWER': '❌ Non risponde',
        'SENT': '📤 Inviato'
    };
    return map[outcome] || outcome;
}
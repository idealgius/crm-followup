let searchTimeout = null;

async function loadFollowUps() {
    const date = document.getElementById('workDateFilter').value;
    if (!date) return;

    const consultantFilter = document.getElementById('consultantFilter')?.value || '';

    try {
        const res = await fetch(`/api/followups?date=${date}`);
        if (!res.ok) return;
        let followUps = await res.json();

        if (consultantFilter) {
            followUps = followUps.filter(fu =>
                (fu.consultantName || '').toLowerCase() === consultantFilter.toLowerCase()
            );
        }

        renderFollowUps(followUps);
    } catch (err) {
        console.error('Errore caricamento follow-up:', err);
    }
}

function isConsultantComplete(items) {
    // Completo se ogni follow-up ha risposto, non risponde, o ha appuntamento
    return items.every(fu =>
        fu.status === 'RESPONDED' ||
        fu.status === 'ABANDONED' ||
        fu.hasAppointment === true
    );
}

function renderFollowUps(followUps) {
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
            : '⚠️ Consulente non assegnato';
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
        return `
        <div class="consultant-section ${complete ? 'consultant-complete' : ''}">
            <div class="consultant-header ${complete ? 'consultant-header-complete' : ''}">
                <span class="consultant-icon">${complete ? '✅' : '👤'}</span>
                <span class="consultant-name">${consultant}</span>
                <span class="consultant-count">${items.length} follow-up</span>
                ${complete ? '<span class="consultant-done-badge">COMPLETATO</span>' : ''}
            </div>
            <div class="consultant-body">
                ${items.map(fu => renderFollowUpCard(fu)).join('')}
            </div>
        </div>
        `;
    }).join('');

    followUps.forEach(fu => loadSteps(fu.id));
}

function renderFollowUpCard(fu) {
    return `
        <div class="followup-card" id="fu-${fu.id}">
            <div class="followup-header">
                <div>
                    <div class="followup-name">${fu.customer.fullName}</div>
                    <div class="followup-meta">
                        ${fu.customer.email ? '✉️ ' + fu.customer.email : ''}
                        ${fu.customer.phone ? (fu.customer.email ? ' · ' : '') + '📞 ' + fu.customer.phone : ''}
                        ${fu.customer.emailOnly ? ' · <span style="color:#f0c040;font-weight:800">SOLO EMAIL</span>' : ''}
                    </div>
                    <div style="margin-top:8px;display:flex;align-items:center;gap:8px">
                        <span style="font-size:11px;font-weight:700;color:var(--text-secondary);letter-spacing:1px">👤 CONSULENTE:</span>
                        <select class="input-dark" style="font-size:12px;padding:4px 10px;border-radius:6px"
                            onchange="updateConsultant(${fu.id}, this.value)">
                            <option value="">-- seleziona --</option>
                            <option ${fu.consultantName === 'Ambrosino Luca' ? 'selected' : ''}>Ambrosino Luca</option>
                            <option ${fu.consultantName === 'Capitelli Silvio' ? 'selected' : ''}>Capitelli Silvio</option>
                            <option ${fu.consultantName === 'Castaldo Marco' ? 'selected' : ''}>Castaldo Marco</option>
                            <option ${fu.consultantName === 'Castaldo Roberto' ? 'selected' : ''}>Castaldo Roberto</option>
                            <option ${fu.consultantName === 'Filosa Claudio' ? 'selected' : ''}>Filosa Claudio</option>
                            <option ${fu.consultantName === 'Fiore Guido' ? 'selected' : ''}>Fiore Guido</option>
                            <option ${fu.consultantName === 'Gerardi Claudio' ? 'selected' : ''}>Gerardi Claudio</option>
                            <option ${fu.consultantName === 'Giordano Luca' ? 'selected' : ''}>Giordano Luca</option>
                            <option ${fu.consultantName === 'Montuori Francesco' ? 'selected' : ''}>Montuori Francesco</option>
                            <option ${fu.consultantName === 'Palumbo Enrico' ? 'selected' : ''}>Palumbo Enrico</option>
                            <option ${fu.consultantName === 'Scala Rosario' ? 'selected' : ''}>Scala Rosario</option>
                            <option ${fu.consultantName === 'Zaritto Davide' ? 'selected' : ''}>Zaritto Davide</option>
                            <option ${fu.consultantName === 'Zuppa Mattia' ? 'selected' : ''}>Zuppa Mattia</option>
                        </select>
                    </div>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                    <span class="status-badge status-${fu.status}">${formatStatus(fu.status)}</span>
                    ${fu.hasAppointment ? '<span class="status-badge status-APPOINTMENT">📅 APPUNTAMENTO</span>' : ''}
                </div>
            </div>
            <div class="followup-actions">
                <button class="btn-small btn-green" onclick="setStatus(${fu.id}, 'RESPONDED')">✅ Risponde</button>
                <button class="btn-small btn-red" onclick="setStatus(${fu.id}, 'ABANDONED')">❌ Non Risponde</button>
                <button class="btn-small btn-blue" onclick="toggleAppointment(${fu.id}, ${fu.hasAppointment})">
                    ${fu.hasAppointment ? '📅 Rimuovi App.' : '📅 Segna App.'}
                </button>
                <button class="btn-small btn-orange" onclick="editFollowUp(${fu.id}, '${fu.customer.fullName.replace(/'/g, "\\'")}')">✏️ Modifica</button>
                <button class="btn-small btn-red" onclick="deleteFollowUp(${fu.id})">🗑️ Elimina</button>
            </div>
            <div class="steps-grid" id="steps-${fu.id}">
                <div style="color:var(--text-secondary);font-size:12px;padding:8px">Caricamento step...</div>
            </div>
        </div>
    `;
}

async function updateConsultant(followUpId, consultantName) {
    if (!consultantName) return;
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
        renderSteps(followUpId, steps);
    } catch (err) {
        console.error('Errore caricamento step:', err);
    }
}

function renderSteps(followUpId, steps) {
    const container = document.getElementById(`steps-${followUpId}`);
    if (!steps || steps.length === 0) {
        container.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;padding:8px">Nessuno step</div>';
        return;
    }

    container.innerHTML = steps.map(step => `
        <div class="step-card">
            <div class="step-title">
                STEP ${step.stepNumber} · GG ${step.dayNumber} · ${step.channel}
                ${step.scheduledSlot ? ' · ' + step.scheduledSlot : ''}
            </div>
            <div class="step-outcome outcome-${step.outcome}">
                ${formatOutcome(step.outcome)}
            </div>
            <div style="display:flex;gap:5px;margin-bottom:8px">
                <button class="btn-small btn-green" onclick="updateStep(${step.id}, 'ANSWERED', ${followUpId})">✅</button>
                <button class="btn-small btn-red" onclick="updateStep(${step.id}, 'NO_ANSWER', ${followUpId})">❌</button>
            </div>
            <textarea
                class="input-field"
                placeholder="Note..."
                style="font-size:12px;padding:8px;margin-bottom:0"
                onblur="saveNote(${step.id}, this.value)"
            >${step.notes || ''}</textarea>
        </div>
    `).join('');
}

async function updateStep(stepId, outcome, followUpId) {
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
    if (!confirm('Sei sicuro di voler eliminare questo follow-up?')) return;
    try {
        await fetch(`/api/followups/${id}`, { method: 'DELETE' });
        loadFollowUps();
    } catch (err) {
        console.error('Errore eliminazione:', err);
    }
}

async function editFollowUp(id, currentName) {
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
                    `⚠️ Attenzione! Esiste già un cliente simile il ${workDate}:\n` +
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

function formatOutcome(outcome) {
    const map = {
        'PENDING': '⏳ In attesa',
        'ANSWERED': '✅ Risposto',
        'NO_ANSWER': '❌ Non risponde'
    };
    return map[outcome] || outcome;
}
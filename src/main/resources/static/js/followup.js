async function loadFollowUps() {
    const date = document.getElementById('workDateFilter').value;
    if (!date) return;

    try {
        const res = await fetch(`/api/followups?date=${date}`);
        if (!res.ok) return;
        const followUps = await res.json();
        renderFollowUps(followUps);
    } catch (err) {
        console.error('Errore caricamento follow-up:', err);
    }
}

function renderFollowUps(followUps) {
    const container = document.getElementById('followUpsList');
    if (followUps.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>📋</h3>
                <p>Nessun follow-up per questo giorno</p>
            </div>`;
        return;
    }

    container.innerHTML = followUps.map(fu => `
        <div class="followup-card" id="fu-${fu.id}">
            <div class="followup-header">
                <div>
                    <div class="followup-name">${fu.customer.fullName}</div>
                    <div class="followup-meta">
                        ${fu.customer.email || ''} 
                        ${fu.customer.phone ? '· ' + fu.customer.phone : ''}
                        ${fu.customer.emailOnly ? '· <span style="color:#f0c040">Solo Email</span>' : ''}
                    </div>
                </div>
                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                    <span class="status-badge status-${fu.status}">${formatStatus(fu.status)}</span>
                    ${fu.hasAppointment ? '<span class="status-badge" style="background:rgba(240,192,64,0.2);color:#f0c040">📅 APPUNTAMENTO</span>' : ''}
                </div>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
                <button class="btn-small btn-green" onclick="setStatus(${fu.id}, 'RESPONDED')">✅ Risponde</button>
                <button class="btn-small btn-red" onclick="setStatus(${fu.id}, 'ABANDONED')">❌ Non Risponde</button>
                <button class="btn-small btn-blue" onclick="toggleAppointment(${fu.id}, ${fu.hasAppointment})">
                    ${fu.hasAppointment ? '📅 Rimuovi Appuntamento' : '📅 Segna Appuntamento'}
                </button>
            </div>
            <div class="steps-grid" id="steps-${fu.id}">
                <div style="color:#888;font-size:12px">Caricamento step...</div>
            </div>
        </div>
    `).join('');

    followUps.forEach(fu => loadSteps(fu.id));
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
        container.innerHTML = '<div style="color:#888;font-size:12px">Nessuno step</div>';
        return;
    }

    container.innerHTML = steps.map(step => `
        <div class="step-card">
            <div class="step-title">
                STEP ${step.stepNumber} · GIORNO ${step.dayNumber} · ${step.channel}
                ${step.scheduledSlot ? '· ' + step.scheduledSlot : ''}
            </div>
            <div class="step-outcome outcome-${step.outcome}">
                ${formatOutcome(step.outcome)}
            </div>
            <div style="display:flex;gap:5px;margin-bottom:8px;flex-wrap:wrap">
                <button class="btn-small btn-green" onclick="updateStep(${step.id}, 'ANSWERED')">✅</button>
                <button class="btn-small btn-red" onclick="updateStep(${step.id}, 'NO_ANSWER')">❌</button>
            </div>
            <textarea 
                class="input-field" 
                placeholder="Note..." 
                style="font-size:12px;padding:8px;margin-bottom:5px"
                onblur="saveNote(${step.id}, this.value)"
            >${step.notes || ''}</textarea>
        </div>
    `).join('');
}

async function updateStep(stepId, outcome) {
    try {
        await fetch(`/api/followups/steps/${stepId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ outcome, executedAt: true })
        });
        loadFollowUps();
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

async function createFollowUp() {
    const fullName = document.getElementById('fuFullName').value;
    const email = document.getElementById('fuEmail').value;
    const phone = document.getElementById('fuPhone').value;
    const workDate = document.getElementById('fuWorkDate').value;
    const emailOnly = document.getElementById('fuEmailOnly').checked;

    if (!fullName || !workDate) {
        alert('Nome cliente e data sono obbligatori');
        return;
    }

    try {
        const res = await fetch('/api/followups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fullName, email, phone, workDate, emailOnly,
                userId: currentUser.id
            })
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
}

function hideNewFollowUp() {
    document.getElementById('newFollowUpForm').style.display = 'none';
    document.getElementById('fuFullName').value = '';
    document.getElementById('fuEmail').value = '';
    document.getElementById('fuPhone').value = '';
    document.getElementById('fuEmailOnly').checked = false;
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
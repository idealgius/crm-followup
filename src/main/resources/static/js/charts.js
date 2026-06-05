let chartFollowUp = null;
let chartWaiting = null;

async function loadStats() {
    const from = document.getElementById('statsFrom').value;
    const to = document.getElementById('statsTo').value;
    if (!from || !to) return;

    try {
        const [fuRes, wRes] = await Promise.all([
            fetch(`/api/stats/followups?from=${from}&to=${to}`),
            fetch('/api/stats/waiting')
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
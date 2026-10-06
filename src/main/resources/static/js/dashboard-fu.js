/* =====================================================================
   DASHBOARD FOLLOW-UP — analisi (Gruppo Autoscala CRM)
   ---------------------------------------------------------------------
   Dati: GET /api/stats/followups/analysis?from&to[&consultant]
   (una riga per follow-up con step, esiti e Recall). Qui si calcola tutto:
     - riquadri: follow-up, contattati, risposte, appuntamenti (su totale e
       su risposte), non risponde, in corso, tempo medio alla risposta,
       risposti nel Recall
     - imbuto: follow-up > contattati > risposto > appuntamento
     - QUANDO RISPONDONO: 1a chiamata, 2a chiamata, dopo WhatsApp, dopo
       mail, 3a chiamata (GG3), risposto senza step segnato, nel Recall,
       mai risposto, ancora in corso
     - per consulente, andamento nel tempo, per marchio, Recall Follow-up
   Ogni numero/barra/fetta e' cliccabile e apre l'elenco dei clienti.
   Si aggiorna con i filtri della dashboard (statsFrom, statsTo,
   statsConsultant): loadStats() in charts.js chiama FuAnalysis.load().
   ===================================================================== */
(function () {
    let rows = [], charts = [], kpiEl = null, boxEl = null;
    const LS = 'dash_fu_tipi_v1';
    let tipi = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } })();
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = n => Number(n || 0).toLocaleString('it-IT');
    const pct = (n, t) => t ? (Math.round(n / t * 1000) / 10).toLocaleString('it-IT') + '%' : '0%';

    // ===== classificazione di ogni follow-up =====
    const WHEN = [
        ['s1', '1ª chiamata (mattina)', '#00c853'],
        ['s2', '2ª chiamata (pomeriggio)', '#26a69a'],
        ['wh', 'Dopo WhatsApp', '#25d366'],
        ['mail', 'Dopo mail', '#4a90d9'],
        ['s4', '3ª chiamata (GG3)', '#7e57c2'],
        ['manual', 'Risposto (step non segnato)', '#8d99ae'],
        ['recall', 'Risposto nel Recall', '#f0a030'],
        ['never', 'Mai risposto', '#ff3d3d'],
        ['pending', 'Ancora in corso', '#5c6b80']
    ];
    const WHEN_LABEL = Object.fromEntries(WHEN.map(w => [w[0], w[1]]));
    function classify(r) {
        const st = r.steps || [];
        const step = n => st.find(s => s.n === n);
        const ansCall = st.filter(s => s.outcome === 'ANSWERED' && s.channel === 'CALL').sort((a, b) => a.n - b.n)[0];
        r.contacted = st.some(s => s.outcome && s.outcome !== 'PENDING');
        r.answeredAt = ansCall ? ansCall.at : null;
        if (r.status === 'RESPONDED' || ansCall) {
            if (r.emailOnly) return 'mail';
            if (!ansCall) return 'manual';
            if (ansCall.n === 1) return 's1';
            if (ansCall.n === 2) return 's2';
            const s3 = step(3);
            if (s3 && (s3.outcome === 'SENT_WHATSAPP' || (s3.channel === 'WHATSAPP' && ['SENT', 'ANSWERED'].includes(s3.outcome)))) return 'wh';
            if (s3 && (s3.outcome === 'SENT_MAIL' || (s3.channel === 'EMAIL' && ['SENT', 'ANSWERED'].includes(s3.outcome)))) return 'mail';
            return 's4';
        }
        if (r.recall && r.recall.status === 'RISPOSTO') return 'recall';
        if (r.status === 'ABANDONED') return 'never';
        return 'pending';
    }

    // ===== caricamento =====
    async function load(from, to, consultant) {
        mount();
        if (!from || !to) return;
        boxEl.classList.add('dfu-loading');
        try {
            const qs = new URLSearchParams({ from, to }); if (consultant) qs.set('consultant', consultant);
            const res = await fetch('/api/stats/followups/analysis?' + qs);
            if (!res.ok) { boxEl.innerHTML = '<div class="dfu-card"><p class="dfu-hint">Analisi non disponibile.</p></div>'; return; }
            rows = ((await res.json()).rows || []);
            rows.forEach(r => { r.when = classify(r); });
            render({ from, to, consultant });
        } catch (e) { console.error('Dashboard follow-up:', e); }
        finally { boxEl.classList.remove('dfu-loading'); }
    }

    function mount() {
        if (boxEl && document.body.contains(boxEl)) return;
        const page = document.getElementById('dashboardPage'); if (!page) return;
        const oldKpi = page.querySelector('.stats-grid');
        const cal = page.querySelector('.dashboard-calendars-row');
        kpiEl = document.createElement('div'); kpiEl.id = 'dfuKpi'; kpiEl.className = 'dfu-kpis';
        boxEl = document.createElement('div'); boxEl.id = 'dfuBox'; boxEl.className = 'dfu-box';
        if (oldKpi) { oldKpi.style.display = 'none'; oldKpi.parentNode.insertBefore(kpiEl, oldKpi); } else page.appendChild(kpiEl);
        if (cal) cal.parentNode.insertBefore(boxEl, cal.nextSibling); else page.appendChild(boxEl);
        // il vecchio grafico "Follow-up vs risposte vs appuntamenti" e' sostituito da questa analisi
        const old = page.querySelector('[data-chart="G_DASH_FOLLOWUP"]'); if (old) old.style.display = 'none';
        boxEl.addEventListener('click', onClick); kpiEl.addEventListener('click', onClick);
    }

    // ===== disegno =====
    function render(f) {
        charts.forEach(c => c.destroy()); charts = [];
        const tot = rows.length;
        const by = k => rows.filter(r => r.when === k);
        const responded = rows.filter(r => ['s1', 's2', 'wh', 'mail', 's4', 'manual'].includes(r.when));
        const appt = rows.filter(r => r.appointment);
        const contacted = rows.filter(r => r.contacted || r.status !== 'IN_PROGRESS');
        const giorni = responded.filter(r => r.answeredAt).map(r => Math.max(0, Math.round((new Date(r.answeredAt.slice(0, 10)) - new Date(r.workDate)) / 864e5)));
        const media = giorni.length ? (giorni.reduce((a, b) => a + b, 0) / giorni.length) : null;
        const recallTot = rows.filter(r => r.recall);

        const k = (id, label, n, sub, color) => `<button type="button" class="dfu-kpi" data-list="${id}" style="--c:${color}"><span>${label}</span><b>${n}</b><em>${sub}</em></button>`;
        kpiEl.innerHTML =
            k('all', 'Follow-up', fmt(tot), f.consultant ? esc(f.consultant) : 'tutti i consulenti', '#00c853') +
            k('contacted', 'Contattati', fmt(contacted.length), pct(contacted.length, tot) + ' dei follow-up', '#4a90d9') +
            k('responded', 'Risposte', fmt(responded.length), 'Tasso di risposta ' + pct(responded.length, tot), '#2c7be5') +
            k('appt', 'Appuntamenti', fmt(appt.length), `${pct(appt.length, tot)} sul totale · ${pct(appt.length, responded.length)} su chi risponde`, '#f0c040') +
            k('never', 'Non risponde', fmt(rows.filter(r => r.status === 'ABANDONED').length), pct(rows.filter(r => r.status === 'ABANDONED').length, tot) + ' · passati al Recall', '#ff3d3d') +
            k('pending', 'In corso', fmt(by('pending').length), 'da completare', '#8d99ae') +
            `<div class="dfu-kpi" style="--c:#7e57c2"><span>Tempo alla risposta</span><b>${media == null ? '—' : media.toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' gg'}</b><em>media dalla trattativa</em></div>` +
            k('recall', 'Risposti nel Recall', fmt(by('recall').length), `su ${fmt(recallTot.length)} in Recall Follow-up`, '#f0a030');

        if (!tot) { boxEl.innerHTML = '<div class="dfu-card"><p class="dfu-hint">Nessun follow-up nel periodo scelto.</p></div>'; return; }

        // --- imbuto ---
        const funnel = [['all', 'Follow-up', tot, '#00c853'], ['contacted', 'Contattati', contacted.length, '#4a90d9'], ['responded', 'Hanno risposto', responded.length, '#2c7be5'], ['appt', 'Appuntamento', appt.length, '#f0c040']];
        // --- per consulente ---
        const cons = [...new Set(rows.map(r => r.consultant || 'Senza consulente'))].map(c => {
            const l = rows.filter(r => (r.consultant || 'Senza consulente') === c);
            const resp = l.filter(r => ['s1', 's2', 'wh', 'mail', 's4', 'manual'].includes(r.when));
            const w = Object.fromEntries(WHEN.map(x => [x[0], l.filter(r => r.when === x[0]).length]));
            const best = WHEN.slice(0, 5).map(x => [x[1], w[x[0]]]).sort((a, b) => b[1] - a[1])[0];
            return { c, l, tot: l.length, resp: resp.length, appt: l.filter(r => r.appointment).length, nr: l.filter(r => r.status === 'ABANDONED').length, pend: w.pending, w, best: best && best[1] ? best[0] : '—' };
        }).sort((a, b) => b.tot - a.tot);
        // --- marchi ---
        const marchi = [...new Set(rows.map(r => (r.marca || '').trim()).filter(Boolean))].map(m => {
            const l = rows.filter(r => (r.marca || '').trim().toLowerCase() === m.toLowerCase());
            return { m, tot: l.length, resp: l.filter(r => ['s1', 's2', 'wh', 'mail', 's4', 'manual'].includes(r.when)).length, appt: l.filter(r => r.appointment).length };
        }).sort((a, b) => b.tot - a.tot).slice(0, 15);
        const senzaMarca = rows.filter(r => !(r.marca || '').trim()).length;

        boxEl.innerHTML = `
        <div class="dfu-grid">
          <div class="dfu-card">
            <div class="dfu-head"><div><h3>Imbuto</h3><p class="dfu-hint">Dove si perdono i clienti · clicca una fascia</p></div></div>
            <div class="dfu-funnel">${funnel.map(([id, l, n, c]) => `<button type="button" data-list="${id}" class="dfu-fstep">
                <span class="dfu-flabel">${l}</span><span class="dfu-fbar"><i style="width:${tot ? Math.max(3, n / tot * 100) : 0}%;background:${c}"></i></span><b>${fmt(n)}</b><em>${pct(n, tot)}</em></button>`).join('')}</div>
          </div>
          <div class="dfu-card">
            <div class="dfu-head"><div><h3>Quando rispondono</h3><p class="dfu-hint">A quale tentativo il cliente risponde · clicca per l'elenco</p></div>${typeBtns('when', ['bar', 'doughnut'])}</div>
            <div class="dfu-chart"><canvas id="dfuWhen"></canvas></div>
          </div>
        </div>
        <div class="dfu-card">
          <div class="dfu-head"><div><h3>Per consulente</h3><p class="dfu-hint">Risposte, appuntamenti e a quale tentativo rispondono i suoi clienti · clicca un consulente</p></div></div>
          <div class="dfu-chart" style="height:${Math.max(220, cons.length * 30 + 70)}px"><canvas id="dfuCons"></canvas></div>
          <div class="dfu-tablewrap"><table class="dfu-table"><thead><tr><th>Consulente</th><th>Follow-up</th><th>Risposte</th><th>% risp.</th><th>App.</th><th>% app.</th>
            <th>1ª ch.</th><th>2ª ch.</th><th>WhatsApp</th><th>Mail</th><th>GG3</th><th>Recall</th><th>Mai</th><th>In corso</th><th>Rispondono più spesso</th></tr></thead><tbody>
            ${cons.map(x => `<tr data-cons="${esc(x.c)}"><td><b>${esc(x.c)}</b></td><td>${fmt(x.tot)}</td><td>${fmt(x.resp)}</td><td><span class="dfu-pill" style="--p:${x.tot ? x.resp / x.tot * 100 : 0}%">${pct(x.resp, x.tot)}</span></td>
              <td>${fmt(x.appt)}</td><td>${pct(x.appt, x.tot)}</td><td>${fmt(x.w.s1)}</td><td>${fmt(x.w.s2)}</td><td>${fmt(x.w.wh)}</td><td>${fmt(x.w.mail)}</td><td>${fmt(x.w.s4)}</td>
              <td>${fmt(x.w.recall)}</td><td>${fmt(x.w.never)}</td><td>${fmt(x.pend)}</td><td class="dfu-muted">${esc(x.best)}</td></tr>`).join('')}
          </tbody></table></div>
        </div>
        <div class="dfu-grid">
          <div class="dfu-card">
            <div class="dfu-head"><div><h3>Andamento</h3><p class="dfu-hint">${spanDays(f) > 62 ? 'Settimana per settimana' : 'Giorno per giorno'} (data della trattativa)</p></div>${typeBtns('trend', ['line', 'bar'])}</div>
            <div class="dfu-chart"><canvas id="dfuTrend"></canvas></div>
          </div>
          <div class="dfu-card">
            <div class="dfu-head"><div><h3>Per marchio</h3><p class="dfu-hint">${marchi.length ? 'Follow-up, risposte e appuntamenti per marchio' : 'Nessun marchio indicato nel periodo'}${senzaMarca && marchi.length ? ` · ${fmt(senzaMarca)} senza marchio` : ''}</p></div></div>
            <div class="dfu-chart" style="height:${Math.max(220, marchi.length * 28 + 70)}px"><canvas id="dfuBrand"></canvas></div>
          </div>
        </div>
        <div class="dfu-card">
          <div class="dfu-head"><div><h3>Recall Follow-up dei clienti che non hanno risposto</h3><p class="dfu-hint">${fmt(recallTot.length)} follow-up passati al Recall (solo quelli dal 24/08/2026)</p></div></div>
          <div class="dfu-recall">${[['RISPOSTO', 'Hanno risposto', '#00c853'], ['IN_CORSO', 'In corso', '#4a90d9'], ['FALLITO', 'Falliti', '#ff3d3d']].map(([s, l, c]) => {
            const n = recallTot.filter(r => r.recall.status === s).length;
            return `<button type="button" data-list="rc_${s}" class="dfu-rbox" style="--c:${c}"><span>${l}</span><b>${fmt(n)}</b><em>${pct(n, recallTot.length)}</em></button>`; }).join('')}
            ${[1, 2, 3].map(n => { const v = recallTot.filter(r => r.recall.answeredStep === n).length;
              return `<button type="button" data-list="rcs_${n}" class="dfu-rbox" style="--c:#f0a030"><span>Risposto allo step ${n}</span><b>${fmt(v)}</b><em>${pct(v, recallTot.length)}</em></button>`; }).join('')}
          </div>
        </div>`;

        drawWhen(); drawCons(cons); drawTrend(f); drawBrand(marchi);
    }

    function typeBtns(id, types) {
        const ico = { bar: '▮▮', doughnut: '◯', line: '⟋' };
        const cur = tipi[id] || types[0];
        return `<div class="dfu-types">${types.map(t => `<button type="button" data-tipo="${id}|${t}" class="${cur === t ? 'on' : ''}" title="${t}">${ico[t]}</button>`).join('')}</div>`;
    }
    const ink = () => getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#9aa4b2';
    const grid = 'rgba(255,255,255,.07)';
    const valuePlugin = tot => ({
        id: 'dfuVals',
        afterDatasetsDraw(ch) {
            if (ch.config.type !== 'bar' || ch.options.dfuNoVals) return;
            const { ctx } = ch; ctx.save(); ctx.font = '600 11px Inter, system-ui, sans-serif'; ctx.fillStyle = getComputedStyle(document.body).color || '#e8edf3'; ctx.textBaseline = 'middle';
            const meta = ch.getDatasetMeta(0), ds = ch.data.datasets[0];
            meta.data.forEach((el, i) => { const v = ds.data[i]; if (!v) return; const t = `${fmt(v)} · ${pct(v, tot)}`;
                if (ch.options.indexAxis === 'y') { ctx.textAlign = 'left'; ctx.fillText(t, el.x + 6, el.y); } else { ctx.textAlign = 'center'; ctx.fillText(t, el.x, el.y - 10); } });
            ctx.restore();
        }
    });

    function drawWhen() {
        const tipo = tipi.when || 'bar', tot = rows.length;
        const voci = WHEN.map(w => [w[0], w[1], w[2], rows.filter(r => r.when === w[0]).length]).filter(v => v[3]);
        const cfg = { type: tipo, data: { labels: voci.map(v => v[1]), datasets: [{ data: voci.map(v => v[3]), backgroundColor: voci.map(v => v[2]), borderRadius: tipo === 'bar' ? 6 : 0, borderWidth: 0, maxBarThickness: 26 }] },
            options: { maintainAspectRatio: false, indexAxis: 'y', layout: { padding: { right: 80 } },
                plugins: { legend: { display: tipo === 'doughnut', position: 'right', labels: { color: ink(), usePointStyle: true, boxWidth: 8,
                        generateLabels: ch => ch.data.labels.map((l, i) => ({ text: `${l} · ${fmt(voci[i][3])} (${pct(voci[i][3], tot)})`, fillStyle: voci[i][2], strokeStyle: voci[i][2], pointStyle: 'circle', index: i, fontColor: ink() })) } },
                    tooltip: { callbacks: { label: c => ` ${fmt(c.raw)} clienti · ${pct(c.raw, tot)}` } } },
                scales: tipo === 'bar' ? { x: { beginAtZero: true, ticks: { color: ink(), precision: 0 }, grid: { color: grid } }, y: { ticks: { color: ink() }, grid: { display: false } } } : {},
                onClick: (e, els) => { if (els.length) showList('when_' + voci[els[0].index][0]); } },
            plugins: [valuePlugin(tot)] };
        if (tipo === 'doughnut') { delete cfg.options.indexAxis; cfg.options.layout = {}; cfg.options.cutout = '58%'; }
        charts.push(new Chart(document.getElementById('dfuWhen'), cfg));
    }
    function drawCons(cons) {
        const labels = cons.map(x => x.c);
        const ser = [['Risposto', x => x.resp, '#00c853'], ['Non risponde', x => x.nr, '#ff3d3d'], ['In corso', x => x.pend + x.w.recall * 0, '#5c6b80']];
        charts.push(new Chart(document.getElementById('dfuCons'), {
            type: 'bar',
            data: { labels, datasets: ser.map(([l, fn, c]) => ({ label: l, data: cons.map(fn), backgroundColor: c, stack: 's', borderRadius: 4, maxBarThickness: 22 }))
                .concat([{ label: 'Appuntamenti', data: cons.map(x => x.appt), backgroundColor: '#f0c040', stack: 'a', borderRadius: 4, maxBarThickness: 10 }]) },
            options: { indexAxis: 'y', maintainAspectRatio: false, dfuNoVals: true,
                plugins: { legend: { position: 'top', labels: { color: ink(), usePointStyle: true, boxWidth: 8 } },
                    tooltip: { callbacks: { label: c => { const x = cons[c.dataIndex]; return ` ${c.dataset.label}: ${fmt(c.raw)} · ${pct(c.raw, x.tot)}`; } } } },
                scales: { x: { stacked: true, beginAtZero: true, ticks: { color: ink(), precision: 0 }, grid: { color: grid } }, y: { stacked: true, ticks: { color: ink(), autoSkip: false }, grid: { display: false } } },
                onClick: (e, els) => { if (els.length) showList('cons_' + cons[els[0].index].c); } }
        }));
    }
    function spanDays(f) { return Math.round((new Date(f.to) - new Date(f.from)) / 864e5) + 1; }
    function drawTrend(f) {
        const tipo = tipi.trend || 'line', week = spanDays(f) > 62;
        const keyOf = d => { if (!week) return d; const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
        const keys = []; const start = new Date(f.from + 'T12:00:00'), end = new Date(f.to + 'T12:00:00');
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) { const k = keyOf(d.toISOString().slice(0, 10)); if (!keys.includes(k)) keys.push(k); }
        const lab = k => (week ? 'sett. ' : '') + k.slice(8, 10) + '/' + k.slice(5, 7);
        const serie = [['Follow-up', r => true, '#4a90d9'], ['Risposte', r => ['s1', 's2', 'wh', 'mail', 's4', 'manual'].includes(r.when), '#00c853'], ['Appuntamenti', r => r.appointment, '#f0c040']];
        charts.push(new Chart(document.getElementById('dfuTrend'), {
            type: tipo,
            data: { labels: keys.map(lab), datasets: serie.map(([l, fn, c]) => ({ label: l, data: keys.map(k => rows.filter(r => keyOf(r.workDate) === k && fn(r)).length), borderColor: c, backgroundColor: tipo === 'bar' ? c : c + '22',
                tension: 0, pointRadius: 3, fill: false, borderRadius: 4, maxBarThickness: 18 })) },
            options: { maintainAspectRatio: false, dfuNoVals: true,
                plugins: { legend: { position: 'top', labels: { color: ink(), usePointStyle: true, boxWidth: 8 } } },
                scales: { x: { ticks: { color: ink(), maxRotation: 0, autoSkip: true }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: ink(), precision: 0 }, grid: { color: grid } } } }
        }));
    }
    function drawBrand(marchi) {
        if (!marchi.length) return;
        charts.push(new Chart(document.getElementById('dfuBrand'), {
            type: 'bar',
            data: { labels: marchi.map(m => m.m), datasets: [
                { label: 'Follow-up', data: marchi.map(m => m.tot), backgroundColor: '#4a90d9', borderRadius: 4, maxBarThickness: 12 },
                { label: 'Risposte', data: marchi.map(m => m.resp), backgroundColor: '#00c853', borderRadius: 4, maxBarThickness: 12 },
                { label: 'Appuntamenti', data: marchi.map(m => m.appt), backgroundColor: '#f0c040', borderRadius: 4, maxBarThickness: 12 }] },
            options: { indexAxis: 'y', maintainAspectRatio: false, dfuNoVals: true,
                plugins: { legend: { position: 'top', labels: { color: ink(), usePointStyle: true, boxWidth: 8 } },
                    tooltip: { callbacks: { afterBody: it => { const m = marchi[it[0].dataIndex]; return `Tasso di risposta ${pct(m.resp, m.tot)} · appuntamenti ${pct(m.appt, m.tot)}`; } } } },
                scales: { x: { beginAtZero: true, ticks: { color: ink(), precision: 0 }, grid: { color: grid } }, y: { ticks: { color: ink(), autoSkip: false }, grid: { display: false } } },
                onClick: (e, els) => { if (els.length) showList('brand_' + marchi[els[0].index].m); } }
        }));
    }

    // ===== elenchi (finestra dettaglio della dashboard) =====
    const LISTS = {
        all: ['Follow-up', () => rows],
        contacted: ['Contattati', () => rows.filter(r => r.contacted || r.status !== 'IN_PROGRESS')],
        responded: ['Hanno risposto', () => rows.filter(r => ['s1', 's2', 'wh', 'mail', 's4', 'manual'].includes(r.when))],
        appt: ['Appuntamenti', () => rows.filter(r => r.appointment)],
        never: ['Non risponde', () => rows.filter(r => r.status === 'ABANDONED')],
        pending: ['In corso', () => rows.filter(r => r.when === 'pending')],
        recall: ['Risposti nel Recall', () => rows.filter(r => r.when === 'recall')]
    };
    function showList(key) {
        let title, list;
        if (LISTS[key]) [title, list] = [LISTS[key][0], LISTS[key][1]()];
        else if (key.startsWith('when_')) { const w = key.slice(5); title = 'Quando rispondono · ' + WHEN_LABEL[w]; list = rows.filter(r => r.when === w); }
        else if (key.startsWith('cons_')) { const c = key.slice(5); title = 'Consulente · ' + c; list = rows.filter(r => (r.consultant || 'Senza consulente') === c); }
        else if (key.startsWith('brand_')) { const m = key.slice(6).toLowerCase(); title = 'Marchio · ' + key.slice(6); list = rows.filter(r => (r.marca || '').trim().toLowerCase() === m); }
        else if (key.startsWith('rc_')) { const s = key.slice(3); title = 'Recall Follow-up · ' + ({ RISPOSTO: 'Hanno risposto', IN_CORSO: 'In corso', FALLITO: 'Falliti' })[s]; list = rows.filter(r => r.recall && r.recall.status === s); }
        else if (key.startsWith('rcs_')) { const n = +key.slice(4); title = 'Recall · risposto allo step ' + n; list = rows.filter(r => r.recall && r.recall.answeredStep === n); }
        else return;
        const modal = document.getElementById('statDetailModal'), box = document.getElementById('statDetailList'), t = document.getElementById('statDetailTitle');
        if (!modal || !box) return;
        t.textContent = `${title} (${list.length})`;
        const STATO = { RESPONDED: '<span style="color:#00c853;font-weight:700">Risponde</span>', ABANDONED: '<span style="color:#ff3d3d;font-weight:700">Non risponde</span>', IN_PROGRESS: '<span style="color:#f0c040;font-weight:700">In corso</span>' };
        box.innerHTML = list.length ? `<div class="dfu-list">${list.slice().sort((a, b) => a.workDate.localeCompare(b.workDate)).map(r => `
            <button type="button" class="dfu-li" data-go="${r.id}" data-date="${r.workDate}">
              <span><b>${esc(r.customer)}</b><em>${esc(r.phone || '')}${r.marca ? ' · 🚗 ' + esc(r.marca) + ' ' + esc(r.modello || '') : ''}</em></span>
              <span>${esc(r.consultant || '')}<em>${r.workDate.slice(8, 10)}/${r.workDate.slice(5, 7)}/${r.workDate.slice(0, 4)}</em></span>
              <span>${STATO[r.status] || ''}${r.appointment ? ' · 📅' : ''}<em>${esc(WHEN_LABEL[r.when])}</em></span></button>`).join('')}</div>`
            : '<div class="empty-state" style="padding:30px"><p>Nessun cliente</p></div>';
        box.onclick = e => { const b = e.target.closest('[data-go]'); if (b && typeof goToFollowUpFromDashboard === 'function') goToFollowUpFromDashboard(b.dataset.date, +b.dataset.go); };
        modal.style.display = 'flex';
    }

    function onClick(e) {
        const tb = e.target.closest('[data-tipo]');
        if (tb) { const [id, t] = tb.dataset.tipo.split('|'); tipi[id] = t; try { localStorage.setItem(LS, JSON.stringify(tipi)); } catch (er) { /* */ }
            const { from, to, consultant } = (typeof getStatsQueryParams === 'function') ? getStatsQueryParams() : {};
            render({ from, to, consultant }); return; }
        const l = e.target.closest('[data-list]'); if (l) { showList(l.dataset.list); return; }
        const c = e.target.closest('[data-cons]'); if (c) showList('cons_' + c.dataset.cons);
    }

    window.FuAnalysis = { load };
})();
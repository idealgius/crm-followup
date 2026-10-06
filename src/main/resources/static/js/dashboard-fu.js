/* =====================================================================
   DASHBOARD FOLLOW-UP — analisi (Gruppo Autoscala CRM)
   ---------------------------------------------------------------------
   Dati: GET /api/stats/followups/analysis?from&to[&consultant]  (una riga
   per follow-up con step, esiti e Recall). Stessa grafica delle sezioni
   Consegne / Stock: ogni grafico ha "Voci", ciambella / colonne / linee,
   numeri e percentuali, report sotto, clic = elenco dei clienti.

   NON tocca: filtri in alto, i 5 riquadri originali, i calendari, la
   Lista Recall e il Report lavoro giornaliero. Aggiunge sotto i riquadri
   una seconda fila (contattati, non risponde, in corso, tempo alla
   risposta, risposti nel Recall) nello stesso stile, e sotto i calendari
   i nuovi grafici. loadStats() (charts.js) chiama FuAnalysis.load().
   ===================================================================== */
(function () {
    let rows = [], charts = new Map(), kpiEl = null, boxEl = null, period = {};
    const LS = 'dash_fu_tipi_v2';
    let tipi = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } })();
    const hidden = {};
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = n => Number(n || 0).toLocaleString('it-IT');
    const pct = (n, t) => t ? (Math.round(n / t * 1000) / 10).toLocaleString('it-IT') + '%' : '0%';
    const PALETTE = ['#4f8cff', '#f4a83a', '#34c38f', '#e5484d', '#9b7bff', '#2bb3c0', '#ff7eb6', '#8d99ae', '#c9a227', '#6f5cff', '#00b894', '#ff8f5c'];

    // ===== a quale tentativo risponde il cliente =====
    // Le risposte arrivano solo dalle CHIAMATE (step 1, 2 e 4). WhatsApp e mail dello step 3
    // sono INVII: si contano a parte ("dopo un WhatsApp / una mail" solo come informazione).
    // Risposta al WhatsApp / alla mail: solo se c'e' una prova, cioe' una NOTA sullo step 3 oppure
    // la scheda segnata "Risponde" senza nessuna chiamata risposta dopo l'invio (step 4 non segnato).
    // Altrimenti il WhatsApp / la mail e' solo INVIATO.
    const WHEN = [
        ['s1', '1ª chiamata (mattina)', '#34c38f'], ['s2', '2ª chiamata (pomeriggio)', '#2bb3c0'],
        ['wh', 'Risposto al WhatsApp', '#25d366'], ['mail', 'Risposto alla mail', '#4f8cff'], ['s4', '3ª chiamata (GG3)', '#9b7bff'],
        ['emailonly', 'Risposto alla mail (cliente solo email)', '#4f8cff'], ['manual', 'Risposto (step non segnato)', '#8d99ae'],
        ['recall', 'Risposto nel Recall', '#f4a83a'], ['never', 'Mai risposto', '#e5484d'], ['pending', 'Ancora in corso', '#5c6b80']];
    const WHEN_LABEL = Object.fromEntries(WHEN.map(w => [w[0], w[1]]));
    const RISP = ['s1', 's2', 'wh', 'mail', 's4', 'emailonly', 'manual'];
    // invio dello step 3: 'wh', 'mail' o null
    const sent3 = r => { const s3 = (r.steps || []).find(s => s.n === 3); if (!s3 || r.emailOnly) return null;
        if (s3.outcome === 'SENT_WHATSAPP' || (s3.channel === 'WHATSAPP' && ['SENT', 'ANSWERED'].includes(s3.outcome))) return 'wh';
        if (s3.outcome === 'SENT_MAIL' || (s3.channel === 'EMAIL' && ['SENT', 'ANSWERED'].includes(s3.outcome))) return 'mail';
        return null; };
    function classify(r) {
        const st = r.steps || [];
        const ans = st.filter(s => s.outcome === 'ANSWERED' && s.channel === 'CALL').sort((a, b) => a.n - b.n)[0];
        r.contacted = st.some(s => s.outcome && s.outcome !== 'PENDING') || r.status !== 'IN_PROGRESS';
        r.answeredAt = ans ? ans.at : null;
        const s3 = st.find(s => s.n === 3), inv = sent3(r);
        if (ans) return ans.n === 1 ? 's1' : ans.n === 2 ? 's2' : 's4';
        // nessuna chiamata risposta: ha risposto al messaggio se c'e' la nota sullo step 3
        // oppure se la scheda e' stata segnata "Risponde" dopo l'invio
        if (inv && ((s3 && s3.hasNotes) || r.status === 'RESPONDED')) return inv;
        if (r.status === 'RESPONDED') return r.emailOnly ? 'emailonly' : 'manual';
        if (r.recall && r.recall.status === 'RISPOSTO') return 'recall';
        if (r.status === 'ABANDONED') return 'never';
        return 'pending';
    }

    // ===== definizione dei grafici =====
    const esitoOf = r => RISP.includes(r.when) ? 'Risposto' : r.status === 'ABANDONED' ? 'Non risponde' : 'In corso';
    const CARDS = [
        { id: 'esito', t: 'Esito dei follow-up', hint: 'Chi ha risposto (con o senza appuntamento), chi non risponde, chi è ancora in corso', types: ['doughnut', 'bar', 'line'],
          voci: () => [['Risposto con appuntamento', r => esitoOf(r) === 'Risposto' && r.appointment, '#f4c84a'], ['Risposto senza appuntamento', r => esitoOf(r) === 'Risposto' && !r.appointment, '#34c38f'],
              ['Non risponde', r => esitoOf(r) === 'Non risponde', '#e5484d'], ['In corso', r => esitoOf(r) === 'In corso', '#8d99ae']]
              .map(([k, fn, c]) => ({ key: k, label: k, color: c, list: rows.filter(fn) })) },
        { id: 'when', t: 'Quando rispondono', hint: 'A quale tentativo il cliente risponde', types: ['bar', 'doughnut', 'line'],
          voci: () => WHEN.map(w => ({ key: w[0], label: w[1], color: w[2], list: rows.filter(r => r.when === w[0]) })) },
        { id: 'invii', t: 'Step 3: WhatsApp e mail inviati', hint: 'Risposto al messaggio = nota sullo step 3 o scheda su "Risponde" senza chiamata dopo · altrimenti solo inviato', types: ['bar', 'doughnut', 'line'],
          voci: () => [['wh_r', 'WhatsApp → ha risposto al messaggio', r => sent3(r) === 'wh' && r.when === 'wh', '#25d366'],
              ['wh_c', 'WhatsApp → ha risposto alla chiamata del GG3', r => sent3(r) === 'wh' && r.when === 's4', '#1bb37a'],
              ['wh_no', 'WhatsApp → solo inviato, nessuna risposta', r => sent3(r) === 'wh' && !['wh', 's4'].includes(r.when), '#1f5f43'],
              ['ml_r', 'Mail → ha risposto alla mail', r => sent3(r) === 'mail' && r.when === 'mail', '#4f8cff'],
              ['ml_c', 'Mail → ha risposto alla chiamata del GG3', r => sent3(r) === 'mail' && r.when === 's4', '#6f7dff'],
              ['ml_no', 'Mail → solo inviata, nessuna risposta', r => sent3(r) === 'mail' && !['mail', 's4'].includes(r.when), '#2c4a9e']]
              .map(([k, l, fn, c]) => ({ key: k, label: l, color: c, list: rows.filter(fn) })), base: () => rows.filter(r => sent3(r)) },
        { id: 'cons', t: 'Per consulente', hint: 'Risposte, appuntamenti e a quale tentativo rispondono i clienti di ogni consulente', types: ['bar', 'doughnut', 'line'], wide: true,
          voci: () => [...new Set(rows.map(r => r.consultant || 'Senza consulente'))].map((c, i) => ({ key: c, label: c, color: PALETTE[i % PALETTE.length],
              list: rows.filter(r => (r.consultant || 'Senza consulente') === c) })).sort((a, b) => b.list.length - a.list.length) },
        { id: 'brand', t: 'Per marchio', hint: 'Follow-up per marchio della vettura · tasso di risposta e appuntamenti nel report', types: ['bar', 'doughnut', 'line'],
          voci: () => [...new Set(rows.map(r => (r.marca || '').trim() || 'Non indicato'))].map((m, i) => ({ key: m, label: m, color: m === 'Non indicato' ? '#8d99ae' : PALETTE[i % PALETTE.length],
              list: rows.filter(r => ((r.marca || '').trim() || 'Non indicato').toLowerCase() === m.toLowerCase()) })).sort((a, b) => (a.key === 'Non indicato') - (b.key === 'Non indicato') || b.list.length - a.list.length) },
        { id: 'recall', t: 'Recall Follow-up', hint: 'Clienti che non hanno risposto: com\'è andato il ciclo di ricontatto (dal 24/08/2026)', types: ['doughnut', 'bar', 'line'], base: () => rows.filter(r => r.recall),
          voci: () => [['RISPOSTO', 'Hanno risposto', '#34c38f'], ['IN_CORSO', 'In corso', '#4f8cff'], ['FALLITO', 'Falliti', '#e5484d']]
              .map(([k, l, c]) => ({ key: k, label: l, color: c, list: rows.filter(r => r.recall && r.recall.status === k) })) }
    ];

    // ===== caricamento =====
    async function load(from, to, consultant) {
        mount(); period = { from, to, consultant };
        if (!from || !to || !boxEl) return;
        boxEl.classList.add('dfu-loading');
        try {
            const qs = new URLSearchParams({ from, to }); if (consultant) qs.set('consultant', consultant);
            const res = await fetch('/api/stats/followups/analysis?' + qs);
            if (!res.ok) { boxEl.innerHTML = '<div class="dfu-card"><p class="dfu-hint">Analisi non disponibile.</p></div>'; return; }
            rows = ((await res.json()).rows || []);
            rows.forEach(r => { r.when = classify(r); });
            render();
        } catch (e) { console.error('Dashboard follow-up:', e); }
        finally { boxEl.classList.remove('dfu-loading'); }
    }

    function mount() {
        injectCss();
        if (boxEl && document.body.contains(boxEl)) return;
        const page = document.getElementById('dashboardPage'); if (!page) return;
        const grid = page.querySelector('.stats-grid:not(.dfu-kpis)'), cal = page.querySelector('.dashboard-calendars-row');
        // i riquadri originali vengono sostituiti da questi (stesso stile stat-card, con le percentuali sotto)
        if (grid) grid.style.display = 'none';
        kpiEl = document.createElement('div'); kpiEl.className = 'dfu-kpis';
        if (grid) grid.parentNode.insertBefore(kpiEl, grid.nextSibling); else page.appendChild(kpiEl);
        boxEl = document.createElement('div'); boxEl.className = 'dfu-box';
        if (cal) cal.parentNode.insertBefore(boxEl, cal.nextSibling); else page.appendChild(boxEl);
        const old = page.querySelector('[data-chart="G_DASH_FOLLOWUP"]'); if (old) old.style.display = 'none';
        boxEl.addEventListener('click', onClick); boxEl.addEventListener('change', onChange); kpiEl.addEventListener('click', onClick);
        document.addEventListener('click', e => { if (boxEl && !e.target.closest('.dfu-voci')) boxEl.querySelectorAll('.dfu-voci.open').forEach(x => x.classList.remove('open')); });
    }

    // ===== disegno =====
    function render() {
        const tot = rows.length;
        const resp = rows.filter(r => RISP.includes(r.when)), nr = rows.filter(r => r.status === 'ABANDONED');
        const giorni = resp.filter(r => r.answeredAt).map(r => Math.max(0, Math.round((new Date(r.answeredAt.slice(0, 10)) - new Date(r.workDate)) / 864e5)));
        const media = giorni.length ? giorni.reduce((a, b) => a + b, 0) / giorni.length : null;
        const inRecall = rows.filter(r => r.recall);
        // seconda fila di riquadri, stesso stile dei 5 originali (stat-card)
        const card = (cls, key, label, val, sub) => `<div class="stat-card ${cls} ${key ? 'stat-card-clickable' : ''}" ${key ? `data-list="${key}"` : ''}><div class="stat-label">${label}</div><div class="stat-value">${val}</div><div class="dfu-sub">${sub}</div></div>`;
        const nApp0 = rows.filter(r => r.appointment).length, nPend = rows.filter(r => r.when === 'pending').length;
        kpiEl.innerHTML =
            card('green', 'all', 'FOLLOW-UP TOTALI', fmt(tot), period.consultant ? esc(period.consultant) : 'tutti i consulenti') +
            card('blue', 'responded', 'RISPOSTE RICEVUTE', fmt(resp.length), `<b>${pct(resp.length, tot)}</b> tasso di risposta`) +
            card('gold', 'appt', 'APPUNTAMENTI', fmt(nApp0), `<b>${pct(nApp0, tot)}</b> sul totale · <b>${pct(nApp0, resp.length)}</b> su chi risponde`) +
            card('pink', 'never', 'NON RISPONDE', fmt(nr.length), `<b>${pct(nr.length, tot)}</b> · passati al Recall`) +
            card('purple', 'pending', 'IN CORSO', fmt(nPend), `<b>${pct(nPend, tot)}</b> da completare`) +
            card('blue', '', 'TEMPO ALLA RISPOSTA', media == null ? '—' : media.toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' gg', 'media dalla trattativa') +
            card('gold', 'recall', 'RISPOSTI NEL RECALL', fmt(rows.filter(r => r.when === 'recall').length), `su ${fmt(inRecall.length)} in Recall Follow-up`);

        charts.forEach(c => c.destroy()); charts.clear();
        if (!tot) { boxEl.innerHTML = '<div class="dfu-card"><p class="dfu-hint">Nessun follow-up nel periodo scelto.</p></div>'; return; }
        const nApp = nApp0;
        const funnel = [['all', 'Follow-up', tot, '#4f8cff'], ['responded', 'Hanno risposto', resp.length, '#34c38f'], ['appt', 'Appuntamento', nApp, '#f4c84a']];
        boxEl.innerHTML = `<div class="dfu-grid">
            <div class="dfu-card"><header><div><h3>Imbuto</h3><p class="dfu-hint">Dove si perdono i clienti · clicca una fascia</p></div></header>
              <div class="dfu-funnel">${funnel.map(([id, l, n, c]) => `<button type="button" data-list="${id}" class="dfu-fstep"><span>${l}</span>
                <span class="dfu-fbar"><i style="width:${Math.max(2, n / tot * 100)}%;background:${c}"></i></span><b>${fmt(n)}</b><em>${pct(n, tot)}</em></button>`).join('')}</div>
              <p class="dfu-hint" style="margin-top:14px">Appuntamenti: <b>${pct(nApp, tot)}</b> sul totale · <b>${pct(nApp, resp.length)}</b> su chi risponde</p></div>
            ${CARDS.map(cardHtml).join('')}</div>`;
        CARDS.forEach(drawCard);
    }

    const ICO = {
        doughnut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/></svg>',
        bar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 20V11M12 20V5M18 20v-6"/></svg>',
        line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-6 4 3 5-7 4 4"/></svg>' };
    const NOMI = { doughnut: 'Ciambella', bar: 'Colonne', line: 'Andamento nel tempo' };
    const tipoOf = c => tipi[c.id] && c.types.includes(tipi[c.id]) ? tipi[c.id] : c.types[0];
    function cardHtml(c) {
        return `<div class="dfu-card ${c.wide ? 'wide' : ''}" data-card="${c.id}">
            <header><div><h3>${c.t}</h3><p class="dfu-hint">${c.hint}</p></div>
              <div class="dfu-hbtns"><div class="dfu-voci"><button type="button" class="dfu-voci-btn" data-vbtn="${c.id}">Voci ▾</button><div class="dfu-voci-pop" data-vpop="${c.id}"></div></div>
              <div class="dfu-types">${c.types.map(t => `<button type="button" title="${NOMI[t]}" data-tipo="${c.id}|${t}" class="${tipoOf(c) === t ? 'on' : ''}">${ICO[t]}</button>`).join('')}</div></div></header>
            <div class="dfu-chart"><div class="dfu-canvas"><canvas id="dfu_${c.id}"></canvas></div><ul class="dfu-legend" data-legend="${c.id}"></ul></div>
            <div class="dfu-report" data-rep="${c.id}"></div></div>`;
    }

    const ink = () => getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#98a6b6';
    const ink1 = () => getComputedStyle(document.body).color || '#e8edf3';
    const grid = 'rgba(140,150,170,.15)';
    const barLabels = {
        id: 'dfuBarLabels',
        afterDatasetsDraw(ch) {
            const o = ch.options.plugins.dfuBarLabels; if (!o) return;
            const { ctx } = ch, ds = ch.data.datasets[0], meta = ch.getDatasetMeta(0);
            ctx.save(); ctx.font = '600 11px Inter, system-ui, sans-serif'; ctx.fillStyle = ink1(); ctx.textBaseline = 'middle';
            meta.data.forEach((el, i) => { const v = ds.data[i]; if (!v) return; const t = `${fmt(v)} · ${pct(v, o.tot)}`;
                if (ch.options.indexAxis === 'y') { ctx.textAlign = 'left'; ctx.fillText(t, el.x + 6, el.y); } else { ctx.textAlign = 'center'; ctx.fillText(t, el.x, el.y - 10); } });
            ctx.restore();
        }
    };
    function periodKeys() {
        const from = new Date(period.from + 'T12:00:00'), to = new Date(period.to + 'T12:00:00'), week = (to - from) / 864e5 > 62;
        const keyOf = d => { if (!week) return d; const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
        const keys = []; for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) { const k = keyOf(d.toISOString().slice(0, 10)); if (!keys.includes(k)) keys.push(k); }
        return { keys, keyOf, label: k => (week ? 'sett. ' : '') + k.slice(8, 10) + '/' + k.slice(5, 7) };
    }

    function drawCard(c) {
        const all = c.voci(), hid = hidden[c.id] || new Set();
        const voci = all.filter(v => !hid.has(v.key) && v.list.length && !v.extra);   // "di cui con appuntamento" solo nel report
        const base = c.base ? c.base().length : rows.length;
        const tipo = tipoOf(c), el = document.getElementById('dfu_' + c.id); if (!el) return;
        const wrap = el.closest('.dfu-chart'), box = el.parentElement;
        wrap.classList.toggle('dn', tipo === 'doughnut');
        const horiz = tipo === 'bar' && (voci.length > 6 || voci.some(v => v.label.length > 18));
        box.style.height = horiz ? Math.max(260, voci.length * 28 + 50) + 'px' : (tipo === 'line' && voci.length > 6 ? 300 + Math.ceil(voci.length / 4) * 22 : 260) + 'px';
        updateVociBtn(c, all);
        drawReport(c, all, base);
        const leg = wrap.querySelector('[data-legend]'); leg.innerHTML = '';
        if (!voci.length) return;
        const open = v => showList(`${c.t} · ${v.label}`, v.list);
        let cfg;
        if (tipo === 'line') {
            const P = periodKeys();
            cfg = { type: 'line', data: { labels: P.keys.map(P.label), datasets: voci.map(v => ({ label: v.label, data: P.keys.map(k => v.list.filter(r => P.keyOf(r.workDate) === k).length),
                    borderColor: v.color, backgroundColor: v.color, tension: 0, pointRadius: 3, borderWidth: 2.2 })) },
                options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: ink(), usePointStyle: true, boxWidth: 8, padding: 12 } } },
                    scales: { x: { ticks: { color: ink(), maxRotation: 0, autoSkip: true }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: ink(), precision: 0 }, grid: { color: grid } } },
                    onClick: (e, els) => { if (!els.length) return; const v = voci[els[0].datasetIndex], k = P.keys[els[0].index];
                        showList(`${c.t} · ${v.label} · ${P.label(k)}`, v.list.filter(r => P.keyOf(r.workDate) === k)); } } };
        } else if (c.id === 'cons' && tipo === 'bar') {
            const ser = [['Risposto', r => RISP.includes(r.when), '#34c38f'], ['Non risponde', r => r.status === 'ABANDONED', '#e5484d'], ['In corso', r => !RISP.includes(r.when) && r.status !== 'ABANDONED', '#8d99ae']];
            box.style.height = Math.max(260, voci.length * 32 + 70) + 'px';
            cfg = { type: 'bar', data: { labels: voci.map(v => v.label), datasets: ser.map(([l, fn, col]) => ({ label: l, data: voci.map(v => v.list.filter(fn).length), backgroundColor: col, stack: 's', borderRadius: 4, maxBarThickness: 20 }))
                    .concat([{ label: 'Appuntamenti', data: voci.map(v => v.list.filter(r => r.appointment).length), backgroundColor: '#f4c84a', stack: 'a', borderRadius: 4, maxBarThickness: 8 }]) },
                options: { indexAxis: 'y', maintainAspectRatio: false,
                    plugins: { legend: { position: 'top', labels: { color: ink(), usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: t => ` ${t.dataset.label}: ${fmt(t.raw)} · ${pct(t.raw, voci[t.dataIndex].list.length)}` } } },
                    scales: { x: { stacked: true, beginAtZero: true, ticks: { color: ink(), precision: 0 }, grid: { color: grid } }, y: { stacked: true, ticks: { color: ink(), autoSkip: false }, grid: { display: false } } },
                    onClick: (e, els) => { if (!els.length) return; const v = voci[els[0].index], s = els[0].datasetIndex;
                        if (s === 3) showList(`${v.label} · appuntamenti`, v.list.filter(r => r.appointment)); else showList(`${v.label} · ${ser[s][0]}`, v.list.filter(ser[s][1])); } } };
        } else {
            cfg = { type: tipo, data: { labels: voci.map(v => v.label), datasets: [{ data: voci.map(v => v.list.length), backgroundColor: voci.map(v => v.color), borderWidth: tipo === 'doughnut' ? 2 : 0, borderColor: 'rgba(0,0,0,.25)', borderRadius: tipo === 'bar' ? 6 : 0, maxBarThickness: horiz ? 22 : 44 }] },
                options: { maintainAspectRatio: false, indexAxis: horiz ? 'y' : 'x', cutout: tipo === 'doughnut' ? '58%' : undefined,
                    layout: { padding: tipo === 'bar' ? (horiz ? { right: 90 } : { top: 22 }) : 0 },
                    plugins: { legend: { display: false }, dfuBarLabels: tipo === 'bar' ? { tot: base } : false,
                        tooltip: { callbacks: { label: t => ` ${fmt(t.raw)} clienti · ${pct(t.raw, base)}` } } },
                    scales: tipo === 'bar' ? (horiz
                        ? { x: { beginAtZero: true, ticks: { color: ink(), precision: 0 }, grid: { color: grid } }, y: { ticks: { color: ink(), autoSkip: false }, grid: { display: false } } }
                        : { y: { beginAtZero: true, ticks: { color: ink(), precision: 0 }, grid: { color: grid } }, x: { ticks: { color: ink(), autoSkip: false, maxRotation: 0, callback: function (v) { const s = String(this.getLabelForValue(v)); return s.length > 14 ? s.slice(0, 13) + '…' : s; } }, grid: { display: false } } }) : {},
                    onClick: (e, els) => { if (els.length) open(voci[els[0].index]); } },
                plugins: [barLabels] };
        }
        charts.set(c.id, new Chart(el, cfg));
        // legenda della ciambella (scorrevole, con numeri e %)
        leg.innerHTML = tipo === 'doughnut' ? voci.map((v, i) => `<li data-li="${i}"><i style="background:${v.color}"></i><span>${esc(v.label)}</span><b>${fmt(v.list.length)}</b><em>${pct(v.list.length, base)}</em></li>`).join('') : '';
        leg.onclick = e => { const li = e.target.closest('[data-li]'); if (li) open(voci[+li.dataset.li]); };
    }

    // ===== report sotto il grafico =====
    function drawReport(c, all, base) {
        const box = boxEl.querySelector(`[data-rep="${c.id}"]`); if (!box) return;
        const hid = hidden[c.id] || new Set();
        const voci = all.filter(v => v.list.length);
        if (c.id === 'cons' || c.id === 'brand') {
            const cols = c.id === 'cons'
                ? ['Follow-up', 'Risposte', '% risp.', 'App.', '% app.', '1ª ch.', '2ª ch.', 'Risp. WhatsApp', 'Risp. mail', '3ª ch. (GG3)', 'Recall', 'Mai', 'In corso', 'WhatsApp inviati', 'Mail inviate', 'Rispondono più spesso']
                : ['Follow-up', '%', 'Risposte', '% risp.', 'App.', '% app.'];
            box.innerHTML = `<div class="dfu-table"><table class="${c.id}"><thead><tr><th>${c.id === 'cons' ? 'Consulente' : 'Marchio'}</th>${cols.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>
              ${voci.map((v, i) => { const l = v.list, r = l.filter(x => RISP.includes(x.when)).length, a = l.filter(x => x.appointment).length;
                const w = k => l.filter(x => x.when === k).length;
                const best = WHEN.slice(0, 5).map(x => [x[1], w(x[0])]).sort((p, q) => q[1] - p[1])[0];
                const cells = c.id === 'cons'
                    ? [fmt(l.length), fmt(r), `<span class="dfu-pill" style="--p:${l.length ? r / l.length * 100 : 0}%">${pct(r, l.length)}</span>`, fmt(a), pct(a, l.length),
                       fmt(w('s1')), fmt(w('s2')), fmt(w('wh')), fmt(w('mail')), fmt(w('s4')), fmt(w('recall')), fmt(w('never')), fmt(w('pending')),
                       fmt(l.filter(x => sent3(x) === 'wh').length), fmt(l.filter(x => sent3(x) === 'mail').length), `<span class="dfu-best">${best && best[1] ? best[0] : '—'}</span>`]
                    : [fmt(l.length), pct(l.length, base), fmt(r), `<span class="dfu-pill" style="--p:${l.length ? r / l.length * 100 : 0}%">${pct(r, l.length)}</span>`, fmt(a), pct(a, l.length)];
                return `<tr data-row="${i}" class="${hid.has(v.key) ? 'dfu-off' : ''}"><td><i style="background:${v.color}"></i>${esc(v.label)}</td>${cells.map(x => `<td>${x}</td>`).join('')}</tr>`; }).join('')}
              </tbody></table></div>`;
        } else {
            box.innerHTML = `<div class="dfu-table"><table><thead><tr><th>Voce</th><th>Clienti</th><th>%</th></tr></thead><tbody>
              ${voci.map((v, i) => `<tr data-row="${i}" class="${hid.has(v.key) ? 'dfu-off' : ''} ${v.extra ? 'dfu-extra' : ''}"><td><i style="background:${v.color}"></i>${esc(v.label)}</td><td>${fmt(v.list.length)}</td><td>${pct(v.list.length, base)}</td></tr>`).join('')}
              <tr class="dfu-tot"><td>Totale</td><td>${fmt(base)}</td><td>100%</td></tr></tbody></table></div>`;
        }
        box.onclick = e => { const tr = e.target.closest('tr[data-row]'); if (!tr) return; const v = voci[+tr.dataset.row]; showList(`${c.t} · ${v.label}`, v.list); };
    }

    // ===== menu "Voci" =====
    function updateVociBtn(c, all) {
        const b = boxEl.querySelector(`[data-vbtn="${c.id}"]`); if (!b) return;
        const hid = hidden[c.id] || new Set(), list = all.filter(v => v.list.length), off = list.filter(v => hid.has(v.key)).length;
        b.textContent = off ? `Voci ${list.length - off}/${list.length} ▾` : 'Voci ▾'; b.classList.toggle('on', off > 0);
        boxEl.querySelector(`[data-vpop="${c.id}"]`).innerHTML = `<div class="dfu-voci-all"><button type="button" data-vall="${c.id}|1">Seleziona tutte</button><button type="button" data-vall="${c.id}|0">Deseleziona tutte</button></div>
            <div class="dfu-voci-list">${list.map(v => `<label><input type="checkbox" data-vv="${c.id}" value="${esc(v.key)}" ${hid.has(v.key) ? '' : 'checked'}><i style="background:${v.color}"></i><span>${esc(v.label)}</span><em>${fmt(v.list.length)}</em></label>`).join('')}</div>`;
    }
    function redraw(id) { const c = CARDS.find(x => x.id === id); const ch = charts.get(id); if (ch) { ch.destroy(); charts.delete(id); } drawCard(c); }

    // ===== elenchi =====
    const LISTS = {
        all: ['Follow-up', () => rows],
        responded: ['Hanno risposto', () => rows.filter(r => RISP.includes(r.when))], appt: ['Appuntamenti', () => rows.filter(r => r.appointment)],
        never: ['Non risponde', () => rows.filter(r => r.status === 'ABANDONED')], pending: ['In corso', () => rows.filter(r => r.when === 'pending')],
        recall: ['Risposti nel Recall', () => rows.filter(r => r.when === 'recall')] };
    function showList(title, list) {
        const modal = document.getElementById('statDetailModal'), box = document.getElementById('statDetailList'), t = document.getElementById('statDetailTitle');
        if (!modal || !box) return;
        t.textContent = `${title} (${list.length})`;
        const STATO = { RESPONDED: '<span style="color:#34c38f;font-weight:700">Risponde</span>', ABANDONED: '<span style="color:#e5484d;font-weight:700">Non risponde</span>', IN_PROGRESS: '<span style="color:#f4c84a;font-weight:700">In corso</span>' };
        box.innerHTML = list.length ? `<div class="dfu-list">${list.slice().sort((a, b) => a.workDate.localeCompare(b.workDate)).map(r => `
            <button type="button" class="dfu-li" data-go="${r.id}" data-date="${r.workDate}">
              <span><b>${esc(r.customer)}</b><em>${esc(r.phone || '')}${r.marca ? ' · 🚗 ' + esc(r.marca) + ' ' + esc(r.modello || '') : ''}</em></span>
              <span>${esc(r.consultant || '')}<em>${r.workDate.slice(8, 10)}/${r.workDate.slice(5, 7)}/${r.workDate.slice(0, 4)}</em></span>
              <span>${STATO[r.status] || ''}${r.appointment ? ' · 📅 App.' : ''}<em>${esc(WHEN_LABEL[r.when])}</em></span></button>`).join('')}</div>`
            : '<div class="empty-state" style="padding:30px"><p>Nessun cliente</p></div>';
        box.onclick = e => { const b = e.target.closest('[data-go]'); if (b && typeof goToFollowUpFromDashboard === 'function') goToFollowUpFromDashboard(b.dataset.date, +b.dataset.go); };
        modal.style.display = 'flex';
    }

    function onClick(e) {
        const tb = e.target.closest('[data-tipo]');
        if (tb) { const [id, t] = tb.dataset.tipo.split('|'); tipi[id] = t; try { localStorage.setItem(LS, JSON.stringify(tipi)); } catch (er) { /* */ }
            tb.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === tb)); redraw(id); return; }
        const vb = e.target.closest('[data-vbtn]');
        if (vb) { const box = vb.parentElement, op = box.classList.contains('open'); boxEl.querySelectorAll('.dfu-voci.open').forEach(x => x.classList.remove('open')); if (!op) box.classList.add('open'); return; }
        const va = e.target.closest('[data-vall]');
        if (va) { const [id, on] = va.dataset.vall.split('|'); const c = CARDS.find(x => x.id === id);
            hidden[id] = on === '1' ? new Set() : new Set(c.voci().map(v => v.key)); redraw(id); va.closest('.dfu-voci').classList.add('open'); return; }
        if (e.target.closest('.dfu-voci')) return;
        const l = e.target.closest('[data-list]'); if (l && LISTS[l.dataset.list]) { const [t, fn] = LISTS[l.dataset.list]; showList(t, fn()); }
    }
    function onChange(e) {
        const cb = e.target.closest('[data-vv]'); if (!cb) return;
        const id = cb.dataset.vv, h = hidden[id] = hidden[id] || new Set();
        if (cb.checked) h.delete(cb.value); else h.add(cb.value);
        redraw(id); boxEl.querySelector(`[data-vpop="${id}"]`).closest('.dfu-voci').classList.add('open');
    }

    // ===== stili (inclusi qui: la pagina e' sempre impaginata anche senza file CSS) =====
    const CSS = `
.dfu-kpis { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:16px; margin-bottom:20px; }
.dfu-kpis .stat-card { min-width:0; }
.dfu-kpis .stat-value { white-space:nowrap; }
.dfu-kpis .dfu-sub { font-size:11.5px; color:var(--text-secondary); margin-top:4px; line-height:1.35; }
.dfu-kpis .dfu-sub b { color:var(--text-primary,#fff); }
@media (max-width:1400px) { .dfu-kpis { grid-template-columns:repeat(4,minmax(0,1fr)); } }
@media (max-width:760px) { .dfu-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } }
.dfu-box { margin:0 0 20px; transition:opacity .2s; }
.dfu-box.dfu-loading { opacity:.55; }
.dfu-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }
.dfu-card { background:var(--bg-card); border:1.5px solid var(--border); border-radius:14px; padding:20px; box-shadow:var(--shadow); min-width:0; }
.dfu-card.wide { grid-column:1 / -1; }
.dfu-card header { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
.dfu-card h3 { margin:0; font-size:14px; font-weight:800; letter-spacing:.8px; text-transform:uppercase; }
.dfu-hint { margin:4px 0 0; font-size:12px; color:var(--text-secondary); }
.dfu-hbtns { display:flex; gap:6px; align-items:center; flex-shrink:0; }
.dfu-types { display:flex; gap:3px; background:rgba(140,150,170,.12); border-radius:10px; padding:3px; }
.dfu-types button { width:30px; height:28px; border:0; border-radius:8px; background:transparent; display:grid; place-items:center; cursor:pointer; color:var(--text-secondary); }
.dfu-types button svg { width:16px; height:16px; }
.dfu-types button.on { background:var(--bg-card); color:var(--text-primary,#fff); box-shadow:0 1px 3px rgba(0,0,0,.25); }
.dfu-voci { position:relative; }
.dfu-voci-btn { height:34px; padding:0 11px; border-radius:10px; border:0; background:rgba(140,150,170,.12); color:var(--text-secondary); font-weight:700; font-size:12px; cursor:pointer; white-space:nowrap; }
.dfu-voci-btn.on { background:#2c4a6e; color:#fff; }
.dfu-voci-pop { display:none; position:absolute; right:0; top:100%; margin-top:6px; z-index:50; width:270px; max-height:340px; flex-direction:column; overflow:hidden;
  background:var(--bg-card); border:1px solid var(--border); border-radius:12px; box-shadow:0 18px 40px -12px rgba(0,0,0,.6); }
.dfu-voci.open .dfu-voci-pop { display:flex; }
.dfu-voci-all { display:flex; gap:6px; padding:8px; border-bottom:1px solid var(--border); }
.dfu-voci-all button { flex:1; border:0; border-radius:8px; padding:7px; background:rgba(140,150,170,.12); color:inherit; font-weight:700; font-size:11.5px; cursor:pointer; }
.dfu-voci-list { overflow:auto; padding:6px 8px 8px; }
.dfu-voci-list label { display:flex; align-items:center; gap:8px; padding:5px 6px; border-radius:8px; font-size:12.5px; cursor:pointer; }
.dfu-voci-list label:hover { background:rgba(140,150,170,.1); }
.dfu-voci-list input { margin:0; width:15px; height:15px; flex:none; }
.dfu-voci-list i { width:9px; height:9px; border-radius:3px; flex:none; }
.dfu-voci-list span { flex:1; }
.dfu-voci-list em { font-style:normal; font-size:11px; color:var(--text-secondary); }
.dfu-chart { display:block; margin:12px 0 8px; }
.dfu-chart.dn { display:flex; gap:16px; align-items:center; }
.dfu-canvas { position:relative; height:260px; }
.dfu-chart.dn .dfu-canvas { flex:0 0 52%; min-width:0; }
.dfu-legend { display:none; list-style:none; margin:0; padding:0; }
.dfu-chart.dn .dfu-legend { display:block; flex:1; min-width:0; max-height:250px; overflow:auto; }
.dfu-legend li { display:grid; grid-template-columns:10px minmax(0,1fr) auto auto; gap:8px; align-items:center; padding:5px 6px; border-radius:8px; font-size:12.5px; cursor:pointer; }
.dfu-legend li:hover { background:rgba(140,150,170,.1); }
.dfu-legend i { width:10px; height:10px; border-radius:3px; }
.dfu-legend span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dfu-legend em { font-style:normal; font-size:11px; color:var(--text-secondary); min-width:42px; text-align:right; }
.dfu-table { max-height:300px; overflow:auto; }
.dfu-table table { width:100%; border-collapse:collapse; font-size:12.5px; white-space:nowrap; }
.dfu-table th { position:sticky; top:0; background:var(--bg-card); text-align:right; font-size:10.5px; letter-spacing:.5px; text-transform:uppercase; color:var(--text-secondary); padding:7px 8px; border-bottom:1.5px solid var(--border); }
.dfu-table td { padding:7px 8px; border-bottom:1px solid var(--border); text-align:right; }
.dfu-table th:first-child, .dfu-table td:first-child { text-align:left; }
.dfu-table td i { display:inline-block; width:9px; height:9px; border-radius:3px; margin-right:7px; }
.dfu-table tr[data-row] { cursor:pointer; }
.dfu-table tr[data-row]:hover td { background:rgba(140,150,170,.08); }
.dfu-table tr.dfu-off td { opacity:.45; }
.dfu-table tr.dfu-extra td { font-style:italic; }
.dfu-table tr.dfu-tot td { font-weight:800; }
.dfu-best { color:var(--text-secondary); }
.dfu-table table.cons th:last-child, .dfu-table table.cons td:last-child { text-align:left; }
.dfu-pill { display:inline-block; min-width:56px; text-align:center; padding:2px 8px; border-radius:999px; font-weight:700; background:linear-gradient(90deg, rgba(52,195,143,.4) var(--p), rgba(140,150,170,.12) var(--p)); }
.dfu-funnel { display:flex; flex-direction:column; gap:10px; margin-top:14px; }
.dfu-fstep { display:grid; grid-template-columns:130px 1fr 54px 56px; align-items:center; gap:10px; border:0; background:none; color:inherit; font:inherit; cursor:pointer; padding:7px; border-radius:10px; text-align:left; }
.dfu-fstep:hover { background:rgba(140,150,170,.08); }
.dfu-fstep span:first-child { font-weight:700; font-size:13px; }
.dfu-fbar { height:22px; border-radius:7px; background:rgba(140,150,170,.12); overflow:hidden; }
.dfu-fbar i { display:block; height:100%; border-radius:7px; }
.dfu-fstep b { font-size:16px; text-align:right; }
.dfu-fstep em { font-style:normal; font-size:12px; color:var(--text-secondary); text-align:right; }
.dfu-list { display:flex; flex-direction:column; gap:6px; }
.dfu-li { display:grid; grid-template-columns:1.4fr 1fr 1fr; gap:10px; text-align:left; border:1px solid var(--border); background:rgba(140,150,170,.05); border-radius:10px; padding:10px 12px; cursor:pointer; color:inherit; font:inherit; font-size:13px; }
.dfu-li:hover { border-color:#4f8cff; }
.dfu-li em { display:block; font-style:normal; font-size:11.5px; color:var(--text-secondary); margin-top:2px; }
@media (max-width:1100px) { .dfu-grid { grid-template-columns:1fr; } }
@media (max-width:600px) { .dfu-chart.dn { display:block; } .dfu-fstep { grid-template-columns:100px 1fr 44px; } .dfu-fstep em { display:none; } .dfu-li { grid-template-columns:1fr; } .dfu-card header { flex-wrap:wrap; } }`;
    function injectCss() {
        if (document.getElementById('dfuStyle')) return;
        const st = document.createElement('style'); st.id = 'dfuStyle'; st.textContent = CSS; document.head.appendChild(st);
    }

    window.FuAnalysis = { load };
})();
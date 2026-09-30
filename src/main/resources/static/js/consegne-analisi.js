/* =====================================================================
   CONSEGNE → ANALISI AVANZAMENTO
   ---------------------------------------------------------------------
   Report e grafici presi dal foglio "AVANZAMENTO 2026" (scheda DATABASE),
   gli stessi dati che il server rilegge ogni 5 minuti (o importati da CSV).

   - Filtri: periodo dal/al, anno, mesi, finanziaria (una o piu'), sede,
     consulente, B2C/B2B (all'apertura entrambi).
   - Riquadri: contratti validi, annullati, Lojack, Polizza FIR, Mawdy.
   - Una card per categoria con 3 tipi di grafico (ciambella / colonne /
     linee mese per mese) e il report (voce, numero, %), cliccabile.
   - Export Excel (server, Apache POI) con piu' fogli e grafici nativi.

   Regole:
   - Periodo: vale la DATA del contratto (letta anche se scritta male,
     es. 2701/2026); se proprio non e' leggibile si usa la colonna MESE.
   - Annullate: contano solo in Esito, Stato e Consulenti; tutte le altre
     categorie si calcolano sui contratti VALIDI (non annullati).
   - Solo Mawdy: vale solo se in GARANZIA c'e' "MAWDY" (12 mesi legale,
     "No garanzia B2B", "." e vuoto = non venduta).
   - Consulenti: il nome del foglio e' collegato al nome completo del CSV
     trattative (es. CLAUDIO -> Claudio Filosa, CLAUDIO G -> Claudio Gerardi).
   ===================================================================== */
(function () {
    const A = () => window.Consegne && Consegne.api;
    const MESI = ['', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    const MESI_UP = MESI.map(m => m.toUpperCase());
    const PALETTE = ['#5b8cff', '#f4a83a', '#34c38f', '#e5484d', '#9b7bff', '#2bb3c0', '#ff7eb6', '#8d99ae', '#c9a227', '#6c5ce7', '#00b894', '#fd79a8', '#636e72', '#e17055'];
    const TYPES = { doughnut: 'Ciambella', bar: 'Colonne', line: 'Linee' };
    // colori fissi per le voci con un significato (verde = ok, ambra = in corso, rosso = annullata, grigio = assente)
    const FIXED = { 'Consegnate': '#34c38f', 'Da consegnare': '#f4a83a', 'Annullate': '#e5484d', 'Installato': '#34c38f', 'Non installato': '#a4adba',
        'Non venduta': '#a4adba', 'Non specificato': '#c3c9d2', 'Contanti': '#8d99ae', 'Altri': '#b2bec3' };
    const colorOf = (label, i) => FIXED[label] || PALETTE[i % PALETTE.length];
    // i valori del foglio in MAIUSCOLO (stati) si mostrano "Normali"; nomi e marchi restano come sono
    const lbl = v => (String(v) === String(v).toUpperCase() && /[A-Z]{3}/.test(String(v))) ? A().cap(v) : String(v);
    const LS_TYPES = 'consegne_analisi_grafici_v1';

    let el = null, rows = [], csvSig = null;
    let F = { dal: '', al: '', anno: '', mesi: new Set(), fin: new Set(), sede: new Set(), vend: new Set(), tipo: new Set() };
    let chartTypes = {};
    const charts = new Map();

    /* ================= lettura del foglio ================= */
    const up = s => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
    const BRAND_FIX = [[/^PEUG/, 'Peugeot'], [/^CITR/, 'Citroen'], [/^(VOLKS|VW\b)/, 'Volkswagen'], [/^MERC/, 'Mercedes'], [/^ALFA/, 'Alfa Romeo'],
        [/^LAND/, 'Land Rover'], [/^MG\b/, 'MG'], [/^DS\b/, 'DS'], [/^BMW/, 'BMW'], [/^BYD/, 'BYD'], [/^KIA/, 'Kia'], [/^ICH/, 'ICH-X'], [/^DR\b/, 'DR'], [/^EVO\b/, 'EVO']];
    function marchio(modello) {
        const w = up(modello).split(' ')[0] || '';
        if (!w) return 'Non specificato';
        for (const [re, n] of BRAND_FIX) if (re.test(w)) return n;
        return w.charAt(0) + w.slice(1).toLowerCase();
    }
    const FIN = { 'AGOS': 'Agos', 'CA BANK': 'CA Bank', 'COMPASS': 'Compass', 'DEUTSCHE': 'Deutsche Bank', 'DEUTSCHE BANK': 'Deutsche Bank',
        'FINDOMESTIC': 'Findomestic', 'SANTANDER': 'Santander', 'SATANDER': 'Santander', 'FIN CASA MADRE': 'Fin Casa Madre' };
    function finanziaria(p) {
        const v = up(p);
        if (!v) return 'Non specificato';
        if (v === 'PC') return 'Contanti';
        return FIN[v] || (v.charAt(0) + v.slice(1).toLowerCase());
    }
    const durata = v => { const m = /(\d+)/.exec(v); return m ? `${m[1]} mesi` : v; };

    function load() {
        const api = A(); if (!api) return false;
        const csv = api.csv();
        if (!csv) { rows = []; csvSig = null; return false; }
        const sig = csv.length + ':' + csv.slice(0, 200) + (api.vendMap() ? api.vendMap().size : 0);
        if (sig === csvSig) return true;
        csvSig = sig;
        const vmap = api.vendMap() || new Map();
        const raw = api.parseCSV(csv);
        rows = raw.filter(r => (r['CLIENTE'] || '').trim()).map((r, i) => {
            const d = api.pd(r['DATA']);
            const mMese = MESI_UP.indexOf(up(r['MESE']));
            const m = d ? d.getMonth() + 1 : (mMese > 0 ? mMese : 0);
            const anno = d ? d.getFullYear() : new Date().getFullYear();
            const st = up(r['STATO']).replace(/\s+,/g, ',');
            const esito = st.includes('ANNULLATA') ? 'Annullate' : st.includes('CONSEGNATA') ? 'Consegnate' : 'Da consegnare';
            const vRaw = up(r['VENDITORE']);
            const g = up(r['GARANZIA']), fir = up(r['FIR']);
            return {
                _i: i, data: d, dataFiltro: d || (m ? new Date(anno, m - 1, 1) : null), m, anno,
                cliente: api.nice(r['CLIENTE']), vend: vmap.get(vRaw) || (vRaw ? api.nice(vRaw) : 'Non specificato'),
                tipo: up(r['B2C']) === 'TRUE' ? 'B2B' : 'B2C', fin: finanziaria(r['PAGAMENTO']),
                canale: ({ 'NUOVO': 'Nuovo', 'KM0': 'Km0', 'USATO': 'Usato' })[up(r['CANALE'])] || 'Non specificato',
                prov: ({ 'ITALIANA': 'Italiana', 'ESTERA': 'Estera' })[up(r['PROVENIENZA'])] || 'Non specificato',
                modello: String(r['MODELLO'] || '').replace(/\s+/g, ' ').trim(), marchio: marchio(r['MODELLO']),
                targa: String(r['TARGA/TELAIO'] || '').trim(), stato: st || 'STATO NON INDICATO', esito,
                mawdy: g.includes('MAWDY') ? durata(g) : 'Non venduta',
                fir: fir && /\d/.test(fir) ? durata(fir) : 'Non venduta',
                lojack: up(r['LOJACK']) === 'TRUE' ? 'Installato' : 'Non installato',
                block: up(r['BLOCKSHAFT']) === 'TRUE' ? 'Installato' : 'Non installato',
                install: String(r['INSTALLAZIONE'] || '').split(',').map(x => x.trim()).filter(Boolean).map(x => api.cap(x)),
                sede: ({ 'AGNANO': 'Agnano', 'NOLA': 'Nola', 'SALERNO': 'Salerno' })[up(r['note'] || r['NOTE'])] || (up(r['note'] || r['NOTE']) ? api.cap(r['note'] || r['NOTE']) : 'Non specificato')
            };
        });
        return true;
    }

    /* ================= filtri ================= */
    function filtered() {
        const dal = F.dal ? new Date(F.dal + 'T00:00:00') : null, al = F.al ? new Date(F.al + 'T23:59:59') : null;
        return rows.filter(r => {
            const d = r.dataFiltro;
            if ((dal || al) && !d) return false;
            if (dal && d < dal) return false;
            if (al && d > al) return false;
            if (F.anno && String(d ? d.getFullYear() : r.anno) !== F.anno) return false;
            if (F.mesi.size && !F.mesi.has(d ? d.getMonth() + 1 : r.m)) return false;
            if (F.fin.size && !F.fin.has(r.fin)) return false;
            if (F.sede.size && !F.sede.has(r.sede)) return false;
            if (F.vend.size && !F.vend.has(r.vend)) return false;
            if (F.tipo.size && !F.tipo.has(r.tipo)) return false;
            return true;
        });
    }
    const uniq = (arr) => [...new Set(arr)].sort((a, b) => a.localeCompare(b, 'it'));

    /* ================= categorie ================= */
    // base: 'tutti' = anche annullate; 'validi' = solo non annullate; 'dc' = solo da consegnare
    const CATS = [
        { id: 'esito', t: 'Vendite: consegnate, da consegnare, annullate', base: 'tutti', get: r => r.esito, order: ['Consegnate', 'Da consegnare', 'Annullate'] },
        { id: 'dc', t: 'Vetture da consegnare: stato', base: 'dc', get: r => r.stato },
        { id: 'consulenti', t: 'Consulenti: vendite, consegnate, in lavorazione, annullate', base: 'tutti', get: r => r.vend, special: 'consulenti' },
        { id: 'stato', t: 'Stato (annullate comprese)', base: 'tutti', get: r => r.stato },
        { id: 'fin', t: 'Metodo di pagamento', base: 'validi', get: r => r.fin, special: 'pagamento' },
        { id: 'canale', t: 'Tipologia (Nuovo, Km0, Usato)', base: 'validi', get: r => r.canale, order: ['Nuovo', 'Km0', 'Usato', 'Non specificato'] },
        { id: 'prov', t: 'Provenienza', base: 'validi', get: r => r.prov, order: ['Italiana', 'Estera', 'Non specificato'] },
        { id: 'tipo', t: 'B2C / B2B', base: 'validi', get: r => r.tipo, order: ['B2C', 'B2B'] },
        { id: 'mawdy', t: 'Solo Mawdy', base: 'validi', get: r => r.mawdy, sortNum: true },
        { id: 'fir', t: 'Polizza FIR', base: 'validi', get: r => r.fir, sortNum: true },
        { id: 'lojack', t: 'Lojack', base: 'validi', get: r => r.lojack, order: ['Installato', 'Non installato'] },
        { id: 'block', t: 'Blockshaft', base: 'validi', get: r => r.block, order: ['Installato', 'Non installato'] },
        { id: 'marchio', t: 'Marchio', base: 'validi', get: r => r.marchio, top: 12 },
        { id: 'install', t: 'Altre installazioni', base: 'validi', multi: r => r.install },
        { id: 'sede', t: 'Sede', base: 'validi', get: r => r.sede }
    ];
    // tipo di grafico "migliore" per l'opzione Misti dell'export
    const BEST = { esito: 'line', consulenti: 'bar', stato: 'bar', dc: 'bar', fin: 'doughnut', canale: 'doughnut', prov: 'doughnut', marchio: 'bar',
        mawdy: 'doughnut', fir: 'doughnut', lojack: 'doughnut', block: 'doughnut', install: 'bar', sede: 'doughnut', tipo: 'doughnut' };

    function baseRows(cat, R) {
        return cat.base === 'tutti' ? R : cat.base === 'dc' ? R.filter(r => r.esito === 'Da consegnare') : R.filter(r => r.esito !== 'Annullate');
    }
    function aggregate(cat, R) {
        const B = baseRows(cat, R);
        const map = new Map();
        B.forEach(r => (cat.multi ? cat.multi(r) : [cat.get(r)]).forEach(v => {
            if (!map.has(v)) map.set(v, []);
            map.get(v).push(r);
        }));
        let voci = [...map].map(([label, list]) => ({ label, n: list.length, list }));
        if (cat.order) voci.sort((a, b) => ((cat.order.indexOf(a.label) + 1) || 99) - ((cat.order.indexOf(b.label) + 1) || 99));
        else if (cat.sortNum) voci.sort((a, b) => (parseInt(a.label) || 999) - (parseInt(b.label) || 999));
        else voci.sort((a, b) => b.n - a.n);
        if (cat.top && voci.length > cat.top) {
            const rest = voci.slice(cat.top);
            voci = voci.slice(0, cat.top).concat([{ label: 'Altri', n: rest.reduce((s, v) => s + v.n, 0), list: rest.flatMap(v => v.list) }]);
        }
        return { voci, base: B.length, B };
    }
    // mesi del periodo filtrato (per il grafico a linee)
    function monthKeys(R) {
        const ks = [...new Set(R.filter(r => r.dataFiltro).map(r => r.dataFiltro.getFullYear() * 100 + r.dataFiltro.getMonth() + 1))].sort((a, b) => a - b);
        return ks;
    }
    const mkLabel = k => MESI[k % 100].slice(0, 3) + ' ' + String(Math.floor(k / 100)).slice(2);
    function monthly(voci, R, keyOf) {
        const ks = monthKeys(R);
        const top = voci.filter(v => v.label !== 'Altri').slice(0, 6);
        return { labels: ks.map(mkLabel), series: top.map(v => ({ nome: v.label, valori: ks.map(k => v.list.filter(r => r.dataFiltro && (r.dataFiltro.getFullYear() * 100 + r.dataFiltro.getMonth() + 1) === k).length) })) };
    }

    /* ================= UI ================= */
    function ensure(container) {
        if (el && el === container && el.dataset.ready) return;
        el = container; el.dataset.ready = '1';
        try { chartTypes = JSON.parse(localStorage.getItem(LS_TYPES) || '{}'); } catch (e) { chartTypes = {}; }
        CATS.forEach(c => { if (!TYPES[chartTypes[c.id]]) chartTypes[c.id] = Object.keys(TYPES)[Math.floor(Math.random() * 3)]; });
        saveTypes();
        el.innerHTML = `
          <section class="cg-card cg-an-filters" id="anFilters"></section>
          <section class="cg-an-kpis" id="anKpis"></section>
          <section class="cg-an-grid" id="anGrid"></section>`;
        el.addEventListener('click', onClick);
        el.addEventListener('change', onChange);
        document.addEventListener('click', e => { if (!e.target.closest('.cg-ms')) el.querySelectorAll('.cg-ms.open').forEach(m => m.classList.remove('open')); });
    }
    function saveTypes() { try { localStorage.setItem(LS_TYPES, JSON.stringify(chartTypes)); } catch (e) { /* non bloccante */ } }

    function msHTML(key, label, options) {
        const sel = F[key];
        const txt = sel.size ? (sel.size === 1 ? [...sel][0] : `${sel.size} selezionati`) : 'Tutti';
        return `<div class="cg-ms" data-ms="${key}"><span class="cg-f-lbl">${label}</span>
          <button type="button" class="cg-ms-btn">${A().esc(String(txt))}<span>▾</span></button>
          <div class="cg-ms-pop">${options.map(o => `<label><input type="checkbox" data-msv="${key}" value="${A().esc(String(o.v))}" ${sel.has(o.v) ? 'checked' : ''}>${A().esc(o.l)}</label>`).join('')}
            <button type="button" class="cg-ms-clear" data-msclear="${key}">Tutti</button></div></div>`;
    }
    function renderFilters() {
        const anni = uniq(rows.filter(r => r.dataFiltro).map(r => String(r.dataFiltro.getFullYear())));
        const finOpts = ['Agos', 'CA Bank', 'Compass', 'Deutsche Bank', 'Findomestic', 'Santander', 'Fin Casa Madre']
            .concat(uniq(rows.map(r => r.fin)).filter(f => !['Agos', 'CA Bank', 'Compass', 'Deutsche Bank', 'Findomestic', 'Santander', 'Fin Casa Madre', 'Contanti', 'Non specificato'].includes(f)));
        el.querySelector('#anFilters').innerHTML = `
          <div class="cg-an-frow">
            <label class="cg-f"><span class="cg-f-lbl">Dal</span><input type="date" data-f="dal" value="${F.dal}"></label>
            <label class="cg-f"><span class="cg-f-lbl">Al</span><input type="date" data-f="al" value="${F.al}"></label>
            <label class="cg-f"><span class="cg-f-lbl">Anno</span><select data-f="anno"><option value="">Tutti</option>${anni.map(a => `<option ${F.anno === a ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
            ${msHTML('mesi', 'Mesi', MESI.slice(1).map((m, i) => ({ v: i + 1, l: m })))}
            ${msHTML('fin', 'Pagamento', finOpts.map(f => ({ v: f, l: f })).concat([{ v: 'Contanti', l: 'Contanti' }]))}
            ${msHTML('sede', 'Sede', uniq(rows.map(r => r.sede)).map(v => ({ v, l: v })))}
            ${msHTML('vend', 'Consulente', uniq(rows.map(r => r.vend)).map(v => ({ v, l: v })))}
            ${msHTML('tipo', 'B2C / B2B', [{ v: 'B2C', l: 'B2C' }, { v: 'B2B', l: 'B2B' }])}
          </div>
          <div class="cg-an-factions">
            <button type="button" class="cg-an-link" data-act="finOnly">Solo finanziamenti</button>
            <button type="button" class="cg-an-link" data-act="reset">Azzera filtri</button>
            <button type="button" class="cg-btn cg-an-xls" data-act="excel">⬇ Esporta Excel</button>
          </div>`;
    }

    function pctS(a, b) { return A().pct(a, b); }
    function renderKpis(R) {
        const api = A();
        const tot = R.length, ann = R.filter(r => r.esito === 'Annullate').length, val = tot - ann;
        const V = R.filter(r => r.esito !== 'Annullate');
        const lj = V.filter(r => r.lojack === 'Installato').length, fr = V.filter(r => r.fir !== 'Non venduta').length, mw = V.filter(r => r.mawdy !== 'Non venduta').length;
        const dc = V.filter(r => r.esito === 'Da consegnare').length;
        const k = (id, l, n, sub, dot) => `<button type="button" class="cg-kpi" data-kpi2="${id}"><div class="cg-k-top">${l}<span class="cg-dot" style="background:${dot}"></span></div><div class="cg-num">${api.fmt(n)}</div><div class="cg-sub">${sub}</div></button>`;
        el.querySelector('#anKpis').innerHTML =
            k('val', 'Contratti validi', val, `${pctS(val, tot)} di ${api.fmt(tot)} contratti`, 'var(--cg-teal-soft)') +
            k('ann', 'Annullati', ann, `${pctS(ann, tot)} di ${api.fmt(tot)} contratti`, 'var(--cg-grey-soft)') +
            k('dc', 'Da consegnare', dc, `${pctS(dc, val)} dei validi`, 'var(--cg-amber-soft)') +
            k('lj', 'Lojack', lj, `${pctS(lj, val)} dei validi`, 'var(--cg-violet-soft)') +
            k('fir', 'Polizza FIR', fr, `${pctS(fr, val)} dei validi`, 'var(--cg-violet-soft)') +
            k('mw', 'Mawdy', mw, `${pctS(mw, val)} dei validi`, 'var(--cg-violet-soft)');
    }

    const ICON = {
        doughnut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 4v4.5"/></svg>',
        bar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 20V11M12 20V5M18 20v-6"/></svg>',
        line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-6 4 3 5-7 4 4"/></svg>'
    };
    function renderGrid(R) {
        const api = A();
        charts.forEach(c => c.destroy()); charts.clear();
        el.querySelector('#anGrid').innerHTML = CATS.map(c => `
          <article class="cg-card cg-an-card ${c.special === 'consulenti' || c.id === 'stato' ? 'wide' : ''}" data-cat="${c.id}">
            <header><div><h3>${c.t}</h3><p class="cg-hint" data-sub="${c.id}"></p></div>
              <div class="cg-an-types">${Object.keys(TYPES).map(t => `<button type="button" title="${TYPES[t]}" class="${chartTypes[c.id] === t ? 'on' : ''}" data-type="${t}" data-cat="${c.id}">${ICON[t]}</button>`).join('')}</div></header>
            <div class="cg-an-canvas"><canvas id="anc_${c.id}"></canvas></div>
            <div class="cg-an-table" data-table="${c.id}"></div>
          </article>`).join('');
        CATS.forEach(c => drawCat(c, R));
    }

    function drawCat(c, R) {
        const api = A();
        const agg = aggregate(c, R);
        const card = el.querySelector(`[data-cat="${c.id}"].cg-an-card`);
        const baseLbl = c.base === 'tutti' ? 'contratti (annullate comprese)' : c.base === 'dc' ? 'vetture da consegnare' : 'contratti validi';
        card.querySelector('[data-sub]').textContent = `${api.fmt(agg.base)} ${baseLbl}`;
        // report
        let table;
        if (c.special === 'consulenti') {
            const righe = agg.voci.map(v => {
                const cons = v.list.filter(r => r.esito === 'Consegnate').length, dcn = v.list.filter(r => r.esito === 'Da consegnare').length, an = v.list.filter(r => r.esito === 'Annullate').length;
                return { v, cons, dcn, an, val: v.n - an };
            });
            table = `<table><thead><tr><th>Consulente</th><th>Vendite</th><th>Consegnate</th><th>In lavorazione</th><th>Annullate</th><th>% annullate</th></tr></thead><tbody>` +
                righe.map((x, i) => `<tr data-row="${c.id}|${i}"><td><i style="background:${colorOf(x.v.label, i)}"></i>${api.esc(x.v.label)}</td><td>${api.fmt(x.val)}</td><td>${api.fmt(x.cons)}</td><td>${api.fmt(x.dcn)}</td><td>${api.fmt(x.an)}</td><td>${pctS(x.an, x.v.n)}</td></tr>`).join('') + `</tbody></table>`;
        } else if (c.special === 'pagamento') {
            const fins = agg.voci.filter(v => v.label !== 'Contanti' && v.label !== 'Non specificato');
            const nf = fins.reduce((s, v) => s + v.n, 0);
            table = `<table><thead><tr><th>Voce</th><th>Contratti</th><th>%</th></tr></thead><tbody>` +
                `<tr class="cg-an-sum"><td>Finanziamenti</td><td>${api.fmt(nf)}</td><td>${pctS(nf, agg.base)}</td></tr>` +
                agg.voci.map((v, i) => `<tr data-row="${c.id}|${i}" class="${fins.includes(v) ? 'cg-an-sub' : ''}"><td><i style="background:${colorOf(v.label, i)}"></i>${api.esc(lbl(v.label))}</td><td>${api.fmt(v.n)}</td><td>${pctS(v.n, agg.base)}</td></tr>`).join('') + `</tbody></table>`;
        } else {
            table = `<table><thead><tr><th>Voce</th><th>${c.base === 'dc' ? 'Vetture' : 'Contratti'}</th><th>%</th></tr></thead><tbody>` +
                agg.voci.map((v, i) => `<tr data-row="${c.id}|${i}"><td><i style="background:${colorOf(v.label, i)}"></i>${api.esc(lbl(v.label))}</td><td>${api.fmt(v.n)}</td><td>${pctS(v.n, agg.base)}</td></tr>`).join('') +
                `</tbody></table>` + (c.multi ? `<p class="cg-hint" style="margin-top:6px">Un contratto può avere più installazioni: la % è sul totale dei contratti validi.</p>` : '');
        }
        card.querySelector('[data-table]').innerHTML = agg.voci.length ? table : '<p class="cg-hint">Nessun dato con i filtri scelti.</p>';
        card._agg = agg;
        // grafico
        const canvas = card.querySelector('canvas');
        if (charts.has(c.id)) { charts.get(c.id).destroy(); charts.delete(c.id); }
        if (typeof Chart === 'undefined' || !agg.voci.length) return;
        charts.set(c.id, new Chart(canvas, chartConfig(c, agg, R, chartTypes[c.id])));
    }

    function themeInk() {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        return { ink: dark ? '#c9d2de' : '#44505e', grid: dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)' };
    }
    function chartConfig(c, agg, R, type) {
        const th = themeInk();
        const labels = agg.voci.map(v => lbl(v.label));
        const common = {
            responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
            plugins: { legend: { position: type === 'doughnut' ? 'right' : 'bottom', labels: { color: th.ink, boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11 } } },
                tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label ? ctx.dataset.label + ': ' : ''}${ctx.formattedValue}` } } }
        };
        const axes = { x: { ticks: { color: th.ink, font: { size: 10 } }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: th.ink, precision: 0 }, grid: { color: th.grid } } };
        if (type === 'line') {
            let mm;
            if (c.special === 'consulenti') {
                const top = agg.voci.slice(0, 6);
                const ks = monthKeys(R);
                mm = { labels: ks.map(mkLabel), series: top.map(v => ({ nome: v.label, valori: ks.map(k => v.list.filter(r => r.esito !== 'Annullate' && r.dataFiltro && (r.dataFiltro.getFullYear() * 100 + r.dataFiltro.getMonth() + 1) === k).length) })) };
            } else mm = monthly(agg.voci, R);
            return { type: 'line', data: { labels: mm.labels, datasets: mm.series.map((s, i) => ({ label: lbl(s.nome), data: s.valori, borderColor: colorOf(s.nome, i), backgroundColor: colorOf(s.nome, i) + '22', tension: .35, pointRadius: 3, fill: mm.series.length === 1 })) },
                options: { ...common, scales: axes } };
        }
        if (type === 'bar' && c.special === 'consulenti') {
            const ser = [['Consegnate', 'Consegnate', '#34c38f'], ['In lavorazione', 'Da consegnare', '#f4a83a'], ['Annullate', 'Annullate', '#e5484d']];
            return { type: 'bar', data: { labels, datasets: ser.map(([l, e, col]) => ({ label: l, data: agg.voci.map(v => v.list.filter(r => r.esito === e).length), backgroundColor: col, borderRadius: 4, stack: 's' })) },
                options: { ...common, scales: { x: { ...axes.x, stacked: true }, y: { ...axes.y, stacked: true } } } };
        }
        const data = agg.voci.map(v => v.n);
        if (type === 'bar') {
            return { type: 'bar', data: { labels, datasets: [{ label: 'Contratti', data, backgroundColor: agg.voci.map((v, i) => colorOf(v.label, i)), borderRadius: 6, maxBarThickness: 46 }] },
                options: { ...common, plugins: { ...common.plugins, legend: { display: false } }, scales: axes } };
        }
        return { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: agg.voci.map((v, i) => colorOf(v.label, i)), borderWidth: 2, borderColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#1a212c' : '#fff', hoverOffset: 6 }] },
            options: { ...common, cutout: '62%' } };
    }

    /* ================= interazioni ================= */
    function toRecord(r) {
        return { cliente: r.cliente, marca: '', modello: r.modello, vend: r.vend, chiusura: r.data ? A().fmtD(r.data) : '', consegna: '', prevista: false,
            stato: r.stato, prov: r.prov, tipo: r.canale, targa: r.targa || '—', note: [], k: r.esito === 'Consegnate' ? 0 : r.esito === 'Annullate' ? 'ann' : 'dc' };
    }
    function openList(title, list, base) {
        A().openModal(title, list.map(toRecord), base ? { n: base.n, label: base.label } : null, { reasons: true });
    }
    function onClick(e) {
        const t = e.target.closest('[data-type]');
        if (t) {
            chartTypes[t.dataset.cat] = t.dataset.type; saveTypes();
            const card = t.closest('.cg-an-card');
            card.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('on', b === t));
            drawCat(CATS.find(c => c.id === t.dataset.cat), filtered());
            return;
        }
        const row = e.target.closest('[data-row]');
        if (row) {
            const [cid, i] = row.dataset.row.split('|');
            const c = CATS.find(x => x.id === cid), card = el.querySelector(`.cg-an-card[data-cat="${cid}"]`), v = card._agg.voci[+i];
            openList(`${c.t.split(':')[0]} · ${lbl(v.label)}`, v.list, { n: card._agg.base, label: c.base === 'tutti' ? 'con i filtri scelti' : c.base === 'dc' ? 'da consegnare con i filtri scelti' : 'validi con i filtri scelti' });
            return;
        }
        const k = e.target.closest('[data-kpi2]');
        if (k) {
            const R = filtered(), V = R.filter(r => r.esito !== 'Annullate');
            const map = { val: ['Contratti validi', V], ann: ['Contratti annullati', R.filter(r => r.esito === 'Annullate')], dc: ['Vetture da consegnare', V.filter(r => r.esito === 'Da consegnare')],
                lj: ['Lojack installati', V.filter(r => r.lojack === 'Installato')], fir: ['Polizza FIR venduta', V.filter(r => r.fir !== 'Non venduta')], mw: ['Mawdy venduta', V.filter(r => r.mawdy !== 'Non venduta')] };
            const [tt, list] = map[k.dataset.kpi2];
            openList(tt, list, { n: k.dataset.kpi2 === 'ann' || k.dataset.kpi2 === 'val' ? R.length : V.length, label: k.dataset.kpi2 === 'ann' || k.dataset.kpi2 === 'val' ? 'con i filtri scelti' : 'validi con i filtri scelti' });
            return;
        }
        const ms = e.target.closest('.cg-ms-btn');
        if (ms) { const box = ms.closest('.cg-ms'); const open = box.classList.contains('open'); el.querySelectorAll('.cg-ms.open').forEach(m => m.classList.remove('open')); if (!open) box.classList.add('open'); return; }
        const clr = e.target.closest('[data-msclear]');
        if (clr) { F[clr.dataset.msclear].clear(); update(); return; }
        const act = e.target.closest('[data-act]');
        if (act) {
            if (act.dataset.act === 'reset') { F = { dal: '', al: '', anno: '', mesi: new Set(), fin: new Set(), sede: new Set(), vend: new Set(), tipo: new Set() }; update(); }
            if (act.dataset.act === 'finOnly') { F.fin = new Set(uniq(rows.map(r => r.fin)).filter(f => f !== 'Contanti' && f !== 'Non specificato')); update(); }
            if (act.dataset.act === 'excel') openExport();
        }
    }
    function onChange(e) {
        const f = e.target.closest('[data-f]');
        if (f) { F[f.dataset.f] = f.value; update(); return; }
        const cb = e.target.closest('[data-msv]');
        if (cb) {
            const key = cb.dataset.msv, v = key === 'mesi' ? +cb.value : cb.value;
            if (cb.checked) F[key].add(v); else F[key].delete(v);
            update(key);
        }
    }
    function update(keepOpen) {
        renderFilters();
        if (keepOpen) { const m = el.querySelector(`.cg-ms[data-ms="${keepOpen}"]`); if (m) m.classList.add('open'); }
        const R = filtered();
        renderKpis(R);
        CATS.forEach(c => drawCat(c, R));
    }

    /* ================= export Excel ================= */
    function openExport() {
        const pop = document.createElement('div');
        pop.className = 'cg-ov open';
        pop.innerHTML = `<div class="cg-modal" style="width:min(460px,100%)">
            <div class="cg-m-head"><div><h3>Esporta Excel</h3><div class="cg-stat"><span class="cg-of">Un foglio per categoria, con report e grafico, più l'elenco dei contratti. Valgono i filtri attivi.</span></div></div>
              <button class="cg-x" type="button" data-x>✕</button></div>
            <div class="cg-an-exp">
              <p class="cg-f-lbl">Grafici</p>
              ${[['come', 'Come impostati a video'], ['doughnut', 'Tutti a ciambella'], ['bar', 'Tutti a colonne'], ['line', 'Tutti a linee (andamento mese per mese)'], ['misti', 'Misti (scelgo io il più adatto per ogni categoria)']]
                .map(([v, l], i) => `<label><input type="radio" name="anx" value="${v}" ${i === 0 ? 'checked' : ''}> ${l}</label>`).join('')}
              <button type="button" class="cg-btn" data-go style="margin-top:14px">⬇ Scarica Excel</button>
              <p class="cg-hint" data-msg></p>
            </div></div>`;
        document.body.appendChild(pop);
        const close = () => pop.remove();
        pop.addEventListener('click', ev => { if (ev.target === pop || ev.target.closest('[data-x]')) close(); });
        pop.querySelector('[data-go]').addEventListener('click', async () => {
            const mode = pop.querySelector('input[name="anx"]:checked').value;
            const btn = pop.querySelector('[data-go]'); btn.disabled = true; btn.textContent = 'Preparazione…';
            try { await doExport(mode); close(); }
            catch (err) { pop.querySelector('[data-msg]').textContent = 'Export non riuscito: ' + err.message; btn.disabled = false; btn.textContent = '⬇ Scarica Excel'; }
        });
    }
    function filtriTesto() {
        const p = [];
        if (F.dal || F.al) p.push(`Periodo: ${F.dal || '…'} → ${F.al || '…'}`);
        if (F.anno) p.push(`Anno: ${F.anno}`);
        if (F.mesi.size) p.push(`Mesi: ${[...F.mesi].sort((a, b) => a - b).map(m => MESI[m]).join(', ')}`);
        if (F.fin.size) p.push(`Pagamento: ${[...F.fin].join(', ')}`);
        if (F.sede.size) p.push(`Sede: ${[...F.sede].join(', ')}`);
        if (F.vend.size) p.push(`Consulente: ${[...F.vend].join(', ')}`);
        if (F.tipo.size) p.push(`Tipo: ${[...F.tipo].join(', ')}`);
        return p.length ? p.join(' · ') : 'Nessun filtro (tutti i contratti)';
    }
    async function doExport(mode) {
        const api = A(), R = filtered(), V = R.filter(r => r.esito !== 'Annullate');
        const sezioni = CATS.map(c => {
            const agg = aggregate(c, R);
            const tipo = mode === 'come' ? chartTypes[c.id] : mode === 'misti' ? BEST[c.id] : mode;
            const sec = { nome: c.t.split(':')[0].replace(/[\\/?*\[\]]/g, ' ').trim(), titolo: c.t, tipo, base: agg.base,
                categorie: agg.voci.map(v => lbl(v.label)), serie: [{ nome: 'Contratti', valori: agg.voci.map(v => v.n) }],
                tabella: { intestazioni: ['Voce', 'Contratti', '%'], righe: agg.voci.map(v => [lbl(v.label), v.n, agg.base ? Math.round(v.n / agg.base * 1000) / 10 : 0]) } };
            if (c.special === 'consulenti') {
                const cols = [['Consegnate', 'Consegnate'], ['In lavorazione', 'Da consegnare'], ['Annullate', 'Annullate']];
                sec.serie = cols.map(([l, e]) => ({ nome: l, valori: agg.voci.map(v => v.list.filter(r => r.esito === e).length) }));
                sec.tabella = { intestazioni: ['Consulente', 'Vendite', 'Consegnate', 'In lavorazione', 'Annullate', '% annullate'],
                    righe: agg.voci.map(v => { const an = v.list.filter(r => r.esito === 'Annullate').length; return [v.label, v.n - an, v.list.filter(r => r.esito === 'Consegnate').length, v.list.filter(r => r.esito === 'Da consegnare').length, an, v.n ? Math.round(an / v.n * 1000) / 10 : 0]; }) };
                if (tipo === 'doughnut') sec.serie = [{ nome: 'Contratti', valori: agg.voci.map(v => v.n) }];
            }
            if (tipo === 'line') {
                const mm = monthly(agg.voci, R);
                sec.mesi = { labels: mm.labels, serie: mm.series.map(s => ({ nome: lbl(s.nome), valori: s.valori })) };
            }
            return sec;
        });
        const tot = R.length, ann = R.length - V.length;
        const payload = {
            titolo: 'Consegne · Analisi avanzamento', filtri: filtriTesto(),
            kpi: [['Contratti validi', V.length, tot ? V.length / tot : 0], ['Annullati', ann, tot ? ann / tot : 0],
                ['Da consegnare', V.filter(r => r.esito === 'Da consegnare').length, V.length ? V.filter(r => r.esito === 'Da consegnare').length / V.length : 0],
                ['Lojack', V.filter(r => r.lojack === 'Installato').length, V.length ? V.filter(r => r.lojack === 'Installato').length / V.length : 0],
                ['Polizza FIR', V.filter(r => r.fir !== 'Non venduta').length, V.length ? V.filter(r => r.fir !== 'Non venduta').length / V.length : 0],
                ['Mawdy', V.filter(r => r.mawdy !== 'Non venduta').length, V.length ? V.filter(r => r.mawdy !== 'Non venduta').length / V.length : 0]]
                .map(([nome, n, p]) => ({ nome, valore: n, percentuale: Math.round(p * 1000) / 10 })),
            sezioni,
            contratti: {
                intestazioni: ['Data', 'Cliente', 'Consulente', 'Sede', 'B2C/B2B', 'Tipologia', 'Provenienza', 'Marchio', 'Modello', 'Targa/Telaio', 'Pagamento', 'Stato', 'Esito', 'Mawdy', 'Polizza FIR', 'Lojack', 'Blockshaft', 'Installazioni'],
                righe: R.map(r => [r.data ? api.fmtD(r.data) : '', r.cliente, r.vend, r.sede, r.tipo, r.canale, r.prov, r.marchio, r.modello, r.targa, r.fin, api.cap(r.stato), r.esito, r.mawdy, r.fir, r.lojack, r.block, r.install.join(', ')])
            }
        };
        const res = await fetch('/api/consegne/export-excel', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) { let m = 'Errore ' + res.status; try { m = (await res.json()).error || m; } catch (e) { /* */ } throw new Error(m); }
        const blob = await res.blob();
        const a = document.createElement('a');
        const d = new Date();
        a.href = URL.createObjectURL(blob);
        a.download = `consegne-analisi-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.xlsx`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }

    /* ================= avvio ================= */
    function show(container) {
        ensure(container);
        if (!load()) {
            charts.forEach(c => c.destroy()); charts.clear();
            container.querySelector('#anGrid').innerHTML = '';
            container.querySelector('#anKpis').innerHTML = '';
            container.querySelector('#anFilters').innerHTML = '<p class="cg-hint" style="margin:0">Il foglio DATABASE non è ancora stato letto: premi "Aggiorna dal foglio Google" oppure "Importa foglio (CSV)".</p>';
            return;
        }
        renderFilters();
        const R = filtered();
        renderKpis(R);
        renderGrid(R);
    }
    function refresh() {
        if (el && el.style.display !== 'none' && el.dataset.ready) { csvSig = null; show(el); }
    }
    window.ConsegneAnalisi = { show, refresh };
})();
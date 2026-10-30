/* =====================================================================
   COMMERCIALE · GIACENZA ALLA VENDITA
   ---------------------------------------------------------------------
   Quanti giorni erano in stock le vetture vendute: per tutta l'azienda, per sede e
   per consulente, con il dettaglio di ogni vettura (cliente, targa/telaio, giorni).

   FONTI
   - Contratti RadaR (/api/radar/contratti, file "RadaR_Contratti_….xlsx" caricato da qui o
     da "Importa trattative"): consulente, sede, vettura, targa, telaio, DATA INGRESSO STOCK.
   - Foglio AVANZAMENTO, scheda DATABASE (gia' letto dal Commerciale): la DATA DEL CONTRATTO
     e' quella del foglio. Pulsante "Aggiorna dal foglio" per rileggerlo.
   ABBINAMENTO contratto RadaR <-> riga del foglio: stessa vettura (targa o telaio, anche solo
   le ultime 8 cifre del telaio) entro 60 giorni, altrimenti stesso cliente entro 45 giorni.
   GIORNI DI GIACENZA = data del contratto nel foglio - data di ingresso in stock (RadaR).
   Si contano i contratti venduti/approvati (annullati e bozze no), righe del foglio non ANNULLATE.
   - Senza data di ingresso, o ingresso dopo il contratto: "Non in stock alla firma" (vettura ordinata).
   - Contratti RadaR non trovati nel foglio: elenco a parte; con "Includi i contratti non nel foglio"
     contano con la data di firma di RadaR.
   - Righe del foglio senza contratto RadaR: elenco "Nel foglio ma non in RadaR" (giorni non calcolabili).
   - Data di firma RadaR e data del foglio distanti piu' di 7 giorni: elenco "Date da verificare".

   FILTRI: periodo del Commerciale (anno, da, a) oppure ultimi N giorni; tipo, sede, consulente.
   EXPORT: finestra con la scelta delle voci (azienda, sedi, consulenti) e del contenuto, poi
   Excel (server, come il resto del Commerciale) o PDF (un report per voce).
   Si apre dal menu del Commerciale: Report > Giacenza alla vendita (vista {k:'giac'}).
   ===================================================================== */
(function () {
    const FASCE = [
        { k: 'f1', l: '0-30', min: 0, max: 30, c: '#2f9e6e' },
        { k: 'f2', l: '31-60', min: 31, max: 60, c: '#6bb36a' },
        { k: 'f3', l: '61-90', min: 61, max: 90, c: '#a9bd4e' },
        { k: 'f4', l: '91-120', min: 91, max: 120, c: '#e0b13a' },
        { k: 'f5', l: '121-150', min: 121, max: 150, c: '#e0903a' },
        { k: 'f6', l: '151-180', min: 151, max: 180, c: '#d9683a' },
        { k: 'f7', l: '181-365', min: 181, max: 365, c: '#c0392b' },
        { k: 'f8', l: '>365', min: 366, max: 1e9, c: '#7d2222' }
    ];
    const NS = { k: 'ns', l: 'Non in stock', c: '#8e9aab' };
    const TUTTE = FASCE.concat([NS]);
    const SEDE_R = { agnano: 'Agnano', nola: 'Casamarciano', salerno: 'Salerno' };
    const SEDI = ['Agnano', 'Casamarciano', 'Salerno'];
    const TIPI = ['Usato', 'Km0', 'Nuovo'];
    const LS = 'commerciale_giacenza_v1';
    const pl = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const dd = d => d ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear() : '';
    const tipoDi = t => { const x = pl(t); return x === 'USED' || x === 'USATO' ? 'Usato' : x === 'KM0' ? 'Km0' : x === 'NEW' || x === 'NUOVO' ? 'Nuovo' : 'Non indicato'; };
    const fasciaDi = g => g == null || g < 0 ? NS : FASCE.find(f => g >= f.min && g <= f.max);
    const IF = () => window.ImportFonti;

    // stato dei filtri (resta salvato in questo browser)
    let S = { per: 'comm', gg: 90, tipo: '', sede: '', cons: '', incl: false, vista: 'cons' };
    try { Object.assign(S, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { /* */ }
    const salvaS = () => { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { /* */ } };
    let RD = { rows: null, info: null, loading: false, err: '' }, cache = null, X = null, msg = '', msgErr = false;
    const charts = [];

    async function caricaRadar() {
        if (RD.loading) return;
        RD.loading = true; RD.err = '';
        try {
            const res = await fetch('/api/radar/contratti', { credentials: 'same-origin' });
            let d = null; try { d = await res.json(); } catch (e) { /* */ }
            if (!res.ok) throw new Error((d && d.error) || 'errore ' + res.status);
            RD.rows = Array.isArray(d.rows) ? d.rows : []; RD.info = d; cache = null;
        } catch (e) { RD.err = 'Contratti RadaR non disponibili: ' + e.message; RD.rows = RD.rows || []; }
        finally { RD.loading = false; }
        if (X) X.rerender();
    }

    /* ================= dati ================= */
    function costruisci(ctx) {
        if (cache && cache.rows === RD.rows && cache.righe === ctx.righe) return cache;
        const F = IF().vociFoglio((ctx.righe || []).map(r => r.raw).filter(Boolean)) || [];
        const FF = F.filter(f => f.d && !/ANNULLAT/i.test(f.stato));
        const R = RD.rows.map((r, i) => IF().voceR(r, i)).filter(v => v.d && /vendut|approvat/.test(v.r.st) && !ctx.escluso(v.vend));
        const P = IF().abbina(R, FF, 45);
        const conF = new Map(P.map(p => [p.x, p])), usate = new Set(P.map(p => p.y));
        const rec = R.map(v => {
            const p = conF.get(v), r = v.r;
            const ingr = IF() && r.ingr ? ctx.pd(r.ingr) : null;
            const dataC = p ? p.y.d : v.d;
            const g = ingr ? IF().giorni(ingr, dataC) : null;
            const f = fasciaDi(g);
            return {
                n: r.n, cons: v.vend || 'Non indicato', sede: SEDE_R[r.sede] || 'Agnano', tipo: tipoDi(r.tipo), cliente: ctx.nice(v.cli), targa: r.targa || '', vin: r.vin || '',
                veicolo: [r.marca, r.modello, r.vers].filter(Boolean).join(' '), ingr, firma: v.d, dataC, nelFoglio: !!p, come: p ? p.come : '',
                gg: g, ggR: r.gg, fascia: f.k, diff: p ? Math.abs(IF().giorni(v.d, p.y.d)) : 0, fCli: p ? p.y.cli : '', fStato: p ? p.y.stato : ''
            };
        });
        // righe del foglio senza contratto RadaR: solo da quando RadaR ha i contratti (prima non c'era)
        const da = IF().inizio(R.map(v => v.d));
        const nonR = FF.filter(f => !usate.has(f) && da && f.d >= da);
        cache = { rows: RD.rows, righe: ctx.righe, rec, nonR, da };
        return cache;
    }
    function inPeriodo(d, ctx) {
        if (!d) return false;
        if (S.per === 'gg') { const lim = new Date(); lim.setHours(0, 0, 0, 0); lim.setDate(lim.getDate() - Math.max(1, +S.gg || 90)); return d >= lim; }
        return d.getFullYear() === ctx.anno && d.getMonth() + 1 >= ctx.da && d.getMonth() + 1 <= ctx.a;
    }
    const perTesto = ctx => S.per === 'gg' ? 'ultimi ' + (+S.gg || 90) + ' giorni' : ctx.per;
    function filtrati(ctx) {
        const D = costruisci(ctx);
        const base = D.rec.filter(r => inPeriodo(r.dataC, ctx) && (!S.tipo || r.tipo === S.tipo) && (!S.sede || r.sede === S.sede));
        const V = base.filter(r => (r.nelFoglio || S.incl) && (!S.cons || r.cons === S.cons));
        const soloR = base.filter(r => !r.nelFoglio && (!S.cons || r.cons === S.cons));
        const nonR = S.cons || S.tipo ? [] : D.nonR.filter(f => inPeriodo(f.d, ctx));
        const daVer = V.filter(r => r.nelFoglio && r.diff > 7);
        const consList = [...new Set(base.map(r => r.cons))].sort((x, y) => x.localeCompare(y, 'it'));
        return { V, soloR, nonR, daVer, consList };
    }
    const media = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
    const mediana = a => { if (!a.length) return null; const l = a.slice().sort((x, y) => x - y), m = l.length >> 1; return l.length % 2 ? l[m] : (l[m - 1] + l[m]) / 2; };
    function riga(k, list) {
        const g = list.filter(r => r.fascia !== 'ns').map(r => r.gg);
        const o = { k, n: list.length, m: media(g), med: mediana(g), list };
        TUTTE.forEach(f => { o[f.k] = list.filter(r => r.fascia === f.k).length; });
        o.o90 = list.filter(r => r.gg != null && r.gg > 90).length;
        return o;
    }
    function gruppi(V, key) {
        const m = new Map(); V.forEach(r => { const k = key(r); m.set(k, (m.get(k) || []).concat(r)); });
        return [...m.entries()].map(([k, l]) => riga(k, l));
    }
    const sedeCons = (V, c) => { const m = {}; V.filter(r => r.cons === c).forEach(r => { m[r.sede] = (m[r.sede] || 0) + 1; }); return Object.keys(m).sort((x, y) => m[y] - m[x]).join(' + '); };

    /* ================= disegno ================= */
    function render(ctx) {
        X = ctx;
        const { esc, nf } = ctx;
        charts.splice(0).forEach(c => { try { c.destroy(); } catch (e) { /* */ } });
        const main = ctx.main;
        if (!RD.rows && !RD.err) { main.innerHTML = '<div class="cm-card cm-empty">Caricamento contratti RadaR…</div>'; caricaRadar(); return; }
        if (!IF()) { main.innerHTML = '<div class="cm-card cm-empty">Manca il file import-fonti.js: aggiorna la pagina (Ctrl+F5).</div>'; return; }
        const f1 = x => x == null ? '–' : x.toLocaleString('it-IT', { maximumFractionDigits: 0 });
        const when = iso => iso ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const fi = ctx.foglioInfo || {};
        const fonti = `Contratti RadaR: <b>${RD.info && RD.info.righe ? nf(RD.info.righe) + ' righe · ' + esc(RD.info.file || '') + ' · ' + when(RD.info.aggiornatoAt) + (RD.info.aggiornatoDa ? ' da ' + esc(RD.info.aggiornatoDa) : '') : 'nessun file caricato'}</b>
            &nbsp;|&nbsp; Foglio AVANZAMENTO: <b>${fi.righe ? nf(fi.righe) + ' righe · ' + when(fi.aggiornatoAt) : 'non ancora letto'}</b>`;
        const puo = ctx.puoImportare || (RD.info && RD.info.puoImportare);
        const testa = `<div class="cm-vhead"><div><h2>Giacenza alla vendita</h2><p>Da quanti giorni erano in stock le vetture vendute · ${esc(perTesto(ctx))}${S.tipo ? ' · ' + S.tipo : ''}${S.sede ? ' · ' + ctx.SEDI[S.sede] : ''}${S.cons ? ' · ' + esc(S.cons) : ''}</p></div>
          <div class="cm-tools gz-tools">
            <button type="button" class="cm-link gz-b" data-gz="foglio">↻ Aggiorna dal foglio</button>
            ${puo ? '<label class="cm-link gz-b" title="RadaR_Contratti_….xlsx">⬆ Carica file RadaR<input type="file" accept=".xlsx,.xls" data-gzf hidden></label>' : ''}
            <button type="button" class="cm-link gz-b" data-gz="xls">⬇ Excel</button>
            <button type="button" class="cm-link gz-b" data-gz="pdf">⬇ PDF</button>
          </div></div>
          <div class="cm-hint gz-src">${fonti}</div>
          ${msg ? `<div class="gz-msg ${msgErr ? 'err' : ''}">${esc(msg)}</div>` : ''}${RD.err ? `<div class="gz-msg err">${esc(RD.err)}</div>` : ''}`;
        if (!RD.rows.length) {
            main.innerHTML = `<div class="gz">${testa}<div class="cm-card cm-empty"><h2>Carica il file contratti di RadaR</h2><p>Serve l'Excel "RadaR_Contratti_….xlsx": contiene la data di ingresso in stock di ogni vettura venduta. Puoi caricarlo con "Carica file RadaR" qui sopra oppure da "Importa trattative" → "Carica da RadaR".</p></div></div>`;
            collega(main, ctx); return;
        }
        const { V, soloR, nonR, daVer, consList } = filtrati(ctx);
        const az = riga('Azienda', V);
        // NUOVO: filtro del solo grafico "Vetture vendute per giorni di giacenza" (sede o consulente),
        // sopra ai filtri della pagina. S.gv = '' | 's:Agnano' | 'c:Marco Castaldo'
        const gSedi = SEDI.filter(x => V.some(r => r.sede === x)), gCons = [...new Set(V.map(r => r.cons))].sort((x, y) => x.localeCompare(y, 'it'));
        if (S.gv && !(S.gv.startsWith('s:') ? gSedi.includes(S.gv.slice(2)) : gCons.includes(S.gv.slice(2)))) S.gv = '';
        const gF = S.gv ? (S.gv.startsWith('s:') ? { sede: S.gv.slice(2) } : { cons: S.gv.slice(2) }) : {};
        const gLab = gF.sede ? ctx.SEDI[gF.sede] : gF.cons || (S.cons ? S.cons : S.sede ? ctx.SEDI[S.sede] : 'Azienda');
        const gR = riga(gLab, V.filter(r => (!gF.sede || r.sede === gF.sede) && (!gF.cons || r.cons === gF.cons)));
        const gIn = gR.n - gR.ns;
        const gSel = `<label class="gz-gv">Mostra <select data-gzs="gv"><option value="">${esc(S.cons || (S.sede ? ctx.SEDI[S.sede] : 'Tutta l\'azienda'))}</option>
            ${gSedi.length > 1 ? `<optgroup label="Sede">${gSedi.map(x => `<option value="s:${esc(x)}" ${S.gv === 's:' + x ? 'selected' : ''}>${esc(ctx.SEDI[x])}</option>`).join('')}</optgroup>` : ''}
            ${gCons.length > 1 ? `<optgroup label="Consulente">${gCons.map(x => `<option value="c:${esc(x)}" ${S.gv === 'c:' + x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</optgroup>` : ''}</select></label>`;
        const gKpi = `<div class="gz-gk"><span><b>${nf(gR.n)}</b> vendute</span><span>media <b>${gR.m == null ? '–' : f1(gR.m) + ' gg'}</b></span><span>mediana <b>${gR.med == null ? '–' : f1(gR.med) + ' gg'}</b></span><span>oltre 90 gg <b>${nf(gR.o90)}</b>${gIn ? ' (' + ctx.pct(gR.o90, gIn) + ')' : ''}</span><span>non in stock <b>${nf(gR.ns)}</b></span></div>`;
        const sedi = gruppi(V, r => r.sede).sort((x, y) => SEDI.indexOf(x.k) - SEDI.indexOf(y.k));
        const cons = gruppi(V, r => r.cons).sort((x, y) => y.n - x.n);
        const opt = (list, val, all) => `<option value="">${all}</option>` + list.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('');
        const filtri = `<div class="cm-card gz-f">
            <label>Periodo <select data-gzs="per"><option value="comm" ${S.per === 'comm' ? 'selected' : ''}>Come in alto (${esc(ctx.per)})</option><option value="gg" ${S.per === 'gg' ? 'selected' : ''}>Ultimi giorni…</option></select></label>
            ${S.per === 'gg' ? `<label>Giorni <input type="number" min="1" max="3650" step="1" value="${+S.gg || 90}" data-gzs="gg" style="width:80px"></label>` : ''}
            <label>Tipo <select data-gzs="tipo">${opt(TIPI.map(t => [t, t]), S.tipo, 'Tutti')}</select></label>
            <label>Sede <select data-gzs="sede">${opt(SEDI.map(s => [s, ctx.SEDI[s]]), S.sede, 'Tutte')}</select></label>
            <label>Consulente <select data-gzs="cons">${opt(consList.map(c => [c, c]), S.cons, 'Tutti')}</select></label>
            <label class="gz-tg" title="Contratti RadaR che non risultano nel foglio AVANZAMENTO: contano con la data di firma di RadaR"><input type="checkbox" data-gzs="incl" ${S.incl ? 'checked' : ''}>Includi i contratti non nel foglio (${nf(soloR.length)})</label>
          </div>`;
        const kp = (icon, lab, n, sub, click) => `<${click ? 'button type="button"' : 'div'} class="cm-kpi" ${click ? `data-gzl='${esc(JSON.stringify(click))}'` : ''}><span class="cm-k-top"><span>${lab}</span><span class="cm-dot" style="background:var(--cm-grey-soft)">${icon}</span></span><span class="cm-num">${n}</span><span class="cm-sub">${sub}</span></${click ? 'button' : 'div'}>`;
        const inS = V.filter(r => r.fascia !== 'ns').length;
        const kpis = `<div class="cm-kpis">
            ${kp('🚗', 'Vetture vendute', nf(az.n), `${nf(inS)} erano in stock · ${nf(az.ns)} non in stock alla firma`, { t: 'Tutte le vetture vendute', w: 'all' })}
            ${kp('⏳', 'Giacenza media', az.m == null ? '–' : f1(az.m) + ' gg', az.med == null ? 'nessuna vettura in stock' : 'mediana ' + f1(az.med) + ' giorni')}
            ${kp('⚠️', 'Oltre 90 giorni', nf(az.o90), inS ? ctx.pct(az.o90, inS) + ' delle vetture in stock' : '–', { t: 'Vendute dopo più di 90 giorni', w: 'o90' })}
            ${kp('🛑', 'Oltre 180 giorni', nf(az.f7 + az.f8), inS ? ctx.pct(az.f7 + az.f8, inS) + ' delle vetture in stock' : '–', { t: 'Vendute dopo più di 180 giorni', w: 'o180' })}
            ${kp('📦', 'Non in stock alla firma', nf(az.ns), 'senza data di ingresso o arrivate dopo il contratto', { t: 'Non in stock alla firma', w: 'f', f: 'ns' })}
          </div>`;
        const cella = (r, f, filt) => { const n = r[f.k]; return n ? `<td class="gz-c" data-gzl='${esc(JSON.stringify(Object.assign({ t: r.k + ' · ' + f.l + (f.k === 'ns' ? '' : ' giorni'), w: 'f', f: f.k }, filt)))}' style="--gz:${f.c}">${n}<small class="cm-pc">${ctx.pct(n, r.n).replace(',00', '')}</small></td>` : '<td>–</td>'; };
        const tab = (head, list, filt, conSede, tot) => `<div class="cm-scroll"><table class="cm-t cm-sort gz-t"><tr><th>${head}</th>${conSede ? '<th>Sede</th>' : ''}<th>Vendute</th>${TUTTE.map(f => `<th><i class="gz-sw" style="background:${f.c}"></i>${f.l}</th>`).join('')}<th>Media gg</th><th>Mediana</th></tr>
            ${list.map(r => `<tr ${filt(r.k) ? `data-gzr='${esc(JSON.stringify(filt(r.k)))}'` : ''}><td>${esc(r.k)}</td>${conSede ? `<td class="l">${esc(sedeCons(V, r.k))}</td>` : ''}<td><b>${r.n}</b></td>${TUTTE.map(f => cella(r, f, filt(r.k) || {})).join('')}<td><b>${f1(r.m)}</b></td><td>${f1(r.med)}</td></tr>`).join('')}
            ${tot ? `<tr class="tot"><td>Totale</td>${conSede ? '<td></td>' : ''}<td>${tot.n}</td>${TUTTE.map(f => `<td>${tot[f.k] || '–'}</td>`).join('')}<td>${f1(tot.m)}</td><td>${f1(tot.med)}</td></tr>` : ''}</table></div>`;
        const avvisi = [
            soloR.length && !S.incl ? `<button type="button" class="cm-link" data-gzl='${esc(JSON.stringify({ t: 'Contratti RadaR non trovati nel foglio', w: 'soloR' }))}'>${nf(soloR.length)} contratti RadaR non trovati nel foglio (esclusi)</button>` : '',
            nonR.length ? `<button type="button" class="cm-link" data-gzl='${esc(JSON.stringify({ t: 'Nel foglio ma non in RadaR', w: 'nonR' }))}'>${nf(nonR.length)} righe del foglio senza contratto RadaR (giorni non calcolabili)</button>` : '',
            daVer.length ? `<button type="button" class="cm-link" data-gzl='${esc(JSON.stringify({ t: 'Date da verificare (firma RadaR e foglio distanti più di 7 giorni)', w: 'daVer' }))}'>${nf(daVer.length)} date da verificare</button>` : ''
        ].filter(Boolean).join(' · ');
        main.innerHTML = `<div class="gz">${testa}${filtri}${kpis}
          ${avvisi ? `<div class="gz-msg gz-av">⚠ ${avvisi}</div>` : ''}
          <div class="cm-sec">Azienda</div>
          <div class="gz-g2">
            <div class="cm-card"><div class="gz-gh"><div><h2>Vetture vendute per giorni di giacenza · ${esc(gLab)}</h2><p class="cm-hint">Giorni tra l'ingresso in stock (RadaR) e la data del contratto (foglio) · scegli una sede o un consulente · clicca una colonna per l'elenco</p></div>${gSel}</div>${gKpi}<div class="gz-ch"><canvas id="gzAz"></canvas></div></div>
            <div class="cm-card"><h2>Per sede</h2><p class="cm-hint">Clicca un numero per le vetture · clicca la sede per filtrare</p>${tab('Sede', sedi, k => ({ sede: k }), false, az)}</div>
          </div>
          <div class="cm-sec">Per consulente</div>
          <div class="cm-card"><h2>Fasce di giacenza per consulente</h2><p class="cm-hint">Quante vetture ha venduto ogni consulente per fascia di giorni in stock · clicca una barra per l'elenco</p><div class="gz-ch gz-ch-c" style="height:${Math.max(220, cons.length * 30 + 70)}px"><canvas id="gzCons"></canvas></div></div>
          <div class="cm-card" style="margin-top:16px"><h2>Tabella per consulente</h2><p class="cm-hint">Clicca un numero per vedere le vetture: cliente, targa/telaio e giorni · clicca il nome per filtrare</p>${tab('Consulente', cons, k => ({ cons: k }), true, az)}</div>
          <p class="cm-hint" style="margin-top:12px">${costruisci(ctx).da ? 'I contratti RadaR partono dal ' + dd(costruisci(ctx).da) + ': prima di quella data non ci sono vetture da contare. ' : ''}Data di ingresso = "Data Ingresso Stock" di RadaR (se una vettura viene spostata tra sedi e RadaR aggiorna la data, i giorni partono da lì). Data del contratto = colonna DATA del foglio AVANZAMENTO. Abbinamento RadaR ↔ foglio: stessa targa/telaio, altrimenti stesso cliente entro 45 giorni.</p>
        </div>`;
        collega(main, ctx);
        grafici(ctx, gR, cons, gF);
    }
    function grafici(ctx, az, cons, gF) {
        if (!window.Chart) return;
        const css = n => getComputedStyle(ctx.root).getPropertyValue(n).trim();
        const ink = css('--cm-ink-2') || '#5f7479', line = css('--cm-line') || '#dbe6e8';
        const c1 = ctx.main.querySelector('#gzAz');
        if (c1) charts.push(new Chart(c1, {
            type: 'bar',
            data: { labels: TUTTE.map(f => f.l), datasets: [{ data: TUTTE.map(f => az[f.k]), backgroundColor: TUTTE.map(f => f.c), borderRadius: 6 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.raw} vetture · ${ctx.pct(c.raw, az.n)}` } } },
                scales: { x: { ticks: { color: ink }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: ink, precision: 0 }, grid: { color: line } } },
                onClick: (e, el) => { if (el.length) { const f = TUTTE[el[0].index]; lista(ctx, Object.assign({ t: az.k + ' · ' + f.l + (f.k === 'ns' ? '' : ' giorni'), w: 'f', f: f.k }, gF || {})); } },
                onHover: (e, el) => { e.native.target.style.cursor = el.length ? 'pointer' : 'default'; } }
        }));
        const c2 = ctx.main.querySelector('#gzCons');
        if (c2 && cons.length) charts.push(new Chart(c2, {
            type: 'bar',
            data: { labels: cons.map(r => r.k), datasets: TUTTE.map(f => ({ label: f.l + (f.k === 'ns' ? '' : ' gg'), data: cons.map(r => r[f.k]), backgroundColor: f.c, stack: 's' })) },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { color: ink, boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.raw} su ${cons[c.dataIndex].n}` } } },
                scales: { x: { stacked: true, beginAtZero: true, ticks: { color: ink, precision: 0 }, grid: { color: line } }, y: { stacked: true, ticks: { color: ink, font: { size: 12, weight: '600' } }, grid: { display: false } } },
                onClick: (e, el) => { if (el.length) { const r = cons[el[0].index], f = TUTTE[el[0].datasetIndex]; lista(ctx, { t: r.k + ' · ' + f.l + (f.k === 'ns' ? '' : ' giorni'), w: 'f', f: f.k, cons: r.k }); } },
                onHover: (e, el) => { e.native.target.style.cursor = el.length ? 'pointer' : 'default'; } }
        }));
    }
    function collega(main, ctx) {
        const box = main.querySelector('.gz'); if (!box || box._ok) return; box._ok = 1;
        box.addEventListener('click', e => {
            const l = e.target.closest('[data-gzl]'); if (l) { e.stopPropagation(); lista(ctx, JSON.parse(l.dataset.gzl)); return; }
            const r = e.target.closest('tr[data-gzr]');
            if (r && !e.target.closest('th')) { e.stopPropagation(); Object.assign(S, JSON.parse(r.dataset.gzr)); salvaS(); ctx.rerender(); return; }
            const b = e.target.closest('[data-gz]'); if (!b) return;
            if (b.dataset.gz === 'foglio') aggiorna(ctx, b);
            if (b.dataset.gz === 'xls') apriExport(ctx, 'xlsx');
            if (b.dataset.gz === 'pdf') apriExport(ctx, 'pdf');
        });
        box.addEventListener('change', e => {
            const f = e.target.closest('[data-gzf]'); if (f) { caricaFile(ctx, f); return; }
            const s = e.target.closest('[data-gzs]'); if (!s) return;
            const k = s.dataset.gzs; S[k] = s.type === 'checkbox' ? s.checked : s.value;
            salvaS(); setTimeout(() => ctx.rerender(), 0);   // dopo il blur del campo
        });
    }
    async function aggiorna(ctx, b) {
        b.disabled = true; const t = b.textContent; b.textContent = 'Lettura del foglio…';
        try { await ctx.aggiornaFoglio(); msg = 'Foglio AVANZAMENTO aggiornato.'; msgErr = false; cache = null; }
        catch (e) { msg = 'Lettura del foglio non riuscita: ' + e.message; msgErr = true; }
        finally { b.disabled = false; b.textContent = t; ctx.rerender(); }
    }
    function caricaFile(ctx, input) {
        const file = input.files && input.files[0]; if (!file) return;
        const rd = new FileReader();
        rd.onload = async () => {
            try {
                const rows = IF().leggiRadar(rd.result);
                if (!rows.length) throw new Error('Il file non contiene contratti');
                const res = await fetch('/api/radar/contratti', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows, file: file.name }) });
                let d = null; try { d = await res.json(); } catch (e) { /* */ }
                if (!res.ok) throw new Error((d && d.error) || 'errore ' + res.status);
                RD.rows = d.rows || rows; RD.info = d; cache = null;
                msg = `File RadaR caricato: ${ctx.nf(rows.length)} contratti. Le trattative del Commerciale non cambiano (per quelle usa "Importa trattative").`; msgErr = false;
            } catch (e) { msg = 'File RadaR non caricato: ' + e.message; msgErr = true; }
            finally { input.value = ''; ctx.rerender(); }
        };
        rd.readAsArrayBuffer(file);
    }

    /* ---------- elenco delle vetture ---------- */
    function scegli(ctx, q) {
        const F = filtrati(ctx);
        let L = q.w === 'soloR' ? F.soloR : q.w === 'daVer' ? F.daVer : F.V;
        if (q.cons) L = L.filter(r => r.cons === q.cons);
        if (q.sede) L = L.filter(r => r.sede === q.sede);
        if (q.w === 'f') L = L.filter(r => r.fascia === q.f);
        if (q.w === 'o90') L = L.filter(r => r.gg != null && r.gg > 90);
        if (q.w === 'o180') L = L.filter(r => r.gg != null && r.gg > 180);
        return { L: L.slice().sort((x, y) => (y.gg ?? -1) - (x.gg ?? -1)), F };
    }
    function lista(ctx, q) {
        const { esc, nf } = ctx;
        if (q.w === 'nonR') {
            const { nonR } = filtrati(ctx);
            ctx.modal(q.t + ' · ' + nf(nonR.length), `<p class="cm-hint">Righe del foglio AVANZAMENTO del periodo (non annullate) senza un contratto RadaR abbinato: manca la data di ingresso in stock, quindi i giorni non si possono calcolare.</p>
              <div class="cm-scroll"><table class="cm-t cm-sort"><tr><th>Data (foglio)</th><th class="l">Cliente</th><th class="l">Venditore</th><th class="l">Targa / telaio</th><th class="l">Modello</th><th class="l">Stato</th></tr>
              ${nonR.slice().sort((x, y) => y.d - x.d).map(f => `<tr><td>${dd(f.d)}</td><td class="l">${esc(ctx.nice(f.cli))}</td><td class="l">${esc(f.vend)}</td><td class="l">${esc(f.raw['TARGA/TELAIO'] || '')}</td><td class="l">${esc(f.raw['MODELLO'] || '')}</td><td class="l">${esc(f.stato)}</td></tr>`).join('')}</table></div>`, true, {});
            return;
        }
        const { L } = scegli(ctx, q);
        const g = L.filter(r => r.fascia !== 'ns').map(r => r.gg), m = media(g);
        const fa = r => TUTTE.find(f => f.k === r.fascia);
        ctx.modal(q.t + ' · ' + nf(L.length) + (L.length === 1 ? ' vettura' : ' vetture'), `<p class="cm-hint">${esc(perTesto(ctx))}${m != null ? ' · media ' + Math.round(m) + ' giorni' : ''} · Giorni = data contratto (foglio) − ingresso in stock (RadaR) · clicca un'intestazione per ordinare</p>
          <div class="cm-scroll"><table class="cm-t cm-sort gz-dt"><tr><th class="l">Cliente</th><th class="l">Targa</th><th class="l">Telaio</th><th class="l">Vettura</th><th class="l">Tipo</th><th class="l">Consulente</th><th class="l">Sede</th><th>Ingresso stock</th><th>Contratto (foglio)</th><th>Giorni</th><th class="l">Fascia</th><th>Firma RadaR</th><th>GG RadaR</th><th class="l">N. contratto</th></tr>
          ${L.map(r => `<tr><td class="l"><b>${esc(r.cliente)}</b></td><td class="l">${esc(r.targa)}</td><td class="l">${esc(r.vin)}</td><td class="l">${esc(r.veicolo)}</td><td class="l">${r.tipo}</td><td class="l">${esc(r.cons)}</td><td class="l">${r.sede}</td>
            <td>${r.ingr ? dd(r.ingr) : '–'}</td><td>${r.nelFoglio ? dd(r.dataC) : '<span title="non nel foglio: data di firma RadaR">' + dd(r.dataC) + ' *</span>'}</td><td><b>${r.gg == null ? '–' : r.gg}</b></td>
            <td class="l"><i class="gz-sw" style="background:${fa(r).c}"></i>${fa(r).l}</td><td>${dd(r.firma)}${r.diff > 7 ? ' <span class="gz-w" title="distante più di 7 giorni dalla data del foglio">⚠</span>' : ''}</td><td>${r.ggR == null ? '–' : r.ggR}</td><td class="l">${esc(r.n)}</td></tr>`).join('') || '<tr><td colspan="14">Nessuna vettura</td></tr>'}</table></div>
          ${L.some(r => !r.nelFoglio) ? '<p class="cm-hint">* contratto non trovato nel foglio: vale la data di firma di RadaR.</p>' : ''}`, true, {});
    }

    /* ---------- export: finestra con la scelta di cosa estrarre (come il resto del Commerciale) ----------
       Voci: Azienda, le sedi, i consulenti (uno o piu'). Contenuto: riepilogo, fasce, per sede, per consulente,
       vetture oltre 90 giorni, elenco completo; in piu' (solo Excel) date da verificare, contratti non nel foglio,
       righe del foglio non in RadaR. Periodo, tipo e "contratti non nel foglio" sono quelli scelti nella pagina.
       Excel: un foglio Riepilogo con una riga per voce + i fogli scelti. PDF: un report per ogni voce. */
    const CONT_X = [['riep', 'Riepilogo e indicatori'], ['fasce', 'Fasce di giacenza (grafico)'], ['sede', 'Per sede'], ['cons', 'Per consulente'],
        ['o90', 'Vetture vendute dopo più di 90 giorni'], ['lista', 'Elenco di tutte le vetture']];
    const EXTRA_X = [['daVer', 'Date da verificare'], ['soloR', 'Contratti RadaR non trovati nel foglio'], ['nonR', 'Righe del foglio senza contratto RadaR']];
    let expS = null;
    const voceDi = key => { const [k, x] = key.split('|'); return k === 'sede' ? { k, x, lab: null } : k === 'cons' ? { k, x } : { k: 'all' }; };
    function voceDati(ctx, F, key) {
        const v = voceDi(key);
        const V = F.V.filter(r => v.k === 'all' || (v.k === 'sede' ? r.sede === v.x : r.cons === v.x));
        const lab = v.k === 'all' ? (S.cons || (S.sede ? ctx.SEDI[S.sede] : 'Azienda')) : v.k === 'sede' ? ctx.SEDI[v.x] : v.x;
        return { key, v, lab, V, az: riga(lab, V), sedi: gruppi(V, r => r.sede).sort((x, y) => SEDI.indexOf(x.k) - SEDI.indexOf(y.k)), cons: gruppi(V, r => r.cons).sort((x, y) => y.n - x.n) };
    }
    const sotto = ctx => ['Periodo ' + perTesto(ctx), S.tipo, S.sede ? ctx.SEDI[S.sede] : '', S.cons, S.incl ? 'compresi i contratti non nel foglio' : 'solo contratti presenti nel foglio', 'Gruppo Autoscala'].filter(Boolean).join(' · ');
    function apriExport(ctx, fmt) {
        const { esc, nf } = ctx;
        const F = filtrati(ctx);
        const sedi = SEDI.filter(x => F.V.some(r => r.sede === x));
        const consDi = s => [...new Set(F.V.filter(r => r.sede === s).map(r => r.cons))].sort((x, y) => x.localeCompare(y, 'it'));
        const nDi = key => { const v = voceDi(key); return F.V.filter(r => v.k === 'all' || (v.k === 'sede' ? r.sede === v.x : r.cons === v.x)).length; };
        const s0 = Object.assign({ fmt: fmt || 'xlsx', amb: ['all|'].concat(sedi.length > 1 ? sedi.map(x => 'sede|' + x) : []), cont: CONT_X.map(c => c[0]), extra: ['daVer'] }, expS || {}, fmt ? { fmt } : {});
        const ck = (arr, k) => arr.includes(k) ? 'checked' : '';
        const lbl = (key, t) => `<label><input type="checkbox" data-amb="${esc(key)}" ${ck(s0.amb, key)}> ${esc(t)} <small class="cm-hint">${nf(nDi(key))}</small></label>`;
        const ov = ctx.modal('Esporta la giacenza alla vendita', `
          <div class="cm-exp">
            <div class="cm-exp-s"><h4>Formato</h4><div class="cm-exp-fmt">
              <label><input type="radio" name="gzFmt" value="xlsx" ${s0.fmt === 'xlsx' ? 'checked' : ''}><span><b>📊 Excel</b><small>Riepilogo con una riga per ogni voce scelta, fasce per sede e per consulente, elenchi delle vetture con cliente, targa, telaio e giorni</small></span></label>
              <label><input type="radio" name="gzFmt" value="pdf" ${s0.fmt === 'pdf' ? 'checked' : ''}><span><b>📄 PDF</b><small>Un report impaginato per ogni voce scelta (azienda, sede o consulente), pronto da stampare o salvare</small></span></label>
            </div></div>
            <div class="cm-exp-s"><h4>Periodo e filtri</h4><p class="cm-hint" style="margin:0">${esc(sotto(ctx))}. Per cambiarli usa i filtri della pagina.</p></div>
            <div class="cm-exp-s"><h4>Cosa esportare <button type="button" class="cm-link" data-xall>Seleziona tutto</button> <button type="button" class="cm-link" data-xnone>Nessuno</button></h4>
              <div class="cm-exp-grid">
                <div><h5>Azienda e sedi</h5>${lbl('all|', S.cons || (S.sede ? ctx.SEDI[S.sede] : 'Tutta l\'azienda'))}${sedi.length > 1 ? sedi.map(x => lbl('sede|' + x, ctx.SEDI[x])).join('') : ''}</div>
                ${sedi.map(s => `<div><h5>Consulenti ${esc(s)} <button type="button" class="cm-link" data-xg>tutti</button></h5>${consDi(s).map(c => lbl('cons|' + c, c)).join('') || '<small class="cm-hint">Nessuno</small>'}</div>`).join('')}
              </div></div>
            <div class="cm-exp-s"><h4>Contenuto <button type="button" class="cm-link" data-call>Tutto</button> <button type="button" class="cm-link" data-cnone>Nessuno</button></h4><div class="cm-exp-row">
              ${CONT_X.map(([k, t]) => `<label class="cm-exp-chk"><input type="checkbox" data-cont="${k}" ${ck(s0.cont, k)}> ${t}</label>`).join('')}
            </div><p class="cm-hint" style="margin:8px 0 0">Solo quello che spunti finisce nel file o nella stampa. "Per sede" e "Per consulente" si saltano dove non servono (es. nel report di un solo consulente).</p></div>
            <div class="cm-exp-s gz-x-xls"><h4>Fogli in più (solo Excel)</h4><div class="cm-exp-row">
              ${EXTRA_X.map(([k, t]) => `<label class="cm-exp-chk"><input type="checkbox" data-extra="${k}" ${ck(s0.extra, k)}> ${t} (${nf((F[k] || []).length)})</label>`).join('')}
            </div></div>
            <div class="cm-exp-foot"><span class="cm-hint" id="gzXInfo"></span><button type="button" class="cm-chip" data-x>Annulla</button><button type="button" class="cm-btn-go" id="gzXGo">Esporta</button></div>
          </div>`, true);
        const $ = q => ov.querySelector(q);
        const read = () => ({ fmt: ov.querySelector('[name="gzFmt"]:checked').value, amb: [...ov.querySelectorAll('[data-amb]:checked')].map(i => i.dataset.amb),
            cont: [...ov.querySelectorAll('[data-cont]:checked')].map(i => i.dataset.cont), extra: [...ov.querySelectorAll('[data-extra]:checked')].map(i => i.dataset.extra) });
        const upd = () => { const s = read(); $('.gz-x-xls').style.display = s.fmt === 'xlsx' ? '' : 'none';
            $('#gzXInfo').textContent = s.amb.length + (s.amb.length === 1 ? ' voce scelta' : ' voci scelte') + ' · ' + (s.cont.length === CONT_X.length ? 'tutto il contenuto' : s.cont.length + ' argomenti su ' + CONT_X.length); };
        ov.addEventListener('change', upd); upd();
        ov.addEventListener('click', e => {
            if (e.target.closest('#gzXGo')) return;
            if (e.target.closest('[data-xall]')) ov.querySelectorAll('[data-amb]').forEach(i => { i.checked = true; });
            if (e.target.closest('[data-xnone]')) ov.querySelectorAll('[data-amb]').forEach(i => { i.checked = false; });
            if (e.target.closest('[data-call]')) ov.querySelectorAll('[data-cont]').forEach(i => { i.checked = true; });
            if (e.target.closest('[data-cnone]')) ov.querySelectorAll('[data-cont]').forEach(i => { i.checked = false; });
            const g = e.target.closest('[data-xg]');
            if (g) { const all = [...g.closest('div').querySelectorAll('[data-amb]')]; const on = all.some(i => !i.checked); all.forEach(i => { i.checked = on; }); }
            upd();
        });
        $('#gzXGo').addEventListener('click', async () => {
            const s = read();
            if (!s.amb.length) { $('#gzXInfo').textContent = 'Scegli almeno una voce'; return; }
            if (!s.cont.length && !(s.fmt === 'xlsx' && s.extra.length)) { $('#gzXInfo').textContent = 'Scegli almeno un argomento in "Contenuto"'; return; }
            expS = s;
            const btn = $('#gzXGo'); btn.disabled = true; btn.textContent = 'Preparo…';
            try { const D = s.amb.map(k => voceDati(ctx, F, k)); if (s.fmt === 'xlsx') await excel(ctx, D, F, s); else pdf(ctx, D, s); ov.close(); }
            catch (e) { $('#gzXInfo').textContent = 'Errore: ' + e.message; }
            finally { btn.disabled = false; btn.textContent = 'Esporta'; }
        });
    }
    async function excel(ctx, D, F, s) {
        const T = (t, w) => ({ t, tipo: 'text', w: w || 22 }), I = (t, w) => ({ t, tipo: 'int', w: w || 10 }), Q = (t, w) => ({ t, tipo: 'pct', w: w || 10 }), Dt = (t, w) => ({ t, tipo: 'data', w: w || 12 });
        const has = k => s.cont.includes(k);
        const fasceC = TUTTE.map(f => I(f.l + (f.k === 'ns' ? '' : ' gg'), 10));
        const rg = r => [r.n].concat(TUTTE.map(f => r[f.k]), [r.m == null ? '' : Math.round(r.m), r.med == null ? '' : Math.round(r.med), r.n - r.ns ? r.o90 / (r.n - r.ns) : 0]);
        const cols = [I('Vendute')].concat(fasceC, [I('Media gg'), I('Mediana gg'), Q('% oltre 90 gg', 12)]);
        const dett = r => [r.cliente, r.targa, r.vin, r.veicolo, r.tipo, r.cons, r.sede, r.ingr ? dd(r.ingr) : '', dd(r.dataC), r.gg == null ? '' : r.gg, TUTTE.find(f => f.k === r.fascia).l, dd(r.firma), r.ggR == null ? '' : r.ggR, r.n, r.nelFoglio ? 'Sì' : 'No'];
        const dCols = [T('Cliente', 28), T('Targa', 11), T('Telaio', 20), T('Vettura', 34), T('Tipo', 8), T('Consulente', 22), T('Sede', 14), Dt('Ingresso stock'), Dt('Contratto (foglio)', 14), I('Giorni', 8), T('Fascia', 12), Dt('Firma RadaR'), I('GG RadaR', 9), T('N. contratto', 12), T('Nel foglio', 9)];
        const nota = 'Giorni = data del contratto (foglio AVANZAMENTO) − data di ingresso in stock (RadaR). Non in stock = senza data di ingresso o vettura arrivata dopo il contratto. % oltre 90 gg sulle vetture in stock.';
        // vetture di tutte le voci scelte, senza doppioni
        const U = new Set(); D.forEach(d => d.V.forEach(r => U.add(r))); const UV = [...U];
        const ord = l => l.slice().sort((x, y) => x.cons.localeCompare(y.cons, 'it') || (y.gg ?? -1) - (x.gg ?? -1));
        const fogli = [];
        if (has('riep') || has('fasce')) fogli.push({ nome: 'Riepilogo', tabelle: [{ titolo: 'Voci scelte', nota, colonne: [T('Voce', 28)].concat(cols), righe: D.map(d => [d.lab].concat(rg(d.az))) }] });
        if (has('sede')) { const gs = gruppi(UV, r => r.sede).sort((x, y) => SEDI.indexOf(x.k) - SEDI.indexOf(y.k)); if (gs.length) fogli.push({ nome: 'Per sede', tabelle: [{ titolo: 'Fasce di giacenza per sede', nota, colonne: [T('Sede', 24)].concat(cols), righe: gs.map(r => [ctx.SEDI[r.k] || r.k].concat(rg(r))), totale: ['Totale'].concat(rg(riga('Totale', UV))) }] }); }
        if (has('cons')) { const gc = gruppi(UV, r => r.cons).sort((x, y) => y.n - x.n); if (gc.length) fogli.push({ nome: 'Per consulente', tabelle: [{ titolo: 'Fasce di giacenza per consulente', nota, colonne: [T('Consulente', 24), T('Sede', 22)].concat(cols), righe: gc.map(r => [r.k, sedeCons(UV, r.k)].concat(rg(r))), totale: ['Totale', ''].concat(rg(riga('Totale', UV))) }] }); }
        if (has('o90')) fogli.push({ nome: 'Oltre 90 giorni', tabelle: [{ titolo: 'Vetture vendute dopo più di 90 giorni in stock', colonne: dCols, righe: UV.filter(r => r.gg != null && r.gg > 90).sort((x, y) => y.gg - x.gg).map(dett) }] });
        if (has('lista')) fogli.push({ nome: 'Vetture', tabelle: [{ titolo: 'Dettaglio delle vetture vendute', colonne: dCols, righe: ord(UV).map(dett) }] });
        const inVoci = r => D.some(d => d.v.k === 'all' || (d.v.k === 'sede' ? r.sede === d.v.x : r.cons === d.v.x));
        if (s.extra.includes('daVer') && F.daVer.length) fogli.push({ nome: 'Date da verificare', tabelle: [{ titolo: 'Firma RadaR e data del foglio distanti più di 7 giorni', colonne: dCols, righe: F.daVer.filter(inVoci).map(dett) }] });
        if (s.extra.includes('soloR') && F.soloR.length) fogli.push({ nome: 'Non nel foglio', tabelle: [{ titolo: 'Contratti RadaR non trovati nel foglio', colonne: dCols, righe: F.soloR.filter(inVoci).map(dett) }] });
        if (s.extra.includes('nonR') && F.nonR.length) fogli.push({ nome: 'Non in RadaR', tabelle: [{ titolo: 'Righe del foglio senza contratto RadaR (tutta l\'azienda)', colonne: [Dt('Data (foglio)'), T('Cliente', 28), T('Venditore', 18), T('Targa / telaio', 20), T('Modello', 34), T('Stato', 18)],
            righe: F.nonR.map(f => [dd(f.d), ctx.nice(f.cli), f.vend, f.raw['TARGA/TELAIO'] || '', f.raw['MODELLO'] || '', f.stato]) }] });
        if (!fogli.length) throw new Error('Con le scelte fatte non c\'è nulla da esportare');
        const nomeV = D.length === 1 ? '_' + D[0].lab.replace(/[^A-Za-z0-9]+/g, '_') : '';
        const body = { titolo: 'Giacenza alla vendita' + (D.length === 1 ? ' · ' + D[0].lab : ''), sottotitolo: sotto(ctx) + (D.length > 1 ? ' · ' + D.length + ' voci' : ''),
            file: 'giacenza_vendita_' + (S.per === 'gg' ? 'ultimi_' + (+S.gg || 90) + '_giorni' : ctx.anno + '_' + String(ctx.da).padStart(2, '0') + '-' + String(ctx.a).padStart(2, '0')) + nomeV + '.xlsx', fogli };
        const res = await fetch('/api/commerciale/export/excel', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) { let m = 'Errore ' + res.status; try { m = (await res.json()).error || m; } catch (e) { /* */ } throw new Error(m); }
        const blob = await res.blob(), url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = body.file; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    function pdf(ctx, D, s) {
        const { esc } = ctx, has = k => s.cont.includes(k);
        const PAL = { c1: '#0f5662', ink: '#16262a', ink2: '#5f7479', line: '#dbe6e8', soft: '#dfeef0' };
        const f1 = x => x == null ? '–' : Math.round(x).toLocaleString('it-IT');
        const bars = r => {
            const W = 520, H = 200, pad = { l: 30, r: 8, t: 18, b: 24 }, mx = Math.max(1, ...TUTTE.map(f => r[f.k])), iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, gw = iw / TUTTE.length;
            let g = '';
            [0, 0.5, 1].forEach(p => { const y = pad.t + ih - p * ih; g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="${PAL.line}"/><text x="${pad.l - 5}" y="${y + 3}" font-size="8" text-anchor="end" fill="${PAL.ink2}">${Math.round(mx * p)}</text>`; });
            TUTTE.forEach((f, i) => { const v = r[f.k], h = v / mx * ih, x = pad.l + i * gw + 6, y = pad.t + ih - h;
                g += `<rect x="${x}" y="${y}" width="${gw - 12}" height="${h}" rx="3" fill="${f.c}"/>${v ? `<text x="${x + (gw - 12) / 2}" y="${y - 3}" font-size="9" font-weight="700" text-anchor="middle" fill="${PAL.ink}">${v}</text>` : ''}<text x="${pad.l + i * gw + gw / 2}" y="${H - 8}" font-size="8.5" text-anchor="middle" fill="${PAL.ink2}">${f.l}</text>`; });
            return `<svg viewBox="0 0 ${W} ${H}" width="100%">${g}</svg>`;
        };
        const stack = r => `<div class="stk">${TUTTE.map(f => r[f.k] ? `<i style="width:${r[f.k] / r.n * 100}%;background:${f.c}"></i>` : '').join('')}</div>`;
        const head = ['', 'Vendute'].concat(TUTTE.map(f => f.l), ['Media', 'Mediana']);
        const celle = r => `<td><b>${r.n}</b></td>${TUTTE.map(f => `<td>${r[f.k] || '–'}</td>`).join('')}<td><b>${f1(r.m)}</b></td><td>${f1(r.med)}</td>`;
        const tabella = (h0, rows, tot) => `<table><tr>${head.map((h, i) => `<th${i ? '' : ' class="l"'}>${i ? h : h0}</th>`).join('')}</tr>${rows.map(([k, r, x]) => `<tr><td class="l">${esc(k)}${x ? '<br><small>' + esc(x) + '</small>' : ''}</td>${celle(r)}</tr>`).join('')}${tot ? `<tr class="tot"><td class="l">Totale</td>${celle(tot)}</tr>` : ''}</table>`;
        const leg = `<div class="leg">${TUTTE.map(f => `<span><i style="background:${f.c}"></i>${f.l}</span>`).join('')}</div>`;
        const kp = (l, v, t) => `<div class="kpi"><small>${l}</small><b>${v}</b><span>${t}</span></div>`;
        const elenco = (tit, L) => L.length ? `<h2>${tit} (${L.length})</h2><table><tr><th class="l">Cliente</th><th class="l">Targa / telaio</th><th class="l">Vettura</th><th class="l">Consulente</th><th>Ingresso</th><th>Contratto</th><th>Giorni</th></tr>
            ${L.map(r => `<tr><td class="l">${esc(r.cliente)}</td><td class="l n">${esc([r.targa, r.vin].filter(Boolean).join(' · '))}</td><td class="l n">${esc(r.veicolo)}</td><td class="l n">${esc(r.cons)}</td><td>${r.ingr ? dd(r.ingr) : '–'}</td><td>${dd(r.dataC)}</td><td><b>${r.gg == null ? '–' : r.gg}</b></td></tr>`).join('')}</table>` : '';
        const sezioni = D.map(d => {
            const az = d.az, inS = az.n - az.ns, unCons = d.v.k === 'cons';
            let h = `<section><header><h1>Giacenza alla vendita · ${esc(d.lab)}</h1><p>${esc(sotto(ctx))}</p></header>`;
            if (has('riep')) h += `<div class="kpis">${kp('Vetture vendute', az.n, inS + ' in stock alla firma · ' + az.ns + ' non in stock')}${kp('Giacenza media', f1(az.m) + ' gg', 'mediana ' + f1(az.med) + ' giorni')}${kp('Oltre 90 giorni', az.o90, inS ? ctx.pct(az.o90, inS) + ' delle vetture in stock' : '–')}${kp('Oltre 180 giorni', az.f7 + az.f8, inS ? ctx.pct(az.f7 + az.f8, inS) + ' delle vetture in stock' : '–')}</div>`;
            if (has('fasce')) h += `<h2>Vetture per giorni di giacenza</h2><div class="card">${bars(az)}</div>`;
            if (has('sede') && d.v.k === 'all' && d.sedi.length > 1) h += `<h2>Per sede</h2><div class="card">${tabella('Sede', d.sedi.map(r => [ctx.SEDI[r.k] || r.k, r]), az)}</div>`;
            if (has('cons') && !unCons && d.cons.length) h += `<h2>Per consulente</h2><div class="card">${leg}${d.cons.map(r => `<div class="cr"><span>${esc(r.k)}</span>${stack(r)}<em>${r.n}</em></div>`).join('')}</div><div class="card">${tabella('Consulente', d.cons.map(r => [r.k, r, sedeCons(d.V, r.k)]), az)}</div>`;
            if (has('o90')) h += elenco('Vendute dopo più di 90 giorni', d.V.filter(r => r.gg != null && r.gg > 90).sort((x, y) => y.gg - x.gg));
            if (has('lista')) h += elenco('Tutte le vetture vendute', d.V.slice().sort((x, y) => (y.gg ?? -1) - (x.gg ?? -1)));
            return h + `<footer>Gruppo Autoscala · BI Commerciale · Giorni = data del contratto (foglio AVANZAMENTO) − ingresso in stock (RadaR) · generato il ${new Date().toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</footer></section>`;
        }).join('');
        const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Giacenza alla vendita${D.length === 1 ? ' – ' + esc(D[0].lab) : ''}</title><style>
          @page{size:A4;margin:11mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          body{margin:0;font-family:Inter,'Segoe UI',Arial,sans-serif;color:${PAL.ink};font-size:10.5px}
          section{page-break-after:always}section:last-child{page-break-after:auto}
          header{border-left:5px solid ${PAL.c1};padding:2px 0 2px 12px;margin-bottom:12px}header h1{margin:0;font-size:20px}header p{margin:3px 0 0;color:${PAL.ink2}}
          h2{font-size:13px;margin:14px 0 7px}
          .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.kpi{border:1px solid ${PAL.line};border-top:3px solid ${PAL.c1};border-radius:8px;padding:8px 9px}.kpi small{display:block;color:${PAL.ink2};font-size:9px}.kpi b{display:block;font-size:20px;margin:3px 0}.kpi span{color:${PAL.ink2};font-size:8.5px}
          .card{border:1px solid ${PAL.line};border-radius:9px;padding:10px;break-inside:avoid;margin-bottom:9px}
          table{width:100%;border-collapse:collapse;font-size:9px}th{background:${PAL.c1};color:#fff;text-align:right;padding:5px;font-size:8px;text-transform:uppercase}th.l,td.l{text-align:left}
          td{padding:4px 5px;text-align:right;border-bottom:1px solid ${PAL.line}}td.l{font-weight:700}td.n{font-weight:400}td small{font-weight:400;color:${PAL.ink2}}tr.tot td{background:${PAL.soft};font-weight:800}
          .leg{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:9px;color:${PAL.ink2};margin:4px 0 6px}.leg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}
          .cr{display:grid;grid-template-columns:150px 1fr 34px;gap:8px;align-items:center;margin:3px 0;font-size:9.5px}.cr span{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cr em{font-style:normal;font-weight:800;text-align:right}
          .stk{display:flex;height:11px;border-radius:3px;overflow:hidden;background:#ecf2f3}.stk i{display:block;height:100%}
          footer{margin-top:8px;color:${PAL.ink2};font-size:8px;border-top:1px solid ${PAL.line};padding-top:5px}
        </style></head><body>${sezioni}</body></html>`;
        const fr = document.createElement('iframe');
        fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
        document.body.appendChild(fr);
        const doc = fr.contentWindow.document; doc.open(); doc.write(html); doc.close();
        setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } finally { setTimeout(() => fr.remove(), 60000); } }, 350);
    }

    // stile della sezione (usa le variabili del Commerciale)
    (function stile() {
        if (document.getElementById('gzStyle')) return;
        const s = document.createElement('style'); s.id = 'gzStyle';
        s.textContent = `
#commercialeRoot .gz-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
#commercialeRoot .gz-b{border:1px solid var(--cm-line);background:var(--cm-card);border-radius:10px;padding:7px 12px;font-weight:700;font-size:13px;cursor:pointer;color:var(--cm-ink);text-decoration:none}
#commercialeRoot .gz-b:hover{background:var(--cm-grey-soft)}#commercialeRoot .gz-b:disabled{opacity:.6;cursor:wait}
#commercialeRoot .gz-src{margin:6px 2px 12px}
#commercialeRoot .gz-f{display:flex;gap:10px 18px;flex-wrap:wrap;align-items:center;padding:12px 16px;margin-bottom:16px}
#commercialeRoot .gz-f label{display:flex;gap:6px;align-items:center;font-size:12.5px;font-weight:700;color:var(--cm-ink-2)}
#commercialeRoot .gz-f select,#commercialeRoot .gz-f input[type=number]{border:1px solid var(--cm-line);border-radius:8px;padding:6px 8px;background:var(--cm-card);color:var(--cm-ink);font-size:13px}
#commercialeRoot .gz-f label.gz-tg{color:var(--cm-ink);cursor:pointer}#commercialeRoot .gz-tg input{width:16px;height:16px;accent-color:var(--cm-acc)}
#commercialeRoot .gz-gh{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
#commercialeRoot .gz-gv{display:flex;gap:6px;align-items:center;font-size:12.5px;font-weight:700;color:var(--cm-ink-2)}
#commercialeRoot .gz-gv select{border:1px solid var(--cm-line);border-radius:8px;padding:6px 8px;background:var(--cm-card);color:var(--cm-ink);font-size:13px;max-width:240px}
#commercialeRoot .gz-gk{display:flex;gap:8px 18px;flex-wrap:wrap;font-size:12.5px;color:var(--cm-ink-2);margin:2px 0 10px}#commercialeRoot .gz-gk b{color:var(--cm-ink)}
#commercialeRoot .gz-g2{display:grid;grid-template-columns:1fr;gap:16px}
#commercialeRoot .gz-msg{background:var(--cm-acc-soft);color:var(--cm-ink);border-radius:12px;padding:9px 14px;margin:0 0 14px;font-size:13px}
#commercialeRoot .gz-msg.err{background:#fbe9e7;color:#8c2a1e}[data-theme="dark"] #commercialeRoot .gz-msg.err{background:#3a1f1b;color:#f3b4aa}
#commercialeRoot .gz-msg .cm-link{color:var(--cm-acc-ink);font-weight:700}
#commercialeRoot .gz-ch{position:relative;height:280px}
#commercialeRoot .gz-t td.gz-c{cursor:pointer;box-shadow:inset 3px 0 0 var(--gz)}#commercialeRoot .gz-t td.gz-c:hover{background:var(--cm-acc-soft)}
#commercialeRoot .gz-t tr[data-gzr] td:first-child{cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px}
.gz-sw{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:0}
.gz-w{color:#c77a1a;font-weight:800}
#commercialeRoot .gz-av{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
@media (max-width:1100px){#commercialeRoot .gz-g2{grid-template-columns:1fr}}`;
        document.head.appendChild(s);
    })();

    // per la plancia BI o altre pagine: riepilogo veloce (media e oltre 90 gg) dell'ultimo periodo calcolato
    window.CommercialeGiacenza = { render, ricarica: () => { RD = { rows: null, info: null, loading: false, err: '' }; cache = null; } };
})();
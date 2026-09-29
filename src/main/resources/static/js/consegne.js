/* =====================================================================
   AREA CONSEGNE — Tempistiche di consegna
   ---------------------------------------------------------------------
   Due fonti, entrambe salvate SUL SERVER (visibili a tutti, sempre
   l'ultimo aggiornamento):
   1) CSV trattative del gestionale ("Importa trattative", solo Admin /
      Gestore / Moderatore). Il file viene letto e ridotto qui nel browser
      alle sole colonne necessarie (niente telefoni, email, CF), poi
      inviato a POST /api/consegne/trattative, che sostituisce l'import
      precedente. Scartate le righe con Sede "Gruppo Autoscala Noleggio".
   2) Scheda DATABASE del foglio Google "AVANZAMENTO 2026": la legge il
      server (script Apps Script + GSHEET_URL / GSHEET_TOKEN) ogni 5
      minuti, oppure subito con "Aggiorna dal foglio Google".
      Tenute solo le righe con B2C = FALSE.

   Abbinamento trattativa -> riga DATABASE, in ordine di priorita':
     1. targa/telaio + nome cliente
     2. nome cliente (data vicina, entro 45 giorni)
     3. targa o telaio completi (entro 60 giorni)
     4. ultime cifre del telaio (entro 30 giorni)
     5. nome cliente (qualsiasi data)
   Non trovate -> lista "Da verificare" (non conteggiate).

   Classificazione (stato dal foglio + data dal CSV):
     - ANNULLATA                       -> colonna "Annullate"
     - stato contiene CONSEGNATA       -> consegnata:
         con data consegna (effettiva, altrimenti prevista) -> Stesso mese / +N
         senza data                                         -> "Senza data"
     - tutto il resto                  -> "Da consegnare" (motivo = stato)
   ===================================================================== */
(function () {
    const API = '/api/consegne';
    const AUTO_REFRESH_MS = 5 * 60 * 1000; // stesso intervallo della rilettura del foglio lato server

    const MESI = ['', 'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    const MESI_L = ['', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    const BUCKETS = [0, 1, 2, 3, 4, 5, 6];
    const BLABEL = k => k === 0 ? 'Stesso mese' : k === 6 ? '6+ mesi' : '+' + k + (k === 1 ? ' mese' : ' mesi');

    let tratt = null;   // [{...colonne minime}]
    let db = null;      // [{...colonne minime}]
    let result = null;  // {recs, verify, excl}
    let rootEl = null;
    let meta = null;    // info ultimo import / ultima lettura foglio dal server
    let autoTimer = null;

    /* ================= CSV ================= */
    function parseCSV(text) {
        text = text.replace(/^\uFEFF/, '');
        const firstLine = text.split(/\r?\n/).find(l => l.trim()) || '';
        const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
        const rows = []; let row = []; let f = ''; let q = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (q) {
                if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
                else f += c;
            } else if (c === '"') q = true;
            else if (c === delim) { row.push(f); f = ''; }
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && text[i + 1] === '\n') i++;
                row.push(f); f = '';
                if (row.some(x => x.trim() !== '')) rows.push(row);
                row = [];
            } else f += c;
        }
        row.push(f); if (row.some(x => x.trim() !== '')) rows.push(row);
        if (!rows.length) return [];
        const h = rows[0].map(x => x.replace(/^\uFEFF/, '').trim());
        return rows.slice(1).map(r => { const o = {}; h.forEach((k, i) => o[k] = (r[i] ?? '').trim()); return o; });
    }
    function need(rows, cols, nome) {
        const miss = cols.filter(c => !(rows.length && c in rows[0]));
        if (miss.length) throw new Error(`Il file ${nome} non ha le colonne: ${miss.join(', ')}`);
    }
    function slimTrattative(rows) {
        need(rows, ['Sede', 'Data chiusura', 'Data Consegna', 'Data prevista consegna', 'Venditore', 'Nome cliente',
            'Cognome Cliente', 'Rag. Sociale Cliente', 'Tipo Trattativa', 'Marca', 'Modello', 'Targa', 'Telaio'], 'delle trattative');
        return rows.filter(r => !/noleggio/i.test(r['Sede'])).map(r => ({
            sede: r['Sede'], chiusura: r['Data chiusura'], consegna: r['Data Consegna'], prevista: r['Data prevista consegna'],
            vend: r['Venditore'], nome: r['Nome cliente'], cognome: r['Cognome Cliente'], rag: r['Rag. Sociale Cliente'],
            tipo: r['Tipo Trattativa'], marca: r['Marca'], modello: r['Modello'], targa: r['Targa'], telaio: r['Telaio']
        }));
    }
    function slimDatabase(rows) {
        need(rows, ['CLIENTE', 'B2C', 'TARGA/TELAIO', 'STATO', 'PROVENIENZA', 'DATA'], 'DATABASE');
        return rows.filter(r => r['CLIENTE'] || r['TARGA/TELAIO']).map(r => ({
            cliente: r['CLIENTE'], b2c: String(r['B2C']).toUpperCase(), tt: r['TARGA/TELAIO'],
            stato: r['STATO'], prov: r['PROVENIENZA'], data: r['DATA']
        }));
    }

    /* ================= abbinamento ================= */
    const pl = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const STOP = new Set(['SRL', 'SRLS', 'SNC', 'SAS', 'SPA', 'DI', 'E', 'C', 'DE', 'DEL', 'DELLA', 'LA', 'LO', 'S', 'A']);
    function toks(s) {
        s = String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ');
        return new Set(s.split(/\s+/).filter(w => w.length > 1 && !STOP.has(w)));
    }
    function pd(s) {
        const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || '').trim());
        return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
    }
    const days = (a, b) => (a && b) ? Math.abs(Math.round((a - b) / 86400000)) : 999;
    const nameOf = t => { const n = `${t.nome} ${t.cognome}`.replace(/\s+/g, ' ').trim(); return n || t.rag.trim(); };

    function plateKind(t, g) {
        const v = g._pl, tg = pl(t.targa), T = pl(t.telaio);
        if (!v || v.length < 4) return null;
        if (v === tg || v === T) return 'strong';
        if (T && v.length >= 10 && T.slice(-7) === v.slice(-7)) return 'strong';
        if (T && T.endsWith(v)) return 'suffix';
        if (tg && tg.length >= 4 && (tg.endsWith(v) || v.endsWith(tg))) return 'suffix';
        return null;
    }
    function nameMatch(a, b) {
        if (!a.size || !b.size) return false;
        let i = 0; a.forEach(w => { if (b.has(w)) i++; });
        return i >= 2 || (i >= 1 && (a.size === 1 || b.size === 1));
    }

    function compute() {
        const G = db.map((g, i) => ({ ...g, _i: i, _pl: pl(g.tt), _tk: toks(g.cliente), _d: pd(g.data) }));
        const used = new Set();
        const recs = [], verify = []; let excl = 0;

        tratt.forEach(t => {
            const dc = pd(t.chiusura);
            const tk = new Set([...toks(nameOf(t)), ...toks(t.rag)]);
            const info = [];
            G.forEach(g => {
                const k = plateKind(t, g), n = nameMatch(tk, g._tk);
                if (k || n) info.push({ g, k, n, dd: days(g._d, dc) });
            });
            const tiers = [
                ['targa + nome', x => x.k && x.n],
                ['nome', x => x.n && x.dd <= 45],
                ['targa/telaio', x => x.k === 'strong' && x.dd <= 60],
                ['telaio parziale', x => x.k === 'suffix' && x.dd <= 30],
                ['nome', x => x.n]
            ];
            let best = null, how = '';
            for (const [h, f] of tiers) {
                const cand = info.filter(f);
                if (cand.length) {
                    const free = cand.filter(x => !used.has(x.g._i));
                    best = (free.length ? free : cand).reduce((a, b) => b.dd < a.dd ? b : a);
                    how = h; break;
                }
            }
            const base = {
                cliente: nice(nameOf(t)), marca: t.marca.trim(), modello: t.modello.replace(/\s+/g, ' ').trim(),
                vend: nice(t.vend), chiusura: t.chiusura, targa: (t.targa || t.telaio || '—').trim(), tipo: t.tipo,
                sede: t.sede.replace(/Gruppo Auto ?Scala srl/i, '').trim() || 'Agnano'
            };
            if (!best) { verify.push(base); return; }
            used.add(best.g._i);
            if (best.g.b2c !== 'FALSE') { excl++; return; }

            const st = String(best.g.stato || '').toUpperCase().replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
            const dReal = pd(t.consegna), dPrev = pd(t.prevista), dCon = dReal || dPrev;
            let k;
            if (st.includes('ANNULLATA')) k = 'ann';
            else if (st.includes('CONSEGNATA')) {
                if (dCon && dc) k = Math.min(6, Math.max(0, (dCon.getFullYear() - dc.getFullYear()) * 12 + dCon.getMonth() - dc.getMonth()));
                else k = 'nd';
            } else k = 'dc';
            recs.push({
                ...base, m: dc ? dc.getMonth() + 1 : 0, k, stato: st || 'STATO NON INDICATO',
                consegna: (k === 'nd' || !dCon) ? '' : fmtD(dCon), prevista: !dReal && !!dPrev && k !== 'nd',
                prov: best.g.prov ? cap(best.g.prov) : 'Non specificato', abb: how
            });
        });
        result = { recs: recs.filter(r => r.m), verify, excl };
    }

    /* ================= util ================= */
    function nice(s) {
        s = String(s || '').replace(/\s+/g, ' ').trim();
        if (/\b(SRL|SRLS|SNC|SAS|SPA|S\.R\.L)\b/i.test(s)) return s;
        if (s === s.toUpperCase() || s === s.toLowerCase())
            return s.toLowerCase().replace(/(^|[\s'\-])([a-zà-ù])/g, (m, a, b) => a + b.toUpperCase());
        return s;
    }
    const cap = s => { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };
    const fmtD = d => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    const pct = (a, b) => b ? (a / b * 100).toFixed(1).replace('.', ',') + '%' : '—';
    const fmt = n => n.toLocaleString('it-IT');
    const isDel = r => typeof r.k === 'number' || r.k === 'nd';
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const when = iso => iso ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    async function api(path, opts = {}) {
        const res = await fetch(API + path, { credentials: 'same-origin', ...opts });
        let data = null;
        try { data = await res.json(); } catch (e) { /* risposta vuota */ }
        if (!res.ok) throw new Error((data && data.error) || ('Errore ' + res.status));
        return data;
    }

    // Applica la risposta del server (GET /data e POST) allo stato locale
    function applyServerData(d) {
        meta = d;
        tratt = d.trattative && Array.isArray(d.trattative.rows) ? d.trattative.rows : null;
        try { db = d.database && d.database.csv ? slimDatabase(parseCSV(d.database.csv)) : null; }
        catch (e) { db = null; meta.foglioErrore = e.message; }
    }

    /* ================= UI ================= */
    function shell() {
        rootEl.innerHTML = `
        <div class="cg-band">
          <div class="cg-band-top">
            <div>
              <div class="cg-back-row">
                <button type="button" class="cg-back" onclick="MacroHome.show()">&larr; Home</button>
              </div>
              <h1>Consegne</h1>
              <p>Quanto tempo passa tra la firma del contratto e la consegna della vettura</p>
            </div>
            <div class="cg-actions">
              <label class="cg-btn" id="cgImportLbl" style="display:none">Importa trattative (CSV)<input type="file" accept=".csv,text/csv" id="cgFileTratt" hidden></label>
              <button type="button" class="cg-btn cg-btn-light" id="cgSheetBtn">Aggiorna dal foglio Google</button>
            </div>
          </div>
          <div class="cg-src" id="cgSrc"></div>
        </div>
        <div class="cg-wrap" id="cgBody"></div>`;
        rootEl.querySelector('#cgFileTratt').addEventListener('change', e => importTrattative(e.target));
        rootEl.querySelector('#cgSheetBtn').addEventListener('click', refreshSheet);
    }

    function setSrc(msg, isErr) {
        const t = meta && meta.trattative, d = meta && meta.database;
        const imp = rootEl.querySelector('#cgImportLbl');
        if (imp) imp.style.display = meta && meta.puoImportare ? '' : 'none';
        let foglio = d ? `${fmt(d.righe || 0)} righe · aggiornato ${when(d.aggiornatoAt)}` : 'non ancora letto';
        if (meta && !meta.foglioCollegato) foglio = 'collegamento non configurato sul server';
        rootEl.querySelector('#cgSrc').innerHTML =
            `Ultimo import trattative: <b>${t ? fmt(t.righe || 0) + ' righe · ' + when(t.aggiornatoAt) + (t.aggiornatoDa ? ' da ' + esc(t.aggiornatoDa) : '') : 'nessuno'}</b>` +
            ` &nbsp;|&nbsp; Foglio DATABASE: <b>${foglio}</b>` +
            (meta && meta.foglioErrore ? `<div class="cg-msg err">Ultima lettura del foglio non riuscita: ${esc(meta.foglioErrore)}</div>` : '') +
            (msg ? `<div class="cg-msg ${isErr ? 'err' : ''}">${esc(msg)}</div>` : '');
    }

    function importTrattative(input) {
        const file = input.files && input.files[0]; if (!file) return;
        const lbl = rootEl.querySelector('#cgImportLbl');
        const r = new FileReader();
        r.onload = async () => {
            try {
                const rows = slimTrattative(parseCSV(String(r.result)));
                if (!rows.length) throw new Error('Il file non contiene trattative (dopo aver escluso il Noleggio).');
                lbl.classList.add('cg-busy');
                const d = await api('/trattative', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rows })
                });
                applyServerData(d);
                refresh(`Import completato: ${fmt(rows.length)} trattative. Ora le vedono tutti.`);
            } catch (e) { setSrc(e.message, true); }
            finally { lbl.classList.remove('cg-busy'); input.value = ''; }
        };
        r.readAsText(file, 'utf-8');
    }

    async function refreshSheet() {
        const btn = rootEl.querySelector('#cgSheetBtn');
        btn.disabled = true; btn.textContent = 'Lettura in corso…';
        try {
            applyServerData(await api('/database/aggiorna', { method: 'POST' }));
            refresh('Foglio DATABASE aggiornato.');
        } catch (e) {
            setSrc(e.message, true);
        } finally {
            btn.disabled = false; btn.textContent = 'Aggiorna dal foglio Google';
        }
    }

    // Ricarica silenziosa dal server (ultimo import / ultima lettura foglio)
    async function reload() {
        try { applyServerData(await api('/data')); refresh(); }
        catch (e) { setSrc('Impossibile caricare i dati Consegne: ' + e.message, true); }
    }

    function refresh(msg) {
        setSrc(msg);
        const body = rootEl.querySelector('#cgBody');
        if (!tratt || !db) {
            const canImp = meta && meta.puoImportare;
            body.innerHTML = `<div class="cg-card cg-empty">
                <h2>Mancano ancora dei dati</h2>
                <p>${!tratt ? (canImp ? 'Importa il CSV delle trattative dal gestionale.' : 'Le trattative non sono ancora state importate: chiedi a un amministratore.') + '<br>' : ''}${!db ? 'Il foglio DATABASE non è ancora stato letto: premi "Aggiorna dal foglio Google".' : ''}</p>
              </div>`;
            return;
        }
        compute();
        render(body);
    }

    function heatStyle(p) {
        if (p <= 0) return '';
        const steps = ['--cg-h1', '--cg-h2', '--cg-h3', '--cg-h4', '--cg-h5'];
        const i = Math.min(steps.length - 1, Math.floor(p * steps.length * 1.4));
        return `background:var(${steps[i]});color:${i >= 3 ? '#fff' : 'inherit'}`;
    }

    function render(body) {
        const R = result.recs;
        const months = [...new Set(R.map(r => r.m))].sort((a, b) => a - b);
        const tot = R.length, del = R.filter(isDel).length, dcN = R.filter(r => r.k === 'dc').length, annN = R.filter(r => r.k === 'ann').length;
        const ndTot = R.filter(r => r.k === 'nd').length;

        const kpi = [
            ['all', 'Contratti firmati', tot, 'nel periodo importato', '📝', 'var(--cg-grey-soft)'],
            ['del', 'Consegnati', del, pct(del, tot) + ' dei contratti', '🔑', 'var(--cg-teal-soft)'],
            ['dc', 'Da consegnare', dcN, pct(dcN, tot) + ' dei contratti', '⏳', 'var(--cg-amber-soft)'],
            ['ann', 'Annullate', annN, pct(annN, tot) + ' dei contratti', '✕', 'var(--cg-grey-soft)']
        ].map(([id, l, n, s, ic, bg]) => `<button class="cg-kpi" type="button" data-kpi="${id}">
            <div class="cg-k-top">${l}<span class="cg-dot" style="background:${bg}">${ic}</span></div>
            <div class="cg-num">${fmt(n)}</div><div class="cg-sub">${s}</div></button>`).join('');

        const flagged = [];
        const empty = '<td><span class="cg-cell cg-empty-cell">–</span></td>';
        function row(label, rs, key, isTotal) {
            const n = rs.length;
            const c = f => rs.filter(f).length;
            const dcC = c(r => r.k === 'dc'), annC = c(r => r.k === 'ann'), ndC = c(r => r.k === 'nd');
            const flag = !isTotal && n && dcC / n > .10; if (flag) flagged.push(label);
            let s = `<tr class="${isTotal ? 'cg-total' : ''}"><td class="cg-m">${label}${flag ? '<small title="Più del 10% ancora da consegnare">‡</small>' : ''}</td>`;
            s += `<td><button class="cg-cell cg-tot" type="button" data-f="${key}|all">${fmt(n)}</button></td>`;
            BUCKETS.forEach(k => {
                const x = c(r => r.k === k);
                s += x ? `<td><button class="cg-cell" type="button" style="${heatStyle(x / n)}" data-f="${key}|${k}" title="${x} vetture">${pct(x, n)}</button></td>` : empty;
            });
            if (ndTot) s += ndC ? `<td><button class="cg-cell cg-nd" type="button" data-f="${key}|nd" title="${ndC} vetture">${pct(ndC, n)}</button></td>` : empty;
            s += dcC ? `<td><button class="cg-cell cg-dc" type="button" data-f="${key}|dc" title="${dcC} vetture">${pct(dcC, n)}</button></td>` : empty;
            s += annC ? `<td><button class="cg-cell cg-ann" type="button" data-f="${key}|ann" title="${annC} vetture">${pct(annC, n)}</button></td>` : empty;
            return s + '</tr>';
        }
        let table = '<thead><tr><th>Mese contratto</th><th>Contratti</th>' + BUCKETS.map(k => `<th>${BLABEL(k)}</th>`).join('') +
            (ndTot ? '<th title="Consegnate secondo il foglio, ma senza data di consegna nel CSV">Senza data</th>' : '') +
            '<th>Da consegnare</th><th>Annullate</th></tr></thead><tbody>';
        months.forEach(m => table += row(MESI[m], R.filter(r => r.m === m), m, false));
        table += row('Totale', R, 'T', true) + '</tbody>';

        const reasons = {};
        R.filter(r => r.k === 'dc').forEach(r => reasons[r.stato] = (reasons[r.stato] || 0) + 1);
        const rs = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
        const maxR = rs.length ? rs[0][1] : 1;

        body.innerHTML = `
          <section class="cg-kpis">${kpi}</section>
          <section class="cg-grid">
            <div class="cg-card">
              <h2>Tempistiche consegne per mese di contratto</h2>
              <p class="cg-hint">Percentuale dei contratti firmati nel mese, consegnati dopo N mesi. Clicca una cella per vedere i clienti.</p>
              <div class="cg-scroll"><table class="cg-heat" id="cgHeat">${table}</table></div>
              <p class="cg-foot">Percentuali calcolate sul totale dei contratti firmati nel mese. Consegnata = stato CONSEGNATA nel foglio DATABASE; il mese si calcola dalla data di consegna del CSV (se manca quella effettiva si usa la prevista).
              ${ndTot ? ' "Senza data": consegnate secondo il foglio ma senza nessuna data di consegna nel CSV.' : ''}
              ${flagged.length ? ' ‡ Mesi con più del 10% di contratti ancora da consegnare: la distribuzione è incompleta e si aggiornerà con le prossime consegne.' : ''}</p>
            </div>
            <div class="cg-side">
              <div class="cg-card">
                <h2>Da consegnare, per motivo</h2>
                <p class="cg-hint">Stato indicato nel foglio DATABASE</p>
                <div class="cg-bars" id="cgBars">${rs.map(([s, n]) => `<button class="cg-bar" type="button" data-reason="${encodeURIComponent(s)}">
                    <span class="cg-lbl" title="${esc(s)}">${esc(cap(s))}</span><span class="cg-n">${n}</span>
                    <span class="cg-track"><span class="cg-fill" style="width:${n / maxR * 100}%"></span></span></button>`).join('') || '<p class="cg-hint">Nessuna vettura da consegnare.</p>'}</div>
              </div>
              <button class="cg-verify" type="button" id="cgVerify">
                <span class="cg-big">${result.verify.length}</span>
                <div><b>Da verificare</b><span>Trattative del CSV non trovate nel foglio DATABASE né per targa/telaio né per nome. Non sono conteggiate nella tabella.${result.excl ? ` Escluse perché B2C nel foglio: ${result.excl}.` : ''}</span></div>
              </button>
            </div>
          </section>`;

        body.querySelector('.cg-kpis').addEventListener('click', e => {
            const b = e.target.closest('[data-kpi]'); if (!b) return;
            const base = { n: R.length, label: 'nel periodo importato' }, k = b.dataset.kpi;
            if (k === 'all') openModal('Tutti i contratti firmati', R, null);
            if (k === 'del') openModal('Vetture consegnate', R.filter(isDel), base);
            if (k === 'dc') openModal('Vetture da consegnare', R.filter(r => r.k === 'dc'), base, { reasons: true });
            if (k === 'ann') openModal('Trattative annullate', R.filter(r => r.k === 'ann'), base);
        });
        body.querySelector('#cgHeat').addEventListener('click', e => {
            const b = e.target.closest('[data-f]'); if (!b) return;
            const [mk, bk] = b.dataset.f.split('|');
            const base = mk === 'T' ? R : R.filter(r => r.m === +mk);
            const where = mk === 'T' ? 'Tutti i mesi' : MESI_L[+mk];
            const mLabel = mk === 'T' ? 'nel periodo importato' : 'firmati a ' + MESI_L[+mk].toLowerCase();
            let rows, title, opts = {};
            if (bk === 'all') { rows = base; title = `${where} · tutti i contratti`; }
            else if (bk === 'dc') { rows = base.filter(r => r.k === 'dc'); title = `${where} · da consegnare`; opts.reasons = true; }
            else if (bk === 'ann') { rows = base.filter(r => r.k === 'ann'); title = `${where} · annullate`; }
            else if (bk === 'nd') { rows = base.filter(r => r.k === 'nd'); title = `${where} · consegnate senza data`; }
            else { rows = base.filter(r => r.k === +bk); title = `${where} · consegnate ${BLABEL(+bk).toLowerCase()}`; }
            openModal(title, rows, bk === 'all' ? null : { n: base.length, label: mLabel }, opts);
        });
        body.querySelector('#cgBars').addEventListener('click', e => {
            const b = e.target.closest('[data-reason]'); if (!b) return;
            openModal('Vetture da consegnare', R.filter(r => r.k === 'dc'), { n: R.length, label: 'nel periodo importato' },
                { reasons: true, chip: decodeURIComponent(b.dataset.reason) });
        });
        body.querySelector('#cgVerify').addEventListener('click', () =>
            openModal('Da verificare: non trovate nel foglio DATABASE', result.verify, null, { verify: true }));
    }

    /* ================= finestra lista clienti ================= */
    let ov = null, cur = [], curChip = null, curVerify = false, lastFocus = null;
    function ensureModal() {
        if (ov) return;
        ov = document.createElement('div');
        ov.className = 'cg-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
        ov.innerHTML = `<div class="cg-modal">
            <div class="cg-m-head"><div><h3 id="cgMTitle"></h3><div class="cg-stat" id="cgMStat"></div></div>
              <button class="cg-x" type="button" aria-label="Chiudi">✕</button></div>
            <div class="cg-m-tools"><input type="search" id="cgMSearch" placeholder="Cerca cliente, vettura, consulente o targa"><div class="cg-chips" id="cgMChips"></div></div>
            <div class="cg-m-body"><table class="cg-list" id="cgMList"></table></div></div>`;
        document.body.appendChild(ov);
        ov.querySelector('.cg-x').addEventListener('click', closeModal);
        ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('open')) closeModal(); });
        ov.querySelector('#cgMSearch').addEventListener('input', renderList);
        ov.querySelector('#cgMChips').addEventListener('click', e => {
            const c = e.target.closest('[data-chip]'); if (!c) return;
            curChip = decodeURIComponent(c.dataset.chip) || null;
            ov.querySelectorAll('.cg-chip').forEach(x => x.classList.toggle('on', x === c));
            renderList();
        });
    }
    function openModal(title, rows, base, opts = {}) {
        ensureModal();
        lastFocus = document.activeElement;
        cur = rows; curChip = opts.chip || null; curVerify = !!opts.verify;
        ov.querySelector('#cgMTitle').textContent = title;
        ov.querySelector('#cgMStat').innerHTML = base
            ? `<span class="cg-n">${fmt(rows.length)} vetture</span><span class="cg-p">${pct(rows.length, base.n)}</span><span class="cg-of">su ${fmt(base.n)} contratti ${base.label}</span>`
            : `<span class="cg-n">${fmt(rows.length)} ${curVerify ? 'trattative' : 'contratti'}</span>`;
        const chips = ov.querySelector('#cgMChips');
        if (opts.reasons) {
            const cnt = {}; rows.forEach(r => cnt[r.stato] = (cnt[r.stato] || 0) + 1);
            chips.innerHTML = `<button class="cg-chip ${curChip ? '' : 'on'}" type="button" data-chip="">Tutti i motivi</button>` +
                Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([s, n]) =>
                    `<button class="cg-chip ${curChip === s ? 'on' : ''}" type="button" data-chip="${encodeURIComponent(s)}">${esc(cap(s))} (${n})</button>`).join('');
        } else chips.innerHTML = '';
        const search = ov.querySelector('#cgMSearch'); search.value = '';
        renderList();
        ov.classList.add('open');
        search.focus();
    }
    function renderList() {
        const q = ov.querySelector('#cgMSearch').value.trim().toLowerCase();
        const rows = cur.filter(r => (!curChip || r.stato === curChip) &&
            (!q || [r.cliente, r.marca, r.modello, r.vend, r.targa].join(' ').toLowerCase().includes(q)));
        const list = ov.querySelector('#cgMList');
        if (!rows.length) { list.innerHTML = '<tbody><tr><td class="cg-empty-msg">Nessuna vettura corrisponde alla ricerca.</td></tr></tbody>'; return; }
        list.innerHTML = '<thead><tr><th>Cliente</th><th>Vettura</th><th>Consulente</th><th>Data chiusura</th>' +
            (curVerify ? '<th>Targa / telaio</th><th>Tipo</th><th>Sede</th>'
                : '<th>Data consegna</th><th>Stato</th><th>Provenienza</th><th>Tipo</th><th>Targa / telaio</th>') + '</tr></thead><tbody>' +
            rows.map(r => '<tr>' +
                `<td class="cg-cl">${esc(r.cliente)}</td><td>${esc(r.marca)} ${esc(r.modello)}</td><td>${esc(r.vend)}</td><td>${esc(r.chiusura)}</td>` +
                (curVerify ? `<td>${esc(r.targa)}</td><td>${esc(r.tipo)}</td><td>${esc(r.sede)}</td>`
                    : `<td>${r.consegna ? esc(r.consegna) : '—'}${r.prevista ? '<span class="cg-prev">prevista</span>' : ''}</td>` +
                    `<td><span class="cg-tag ${isDel(r) ? 'ok' : r.k === 'dc' ? 'wait' : ''}">${esc(cap(r.stato))}</span></td>` +
                    `<td>${esc(r.prov)}</td><td>${esc(r.tipo)}</td><td>${esc(r.targa)}</td>`) + '</tr>').join('') + '</tbody>';
    }
    function closeModal() { ov.classList.remove('open'); if (lastFocus && lastFocus.focus) lastFocus.focus(); }

    /* ================= avvio ================= */
    function init() {
        rootEl = document.getElementById('consegneRoot');
        if (!rootEl) return;
        if (!rootEl.dataset.ready) { shell(); rootEl.dataset.ready = '1'; }
        if (!result) rootEl.querySelector('#cgBody').innerHTML = '<div class="cg-card cg-empty"><p>Caricamento dati…</p></div>';
        reload();
        // Finche' l'area Consegne e' aperta si riallinea da sola ogni 5 minuti
        // (il server rilegge il foglio con la stessa frequenza).
        if (!autoTimer) {
            autoTimer = setInterval(() => {
                const page = document.getElementById('consegnePage');
                if (page && page.style.display !== 'none' && !document.hidden) reload();
            }, AUTO_REFRESH_MS);
        }
    }

    window.Consegne = { init: init };
})();
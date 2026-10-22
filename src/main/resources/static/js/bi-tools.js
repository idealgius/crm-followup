/* =====================================================================
   STRUMENTI COMUNI DELLA BI (Consegne, Stock, Commerciale)
   ---------------------------------------------------------------------
   Due pulsanti da mettere nell'intestazione di una finestra o di un riquadro:
     ⛶ Schermo intero -> la finestra occupa tutto lo schermo e la tabella si
                         adatta alla larghezza: tutte le colonne si leggono senza
                         scorrimento laterale (il testo va a capo).
     ⬇ Excel          -> file Excel professionale della tabella che si vede (con i
                         filtri applicati), costruito dal server
                         (POST /api/bi/export/excel, stessa grafica dell'Excel del
                         Commerciale; colore della sezione).

   Uso:
     const bar = BiTools.toolbar({
         sezione: 'CONSEGNE' | 'STOCK' | 'COMMERCIALE',   // permessi e colore
         titolo: () => 'Luglio · da consegnare',
         sottotitolo: () => '13 vetture su 133 contratti',
         table: () => elementoTable,                      // tabella da esportare
         prima: async () => {},  dopo: () => {},          // es. mostrare tutte le righe
         fs: elementoDaIngrandire                         // finestra (cg-modal / cm-modal / card)
     });
     header.insertBefore(bar, bottoneChiudi);
   ===================================================================== */
(function () {
    const COLORE = { CONSEGNE: 'blu', STOCK: 'blu', COMMERCIALE: 'bordeaux' };

    // testo pulito di una cella (righe secondarie unite con " · ", niente frecce dei filtri)
    const VIA = '.cg-colf, .cg-info, button.cg-vbtn, button.cg-vlink, .cg-dec, input, select, .bi-tools, script, style, [data-bi-via]';
    function testo(el) {
        // lo stile si legge sugli elementi veri (la copia staccata dalla pagina non ce l'ha)
        const orig = el.querySelectorAll('*');
        const c = el.cloneNode(true), copia = c.querySelectorAll('*');
        orig.forEach((o, i) => {
            const d = getComputedStyle(o).display;
            if (d === 'none') copia[i].setAttribute('data-bi-via', '');
            else if (/^(block|flex|grid|list-item|table|inline-block|inline-flex)$/.test(d)) copia[i].setAttribute('data-bi-riga', '');   // anche i bollini
        });
        c.querySelectorAll(VIA).forEach(x => x.remove());
        c.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
        c.querySelectorAll('[data-bi-riga]').forEach(x => x.insertAdjacentText('beforebegin', '\n'));
        let t = c.textContent.replace(/[↕↑↓▾▸‡]/g, '').replace(/\u00a0/g, ' ');
        // valori dei campi di testo (es. motivo delle rimosse)
        el.querySelectorAll('input[type="text"], input:not([type]), select').forEach(i => { if (i.value) t += '\n' + i.value; });
        return t.split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ');
    }
    // filtri scelti in una finestra (chip accesi, menu, ricerca) -> "Filtri: ... "
    function filtriAttivi(box) {
        if (!box) return '';
        const out = [];
        box.querySelectorAll('input[type="search"]').forEach(i => { if (i.value.trim()) out.push('ricerca "' + i.value.trim() + '"'); });
        box.querySelectorAll('select').forEach(s => { if (s.value) { const o = s.options[0] ? s.options[0].text.replace(/:.*$/, '') : ''; out.push((o ? o + ': ' : '') + s.value); } });
        box.querySelectorAll('.cg-chip.on').forEach(b => {
            const t = b.textContent.replace(/\s*\(\d[\d.]*(\/\d[\d.]*)?\)\s*/g, ' ').replace(/[▾📌]/g, '').trim();
            if (t && !/^tutt[ie]\b/i.test(t) && !b.closest('.bi-tools')) out.push(t);
        });
        return out.length ? 'Filtri: ' + [...new Set(out)].join(' · ') : '';
    }
    // "1.234" -> 1234 · "53,1%" -> 0.531 · "12.900 €" -> 12900 · "11/10/2026" -> data
    function numero(s) {
        const t = String(s || '').trim();
        if (!t || /^[–—-]$/.test(t)) return { v: null, k: 'vuoto' };
        let m = /^(-?[\d.]+(?:,\d+)?)\s*%$/.exec(t);
        if (m) return { v: parseFloat(m[1].replace(/\./g, '').replace(',', '.')) / 100, k: 'pct' };
        m = /^(-?[\d.]+(?:,\d+)?)\s*€$|^€\s*(-?[\d.]+(?:,\d+)?)$/.exec(t);
        if (m) return { v: parseFloat((m[1] || m[2]).replace(/\./g, '').replace(',', '.')), k: 'eur' };
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return { v: t, k: 'data' };          // data: nel file diventa una data vera
        m = /^-?\d{1,3}(?:\.\d{3})+$|^-?\d+(?:,\d+)?$/.exec(t);
        if (m && !/^0\d/.test(t)) return { v: parseFloat(t.replace(/\./g, '').replace(',', '.')), k: 'int' };
        return { v: t, k: 'text' };
    }
    function leggiTabella(table) {
        const rigaH = table.querySelector('thead tr') || table.querySelector('tr');
        const heads = [...rigaH.children].map(th => testo(th));
        const corpo = [...table.querySelectorAll('tbody tr, tr')].filter(tr => tr !== rigaH && !tr.closest('thead'));
        const righe = [], tot = [];
        corpo.forEach(tr => {
            const tds = [...tr.children].filter(x => x.tagName === 'TD' || x.tagName === 'TH');
            if (!tds.length || (tds.length === 1 && heads.length > 1)) return;      // riga "nessun dato"
            const vals = tds.map(testo);
            if (tr.classList.contains('tot') || tr.classList.contains('cg-total') || tr.classList.contains('cg-an-sum') || /^totale$/i.test(vals[0])) tot.push(vals); else righe.push(vals);
        });
        const tutte = righe.concat(tot);
        const tipoDi = arr => { const ks = new Set(arr.map(v => numero(v).k).filter(k => k !== 'vuoto')); return ks.size === 1 && !ks.has('text') ? [...ks][0] : 'text'; };
        // ogni colonna: numerica se TUTTI i valori lo sono; se il numero ha sotto una riga
        // di dettaglio (es. "25.990 € · venduta 24.500 €") si fanno due colonne: numero + dettaglio
        const colonne = [], estrai = [];
        heads.forEach((h, c) => {
            const celle = tutte.map(r => String(r[c] || ''));
            const tipo = tipoDi(celle);
            if (tipo !== 'text') { colonne.push({ t: h, tipo }); estrai.push(r => numero(r[c]).v); return; }
            const primo = celle.map(v => v.split(' · ')[0]), resto = celle.map(v => v.split(' · ').slice(1).join(' · '));
            const kp = primo.map(v => numero(v).k).filter(k => k !== 'vuoto');
            const nk = new Set(kp.filter(k => k !== 'text')), nTxt = kp.filter(k => k === 'text').length;
            if (nk.size === 1 && nTxt <= kp.length * 0.1 && resto.some(Boolean)) {      // pochi valori senza numero: vanno nel dettaglio
                const tp = [...nk][0], parti = r => { const v = String(r[c] || ''), p = v.split(' · '), n = numero(p[0]); return n.k === tp ? [n.v, p.slice(1).join(' · ')] : [null, v]; };
                colonne.push({ t: h, tipo: tp }); estrai.push(r => parti(r)[0]);
                // dettaglio fatto solo di "numero + parola" (es. "28 auto") -> colonna numerica "(n. auto)"
                const det = celle.map(v => { const x = []; x[c] = v; return parti(x)[1]; }).filter(v => v && numero(v).k !== 'vuoto');
                // dettaglio numerico (es. "80,19%") -> colonna numerica vera
                const dk = new Set(det.map(v => numero(v).k).filter(k => k !== 'vuoto'));
                if (det.length && dk.size === 1 && !dk.has('text') && !dk.has('data')) {
                    const k = [...dk][0];
                    colonne.push({ t: h + (k === 'pct' ? ' %' : ' (dettaglio)'), tipo: k });
                    estrai.push(r => { const v = parti(r)[1]; const n = numero(v); return n.k === k ? n.v : null; });
                    return;
                }
                const mm = det.map(v => /^([\d.]+) ([^\d\s]+)$/.exec(v));
                if (det.length && mm.every(Boolean) && new Set(mm.map(m => m[2])).size === 1) {
                    colonne.push({ t: h + ' (n. ' + mm[0][2] + ')', tipo: 'int' });
                    estrai.push(r => { const m = /^([\d.]+) /.exec(parti(r)[1]); return m ? parseFloat(m[1].replace(/\./g, '')) : null; });
                    return;
                }
                colonne.push({ t: h + ' · dettaglio', tipo: 'text' }); estrai.push(r => parti(r)[1]);
                return;
            }
            colonne.push({ t: h, tipo: 'text' }); estrai.push(r => r[c] || '');
        });
        const conv = r => estrai.map(f => f(r));
        const R = righe.map(conv), T = tot.length ? conv(tot[tot.length - 1]) : null;
        // larghezza: quasi tutte le righe devono stare (90%), il testo piu' lungo va a capo;
        // l'intestazione va a capo anche lei (non allarga le colonne dei numeri)
        const lung = (v, tipo) => {
            if (v == null || v === '') return 1;
            if (tipo === 'text') return String(v).length;
            if (tipo === 'data') return 10;
            if (tipo === 'pct') return 7;                                   // "19,47%"
            const n = Math.round(Math.abs(Number(v))), cifre = String(n).length + Math.floor((String(n).length - 1) / 3);
            return tipo === 'eur' ? cifre + 5 : cifre;                      // "25.990,00 €"
        };
        colonne.forEach((col, c) => {
            const lens = R.slice(0, 600).concat(T ? [T] : []).map(r => lung(r[c], col.tipo)).sort((x, y) => x - y);
            const p90 = lens.length ? lens[Math.min(lens.length - 1, Math.floor(lens.length * 0.9))] : 0;
            // l'intestazione va a capo: le colonne dei numeri restano strette quanto i numeri
            const parola = Math.min(10, Math.max(...col.t.split(/\s+/).map(w => w.length)));
            col.w = col.tipo === 'text' ? Math.max(8, parola + 1, Math.min(30, p90 + 2))
                : Math.max(7, Math.min(9, parola + 1), Math.min(14, p90 + 2));   // parole corte dell'intestazione intere
        });
        return { colonne, righe: R, totale: T };
    }
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const nomeFile = s => String(s || 'export').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || 'export';

    // intestazione della pagina visibile (vista, periodo, sede...) -> sottotitolo dell'Excel
    function contestoPagina(sez) {
        const id = { CONSEGNE: 'consegneRoot', STOCK: 'stockRoot', COMMERCIALE: 'commercialeRoot' }[sez];
        const root = id && document.getElementById(id); if (!root) return '';
        return [...root.querySelectorAll('.cm-vhead, .st-vhead, .cg-vista > span')].filter(e => e.offsetParent || e.getClientRects().length)
            .map(e => [...e.children].length && !e.matches('span') ? [...e.children].map(testo).filter(Boolean).join(' · ') : testo(e)).join(' · ');
    }
    async function esporta(o, btn) {
        const label = btn.innerHTML;
        btn.disabled = true; btn.innerHTML = '<span class="bi-i">⏳</span><span class="bi-l">Preparazione…</span>';
        try {
            if (o.prima) await o.prima();
            let tabs;
            if (o.tabelle) tabs = o.tabelle();          // [{titolo, colonne, righe, totale}] (riquadri: tabelle o grafici)
            else {
                const table = typeof o.table === 'function' ? o.table() : o.table;
                if (!table) throw new Error('Nessuna tabella da esportare');
                tabs = [Object.assign({ titolo: '' }, leggiTabella(table))];
            }
            if (o.dopo) o.dopo();
            tabs = (tabs || []).filter(t => t && t.colonne.length && t.righe.length);
            if (!tabs.length) throw new Error('Non ci sono dati da esportare con i filtri scelti');
            const titolo = (typeof o.titolo === 'function' ? o.titolo() : o.titolo) || 'Elenco';
            const ctx = [contestoPagina(o.sezione), BiTools.contesto[o.sezione] ? BiTools.contesto[o.sezione]() : ''].filter(Boolean).join(' · ');
            const sotto = [ctx, (typeof o.sottotitolo === 'function' ? o.sottotitolo() : o.sottotitolo) || ''].filter(Boolean).join(' · ');
            const body = {
                sezione: o.sezione, colore: COLORE[o.sezione] || 'blu', titolo, sottotitolo: sotto,
                file: nomeFile(titolo) + '_' + new Date().toISOString().slice(0, 10) + '.xlsx',
                fogli: [{ nome: titolo.replace(/^(Consegne|Stock|Commerciale) · /, '').slice(0, 28), tabelle: tabs }]
            };
            const res = await fetch('/api/bi/export/excel', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) { let m = 'Errore ' + res.status; try { m = (await res.json()).error || m; } catch (e) { /* */ } throw new Error(m); }
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = body.file;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        } catch (e) {
            if (o.dopo) try { o.dopo(); } catch (x) { /* */ }
            alert('Excel non creato: ' + e.message);
        } finally { btn.disabled = false; btn.innerHTML = label; }
    }

    function schermoIntero(el, btn, forza) {
        const on = forza !== undefined ? forza : !el.classList.contains('bi-fs');
        if (!on) fsKey = null;
        el.classList.toggle('bi-fs', on);
        const ov = el.parentElement;
        if (ov && (ov.classList.contains('cg-ov') || ov.classList.contains('cm-ov'))) ov.classList.toggle('bi-fs-ov', on);
        document.documentElement.classList.toggle('bi-fs-on', !!document.querySelector('.bi-fs'));
        if (btn) { btn.innerHTML = on ? '<span class="bi-i">⤡</span><span class="bi-l">Riduci</span>' : '<span class="bi-i">⛶</span><span class="bi-l">Schermo intero</span>'; btn.setAttribute('aria-pressed', on); btn.title = on ? 'Torna alla finestra normale' : 'Mostra a tutto schermo: tutte le colonne senza scorrimento laterale'; }
        window.dispatchEvent(new Event('resize'));   // i grafici si ridimensionano
    }

    function toolbar(o) {
        const bar = document.createElement('div');
        bar.className = 'bi-tools';
        bar.innerHTML = (o.fs ? '<button type="button" class="bi-t-fs" title="Mostra a tutto schermo: tutte le colonne senza scorrimento laterale"><span class="bi-i">⛶</span><span class="bi-l">Schermo intero</span></button>' : '')
            + (o.table ? '<button type="button" class="bi-t-xls" title="Scarica in Excel quello che vedi, con i filtri scelti"><span class="bi-i">⬇</span><span class="bi-l">Excel</span></button>' : '');
        const fsBtn = bar.querySelector('.bi-t-fs'), xBtn = bar.querySelector('.bi-t-xls');
        if (fsBtn) fsBtn.addEventListener('click', e => { e.stopPropagation(); schermoIntero(typeof o.fs === 'function' ? o.fs() : o.fs, fsBtn); });
        if (xBtn) xBtn.addEventListener('click', e => { e.stopPropagation(); esporta(o, xBtn); });
        bar._reset = () => { const el = typeof o.fs === 'function' ? o.fs() : o.fs; if (el && el.classList.contains('bi-fs')) schermoIntero(el, fsBtn, false); };
        return bar;
    }
    // Esc esce dallo schermo intero prima di chiudere la finestra
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        const el = document.querySelector('.bi-fs'); if (!el) return;
        const b = el.querySelector('.bi-t-fs');
        schermoIntero(el, b, false);
        e.stopImmediatePropagation();
    }, true);

    /* ---------- dati di un grafico Chart.js -> tabella ---------- */
    function leggiGrafico(canvas) {
        const ch = window.Chart && window.Chart.getChart ? window.Chart.getChart(canvas) : null;
        if (!ch || !ch.data) return null;
        const labels = (ch.data.labels || []).map(l => (Array.isArray(l) ? l.join(' ') : String(l)).replace(/\s+·\s+[\d.]+(\s*\([\d.,]+\s*%\))?$/, ''));   // "Usata · 585 (61,1%)" -> "Usata"
        const torta = /doughnut|pie|polarArea/.test(ch.config.type);
        const ds = ch.data.datasets.map((d, i) => ({ d, i })).filter(x => ch.isDatasetVisible(x.i) && !x.d.biEscludi);
        if (!labels.length || !ds.length) return null;
        const val = v => { const n = v && typeof v === 'object' ? (v.y != null ? v.y : v.r) : v; return typeof n === 'number' && isFinite(n) ? n : null; };
        const righe = [];
        labels.forEach((l, j) => {
            if (torta && ch.getDataVisibility && !ch.getDataVisibility(j)) return;
            righe.push([l].concat(ds.map(x => val(x.d.data[j]))));
        });
        const colonne = [{ t: 'Voce', tipo: 'text' }].concat(ds.map(x => ({ t: x.d.label || 'Valore', tipo: /%/.test(x.d.label || '') ? 'text' : 'int' })));
        let totale = null;
        if (ds.length === 1) {               // una sola serie: quota sul totale
            const tot = righe.reduce((n, r) => n + (r[1] || 0), 0);
            if (tot > 0) { colonne.push({ t: '% sul totale del grafico', tipo: 'pct' }); righe.forEach(r => r.push((r[1] || 0) / tot)); totale = ['Totale', tot, 1]; }
        }
        colonne.forEach((c, i) => { c.w = i === 0 ? Math.min(40, Math.max(14, ...righe.map(r => String(r[0]).length + 2))) : Math.max(12, Math.max(...c.t.split(/\s+/).map(w => w.length)) + 2); });
        return { colonne, righe, totale };
    }
    const visibile = el => !!(el.offsetParent || el.getClientRects().length) && !el.closest('.chart-perm-hidden');
    const titoloDi = card => { const h = card.querySelector('h2, h3'); return h ? testo(h) : ''; };
    const chiaveDi = card => card.dataset.cc || card.dataset.cat || titoloDi(card);
    // tutte le tabelle visibili del riquadro; se non ce ne sono, i dati dei grafici
    function tabelleDi(card) {
        // elenchi con limite di righe (Commerciale: prime 500): per l'Excel si mostrano tutte
        const rb = [...card.querySelectorAll('.cm-rbox')].filter(b => b._draw);
        rb.forEach(b => { b._tutte = true; b._draw(); });
        try { return tabelleDi2(card); } finally { rb.forEach(b => { b._tutte = false; b._draw(); }); }
    }
    function tabelleDi2(card) {
        const tbl = [...card.querySelectorAll('table')].filter(t => visibile(t) && !t.closest('.bi-tools') && t.querySelector('td'));
        if (tbl.length) return tbl.map((t, i) => { const cap = t.closest('[data-table]') ? '' : (tbl.length > 1 ? (t.caption ? testo(t.caption) : 'Tabella ' + (i + 1)) : ''); return Object.assign({ titolo: cap }, leggiTabella(t)); });
        const cv = [...card.querySelectorAll('canvas')].filter(visibile).map(leggiGrafico).filter(Boolean);
        return cv.map((t, i) => Object.assign({ titolo: cv.length > 1 ? 'Grafico ' + (i + 1) : '', nota: 'Dati del grafico' }, t));
    }
    const SEZ = { consegneRoot: 'CONSEGNE', stockRoot: 'STOCK', commercialeRoot: 'COMMERCIALE' };
    const NOME = { CONSEGNE: 'Consegne', STOCK: 'Stock', COMMERCIALE: 'Commerciale' };
    let fsKey = null;
    // aggiunge Schermo intero + Excel ai riquadri (card) con una tabella o un grafico
    function arricchisci(root, sez) {
        root.querySelectorAll('.cg-card, .cm-card').forEach(card => {
            if (card.dataset.biOk || card.classList.contains('cg-empty') || card.classList.contains('cm-empty') || card.classList.contains('cg-an-filters')) return;
            if (card.querySelector('.bi-tools')) { card.dataset.biOk = '1'; return; }      // ha gia' i suoi (elenchi)
            if (!card.querySelector('table, canvas')) return;
            card.dataset.biOk = '1';
            const bar = toolbar({
                sezione: sez,
                titolo: () => NOME[sez] + ' · ' + (titoloDi(card) || 'Riquadro'),
                sottotitolo: () => { const p = card.querySelector('.cg-hint, .cm-hint'); return [p ? testo(p) : '', filtriAttivi(card)].filter(Boolean).join(' · '); },
                tabelle: () => tabelleDi(card),
                table: true,
                fs: card
            });
            bar.classList.add('bi-tools-card');
            // ◎ Solo questo: il riquadro occupa la pagina, gli altri si nascondono (vedi focus)
            const fb = document.createElement('button');
            fb.type = 'button'; fb.className = 'bi-t-focus'; fb.title = 'Mostra solo questo riquadro, più grande e con i dati in evidenza';
            fb.innerHTML = '<span class="bi-i">◎</span><span class="bi-l">Solo questo</span>';
            fb.addEventListener('click', e => { e.stopPropagation(); focus(card, !card.classList.contains('bi-focus')); });
            bar.insertBefore(fb, bar.firstChild);
            const tit = card.querySelector('h2, h3');
            if (tit && !tit.closest('button, a, [data-sort], [data-list]') && !tit.querySelector('button, a')) {
                tit.classList.add('bi-tit-click'); tit.title = 'Clicca per vedere solo questo riquadro';
                tit.addEventListener('click', () => { if (!card.classList.contains('bi-focus') && !card.classList.contains('bi-fs')) focus(card, true); });
            }
            bar.querySelector('.bi-t-fs').addEventListener('click', () => { fsKey = card.classList.contains('bi-fs') ? chiaveDi(card) : null; });
            const gruppo = [...card.querySelectorAll('.cg-an-hbtns, .cm-cc-btns')].find(g => g.closest('.cg-card, .cm-card') === card);
            const testa = [...card.querySelectorAll('.st-ch-head, .cm-cc-h, header')].find(g => g.closest('.cg-card, .cm-card') === card);
            if (gruppo) gruppo.appendChild(bar);
            else if (testa) testa.appendChild(bar);
            else { bar.classList.add('bi-tools-float'); card.insertBefore(bar, card.firstChild); }
            riducibile(card, bar, sez);
        });
        // la pagina si e' ridisegnata mentre un riquadro era a schermo intero: si rimette
        if (fsKey && !document.querySelector('.bi-fs')) {
            const c = [...root.querySelectorAll('[data-bi-ok]')].find(x => chiaveDi(x) === fsKey);
            if (c) schermoIntero(c, c.querySelector('.bi-tools-card .bi-t-fs'), true); else fsKey = null;
        }
        if (!document.querySelector('.bi-fs')) document.documentElement.classList.remove('bi-fs-on');
        if (focusKey && !root.querySelector('.bi-focus')) {
            const c = [...root.querySelectorAll('[data-bi-ok]')].find(x => chiaveDi(x) === focusKey && ctxDi(x) === focusCtx);
            if (c) focus(c, true, true); else { esciFocus(); }
        }
    }

    /* ---------- ▴ Riduci / ▾ Espandi ----------
       Ogni riquadro si puo' chiudere lasciando solo il titolo (come "Giacenza per marchio"
       dello Stock). La scelta resta ricordata in questo browser. */
    const LS_RID = 'biRiquadriRidotti';
    let ridotti = null;
    const leggiRid = () => { if (!ridotti) { try { ridotti = new Set(JSON.parse(localStorage.getItem(LS_RID) || '[]')); } catch (e) { ridotti = new Set(); } } return ridotti; };
    const salvaRid = () => { try { localStorage.setItem(LS_RID, JSON.stringify([...leggiRid()].slice(-300))); } catch (e) { /* */ } };
    function segnaTesta(card, bar) {
        // restano visibili solo intestazione (titolo, spiegazione, pulsanti)
        [...card.children].forEach(c => {
            const tiene = c === bar || c.contains(bar) || c.matches('h2, h3, .cg-hint, .cm-hint') || (c.querySelector('h2, h3') && !c.querySelector('table, canvas'));
            if (tiene) c.setAttribute('data-bi-keep', ''); else c.removeAttribute('data-bi-keep');
        });
    }
    function impostaRid(card, btn, on) {
        card.classList.toggle('bi-rid', on);
        btn.innerHTML = on ? '<span class="bi-i">▾</span><span class="bi-l">Espandi</span>' : '<span class="bi-i">▴</span><span class="bi-l">Riduci</span>';
        btn.title = on ? 'Espandi il riquadro' : 'Riduci il riquadro (resta solo il titolo)';
        btn.setAttribute('aria-expanded', String(!on));
    }
    function riducibile(card, bar, sez) {
        if (card.querySelector('[data-gmrid]')) return;           // ha gia' il suo (Stock: Giacenza per marchio)
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'bi-t-rid';
        bar.appendChild(btn);
        const chiave = () => sez + '|' + chiaveDi(card);
        segnaTesta(card, bar);
        impostaRid(card, btn, leggiRid().has(chiave()));
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const on = !card.classList.contains('bi-rid');
            segnaTesta(card, bar);
            impostaRid(card, btn, on);
            if (on) leggiRid().add(chiave()); else leggiRid().delete(chiave());
            salvaRid();
            if (!on) setTimeout(() => window.dispatchEvent(new Event('resize')), 30);   // i grafici riprendono la loro misura
        });
    }

    /* ---------- ◎ SOLO QUESTO RIQUADRO ----------
       Il riquadro scelto prende tutta la pagina (gli altri si nascondono), i grafici si
       ingrandiscono e sopra compare "In evidenza" con i numeri principali. In alto la barra
       "← Torna a …" e i pulsanti per passare al riquadro precedente / successivo. */
    let focusKey = null, focusCtx = null;
    const mainDi = el => el.closest('#cmMain, #stMain, #cgAnalisi, #cgBody');
    // la "pagina" in cui si trova il riquadro (vista + scheda): il focus si rimette dopo un
    // ridisegno solo se si e' ancora nella stessa pagina
    function ctxDi(card) {
        const m = mainDi(card); if (!m) return '';
        const h = m.querySelector('.cm-vhead h2, .st-vhead h2'), tab = document.querySelector('.cg-tab.on');
        return (h ? h.textContent : '') + '|' + (tab && /^cg/.test(m.id) ? tab.textContent : '');
    }
    const nomePagina = card => { const m = mainDi(card), h = m && m.querySelector('.cm-vhead h2, .st-vhead h2'), tab = document.querySelector('.cg-tab.on');
        return h ? h.textContent.trim() : (m && /^cg/.test(m.id) && tab ? tab.textContent.trim() : 'tutta la pagina'); };
    const riquadriDi = main => [...main.querySelectorAll('[data-bi-ok]')].filter(c => c.querySelector('.bi-tools-card') && visibile(c));
    function esciFocus() {
        document.querySelectorAll('.bi-hide').forEach(x => x.classList.remove('bi-hide'));
        document.querySelectorAll('.bi-path').forEach(x => x.classList.remove('bi-path'));
        document.querySelectorAll('.bi-focus-bar, .bi-evid').forEach(x => x.remove());
        document.querySelectorAll('.bi-focus').forEach(c => {
            c.classList.remove('bi-focus');
            const b = c.querySelector('.bi-t-focus'); if (b) { b.innerHTML = '<span class="bi-i">◎</span><span class="bi-l">Solo questo</span>'; b.title = 'Mostra solo questo riquadro, più grande e con i dati in evidenza'; }
        });
        focusKey = null; focusCtx = null;
        window.dispatchEvent(new Event('resize'));
    }
    function focus(card, on, ripristino) {
        const main = mainDi(card); if (!main) return;
        const scroll = ripristino ? window.scrollY : null;
        esciFocus();
        const vis = riquadriDi(main), lista = vis.includes(card) ? vis : [card];
        if (!on) { card.scrollIntoView && card.scrollIntoView({ block: 'start' }); return; }
        const pos = Math.max(0, lista.indexOf(card)), pagina = nomePagina(card);
        // nasconde tutto il resto della pagina, lungo il percorso dal riquadro alla pagina
        let el = card;
        while (el && el !== main) {
            const par = el.parentElement; if (!par) break;
            [...par.children].forEach(x => { if (x !== el && !x.classList.contains('cg-an-filters')) x.classList.add('bi-hide'); });   // i filtri dell'Analisi restano
            par.classList.add('bi-path'); el = par;
        }
        card.classList.add('bi-focus');
        const fbtn = card.querySelector('.bi-t-focus'); if (fbtn) { fbtn.innerHTML = '<span class="bi-i">✕</span><span class="bi-l">Torna a tutti</span>'; fbtn.title = 'Torna a vedere tutti i riquadri'; }
        const bar = document.createElement('div');
        bar.className = 'bi-focus-bar';
        bar.innerHTML = `<button type="button" class="bi-fb-back">← Torna a ${esc(pagina)}</button>
            <div class="bi-fb-t"><small>${esc(pagina)}</small><b>${esc(titoloDi(card) || 'Riquadro')}</b></div>
            ${lista.length > 1 ? `<div class="bi-fb-nav"><button type="button" data-d="-1" ${pos === 0 ? 'disabled' : ''}>‹ Precedente</button><span>${pos + 1} di ${lista.length}</span><button type="button" data-d="1" ${pos === lista.length - 1 ? 'disabled' : ''}>Successivo ›</button></div>` : ''}`;
        main.insertBefore(bar, main.firstChild);
        bar.querySelector('.bi-fb-back').addEventListener('click', () => { const c = card; focus(c, false); });
        bar.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => { const n = lista[pos + Number(b.dataset.d)]; if (n && n.isConnected) focus(n, true); }));
        // In evidenza
        try { const ev = evidenza(card); if (ev) { const h = [...card.querySelectorAll('.st-ch-head, .cm-cc-h, header')].find(g => g.closest('.cg-card, .cm-card') === card); if (h) h.insertAdjacentElement('afterend', ev); else card.insertBefore(ev, (card.querySelector('h2, h3') || {}).nextElementSibling || card.firstChild); } } catch (e) { /* niente evidenza */ }
        focusKey = chiaveDi(card); focusCtx = ctxDi(card);
        window.dispatchEvent(new Event('resize'));
        if (scroll != null) window.scrollTo(0, scroll); else { const top = main.getBoundingClientRect().top + window.scrollY - 80; if (window.scrollY > top) window.scrollTo(0, Math.max(0, top)); }
    }
    // Esc: esce dal "solo questo" (se non c'e' una finestra aperta)
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape' || !document.querySelector('.bi-focus') || document.querySelector('.bi-fs, .cg-ov.open, .cm-ov')) return;
        const c = document.querySelector('.bi-focus'); focus(c, false);
    });

    /* ---------- In evidenza: i numeri principali del riquadro ---------- */
    const nfmt = (v, tipo) => v == null ? '–' : tipo === 'pct' ? (v * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + '%'
        : tipo === 'eur' ? Math.round(v).toLocaleString('it-IT') + ' €' : (Math.round(v * 10) / 10).toLocaleString('it-IT');
    const MESE = /^(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)/i;
    // NUOVO: le sezioni possono aggiungere i loro riquadri sotto "In evidenza":
    // BiTools.evidenzaExtra = [funzione(card) -> elemento HTML oppure null] (es. Lavorazione officina delle Consegne)
    function evidenza(card) {
        const base = evidenzaBase(card);
        const extra = (window.BiTools && BiTools.evidenzaExtra || []).map(f => { try { return f(card); } catch (e) { return null; } }).filter(Boolean);
        if (!extra.length) return base;
        const d = base || Object.assign(document.createElement('div'), { className: 'bi-evid' });
        extra.forEach(x => d.appendChild(x));
        return d;
    }
    function evidenzaBase(card) {
        if (card.querySelector('.cm-rbox, .st-embed') || card.classList.contains('st-embed')) return null;   // elenchi: hanno gia' i loro filtri
        const tab = tabelleDi2(card)[0]; if (!tab || !tab.righe.length) return null;
        const C = tab.colonne, rows = tab.righe.filter(r => r[0] != null && r[0] !== '');
        const num = C.map((c, i) => i).filter(i => i > 0 && (C[i].tipo === 'int' || C[i].tipo === 'eur'));
        const pcs = C.map((c, i) => i).filter(i => i > 0 && C[i].tipo === 'pct' && !/totale del grafico/.test(C[i].t) && C[i].t.trim() !== '%');
        if (!num.length && !pcs.length) return null;
        const items = [];
        const add = (lbl, val, det, cls) => items.push(`<div class="bi-ev ${cls || ''}"><small>${esc(lbl)}</small><b>${esc(val)}</b>${det ? `<span>${esc(det)}</span>` : ''}</div>`);
        const m = num[0];
        if (m != null) {
            const col = C[m], vals = rows.map(r => typeof r[m] === 'number' ? r[m] : 0);
            const tot = tab.totale && typeof tab.totale[m] === 'number' ? tab.totale[m] : vals.reduce((a, b) => a + b, 0);
            const nomeV = /^valore$/i.test(col.t) ? '' : ' · ' + col.t;
            add('Totale' + nomeV, nfmt(tot, col.tipo), rows.length + ' voci nel riquadro');
            const ord = rows.map((r, i) => [r, vals[i]]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
            ord.slice(0, 3).forEach(([r, v], i) => add((i === 0 ? 'Più alto' : i + 1 + '° posto') + nomeV, String(r[0]), nfmt(v, col.tipo) + (tot > 0 ? ' · ' + nfmt(v / tot, 'pct') + ' del riquadro' : ''), i === 0 ? 'top' : ''));
            if (ord.length > 4) { const [r, v] = ord[ord.length - 1]; add('Più basso' + nomeV, String(r[0]), nfmt(v, col.tipo)); }
            // andamento: ultima voce rispetto alla precedente (grafici per mese)
            if (rows.length >= 2 && rows.every(r => MESE.test(String(r[0])))) {
                const a = vals[vals.length - 1], b = vals[vals.length - 2];
                const ult = String(rows[rows.length - 1][0]), inCorso = ult.toLowerCase().startsWith(['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'][new Date().getMonth()]);
                if (b > 0) { const d = (a - b) / b; add('Ultimo mese · ' + ult + (inCorso ? ' (in corso)' : ''), nfmt(a, col.tipo), (d >= 0 ? '▲ +' : '▼ ') + nfmt(d, 'pct') + ' rispetto a ' + rows[rows.length - 2][0], inCorso ? '' : d >= 0 ? 'up' : 'down'); }
                const media = vals.reduce((x, y) => x + y, 0) / vals.length; add('Media per mese', nfmt(media, col.tipo), '');
            }
            // altre serie: il loro totale
            num.slice(1, 4).forEach(i => { const t = tab.totale && typeof tab.totale[i] === 'number' ? tab.totale[i] : rows.reduce((a, r) => a + (typeof r[i] === 'number' ? r[i] : 0), 0); add('Totale · ' + C[i].t, nfmt(t, C[i].tipo), tot > 0 && C[i].tipo === col.tipo ? nfmt(t / tot, 'pct') + ' di ' + col.t.toLowerCase() : ''); });
        }
        // percentuali (es. conversione): migliore e peggiore tra le voci con un numero significativo
        pcs.slice(0, 1).forEach(i => {
            const base = m != null ? Math.max(...rows.map(r => typeof r[m] === 'number' ? r[m] : 0)) * 0.1 : 0;
            const ok = rows.filter(r => typeof r[i] === 'number' && (m == null || (typeof r[m] === 'number' && r[m] >= base))).sort((a, b) => b[i] - a[i]);
            if (ok.length >= 2) {
                add('Migliore · ' + C[i].t, String(ok[0][0]), nfmt(ok[0][i], 'pct'), 'up');
                add('Peggiore · ' + C[i].t, String(ok[ok.length - 1][0]), nfmt(ok[ok.length - 1][i], 'pct'), 'down');
            }
            if (tab.totale && typeof tab.totale[i] === 'number') add('Media · ' + C[i].t, nfmt(tab.totale[i], 'pct'), 'sul totale');
        });
        if (!items.length) return null;
        const d = document.createElement('div');
        d.className = 'bi-evid';
        d.innerHTML = `<div class="bi-ev-h">In evidenza</div><div class="bi-ev-grid">${items.slice(0, 10).join('')}</div>`;
        return d;
    }
    function osserva() {
        Object.keys(SEZ).forEach(id => {
            const root = document.getElementById(id);
            if (!root || root._biObs) return;
            let t = null;
            root._biObs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => arricchisci(root, SEZ[id]), 60); });
            root._biObs.observe(root, { childList: true, subtree: true });
            arricchisci(root, SEZ[id]);
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', osserva); else osserva();
    setTimeout(osserva, 1500);

    window.BiTools = { toolbar, schermoIntero, leggiTabella, leggiGrafico, filtriAttivi, arricchisci, osserva, focus, esciFocus, contesto: {} };
})();
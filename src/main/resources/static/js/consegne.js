/* =====================================================================
   AREA CONSEGNE — Tempistiche di consegna
   ---------------------------------------------------------------------
   Due fonti, entrambe salvate SUL SERVER (visibili a tutti, sempre
   l'ultimo aggiornamento):
   1) CSV trattative di Leadspark ("Importa trattative", solo Admin /
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
    let vendMap = new Map(); // nome consulente nel foglio -> nome completo (dal CSV)
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
            stato: r['STATO'], prov: r['PROVENIENZA'], data: r['DATA'],
            vend: r['VENDITORE'] || '', modello: r['MODELLO'] || '', canale: r['CANALE'] || '', mese: r['MESE'] || ''
        }));
    }

    /* ================= abbinamento ================= */
    const pl = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const STOP = new Set(['SRL', 'SRLS', 'SNC', 'SAS', 'SPA', 'DI', 'E', 'C', 'DE', 'DEL', 'DELLA', 'LA', 'LO', 'S', 'A']);
    function toks(s) {
        // Punti e apostrofi si tolgono SENZA spezzare la parola:
        // "F.V.B." -> "FVB", "D'AVANZO" -> "DAVANZO" (entrambi i file uguali).
        s = String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
            .replace(/[.'\u2019`]/g, '').replace(/[^A-Z0-9 ]/g, ' ');
        return new Set(s.split(/\s+/).filter(w => w.length > 1 && !STOP.has(w)));
    }
    // Lettura "intelligente" delle date (formato sempre giorno/mese/anno):
    //  - 27/01/2026, 5/6/2026, 27-01-2026, 27.01.2026 -> normali
    //  - 2701/2026, 27/012026, 26//02/2026, 27012026  -> si tolgono i
    //    separatori e le 8 cifre si leggono come ggmmaaaa
    //  - 270126 -> 6 cifre ggmmaa (anno 20aa)
    // Giorno e mese devono esistere davvero, altrimenti la data e' "non valida".
    function pd(s) {
        const str = String(s || '').trim();
        if (!str) return null;
        let g, m, a;
        const sep = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?!\d)/.exec(str);
        if (sep) { g = +sep[1]; m = +sep[2]; a = +sep[3]; }
        else {
            const dig = (str.split(/\s/)[0] || '').replace(/\D/g, '');
            if (dig.length === 8) { g = +dig.slice(0, 2); m = +dig.slice(2, 4); a = +dig.slice(4); }
            else if (dig.length === 6) { g = +dig.slice(0, 2); m = +dig.slice(2, 4); a = 2000 + +dig.slice(4); }
            else return null;
        }
        const d = new Date(a, m - 1, g);
        return (d.getFullYear() === a && d.getMonth() === m - 1 && d.getDate() === g) ? d : null;
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
        const G = db.map((g, i) => ({ ...g, _i: i, _pl: pl(g.tt), _tk: toks(g.cliente), _d: pd(g.data),
            _vend: toks(g.vend), _mod: toks(g.modello) }));
        const used = new Set();
        const recs = [], verify = []; let excl = 0;

        // ABBINAMENTO "a livelli": prima si assegnano a TUTTE le trattative
        // gli abbinamenti piu' sicuri (targa + nome), poi quelli per nome,
        // e cosi' via. Ogni riga del foglio puo' essere usata UNA volta sola:
        // due trattative non possono piu' finire sulla stessa riga (prima
        // succedeva con i doppioni nel CSV e gonfiava i conteggi).
        const T = tratt.map(t => {
            const dc = pd(t.chiusura);
            const tk = new Set([...toks(nameOf(t)), ...toks(t.rag)]);
            const info = [];
            const tv = toks(t.vend);
            G.forEach(g => {
                const k = plateKind(t, g), n = nameMatch(tk, g._tk);
                if (k || n) info.push({
                    g, k, n, dd: days(g._d, dc),
                    v: [...tv].some(w => g._vend.has(w)),                      // stesso consulente
                    ann: /ANNULLATA/i.test(String(g.stato || ''))               // riga annullata nel foglio
                });
            });
            return { t, dc, info, best: null, how: '' };
        });
        // ABBINAMENTI FATTI A MANO ("Verifica e abbina a..."): hanno la precedenza
        // su tutto e riservano la riga del foglio scelta dall'operatore.
        const fKey = g => [[...toks(g.cliente)].sort().join(' '), pl(g.tt), String(g.mese || '').toUpperCase().trim() || (g._d ? g._d.getMonth() + 1 : '')].join('|');
        const fCsvKey = (t, dc) => ['csv', [...toks(nameOf(t))].sort().join(' '), pl((t.targa || t.telaio || '').trim()), dc ? fmtD(dc) : t.chiusura].join('|');
        const fDec = key => (meta && meta.verifiche && meta.verifiche[key] && meta.verifiche[key].azione) ? meta.verifiche[key] : null;
        T.forEach(o => {
            const dec = fDec(fCsvKey(o.t, o.dc));
            if (!dec || dec.azione !== 'abbina' || !dec.riga) return;
            const g = G.find(x => !used.has(x._i) && fKey(x) === dec.riga);
            if (!g) return;                       // la riga non c'e' piu' nel foglio: torna "da verificare"
            o.best = { g, k: null, n: false, dd: days(g._d, o.dc) }; o.how = 'abbinata a mano'; o.forced = dec;
            used.add(g._i);
        });

        const tiers = [
            ['targa + nome', x => x.k && x.n],
            ['nome', x => x.n && x.dd <= 45],
            // Solo targa/telaio con NOME DIVERSO: si accetta solo se il consulente
            // e' lo stesso e la riga del foglio non e' annullata. Una stessa vettura
            // puo' essere stata venduta a un cliente, annullata e poi rivenduta a un
            // altro cliente da un altro consulente: non va confusa con quella pratica.
            ['targa/telaio', x => x.k === 'strong' && x.dd <= 60 && x.v && !x.ann],
            ['telaio parziale', x => x.k === 'suffix' && x.dd <= 30 && x.v && !x.ann],
            ['nome', x => x.n]
        ];
        tiers.forEach(([h, f]) => {
            // In ogni livello si abbinano prima le coppie con la data piu' vicina
            const pairs = [];
            T.forEach((o, oi) => { if (!o.best) o.info.forEach(x => { if (f(x)) pairs.push({ oi, x }); }); });
            pairs.sort((a, b) => a.x.dd - b.x.dd);
            pairs.forEach(({ oi, x }) => {
                const o = T[oi];
                if (o.best || used.has(x.g._i)) return;
                o.best = x; o.how = h; used.add(x.g._i);
            });
        });
        // Ultima possibilita': data vicina (entro 7 giorni) + stesso
        // consulente + almeno una parola del modello in comune, su righe del
        // foglio non ancora abbinate.
        T.forEach(o => {
            if (o.best) return;
            const t = o.t, tv = toks(t.vend), tm = toks(`${t.marca} ${t.modello}`);
            let top = null;
            G.forEach(g => {
                if (used.has(g._i)) return;
                const dd = days(g._d, o.dc);
                if (dd > 7) return;
                if (![...tv].some(w => g._vend.has(w))) return;
                const mc = [...tm].filter(w => g._mod.has(w)).length;
                if (!mc) return;
                if (!top || mc > top.mc || (mc === top.mc && dd < top.dd)) top = { g, dd, mc };
            });
            if (top) { o.best = top; o.how = 'data + consulente + modello'; used.add(top.g._i); }
        });

        // Chi tra le trattative "puntava" a ciascuna riga del foglio (serve a
        // spiegare perche' una riga del foglio o una trattativa e' rimasta sola)
        const candidati = new Map();
        T.forEach(o => o.info.forEach(x => {
            if (!candidati.has(x.g._i)) candidati.set(x.g._i, []);
            candidati.get(x.g._i).push(o);
        }));
        const presaDa = new Map(); // riga foglio -> trattativa abbinata
        T.forEach(o => { if (o.best) presaDa.set(o.best.g._i, o); });

        const MESI_UP = ['', 'GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO', 'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE'];
        const normStato = x => String(x || '').toUpperCase().replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
        const targaCsv = t => (t.targa || t.telaio || '').trim();

        // Mese del contratto: vale la colonna MESE del foglio; se manca, la
        // DATA del foglio; se manca anche quella, la data del CSV.
        // Segnala (da verificare a mano) le righe con DATA non leggibile o
        // con DATA di un mese diverso da MESE.
        function meseFoglio(g, fallback) {
            const mMese = MESI_UP.indexOf(String(g.mese || '').toUpperCase().trim());
            const mData = g._d ? g._d.getMonth() + 1 : 0;
            const m = mMese > 0 ? mMese : (mData || (fallback ? fallback.getMonth() + 1 : 0));
            const anno = g._d ? g._d.getFullYear() : (fallback ? fallback.getFullYear() : new Date().getFullYear());
            let anom = null;
            if (String(g.data || '').trim() && !g._d) anom = `Data nel foglio non leggibile ("${g.data}"): vale il mese ${cap(MESI_UP[m] || '')}`;
            else if (g._d && mMese > 0 && mData !== mMese) anom = `Data nel foglio (${fmtD(g._d)}) di un mese diverso da quello indicato (${cap(MESI_UP[mMese])}): vale il mese`;
            return { m, anno, anom };
        }
        function bucket(st, dCon, anno, m) {
            if (st.includes('ANNULLATA')) return 'ann';
            if (st.includes('CONSEGNATA')) {
                if (!dCon || !m) return 'nd';
                return Math.min(6, Math.max(0, (dCon.getFullYear() - anno) * 12 + (dCon.getMonth() + 1) - m));
            }
            return 'dc';
        }
        const keyOf = g => [[...toks(g.cliente)].sort().join(' '), pl(g.tt), String(g.mese || '').toUpperCase().trim() || (g._d ? g._d.getMonth() + 1 : '')].join('|');

        // Consulenti: nel foglio c'e' solo il nome ("CLAUDIO", "CLAUDIO G"): lo si collega
        // al nome completo del CSV usato piu' spesso nelle trattative abbinate.
        const cnt = new Map();
        T.forEach(o => {
            if (!o.best) return;
            const k = String(o.best.g.vend || '').toUpperCase().replace(/\s+/g, ' ').trim();
            if (!k) return;
            if (!cnt.has(k)) cnt.set(k, new Map());
            const m2 = cnt.get(k), full = nice(o.t.vend);
            m2.set(full, (m2.get(full) || 0) + 1);
        });
        vendMap = new Map([...cnt].map(([k, m2]) => [k, [...m2].sort((a, b) => b[1] - a[1])[0][0]]));
        const esclusiB2C = [], manuali = [], eliminate = [], soloCsv = [];
        // Chiave stabile di una trattativa del CSV (resta uguale tra un import e l'altro)
        const csvKey = (t, dc) => ['csv', [...toks(nameOf(t))].sort().join(' '), pl(targaCsv(t)), dc ? fmtD(dc) : t.chiusura].join('|');
        const decisione = key => (meta && meta.verifiche && meta.verifiche[key] && meta.verifiche[key].azione) ? meta.verifiche[key] : null;
        T.forEach(o => {
            const t = o.t, dc = o.dc, best = o.best, how = o.how;
            const base = {
                cliente: nice(nameOf(t)), marca: t.marca.trim(), modello: t.modello.replace(/\s+/g, ' ').trim(),
                vend: nice(t.vend), chiusura: dc ? fmtD(dc) : t.chiusura, targa: targaCsv(t) || '—', tipo: t.tipo,
                sede: t.sede.replace(/Gruppo Auto ?Scala srl/i, '').trim() || 'Agnano', note: []
            };
            if (!best) {
                const occupate = o.info.filter(x => presaDa.has(x.g._i));
                // Stessa vettura (targa/telaio) ma pratica di un altro cliente: tipicamente
                // un contratto annullato e la vettura rivenduta
                const altraPratica = o.info.filter(x => x.k && !x.n && !presaDa.has(x.g._i))
                    .sort((a, b) => a.dd - b.dd)[0];
                if (altraPratica) {
                    const g = altraPratica.g;
                    base.note.push({ c: 'dup', t: `Non abbinata: nel foglio c'è la stessa vettura (targa/telaio ${g.tt || '—'}) ma in una pratica di ${nice(g.cliente)}${g._d ? ' del ' + fmtD(g._d) : ''}${g.vend ? ', consulente ' + nice(g.vend) : ''}${altraPratica.ann ? ', ANNULLATA' : ''}: probabilmente la vettura è stata rivenduta e nel foglio manca la riga di questa trattativa` });
                } else if (occupate.length) {
                    const x = occupate.reduce((a, b) => b.dd < a.dd ? b : a);
                    const altra = presaDa.get(x.g._i);
                    base.doppione = true;
                    base.note.push({ c: 'dup', t: `Non abbinata: la riga del foglio compatibile (${nice(x.g.cliente)}, ${x.g.tt || 'senza targa'}, ${x.g._d ? fmtD(x.g._d) : x.g.data}) è già abbinata alla trattativa di ${nice(nameOf(altra.t))}${altra.dc ? ' del ' + fmtD(altra.dc) : ''}: possibile doppione nel CSV` });
                } else {
                    base.note.push({ c: 'dup', t: `Non abbinata: nel foglio nessuna riga con ${targaCsv(t) ? 'targa/telaio ' + targaCsv(t) + ', ' : ''}nome "${nice(nameOf(t))}" o stessa data, consulente e modello` });
                }
                // Decisione presa a mano su questa trattativa (resta tra un import e l'altro)
                const dkey = csvKey(t, dc), dec = decisione(dkey);
                base.dkey = dkey;
                // Righe del foglio a cui si puo' abbinare a mano ("Verifica e abbina a"):
                // stessa targa/telaio o stesso nome, oppure data vicina + stesso consulente +
                // stesso modello. Solo righe non gia' abbinate, al massimo 3.
                const tv2 = toks(t.vend), tm2 = toks(`${t.marca} ${t.modello}`);
                const cand = o.info.filter(x => !used.has(x.g._i)).map(x => x.g);
                G.forEach(g => {
                    if (used.has(g._i) || cand.includes(g) || days(g._d, dc) > 10) return;
                    if (![...tv2].some(w => g._vend.has(w))) return;
                    if (![...tm2].some(w => g._mod.has(w))) return;
                    cand.push(g);
                });
                base.cands = cand.sort((a, b) => days(a._d, dc) - days(b._d, dc)).slice(0, 3).map(g => ({
                    key: keyOf(g),
                    label: `${nice(g.cliente)} · ${g._d ? fmtD(g._d) : (g.data || 'senza data')}${g.vend ? ' · ' + nice(g.vend) : ''} · ${cap(normStato(g.stato) || 'stato non indicato')}`
                }));
                if (dec && dec.azione === 'elimina') { base.dec = dec; eliminate.push(base); return; }
                if (dec && dec.azione === 'contratto') {
                    // Contratto a parte, non presente nel foglio: mese dalla data di chiusura
                    // del CSV; consegnato solo se nel CSV c'e' la data di consegna effettiva.
                    const dReal = pd(t.consegna);
                    const m = dc ? dc.getMonth() + 1 : 0;
                    const k = dReal && dc ? Math.min(6, Math.max(0, (dReal.getFullYear() - dc.getFullYear()) * 12 + dReal.getMonth() - dc.getMonth())) : 'dc';
                    manuali.push({
                        ...base, dec, m, k, manuale: true,
                        stato: dReal ? 'CONSEGNATA (DATA DA CSV)' : 'NON PRESENTE NEL FOGLIO',
                        consegna: dReal ? fmtD(dReal) : '', prevista: false, prov: 'Non specificato', abb: 'contratto differente'
                    });
                    return;
                }
                // Nessun dubbio (nessuna riga simile, nessun doppione, nessuna stessa vettura
                // di un altro cliente): e' un contratto non ancora inserito nel foglio
                // avanzamento. Si conta SUBITO ("Solo nel CSV", bollino "i"): se nel CSV c'e'
                // la data di consegna effettiva e' consegnato, altrimenti da consegnare.
                // Quando la riga compare nel foglio si abbina da sola.
                const anomalia = !!(altraPratica || occupate.length || base.cands.length);
                if (!anomalia) {
                    const dReal = pd(t.consegna);
                    const m = dc ? dc.getMonth() + 1 : 0;
                    const k = dReal && dc ? Math.min(6, Math.max(0, (dReal.getFullYear() - dc.getFullYear()) * 12 + dReal.getMonth() - dc.getMonth())) : 'dc';
                    soloCsv.push({
                        ...base, m, k, soloCsv: true, check: true, key: dkey,
                        note: [{ c: 'info', t: `Solo nel CSV: nel foglio avanzamento non c'è ancora nessuna riga con ${targaCsv(t) ? 'targa/telaio ' + targaCsv(t) + ' o ' : ''}nome "${nice(nameOf(t))}"` }],
                        stato: dReal ? 'CONSEGNATA (DATA DA CSV)' : 'NON ANCORA NEL FOGLIO AVANZAMENTO',
                        consegna: dReal ? fmtD(dReal) : '', prevista: false, prov: 'Non specificato', abb: 'solo CSV'
                    });
                    return;
                }
                verify.push(base); return;
            }
            const g = best.g;
            if (g.b2c !== 'FALSE') {
                base.note.push({ c: 'abb', t: `Esclusa: nel foglio la riga di ${nice(g.cliente)} ha B2C = ${g.b2c || 'vuoto'}` });
                esclusiB2C.push(base); excl++; return;
            }
            const st = normStato(g.stato);
            const { m, anno, anom } = meseFoglio(g, dc);
            const dReal = pd(t.consegna), dPrev = pd(t.prevista), dCon = dReal || dPrev;
            const k = bucket(st, dCon, anno, m);

            // Motivo dell'abbinamento (solo quando non e' "perfetto")
            const tc = targaCsv(t), tf = (g.tt || '').trim();
            if (o.forced) {
                base.dkey = csvKey(t, dc); base.dec = o.forced;
                base.note.push({ c: 'abb', t: `Riga del foglio: ${nice(g.cliente)}${g._d ? ' del ' + fmtD(g._d) : ''}, ${(g.tt || 'senza targa').trim()}` });
            }
            if (how === 'nome') base.note.push({ c: 'abb', t: tc ? `Abbinata per nome: targa diversa (CSV ${tc}, foglio ${tf || 'vuota'})` : `Abbinata per nome: targa/telaio assente nel CSV (foglio ${tf || 'vuota'})` });
            else if (how === 'targa/telaio' || how === 'telaio parziale') base.note.push({ c: 'abb', t: `Abbinata per ${how}: nome diverso (CSV ${nice(nameOf(t))}, foglio ${nice(g.cliente)})` });
            else if (how === 'data + consulente + modello') base.note.push({ c: 'abb', t: `Abbinata per data, consulente e modello: nome e targa diversi (foglio ${nice(g.cliente)}, ${tf || 'senza targa'})` });
            if (g._d && dc && fmtD(g._d) !== fmtD(dc)) base.note.push({ c: 'abb', t: `Data nel CSV ${fmtD(dc)}, nel foglio ${fmtD(g._d)}: vale quella del foglio` });

            recs.push({
                ...base, chiusura: g._d ? fmtD(g._d) : base.chiusura, m, k, stato: st || 'STATO NON INDICATO',
                consegna: (k === 'nd' || !dCon) ? '' : fmtD(dCon), prevista: !dReal && !!dPrev && k !== 'nd',
                prov: g.prov ? cap(g.prov) : 'Non specificato', abb: how,
                check: !!anom && k !== 'ann', key: anom ? keyOf(g) : null,
                note: anom ? base.note.concat([{ c: 'info', t: anom }]) : base.note
            });
        });

        // Righe del foglio (B2C = FALSE) senza nessuna trattativa nel CSV.
        // Le non annullate si contano (consegnate -> "Senza data", le altre ->
        // "Da consegnare") e vanno verificate a mano (bollino "i"). Le
        // annullate si vedono nella lista ma non si contano.
        const soloFoglio = [];
        G.forEach(g => {
            if (used.has(g._i) || g.b2c !== 'FALSE') return;
            const st = normStato(g.stato);
            const { m, anom } = meseFoglio(g, null);
            const k = st.includes('ANNULLATA') ? 'ann' : st.includes('CONSEGNATA') ? 'nd' : 'dc';
            const note = [];
            const cands = (candidati.get(g._i) || []).filter(o => o.best);
            if (cands.length) {
                const o = cands[0];
                note.push({ c: 'info', t: `Solo nel foglio: la trattativa compatibile di ${nice(nameOf(o.t))}${o.dc ? ' del ' + fmtD(o.dc) : ''} è già abbinata a un'altra riga del foglio: possibile doppione nel foglio` });
            } else {
                note.push({ c: 'info', t: `Solo nel foglio: nel CSV nessuna trattativa con ${g.tt ? 'targa/telaio ' + g.tt.trim() + ' o ' : ''}nome "${nice(g.cliente)}"` });
            }
            if (anom) note.push({ c: 'info', t: anom });
            soloFoglio.push({
                cliente: nice(g.cliente), marca: '', modello: String(g.modello || '').replace(/\s+/g, ' ').trim(),
                vend: nice(g.vend), chiusura: g._d ? fmtD(g._d) : (g.data || ''), targa: (g.tt || '—').trim(), tipo: cap(String(g.canale || '').trim()),
                m, k, stato: st || 'STATO NON INDICATO', consegna: '', prevista: false,
                prov: g.prov ? cap(g.prov) : 'Non specificato', abb: 'solo foglio', solo: true,
                check: k !== 'ann', key: keyOf(g), note
            });
        });
        const contate = soloFoglio.filter(r => r.k !== 'ann' && r.m);

        // QUADRATURA: ogni riga del CSV e del foglio deve finire in un posto solo
        const usiRiga = new Map();
        T.forEach(o => { if (o.best) usiRiga.set(o.best.g._i, (usiRiga.get(o.best.g._i) || 0) + 1); });
        const abbinate = recs;
        const quad = {
            csvTot: tratt.length, abbinate: abbinate.length, esclusiB2C: esclusiB2C.length, verify: verify.length, soloCsv: soloCsv.length,
            manuali: manuali.length, eliminate: eliminate.length,
            foglioTot: G.filter(g => g.b2c === 'FALSE').length,
            soloTot: soloFoglio.length, soloAnn: soloFoglio.filter(r => r.k === 'ann').length,
            soloSenzaMese: soloFoglio.filter(r => !r.m).length,
            righeRiusate: [...usiRiga.values()].filter(v => v > 1).length,
            dateCorrette: G.filter(g => g._d && !/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}/.test(String(g.data || '').trim())).length,
            metodi: abbinate.reduce((acc, r) => { acc[r.abb] = (acc[r.abb] || 0) + 1; return acc; }, {})
        };
        quad.okCsv = quad.abbinate + quad.esclusiB2C + quad.soloCsv + quad.verify + quad.manuali + quad.eliminate === quad.csvTot;
        quad.okFoglio = quad.abbinate + quad.soloTot === quad.foglioTot;
        quad.ok = quad.okCsv && quad.okFoglio && quad.righeRiusate === 0;

        result = { recs: recs.filter(r => r.m).concat(manuali.filter(r => r.m), soloCsv.filter(r => r.m), contate), verify, excl, soloFoglio, soloCsv, esclusiB2C, abbinate, manuali, eliminate, quad };
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
    // Permessi grafici (pagina Permessi → Grafici → Consegne)
    const vede = key => typeof canSeeChart !== 'function' || canSeeChart(key);
    // Verifica manuale (righe con bollino "i"): salvata sul server, per chiave pratica
    const verOf = r => (r && r.key && meta && meta.verifiche) ? meta.verifiche[r.key] || null : null;
    const needsCheck = r => !!(r && r.check && !verOf(r));
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const whenDay = iso => iso ? new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    const whenTime = iso => iso ? new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
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
              <label class="cg-btn cg-btn-ghost" id="cgImportDbLbl" style="display:none" title="Carica la scheda DATABASE esportata come CSV (mette in pausa l'aggiornamento automatico da Google)">Importa foglio (CSV)<input type="file" accept=".csv,text/csv" id="cgFileDb" hidden></label>
              <button type="button" class="cg-btn cg-btn-light" id="cgSheetBtn">Aggiorna dal foglio Google</button>
            </div>
          </div>
          <div class="cg-src" id="cgSrc"></div>
          <div class="cg-tabs" role="tablist">
            <button type="button" class="cg-tab on" data-tab="tempi" role="tab">Tempistiche</button>
            <button type="button" class="cg-tab" data-tab="analisi" role="tab">Analisi avanzamento</button>
          </div>
        </div>
        <div class="cg-wrap" id="cgBody"></div>
        <div class="cg-wrap" id="cgAnalisi" style="display:none"></div>`;
        rootEl.querySelector('#cgFileTratt').addEventListener('change', e => importTrattative(e.target));
        rootEl.querySelector('#cgFileDb').addEventListener('change', e => importDatabaseCsv(e.target));
        rootEl.querySelectorAll('.cg-tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
        rootEl.querySelector('#cgSheetBtn').addEventListener('click', refreshSheet);
    }

    // Schede: "Tempistiche" (tabella esistente) / "Analisi avanzamento" (consegne-analisi.js)
    let tab = 'tempi';
    function showTab(t) {
        tab = t;
        rootEl.querySelectorAll('.cg-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
        rootEl.querySelector('#cgBody').style.display = t === 'tempi' ? '' : 'none';
        const an = rootEl.querySelector('#cgAnalisi');
        an.style.display = t === 'analisi' ? '' : 'none';
        if (t === 'analisi' && window.ConsegneAnalisi) ConsegneAnalisi.show(an);
    }

    // Import del foglio DATABASE come CSV (alternativa alla lettura da Google)
    function importDatabaseCsv(input) {
        const file = input.files && input.files[0]; if (!file) return;
        const r = new FileReader();
        r.onload = async () => {
            try {
                const text = String(r.result);
                slimDatabase(parseCSV(text));          // controllo colonne prima di inviare
                const d = await api('/database/import', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: text })
                });
                applyServerData(d);
                refresh('Foglio importato da CSV: l\'aggiornamento automatico da Google è in pausa finché non premi "Aggiorna dal foglio Google".');
            } catch (e) { setSrc(e.message, true); }
            finally { input.value = ''; }
        };
        r.readAsText(file, 'utf-8');
    }

    function setSrc(msg, isErr) {
        const t = meta && meta.trattative, d = meta && meta.database;
        const imp = rootEl.querySelector('#cgImportLbl');
        if (imp) imp.style.display = meta && meta.puoImportare ? '' : 'none';
        const impDb = rootEl.querySelector('#cgImportDbLbl');
        if (impDb) impDb.style.display = meta && meta.puoImportare ? '' : 'none';
        let foglio = d ? `${fmt(d.righe || 0)} righe · aggiornato ${when(d.aggiornatoAt)}${String(d.aggiornatoDa || '').startsWith('Import CSV') ? ' (da CSV, aggiornamento automatico in pausa)' : ''}` : 'non ancora letto';
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
        if (window.ConsegneAnalisi) ConsegneAnalisi.refresh();
        const body = rootEl.querySelector('#cgBody');
        if (!tratt || !db) {
            const canImp = meta && meta.puoImportare;
            body.innerHTML = `<div class="cg-card cg-empty">
                <h2>Mancano ancora dei dati</h2>
                <p>${!tratt ? (canImp ? 'Importa il CSV delle trattative (Leadspark).' : 'Le trattative non sono ancora state importate: chiedi a un amministratore.') + '<br>' : ''}${!db ? 'Il foglio DATABASE non è ancora stato letto: premi "Aggiorna dal foglio Google".' : ''}</p>
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
        // Le annullate NON fanno parte dei contratti (come nel conteggio sul
        // foglio): percentuali calcolate solo sui contratti validi.
        const RV = R.filter(r => r.k !== 'ann');
        const tot = RV.length, del = RV.filter(isDel).length, dcN = RV.filter(r => r.k === 'dc').length, annN = R.filter(r => r.k === 'ann').length;
        const ndTot = R.filter(r => r.k === 'nd').length;

        const kpi = [
            ['all', 'Contratti firmati', tot, 'nel periodo importato', '📝', 'var(--cg-grey-soft)'],
            ['del', 'Consegnati', del, pct(del, tot) + ' dei contratti', '🔑', 'var(--cg-teal-soft)'],
            ['dc', 'Da consegnare', dcN, pct(dcN, tot) + ' dei contratti', '⏳', 'var(--cg-amber-soft)'],
            ['ann', 'Annullate', annN, 'non incluse nei contratti', '✕', 'var(--cg-grey-soft)']
        ].map(([id, l, n, s, ic, bg]) => `<button class="cg-kpi" type="button" data-kpi="${id}">
            <div class="cg-k-top">${l}<span class="cg-dot" style="background:${bg}">${ic}</span></div>
            <div class="cg-num">${fmt(n)}</div><div class="cg-sub">${s}</div></button>`).join('');

        const flagged = [];
        const empty = '<td><span class="cg-cell cg-empty-cell">–</span></td>';
        function row(label, rs, key, isTotal) {
            const c = f => rs.filter(f).length;
            const n = c(r => r.k !== 'ann'); // contratti validi (annullate escluse)
            const dcC = c(r => r.k === 'dc'), annC = c(r => r.k === 'ann'), ndC = c(r => r.k === 'nd');
            const flag = !isTotal && n && dcC / n > .10; if (flag) flagged.push(label);
            const daVer = c(needsCheck);
            const badge = daVer ? `<button type="button" class="cg-info" data-solo="${key}" title="${daVer} contratti da verificare a mano (solo nel foglio o data da controllare): clicca per vederli">i</button>` : '';
            let s = `<tr class="${isTotal ? 'cg-total' : ''}"><td class="cg-m">${label}${flag ? '<small title="Più del 10% ancora da consegnare">‡</small>' : ''}${badge}</td>`;
            s += n ? `<td><button class="cg-cell cg-tot" type="button" data-f="${key}|all">${fmt(n)}</button></td>` : empty;
            BUCKETS.forEach(k => {
                const x = c(r => r.k === k);
                s += x ? `<td><button class="cg-cell" type="button" style="${heatStyle(x / n)}" data-f="${key}|${k}" title="${x} vetture">${pct(x, n)}</button></td>` : empty;
            });
            if (ndTot) s += ndC ? `<td><button class="cg-cell cg-nd" type="button" data-f="${key}|nd" title="${ndC} vetture">${pct(ndC, n)}</button></td>` : empty;
            s += dcC ? `<td><button class="cg-cell cg-dc" type="button" data-f="${key}|dc" title="${dcC} vetture">${pct(dcC, n)}</button></td>` : empty;
            s += annC ? `<td><button class="cg-cell cg-ann" type="button" data-f="${key}|ann" title="Annullate: non incluse nei contratti">${fmt(annC)}</button></td>` : empty;
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
            <div class="cg-card ${vede('G_CG_TEMPI') ? '' : 'chart-perm-hidden'}">
              <h2>Tempistiche consegne per mese di contratto</h2>
              <p class="cg-hint">Percentuale dei contratti firmati nel mese, consegnati dopo N mesi. Clicca una cella per vedere i clienti.</p>
              <div class="cg-scroll"><table class="cg-heat" id="cgHeat">${table}</table></div>
              <p class="cg-foot">Percentuali calcolate sui contratti firmati nel mese, annullate escluse (la colonna Annullate ne mostra il numero). Il mese del contratto è quello della colonna MESE del foglio DATABASE. Consegnata = stato CONSEGNATA nel foglio; i mesi di consegna si calcolano dalla data di consegna del CSV (se manca quella effettiva si usa la prevista).
              ${ndTot ? ' "Senza data": consegnate secondo il foglio ma senza nessuna data di consegna nel CSV.' : ''}
              ${flagged.length ? ' ‡ Mesi con più del 10% di contratti ancora da consegnare: la distribuzione è incompleta e si aggiornerà con le prossime consegne.' : ''}</p>
              <button type="button" class="cg-quad-link ${result.quad.ok ? 'ok' : 'ko'}" id="cgQuad">${result.quad.ok ? '✓ Quadratura: tutto torna' : '⚠ Quadratura: i conti non tornano'} · dettagli</button>
            </div>
            <div class="cg-side">
              <div class="cg-card ${vede('G_CG_MOTIVI') ? '' : 'chart-perm-hidden'}">
                <h2>Da consegnare, per motivo</h2>
                <p class="cg-hint">Stato indicato nel foglio DATABASE</p>
                <div class="cg-bars" id="cgBars">${rs.map(([s, n]) => `<button class="cg-bar" type="button" data-reason="${encodeURIComponent(s)}">
                    <span class="cg-lbl" title="${esc(s)}">${esc(cap(s))}</span><span class="cg-n">${n}</span>
                    <span class="cg-track"><span class="cg-fill" style="width:${n / maxR * 100}%"></span></span></button>`).join('') || '<p class="cg-hint">Nessuna vettura da consegnare.</p>'}</div>
              </div>
              <button class="cg-verify" type="button" id="cgSolo">
                <span class="cg-big cg-big-info">${result.soloFoglio.filter(r => r.k !== 'ann').length}</span>
                <div><b>Solo nel foglio Google</b><span>Contratti nel foglio DATABASE senza trattativa nel CSV, conteggiati nella tabella. ${(() => { const n = result.soloFoglio.filter(needsCheck).length; return n ? `<em class="cg-todo">${n} da verificare a mano</em>` : '<em class="cg-done">tutti verificati</em>'; })()}${result.soloFoglio.some(r => r.k === 'ann') ? ` Nella lista trovi anche ${result.soloFoglio.filter(r => r.k === 'ann').length} annullate, che non si contano.` : ''}</span></div>
              </button>
              <button class="cg-verify" type="button" id="cgSoloCsv">
                <span class="cg-big cg-big-info">${result.soloCsv.length}</span>
                <div><b>Solo nel CSV</b><span>Trattative del CSV non ancora inserite nel foglio avanzamento, conteggiate nella tabella. ${(() => { const n = result.soloCsv.filter(needsCheck).length; return n ? `<em class="cg-todo">${n} da verificare a mano</em>` : '<em class="cg-done">tutte verificate</em>'; })()}</span></div>
              </button>
              <button class="cg-verify" type="button" id="cgVerify" style="${result.verify.length ? '' : 'display:none'}">
                <span class="cg-big">${result.verify.length}</span>
                <div><b>Da verificare</b><span>Casi dubbi che richiedono una scelta: doppioni, stessa vettura in una pratica di un altro cliente, righe del foglio simili. Non sono conteggiati finché non decidi.</span></div>
              </button>
            </div>
          </section>`;

        body.querySelector('.cg-kpis').addEventListener('click', e => {
            const b = e.target.closest('[data-kpi]'); if (!b) return;
            const base = { n: RV.length, label: 'nel periodo importato' }, k = b.dataset.kpi;
            if (k === 'all') openModal('Tutti i contratti firmati', RV, null);
            if (k === 'del') openModal('Vetture consegnate', R.filter(isDel), base);
            if (k === 'dc') openModal('Vetture da consegnare', R.filter(r => r.k === 'dc'), base, { reasons: true });
            if (k === 'ann') openModal('Trattative annullate (non incluse nei contratti)', R.filter(r => r.k === 'ann'), null);
        });
        body.querySelector('#cgHeat').addEventListener('click', e => {
            const info = e.target.closest('[data-solo]');
            if (info) {
                const mk = info.dataset.solo;
                const base = (mk === 'T' ? R : R.filter(r => r.m === +mk)).filter(r => r.k !== 'ann');
                const rows = base.filter(r => r.check);
                openModal(`${mk === 'T' ? 'Tutti i mesi' : MESI_L[+mk]} · da verificare a mano`, rows,
                    { n: base.length, label: mk === 'T' ? 'nel periodo importato' : 'di ' + MESI_L[+mk].toLowerCase() }, { reasons: true, origin: 'check' });
                return;
            }
            const b = e.target.closest('[data-f]'); if (!b) return;
            const [mk, bk] = b.dataset.f.split('|');
            const baseAll = mk === 'T' ? R : R.filter(r => r.m === +mk);
            const base = baseAll.filter(r => r.k !== 'ann');
            const where = mk === 'T' ? 'Tutti i mesi' : MESI_L[+mk];
            const mLabel = mk === 'T' ? 'nel periodo importato' : 'firmati a ' + MESI_L[+mk].toLowerCase();
            let rows, title, opts = {};
            if (bk === 'all') { rows = base; title = `${where} · tutti i contratti`; }
            else if (bk === 'dc') { rows = base.filter(r => r.k === 'dc'); title = `${where} · da consegnare`; opts.reasons = true; }
            else if (bk === 'ann') { rows = baseAll.filter(r => r.k === 'ann'); title = `${where} · annullate (non incluse nei contratti)`; }
            else if (bk === 'nd') { rows = base.filter(r => r.k === 'nd'); title = `${where} · consegnate senza data`; }
            else { rows = base.filter(r => r.k === +bk); title = `${where} · consegnate ${BLABEL(+bk).toLowerCase()}`; }
            openModal(title, rows, (bk === 'all' || bk === 'ann') ? null : { n: base.length, label: mLabel }, opts);
        });
        body.querySelector('#cgBars').addEventListener('click', e => {
            const b = e.target.closest('[data-reason]'); if (!b) return;
            openModal('Vetture da consegnare', R.filter(r => r.k === 'dc'), { n: RV.length, label: 'nel periodo importato' },
                { reasons: true, chip: decodeURIComponent(b.dataset.reason) });
        });
        body.querySelector('#cgSoloCsv').addEventListener('click', () =>
            openModal('Solo nel CSV: non ancora nel foglio avanzamento', result.soloCsv, null, { reasons: true }));
        body.querySelector('#cgSolo').addEventListener('click', () =>
            openModal('Solo nel foglio Google: senza trattativa nel CSV', result.soloFoglio, null, { reasons: true }));
        body.querySelector('#cgVerify').addEventListener('click', () =>
            openModal('Da verificare: non trovate nel foglio DATABASE', result.verify, null, { verify: true }));
        body.querySelector('#cgQuad').addEventListener('click', openQuadratura);
    }

    /* ================= quadratura ================= */
    function openQuadratura() {
        const q = result.quad;
        const ok = v => v ? '<span class="cg-q-ok">✓</span>' : '<span class="cg-q-ko">✕</span>';
        const lnk = (id, n) => `<button type="button" class="cg-q-n" data-q="${id}">${fmt(n)}</button>`;
        const metodi = Object.entries(q.metodi).sort((a, b) => b[1] - a[1])
            .map(([m, n]) => `<li><span>per ${esc(m)}</span>${lnk('m:' + m, n)}</li>`).join('');
        const html = `
          <div class="cg-q-grid">
            <div class="cg-q-box">
              <h4>${ok(q.okCsv)} CSV trattative importato</h4>
              <div class="cg-q-tot">${fmt(q.csvTot)} <small>trattative (Noleggio già escluso)</small></div>
              <ul>
                <li><span>abbinate al foglio (B2C = FALSE)</span>${lnk('abb', q.abbinate)}</li>
                <li><span>scartate: nel foglio B2C = TRUE</span>${lnk('b2c', q.esclusiB2C)}</li>
                <li><span>solo nel CSV: non ancora nel foglio (conteggiate)</span>${lnk('csv', q.soloCsv)}</li>
                <li><span>da verificare: anomalie da controllare</span>${lnk('ver', q.verify)}</li>
                <li><span>caricate a mano come contratto differente</span>${lnk('man', q.manuali)}</li>
                <li><span>eliminate a mano</span>${lnk('del', q.eliminate)}</li>
              </ul>
              <p class="cg-q-sum">${fmt(q.abbinate)} + ${fmt(q.esclusiB2C)} + ${fmt(q.soloCsv)} + ${fmt(q.verify)} + ${fmt(q.manuali)} + ${fmt(q.eliminate)} = ${fmt(q.abbinate + q.esclusiB2C + q.soloCsv + q.verify + q.manuali + q.eliminate)}</p>
            </div>
            <div class="cg-q-box">
              <h4>${ok(q.okFoglio)} Foglio DATABASE</h4>
              <div class="cg-q-tot">${fmt(q.foglioTot)} <small>righe con B2C = FALSE</small></div>
              <ul>
                <li><span>abbinate al CSV</span>${lnk('abb', q.abbinate)}</li>
                <li><span>solo nel foglio (${fmt(q.soloAnn)} annullate, non contate)</span>${lnk('solo', q.soloTot)}</li>
              </ul>
              <p class="cg-q-sum">${fmt(q.abbinate)} + ${fmt(q.soloTot)} = ${fmt(q.abbinate + q.soloTot)}</p>
            </div>
            <div class="cg-q-box">
              <h4>Come sono state abbinate</h4>
              <ul>${metodi}</ul>
            </div>
            <div class="cg-q-box">
              <h4>Controlli</h4>
              <ul>
                <li><span>righe del foglio usate da più trattative</span><b>${ok(q.righeRiusate === 0)} ${fmt(q.righeRiusate)}</b></li>
                <li><span>date del foglio lette correggendo il formato</span><b>${fmt(q.dateCorrette)}</b></li>
                <li><span>contratti da verificare a mano ancora aperti</span>${lnk('check', result.recs.filter(needsCheck).length)}</li>
              </ul>
            </div>
          </div>`;
        openInfo(q.ok ? '✓ Quadratura: tutto torna' : '⚠ Quadratura: i conti non tornano', html);
    }
    function quadList(id) {
        const q = result;
        if (id === 'abb') return openModal('Trattative abbinate al foglio', q.abbinate, null, {});
        if (id === 'b2c') return openModal('Scartate: B2C = TRUE nel foglio', q.esclusiB2C, null, { verify: true });
        if (id === 'csv') return openModal('Solo nel CSV: non ancora nel foglio avanzamento', q.soloCsv, null, { reasons: true });
        if (id === 'man') return openModal('Caricate a mano come contratto differente', q.manuali, null, {});
        if (id === 'del') return openModal('Trattative eliminate a mano', q.eliminate, null, { verify: true });
        if (id === 'ver') return openModal('Da verificare: non trovate nel foglio DATABASE', q.verify, null, { verify: true });
        if (id === 'solo') return openModal('Solo nel foglio Google: senza trattativa nel CSV', q.soloFoglio, null, { reasons: true });
        if (id === 'check') return openModal('Da verificare a mano', q.recs.filter(r => r.check), null, { reasons: true, origin: 'check' });
        if (id.startsWith('m:')) { const m = id.slice(2); return openModal(`Abbinate per ${m}`, q.abbinate.filter(r => r.abb === m), null, {}); }
    }

    /* ================= finestra lista clienti ================= */
    // Filtri della lista: piu' scelte possibili per gruppo (motivi / origine).
    // Dentro un gruppo vale "una qualsiasi" delle scelte, tra i gruppi vale "e".
    let ov = null, cur = [], curVerify = false, curBase = null, lastFocus = null;
    let curChips = new Set(), curOrigins = new Set();
    const ORIGIN_LABEL = { abb: 'Abbinati', solo: 'Solo nel foglio', csv: 'Solo nel CSV', check: 'Da verificare a mano', ver: 'Verificati a mano' };
    function ensureModal() {
        if (ov) return;
        ov = document.createElement('div');
        ov.className = 'cg-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
        ov.innerHTML = `<div class="cg-modal">
            <div class="cg-m-head"><div><h3 id="cgMTitle"></h3><div class="cg-stat" id="cgMStat"></div></div>
              <button class="cg-x" type="button" aria-label="Chiudi">✕</button></div>
            <div class="cg-m-tools"><input type="search" id="cgMSearch" placeholder="Cerca cliente, vettura, consulente o targa"><div class="cg-chips" id="cgMOrigin"></div><div class="cg-chips" id="cgMChips"></div></div>
            <div class="cg-m-body"><table class="cg-list" id="cgMList"></table><div id="cgMInfo"></div></div>
            <div class="cg-m-foot" id="cgMFoot"></div></div>`;
        document.body.appendChild(ov);
        ov.querySelector('.cg-x').addEventListener('click', closeModal);
        ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('open')) closeModal(); });
        ov.querySelector('#cgMSearch').addEventListener('input', renderList);
        ov.querySelector('#cgMInfo').addEventListener('click', e => {
            const b = e.target.closest('[data-q]'); if (b) quadList(b.dataset.q);
        });
        ov.querySelector('#cgMList').addEventListener('click', e => {
            const d = e.target.closest('[data-dkey]');
            if (d) {
                const az = d.dataset.az;
                if (az === 'elimina' && !confirm('Eliminare questa trattativa? Non verrà più conteggiata né mostrata tra quelle da verificare (si può annullare).')) return;
                if (!az && !confirm('Annullare la decisione presa su questa trattativa? Tornerà tra quelle da verificare.')) return;
                if (az === 'abbina' && !confirm('Abbinare questa trattativa alla riga del foglio scelta?')) return;
                setDecisione(decodeURIComponent(d.dataset.dkey), az, d, d.dataset.riga ? decodeURIComponent(d.dataset.riga) : null);
                return;
            }
            const b = e.target.closest('[data-vkey]'); if (!b) return;
            const key = decodeURIComponent(b.dataset.vkey), on = b.dataset.von === '1';
            if (!on && !confirm('Rimuovere la verifica manuale di questa pratica?')) return;
            setVerifica(key, on, b);
        });
        ov.querySelector('#cgMOrigin').addEventListener('click', e => {
            const c = e.target.closest('[data-origin]'); if (!c) return;
            const id = c.dataset.origin;
            if (!id) curOrigins.clear(); else if (curOrigins.has(id)) curOrigins.delete(id); else curOrigins.add(id);
            renderOrigin(); renderList();
        });
        ov.querySelector('#cgMChips').addEventListener('click', e => {
            const c = e.target.closest('[data-chip]'); if (!c) return;
            const sct = decodeURIComponent(c.dataset.chip);
            if (!sct) curChips.clear(); else if (curChips.has(sct)) curChips.delete(sct); else curChips.add(sct);
            ov.querySelectorAll('#cgMChips .cg-chip').forEach(x => {
                const v = decodeURIComponent(x.dataset.chip);
                x.classList.toggle('on', v ? curChips.has(v) : curChips.size === 0);
            });
            renderList();
        });
    }
    function showListMode(list) {
        ov.querySelector('.cg-m-tools').style.display = list ? '' : 'none';
        ov.querySelector('#cgMList').style.display = list ? '' : 'none';
        ov.querySelector('#cgMInfo').style.display = list ? 'none' : '';
        if (!list) ov.querySelector('#cgMFoot').innerHTML = '';
    }
    function openInfo(title, html) {
        ensureModal();
        if (!ov.classList.contains('open')) lastFocus = document.activeElement;
        showListMode(false);
        ov.querySelector('#cgMTitle').textContent = title;
        ov.querySelector('#cgMStat').innerHTML = '';
        ov.querySelector('#cgMInfo').innerHTML = html;
        ov.classList.add('open');
    }
    function openModal(title, rows, base, opts = {}) {
        ensureModal();
        if (!ov.classList.contains('open')) lastFocus = document.activeElement;
        showListMode(true);
        cur = rows; curVerify = !!opts.verify; curBase = base || null;
        curChips = new Set(opts.chip ? [opts.chip] : []);
        curOrigins = new Set(opts.origin ? [opts.origin] : []);
        renderOrigin();
        ov.querySelector('#cgMTitle').textContent = title;
        const chips = ov.querySelector('#cgMChips');
        if (opts.reasons) {
            const cnt = {}; rows.forEach(r => cnt[r.stato] = (cnt[r.stato] || 0) + 1);
            chips.innerHTML = `<button class="cg-chip ${curChips.size ? '' : 'on'}" type="button" data-chip="">Tutti i motivi</button>` +
                Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([s, n]) =>
                    `<button class="cg-chip ${curChips.has(s) ? 'on' : ''}" type="button" data-chip="${encodeURIComponent(s)}">${esc(cap(s))} (${n})</button>`).join('');
        } else chips.innerHTML = '';
        const search = ov.querySelector('#cgMSearch'); search.value = '';
        renderList();
        ov.classList.add('open');
        search.focus();
    }
    // Filtri origine con conteggi: Tutti / Abbinati al CSV / Solo nel foglio /
    // Da verificare a mano / Verificati a mano (compaiono solo se servono)
    function renderOrigin() {
        const box = ov.querySelector('#cgMOrigin');
        if (curVerify) { box.innerHTML = ''; return; }
        const nSolo = cur.filter(r => r.solo).length, nCsv = cur.filter(r => r.soloCsv).length, nAbb = cur.length - nSolo - nCsv;
        const nCheck = cur.filter(needsCheck).length, nVer = cur.filter(r => r.check && verOf(r)).length;
        const chip = (id, label, n) => `<button class="cg-chip ${(id ? curOrigins.has(id) : curOrigins.size === 0) ? 'on' : ''}" type="button" data-origin="${id}">${label} (${fmt(n)})</button>`;
        const origini = [nAbb, nSolo, nCsv].filter(Boolean).length;
        box.innerHTML = (origini > 1 || nCheck || nVer) ?
            chip('', 'Tutti', cur.length) +
            (origini > 1 ? (nAbb ? chip('abb', 'Abbinati', nAbb) : '') + (nSolo ? chip('solo', 'Solo nel foglio', nSolo) : '') + (nCsv ? chip('csv', 'Solo nel CSV', nCsv) : '') : '') +
            (nCheck ? chip('check', '<span class="cg-info cg-info-static">i</span>Da verificare a mano', nCheck) : '') +
            (nVer ? chip('ver', '✓ Verificati a mano', nVer) : '') : '';
    }
    const originIs = (id, r) => id === 'solo' ? !!r.solo : id === 'csv' ? !!r.soloCsv : id === 'abb' ? (!r.solo && !r.soloCsv)
        : id === 'check' ? needsCheck(r) : id === 'ver' ? !!(r.check && verOf(r)) : true;
    const originOk = r => !curOrigins.size || [...curOrigins].some(id => originIs(id, r));
    const reasonOk = r => !curChips.size || curChips.has(r.stato);

    // Totale e percentuale in alto: sempre calcolati sulle righe filtrate.
    // Con piu' filtri scelti, in basso il totale e la percentuale di ciascuno.
    function renderStat(rows, searchOk) {
        const unit = curVerify ? 'trattative' : (curBase ? 'vetture' : 'contratti');
        const filtered = curChips.size + curOrigins.size > 0;
        ov.querySelector('#cgMStat').innerHTML = curBase
            ? `<span class="cg-n">${fmt(rows.length)} ${unit}</span><span class="cg-p">${pct(rows.length, curBase.n)}</span><span class="cg-of">su ${fmt(curBase.n)} contratti ${curBase.label}${filtered ? ' · con i filtri scelti' : ''}</span>`
            : `<span class="cg-n">${fmt(rows.length)} ${unit}</span>${filtered ? `<span class="cg-p">${pct(rows.length, cur.length)}</span><span class="cg-of">di ${fmt(cur.length)} in elenco · con i filtri scelti</span>` : ''}`;
        const foot = ov.querySelector('#cgMFoot');
        if (curChips.size + curOrigins.size < 2) { foot.innerHTML = ''; return; }
        const den = curBase ? curBase.n : cur.length;
        const denLbl = curBase ? `su ${fmt(curBase.n)} contratti` : `di ${fmt(cur.length)} in elenco`;
        const righe = [];
        curChips.forEach(sc => righe.push([cap(sc), cur.filter(r => r.stato === sc && originOk(r) && searchOk(r)).length]));
        curOrigins.forEach(id => righe.push([ORIGIN_LABEL[id] || id, cur.filter(r => originIs(id, r) && reasonOk(r) && searchOk(r)).length]));
        foot.innerHTML = `<div class="cg-foot-t">Dettaglio per filtro <small>(${denLbl})</small></div><div class="cg-foot-g">` +
            righe.map(([l, n]) => `<div class="cg-foot-i"><span>${esc(l)}</span><b>${fmt(n)}</b><em>${pct(n, den)}</em></div>`).join('') + `</div>`;
    }

    function noteHtml(r) {
        const v = verOf(r), daFare = needsCheck(r);
        let h = (r.note || []).map(n => n.c === 'info'
            ? `<span class="cg-abb ${daFare ? 'cg-abb-info' : 'cg-abb-muted'}">${daFare ? '<span class="cg-info cg-info-static">i</span>' : ''}${esc(n.t)}</span>`
            : `<span class="cg-abb ${n.c === 'dup' ? 'cg-abb-dup' : ''}">${esc(n.t)}</span>`).join('');
        if (r.dkey) {
            const k = encodeURIComponent(r.dkey), dec = r.dec;
            let d = '';
            if (dec && dec.azione === 'abbina') {
                d = `<span class="cg-verok">✓ Verificata e abbinata a mano da ${esc(dec.da)} il ${esc(whenDay(dec.at))} alle ${esc(whenTime(dec.at))}</span>`;
                d += `<button type="button" class="cg-vlink" data-dkey="${k}" data-az="">Annulla</button>`;
            } else if (dec) {
                d = dec.azione === 'elimina'
                    ? `<span class="cg-verok cg-del">✕ Eliminata da ${esc(dec.da)} il ${esc(whenDay(dec.at))} alle ${esc(whenTime(dec.at))}</span>`
                    : `<span class="cg-verok">✓ Caricata come contratto differente da ${esc(dec.da)} il ${esc(whenDay(dec.at))} alle ${esc(whenTime(dec.at))}</span>`;
                d += `<button type="button" class="cg-vlink" data-dkey="${k}" data-az="">Annulla</button>`;
            } else if (r.soloCsv) {
                d = `<span class="cg-dec"><button type="button" class="cg-vbtn cg-vbtn-del" data-dkey="${k}" data-az="elimina">Elimina</button></span>`;
            } else {
                d = (r.cands && r.cands.length ? `<span class="cg-dec-t">Verifica e abbina a:</span><span class="cg-dec">` +
                        r.cands.map(c => `<button type="button" class="cg-vbtn cg-vbtn-abb" data-dkey="${k}" data-az="abbina" data-riga="${encodeURIComponent(c.key)}">${esc(c.label)}</button>`).join('') + `</span>` : '') +
                    `<span class="cg-dec"><button type="button" class="cg-vbtn" data-dkey="${k}" data-az="contratto">Carica come contratto differente</button>` +
                    `<button type="button" class="cg-vbtn cg-vbtn-del" data-dkey="${k}" data-az="elimina">Elimina</button></span>`;
            }
            if (!(meta && meta.puoModificare)) d = d.replace(/<button[^>]*>[^<]*<\/button>/g, '');
            h += d;
        }
        if (r.check && r.key) {
            const k = encodeURIComponent(r.key);
            h += v
                ? `<span class="cg-verok">✓ Verificato manualmente da ${esc(v.da)} il ${esc(whenDay(v.at))} alle ${esc(whenTime(v.at))}</span>` +
                  `<button type="button" class="cg-vlink" data-vkey="${k}" data-von="0">Rimuovi verifica</button>`
                : `<button type="button" class="cg-vbtn" data-vkey="${k}" data-von="1">Segna come verificata</button>`;
            // Senza permesso "Completo" su Consegne: niente pulsanti, solo lo stato
            if (!(meta && meta.puoModificare)) h = h.replace(/<button type="button" class="cg-v(btn|link)"[^>]*>[^<]*<\/button>/g, '');
        }
        return h;
    }

    // Decisione su una trattativa non abbinata: 'contratto' | 'elimina' | '' (annulla)
    async function setDecisione(key, azione, btn, riga) {
        if (btn) btn.disabled = true;
        try {
            const d = await api('/verifiche', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, verificata: !!azione, azione: azione || null, riga: riga || null })
            });
            meta.verifiche = d.verifiche || {};
            // aggiorna la riga nella lista aperta e ricalcola tabella e conteggi
            cur.forEach(r => { if (r.dkey === key) { if (azione) r.dec = meta.verifiche[key]; else delete r.dec; } });
            renderOrigin(); renderList();
            compute(); render(rootEl.querySelector('#cgBody'));
        } catch (e) {
            alert('Operazione non salvata: ' + e.message);
            if (btn) btn.disabled = false;
        }
    }

    async function setVerifica(key, on, btn) {
        if (btn) btn.disabled = true;
        try {
            const d = await api('/verifiche', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, verificata: on })
            });
            meta.verifiche = d.verifiche || {};
            renderOrigin(); renderList();
            render(rootEl.querySelector('#cgBody')); // aggiorna bollini e conteggi della tabella
        } catch (e) {
            alert('Verifica non salvata: ' + e.message);
            if (btn) btn.disabled = false;
        }
    }

    function renderList() {
        const q = ov.querySelector('#cgMSearch').value.trim().toLowerCase();
        const searchOk = r => !q || [r.cliente, r.marca, r.modello, r.vend, r.targa].join(' ').toLowerCase().includes(q);
        const rows = cur.filter(r => reasonOk(r) && originOk(r) && searchOk(r));
        renderStat(rows, searchOk);
        const list = ov.querySelector('#cgMList');
        if (!rows.length) { list.innerHTML = '<tbody><tr><td class="cg-empty-msg">Nessuna vettura corrisponde alla ricerca.</td></tr></tbody>'; return; }
        list.innerHTML = '<thead><tr><th>Cliente</th><th>Vettura</th><th>Consulente</th><th>Data chiusura</th>' +
            (curVerify ? '<th>Targa / telaio</th><th>Tipo</th><th>Sede</th>'
                : '<th>Data consegna</th><th>Stato</th><th>Provenienza</th><th>Tipo</th><th>Targa / telaio</th>') + '</tr></thead><tbody>' +
            rows.map(r => '<tr>' +
                `<td class="cg-cl">${esc(r.cliente)}${noteHtml(r)}</td><td>${esc(r.marca)} ${esc(r.modello)}</td><td>${esc(r.vend)}</td><td>${esc(r.chiusura)}</td>` +
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

    window.Consegne = {
        init: init,
        // strumenti condivisi con l'Analisi avanzamento (consegne-analisi.js)
        api: {
            csv: () => (meta && meta.database && meta.database.csv) || null,
            meta: () => meta,
            vendMap: () => vendMap,
            parseCSV, pd, fmtD, nice, cap, esc, fmt, pct, toks,
            openModal: (title, rows, base, opts) => openModal(title, rows, base, opts || {}),
            post: (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        }
    };
})();
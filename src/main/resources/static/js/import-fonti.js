/* =====================================================================
   IMPORTA TRATTATIVE DA DUE FONTI — Leadspark e RadaR (Commerciale e Consegne)
   ---------------------------------------------------------------------
   Il pulsante "Importa trattative" di Commerciale e Consegne apre questa finestra:

   1) SCELTA DELLA FONTE
      - "Carica da Leadspark": CSV delle trattative (quello usato finora)
      - "Carica da RadaR":     Excel "RadaR_Contratti_aaaammgg.xlsx" (scheda Contratti)
   2) DOPO IL PRIMO FILE due pulsanti:
      - "Importa"                    -> importa solo quel file
      - "Carica anche RadaR/Leadspark" -> chiede l'altro file e li confronta
   3) CONFRONTO (solo con tutti e due i file)
      Contratti abbinati (stessa vettura: targa o telaio; oppure stesso cliente con date
      entro 15 giorni), solo in Leadspark, solo in RadaR. Ogni contratto si controlla anche
      con il foglio AVANZAMENTO (scheda DATABASE), usando come DATA DEL CONTRATTO quella del
      foglio. Pulsante "Aggiorna dal foglio" per rileggerlo prima di decidere.
      Poi si sceglie cosa tenere:
      - "Con doppio confronto": solo i contratti presenti in tutti e due i file
      - "Solo Leadspark"       : il CSV di Leadspark com'e'
      - "Solo RadaR"           : i contratti di RadaR
      Le trattative non chiuse di Leadspark (in corso / fallite = preventivi) e il Noleggio
      (che RadaR non ha) restano sempre quelle di Leadspark, salvo "Solo RadaR".

   Il file RadaR caricato si salva anche sul server (/api/radar/contratti): lo usa la
   "Giacenza alla vendita" del Commerciale.

   Uso:  ImportFonti.apri({ ambito: 'Commerciale' | 'Consegne', salva: async (rows, info) => 'messaggio' })
         ImportFonti.leggiRadar(arrayBuffer)  -> righe RadaR ridotte (serve anche alla Giacenza)
   Ogni riga importata ha "fonte": L (Leadspark), R (RadaR), LR (tutti e due) e, se c'e', "radar"
   (numero del contratto RadaR) e "dataFoglio" (data del contratto nel foglio AVANZAMENTO).
   ===================================================================== */
(function () {
    const A = () => window.Consegne && Consegne.api;
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const nf = n => (n || 0).toLocaleString('it-IT');
    const pl = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const dd = d => d ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear() : '';
    const GG = 864e5;
    const giorni = (x, y) => Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / GG);
    const STOP = new Set(['SRL', 'SRLS', 'SNC', 'SAS', 'SPA', 'DI', 'E', 'C', 'DE', 'DEL', 'DELLA', 'LA', 'LO', 'S', 'A']);
    const toks = s => A() ? A().toks(s) : new Set(String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[.'’`]/g, '').replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w)));
    function pd(s) {
        if (A()) return A().pd(s);
        const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || '').trim());
        return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
    }
    function nameMatch(x, y) {
        if (!x.size || !y.size) return false;
        let i = 0; x.forEach(w => { if (y.has(w)) i++; });
        return i >= 2 || (i >= 1 && (x.size === 1 || y.size === 1));
    }
    // stessa vettura: targa uguale, telaio uguale o ultime 8 cifre del telaio uguali
    function stessaVettura(a, b) {
        const T = [a.tg, a.vin].filter(x => x.length >= 5), U = [b.tg, b.vin].filter(x => x.length >= 5);
        for (const x of T) for (const y of U) {
            if (x === y) return true;
            if (x.length >= 11 && y.length >= 11 && x.slice(-8) === y.slice(-8)) return true;
        }
        return false;
    }

    /* ================= lettura del file RadaR ================= */
    const COL = { st: 'Stato', n: 'N. Contratto', firma: 'Data Firma', creaz: 'Data Creazione', cons: 'Consulente', sede: 'Sede',
        nome: 'Cliente Nome', cognome: 'Cliente Cognome', rag: 'Ragione Sociale', prov: 'Provenienza', marca: 'Marca', modello: 'Modello',
        vers: 'Versione', tipo: 'Tipo', targa: 'Targa', vin: 'VIN', ingr: 'Data Ingresso Stock', gg: 'GG Giacenza', fin: 'Importo Finanziato', banca: 'Banca' };
    const OBBL = ['st', 'n', 'firma', 'cons', 'sede', 'targa', 'vin', 'ingr'];
    const ent = s => String(s ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
    // data Excel (numero di serie), testo gg/mm/aaaa o aaaa-mm-gg -> "gg/mm/aaaa" ('' se non valida o prima del 2000)
    function dataDi(v) {
        if (v == null || v === '') return '';
        let y, m, d;
        if (typeof v === 'number') { const c = window.XLSX && XLSX.SSF.parse_date_code(v); if (!c) return ''; y = c.y; m = c.m; d = c.d; }
        else if (v instanceof Date) { y = v.getFullYear(); m = v.getMonth() + 1; d = v.getDate(); }
        else {
            const s = String(v).trim();
            let x = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/.exec(s);
            if (x) { d = +x[1]; m = +x[2]; y = +x[3]; }
            else if ((x = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) { y = +x[1]; m = +x[2]; d = +x[3]; }
            else return '';
        }
        if (!y || y < 2000 || y > 2100) return '';
        return String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0') + '/' + y;
    }
    const titolo = s => String(s || '').toLowerCase().replace(/(^|[\s'-])\S/g, c => c.toUpperCase());
    // "SCALA ROSARIO", "Rosario SCALA", "Rosario Scala" -> un solo nome (quello scritto bene piu' usato)
    function nomiConsulenti(lista) {
        const gruppi = new Map();
        lista.forEach(n => {
            const s = ent(n); if (!s) return;
            const k = [...toks(s)].sort().join(' ');
            if (!gruppi.has(k)) gruppi.set(k, new Map());
            const g = gruppi.get(k); g.set(s, (g.get(s) || 0) + 1);
        });
        const out = new Map();
        gruppi.forEach(g => {
            const v = [...g.entries()].sort((x, y) => {
                const bx = x[0] !== x[0].toUpperCase() && x[0] !== x[0].toLowerCase(), by = y[0] !== y[0].toUpperCase() && y[0] !== y[0].toLowerCase();
                return (by - bx) || (y[1] - x[1]);
            });
            const best = v[0][0] !== v[0][0].toUpperCase() && v[0][0] !== v[0][0].toLowerCase() ? v[0][0] : titolo(v[0][0]);
            g.forEach((_, s) => out.set(s, best));
        });
        return out;
    }
    function leggiRadar(buf) {
        if (!window.XLSX) throw new Error('Libreria Excel non caricata: aggiorna la pagina (Ctrl+F5)');
        const wb = XLSX.read(buf, { type: 'array' });
        let ws = null, head = null, h0 = 0;
        const nomi = wb.SheetNames.slice().sort((x, y) => (/contratti/i.test(y) ? 1 : 0) - (/contratti/i.test(x) ? 1 : 0));
        let righe = null;
        for (const nm of nomi) {
            const r = XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, raw: true, defval: null, blankrows: false });
            const i = r.slice(0, 6).findIndex(x => (x || []).some(c => String(c || '').trim() === 'N. Contratto'));
            if (i >= 0) { ws = nm; righe = r; h0 = i; head = r[i].map(c => String(c || '').trim()); break; }
        }
        if (!ws) throw new Error('Questo non sembra il file contratti di RadaR: manca la colonna "N. Contratto" (serve "RadaR_Contratti_….xlsx", scheda Contratti)');
        const ix = {}; Object.entries(COL).forEach(([k, t]) => { ix[k] = head.indexOf(t); });
        const manca = OBBL.filter(k => ix[k] < 0).map(k => COL[k]);
        if (manca.length) throw new Error('Nel file RadaR mancano le colonne: ' + manca.join(', '));
        const g = (r, k) => ix[k] >= 0 ? r[ix[k]] : null;
        const dati = righe.slice(h0 + 1).filter(r => r && String(g(r, 'n') || '').trim());
        const NC = nomiConsulenti(dati.map(r => g(r, 'cons')));
        return dati.map(r => {
            const modello = ent(g(r, 'modello')), vers = ent(g(r, 'vers'));
            const gg = g(r, 'gg'), fin = g(r, 'fin');
            return {
                n: ent(g(r, 'n')), st: ent(g(r, 'st')).toLowerCase(), firma: dataDi(g(r, 'firma')), creaz: dataDi(g(r, 'creaz')),
                cons: NC.get(ent(g(r, 'cons'))) || ent(g(r, 'cons')), sede: ent(g(r, 'sede')).toLowerCase(),
                nome: ent(g(r, 'nome')), cognome: ent(g(r, 'cognome')), rag: ent(g(r, 'rag')), prov: ent(g(r, 'prov')),
                marca: ent(g(r, 'marca')), modello, vers: vers.toUpperCase().startsWith(modello.toUpperCase()) ? vers.slice(modello.length).trim() : vers,
                tipo: ent(g(r, 'tipo')), targa: ent(g(r, 'targa')), vin: ent(g(r, 'vin')), ingr: dataDi(g(r, 'ingr')),
                gg: typeof gg === 'number' ? gg : (String(gg || '').trim() && !isNaN(+gg) ? +gg : null),
                fin: typeof fin === 'number' ? fin : 0, banca: ent(g(r, 'banca')).toUpperCase()
            };
        });
    }

    /* ================= RadaR -> riga trattativa (stesso formato del CSV Leadspark) ================= */
    const SEDE_R = { agnano: 'Gruppo Auto Scala srl', nola: 'Gruppo Auto Scala srl Nola', salerno: 'Gruppo Auto Scala srl Salerno' };
    const TIPO_R = t => { const x = pl(t); return x === 'USED' || x === 'USATO' ? 'Usato' : x === 'KM0' ? 'Km0' : x === 'NEW' || x === 'NUOVO' ? 'Nuovo' : ''; };
    const ORIG_R = { 'ingresso': 'Ingresso', 'sito web': 'www.gruppoautoscala.com', 'telefonata': 'Telefonata', 'facebook/instagram': 'Facebook',
        'autoscout': 'Autoscout24.com', 'google ads': 'Google ADS', 'affissioni': 'Affissioni', 'tiktok': 'TikTok' };
    const contrattoR = r => r.st !== 'bozza' && !!r.firma;
    const annR = r => /annull/.test(r.st);
    function radarATratt(r) {
        const ann = annR(r), boz = r.st === 'bozza';
        return {
            id: 'RDR-' + r.n, sede: SEDE_R[r.sede] || 'Gruppo Auto Scala srl', chiusura: boz ? '' : r.firma, consegna: '', prevista: '',
            vend: r.cons, nome: r.nome, cognome: r.cognome, rag: r.rag, tipo: TIPO_R(r.tipo), marca: r.marca,
            modello: [r.modello, r.vers].filter(Boolean).join(' '), targa: r.targa, telaio: r.vin,
            dataTratt: r.creaz || r.firma, origine: ORIG_R[String(r.prov || '').toLowerCase()] || '', tipoCli: r.rag && !r.nome ? 'Società' : 'Persona', team: '',
            stato: boz ? 'In corso' : ann ? 'Fallita' : 'Chiusa', motivo: ann ? 'Contratto annullato' : '', etichetta: ann ? 'CONTRATTO ANNULLATO' : '',
            fonte: 'R', radar: r.n
        };
    }

    /* ================= confronto Leadspark <-> RadaR <-> foglio ================= */
    const isNol = t => /noleggio/i.test(t.sede || '');
    const chiusaL = t => t.stato ? /chius/i.test(t.stato) : !!String(t.chiusura || '').trim();
    const annL = t => /contratto\s+annullat/i.test(t.etichetta || '');
    const cliL = t => `${t.nome || ''} ${t.cognome || ''} ${t.rag || ''}`.replace(/\s+/g, ' ').trim();
    function voceL(t, i) {
        return { i, f: 'L', t, d: pd(t.chiusura), cli: cliL(t), tk: toks(cliL(t)), vend: String(t.vend || '').trim(), tg: pl(t.targa), vin: pl(t.telaio),
            veicolo: `${t.marca || ''} ${t.modello || ''}`.replace(/\s+/g, ' ').trim(), ann: annL(t), stato: annL(t) ? 'Annullato' : 'Chiusa' };
    }
    function voceR(r, i) {
        const cli = `${r.nome || ''} ${r.cognome || ''} ${r.rag || ''}`.replace(/\s+/g, ' ').trim();
        return { i, f: 'R', r, d: pd(r.firma), cli, tk: toks(cli), vend: r.cons, tg: pl(r.targa), vin: pl(r.vin),
            veicolo: `${r.marca || ''} ${r.modello || ''}`.trim(), ann: annR(r), stato: r.st };
    }
    // abbina due elenchi: prima la vettura (entro 60 giorni), poi il cliente (entro "gNome" giorni);
    // a parita' vince lo stesso consulente, poi la data piu' vicina. Ogni voce si usa una volta sola.
    function abbina(X, Y, gNome, dataY) {
        const pairs = [];
        const dY = dataY || (y => y.d);
        X.forEach(x => Y.forEach(y => {
            const d2 = dY(y); if (!x.d || !d2) return;
            const g = Math.abs(giorni(x.d, d2));
            const veic = stessaVettura(x, y);
            if (veic ? g > 60 : !(g <= gNome && nameMatch(x.tk, y.tk))) return;
            const sv = x.vend && y.vend && nameMatch(toks(x.vend), toks(y.vend));
            pairs.push({ x, y, come: veic ? 'vettura' : 'cliente', s: (veic ? 0 : 1000) + (sv ? 0 : 300) + g });
        }));
        pairs.sort((p, q) => p.s - q.s);
        const ux = new Set(), uy = new Set(), out = [];
        pairs.forEach(p => { if (ux.has(p.x) || uy.has(p.y)) return; ux.add(p.x); uy.add(p.y); out.push(p); });
        return out;
    }
    // righe del foglio DATABASE (non vuote)
    // csv = testo del foglio DATABASE (come lo salva il server) oppure righe gia' lette [{CLIENTE, DATA, ...}]
    function vociFoglio(csv) {
        if (!csv || (typeof csv === 'string' && !A())) return null;
        try {
            return (typeof csv === 'string' ? A().parseCSV(csv) : csv).filter(r => String(r['CLIENTE'] || '').trim() || String(r['TARGA/TELAIO'] || '').trim()).map((r, i) => {
                const tt = pl(r['TARGA/TELAIO']);
                return { i, raw: r, d: pd(r['DATA']), cli: String(r['CLIENTE'] || '').trim(), tk: toks(r['CLIENTE']), vend: String(r['VENDITORE'] || '').trim(),
                    tg: tt.length <= 8 ? tt : '', vin: tt.length > 8 ? tt : '', stato: String(r['STATO'] || '').trim() };
            });
        } catch (e) { return null; }
    }
    function inizio(dates) {
        const ds = dates.filter(Boolean).sort((x, y) => x - y);
        if (!ds.length) return null;
        const t0 = ds[0].getTime(), sett = new Map();
        ds.forEach(d => { const w = Math.floor((d.getTime() - t0) / (7 * GG)); sett.set(w, (sett.get(w) || 0) + 1); });
        const nz = [...sett.values()].sort((x, y) => x - y), med = nz[nz.length >> 1];
        const w0 = [...sett.keys()].sort((x, y) => x - y).find(w => sett.get(w) >= Math.max(1, med * 0.3));
        return ds.find(d => Math.floor((d.getTime() - t0) / (7 * GG)) === w0) || ds[0];
    }
    function confronta(L, R, F) {
        const out = { periodo: null };
        const preventivi = L.filter(t => !isNol(t) && !chiusaL(t) && !annL(t));
        const noleggio = L.filter(isNol);
        const lc = L.map((t, i) => voceL(t, i)).filter(v => !isNol(v.t) && (chiusaL(v.t) || v.ann) && v.d);
        const rc = R.map((r, i) => voceR(r, i)).filter(v => contrattoR(v.r) && v.d);
        const bozze = R.filter(r => r.st === 'bozza');
        // periodo in comune: fuori da li' un contratto non si puo' confrontare (l'altro file non lo copre).
        // L'inizio di ogni file e' la prima settimana "piena" (almeno il 30% dei contratti di una settimana
        // normale): qualche contratto isolato mesi prima (es. 1 a gennaio in RadaR) non conta come copertura.
        const min = a => inizio(a.map(v => v.d)), max = a => a.reduce((m, v) => !m || v.d > m ? v.d : m, null);
        const lo = lc.length && rc.length ? new Date(Math.max(min(lc), min(rc))) : null, hi = lc.length && rc.length ? new Date(Math.min(max(lc), max(rc))) : null;
        const dentro = v => lo && v.d >= lo && v.d <= hi;
        out.periodo = lo && hi && lo <= hi ? { lo, hi, L: [min(lc), max(lc)], R: [min(rc), max(rc)] } : null;
        const P = abbina(lc, rc, 15);
        const ml = new Set(P.map(p => p.x)), mr = new Set(P.map(p => p.y));
        out.abb = P.map(p => ({ l: p.x, r: p.y, come: p.come, statoDiverso: p.x.ann !== p.y.ann }));
        out.soloL = lc.filter(v => !ml.has(v) && dentro(v));
        out.soloR = rc.filter(v => !mr.has(v) && dentro(v));
        out.fuoriL = lc.filter(v => !ml.has(v) && !dentro(v));
        out.fuoriR = rc.filter(v => !mr.has(v) && !dentro(v));
        out.preventivi = preventivi; out.noleggio = noleggio; out.bozze = bozze;
        // controllo con il foglio AVANZAMENTO: data del contratto = quella del foglio
        out.foglio = !!F;
        if (F) {
            const U = out.abb.map(a => ({ a, d: a.l.d, tk: new Set([...a.l.tk, ...a.r.tk]), tg: a.l.tg || a.r.tg, vin: a.r.vin || a.l.vin, vend: a.l.vend || a.r.vend }))
                .concat(out.soloL, out.soloR, out.fuoriL, out.fuoriR);
            const FF = F.filter(f => f.d);
            abbina(U, FF, 45).forEach(p => {
                const tgt = p.x.a || p.x;
                tgt.fg = p.y; tgt.dataFoglio = dd(p.y.d); tgt.ggFoglio = giorni(p.y.d, p.x.d);
            });
        }
        return out;
    }
    // righe da salvare secondo la scelta
    function righeDa(C, L, R, s) {
        const L2 = L.map(t => ({ ...t, fonte: 'L' }));
        const conF = (row, v) => { if (v && v.dataFoglio) row.dataFoglio = v.dataFoglio; return row; };
        if (s.mode === 'L') {
            const mp = new Map(C.abb.map(a => [a.l.t, a]));
            return L.map(t => { const a = mp.get(t); return a ? conF({ ...t, fonte: 'LR', radar: a.r.r.n }, a) : { ...t, fonte: 'L' }; });
        }
        if (s.mode === 'R') {
            const nol = s.nol ? L2.filter(isNol) : [];
            return R.map(r => radarATratt(r)).concat(nol);
        }
        // doppio confronto
        const out = [];
        C.abb.forEach(a => {
            const t = { ...a.l.t, fonte: 'LR', radar: a.r.r.n };
            if (!String(t.targa || '').trim() && a.r.r.targa) t.targa = a.r.r.targa;
            if (!String(t.telaio || '').trim() && a.r.r.vin) t.telaio = a.r.r.vin;
            out.push(conF(t, a));
        });
        C.preventivi.forEach(t => out.push({ ...t, fonte: 'L' }));
        if (s.nol) C.noleggio.forEach(t => out.push({ ...t, fonte: 'L' }));
        if (s.fuori) {
            C.fuoriL.forEach(v => out.push(conF({ ...v.t, fonte: 'L' }, v)));
            C.fuoriR.forEach(v => out.push(conF(radarATratt(v.r), v)));
        }
        return out;
    }

    /* ================= finestra ================= */
    let st = null;   // { opt, L, Lfile, R, Rfile, prima, foglio, foglioInfo, C, scelta, busy, err }
    const FONTI = { L: 'Leadspark', R: 'RadaR' };
    function stile() {
        if (document.getElementById('ifStyle')) return;
        const s = document.createElement('style'); s.id = 'ifStyle';
        s.textContent = `
.if-ov{position:fixed;inset:0;z-index:10050;background:rgba(10,30,36,.55);display:flex;align-items:flex-start;justify-content:center;padding:4vh 14px;overflow:auto}
.if-m{--i-acc:#136a78;--i-band:#0e4a55;--i-ink:#16262a;--i-ink2:#5f7479;--i-line:#dbe6e8;--i-soft:#ecf2f3;--i-card:#fff;--i-gold:#d8a650;--i-ok:#2f9e6e;--i-ko:#c0392b;--i-warn:#c77a1a;
  background:var(--i-card);color:var(--i-ink);width:min(980px,100%);border-radius:18px;box-shadow:0 20px 60px -20px rgba(0,0,0,.5);font-size:14px;overflow:hidden}
[data-theme="dark"] .if-m{--i-acc:#5cc3d1;--i-band:#0b3a44;--i-ink:#e6eff1;--i-ink2:#9bb1b6;--i-line:#25353a;--i-soft:#1e2b2f;--i-card:#162024}
.if-m header{background:var(--i-band);color:#fff;padding:16px 20px;display:flex;align-items:center;gap:12px;border-top:3px solid var(--i-gold)}
.if-m header h3{margin:0;font-size:17px;font-weight:800;flex:1}
.if-m header button{background:rgba(255,255,255,.12);border:0;color:#fff;width:34px;height:34px;border-radius:10px;cursor:pointer;font-size:15px}
.if-b{padding:18px 20px 20px}
.if-steps{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}.if-steps span{font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;background:var(--i-soft);color:var(--i-ink2)}.if-steps span.on{background:var(--i-acc);color:#fff}
.if-src{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.if-src label{display:flex;flex-direction:column;gap:6px;border:2px solid var(--i-line);border-radius:14px;padding:16px;cursor:pointer;transition:border-color .15s,background .15s}
.if-src label:hover{border-color:var(--i-acc);background:var(--i-soft)}.if-src b{font-size:16px}.if-src small{color:var(--i-ink2);font-size:12.5px;line-height:1.4}
.if-src i{font-style:normal;font-size:22px}
.if-p{color:var(--i-ink2);font-size:13px;margin:0 0 12px;line-height:1.45}
.if-file{border:1px solid var(--i-line);border-radius:12px;padding:12px 14px;margin-bottom:12px;display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}
.if-file b{font-size:14px}.if-file span{color:var(--i-ink2);font-size:12.5px}.if-file .if-tag{font-size:11px;font-weight:800;padding:3px 9px;border-radius:999px;background:var(--i-acc);color:#fff}
.if-act{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;margin-top:16px}
.if-btn{border:1px solid var(--i-line);background:var(--i-card);color:var(--i-ink);border-radius:10px;padding:9px 16px;font-weight:700;font-size:13.5px;cursor:pointer}
.if-btn:hover{background:var(--i-soft)}.if-btn.pri{background:var(--i-acc);border-color:var(--i-acc);color:#fff}.if-btn.gold{background:var(--i-gold);border-color:var(--i-gold);color:#1d1d1d}
.if-btn:disabled{opacity:.55;cursor:wait}
.if-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:4px 0 14px}
.if-k button{border:1px solid var(--i-line);border-left:4px solid var(--c,#136a78);background:var(--i-card);color:var(--i-ink);border-radius:12px;padding:10px 12px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:3px}
.if-k button.on{background:var(--i-soft);outline:2px solid var(--c,#136a78)}.if-k small{color:var(--i-ink2);font-size:11.5px;font-weight:600}.if-k b{font-size:22px;font-weight:800}.if-k em{font-style:normal;color:var(--i-ink2);font-size:11.5px}
.if-fg{display:flex;gap:10px;align-items:center;flex-wrap:wrap;border:1px dashed var(--i-line);border-radius:12px;padding:9px 12px;margin-bottom:12px;font-size:12.5px;color:var(--i-ink2)}
.if-fg b{color:var(--i-ink)}
.if-tw{max-height:330px;overflow:auto;border:1px solid var(--i-line);border-radius:12px;margin-bottom:12px}
.if-t{width:100%;border-collapse:collapse;font-size:12.5px}.if-t th{position:sticky;top:0;background:var(--i-band);color:#fff;text-align:left;padding:7px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap}
.if-t td{padding:6px 8px;border-bottom:1px solid var(--i-line);vertical-align:top}.if-t tr:nth-child(even) td{background:var(--i-soft)}
.if-t .s{color:var(--i-ink2);font-size:11.5px}.if-ok{color:var(--i-ok);font-weight:800}.if-ko{color:var(--i-ko);font-weight:800}.if-wn{color:var(--i-warn);font-weight:800}
.if-ch{display:grid;gap:8px;margin-top:6px}
.if-ch label{display:flex;gap:10px;align-items:flex-start;border:2px solid var(--i-line);border-radius:12px;padding:10px 12px;cursor:pointer}
.if-ch label:has(input:checked){border-color:var(--i-acc);background:var(--i-soft)}.if-ch input{margin-top:3px}.if-ch b{display:block}.if-ch small{color:var(--i-ink2);font-size:12px}
.if-ck{display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-size:12.5px;color:var(--i-ink2)}.if-ck label{display:flex;gap:6px;align-items:center;cursor:pointer}
.if-err{background:#fbe9e7;color:#8c2a1e;border-radius:10px;padding:9px 12px;font-size:13px;margin-bottom:12px}
[data-theme="dark"] .if-err{background:#3a1f1b;color:#f3b4aa}
.if-h4{font-size:13px;font-weight:800;margin:4px 0 8px}
@media (max-width:640px){.if-src{grid-template-columns:1fr}.if-b{padding:14px}}`;
        document.head.appendChild(s);
    }
    function apri(opt) {
        stile();
        chiudi();
        st = { opt, L: null, R: null, prima: null, foglio: null, foglioInfo: null, C: null, scelta: { mode: 'LR', nol: true, fuori: true }, lista: 'abb', busy: false, err: '' };
        const ov = document.createElement('div'); ov.className = 'if-ov'; ov.id = 'ifOv';
        ov.innerHTML = `<div class="if-m" role="dialog" aria-modal="true" aria-label="Importa trattative"><header><h3>Importa trattative · ${esc(opt.ambito || '')}</h3><button type="button" data-ifx aria-label="Chiudi">✕</button></header><div class="if-b" id="ifB"></div>
          <input type="file" id="ifFL" accept=".csv,text/csv" hidden><input type="file" id="ifFR" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', onClick);
        ov.querySelector('#ifFL').addEventListener('change', e => leggi('L', e.target));
        ov.querySelector('#ifFR').addEventListener('change', e => leggi('R', e.target));
        document.addEventListener('keydown', onKey);
        disegna();
    }
    const onKey = e => { if (e.key === 'Escape' && st && !st.busy) chiudi(); };
    function chiudi() {
        const ov = document.getElementById('ifOv'); if (ov) ov.remove();
        document.removeEventListener('keydown', onKey);
        st = null;
    }
    function leggi(f, input) {
        const file = input.files && input.files[0]; if (!file) return;
        const rd = new FileReader();
        rd.onload = () => {
            try {
                st.err = '';
                if (f === 'L') {
                    if (!A() || !A().preparaCsv) throw new Error('Area Consegne non disponibile: aggiorna la pagina');
                    const rows = A().preparaCsv(String(rd.result));
                    if (!rows.length) throw new Error('Il file Leadspark non contiene trattative');
                    st.L = rows; st.Lfile = file.name;
                } else {
                    const rows = leggiRadar(rd.result);
                    if (!rows.length) throw new Error('Il file RadaR non contiene contratti');
                    st.R = rows; st.Rfile = file.name;
                }
                if (!st.prima) st.prima = f;
                st.C = null;
                if (st.L && st.R) { confrontaOra(); return; }
            } catch (e) { st.err = e.message; }
            finally { input.value = ''; }
            disegna();
        };
        if (f === 'L') rd.readAsText(file, 'utf-8'); else rd.readAsArrayBuffer(file);
    }
    async function caricaFoglio(rileggi) {
        const res = await fetch('/api/consegne/' + (rileggi ? 'database/aggiorna' : 'data'), { method: rileggi ? 'POST' : 'GET', credentials: 'same-origin' });
        let d = null; try { d = await res.json(); } catch (e) { /* */ }
        if (!res.ok) throw new Error((d && d.error) || ('Foglio AVANZAMENTO non disponibile (errore ' + res.status + ')'));
        st.foglio = vociFoglio(d && d.database && d.database.csv);
        st.foglioInfo = d && d.database ? { righe: d.database.righe, at: d.database.aggiornatoAt } : null;
    }
    async function confrontaOra(rileggi) {
        st.busy = true; st.err = ''; disegna();
        try { if (rileggi || !st.foglio) await caricaFoglio(rileggi); }
        catch (e) { st.err = 'Controllo con il foglio AVANZAMENTO non riuscito: ' + e.message; }
        try { st.C = confronta(st.L, st.R, st.foglio); }
        catch (e) { st.err = 'Confronto non riuscito: ' + e.message; }
        st.busy = false; disegna();
    }
    async function importa() {
        if (st.busy) return;
        st.busy = true; st.err = ''; disegna();
        try {
            const s = st.scelta;
            let rows, fonte, file;
            if (st.L && st.R) {
                rows = righeDa(st.C, st.L, st.R, s);
                fonte = s.mode === 'LR' ? 'Leadspark + RadaR (doppio confronto)' : s.mode === 'L' ? 'Leadspark (confrontato con RadaR)' : 'RadaR';
                file = [st.Lfile, st.Rfile].join(' + ');
            } else if (st.L) { rows = st.L.map(t => ({ ...t, fonte: 'L' })); fonte = 'Leadspark'; file = st.Lfile; }
            else { rows = st.R.map(radarATratt); fonte = 'RadaR'; file = st.Rfile; }
            if (!rows.length) throw new Error('Con la scelta fatta non resta nessuna trattativa da importare');
            // il file RadaR si salva anche per la Giacenza alla vendita
            let notaR = '';
            if (st.R) {
                try {
                    const res = await fetch('/api/radar/contratti', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: st.R, file: st.Rfile }) });
                    if (!res.ok) { let m = 'errore ' + res.status; try { m = (await res.json()).error || m; } catch (x) { /* */ } notaR = ' · File RadaR non salvato per la Giacenza: ' + m; }
                } catch (e) { notaR = ' · File RadaR non salvato per la Giacenza: ' + e.message; }
            }
            const msg = await st.opt.salva(rows, { fonte, file, scelta: st.L && st.R ? s.mode : (st.L ? 'L' : 'R'),
                confronto: st.C ? { abbinate: st.C.abb.length, soloL: st.C.soloL.length, soloR: st.C.soloR.length } : null });
            chiudi();
            return (msg || '') + notaR;
        } catch (e) { if (st) { st.err = e.message; st.busy = false; disegna(); } return null; }
    }

    /* ---------- disegno ---------- */
    function infoFile(f) {
        const rows = f === 'L' ? st.L : st.R, name = f === 'L' ? st.Lfile : st.Rfile;
        let c, per = '';
        if (f === 'L') {
            const ch = rows.filter(t => !isNol(t) && (chiusaL(t) || annL(t)));
            c = `${nf(rows.length)} trattative · ${nf(ch.length)} contratti (vendita) · ${nf(rows.filter(isNol).length)} noleggio`;
            const ds = ch.map(t => pd(t.chiusura)).filter(Boolean).sort((x, y) => x - y);
            if (ds.length) per = 'contratti dal ' + dd(ds[0]) + ' al ' + dd(ds[ds.length - 1]);
        } else {
            const ch = rows.filter(contrattoR);
            c = `${nf(rows.length)} righe · ${nf(ch.filter(r => !annR(r)).length)} venduti/approvati · ${nf(ch.filter(annR).length)} annullati · ${nf(rows.filter(r => r.st === 'bozza').length)} bozze`;
            const ds = ch.map(r => pd(r.firma)).filter(Boolean).sort((x, y) => x - y);
            if (ds.length) per = 'firmati dal ' + dd(ds[0]) + ' al ' + dd(ds[ds.length - 1]);
        }
        return `<div class="if-file"><span class="if-tag">${FONTI[f]}</span><div><b>${esc(name)}</b><br><span>${c}${per ? ' · ' + per : ''}</span></div></div>`;
    }
    function passi(n) {
        const P = ['1 · Fonte', '2 · File caricato', '3 · Confronto', '4 · Importa'];
        return `<div class="if-steps">${P.map((p, i) => `<span class="${i === n ? 'on' : ''}">${p}</span>`).join('')}</div>`;
    }
    function disegna() {
        if (!st) return;
        const b = document.getElementById('ifB'); if (!b) return;
        const err = st.err ? `<div class="if-err">${esc(st.err)}</div>` : '';
        if (!st.L && !st.R) {
            b.innerHTML = passi(0) + err + `<p class="if-p">Da dove vuoi caricare le trattative? Dopo il primo file potrai importarlo subito oppure caricare anche l'altro e confrontarli.</p>
              <div class="if-src">
                <label for="ifFL"><i>📄</i><b>Carica da Leadspark</b><small>CSV delle trattative esportato da Leadspark (quello usato finora): trattative in corso, fallite e chiuse.</small></label>
                <label for="ifFR"><i>📊</i><b>Carica da RadaR</b><small>Excel "RadaR_Contratti_….xlsx" (scheda Contratti): contratti venduti, approvati, annullati, con data di ingresso in stock della vettura.</small></label>
              </div>`;
            return;
        }
        if (!(st.L && st.R)) {
            const f = st.L ? 'L' : 'R', g = f === 'L' ? 'R' : 'L';
            b.innerHTML = passi(1) + err + infoFile(f) +
                (f === 'R' ? `<p class="if-p">Solo RadaR: si importano i contratti (venduti e approvati = chiusi, annullati con l'etichetta "CONTRATTO ANNULLATO", bozze = in corso). RadaR non ha i preventivi né il Noleggio${st.opt.ambito === 'Commerciale' ? ': nel Commerciale preventivi e conversioni resteranno vuoti' : ''}${st.opt.ambito === 'Consegne' ? ' e non ha le date di consegna: nelle Tempistiche le consegnate risulteranno senza data' : ''}. Il file si salva anche per la Giacenza alla vendita.</p>`
                    : `<p class="if-p">Solo Leadspark: si importa il CSV come finora.</p>`) +
                `<div class="if-act"><button type="button" class="if-btn" data-ifa="reset">Indietro</button>
                 <label class="if-btn gold" for="${g === 'L' ? 'ifFL' : 'ifFR'}" style="display:inline-flex;align-items:center">Carica anche ${FONTI[g]}</label>
                 <button type="button" class="if-btn pri" data-ifa="importa" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Import in corso…' : 'Importa'}</button></div>`;
            return;
        }
        if (st.busy && !st.C) { b.innerHTML = passi(2) + '<p class="if-p">Confronto in corso con il foglio AVANZAMENTO…</p>'; return; }
        const C = st.C; if (!C) { b.innerHTML = passi(2) + err + '<div class="if-act"><button type="button" class="if-btn" data-ifa="reset">Ricomincia</button></div>'; return; }
        const nel = a => a.filter(v => v.fg).length;
        const abbF = C.abb.filter(a => a.fg).length, sd = C.abb.filter(a => a.statoDiverso).length;
        const kk = (k, c, lab, n, sub) => `<button type="button" data-ifl="${k}" class="${st.lista === k ? 'on' : ''}" style="--c:${c}"><small>${lab}</small><b>${nf(n)}</b><em>${sub}</em></button>`;
        const fgTxt = C.foglio ? (n, tot) => `${nf(n)} nel foglio · ${nf(tot - n)} no` : () => 'foglio non letto';
        const per = C.periodo;
        const annTxt = a => { const n = a.filter(v => v.ann).length; return n ? `di cui ${nf(n)} annullati<br>` : ''; };
        const conta = m => righeDa(C, st.L, st.R, { ...st.scelta, mode: m });
        const nC = rows => rows.filter(t => !isNol(t) && (t.stato ? /chius/i.test(t.stato) : !!String(t.chiusura || '').trim())).length;
        const rLR = conta('LR'), rL = conta('L'), rR = conta('R');
        b.innerHTML = passi(2) + err + infoFile('L') + infoFile('R') +
            `<div class="if-fg">Controllo con il foglio AVANZAMENTO (DATABASE), data del contratto = data del foglio: <b>${C.foglio ? nf(st.foglio.length) + ' righe' + (st.foglioInfo && st.foglioInfo.at ? ' · lette il ' + new Date(st.foglioInfo.at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '') : 'non disponibile'}</b>
              <button type="button" class="if-btn" data-ifa="foglio" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Lettura…' : 'Aggiorna dal foglio'}</button></div>` +
            (per ? `<p class="if-p">Periodo in comune ai due file: <b>${dd(per.lo)} – ${dd(per.hi)}</b>. I contratti fuori da questo periodo non si possono confrontare (l'altro file non li copre).</p>` : '<p class="if-p">I due file non hanno periodi in comune: nessun contratto si può confrontare.</p>') +
            `<div class="if-k">
              ${kk('abb', '#2f9e6e', 'In tutti e due', C.abb.length, `${nf(C.abb.filter(a => a.come === 'vettura').length)} per vettura · ${nf(C.abb.filter(a => a.come === 'cliente').length)} per cliente<br>${fgTxt(abbF, C.abb.length)}`)}
              ${kk('soloL', '#3d7fc1', 'Solo in Leadspark', C.soloL.length, annTxt(C.soloL) + fgTxt(nel(C.soloL), C.soloL.length))}
              ${kk('soloR', '#d98a3a', 'Solo in RadaR', C.soloR.length, annTxt(C.soloR) + fgTxt(nel(C.soloR), C.soloR.length))}
              ${kk('fuori', '#8e9aab', 'Fuori dal periodo in comune', C.fuoriL.length + C.fuoriR.length, `${nf(C.fuoriL.length)} Leadspark · ${nf(C.fuoriR.length)} RadaR`)}
              ${sd ? kk('sd', '#c0392b', 'Stato diverso', sd, 'annullato in un file e non nell\'altro') : ''}
            </div>` + lista(C) +
            `<div class="if-h4">Cosa vuoi tenere?</div>
            <div class="if-ch">
              <label><input type="radio" name="ifMode" value="LR" ${st.scelta.mode === 'LR' ? 'checked' : ''}><span><b>Con doppio confronto · ${nf(nC(rLR))} contratti</b><small>Solo i contratti presenti in tutti e due i file${st.scelta.fuori ? ', più quelli fuori dal periodo in comune' : ''}. Preventivi (in corso e fallite) dal CSV di Leadspark: ${nf(C.preventivi.length)}.</small></span></label>
              <label><input type="radio" name="ifMode" value="L" ${st.scelta.mode === 'L' ? 'checked' : ''}><span><b>Solo Leadspark · ${nf(nC(rL))} contratti</b><small>Il CSV di Leadspark com'è (come finora). Le trattative trovate anche in RadaR hanno il numero del contratto RadaR.</small></span></label>
              <label><input type="radio" name="ifMode" value="R" ${st.scelta.mode === 'R' ? 'checked' : ''}><span><b>Solo RadaR · ${nf(nC(rR))} contratti</b><small>I contratti di RadaR. Niente preventivi da Leadspark${st.opt.ambito === 'Commerciale' ? ' (conversioni vuote)' : ''}${st.opt.ambito === 'Consegne' ? ' e niente date di consegna (le Tempistiche le prendono da Leadspark)' : ''}.</small></span></label>
            </div>
            <div class="if-ck">
              <label><input type="checkbox" data-ifc="fuori" ${st.scelta.fuori ? 'checked' : ''} ${st.scelta.mode !== 'LR' ? 'disabled' : ''}>Doppio confronto: tieni anche i contratti fuori dal periodo in comune (non confrontabili)</label>
              <label><input type="checkbox" data-ifc="nol" ${st.scelta.nol ? 'checked' : ''} ${st.scelta.mode === 'L' ? 'disabled' : ''}>Tieni il Noleggio di Leadspark (${nf(C.noleggio.length)} trattative, RadaR non lo ha)</label>
            </div>
            <div class="if-act"><button type="button" class="if-btn" data-ifa="reset">Ricomincia</button>
              <button type="button" class="if-btn pri" data-ifa="importa" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Import in corso…' : 'Importa'}</button></div>`;
    }
    function lista(C) {
        const k = st.lista;
        const fg = v => !C.foglio ? '' : v.fg ? `<span class="if-ok">Sì</span> <span class="s">${esc(v.dataFoglio)}${v.ggFoglio ? ` (${v.ggFoglio > 0 ? '+' : ''}${v.ggFoglio} gg)` : ''}<br>${esc(v.fg.stato || '')}</span>` : '<span class="if-ko">No</span>';
        const tv = v => esc([v.tg, v.vin && v.vin !== v.tg ? v.vin : ''].filter(Boolean).join(' · '));
        const fh = C.foglio ? '<th>Nel foglio (data)</th>' : '';
        let h = '';
        if (k === 'abb' || k === 'sd') {
            const L = C.abb.filter(a => k === 'abb' || a.statoDiverso).sort((x, y) => y.l.d - x.l.d);
            h = `<table class="if-t"><tr><th>Cliente</th><th>Consulente</th><th>Leadspark</th><th>RadaR</th><th>Targa / telaio</th><th>Abbinate per</th>${fh}</tr>
              ${L.map(a => `<tr><td>${esc(a.l.cli || a.r.cli)}${a.r.cli && a.l.cli && !nameMatch(a.l.tk, a.r.tk) ? `<br><span class="s">RadaR: ${esc(a.r.cli)}</span>` : ''}</td><td>${esc(a.l.vend)}</td>
                <td>${dd(a.l.d)}<br><span class="s ${a.l.ann ? 'if-ko' : ''}">${a.l.ann ? 'annullato' : 'chiusa'}</span></td><td>${dd(a.r.d)} · n. ${esc(a.r.r.n)}<br><span class="s ${a.r.ann ? 'if-ko' : ''}">${esc(a.r.stato)}</span></td>
                <td>${tv(a.l) || tv(a.r)}</td><td>${a.come}</td>${C.foglio ? `<td>${fg(a)}</td>` : ''}</tr>`).join('')}</table>`;
        } else {
            const L = (k === 'soloL' ? C.soloL : k === 'soloR' ? C.soloR : C.fuoriL.concat(C.fuoriR)).slice().sort((x, y) => y.d - x.d);
            h = `<table class="if-t"><tr><th>Fonte</th><th>Data</th><th>Cliente</th><th>Consulente</th><th>Vettura</th><th>Targa / telaio</th><th>Stato</th>${fh}</tr>
              ${L.map(v => `<tr><td>${FONTI[v.f]}${v.f === 'R' ? '<br><span class="s">n. ' + esc(v.r.n) + '</span>' : ''}</td><td>${dd(v.d)}</td><td>${esc(v.cli)}</td><td>${esc(v.vend)}</td><td>${esc(v.veicolo)}</td><td>${tv(v)}</td><td>${esc(v.stato)}</td>${C.foglio ? `<td>${fg(v)}</td>` : ''}</tr>`).join('')}</table>`;
            if (!L.length) h = '<p class="if-p" style="padding:12px">Nessun contratto.</p>';
        }
        return `<div class="if-tw">${h}</div>`;
    }
    async function onClick(e) {
        if (!st) return;
        if (e.target.closest('[data-ifx]') || e.target.id === 'ifOv') { if (!st.busy) chiudi(); return; }
        const l = e.target.closest('[data-ifl]'); if (l) { st.lista = l.dataset.ifl; disegna(); return; }
        const r = e.target.closest('input[name="ifMode"]'); if (r) { st.scelta.mode = r.value; disegna(); return; }
        const c = e.target.closest('[data-ifc]'); if (c) { st.scelta[c.dataset.ifc] = c.checked; disegna(); return; }
        const a = e.target.closest('[data-ifa]'); if (!a) return;
        const act = a.dataset.ifa;
        if (act === 'reset') { st.L = st.R = st.C = null; st.prima = null; st.err = ''; disegna(); }
        else if (act === 'foglio') confrontaOra(true);
        else if (act === 'importa') {
            const opt = st.opt, msg = await importa();
            if (msg != null && opt.fatto) opt.fatto(msg);
        }
    }

    window.ImportFonti = { apri, chiudi, leggiRadar, radarATratt, confronta, nomiConsulenti, dataDi, abbina, voceR, vociFoglio, stessaVettura, giorni, inizio, _righeDa: righeDa };
})();
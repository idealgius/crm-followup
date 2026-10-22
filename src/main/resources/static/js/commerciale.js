/* =====================================================================
   AREA COMMERCIALE — capitolo 03 della BI (Gruppo Autoscala CRM)
   ---------------------------------------------------------------------
   Si apre da MacroHome.openCommerciale(). Stessa impaginazione di Stock:
   fascia in alto, menu a sinistra (Panoramica, Sedi con i consulenti,
   B2B, Noleggio, report), card e grafici interattivi.

   FONTI
   1) CSV di TUTTE le trattative (Leadspark), importato da qui o da Consegne:
      - Stato "Chiusa"            -> CONTRATTO (confrontato con il foglio)
      - "In corso" e "Fallita"    -> PREVENTIVI fatti (le fallite con il motivo)
      - Preventivi = tutte le trattative del periodo (DATA TRATTATIVA),
        conversione = contratti / preventivi (come il report venditore).
      - Contratti = trattative chiuse nel periodo (DATA CHIUSURA): un contratto conta
        nel mese in cui e' stato fatto. Se la trattativa era stata aperta in un mese
        precedente ha il bollino "Trattativa del gg/mm/aaaa" (r.prima).
   1b) CSV delle Consegne (solo chiuse): le chiuse che mancano nel CSV del Commerciale
      (trattative aperte prima del periodo esportato) si aggiungono come contratti
      con il bollino "Recuperata da Consegne" (r.rec). Confronto per ID trattativa.
      L'interruttore "Recuperate nel conteggio" decide se contarle; non entrano mai
      tra i preventivi.
   2) Foglio Google "AVANZAMENTO 2026" (scheda DATABASE), letto dall'area
      Consegne che fa l'abbinamento contratto <-> riga del foglio: dal foglio
      arrivano annullate (STATO), B2B (B2C = TRUE), pagamento (PC = contanti)
      e servizi (BLOCKSHAFT, LOJACK, FIR, GARANZIA Mawdy, PACK MANUTENZIONE).
      ANNULLATI: righe del foglio con stato ANNULLATA (anche senza trattativa chiusa nel
      CSV) + trattative del CSV con etichetta "CONTRATTO ANNULLATO". Una stessa pratica
      presente in tutti e due si conta una volta. Quelle che risultano SOLO dal CSV
      (non annullate nel foglio) hanno il bollino "solo CSV". Le altre fallite restano fallite.
      Il foglio ha la precedenza: una riga ANNULLATA senza trattativa abbinata conta
      come annullata ("Solo nel foglio").
      Abbinamento trattativa <-> riga del foglio: regole delle Consegne (vedi REGOLE_ABB
      qui sotto e consegne.js); la regola usata si vede nel bollino di ogni riga.
   3) Preventivi telefonici della sezione In bound: abbinati al contratto
      (stesso cliente o targa/telaio) -> bollino "Da preventivo telefonico",
      l'origine resta quella del CSV.

   REGOLE
   - Esclusi: Emanuele Amendola, Giuseppe Palladino, Davide Scognamiglio, Alessia Gisonna.
   - Sedi per consulente (SEDE_CONSULENTI): chi non e' in elenco e' di Agnano.
   - Origini unite (come nel report venditore): Ingresso = Ingresso + Passaggio;
     InBound = Telefonata + whatsapp; Facebook = Facebook + Instagram;
     www.gruppoautoscala.com = sito (con e senza www) + noleggio.gruppoautoscala.com
     + Crazy Weekend + Inaugurazione Nola + Black Friday; Inaugurazione Salerno a parte.
   - B2B: categoria a parte; "B2B nel conteggio" lo aggiunge a Panoramica, sedi e consulenti.
   - Grafici: ogni card ha 3 viste (ciambella / colonne / linee mese per mese),
     "Voci" per mostrare o nascondere le voci, clic su una voce = elenco con
     ricerca e filtri. Tabelle ordinabili cliccando l'intestazione.
   - Export: Excel professionale (server, Apache POI) e PDF (stampa del report).
   ===================================================================== */
(function () {
    const MESI = ['', 'gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
    const MESIL = ['', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    const SEDI = { Agnano: 'Gruppo Autoscala Agnano', Casamarciano: 'Gruppo Autoscala Casamarciano', Salerno: 'Gruppo Autoscala Salerno', Noleggio: 'Noleggio' };
    // Consulenti per sede: chi non e' qui e' di Agnano
    const SEDE_CONSULENTI = [
        ['Casamarciano', ['Claudio Filosa', 'Pasquale Del Villano', 'Francesco Montuori', 'Giovanni Santaniello']],
        ['Salerno', ['Claudio Gerardi', 'Simone Bruno']],
        ['Noleggio', ['Raffaele Crispo', 'Francesco Sementa', 'Ciro Imperato', 'Riccardo Meregalli']]
    ];
    // NUOVO: consulenti che fanno sia vendita sia noleggio. Per loro la sede la decide la singola
    // trattativa (colonna Sede del CSV): "Gruppo Autoscala Noleggio" = noleggio, le altre = vendita.
    // Qui la sede di vendita, usata quando la trattativa non lo dice (es. righe solo nel foglio).
    const DOPPIA_SEDE = { 'Ciro Imperato': 'Agnano' };
    const ESCLUSI = ['Emanuele Amendola', 'Giuseppe Palladino', 'Davide Scognamiglio', 'Alessia Gisonna'];
    const WWW = 'www.gruppoautoscala.com';
    const ORIG_MAP = {
        'passaggio': 'Ingresso', 'ingresso': 'Ingresso', 'telefonata': 'InBound', 'inbound': 'InBound', 'whatsapp': 'InBound',
        'instagram': 'Facebook', 'facebook': 'Facebook',
        'gruppoautoscala.com': WWW, 'www.gruppoautoscala.com': WWW, 'noleggio.gruppoautoscala.com': WWW,
        'crazy weekend - ql': WWW, 'crazy weekend - gn': WWW, 'inaugurazione nola': WWW, 'black friday': WWW,
        'inaugurazione salerno': 'Inaugurazione Salerno'
    };
    const ORIG_NOTE = [['Ingresso', 'Ingresso + Passaggio'], ['InBound', 'Telefonata + whatsapp'], ['Facebook', 'Facebook + Instagram'],
        [WWW, 'sito con e senza www + noleggio.gruppoautoscala.com + Crazy Weekend (QL e GN) + Inaugurazione Nola + Black Friday']];
    const SERVIZI = ['Blockshaft', 'Lojack', 'FIR', 'Garanzia Mawdy', 'Pack manutenzione'];
    const ESITI = ['Contratto', 'Annullato', 'In corso', 'Fallita'];
    const ESC = { 'Contratto': '#2f9e6e', 'Annullato': '#c0392b', 'In corso': '#e0a23a', 'Fallita': '#8e9aab' };
    const ST = ['GENERATO', 'NON_INTERESSATO', 'TRATTATIVA_GENERATA', 'CHIUSA', 'FALLITA'];
    const STL = { GENERATO: 'Generato (in sospeso)', NON_INTERESSATO: 'Non interessato', TRATTATIVA_GENERATA: 'Trattativa generata', CHIUSA: 'Trattativa chiusa', FALLITA: 'Trattativa fallita' };
    const STC = { GENERATO: '#8e9aab', NON_INTERESSATO: '#c4a27c', TRATTATIVA_GENERATA: '#e0a23a', CHIUSA: '#2f9e6e', FALLITA: '#c0392b' };
    const PALETTE = ['#136a78', '#3d7fc1', '#d98a3a', '#2f9e6e', '#9b6fd1', '#c94f7c', '#b0563f', '#b8a03a', '#6b7a8c', '#e06666', '#5c8a3a', '#a05a2c', '#7a8fd6'];
    const LS_B2B = 'commerciale_b2b_v1', LS_T = 'commerciale_grafici_v1', LS_REC = 'commerciale_recuperate_v1';
    // Come si abbina una trattativa del CSV a una riga del foglio AVANZAMENTO (motore in consegne.js)
    const REGOLE_ABB = [
        ['abbinata a mano', 'scelta dall\'operatore con "Verifica e abbina a…" nelle Consegne'],
        ['targa + nome', 'stessa targa/telaio e stesso cliente, qualsiasi data'],
        ['nome', 'stesso cliente, date entro 45 giorni (oppure, come ultima prova, qualsiasi data)'],
        ['targa/telaio', 'stessa targa/telaio con nome diverso, entro 60 giorni, stesso consulente, riga non annullata'],
        ['telaio parziale', 'ultime cifre del telaio, entro 30 giorni, stesso consulente, riga non annullata'],
        ['data + consulente + modello', 'data entro 7 giorni, stesso consulente e una parola del modello in comune']
    ];

    let rootEl = null, loaded = false, loading = false, info = null, msgErr = '', msgOk = '';
    let TR = [], AF = [], PT = [], vend = [], anni = [];
    let TRall = [], AFall = [], PTall = [];      // tutto, prima della scelta fissata
    // NUOVO: data del lead per ogni trattativa generata da un lead (file dei lead del gestionale)
    let LEAD = new Map();

    /* ---------- 📌 scelta fissata: origine / tipo / marca scelti in un elenco valgono per
       tutto il Commerciale (KPI, grafici, classifiche, report) finche' non si preme
       "Mostra tutto". Resta salvata in questo browser (come nelle Consegne e nello Stock).
       Consulente e sede non si fissano: hanno gia' le loro viste nel menu a sinistra. */
    const LS_FISSA = 'commerciale_fissa_v1';
    const FISSABILI = { origine: 'Origine', tipo: 'Tipo', marca: 'Marca' };
    let fissa = null;
    try { fissa = JSON.parse(localStorage.getItem(LS_FISSA) || 'null'); } catch (e) { fissa = null; }
    const okFissa = r => !fissa || Object.keys(FISSABILI).every(k => !fissa[k] || String(r[k] == null ? '' : r[k]) === fissa[k]);
    function applicaFissa() {
        TR = TRall.filter(okFissa); AF = AFall.filter(okFissa);
        // preventivi telefonici: hanno solo la marca
        PT = PTall.filter(p => !fissa || !fissa.marca || p.marca === fissa.marca);
    }
    function salvaFissa(v) {
        fissa = v && Object.keys(FISSABILI).some(k => v[k]) ? v : null;
        try { if (fissa) localStorage.setItem(LS_FISSA, JSON.stringify(fissa)); else localStorage.removeItem(LS_FISSA); } catch (e) { /* */ }
        applicaFissa();
        rootEl.querySelectorAll('.cm-ov').forEach(o => o.close && o.close());
        shellSrc(); render();
    }
    // nel sottotitolo degli Excel (bi-tools.js)
    if (window.BiTools) BiTools.contesto.COMMERCIALE = () => fissa ? '📌 Solo ' + fissaLbl(fissa) : '';
    const fissaLbl = v => Object.keys(FISSABILI).filter(k => v[k]).map(k => FISSABILI[k] + ': ' + v[k]).join(' · ');
    let view = { k: 'all' }, anno = new Date().getFullYear(), da = 1, a = 12, b2bOn = false, recOn = true;
    let listF = { f: 'contratti' }, marcheS = 'all', annS = 'all';
    const charts = {};
    let chartTypes = {};
    const hidden = {};
    try {
        b2bOn = localStorage.getItem(LS_B2B) === '1'; recOn = localStorage.getItem(LS_REC) !== '0';
        chartTypes = JSON.parse(localStorage.getItem(LS_T) || '{}');
    } catch (e) { /* */ }

    /* ================= utilita' ================= */
    const A = () => window.Consegne && Consegne.api;
    const up = s => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const nf = n => (n || 0).toLocaleString('it-IT');
    const pct = (x, y) => y ? (x / y * 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '–';
    const pl = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const toks = s => A() ? A().toks(s) : new Set(up(s).split(' ').filter(w => w.length > 1));
    const nice = s => A() ? A().nice(s) : String(s || '');
    const dd = d => d ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear() : '';
    const orig = o => { const s = String(o || '').trim(); return ORIG_MAP[s.toLowerCase()] || s || 'Non indicata'; };
    const MARCHE_UP = ['BMW', 'MG', 'DR', 'DS', 'BYD', 'ICH-X', 'EVO'];
    function marcaOf(m) {
        const s = String(m || '').trim();
        if (!s || /generica/i.test(s)) return 'Non indicata';
        if (MARCHE_UP.includes(up(s))) return up(s);
        return s.charAt(0).toUpperCase() + s.slice(1);
    }
    function nameMatch(x, y) {
        if (!x.size || !y.size) return false;
        let i = 0; x.forEach(w => { if (y.has(w)) i++; });
        return i >= 2 || (i >= 1 && (x.size === 1 || y.size === 1));
    }
    const sedeCache = new Map();
    function sedeOf(v) {
        if (sedeCache.has(v)) return sedeCache.get(v);
        const tk = toks(v); let s = 'Agnano';
        for (const [sede, list] of SEDE_CONSULENTI) if (list.some(n => [...toks(n)].every(w => tk.has(w)))) { s = sede; break; }
        sedeCache.set(v, s); return s;
    }
    // consulente con due sedi? -> sede di vendita, altrimenti null
    const doppioCache = new Map();
    function doppio(v) {
        if (doppioCache.has(v)) return doppioCache.get(v);
        const tk = toks(v); let r = null;
        for (const [n, sv] of Object.entries(DOPPIA_SEDE)) if ([...toks(n)].every(w => tk.has(w))) { r = sv; break; }
        doppioCache.set(v, r); return r;
    }
    // sede della singola trattativa dalla colonna Sede del CSV
    function sedeDaCsv(t) {
        const x = String(t || '').toLowerCase();
        if (!x.trim()) return null;
        if (/noleggio/.test(x)) return 'Noleggio';
        if (/salerno/.test(x)) return 'Salerno';
        if (/nola|casamarciano/.test(x)) return 'Casamarciano';
        return 'Agnano';
    }
    // sede di un record: per chi fa vendita e noleggio decide il record, per gli altri il consulente
    const sedeRec = (v, sedeRecord) => doppio(v) ? (sedeRecord || doppio(v)) : sedeOf(v);
    // tutte le sedi di un consulente: per chi fa vendita e noleggio sono quelle delle sue trattative
    // (es. Casamarciano, Agnano e Noleggio), riempite in build() da sediDoppio
    let sediDoppio = new Map();
    const ORD_SEDI = ['Agnano', 'Casamarciano', 'Salerno', 'Noleggio'];
    const sediDi = v => doppio(v) ? (sediDoppio.get(v) || [doppio(v), 'Noleggio']) : [sedeOf(v)];
    // senzaNol: in Panoramica e B2B il noleggio non conta (ha la sua vista)
    const sedeLab = (v, s, senzaNol) => s ? SEDI[s] : doppio(v) ? sediDi(v).filter(x => !senzaNol || x !== 'Noleggio').join(' + ') : SEDI[sedeOf(v)];
    const escluso = v => { const tk = toks(v); return ESCLUSI.some(n => [...toks(n)].every(w => tk.has(w))); };
    function tipoOf(v) {
        const t = up(v).replace(/[.\s]/g, '');
        return t === 'NUOVO' ? 'Nuovo' : t === 'KM0' ? 'Km0' : t === 'USATO' ? 'Usato' : 'Non indicata';
    }
    const css = n => getComputedStyle(rootEl).getPropertyValue(n).trim();
    // Contratto valido = trattativa chiusa non annullata. ANNULLATI = foglio AVANZAMENTO
    // (stato ANNULLATA) oppure etichetta "CONTRATTO ANNULLATO" nel CSV. Le altre
    // trattative FALLITE restano fallite: sono un'altra cosa.
    const esito = r => r.ann || r.dupAnn ? 'Annullato' : r.stato === 'Chiusa' ? 'Contratto' : r.stato;
    // le recuperate dalle Consegne contano solo con l'interruttore acceso
    const recOk = r => !r.rec || recOn;
    const isC = r => r.stato === 'Chiusa' && !r.ann && recOk(r);
    const isF = r => r.stato === 'Fallita' && !r.ann && !r.dupAnn;
    const contr = () => TR.filter(isC);

    /* ================= costruzione dei dati ================= */
    function build(d) {
        const pd = A().pd;
        // contratto del CSV -> riga del foglio abbinata dalle Consegne
        const foglioDi = new Map(), comeDi = new Map();
        d.righe.forEach(({ raw, csv, how }) => { if (csv && raw) { foglioDi.set(csv, raw); comeDi.set(csv, how || ''); } });
        TR = [];
        d.trattAll.forEach(t => {
            const v = nice(t.vend || '').trim();
            if (!v || escluso(v)) return;
            // due date: TRATTATIVA (preventivi) e CHIUSURA (contratti, nel mese in cui sono fatti)
            const dtT = pd(t.dataTratt) || pd(t.chiusura), dtC = pd(t.chiusura);
            if (!dtT) return;
            const s0 = String(t.stato || '');
            // senza la colonna Stato (import fatto con la pagina vecchia) vale la Data chiusura
            const stato = s0 ? (/chius/i.test(s0) ? 'Chiusa' : /fall/i.test(s0) ? 'Fallita' : 'In corso') : (String(t.chiusura || '').trim() ? 'Chiusa' : 'In corso');
            const raw = foglioDi.get(t) || null;
            const cli = `${t.nome || ''} ${t.cognome || ''}`.replace(/\s+/g, ' ').trim() || String(t.rag || '').trim();
            const r = {
                i: TR.length, dataT: dtT, yT: dtT.getFullYear(), mT: dtT.getMonth() + 1, rec: !!t.rec, vend: v, sede: sedeRec(v, sedeDaCsv(t.sede)),
                idT: String(t.id || '').trim(), hasDT: !!pd(t.dataTratt),
                noleggio: /noleggio/i.test(t.sede || ''), tipo: tipoOf(t.tipo), origine: orig(t.origine), origineRaw: t.origine || '',
                stato, motivo: stato === 'Fallita' ? (String(t.motivo || '').trim() || 'Non indicato') : '', etichetta: t.etichetta || '',
                marca: marcaOf(t.marca), veicolo: `${t.marca || ''} ${t.modello || ''}`.replace(/\s+/g, ' ').trim(),
                cliente: nice(cli), targa: String(t.targa || t.telaio || '').trim(), targa2: String(t.telaio || '').trim(),
                foglio: !!raw, tel: null, how: comeDi.get(t) || '',
                fCli: raw ? nice(raw['CLIENTE'] || '') : '', fStato: raw ? String(raw['STATO'] || '').trim() : ''
            };
            r.tk = toks(r.cliente);
            r.b2b = raw ? up(raw['B2C']) === 'TRUE' : /societ/i.test(t.tipoCli || '');
            r.annFoglio = !!raw && up(raw['STATO']).includes('ANNULLATA');
            r.annCsv = /contratto\s+annullat/i.test(r.etichetta);
            r.ann = r.annFoglio || r.annCsv;
            // data che decide il mese: contratti e annullati = chiusura, il resto = data trattativa
            const dt = (stato === 'Chiusa' || r.ann) && dtC ? dtC : dtT;
            r.data = dt; r.y = dt.getFullYear(); r.m = dt.getMonth() + 1;
            // contratto nato da una trattativa aperta in un mese precedente
            r.prima = stato === 'Chiusa' && !!dtC && (dtT.getFullYear() * 12 + dtT.getMonth()) < (dtC.getFullYear() * 12 + dtC.getMonth());
            if (raw) {
                const pag = up(raw['PAGAMENTO']), g = up(raw['GARANZIA']);
                r.pag = !pag ? 'Non indicato' : pag === 'PC' ? 'PC (contanti)' : 'Finanziamento';
                r.serv = {
                    'Blockshaft': up(raw['BLOCKSHAFT']) === 'TRUE' ? 1 : 0, 'Lojack': up(raw['LOJACK']) === 'TRUE' ? 1 : 0,
                    'FIR': /\d/.test(raw['FIR'] || '') ? 1 : 0, 'Garanzia Mawdy': g.includes('MAWDY') ? 1 : 0,
                    'Pack manutenzione': /\d/.test(raw['PACK MANUTENZIONE'] || '') ? 1 : 0
                };
            } else { r.pag = stato === 'Chiusa' || r.ann ? 'Non indicato' : ''; r.serv = null; }
            TR.push(r);
        });
        // righe del foglio ANNULLATE senza trattativa chiusa nel CSV: contano come annullati
        const vmap = d.vendMap || new Map();
        AF = [];
        d.righe.forEach(({ raw, csv }, n) => {
            if (csv || !raw || !String(raw['CLIENTE'] || '').trim() || !up(raw['STATO']).includes('ANNULLATA')) return;
            const dt = pd(raw['DATA']), mm = MESIL.map(x => x.toUpperCase()).indexOf(up(raw['MESE']));
            const m = dt ? dt.getMonth() + 1 : (mm > 0 ? mm : 0); if (!m) return;
            const y = dt ? dt.getFullYear() : new Date().getFullYear();
            const vRaw = up(raw['VENDITORE']), v = vmap.get(vRaw) || (vRaw ? nice(vRaw) : 'Non indicato');
            if (escluso(v)) return;
            const mod = String(raw['MODELLO'] || '').replace(/\s+/g, ' ').trim(), pag = up(raw['PAGAMENTO']);
            AF.push({ i: 'f' + n, data: dt || new Date(y, m - 1, 1), y, m, yT: y, mT: m, vend: v, sede: sedeRec(v, Object.values(raw).some(x => /noleggio/i.test(String(x || ''))) ? 'Noleggio' : null), noleggio: false, tipo: tipoOf(raw['CANALE']),
                origine: 'Solo nel foglio', stato: 'Chiusa', motivo: '', etichetta: '', marca: marcaOf(mod.split(' ')[0]), veicolo: mod,
                cliente: nice(raw['CLIENTE']), targa: String(raw['TARGA/TELAIO'] || '').trim(), foglio: true, soloFoglio: true, tel: null, ann: true, annFoglio: true,
                b2b: up(raw['B2C']) === 'TRUE', pag: !pag ? 'Non indicato' : pag === 'PC' ? 'PC (contanti)' : 'Finanziamento', serv: null });
        });
        vend = [...new Set(TR.map(r => r.vend))].sort((x, y) => x.localeCompare(y, 'it'));
        // sedi in cui lavora chi fa vendita e noleggio (dalle sue trattative), sempre con il Noleggio
        sediDoppio = new Map();
        vend.filter(doppio).forEach(v => {
            const S = new Set(TR.filter(r => r.vend === v).map(r => r.sede)); S.add('Noleggio');
            if (![...S].some(x => x !== 'Noleggio')) S.add(doppio(v));
            sediDoppio.set(v, ORD_SEDI.filter(x => S.has(x)));
        });
        anni = [...new Set(TR.map(r => r.y))].sort((x, y) => y - x);
    }

    // Nome del consulente dei preventivi telefonici -> stesso nome usato nelle trattative
    function canon(n) {
        const tk = toks(n); if (!tk.size) return 'Non indicato';
        const hit = vend.find(v => { const vt = toks(v); return [...tk].every(w => vt.has(w)) || [...vt].every(w => tk.has(w)); });
        return hit || nice(n);
    }
    function buildPT(list) {
        PT = (Array.isArray(list) ? list : []).map(p => {
            const dt = p.createdAt ? new Date(p.createdAt) : null;
            const cli = `${p.clienteNome || ''} ${p.clienteCognome || ''}`.replace(/\s+/g, ' ').trim();
            const v = canon(p.consultantName || '');
            return {
                id: p.id, data: dt, m: dt ? dt.getMonth() + 1 : 0, y: dt ? dt.getFullYear() : 0, vend: v, sede: sedeRec(v, p.tipo === 'NOLEGGIO' ? 'Noleggio' : null),
                tipo: p.tipo === 'NOLEGGIO' ? 'Noleggio' : 'Vendita', st: ST.includes(p.status) ? p.status : 'GENERATO',
                op: (p.user && p.user.fullName) || 'Non indicato', marca: marcaOf(p.marca), modello: p.modello || '',
                cliente: nice(cli), tk: toks(cli), targa: pl(p.targaTelaio), contr: null
            };
        }).filter(p => p.data && !escluso(p.vend));
        // Abbinamento preventivo telefonico -> contratto: stesso cliente (nome e cognome)
        // o stessa targa/telaio, contratto firmato da 3 giorni prima a 180 giorni dopo
        // il preventivo. Vince prima la targa, poi lo stesso consulente, poi la data piu' vicina.
        const CH = TR.filter(c => c.stato === 'Chiusa' && !c.ann);   // tutte le chiuse, anche le recuperate
        CH.forEach(c => { c.tel = null; });
        const pairs = [];
        PT.forEach(p => CH.forEach(c => {
            if (c.ann) return;
            const gg = (c.data - p.data) / 86400000;
            if (gg < -3 || gg > 180) return;
            const ct = pl(c.targa), ct2 = pl(c.targa2);
            const tg = !!p.targa && p.targa.length >= 5 && [ct, ct2].some(x => x && x.length >= 5 && (x === p.targa || x.endsWith(p.targa) || p.targa.endsWith(x)));
            if (!tg && !nameMatch(c.tk, p.tk)) return;
            pairs.push({ p, c, s: (tg ? 0 : 1000) + (c.vend === p.vend ? 0 : 500) + Math.abs(gg) });
        }));
        pairs.sort((x, y) => x.s - y.s);
        pairs.forEach(({ p, c }) => { if (p.contr || c.tel) return; p.contr = c; c.tel = p; });
    }

    async function load(force) {
        if (loading || (loaded && !force)) return;
        loading = true; msgErr = '';
        try {
            if (!A() || !A().carica) throw new Error('Area Consegne non disponibile: aggiorna la pagina');
            // dati del Commerciale (separati dalle Consegne): ultimo import + storico
            const res = await fetch('/api/commerciale/data', { credentials: 'same-origin' });
            const cm = res.ok ? await res.json() : null;
            if (!res.ok) throw new Error(res.status === 403 ? 'Non hai il permesso per la BI' : 'Dati Commerciale non disponibili (errore ' + res.status + ')');
            const rows = cm && cm.trattative && Array.isArray(cm.trattative.rows) ? cm.trattative.rows : [];
            const d = await A().carica(rows);
            info = d;
            info.comm = cm.trattative; info.storico = cm.storico || []; info.puoImportare = !!cm.puoImportare;
            info.lead = cm.lead || null;
            LEAD = new Map();
            ((cm.lead && cm.lead.rows) || []).forEach(x => {
                const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(x[1] || ''));
                if (x[0] && m) LEAD.set(String(x[0]), new Date(+m[1], +m[2] - 1, +m[3]));
            });
            build(d);
            let list = [];
            try {
                const today = new Date().toISOString().slice(0, 10);
                const r = await fetch('/api/preventivi-telefonici?from=2020-01-01&to=' + today, { credentials: 'same-origin' });
                if (r.ok) list = await r.json(); else info.ptErr = r.status === 403 ? 'non hai il permesso di vedere i preventivi telefonici' : 'errore ' + r.status;
            } catch (e) { info.ptErr = e.message; }
            buildPT(list);
            TRall = TR; AFall = AF; PTall = PT; applicaFissa();
            // controlli sul solo CSV del Commerciale (le recuperate dalle Consegne non contano)
            const propri = info.trattAll.filter(t => !t.rec);
            info.senzaStato = propri.length > 0 && !propri.some(t => t.stato);
            info.soloChiuse = propri.length > 0 && !info.senzaStato && !propri.some(t => t.stato && !/chius/i.test(t.stato));
            if (!anni.includes(anno) && anni.length) anno = anni[0];
            const now = new Date();
            a = anno === now.getFullYear() ? now.getMonth() + 1 : 12;
            if (da > a) da = 1;
            loaded = true;
        } catch (e) { msgErr = e.message; }
        finally { loading = false; }
        shellSrc(); render();
    }

    /* ================= filtri ================= */
    const inPer = f => f.y === anno && f.m >= da && f.m <= a;
    function okC(c, vw) {
        vw = vw || view; const s = c.sede;
        if (vw.k === 'b2b') return c.b2b && s !== 'Noleggio' && (!vw.v || c.vend === vw.v);
        if (vw.k === 'any') return true;
        if (!b2bOn && c.b2b) return false;
        if (vw.k === 'all') return s !== 'Noleggio';
        if (vw.k === 'sede') return s === vw.s;
        if (vw.k === 'v') return c.vend === vw.v && (!vw.s || s === vw.s);   // vw.s: solo la parte vendita o noleggio
        return true;
    }
    function okV(v, vw) {
        vw = vw || view; const S = sediDi(v);
        if (vw.k === 'b2b') return S.some(x => x !== 'Noleggio') && (!vw.v || v === vw.v);
        if (vw.k === 'all') return S.some(x => x !== 'Noleggio');
        if (vw.k === 'sede') return S.includes(vw.s);
        if (vw.k === 'v') return v === vw.v;
        return true;
    }
    // periodo per DATA TRATTATIVA (preventivi, in corso, fallite)
    const inPerT = f => { const y = f.yT ?? f.y, m = f.mT ?? f.m; return y === anno && m >= da && m <= a; };
    const mOfT = r => r.mT ?? r.m;
    // PREVENTIVI di una vista: trattative create nel periodo (le recuperate non sono preventivi del periodo)
    const trIn = vw => TR.filter(r => !r.rec && inPerT(r) && okC(r, vw));
    // CONTRATTI di una vista: trattative chiuse nel periodo (data chiusura)
    const cIn = vw => TR.filter(r => isC(r) && inPer(r) && okC(r, vw));
    // annullati di una vista: trattative chiuse abbinate a righe ANNULLATA + righe annullate solo nel foglio
    const annIn = vw => TR.filter(r => r.ann && recOk(r) && inPer(r) && okC(r, vw)).concat(AF.filter(r => inPer(r) && okC(r, vw)));
    const annBase = c => inPer(c) && recOk(c) && (b2bOn || !c.b2b) && c.sede !== 'Noleggio';
    const annSedeOk = c => annS === 'all' || c.sede === annS;
    const same = (x, y) => x.k === y.k && x.s === y.s && x.v === y.v;
    const months = () => { const r = []; for (let m = da; m <= a; m++) r.push(m); return r; };
    const per = () => MESIL[da] + (a !== da ? ' – ' + MESIL[a] : '') + ' ' + anno;
    function by(arr, keyFn) { const m = new Map(); arr.forEach(x => { const k = keyFn(x); m.set(k, (m.get(k) || []).concat(x)); }); return m; }
    const sortD = (x, y) => y.data - x.data;

    /* ================= impaginazione ================= */
    function shell() {
        rootEl.innerHTML = `
        <div class="cm-band">
          <div class="cm-band-top">
            <div>
              <div class="cm-back-row"><button type="button" class="cm-back" data-act="bi">&larr; BI</button></div>
              <h1>Commerciale</h1>
              <p>Preventivi, contratti, origini, marche e servizi per sede e consulente</p>
            </div>
            <div class="cm-ctl">
              <label class="cm-tg" title="Conta anche i contratti B2B in Panoramica, sedi e consulenti"><input type="checkbox" id="cmB2b" ${b2bOn ? 'checked' : ''}><i></i>B2B nel conteggio</label>
              <label class="cm-tg" id="cmRecLbl" style="display:none" title="Contratti chiusi presenti nel CSV delle Consegne ma non in quello del Commerciale (trattative aperte prima del periodo esportato)"><input type="checkbox" id="cmRec" ${recOn ? 'checked' : ''}><i></i>Recuperate nel conteggio</label>
              <label for="cmAnno">Anno</label><select id="cmAnno"></select>
              <label for="cmDa">Da</label><select id="cmDa"></select>
              <label for="cmA">A</label><select id="cmA"></select>
              <button type="button" data-act="reload">Aggiorna</button>
              <button type="button" data-act="export" class="cm-btn-gold">Esporta</button>
              <label class="cm-btn-imp" id="cmImpLbl" style="display:none">Importa trattative (CSV)<input type="file" accept=".csv,text/csv" id="cmFile" hidden></label>
              <label class="cm-btn-imp" id="cmLeadLbl" style="display:none" title="File dei lead del gestionale: serve solo per i tempi da lead a trattativa e a contratto">Importa lead (CSV)<input type="file" accept=".csv,text/csv" id="cmLeadFile" hidden></label>
            </div>
          </div>
          <div class="cm-src" id="cmSrc"></div>
        </div>
        <div class="cm-wrap"><div class="cm-layout"><aside class="cm-side" id="cmSide"></aside><main id="cmMain"><div class="cm-card cm-empty">Caricamento dati…</div></main></div></div>`;
        rootEl.addEventListener('click', onClick);
        rootEl.querySelector('#cmFile').addEventListener('change', e => importa(e.target));
        rootEl.querySelector('#cmLeadFile').addEventListener('change', e => importaLead(e.target));
        rootEl.querySelector('#cmB2b').addEventListener('change', e => { b2bOn = e.target.checked; try { localStorage.setItem(LS_B2B, b2bOn ? '1' : '0'); } catch (x) { /* */ } render(); });
        rootEl.querySelector('#cmRec').addEventListener('change', e => { recOn = e.target.checked; try { localStorage.setItem(LS_REC, recOn ? '1' : '0'); } catch (x) { /* */ } shellSrc(); render(); });
        rootEl.querySelector('#cmAnno').addEventListener('change', e => { anno = +e.target.value; const n = new Date(); a = anno === n.getFullYear() ? n.getMonth() + 1 : 12; da = 1; render(); });
        rootEl.querySelector('#cmDa').addEventListener('change', e => { da = +e.target.value; if (a < da) a = da; render(); });
        rootEl.querySelector('#cmA').addEventListener('change', e => { a = +e.target.value; if (a < da) da = a; render(); });
    }
    function shellSrc() {
        const s = rootEl.querySelector('#cmSrc'); if (!s) return;
        const m = info && info.meta, t = info && info.comm, d = m && m.database;
        const when = iso => iso ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const vecchio = info && info.trattAll.length && !info.trattAll.some(r => !r.rec && 'origine' in r);
        const soloChiuse = info && info.soloChiuse;
        const imp = rootEl.querySelector('#cmImpLbl'); if (imp) imp.style.display = info && info.puoImportare ? '' : 'none';
        const impL = rootEl.querySelector('#cmLeadLbl'); if (impL) impL.style.display = info && info.puoImportare ? '' : 'none';
        const ld = info && info.lead;
        const nRec = TR.filter(r => r.rec).length;
        const recL = rootEl.querySelector('#cmRecLbl'); if (recL) recL.style.display = nRec ? '' : 'none';
        const st = (info && info.storico) || [];
        s.innerHTML = `Ultimo import trattative: <b>${t ? nf(t.righe || 0) + ' righe · ' + when(t.aggiornatoAt) + (t.aggiornatoDa ? ' da ' + esc(t.aggiornatoDa) : '') : 'nessuno'}</b>` +
            ` <button type="button" class="cm-link" data-act="storico">Storico import (${st.length})</button>` +
            ` &nbsp;|&nbsp; Foglio AVANZAMENTO: <b>${d ? nf(d.righe || 0) + ' righe · ' + when(d.aggiornatoAt) : 'non ancora letto'}</b> &nbsp;|&nbsp; Preventivi telefonici: <b>${info && info.ptErr ? 'non disponibili (' + esc(info.ptErr) + ')' : nf(PT.length)}</b>` +
            ` &nbsp;|&nbsp; Lead: <b>${ld ? nf(ld.righeFile || 0) + ' (' + nf(ld.conTrattativa || 0) + ' con trattativa) · ' + when(ld.aggiornatoAt) : 'non ancora importati'}</b>` +
            (msgOk ? `<div class="cm-msg">${esc(msgOk)}</div>` : '') +
            (fissa ? `<div class="cm-msg cm-fissa"><span>📌 Stai vedendo solo: <b>${esc(fissaLbl(fissa))}</b> · ${nf(TR.length)} trattative su ${nf(TRall.length)}</span><button type="button" class="cm-link" data-act="fissa-reset">Mostra tutto</button></div>` : '') +
            (nRec ? `<div class="cm-msg">${nf(nRec)} contratti chiusi sono nel CSV delle Consegne ma non in quello del Commerciale (trattative aperte prima del periodo esportato): ${recOn ? 'sono <b>contati</b>' : 'per ora <b>non sono contati</b>'}, con il bollino "Recuperata da Consegne". <button type="button" class="cm-link" data-list='${esc(JSON.stringify({ t: 'Contratti recuperati dalle Consegne', vw: { k: 'any' }, w: 'recAll' }))}'>Vedi elenco</button></div>` : '') +
            (vecchio ? `<div class="cm-msg">L'ultimo CSV trattative è stato importato prima della BI Commerciale: l'origine e il Noleggio arrivano dal prossimo import (pulsante "Importa trattative").</div>` : '') +
            (!vecchio && info && info.senzaStato ? `<div class="cm-msg err"><b>Reimporta il CSV delle trattative.</b> L'ultimo import è stato fatto con la versione precedente della pagina e non contiene lo stato delle trattative: per ora le chiuse si riconoscono dalla data di chiusura, ma fallite e motivi non si vedono. Prima di reimportare aggiorna la pagina con Ctrl+F5.</div>` : '') +
            (!vecchio && soloChiuse ? `<div class="cm-msg">Il CSV importato contiene solo le trattative chiuse: per preventivi, trattative in corso e fallite importa il CSV con <b>tutte</b> le trattative.</div>` : '') +
            (msgErr ? `<div class="cm-msg err">${esc(msgErr)}</div>` : '');
    }
    function selects() {
        const opt = (sel, list, val) => { sel.innerHTML = list.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${l}</option>`).join(''); };
        const ys = anni.length ? anni : [anno];
        opt(rootEl.querySelector('#cmAnno'), ys.map(y => [y, y]), anno);
        const ml = []; for (let m = 1; m <= 12; m++) ml.push([m, MESIL[m].charAt(0).toUpperCase() + MESIL[m].slice(1)]);
        opt(rootEl.querySelector('#cmDa'), ml, da);
        opt(rootEl.querySelector('#cmA'), ml, a);
    }

    function onClick(e) {
        const act = e.target.closest('[data-act]');
        if (act) {
            if (act.dataset.act === 'bi' && window.MacroHome) MacroHome.openBI();
            if (act.dataset.act === 'reload') load(true);
            if (act.dataset.act === 'storico') openStorico();
            if (act.dataset.act === 'export') openExport();
            if (act.dataset.act === 'fissa-reset') salvaFissa(null);
            if (act.dataset.act === 'fissa') { try { salvaFissa(JSON.parse(act.dataset.v)); } catch (x) { /* */ } }
            return;
        }
        const mt = e.target.closest('[data-mtog]');
        if (mt) {   // telefono: apre/chiude il menu delle viste
            const sd = rootEl.querySelector('#cmSide'), o = sd.classList.toggle('m-open');
            mt.setAttribute('aria-expanded', o); mt.querySelector('em').textContent = o ? 'Chiudi ▴' : 'Cambia ▾';
            return;
        }
        const tog = e.target.closest('[data-tog]');
        if (tog) {
            const g = tog.closest('.cm-nav-grp'); g.classList.toggle('open');
            try { const o = JSON.parse(sessionStorage.getItem('cmOpen') || '{}'); o[tog.dataset.tog] = g.classList.contains('open'); sessionStorage.setItem('cmOpen', JSON.stringify(o)); } catch (x) { /* */ }
            return;
        }
        const sedi = e.target.closest('[data-sedi]');
        if (sedi) {   // freccia ▾: apre/chiude le righe per sede, senza aprire il report
            const apri = sedi.getAttribute('aria-expanded') !== 'true';
            sedi.setAttribute('aria-expanded', apri ? 'true' : 'false'); sedi.textContent = apri ? '▴' : '▾';
            sedi.closest('table').querySelectorAll('tr.cm-subr').forEach(tr => { if (tr.dataset.par === sedi.dataset.sedi) tr.hidden = !apri; });
            return;
        }
        const tsw = e.target.closest('[data-tmsw]');
        if (tsw) { if (tmSw !== tsw.dataset.tmsw) { tmSw = tsw.dataset.tmsw; tmAll = false; render(); } return; }
        const tma = e.target.closest('[data-tmall]');
        if (tma) { tmAll = !tmAll; const t = tma.parentElement.querySelector('table.cm-tmt'); if (t) t.classList.toggle('all', tmAll);
            const n = t ? t.querySelectorAll('tr').length - 2 : 0; tma.textContent = tmAll ? 'Mostra meno' : `Mostra tutti (${nf(n)})`; return; }
        const vw = e.target.closest('[data-vw]');
        if (vw) { go(JSON.parse(vw.dataset.vw)); return; }
        const lst = e.target.closest('[data-list]');
        if (lst) { openList(JSON.parse(lst.dataset.list)); return; }
        const chip = e.target.closest('[data-chip]');
        if (chip) { listF.f = chip.dataset.chip; renderList(); return; }
        const ms = e.target.closest('[data-ms]');
        if (ms) { marcheS = ms.dataset.ms; render(); return; }
        const as = e.target.closest('[data-as]');
        if (as) { annS = as.dataset.as; render(); return; }
        if (ccClick(e)) return;
        const th = e.target.closest('table.cm-sort th');
        if (th) sortTable(th);
    }
    function go(vw) {
        const sd = rootEl.querySelector('#cmSide'); if (sd) sd.classList.remove('m-open');   // telefono: il menu si richiude
        view = vw; render();
        const m = rootEl.querySelector('#cmMain');
        if (m && (m.getBoundingClientRect().top < 60 || innerWidth <= 760)) m.scrollIntoView({ behavior: 'smooth' });
    }

    /* ---- menu a sinistra ---- */
    const cntC = vw => cIn(vw).length;
    function side() {
        let open = {}; try { open = JSON.parse(sessionStorage.getItem('cmOpen') || '{}'); } catch (e) { /* */ }
        const item = (vw, ic, label, n, sub) => `<button type="button" class="cm-nav-i ${sub ? 'sub' : ''} ${same(vw, view) ? 'on' : ''}" data-vw='${esc(JSON.stringify(vw))}'><span class="cm-nav-ic">${ic}</span><span class="cm-nav-l">${esc(label)}</span><b>${nf(n)}</b></button>`;
        const grp = (key, head, ic, label, subs) => {
            const isOpen = open[key] ?? (subs.some(s => same(s, view)) || same(head, view));
            return `<div class="cm-nav-grp ${isOpen ? 'open' : ''}"><div class="cm-nav-row">${item(head, ic, label, cntC(head))}<button type="button" class="cm-nav-tog" data-tog="${key}" aria-label="Mostra i consulenti">▸</button></div>
              <div class="cm-nav-subs">${subs.map(s => item(s, '', s.v, cntC(s), true)).join('') || '<div class="cm-hint" style="padding:6px 10px">Nessun consulente</div>'}</div></div>`;
        };
        // chi fa vendita e noleggio compare in tutte e due le liste, ognuna con la sua parte (s)
        const consOf = s => vend.filter(v => sediDi(v).includes(s)).map(v => doppio(v) ? { k: 'v', v, s } : { k: 'v', v }).sort((x, y) => cntC(y) - cntC(x));
        const b2bSubs = vend.filter(v => sediDi(v).some(x => x !== 'Noleggio') && contr().some(c => c.vend === v && c.b2b)).map(v => ({ k: 'b2b', v })).sort((x, y) => cntC(y) - cntC(x));
        rootEl.querySelector('#cmSide').innerHTML = item({ k: 'all' }, '📊', 'Panoramica', cntC({ k: 'all' })) +
            '<div class="cm-nav-t">Sedi</div>' + ['Agnano', 'Casamarciano', 'Salerno'].map(s => grp(s, { k: 'sede', s }, '🏢', SEDI[s], consOf(s))).join('') +
            '<div class="cm-nav-t">Categorie</div>' + grp('B2B', { k: 'b2b' }, '💼', 'B2B', b2bSubs) + grp('Noleggio', { k: 'sede', s: 'Noleggio' }, '🔑', 'Noleggio', consOf('Noleggio')) +
            '<div class="cm-nav-t">Report</div>' + item({ k: 'marche' }, '🏷️', 'Performance marchi', new Set(contr().filter(inPer).map(c => c.marca)).size) +
            item({ k: 'pt' }, '📞', 'Preventivi telefonici', PT.filter(inPer).length) + item({ k: 'ann' }, '↩️', 'Contratti annullati', TR.filter(c => c.ann && annBase(c)).length + AF.filter(annBase).length) +
            item({ k: 'list' }, '📋', 'Tutte le trattative', trIn({ k: 'any' }).length);
        // NUOVO (telefono): il menu e' chiuso, si vede solo la vista attuale con "Cambia ▾"
        const sd = rootEl.querySelector('#cmSide'), on = sd.querySelector('.cm-nav-i.on');
        sd.insertAdjacentHTML('afterbegin', `<button type="button" class="cm-side-m" data-mtog aria-expanded="${sd.classList.contains('m-open')}"><span class="cm-nav-ic">${on ? on.querySelector('.cm-nav-ic').textContent || '👤' : '📋'}</span><span class="cm-nav-l">${on ? esc(on.querySelector('.cm-nav-l').textContent) : 'Scegli cosa vedere'}</span><em>${sd.classList.contains('m-open') ? 'Chiudi ▴' : 'Cambia ▾'}</em></button>`);
    }


    /* ================= grafici interattivi: card con 3 viste ================= */
    // spec: { id, title, hint, recs, key(r) -> voce o [voci], order, top, colors, def, types, horiz, kind: 'tr'|'pt', wide }
    //   oppure { ..., series: [{ k, recs, c }] } per l'andamento mese per mese
    const CC = {};
    const ICO = {
        doughnut: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 8 8h-8z" fill="currentColor"/></svg>',
        bar: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="11" width="4" height="9" rx="1"/><rect x="10" y="5" width="4" height="15" rx="1"/><rect x="16" y="8" width="4" height="12" rx="1"/></svg>',
        line: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-6 4 3 5-7 4 4"/></svg>'
    };
    const TIPI = { doughnut: [ICO.doughnut, 'Ciambella'], bar: [ICO.bar, 'Colonne'], line: [ICO.line, 'Linee mese per mese'] };
    const saveTypes = () => { try { localStorage.setItem(LS_T, JSON.stringify(chartTypes)); } catch (e) { /* */ } };
    function groups(spec) {
        // t = 1: la serie si divide per mese della TRATTATIVA (preventivi); altrimenti per mese dell'evento (contratto)
        if (spec.series) return spec.series.map(s => ({ k: s.k, l: s.recs, n: s.recs.length, c: s.c, t: s.t }));
        const m = new Map();
        spec.recs.forEach(r => { const k = spec.key(r); (Array.isArray(k) ? k : [k]).forEach(x => { if (x == null || x === '') return; if (!m.has(x)) m.set(x, []); m.get(x).push(r); }); });
        let arr = [...m].map(([k, l]) => ({ k, l, n: l.length }));
        const pos = k => { const i = (spec.order || []).indexOf(k); return i < 0 ? 999 : i; };
        arr.sort((x, y) => pos(x.k) - pos(y.k) || y.n - x.n);
        // nessun raggruppamento in "Altre": si mostrano sempre tutte le voci (il grafico a barre scorre)
        arr.forEach((g, i) => { g.c = (spec.colors && spec.colors[g.k]) || PALETTE[i % PALETTE.length]; g.t = spec.t; });
        return arr;
    }
    const meseDi = (g, r) => g.t ? mOfT(r) : r.m;
    function ccCard(spec) {
        CC[spec.id] = spec;
        const types = spec.types || ['doughnut', 'bar', 'line'];
        const t = types.includes(chartTypes[spec.id]) ? chartTypes[spec.id] : (spec.def || types[0]);
        const G = groups(spec), H = hidden[spec.id] || new Set();
        const tot = spec.totale != null ? spec.totale : G.reduce((s, g) => s + g.n, 0);
        return `<div class="cm-card cm-cc ${spec.wide ? 'cm-wide' : ''}" data-cc="${spec.id}">
          <div class="cm-cc-h"><div><h2>${esc(spec.title)}</h2><p class="cm-hint">${spec.hint || ''}</p></div>
            <div class="cm-cc-btns"><button type="button" class="cm-cc-voci" data-voci="${spec.id}">Voci ▾</button>
              <span class="cm-cc-seg">${types.map(x => `<button type="button" data-ct="${spec.id}|${x}" class="${x === t ? 'on' : ''}" title="${TIPI[x][1]}" aria-label="${TIPI[x][1]}">${TIPI[x][0]}</button>`).join('')}</span></div></div>
          <div class="cm-cc-b ${spec.wide ? 'cm-cc-bw' : ''}"><div class="cm-cc-c" style="height:${spec.h || 260}px"><div class="cm-cc-in"><canvas id="cc_${spec.id}"></canvas></div></div>
            <div class="cm-cc-leg">${G.map(g => `<button type="button" class="cm-cc-li ${H.has(g.k) ? 'off' : ''}" data-ccl="${spec.id}" data-k="${esc(g.k)}" title="Clicca per l'elenco"><i style="background:${g.c}"></i><span>${esc(g.k)}</span><b>${nf(g.n)}</b>${spec.series ? '' : `<em>${pct(g.n, tot)}</em>`}</button>`).join('') || '<p class="cm-hint">Nessun dato nel periodo</p>'}</div></div>
        </div>`;
    }
    const valPlugin = {
        id: 'cmVal', afterDatasetsDraw(ch) {
            if (ch.config.type !== 'bar') return;
            const { ctx } = ch, hor = ch.options.indexAxis === 'y';
            ctx.save(); ctx.font = '700 10.5px Inter,system-ui'; ctx.fillStyle = css('--cm-ink');
            ch.data.datasets.forEach((d, i) => { const meta = ch.getDatasetMeta(i); if (meta.hidden) return; meta.data.forEach((el, j) => {
                const v = d.data[j]; if (!v) return;
                if (hor) { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(nf(v), el.x + 4, el.y); }
                else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(nf(v), el.x, el.y - 3); }
            }); });
            ctx.restore();
        }
    };
    function drawCC(id) {
        const spec = CC[id], cv = rootEl.querySelector('#cc_' + id);
        if (!spec || !cv || !window.Chart) return;
        if (charts[id]) { charts[id].destroy(); delete charts[id]; }
        const types = spec.types || ['doughnut', 'bar', 'line'];
        const t = types.includes(chartTypes[id]) ? chartTypes[id] : (spec.def || types[0]);
        const H = hidden[id] || new Set(), ms = months(), ML = ms.map(m => MESI[m]);
        const ink2 = css('--cm-ink-2'), line = css('--cm-line'), card = css('--cm-card');
        const G = groups(spec).filter(g => !H.has(g.k));
        let type = t, labels, datasets, pick;
        if (t === 'line' || (spec.series && t === 'bar')) {
            const S = spec.series ? G : G.slice(0, 8);
            labels = ML;
            datasets = S.map(g => ({ label: g.k, data: ms.map(m => g.l.filter(r => meseDi(g, r) === m).length), backgroundColor: g.c, borderColor: g.c,
                tension: .3, pointRadius: 3.5, pointHoverRadius: 6, borderWidth: 2.4, borderRadius: 5, maxBarThickness: 26, fill: false }));
            pick = (di, i) => ({ g: S[di], m: ms[i] });
        } else if (spec.series) {   // ciambella dell'andamento: prima serie visibile, mese per mese
            const g = G[0] || groups(spec)[0];
            labels = ML; type = 'doughnut';
            datasets = [{ data: ms.map(m => g.l.filter(r => meseDi(g, r) === m).length), backgroundColor: ms.map((m, i) => PALETTE[i % PALETTE.length]), borderColor: card, borderWidth: 2 }];
            pick = (di, i) => ({ g, m: ms[i] });
        } else {
            labels = G.map(g => g.k);
            datasets = [{ data: G.map(g => g.n), backgroundColor: G.map(g => g.c), borderColor: t === 'doughnut' ? card : G.map(g => g.c), borderWidth: t === 'doughnut' ? 2 : 0, borderRadius: t === 'bar' ? 5 : 0, maxBarThickness: 34 }];
            pick = (di, i) => ({ g: G[i] });
        }
        const hor = type === 'bar' && spec.horiz && !spec.series;
        const opts = {
            maintainAspectRatio: false, animation: { duration: 450 },
            layout: { padding: { top: type === 'bar' && !hor ? 18 : 6, right: hor ? 34 : 6 } },
            plugins: { legend: { display: type === 'line' || (!!spec.series && type === 'bar'), position: 'bottom', labels: { color: ink2, boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11 } } },
                tooltip: { callbacks: { label: c => ` ${c.dataset.label || c.label}: ${nf(c.parsed.y != null && !hor && type !== 'doughnut' ? c.parsed.y : c.raw)}` } } },
            onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
            onClick: (e, els) => {
                if (!els.length) return;
                const { datasetIndex, index } = els[0], p = pick(datasetIndex, index);
                if (!p || !p.g) return;
                const L = p.m ? p.g.l.filter(r => meseDi(p.g, r) === p.m) : p.g.l;
                openRecs(`${spec.title} · ${p.g.k}${p.m ? ' · ' + MESIL[p.m] : ''}`, L, spec.kind);
            }
        };
        if (type === 'doughnut') opts.cutout = '62%';
        else opts.scales = hor
            ? { x: { beginAtZero: true, grid: { color: line }, ticks: { color: ink2, precision: 0 }, border: { display: false } }, y: { grid: { display: false }, ticks: { color: ink2, font: { size: 11 } } } }
            : { x: { grid: { display: false }, ticks: { color: ink2 } }, y: { beginAtZero: true, grid: { color: line }, ticks: { color: ink2, precision: 0 }, border: { display: false } } };
        if (hor) opts.indexAxis = 'y';
        // barre orizzontali con tante voci: il grafico si allunga e scorre dentro la card
        const inner = cv.parentNode, box = inner.parentNode, hBox = spec.h || 260;
        const hNeed = hor ? Math.max(hBox, labels.length * 24 + 44) : hBox;
        inner.style.height = hNeed + 'px';
        box.classList.toggle('scroll', hNeed > hBox);
        if (hNeed > hBox) opts.scales.x.position = 'top';
        charts[id] = new Chart(cv, { type, data: { labels, datasets }, options: opts, plugins: [valPlugin] });
    }
    function redrawCard(id) {
        const el = rootEl.querySelector(`[data-cc="${id}"]`); if (!el) return;
        el.outerHTML = ccCard(CC[id]); drawCC(id);
    }
    function drawAllCC() { Object.keys(CC).forEach(id => { if (rootEl.querySelector('#cc_' + id)) drawCC(id); }); }
    let popEl = null;
    const closePop = () => { if (popEl) { popEl.remove(); popEl = null; } };
    function ccClick(e) {
        const ct = e.target.closest('[data-ct]');
        if (ct) { const [id, t] = ct.dataset.ct.split('|'); chartTypes[id] = t; saveTypes(); redrawCard(id); return true; }
        const li = e.target.closest('[data-ccl]');
        if (li) {
            const spec = CC[li.dataset.ccl], g = groups(spec).find(x => x.k === li.dataset.k);
            if (g) openRecs(`${spec.title} · ${g.k}`, g.l, spec.kind);
            return true;
        }
        const vb = e.target.closest('[data-voci]');
        if (vb) {
            const id = vb.dataset.voci, spec = CC[id], H = hidden[id] || (hidden[id] = new Set());
            if (popEl && popEl.dataset.id === id) { closePop(); return true; }
            closePop();
            popEl = document.createElement('div'); popEl.className = 'cm-pop'; popEl.dataset.id = id;
            popEl.innerHTML = `<div class="cm-pop-a"><button type="button" data-pa="1">Mostra tutte</button><button type="button" data-pa="0">Nascondi tutte</button></div>` +
                groups(spec).map(g => `<label><input type="checkbox" value="${esc(g.k)}" ${H.has(g.k) ? '' : 'checked'}><i style="background:${g.c}"></i>${esc(g.k)}</label>`).join('');
            vb.closest('.cm-cc-h').appendChild(popEl);
            popEl.addEventListener('click', ev => {
                const pa = ev.target.closest('[data-pa]');
                if (pa) { groups(spec).forEach(g => { if (pa.dataset.pa === '1') H.delete(g.k); else H.add(g.k); }); popEl.querySelectorAll('input').forEach(i => { i.checked = pa.dataset.pa === '1'; }); applyVoci(id); }
                ev.stopPropagation();
            });
            popEl.addEventListener('change', ev => { const i = ev.target; if (i.checked) H.delete(i.value); else H.add(i.value); applyVoci(id); });
            return true;
        }
        if (popEl && !e.target.closest('.cm-pop')) closePop();
        return false;
    }
    // aggiorna grafico e legenda senza chiudere la tendina delle voci
    function applyVoci(id) {
        const el = rootEl.querySelector(`[data-cc="${id}"]`); if (!el) return;
        const H = hidden[id] || new Set();
        el.querySelectorAll('.cm-cc-li').forEach(b => b.classList.toggle('off', H.has(b.dataset.k)));
        drawCC(id);
    }

    /* ================= elenco con ricerca e filtri ================= */
    function esitoBadge(r) {
        const e = esito(r);
        const abb = r.soloFoglio ? 'Solo nel foglio AVANZAMENTO, nessuna trattativa del CSV abbinata'
            : r.foglio ? `Abbinata al foglio (${r.how || 'regole Consegne'}): ${r.fCli || ''}${r.fStato ? ' · stato ' + r.fStato : ''}` : 'Nessuna riga del foglio abbinata';
        const t = esc(`${fonteAnn(r)} · ${abb}`);
        return `<span class="cm-es" style="--c:${ESC[e]}"${r.ann ? ` title="${t}"` : ''}>${e}</span>${r.ann && !r.annFoglio ? ` <span class="cm-csv" title="${t}">solo CSV</span>` : ''}${r.stato === 'Fallita' && r.motivo && !r.ann ? `<small class="cm-mot">${esc(r.motivo)}</small>` : ''}`;
    }
    // Da dove arriva un contratto: CSV del Commerciale (stesso mese o trattativa di un mese
    // precedente) oppure recuperato dal CSV delle Consegne
    function provC(r) {
        if (r.stato !== 'Chiusa') return '';
        if (r.rec) return 'Recuperata da Consegne';
        return r.prima ? 'Trattativa di un mese precedente' : 'Trattativa dello stesso mese';
    }
    function provBadge(r) {
        if (r.stato !== 'Chiusa') return '';
        const apertaIl = r.dataT ? 'trattativa aperta il ' + dd(r.dataT) : '';
        if (r.rec) return ` <span class="cm-rec" title="${esc('Non presente nel CSV del Commerciale: preso dal CSV delle Consegne' + (apertaIl ? ' · ' + apertaIl : '') + (recOn ? '' : ' · ora NON contato (interruttore spento)'))}">Recuperata da Consegne</span>`;
        if (r.prima) return ` <span class="cm-prima" title="${esc('Contratto del ' + dd(r.data) + ', ' + apertaIl)}">Trattativa del ${dd(r.dataT)}</span>`;
        return '';
    }
    // Da dove viene l'annullamento: foglio AVANZAMENTO, etichetta del CSV o entrambi
    function fonteAnn(r) {
        if (!r.ann) return '';
        if (r.annFoglio && r.annCsv) return 'Foglio + CSV';
        if (r.soloFoglio) return 'Solo foglio (pratica non nel CSV)';
        if (r.annFoglio) return 'Foglio (CSV senza etichetta)';
        return 'Solo CSV (non annullata nel foglio)';
    }
    function mountRecList(box, recs, kind) {
        kind = kind || 'tr';
        const F = kind === 'pt'
            ? [['vend', 'Consulente', p => p.vend], ['op', 'Operatore', p => p.op], ['st', 'Stato', p => STL[p.st]], ['marca', 'Marca', p => p.marca]]
            : [['vend', 'Consulente', r => r.vend], ['sede', 'Sede', r => SEDI[r.sede]], ['origine', 'Origine', r => r.origine], ['esito', 'Esito', esito], ['tipo', 'Tipo', r => r.tipo], ['marca', 'Marca', r => r.marca]];
        if (kind === 'tr' && recs.some(r => r.ann)) F.push(['fonte', 'Fonte annullamento', fonteAnn]);
        if (kind === 'tr' && recs.some(r => r.rec || r.prima)) F.push(['prov', 'Provenienza contratto', provC]);
        const st = { q: '' }; F.forEach(f => { st[f[0]] = ''; });
        box.innerHTML = `<div class="cm-tools"><input type="search" placeholder="Cerca cliente, consulente, veicolo, targa…" data-q>
          ${F.map(([k, l, fn]) => `<select data-f="${k}"><option value="">${l}: tutti</option>${[...new Set(recs.map(fn))].filter(Boolean).sort((x, y) => String(x).localeCompare(String(y), 'it')).map(v => `<option>${esc(v)}</option>`).join('')}</select>`).join('')}
          <span class="cm-pinbox"></span><span class="cm-hint cm-cnt"></span></div><div class="cm-rl"></div>`;
        const draw = () => {
            const q = st.q.trim().toLowerCase();
            let L = recs.filter(r => F.every(([k, , fn]) => !st[k] || String(fn(r)) === st[k]));
            if (q) L = L.filter(r => (r.cliente + ' ' + r.vend + ' ' + (r.veicolo || r.marca + ' ' + (r.modello || '')) + ' ' + (r.targa || '') + ' ' + (r.origine || '') + ' ' + (r.op || '')).toLowerCase().includes(q));
            L = L.slice().sort(sortD);
            box.querySelector('.cm-cnt').textContent = nf(L.length) + (L.length === 1 ? ' riga' : ' righe');
            // 📌 origine / tipo / marca scelti -> si possono fissare per tutto il Commerciale
            const sc = {}; F.forEach(([k]) => { if (FISSABILI[k] && st[k]) sc[k] = st[k]; });
            const nuovo = Object.keys(sc).length && JSON.stringify(sc) !== JSON.stringify(fissa);
            box.querySelector('.cm-pinbox').innerHTML = nuovo
                ? `<button type="button" class="cm-pin" data-act="fissa" data-v="${esc(JSON.stringify(sc))}" title="KPI, grafici, classifiche e report del Commerciale conteranno solo queste trattative (resta salvato in questo browser)">📌 Usa ${esc(fissaLbl(sc))} in tutto il Commerciale</button>`
                : fissa ? `<button type="button" class="cm-pin" data-act="fissa-reset" title="Torna a contare tutte le trattative">📌 Commerciale: mostra tutto</button>` : '';
            const S = box._tutte ? L : L.slice(0, 500);      // _tutte: per l'Excel servono tutte le righe
            box.querySelector('.cm-rl').innerHTML = !S.length ? '<p class="cm-empty">Nessuna riga</p>' : kind === 'pt'
                ? `<div class="cm-scroll"><table class="cm-t cm-sort"><tr><th>Data</th><th class="l">Cliente</th><th class="l">Consulente</th><th class="l">Operatore</th><th class="l">Veicolo</th><th class="l">Stato</th><th class="l">Contratto</th></tr>
                   ${S.map(p => `<tr><td style="text-align:left">${dd(p.data)}</td><td class="l">${esc(p.cliente)}</td><td class="l">${esc(p.vend)}</td><td class="l">${esc(p.op)}</td><td class="l">${esc(p.marca + ' ' + p.modello)}</td><td class="l"><span class="cm-es" style="--c:${STC[p.st]}">${STL[p.st]}</span></td><td class="l">${p.contr ? '✓ ' + dd(p.contr.data) : ''}</td></tr>`).join('')}</table></div>`
                : `<div class="cm-scroll"><table class="cm-t cm-sort"><tr><th>Data</th><th class="l">Cliente</th><th class="l">Consulente</th><th class="l">Veicolo</th><th class="l">Tipo</th><th class="l">Origine</th><th class="l">Esito</th></tr>
                   ${S.map(r => `<tr><td style="text-align:left">${dd(r.data)}</td><td class="l">${esc(r.cliente)} ${r.b2b ? '<span class="cm-b2b">B2B</span>' : ''}${r.noleggio ? ' <span class="cm-csv">Noleggio</span>' : ''}${provBadge(r)}</td><td class="l">${esc(r.vend)}</td><td class="l">${esc(r.veicolo)}</td><td class="l">${r.tipo}</td>
                     <td class="l">${esc(r.origine)}${r.tel ? ` <span class="cm-tel" title="Preventivo telefonico del ${dd(r.tel.data)} · ${esc(r.tel.op)}">📞 Da preventivo telefonico</span>` : ''}</td><td class="l">${esitoBadge(r)}</td></tr>`).join('')}</table></div>`;
            if (L.length > S.length) box.querySelector('.cm-rl').insertAdjacentHTML('beforeend', '<p class="cm-hint">Mostrate le prime 500 righe: usa la ricerca o i filtri per restringere</p>');
        };
        box._draw = draw;
        box.querySelector('[data-q]').addEventListener('input', e => { st.q = e.target.value; draw(); });
        box.querySelectorAll('[data-f]').forEach(s => s.addEventListener('change', e => { st[e.target.dataset.f] = e.target.value; draw(); }));
        draw();
    }
    function openRecs(title, recs, kind) {
        const ov = modal(`${title} · ${nf(recs.length)}`, '<div class="cm-rbox"></div>', true, {
            titolo: 'Commerciale · ' + title,
            sottotitolo: () => [ov.querySelector('.cm-cnt').textContent, 'Periodo ' + per(), BiTools.filtriAttivi(ov.querySelector('.cm-tools'))].filter(Boolean).join(' · '),
            prima: () => { const b = ov.querySelector('.cm-rbox'); b._tutte = true; b._draw(); },
            dopo: () => { const b = ov.querySelector('.cm-rbox'); if (b._tutte) { b._tutte = false; b._draw(); } }
        });
        mountRecList(ov.querySelector('.cm-rbox'), recs, kind);
    }
    function sortTable(th) {
        const table = th.closest('table'), idx = [...th.parentNode.children].indexOf(th);
        const rows = [...table.querySelectorAll('tr')].slice(1).filter(r => !r.classList.contains('tot') && !r.classList.contains('cm-subr'));
        const subs = [...table.querySelectorAll('tr.cm-subr')];
        const tot = [...table.querySelectorAll('tr.tot')];
        const dir = th.dataset.dir === 'desc' ? 'asc' : 'desc';
        table.querySelectorAll('th').forEach(x => { delete x.dataset.dir; });
        th.dataset.dir = dir;
        const val = tr => { const t = (tr.children[idx] ? tr.children[idx].textContent : '').trim();
            const dm = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t); if (dm) return +(dm[3] + dm[2] + dm[1]);
            const n = parseFloat(t.replace(/\./g, '').replace(',', '.').replace('%', '')); return t === '–' ? -1 : (isNaN(n) ? t.toLowerCase() : n); };
        rows.sort((x, y) => { const a1 = val(x), b1 = val(y); const r = typeof a1 === 'number' && typeof b1 === 'number' ? a1 - b1 : String(a1).localeCompare(String(b1), 'it'); return dir === 'asc' ? r : -r; });
        const parent = rows.length ? rows[0].parentNode : null;
        if (parent) { rows.forEach(r => { parent.appendChild(r); subs.filter(x => x.dataset.par === r.dataset.k).forEach(x => parent.appendChild(x)); }); tot.forEach(r => parent.appendChild(r)); }
    }

    const kpi = (icon, bg, label, n, sub, click, wait) => `<${click ? 'button type="button"' : 'div'} class="cm-kpi ${wait ? 'cm-wait' : ''}" ${click ? `data-list='${esc(JSON.stringify(click))}'` : ''}><span class="cm-k-top"><span>${label}</span><span class="cm-dot" style="background:${bg}">${icon}</span></span><span class="cm-num">${n}</span><span class="cm-sub">${sub}</span></${click ? 'button' : 'div'}>`;
    function title() { return view.k === 'v' ? view.v + (view.s ? (view.s === 'Noleggio' ? ' · noleggio' : ' · vendita') : '') : view.k === 'all' ? 'Panoramica' : view.k === 'b2b' ? (view.v ? 'B2B · ' + view.v : 'B2B') : SEDI[view.s]; }
    function subTitle() {
        const s = view.k === 'v' ? sedeLab(view.v, view.s) : view.k === 'all' ? 'Agnano · Casamarciano · Salerno' : view.k === 'b2b' ? 'Trattative con società (B2B)' : view.s === 'Noleggio' ? 'Consulenti del noleggio' : 'Tutti i consulenti della sede';
        return s + ' · ' + per() + (view.k !== 'b2b' ? (b2bOn ? ' · B2B incluso' : ' · B2B escluso') : '');
    }
    function render() {
        if (!rootEl) return;
        closePop();
        Object.keys(charts).forEach(k => { charts[k].destroy(); delete charts[k]; });
        Object.keys(CC).forEach(k => delete CC[k]);
        selects(); side();
        const main = rootEl.querySelector('#cmMain');
        if (!loaded) { if (msgErr) main.innerHTML = `<div class="cm-card cm-empty">${esc(msgErr)}</div>`; return; }
        if (!TR.length) { main.innerHTML = '<div class="cm-card cm-empty"><h2>Importa il CSV con tutte le trattative</h2><p>Usa il pulsante "Importa trattative (CSV)" in alto. I dati del Commerciale sono separati da quelli delle Consegne: questo import non cambia i numeri delle Consegne e viceversa.</p></div>'; return; }
        if (view.k === 'pt') renderPT();
        else if (view.k === 'ann') renderAnn();
        else if (view.k === 'marche') renderMarche();
        else if (view.k === 'list') renderList();
        else renderReport();
        drawAllCC();
    }

    /* ---- tabelle di supporto ---- */
    const convTable = (rows, totP, totC, extra) => `<div class="cm-scroll"><table class="cm-t cm-sort"><tr><th>${rows.head}</th><th>Preventivi</th><th>Contratti</th><th>Conv.</th>${extra ? '<th>di cui 📞</th>' : ''}</tr>
        ${rows.list.map(r => `<tr><td>${esc(r.k)}</td><td>${nf(r.p)}</td><td>${r.c || '–'}</td><td>${r.c ? pct(r.c, r.p) : '–'}</td>${extra ? `<td>${r.tel || '–'}</td>` : ''}</tr>`).join('')}
        <tr class="tot"><td>Totale</td><td>${nf(totP)}</td><td>${nf(totC)}</td><td>${pct(totC, totP)}</td>${extra ? `<td>${rows.tel}</td>` : ''}</tr></table></div>`;
    // preventivi (R, per data trattativa) e contratti (C, per data chiusura) divisi per voce
    function perVoce(R, C, keyFn, order) {
        const mp = by(R, keyFn), mc = by(C, keyFn);
        const list = [...new Set([...mp.keys(), ...mc.keys()])].map(k => { const c = mc.get(k) || []; return { k, p: (mp.get(k) || []).length, c: c.length, tel: c.filter(r => r.tel).length }; });
        const pos = k => { const i = (order || []).indexOf(k); return i < 0 ? 999 : i; };
        return list.sort((x, y) => pos(x.k) - pos(y.k) || y.c - x.c || y.p - x.p);
    }
    function origMatrix(V) {
        const tot = [...by(V, c => c.origine)].map(([k, l]) => ({ k, n: l.length })).sort((x, y) => y.n - x.n);
        const cols = tot.map(o => o.k);   // tutte le origini, niente "Altre" (la tabella scorre)
        const key = c => c.origine;
        const rows = [...by(V, c => c.vend)].map(([v, l]) => { const m = {}; l.forEach(c => { m[key(c)] = (m[key(c)] || 0) + 1; }); return { v, n: l.length, m }; }).sort((x, y) => y.n - x.n);
        const t = {}; V.forEach(c => { t[key(c)] = (t[key(c)] || 0) + 1; });
        return { cols, rows, tot: t };
    }
    function origCard(V, isB) {
        const M = origMatrix(V);
        if (!M.rows.length) return '';
        const cell = (n, of) => n ? `<td style="background:rgba(19,106,120,${(0.06 + 0.5 * n / Math.max(1, of)).toFixed(2)})">${n}<small class="cm-pc">${pct(n, of).replace(',00', '')}</small></td>` : '<td>–</td>';
        return `<div class="cm-card" style="margin-top:16px"><h2>Origini per consulente</h2><p class="cm-hint">Contratti per origine trattativa · più scuro = quota più alta per quel consulente · clicca un nome per il suo report</p>
          <div class="cm-scroll"><table class="cm-t cm-heat cm-sort"><tr><th>Consulente</th>${M.cols.map(c => `<th>${esc(c)}</th>`).join('')}<th>Totale</th></tr>
          ${M.rows.map(r => `<tr data-vw='${esc(JSON.stringify(isB ? { k: 'b2b', v: r.v } : { k: 'v', v: r.v }))}'><td>${esc(r.v)}</td>${M.cols.map(c => cell(r.m[c] || 0, r.n)).join('')}<td><b>${r.n}</b></td></tr>`).join('')}
          <tr class="tot"><td>Totale</td>${M.cols.map(c => `<td>${M.tot[c] || 0}</td>`).join('')}<td>${V.length}</td></tr></table></div></div>`;
    }

    /* ---- report (Panoramica / sede / consulente / B2B) ---- */
    function renderReport() {
        const isB = view.k === 'b2b', R = trIn(view), C = cIn(view), ANN = annIn(view), F = R.filter(isF), IN = R.filter(r => r.stato === 'In corso');
        const PRIMA = C.filter(c => c.prima || c.rec).length, REC = C.filter(c => c.rec).length;
        const X = isB ? [] : PT.filter(p => inPer(p) && okC(p));
        const P = R.length, nm = a - da + 1, TEL = C.filter(c => c.tel).length, CF = C.filter(c => c.pag), FIN = C.filter(c => c.pag === 'Finanziamento').length;
        const b2bN = contr().filter(c => inPer(c) && c.b2b && c.sede !== 'Noleggio' && okV(c.vend)).length;
        const topMot = [...by(F, r => r.motivo)].sort((x, y) => y[1].length - x[1].length)[0];
        const group = view.k !== 'v' && !(isB && view.v);
        const ms = months(), cvm = ms.map(m => C.filter(c => c.m === m).length), iMax = cvm.indexOf(Math.max(...cvm));
        let rank = '';
        if (group) {
            const pv = by(R, r => r.vend), cv = by(C, r => r.vend);
            const rv = [...new Set([...pv.keys(), ...cv.keys()])].map(k => {
                const l = pv.get(k) || [], c = cv.get(k) || [];
                return { k, p: l.length, c: c.length, ann: ANN.filter(x => x.vend === k).length, f: l.filter(isF).length, tel: c.filter(x => x.tel).length, pt: X.filter(p => p.vend === k).length, fin: c.filter(x => x.pag === 'Finanziamento').length, cf: c.filter(x => x.foglio).length };
            }).sort((x, y) => y.c - x.c || y.p - x.p);
            const best = Math.max(...rv.filter(r => r.c >= 5).map(r => r.c / r.p));
            const showS = view.k === 'all' || isB;
            // NUOVO: chi lavora su piu' sedi ha una freccia ▾ che apre una riga per ogni sede
            // (in Panoramica e B2B il noleggio non conta: ha la sua vista)
            const perSede = k => {
                if (!showS || !doppio(k)) return [];
                const S = ORD_SEDI.filter(x => x !== 'Noleggio' && [...(pv.get(k) || []), ...(cv.get(k) || [])].some(r => r.sede === x));
                return S.length > 1 ? S.map(sd => {
                    const l = (pv.get(k) || []).filter(r => r.sede === sd), c = (cv.get(k) || []).filter(r => r.sede === sd);
                    return { sd, p: l.length, c: c.length, ann: ANN.filter(x => x.vend === k && x.sede === sd).length, f: l.filter(isF).length, tel: c.filter(x => x.tel).length, pt: X.filter(p => p.vend === k && p.sede === sd).length, fin: c.filter(x => x.pag === 'Finanziamento').length, cf: c.filter(x => x.foglio).length };
                }) : [];
            };
            const celleSede = (k, sub) => sub.length ? `<button type="button" class="cm-sedi" data-sedi="${esc(k)}" title="Vedi i numeri per sede" aria-expanded="false">▾</button>`
                : doppio(k) ? esc(sedeLab(k, view.k === 'sede' ? view.s : null, true)) : sedeOf(k);
            const numeri = r => `<td>${nf(r.p)}</td><td>${r.c}</td><td class="${r.c >= 5 && r.c / r.p === best ? 'best' : ''}">${pct(r.c, r.p)}</td><td>${r.ann || '–'}</td><td>${r.f || '–'}</td>${isB ? '' : `<td>${r.pt || '–'}</td><td>${r.tel || '–'}</td>`}<td>${pct(r.fin, r.cf)}</td>`;
            rank = `<div class="cm-sec">Consulenti</div><div class="cm-card"><h2>Classifica consulenti</h2><p class="cm-hint">Clicca un'intestazione per ordinare · clicca un nome per aprire il suo report</p>
            <div class="cm-scroll"><table class="cm-t cm-sort"><tr><th>Consulente</th>${showS ? '<th class="l">Sede</th>' : ''}<th>Preventivi</th><th>Contratti</th><th>Conv.</th><th>Annullati</th><th>Fallite</th>${isB ? '' : '<th>Prev. tel.</th><th>Da prev. tel.</th>'}<th>Finanziati</th></tr>
            ${rv.map(r => { const sub = perSede(r.k); return `<tr data-k="${esc(r.k)}" data-vw='${esc(JSON.stringify(isB ? { k: 'b2b', v: r.k } : doppio(r.k) && view.k === 'sede' ? { k: 'v', v: r.k, s: view.s } : { k: 'v', v: r.k }))}'><td>${esc(r.k)}</td>${showS ? `<td class="l">${celleSede(r.k, sub)}</td>` : ''}${numeri(r)}</tr>`
              + sub.map(x => `<tr class="cm-subr" data-par="${esc(r.k)}" hidden data-vw='${esc(JSON.stringify(isB ? { k: 'b2b', v: r.k } : { k: 'v', v: r.k, s: x.sd }))}'><td>↳ ${esc(x.sd)}</td><td class="l"></td>${numeri(x)}</tr>`).join(''); }).join('')}
            <tr class="tot"><td>Totale</td>${showS ? '<td></td>' : ''}<td>${nf(P)}</td><td>${C.length}</td><td>${pct(C.length, P)}</td><td>${ANN.length}</td><td>${F.length}</td>${isB ? '' : `<td>${X.length}</td><td>${TEL}</td>`}<td>${pct(FIN, CF.length)}</td></tr></table></div></div>` + origCard(C, isB);
        }
        const tip = perVoce(R, C, r => r.tipo, ['Usato', 'Km0', 'Nuovo', 'Non indicata']);
        const ori = perVoce(R, C, r => r.origine);
        const SV = C.filter(c => c.serv);
        const svc = SERVIZI.map(k => ({ k, n: SV.filter(c => c.serv[k]).length })).sort((x, y) => y.n - x.n);
        const id = s => (view.k + (view.s || '') + (view.v || '') + s).replace(/[^a-z0-9]/gi, '');
        const main = rootEl.querySelector('#cmMain');
        main.innerHTML = `
        <div class="cm-vhead"><h2>${esc(title())}</h2><p>${esc(subTitle())}</p></div>
        <div class="cm-kpis">
          ${kpi('📝', 'var(--cm-grey-soft)', 'Preventivi', nf(P), 'media ' + (P / nm).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' al mese · ' + nf(IN.length) + ' in corso', { t: 'Preventivi · ' + title(), vw: view, w: 'tutte' })}
          ${kpi('✍️', 'var(--cm-acc-soft)', 'Contratti', nf(C.length), (isB ? 'solo B2B' : (b2bOn ? 'di cui B2B ' + b2bN : 'B2B esclusi (' + b2bN + ')')) + ' · nel mese di chiusura' + (PRIMA ? ' · ' + PRIMA + ' da trattative di mesi precedenti' + (REC ? ' (' + REC + ' recuperate)' : '') : ''), { t: 'Contratti · ' + title(), vw: view, w: 'chiuse' })}
          ${kpi('🎯', 'var(--cm-grey-soft)', 'Conversione', pct(C.length, P), 'contratti / preventivi')}
          ${kpi('↩️', 'var(--cm-acc-soft)', 'Contratti annullati', nf(ANN.length), pct(ANN.length, C.length + ANN.length) + ' dei contratti firmati' + (ANN.some(x => !x.annFoglio) ? ' · ' + ANN.filter(x => !x.annFoglio).length + ' solo dal CSV' : ''), { t: 'Contratti annullati · ' + title(), vw: view, w: 'ann' })}
        </div>
        <div class="cm-kpis">
          ${kpi('✖️', 'var(--cm-grey-soft)', 'Trattative fallite', nf(F.length), topMot ? 'motivo principale: ' + esc(topMot[0]) : 'nessuna', { t: 'Trattative fallite · ' + title(), vw: view, w: 'fallite' })}
          ${kpi('📞', 'var(--cm-tel-soft)', 'Preventivi telefonici', isB ? '–' : nf(X.length), isB ? 'non applicabile al B2B' : X.filter(p => p.contr).length + ' diventati contratto', isB ? null : { t: 'Preventivi telefonici · ' + title(), vw: view, pt: 1 })}
          ${kpi('🤝', 'var(--cm-tel-soft)', 'Contratti da prev. telefonico', isB ? '–' : nf(TEL), isB ? '' : pct(TEL, C.length) + ' dei contratti', isB ? null : { t: 'Contratti da preventivo telefonico · ' + title(), vw: view, w: 'tel' })}
          ${kpi('🏦', 'var(--cm-grey-soft)', 'Finanziati', pct(FIN, CF.length), FIN + ' su ' + CF.length + ' contratti nel foglio')}
        </div>
        ${tempiHtml(R, C, group, isB)}
        ${rank}
        <div class="cm-sec">Andamento</div>
        <div class="cm-grid">${ccCard({ id: id('and'), title: 'Andamento mensile', hint: C.length ? `Picco di contratti a ${MESIL[ms[iMax]]} (${cvm[iMax]}) · clicca una barra per l'elenco` : 'Nessun contratto nel periodo', wide: 1, h: 300, def: 'bar', types: ['bar', 'line', 'doughnut'],
            series: [{ k: 'Preventivi', recs: R, c: '#9fcbd2', t: 1 }, { k: 'Contratti', recs: C, c: '#0f5662' }, { k: 'Annullati', recs: ANN, c: '#c0392b' }, { k: 'Fallite', recs: F, c: '#8e9aab', t: 1 }] })}</div>
        <div class="cm-sec">Esito e origini</div>
        <div class="cm-grid">
          ${ccCard({ id: id('esi'), title: 'Esito delle trattative', hint: 'Trattative create nel periodo: contratto, annullato, in corso o fallita', recs: R, key: esito, order: ESITI, colors: ESC, def: 'doughnut', t: 1 })}
          ${ccCard({ id: id('ori'), title: 'Origine dei contratti', hint: 'Origine trattativa (voci unite come sotto)', recs: C, key: r => r.origine, def: 'bar', horiz: true })}
          <div class="cm-card cm-wide"><h2>Preventivi e contratti per origine</h2><p class="cm-hint">${ori[0] ? `${esc([...ori].sort((x, y) => y.p - x.p)[0].k)} genera il ${pct([...ori].sort((x, y) => y.p - x.p)[0].p, P)} dei preventivi` : ''} · clicca un'intestazione per ordinare</p>
            ${convTable({ head: 'Origine', list: ori, tel: TEL }, P, C.length, !isB)}
            <div class="cm-note">${ORIG_NOTE.map(([k, v]) => `<b>${k}</b> = ${v}`).join('<br>')}${isB ? '' : '<br><b>di cui 📞</b> = contratti abbinati a un preventivo telefonico (l\'origine resta quella del CSV)'}</div></div>
        </div>
        <div class="cm-sec">Tipologia, pagamento e marche</div>
        <div class="cm-grid">
          ${ccCard({ id: id('tip'), title: 'Tipologia dei contratti', hint: tip[0] ? 'Preventivi e conversione nella tabella accanto' : '', recs: C, key: r => r.tipo, order: ['Usato', 'Km0', 'Nuovo', 'Non indicata'], def: 'doughnut' })}
          <div class="cm-card"><h2>Tipologia veicolo</h2><p class="cm-hint">${tip[0] ? `${[...tip].sort((x, y) => y.p - x.p)[0].k} vale il ${pct([...tip].sort((x, y) => y.p - x.p)[0].p, P)} dei preventivi` : ''}</p>${convTable({ head: 'Tipologia', list: tip }, P, C.length)}</div>
          ${ccCard({ id: id('pag'), title: 'Pagamento', hint: 'Contratti per modalità (colonna PAGAMENTO del foglio)', recs: C, key: r => r.pag, order: ['Finanziamento', 'PC (contanti)', 'Non indicato'], colors: { 'Finanziamento': '#0f5662', 'PC (contanti)': '#9fcbd2', 'Non indicato': '#aab6b9' }, def: 'doughnut' })}
          ${ccCard({ id: id('mar'), title: 'Marche dei contratti', hint: '<button type="button" class="cm-link" data-vw=\'{"k":"marche"}\'>Performance marchi completa →</button>', recs: C, key: r => r.marca, def: 'bar', horiz: true })}
        </div>
        <div class="cm-sec">Trattative fallite</div>
        <div class="cm-grid">
          ${ccCard({ id: id('mot'), title: 'Motivi di fallimento', hint: F.length + ' trattative fallite · clicca per l\'elenco', recs: F, key: r => r.motivo, def: 'bar', horiz: true, t: 1 })}
          ${ccCard({ id: id('fma'), title: 'Fallite per marca', hint: 'Tutte le marche · scorri il grafico', recs: F, key: r => r.marca, def: 'bar', horiz: true, t: 1 })}
        </div>
        ${isB ? '' : `<div class="cm-sec">Preventivi telefonici</div>
        <div class="cm-grid">
          ${ccCard({ id: id('pte'), title: 'Esito dei preventivi telefonici', hint: X.length + ' preventivi · ' + X.filter(p => p.contr).length + ' diventati contratto (' + pct(X.filter(p => p.contr).length, X.length) + ')', recs: X, key: p => STL[p.st], order: ST.map(s => STL[s]), colors: Object.fromEntries(ST.map(s => [STL[s], STC[s]])), def: 'doughnut', kind: 'pt' })}
          ${ccCard({ id: id('ptm'), title: 'Preventivi telefonici per mese', hint: 'Caricati e diventati contratto', wide: 0, def: 'bar', types: ['bar', 'line', 'doughnut'], kind: 'pt',
              series: [{ k: 'Preventivi telefonici', recs: X, c: '#9fcbd2' }, { k: 'Diventati contratto', recs: X.filter(p => p.contr), c: '#2f9e6e' }] })}
        </div>`}
        <div class="cm-sec">Servizi sui contratti</div>
        <div class="cm-grid">
          ${ccCard({ id: id('svc'), title: 'Servizi e accessori', hint: 'Contratti con il servizio (dal foglio) · un contratto può averne più di uno', recs: SV, key: c => SERVIZI.filter(k => c.serv[k]), order: SERVIZI, def: 'bar', horiz: true, totale: SV.length })}
          <div class="cm-card"><h2>Incidenza sui ${SV.length} contratti del foglio</h2><p class="cm-hint">Quota di contratti con il servizio${SV.length < C.length ? ` · ${C.length - SV.length} contratti non ancora nel foglio esclusi` : ''}</p>
            <table class="cm-t cm-sort"><tr><th>Servizio</th><th>Contratti</th><th>Incidenza</th></tr>${svc.map(s => `<tr><td>${s.k}</td><td>${s.n}</td><td>${pct(s.n, SV.length)}</td></tr>`).join('')}
            <tr class="tot"><td>Contratti del foglio</td><td>${SV.length}</td><td></td></tr></table></div>
        </div>`;
    }

    /* ---- performance marchi ---- */
    // logo del marchio (stessa cartella di Stock); se manca si vede solo il nome
    const logo = m => m === 'Non indicata' ? '' : `<img src="/img/marchi/${String(m).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png" alt="" onerror="this.remove()">`;
    function renderMarche() {
        const scope = marcheS === 'all' ? { k: 'all' } : marcheS === 'b2b' ? { k: 'b2b' } : { k: 'sede', s: marcheS };
        const R = trIn(scope), C = cIn(scope), P = R.length, ANNs = annIn(scope);
        const mp = by(R, r => r.marca), mc = by(C, r => r.marca);
        const rows = [...new Set([...mp.keys(), ...mc.keys()])].map(k => {
            const l = mp.get(k) || [], c = mc.get(k) || [];
            return { k, p: l.length, c: c.length, ann: ANNs.filter(x => x.marca === k).length, f: l.filter(isF).length, i: l.filter(x => x.stato === 'In corso').length,
                u: c.filter(x => x.tipo === 'Usato').length, z: c.filter(x => x.tipo === 'Km0').length, n: c.filter(x => x.tipo === 'Nuovo').length, tel: c.filter(x => x.tel).length };
        }).sort((x, y) => y.c - x.c || y.p - x.p);
        const conv = rows.filter(r => r.p >= 15).sort((x, y) => y.c / y.p - x.c / x.p);
        const best = conv[0], worst = conv[conv.length - 1];
        const chips = [['all', 'Tutte le sedi'], ['Agnano', 'Agnano'], ['Casamarciano', 'Casamarciano'], ['Salerno', 'Salerno'], ['Noleggio', 'Noleggio'], ['b2b', 'B2B']];
        const main = rootEl.querySelector('#cmMain');
        main.innerHTML = `
        <div class="cm-vhead"><h2>Performance marchi</h2><p>Preventivi, contratti e conversione per marca · ${per()}${marcheS !== 'b2b' ? (b2bOn ? ' · B2B incluso' : ' · B2B escluso') : ''}</p></div>
        <div class="cm-tools">${chips.map(([k, l]) => `<button type="button" class="cm-chip ${marcheS === k ? 'on' : ''}" data-ms="${k}">${l}</button>`).join('')}</div>
        <div class="cm-kpis">
          ${kpi('🏷️', 'var(--cm-acc-soft)', 'Marche con contratti', nf(rows.filter(r => r.c).length), 'su ' + rows.length + ' marche con preventivi')}
          ${kpi('🥇', 'var(--cm-grey-soft)', 'Marca più venduta', rows[0] ? esc(rows[0].k) : '–', rows[0] ? rows[0].c + ' contratti · ' + pct(rows[0].c, C.length) + ' del totale' : '')}
          ${kpi('🎯', 'var(--cm-acc-soft)', 'Conversione migliore', best ? pct(best.c, best.p) : '–', best ? esc(best.k) + ' (almeno 15 preventivi)' : '')}
          ${kpi('⚠️', 'var(--cm-grey-soft)', 'Conversione più bassa', worst && worst !== best ? pct(worst.c, worst.p) : '–', worst && worst !== best ? esc(worst.k) + ' (almeno 15 preventivi)' : '')}
        </div>
        <div class="cm-sec">Grafici</div>
        <div class="cm-grid">
          ${ccCard({ id: 'mkC' + marcheS, title: 'Contratti per marca', hint: 'Tutte le marche · scorri il grafico · clicca per l\'elenco', recs: C, key: r => r.marca, def: 'bar', horiz: true, h: 320 })}
          ${ccCard({ id: 'mkP' + marcheS, title: 'Preventivi per marca', hint: 'Tutte le marche · scorri il grafico · clicca per l\'elenco', recs: R, key: r => r.marca, def: 'bar', horiz: true, h: 320, t: 1 })}
        </div>
        <div class="cm-sec">Tabella completa</div>
        <div class="cm-card"><h2>Performance per marca</h2><p class="cm-hint">Clicca un'intestazione per ordinare · clicca una marca per i suoi contratti</p>
          <div class="cm-scroll"><table class="cm-t cm-sort"><tr><th>Marca</th><th>Preventivi</th><th>Contratti</th><th>Conv.</th><th>Quota contratti</th><th>Usato</th><th>Km0</th><th>Nuovo</th><th>Annullati</th><th>In corso</th><th>Fallite</th><th>Da prev. tel.</th></tr>
          ${rows.map(r => `<tr data-list='${esc(JSON.stringify({ t: 'Contratti ' + r.k, vw: scope, w: 'chiuse', marca: r.k }))}' style="cursor:pointer"><td><span class="cm-mk">${logo(r.k)}${esc(r.k)}</span></td><td>${nf(r.p)}</td><td>${r.c || '–'}</td><td>${r.c ? pct(r.c, r.p) : '–'}</td><td>${pct(r.c, C.length)}</td><td>${r.u || '–'}</td><td>${r.z || '–'}</td><td>${r.n || '–'}</td><td>${r.ann || '–'}</td><td>${r.i || '–'}</td><td>${r.f || '–'}</td><td>${r.tel || '–'}</td></tr>`).join('')}
          <tr class="tot"><td>Totale</td><td>${nf(P)}</td><td>${nf(C.length)}</td><td>${pct(C.length, P)}</td><td>100%</td>${['u', 'z', 'n', 'ann', 'i', 'f', 'tel'].map(k => `<td>${nf(rows.reduce((s, r) => s + r[k], 0))}</td>`).join('')}</tr></table></div></div>`;
    }

    /* ---- report contratti annullati ---- */
    function renderAnn() {
        const ALL = TR.filter(c => (isC(c) || c.ann) && annBase(c) && annSedeOk(c)).concat(AF.filter(c => annBase(c) && annSedeOk(c)));
        const chips = [['all', 'Tutte le sedi'], ['Agnano', 'Agnano'], ['Casamarciano', 'Casamarciano'], ['Salerno', 'Salerno']];
        const AN = ALL.filter(c => c.ann), F = ALL.length, N = AN.length;
        const perV = [...by(ALL, c => c.vend)].map(([v, l]) => ({ v, f: l.length, n: l.filter(c => c.ann).length, sede: doppio(v) ? sedeLab(v) : sedeOf(v) })).filter(r => r.n).sort((x, y) => y.n - x.n || x.f - y.f);
        const worst = perV.filter(r => r.f >= 5).sort((x, y) => y.n / y.f - x.n / x.f)[0];
        rootEl.querySelector('#cmMain').innerHTML = `
        <div class="cm-vhead"><h2>Contratti annullati</h2><p>Stato ANNULLATA nel foglio AVANZAMENTO o etichetta "CONTRATTO ANNULLATO" nel CSV · ${annS === 'all' ? 'Agnano, Casamarciano e Salerno' : SEDI[annS]} · ${per()}${b2bOn ? ' · B2B incluso' : ' · B2B escluso'}</p></div>
        <div class="cm-tools">${chips.map(([k, l]) => `<button type="button" class="cm-chip ${annS === k ? 'on' : ''}" data-as="${k}">${l}</button>`).join('')}</div>
        <div class="cm-kpis">
          ${kpi('↩️', 'var(--cm-acc-soft)', 'Contratti annullati', nf(N), (AN.some(x => !x.annFoglio) ? AN.filter(x => !x.annFoglio).length + ' solo dal CSV (non annullati nel foglio) · ' : '') + 'clicca per l\'elenco', { t: 'Contratti annullati' + (annS === 'all' ? '' : ' · ' + SEDI[annS]), vw: { k: 'any' }, w: 'annAll', s: annS })}
          ${kpi('📉', 'var(--cm-grey-soft)', 'Tasso di annullamento', pct(N, F), N + ' su ' + nf(F) + ' contratti')}
          ${kpi('👤', 'var(--cm-acc-soft)', 'Consulente con più annullati', perV[0] ? esc(perV[0].v.split(' ')[0]) + ' · ' + perV[0].n : '–', perV[0] ? pct(perV[0].n, perV[0].f) + ' dei suoi contratti' : '')}
          ${kpi('⚠️', 'var(--cm-grey-soft)', 'Tasso più alto', worst ? pct(worst.n, worst.f) : '–', worst ? esc(worst.v) + ' (almeno 5 contratti)' : '')}
        </div>
        <div class="cm-sec">Andamento</div>
        <div class="cm-grid">${ccCard({ id: 'annM', title: 'Annullati per mese', hint: 'Mese del contratto (data chiusura) · confronto con i contratti', wide: 1, h: 280, def: 'bar', types: ['bar', 'line', 'doughnut'],
            series: [{ k: 'Contratti', recs: ALL, c: '#9fcbd2' }, { k: 'Annullati', recs: AN, c: '#c0392b' }] })}</div>
        <div class="cm-sec">Chi e da dove</div>
        <div class="cm-grid">
          <div class="cm-card"><h2>Per consulente</h2><p class="cm-hint">Clicca un'intestazione per ordinare · un nome per il suo report</p>
            <div class="cm-scroll"><table class="cm-t cm-sort"><tr><th>Consulente</th><th class="l">Sede</th><th>Contratti</th><th>Annullati</th><th>Tasso</th></tr>
            ${perV.map(r => `<tr data-vw='${esc(JSON.stringify({ k: 'v', v: r.v }))}'><td>${esc(r.v)}</td><td class="l">${r.sede}</td><td>${r.f}</td><td>${r.n}</td><td>${pct(r.n, r.f)}</td></tr>`).join('') || '<tr><td colspan="5">Nessun annullato</td></tr>'}</table></div></div>
          ${ccCard({ id: 'annF', title: 'Fonte dell\'annullamento', hint: 'Foglio AVANZAMENTO, etichetta del CSV o entrambi · clicca per l\'elenco', recs: AN, key: fonteAnn, def: 'doughnut' })}
          ${ccCard({ id: 'annO', title: 'Annullati per origine', hint: 'Origine trattativa', recs: AN, key: c => c.origine, def: 'bar', horiz: true })}
          ${ccCard({ id: 'annS', title: 'Annullati per sede', hint: 'Sede del consulente', recs: AN, key: c => SEDI[c.sede], def: 'doughnut' })}
          ${ccCard({ id: 'annMa', title: 'Annullati per marca', hint: 'Tutte le marche · scorri il grafico', recs: AN, key: c => c.marca, def: 'bar', horiz: true })}
        </div>
        <div class="cm-sec">Elenco</div>
        <div class="cm-card"><div class="cm-rbox" id="cmAnnList"></div></div>
        <div class="cm-card" style="margin-top:16px"><h2>Come si decide se un contratto è annullato</h2>
          <div class="cm-note"><b>Annullato</b> = riga del foglio AVANZAMENTO con stato ANNULLATA, oppure trattativa del CSV con etichetta "CONTRATTO ANNULLATO". Il foglio ha la precedenza.<br>
          <b>Foglio + CSV</b> = annullato in tutti e due · <b>Foglio (CSV senza etichetta)</b> = la trattativa c'è nel CSV ma senza etichetta · <b>Solo foglio</b> = riga ANNULLATA a cui non è stata abbinata nessuna trattativa chiusa o con etichetta del CSV (conta comunque come annullato) · <b>Solo CSV</b> = etichetta nel CSV ma riga del foglio non annullata o assente.<br><br>
          <b>Abbinamento trattativa ↔ riga del foglio</b> (stesse regole delle Consegne, in quest'ordine; ogni riga del foglio si usa una volta sola; il telefono non si confronta):<br>
          ${REGOLE_ABB.map(([k, v], i) => `${i + 1}. <b>${esc(k)}</b>: ${esc(v)}`).join('<br>')}<br>
          La regola usata per ogni pratica si vede passando il mouse sul bollino dell'esito.</div></div>`;
        mountRecList(rootEl.querySelector('#cmAnnList'), AN, 'tr');
    }

    /* ---- report solo preventivi telefonici ---- */
    function renderPT() {
        const X = PT.filter(inPer), T = X.length, n = s => X.filter(p => p.st === s).length;
        const ven = X.filter(p => p.tipo === 'Vendita').length, ch = X.filter(p => p.contr).length, trat = n('TRATTATIVA_GENERATA') + n('CHIUSA') + n('FALLITA');
        const stc = Object.fromEntries(ST.map(s => [STL[s], STC[s]]));
        rootEl.querySelector('#cmMain').innerHTML = `
        <div class="cm-vhead"><h2>Preventivi telefonici</h2><p>Solo i preventivi telefonici della sezione In bound · tutte le sedi e noleggio · ${per()}</p></div>
        ${info && info.ptErr ? `<div class="cm-card cm-empty">Preventivi telefonici non disponibili: ${esc(info.ptErr)}</div>` : `
        <div class="cm-kpis">
          ${kpi('📞', 'var(--cm-tel-soft)', 'Preventivi telefonici', nf(T), 'Vendita ' + ven + ' · Noleggio ' + (T - ven), { t: 'Preventivi telefonici', vw: { k: 'any' }, pt: 1 })}
          ${kpi('🔄', 'var(--cm-grey-soft)', 'Trattative generate', nf(trat), pct(trat, T) + ' dei preventivi')}
          ${kpi('🤝', 'var(--cm-tel-soft)', 'Diventati contratto', nf(ch), pct(ch, T) + ' · clicca per i clienti', { t: 'Contratti da preventivo telefonico', vw: { k: 'any' }, w: 'tel' })}
          ${kpi('⏳', 'var(--cm-acc-soft)', 'In sospeso', nf(n('GENERATO')), 'ancora nello stato iniziale')}
        </div>
        <div class="cm-sec">Andamento ed esito</div>
        <div class="cm-grid">
          ${ccCard({ id: 'ptM', title: 'Andamento mensile', hint: 'Caricati e diventati contratto', def: 'bar', types: ['bar', 'line', 'doughnut'], kind: 'pt', series: [{ k: 'Preventivi telefonici', recs: X, c: '#9fcbd2' }, { k: 'Diventati contratto', recs: X.filter(p => p.contr), c: '#2f9e6e' }] })}
          ${ccCard({ id: 'ptE', title: 'Esito dei preventivi', hint: 'Stato attuale di ogni preventivo', recs: X, key: p => STL[p.st], order: ST.map(s => STL[s]), colors: stc, def: 'doughnut', kind: 'pt' })}
          ${ccCard({ id: 'ptC', title: 'Per consulente', hint: 'Preventivi assegnati', recs: X, key: p => p.vend, def: 'bar', horiz: true, kind: 'pt', h: 320 })}
          ${ccCard({ id: 'ptO', title: 'Per operatore In bound', hint: 'Chi ha creato il preventivo', recs: X, key: p => p.op, def: 'bar', horiz: true, kind: 'pt', h: 320 })}
          ${ccCard({ id: 'ptS', title: 'Per sede', hint: 'Sede del consulente', recs: X, key: p => SEDI[p.sede], def: 'doughnut', kind: 'pt' })}
          ${ccCard({ id: 'ptMa', title: 'Marche richieste', hint: 'Tutte le marche · scorri il grafico', recs: X, key: p => p.marca, def: 'bar', horiz: true, kind: 'pt' })}
        </div>`}`;
    }

    /* ---- tutte le trattative ---- */
    function renderList() {
        const any = { k: 'any' };
        const all = trIn(any), CC2 = cIn(any);   // trattative create nel periodo / contratti chiusi nel periodo
        const chips = [['contratti', 'Contratti', CC2], ['prima', 'Da mesi precedenti', CC2.filter(r => r.prima || r.rec)], ['tutte', 'Tutte', all], ['corso', 'In corso', all.filter(r => r.stato === 'In corso')], ['fallite', 'Fallite', all.filter(isF)],
            ['ann', 'Annullati', annIn(any)], ['tel', '📞 Da prev. telefonico', CC2.filter(r => r.tel)], ['b2b', '💼 B2B', all.filter(r => r.b2b)]];
        const nRec = TR.filter(r => r.rec && r.stato === 'Chiusa' && inPer(r)).length;
        if (nRec) chips.push(['rec', 'Recuperate da Consegne' + (recOn ? '' : ' (non contate)'), TR.filter(r => r.rec && r.stato === 'Chiusa' && inPer(r))]);
        const cur = chips.find(c => c[0] === listF.f) || chips[0];
        rootEl.querySelector('#cmMain').innerHTML = `<div class="cm-vhead"><h2>Tutte le trattative</h2><p>${per()} · tutte le sedi e noleggio · esclusi ${ESCLUSI.join(', ')} · contratti nel mese di chiusura, trattative nel mese di apertura</p></div>
        <div class="cm-tools">${chips.map(([k, l, L]) => `<button type="button" class="cm-chip ${cur[0] === k ? 'on' : ''}" data-chip="${k}">${l} · ${nf(L.length)}</button>`).join('')}</div>
        <div class="cm-card"><div class="cm-rbox" id="cmAllList"></div></div>`;
        mountRecList(rootEl.querySelector('#cmAllList'), cur[2], 'tr');
    }
    // elenco aperto da una card dei numeri
    function openList(o) {
        if (o.pt) { openRecs(o.t, PT.filter(p => inPer(p) && (o.vw.k === 'any' || okC(p, o.vw))), 'pt'); return; }
        let L = trIn(o.vw);                                   // preventivi (trattative create nel periodo)
        if (o.w === 'chiuse') L = cIn(o.vw);                  // contratti (chiusi nel periodo)
        if (o.w === 'ann') L = annIn(o.vw);
        if (o.w === 'fallite') L = L.filter(isF);
        if (o.w === 'tel') L = cIn(o.vw).filter(r => r.tel);
        if (o.w === 'annAll') L = TR.filter(c => c.ann && annBase(c) && (!o.s || o.s === 'all' || c.sede === o.s)).concat(AF.filter(c => annBase(c) && (!o.s || o.s === 'all' || c.sede === o.s)));
        if (o.w === 'recAll') L = TR.filter(r => r.rec && r.stato === 'Chiusa');   // tutte le recuperate, qualsiasi periodo
        if (o.marca) L = L.filter(r => r.marca === o.marca);
        openRecs(o.t, L, 'tr');
    }

    /* ================= finestre: storico import ================= */
    // tools: se c'e' una tabella, Schermo intero + Excel (bi-tools.js) nell'intestazione
    function modal(title, html, wide, tools) {
        const ov = document.createElement('div'); ov.className = 'cm-ov';
        ov.innerHTML = `<div class="cm-modal ${wide ? 'cm-wide-m' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h3>${esc(title)}</h3><button type="button" aria-label="Chiudi" data-x>✕</button></header><div class="cm-mbody">${html}</div></div>`;
        let bar = null;
        if (tools && window.BiTools) {
            bar = BiTools.toolbar(Object.assign({
                sezione: 'COMMERCIALE', titolo: 'Commerciale · ' + title,
                table: () => ov.querySelector('.cm-mbody table'),
                fs: ov.querySelector('.cm-modal')
            }, tools));
            const hd = ov.querySelector('.cm-modal header');
            hd.insertBefore(bar, hd.querySelector('[data-x]'));
        }
        const close = () => { if (bar) bar._reset(); ov.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = e => { if (e.key === 'Escape') close(); };
        ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-x]')) close(); });
        document.addEventListener('keydown', onKey);
        rootEl.appendChild(ov);
        ov.close = close;
        return ov;
    }
    function openStorico() {
        const st = (info && info.storico) || [];
        const when = iso => iso ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        modal('Storico import trattative', st.length ? `<div class="cm-scroll"><table class="cm-t"><tr><th>Quando</th><th class="l">Chi</th><th class="l">Da</th><th class="l">File</th><th>Righe</th><th>Chiuse</th><th>Vendita</th><th>Noleggio</th><th class="l">Periodo nel file</th><th>Nuove</th><th>Tolte</th></tr>
          ${st.map((r, i) => `<tr><td style="text-align:left">${when(r.quando)}${i === 0 ? ' <span class="cm-b2b">ultimo</span>' : ''}</td><td class="l">${esc(r.chi || '')}</td><td class="l">${esc(r.da || '')}</td><td class="l">${esc(r.file || '')}</td><td>${nf(r.righe)}</td><td>${r.chiuse != null ? nf(r.chiuse) : '–'}</td><td>${r.vendita != null ? nf(r.vendita) : '–'}</td><td>${r.noleggio != null ? nf(r.noleggio) : '–'}</td><td class="l">${r.dal ? esc(r.dal) + ' – ' + esc(r.al) : ''}</td><td>${r.nuove != null ? nf(r.nuove) : '–'}</td><td>${r.tolte != null ? nf(r.tolte) : '–'}</td></tr>`).join('')}</table></div>
          <p class="cm-hint" style="margin-top:10px">Ogni import sostituisce il precedente per tutti, solo nel Commerciale (le Consegne hanno il loro import). Nuove/Tolte = trattative presenti solo nel nuovo file / solo nel file precedente.</p>`
            : '<p class="cm-empty">Nessun import registrato finora: lo storico parte dal prossimo import.</p>', true, st.length ? { titolo: 'Commerciale · Storico import trattative' } : null);
    }
    // NUOVO: import del file dei lead. Si tengono SOLO: ID Trattativa Generata e data del lead
    // (Data inserimento, altrimenti Data lead), per i tempi lead -> trattativa -> contratto.
    function leggiLead(text) {
        text = String(text).replace(/^[\s\uFEFF]+/, '');
        let i = 0, n = text.length, idx = null, righe = 0;
        const out = new Map();
        const dataIso = s => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s || ''); if (!m) return null; let y = +m[3]; if (y < 100) y += 2000; return `${y}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`; };
        let row = [], f = '', q = false;
        const fine = () => {
            row.push(f); f = '';
            if (row.some(x => x.trim() !== '')) {
                if (!idx) {
                    const h = row.map(x => x.replace(/^\uFEFF/, '').trim());
                    idx = { t: h.indexOf('ID Trattativa Generata'), d: h.indexOf('Data inserimento'), d2: h.indexOf('Data lead') };
                    if (idx.t < 0 || (idx.d < 0 && idx.d2 < 0)) throw new Error('Nel file mancano le colonne "ID Trattativa Generata" e "Data inserimento": serve l\'export dei lead');
                } else {
                    righe++;
                    const id = String(row[idx.t] || '').trim();
                    const d = dataIso(idx.d >= 0 ? row[idx.d] : '') || dataIso(idx.d2 >= 0 ? row[idx.d2] : '');
                    if (id && id !== '0' && d && (!out.has(id) || d < out.get(id))) out.set(id, d);
                }
            }
            row = [];
        };
        for (; i < n; i++) {
            const c = text[i];
            if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
            else if (c === '"') q = true;
            else if (c === ';') { row.push(f); f = ''; }
            else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; fine(); }
            else f += c;
        }
        fine();
        if (!idx) throw new Error('File vuoto');
        return { rows: [...out.entries()], righe };
    }
    function importaLead(input) {
        const file = input.files && input.files[0]; if (!file) return;
        const lbl = rootEl.querySelector('#cmLeadLbl');
        const r = new FileReader();
        r.onload = async () => {
            lbl.classList.add('cm-busy'); msgErr = ''; msgOk = '';
            try {
                const L = leggiLead(r.result);
                if (!L.rows.length) throw new Error('Nel file non c\'è nessun lead con una trattativa generata');
                const dd = L.rows.map(x => x[1]).sort();
                const body = { rows: L.rows, file: file.name, righeFile: L.righe, conTrattativa: L.rows.length, dal: dd[0], al: dd[dd.length - 1] };
                const res = await fetch('/api/commerciale/lead', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                if (!res.ok) { let m = 'Errore ' + res.status; try { m = (await res.json()).error || m; } catch (x) { /* */ } throw new Error(m); }
                loaded = false; await load(true);
                msgOk = `Lead importati: ${nf(L.righe)} righe, ${nf(L.rows.length)} con una trattativa. Servono solo per i tempi (sezione "Tempi"): il resto del Commerciale non cambia.`; shellSrc();
            } catch (e) { msgErr = 'Import lead non riuscito: ' + e.message; shellSrc(); }
            finally { lbl.classList.remove('cm-busy'); input.value = ''; }
        };
        r.readAsText(file, 'utf-8');
    }

    // NUOVO: tempi medi. lt = lead -> trattativa, tc = trattativa -> contratto, lc = lead -> contratto
    // (giorni di calendario; si scartano i casi con date al contrario, es. lead caricato dopo)
    const giorni = (x, y) => Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 864e5);
    function stat(v) {
        const l = v.filter(x => x >= 0).sort((p, q) => p - q);
        if (!l.length) return { n: 0, neg: v.length };
        const med = l.length % 2 ? l[(l.length - 1) / 2] : (l[l.length / 2 - 1] + l[l.length / 2]) / 2;
        return { n: l.length, media: l.reduce((p, q) => p + q, 0) / l.length, med, zero: l.filter(x => x === 0).length, neg: v.length - l.length };
    }
    function tempi(R, C) {
        const lt = [], tc = [], lc = [];
        R.forEach(r => { const d = LEAD.get(r.idT); if (d && r.hasDT) lt.push(giorni(d, r.dataT)); });
        C.forEach(c => {
            if (c.hasDT) tc.push(giorni(c.dataT, c.data));
            const d = LEAD.get(c.idT); if (d) lc.push(giorni(d, c.data));
        });
        return { lt: stat(lt), tc: stat(tc), lc: stat(lc) };
    }
    let tmSw = 'c', tmAll = false;   // NUOVO: Tempi - consulente/origine, tutte le righe
    const gg = x => x == null ? '–' : x.toLocaleString('it-IT', { maximumFractionDigits: 1 }) + (x === 1 ? ' giorno' : ' giorni');
    const ggC = s => s.n ? `<b>${s.media.toLocaleString('it-IT', { maximumFractionDigits: 1 })}</b><small class="cm-pc">mediana ${s.med.toLocaleString('it-IT', { maximumFractionDigits: 1 })} · ${nf(s.n)}</small>` : '–';
    function tempiHtml(R, C, group, isB) {
        const T = tempi(R, C), haLead = LEAD.size > 0;
        const noLead = 'importa il file dei lead (pulsante "Importa lead")';
        const kp = (icon, lab, s, extra, perLead) => kpi(icon, 'var(--cm-grey-soft)', lab, perLead && !haLead ? '–' : s.n ? gg(s.media) : '–',
            perLead && !haLead ? noLead : s.n ? `mediana ${gg(s.med)} · su ${nf(s.n)}${extra ? ' · ' + extra(s) : ''}` : 'nessun caso nel periodo');
        const perK = (keyFn) => {
            const mr = by(R, keyFn), mc = by(C, keyFn);
            return [...new Set([...mr.keys(), ...mc.keys()])].map(k => ({ k, t: tempi(mr.get(k) || [], mc.get(k) || []) }))
                .filter(x => x.t.lt.n || x.t.tc.n || x.t.lc.n).sort((x, y) => (y.t.tc.n + y.t.lt.n) - (x.t.tc.n + x.t.lt.n));
        };
        // NUOVO: tabella compatta con barre (piu' corta = piu' veloce); prime 8 righe, poi "Mostra tutti"
        const f1 = x => x.toLocaleString('it-IT', { maximumFractionDigits: 1 });
        const tab = (head, list, link, key) => {
            if (!list.length) return '<p class="cm-empty">Nessun dato nel periodo.</p>';
            const M = {}; ['lt', 'tc', 'lc'].forEach(f => { M[f] = Math.max(1, ...list.map(x => x.t[f].n ? x.t[f].media : 0), T[f].n ? T[f].media : 0); });
            const cel = (s, f, tot) => {
                if (!s.n) return '<td class="cm-tm-na">–</td>';
                const w = Math.max(3, Math.min(100, s.media / M[f] * 100)), cl = tot ? 'tot' : T[f].n && s.media > T[f].media * 1.1 ? 'lento' : T[f].n && s.media < T[f].media * 0.9 ? 'rapido' : '';
                return `<td><div class="cm-tm ${cl}"><b>${f1(s.media)}</b><span class="cm-tm-bar"><i style="width:${w.toFixed(1)}%"></i></span></div><small class="cm-tm-s">mediana ${f1(s.med)} · ${nf(s.n)} casi</small></td>`;
            };
            return `<div class="cm-scroll"><table class="cm-t cm-sort cm-tmt ${tmAll ? 'all' : ''}" data-tm="${key}"><tr><th>${head}</th><th>Lead → trattativa</th><th>Trattativa → contratto</th><th>Lead → contratto</th></tr>
            ${list.map(x => `<tr ${link ? `data-vw='${esc(JSON.stringify(link(x.k)))}'` : ''}><td>${esc(x.k)}</td>${cel(x.t.lt, 'lt')}${cel(x.t.tc, 'tc')}${cel(x.t.lc, 'lc')}</tr>`).join('')}
            <tr class="tot"><td>Totale</td>${cel(T.lt, 'lt', 1)}${cel(T.tc, 'tc', 1)}${cel(T.lc, 'lc', 1)}</tr></table></div>
            ${list.length > 8 ? `<button type="button" class="cm-tm-more" data-tmall>${tmAll ? 'Mostra meno' : `Mostra tutti (${nf(list.length)})`}</button>` : ''}`;
        };
        const scart = [T.lt.neg, T.tc.neg, T.lc.neg].reduce((p, q) => p + q, 0);
        return `<div class="cm-sec">Tempi</div>
        <div class="cm-kpis">
          ${kp('⏱️', 'Da lead a trattativa', T.lt, null, true)}
          ${kp('⏱️', 'Da trattativa a contratto', T.tc, s => pct(s.zero, s.n) + ' lo stesso giorno')}
          ${kp('⏱️', 'Da lead a contratto', T.lc, null, true)}
          ${kpi('🔗', 'var(--cm-grey-soft)', 'Trattative nate da un lead', haLead ? nf(R.filter(r => LEAD.has(r.idT)).length) : '–', haLead ? pct(R.filter(r => LEAD.has(r.idT)).length, R.length) + ' delle trattative del periodo' + (scart ? ' · ' + nf(scart) + ' casi con date al contrario non contati' : '') : noLead)}
        </div>
        ${(() => {
            const conV = group && !(isB && view.v), sw = conV ? tmSw : 'o';
            return `<div class="cm-card cm-tm-card" data-cat="tempi" style="margin-top:16px">
          <div class="cm-cc-h"><div><h2>Tempi per ${sw === 'c' ? 'consulente' : 'origine'}</h2><p class="cm-hint">Media in giorni (sotto: mediana e casi) · barra <b class="cm-tm-k rapido">più veloce</b> o <b class="cm-tm-k lento">più lenta</b> della media${sw === 'c' ? ' · clicca un nome per il suo report' : ' · lead → trattativa per data della trattativa, gli altri per data del contratto'}</p></div>
            <div class="cm-cc-btns">${conV ? `<span class="cm-cc-seg cm-tm-sw"><button type="button" data-tmsw="c" class="${sw === 'c' ? 'on' : ''}">Consulente</button><button type="button" data-tmsw="o" class="${sw === 'o' ? 'on' : ''}">Origine</button></span>` : ''}</div></div>
          ${sw === 'c' ? tab('Consulente', perK(r => r.vend), k => isB ? { k: 'b2b', v: k } : { k: 'v', v: k }, 'c') : tab('Origine', perK(r => r.origine), null, 'o')}
        </div>`;
        })()}`;
    }

    function importa(input) {
        const file = input.files && input.files[0]; if (!file) return;
        const lbl = rootEl.querySelector('#cmImpLbl');
        const r = new FileReader();
        r.onload = async () => {
            lbl.classList.add('cm-busy'); msgErr = ''; msgOk = '';
            try {
                const rows = A().preparaCsv(String(r.result));
                const chiusa = x => x.stato ? /chius/i.test(x.stato) : !!String(x.chiusura || '').trim();
                const isNol = x => /noleggio/i.test(x.sede || '');
                if (!rows.length) throw new Error('Il file non contiene trattative');
                if (!rows.some(x => x.stato)) throw new Error('Nel file manca la colonna "Stato trattativa": serve il CSV con tutte le trattative');
                // confronto con l'import precedente (stesso cliente, data e consulente)
                const chiave = x => [`${x.nome || ''} ${x.cognome || ''} ${x.rag || ''}`.toUpperCase().replace(/\s+/g, ' ').trim(), String(x.dataTratt || x.chiusura || '').trim(), String(x.vend || '').toUpperCase().trim()].join('|');
                const prima = new Set(((info && info.trattAll) || []).filter(x => !x.rec).map(chiave)), dopo = new Set(rows.map(chiave));
                const pd = A().pd, date = rows.map(x => pd(x.dataTratt) || pd(x.chiusura)).filter(Boolean).sort((x, y) => x - y);
                const body = { rows, file: file.name, chiuse: rows.filter(chiusa).length, vendita: rows.filter(x => !isNol(x)).length, noleggio: rows.filter(isNol).length,
                    dal: date.length ? dd(date[0]) : '', al: date.length ? dd(date[date.length - 1]) : '',
                    nuove: [...dopo].filter(k => !prima.has(k)).length, tolte: prima.size ? [...prima].filter(k => !dopo.has(k)).length : 0 };
                const res = await fetch('/api/commerciale/trattative', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                if (!res.ok) { let m = 'Errore ' + res.status; try { m = (await res.json()).error || m; } catch (x) { /* */ } throw new Error(m); }
                loaded = false; await load(true);
                msgOk = `Import completato: ${nf(rows.length)} trattative (${nf(body.chiuse)} chiuse). Vale solo per il Commerciale: le Consegne hanno il loro import.`; shellSrc();
            } catch (e) { msgErr = e.message; shellSrc(); }
            finally { lbl.classList.remove('cm-busy'); input.value = ''; }
        };
        r.readAsText(file, 'utf-8');
    }


    /* ================= calcoli per un ambito (export) ================= */
    function lab(vw) { return vw.k === 'v' ? vw.v + (vw.s ? (vw.s === 'Noleggio' ? ' (noleggio)' : ' (vendita)') : '') : vw.k === 'all' ? 'Panoramica' : vw.k === 'b2b' ? (vw.v ? 'B2B · ' + vw.v : 'B2B') : SEDI[vw.s]; }
    function calc(vw) {
        const isB = vw.k === 'b2b', ms = months();
        const R = trIn(vw), C = cIn(vw), ANN = annIn(vw), F = R.filter(isF), IN = R.filter(r => r.stato === 'In corso');
        const X = isB ? [] : PT.filter(p => inPer(p) && okC(p, vw));
        const CF = C.filter(c => c.foglio), SV = C.filter(c => c.serv);
        const FIN = C.filter(c => c.pag === 'Finanziamento').length, PC = C.filter(c => c.pag === 'PC (contanti)').length;
        const pvM = by(R, r => r.vend), cvM = by(C, r => r.vend);
        const cons = [...new Set([...pvM.keys(), ...cvM.keys()])].map(k => {
            const l = pvM.get(k) || [], c = cvM.get(k) || [];
            return { k, sede: doppio(k) ? (vw.k === 'sede' ? vw.s : sedeLab(k, null, vw.k === 'all' || vw.k === 'b2b')) : sedeOf(k), p: l.length, n: c.length, ann: ANN.filter(x => x.vend === k).length, f: l.filter(isF).length, tel: c.filter(x => x.tel).length, pt: X.filter(p => p.vend === k).length, fin: c.filter(x => x.pag === 'Finanziamento').length, cf: c.filter(x => x.foglio).length };
        }).sort((x, y) => y.n - x.n || y.p - x.p);
        return {
            vw, isB, R, C, ANN, F, IN, X, P: R.length, Cn: C.length, A: ANN.length, TEL: C.filter(c => c.tel).length, FIN, PC, NI: C.length - FIN - PC, CFn: CF.length, ms,
            B2B: C.filter(c => c.b2b).length,
            pv: ms.map(m => R.filter(r => mOfT(r) === m).length), cv: ms.map(m => C.filter(c => c.m === m).length), av: ms.map(m => ANN.filter(c => c.m === m).length),
            fv: ms.map(m => F.filter(r => mOfT(r) === m).length), ptv: ms.map(m => X.filter(p => p.m === m).length), ptc: ms.map(m => X.filter(p => p.m === m && p.contr).length),
            tip: perVoce(R, C, r => r.tipo, ['Usato', 'Km0', 'Nuovo', 'Non indicata']),
            ori: perVoce(R, C, r => r.origine),
            marche: perVoce(R, C, r => r.marca),
            PRIMA: C.filter(c => c.prima || c.rec).length, REC: C.filter(c => c.rec).length,
            motivi: [...by(F, r => r.motivo)].map(([k, l]) => ({ k, n: l.length })).sort((x, y) => y.n - x.n),
            SV: SV.length, serv: SERVIZI.map(k => ({ k, n: SV.filter(c => c.serv[k]).length })),
            esiti: ST.map(s => ({ s, n: X.filter(p => p.st === s).length })), ptCh: X.filter(p => p.contr).length,
            cons, group: vw.k !== 'v' && !(isB && vw.v)
        };
    }

    /* ================= finestra di export ================= */
    let expState = null;
    // NUOVO: argomenti da mettere nel report (Excel = fogli, PDF = blocchi della pagina)
    const CONT = [['riep', 'Riepilogo e indicatori'], ['mens', 'Andamento mensile'], ['tip', 'Tipologia e pagamento'], ['ori', 'Origini (canali)'],
        ['cons', 'Consulenti'], ['marche', 'Performance marchi'], ['fall', 'Trattative fallite'], ['serv', 'Servizi'], ['pt', 'Preventivi telefonici']];
    function openExport() {
        const s0 = expState || {
            fmt: 'xlsx', anno, da, a, b2b: b2bOn, lista: true, ann: true, prev: false, ptL: false, cont: CONT.map(c => c[0]),
            amb: view.k === 'v' ? ['v|' + view.v + (view.s ? '|' + view.s : '')] : view.k === 'sede' ? ['sede|' + view.s] : view.k === 'b2b' ? ['b2b|'] : ['all|', 'sede|Agnano', 'sede|Casamarciano', 'sede|Salerno']
        };
        const ck = key => s0.amb.includes(key) ? 'checked' : '';
        const consG = s => vend.filter(v => sediDi(v).includes(s));
        const ml = []; for (let m = 1; m <= 12; m++) ml.push(`<option value="${m}">${MESIL[m].charAt(0).toUpperCase() + MESIL[m].slice(1)}</option>`);
        const ov = modal('Esporta il report commerciale', `
          <div class="cm-exp">
            <div class="cm-exp-s"><h4>Formato</h4><div class="cm-exp-fmt">
              <label><input type="radio" name="cmFmt" value="xlsx" ${s0.fmt === 'xlsx' ? 'checked' : ''}><span><b>📊 Excel</b><small>Riepilogo, andamento mensile, origini con conversione, consulenti, tipologia e pagamento, performance marchi, trattative fallite, servizi, preventivi telefonici ed elenchi</small></span></label>
              <label><input type="radio" name="cmFmt" value="pdf" ${s0.fmt === 'pdf' ? 'checked' : ''}><span><b>📄 PDF</b><small>Un report impaginato per ogni voce scelta (come il report venditore), pronto da stampare o salvare</small></span></label>
            </div></div>
            <div class="cm-exp-s"><h4>Periodo</h4><div class="cm-exp-row">
              <label>Anno <select id="cmXAnno">${(anni.length ? anni : [anno]).map(y => `<option ${y === s0.anno ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
              <label>Da <select id="cmXDa">${ml.join('')}</select></label>
              <label>A <select id="cmXA">${ml.join('')}</select></label>
              <label class="cm-exp-chk"><input type="checkbox" id="cmXB2b" ${s0.b2b ? 'checked' : ''}> B2B nel conteggio</label>
            </div></div>
            <div class="cm-exp-s"><h4>Cosa esportare <button type="button" class="cm-link" data-xall>Seleziona tutto</button> <button type="button" class="cm-link" data-xnone>Nessuno</button></h4>
              <div class="cm-exp-grid">
                <div><h5>Panoramica e sedi</h5>
                  <label><input type="checkbox" data-amb="all|" ${ck('all|')}> Panoramica</label>
                  ${['Agnano', 'Casamarciano', 'Salerno'].map(s => `<label><input type="checkbox" data-amb="sede|${s}" ${ck('sede|' + s)}> ${SEDI[s]}</label>`).join('')}
                  <h5>Categorie</h5>
                  <label><input type="checkbox" data-amb="b2b|" ${ck('b2b|')}> B2B</label>
                  <label><input type="checkbox" data-amb="sede|Noleggio" ${ck('sede|Noleggio')}> Noleggio</label>
                </div>
                ${['Agnano', 'Casamarciano', 'Salerno', 'Noleggio'].map(s => `<div><h5>Consulenti ${s === 'Noleggio' ? 'noleggio' : s} <button type="button" class="cm-link" data-xg="${s}">tutti</button></h5>
                  ${consG(s).map(v => { const key = 'v|' + v + (doppio(v) ? '|' + s : ''); return `<label><input type="checkbox" data-amb="${esc(key)}" ${ck(key)}> ${esc(v)}${doppio(v) ? (s === 'Noleggio' ? ' (noleggio)' : ' (vendita)') : ''}</label>`; }).join('') || '<small class="cm-hint">Nessuno</small>'}</div>`).join('')}
              </div></div>
            <div class="cm-exp-s"><h4>Contenuto <button type="button" class="cm-link" data-call>Tutto</button> <button type="button" class="cm-link" data-cnone>Nessuno</button></h4><div class="cm-exp-row">
              ${CONT.map(([k, t]) => `<label class="cm-exp-chk"><input type="checkbox" data-cont="${k}" ${(s0.cont || []).includes(k) ? 'checked' : ''}> ${t}</label>`).join('')}
            </div><p class="cm-hint" style="margin:8px 0 0">Solo quello che spunti finisce nel file o nella stampa: ad esempio solo "Preventivi telefonici".</p></div>
            <div class="cm-exp-s cm-exp-xls"><h4>Fogli in più (solo Excel)</h4><div class="cm-exp-row">
              <label class="cm-exp-chk"><input type="checkbox" id="cmXLista" ${s0.lista ? 'checked' : ''}> Elenco dettagliato dei contratti</label>
              <label class="cm-exp-chk"><input type="checkbox" id="cmXAnn" ${s0.ann ? 'checked' : ''}> Elenco dei contratti annullati</label>
              <label class="cm-exp-chk"><input type="checkbox" id="cmXPrev" ${s0.prev ? 'checked' : ''}> Elenco di tutte le trattative (preventivi)</label>
              <label class="cm-exp-chk"><input type="checkbox" id="cmXPtL" ${s0.ptL ? 'checked' : ''}> Elenco dei preventivi telefonici</label>
            </div></div>
            <div class="cm-exp-foot"><span class="cm-hint" id="cmXInfo"></span><button type="button" class="cm-chip" data-x>Annulla</button><button type="button" class="cm-btn-go" id="cmXGo">Esporta</button></div>
          </div>`, true);
        const $ = q => ov.querySelector(q);
        $('#cmXDa').value = s0.da; $('#cmXA').value = s0.a;
        const read = () => ({
            fmt: ov.querySelector('[name="cmFmt"]:checked').value, anno: +$('#cmXAnno').value, da: +$('#cmXDa').value, a: +$('#cmXA').value,
            b2b: $('#cmXB2b').checked, lista: $('#cmXLista').checked, ann: $('#cmXAnn').checked, prev: $('#cmXPrev').checked, ptL: $('#cmXPtL').checked,
            amb: [...ov.querySelectorAll('[data-amb]:checked')].map(i => i.dataset.amb),
            cont: [...ov.querySelectorAll('[data-cont]:checked')].map(i => i.dataset.cont)
        });
        // c'e' qualcosa da mettere nel report? (in Excel bastano anche i soli elenchi)
        const vuoto = s => !s.cont.length && !(s.fmt === 'xlsx' && (s.lista || s.ann || s.prev || s.ptL));
        const upd = () => { const s = read(); $('.cm-exp-xls').style.display = s.fmt === 'xlsx' ? '' : 'none';
            $('#cmXInfo').textContent = s.amb.length + (s.amb.length === 1 ? ' voce scelta' : ' voci scelte') + ' · ' + (s.cont.length === CONT.length ? 'tutto il contenuto' : s.cont.length ? s.cont.length + (s.cont.length === 1 ? ' argomento su ' : ' argomenti su ') + CONT.length : 'nessun argomento'); };
        ov.addEventListener('change', upd); upd();
        ov.addEventListener('click', e => {
            if (e.target.closest('#cmXGo')) return;   // non coprire il messaggio di "Esporta"
            if (e.target.closest('[data-xall]')) ov.querySelectorAll('[data-amb]').forEach(i => { i.checked = true; });
            if (e.target.closest('[data-xnone]')) ov.querySelectorAll('[data-amb]').forEach(i => { i.checked = false; });
            if (e.target.closest('[data-call]')) ov.querySelectorAll('[data-cont]').forEach(i => { i.checked = true; });
            if (e.target.closest('[data-cnone]')) ov.querySelectorAll('[data-cont]').forEach(i => { i.checked = false; });
            const g = e.target.closest('[data-xg]');
            if (g) { const box = g.closest('div'); const all = [...box.querySelectorAll('[data-amb]')]; const on = all.some(i => !i.checked); all.forEach(i => { i.checked = on; }); }
            upd();
        });
        $('#cmXGo').addEventListener('click', async () => {
            const s = read();
            if (!s.amb.length) { $('#cmXInfo').textContent = 'Scegli almeno una voce'; return; }
            if (vuoto(s)) { $('#cmXInfo').textContent = 'Scegli almeno un argomento in "Contenuto"'; return; }
            if (s.a < s.da) { const x = s.a; s.a = s.da; s.da = x; }
            expState = s;
            const btn = $('#cmXGo'); btn.disabled = true; btn.textContent = 'Preparo…';
            try { await esegui(s); ov.close(); }
            catch (e) { $('#cmXInfo').textContent = 'Errore: ' + e.message; }
            finally { btn.disabled = false; btn.textContent = 'Esporta'; }
        });
    }
    const ambVw = key => { const [k, x, y] = key.split('|'); return k === 'all' ? { k: 'all' } : k === 'sede' ? { k: 'sede', s: x } : k === 'b2b' ? { k: 'b2b' } : (y ? { k: 'v', v: x, s: y } : { k: 'v', v: x }); };
    // calcola con periodo e B2B scelti nella finestra, poi rimette quelli della pagina
    async function esegui(s) {
        const keep = { anno, da, a, b2bOn };
        anno = s.anno; da = s.da; a = s.a; b2bOn = s.b2b;
        let dati;
        try { dati = s.amb.map(ambVw).map(calc); }
        finally { anno = keep.anno; da = keep.da; a = keep.a; b2bOn = keep.b2bOn; }
        const meta = { per: MESIL[s.da] + (s.a !== s.da ? ' – ' + MESIL[s.a] : '') + ' ' + s.anno, b2b: s.b2b, s };
        if (s.fmt === 'xlsx') await excel(dati, meta); else pdf(dati, meta);
    }



    /* ================= Excel (costruito dal server con Apache POI) ================= */
    async function excel(D, M) {
        const T = (t, w) => ({ t, tipo: 'text', w: w || 24 }), I = (t, w) => ({ t, tipo: 'int', w: w || 12 }), Q = (t, w) => ({ t, tipo: 'pct', w: w || 11 });
        const r = (x, y) => y ? x / y : 0;
        const fogli = [];
        const has = k => !M.s.cont || M.s.cont.includes(k);
        if (has('riep')) fogli.push({ nome: 'Riepilogo', tabelle: [{ titolo: 'Riepilogo per voce', nota: 'Preventivi = trattative create nel periodo (data trattativa). Contratti = trattative chiuse nel periodo (data chiusura), comprese quelle aperte in mesi precedenti' + (recOn ? ' e quelle recuperate dal CSV delle Consegne' : '') + '. Conversione = contratti / preventivi. Pagamento e servizi: dalla riga del foglio AVANZAMENTO.',
            colonne: [T('Voce', 30), I('Preventivi'), I('Contratti'), Q('Conversione', 12), I('Annullati'), Q('% annullati', 11), I('In corso'), I('Fallite'), I('di cui B2B'), I('Usato'), I('Km0'), I('Nuovo'), Q('% finanziati', 12), I('Prev. telefonici', 13), I('Da prev. tel.', 12), Q('Conv. prev. tel.', 13), I('Contr. da mesi prec.', 14), I('di cui recuperati', 13)],
            righe: D.map(d => [lab(d.vw), d.P, d.Cn, r(d.Cn, d.P), d.A, r(d.A, d.Cn), d.IN.length, d.F.length, d.B2B,
                (d.tip.find(x => x.k === 'Usato') || { c: 0 }).c, (d.tip.find(x => x.k === 'Km0') || { c: 0 }).c, (d.tip.find(x => x.k === 'Nuovo') || { c: 0 }).c,
                r(d.FIN, d.CFn), d.isB ? '' : d.X.length, d.isB ? '' : d.TEL, d.isB ? '' : r(d.ptCh, d.X.length), d.PRIMA, d.REC]) }] });
        const mh = D[0].ms.map(m => I(MESI[m].charAt(0).toUpperCase() + MESI[m].slice(1), 8));
        const mens = (titolo, key, tot) => ({ titolo, colonne: [T('Voce', 30)].concat(mh, I('Totale', 10)), righe: D.map(d => [lab(d.vw)].concat(d[key], tot(d))) });
        if (has('mens')) fogli.push({ nome: 'Andamento mensile', tabelle: [mens('Preventivi per mese', 'pv', d => d.P), mens('Contratti per mese', 'cv', d => d.Cn), mens('Annullati per mese', 'av', d => d.A), mens('Trattative fallite per mese', 'fv', d => d.F.length)]
            .concat(has('pt') && D.some(d => !d.isB) ? [{ titolo: 'Preventivi telefonici per mese', colonne: [T('Voce', 30)].concat(mh, I('Totale', 10)), righe: D.filter(d => !d.isB).map(d => [lab(d.vw)].concat(d.ptv, d.X.length)) }] : []) });
        // origini: per ogni voce preventivi, contratti, conversione
        const oriK = [...new Set(D.flatMap(d => d.ori.map(o => o.k)))];
        const sumO = k => D.reduce((s, d) => s + (d.ori.find(o => o.k === k) || { c: 0 }).c, 0);
        oriK.sort((x, y) => sumO(y) - sumO(x));
        const og = (d, k) => d.ori.find(o => o.k === k) || { p: 0, c: 0 };
        if (has('ori')) fogli.push({ nome: 'Origini', tabelle: [
            { titolo: 'Contratti per origine', nota: ORIG_NOTE.map(([k, v]) => k + ' = ' + v).join(' · '), colonne: [T('Voce', 30)].concat(oriK.map(k => I(k, 14)), I('Totale', 10)), righe: D.map(d => [lab(d.vw)].concat(oriK.map(k => og(d, k).c), d.Cn)) },
            { titolo: 'Preventivi per origine', colonne: [T('Voce', 30)].concat(oriK.map(k => I(k, 14)), I('Totale', 10)), righe: D.map(d => [lab(d.vw)].concat(oriK.map(k => og(d, k).p), d.P)) },
            { titolo: 'Conversione per origine (contratti / preventivi)', colonne: [T('Voce', 30)].concat(oriK.map(k => Q(k, 14)), Q('Totale', 10)), righe: D.map(d => [lab(d.vw)].concat(oriK.map(k => r(og(d, k).c, og(d, k).p)), r(d.Cn, d.P))) }] });
        // origini per consulente (contratti)
        const consSel = new Set();
        D.forEach(d => { if (d.vw.k === 'v' || (d.vw.k === 'b2b' && d.vw.v)) consSel.add(d.vw.v); else d.cons.forEach(c => consSel.add(c.k)); });
        const uniTR = new Map(); D.forEach(d => d.R.forEach(x => uniTR.set(x.i, x)));   // preventivi
        const uniC = new Map(); D.forEach(d => d.C.forEach(x => uniC.set(x.i, x)));      // contratti
        const RC = [...uniTR.values()].filter(x => consSel.has(x.vend)), VC = [...uniC.values()].filter(x => consSel.has(x.vend));
        const oriC = [...new Set(VC.map(c => c.origine))].sort((x, y) => VC.filter(c => c.origine === y).length - VC.filter(c => c.origine === x).length);
        const pRC = by(RC, c => c.vend), cRC = by(VC, c => c.vend);
        const rowsC = [...new Set([...pRC.keys(), ...cRC.keys()])].map(v => { const l = pRC.get(v) || [], c = cRC.get(v) || []; return [v, sedeLab(v), l.length, c.length, r(c.length, l.length)].concat(oriC.map(k => c.filter(x => x.origine === k).length), c.filter(x => x.tel).length); }).sort((x, y) => y[3] - x[3]);
        if (has('cons')) fogli.push({ nome: 'Consulenti', tabelle: [{ titolo: 'Consulenti: preventivi, contratti e origini dei contratti', colonne: [T('Consulente', 24), T('Sede', 28), I('Preventivi'), I('Contratti'), Q('Conversione', 12)].concat(oriC.map(k => I(k, 14)), I('di cui da prev. tel.', 14)),
            righe: rowsC, totale: rowsC.length ? ['Totale', '', RC.length, VC.length, r(VC.length, RC.length)].concat(oriC.map(k => VC.filter(c => c.origine === k).length), VC.filter(c => c.tel).length) : null }] });
        // tipologia e pagamento
        const tg = (d, k) => d.tip.find(x => x.k === k) || { p: 0, c: 0 };
        if (has('tip')) fogli.push({ nome: 'Tipologia e pagamento', tabelle: [
            { titolo: 'Tipologia veicolo', colonne: [T('Voce', 30)].concat(['Usato', 'Km0', 'Nuovo'].flatMap(k => [I(k + ' prev.', 11), I(k + ' contr.', 11), Q(k + ' conv.', 11)])),
              righe: D.map(d => [lab(d.vw)].concat(['Usato', 'Km0', 'Nuovo'].flatMap(k => [tg(d, k).p, tg(d, k).c, r(tg(d, k).c, tg(d, k).p)]))) },
            { titolo: 'Pagamento dei contratti (foglio AVANZAMENTO)', colonne: [T('Voce', 30), I('Finanziamento', 14), I('PC (contanti)', 14), I('Non indicato', 13), Q('% finanziati', 12)], righe: D.map(d => [lab(d.vw), d.FIN, d.PC, d.NI, r(d.FIN, d.CFn)]) }] });
        // performance marchi (tutte le voci scelte insieme)
        const RM = [...uniTR.values()];
        const uniA = new Map(); D.forEach(d => d.ANN.forEach(x => uniA.set(x.i, x)));
        const ANNx = [...uniA.values()];
        const RMc = [...uniC.values()], pRM = by(RM, x => x.marca), cRM = by(RMc, x => x.marca);
        const mk = [...new Set([...pRM.keys(), ...cRM.keys()])].map(k => { const l = pRM.get(k) || [], c = cRM.get(k) || []; return [k, l.length, c.length, r(c.length, l.length), ANNx.filter(x => x.marca === k).length, l.filter(x => x.stato === 'In corso').length, l.filter(isF).length, c.filter(x => x.tipo === 'Usato').length, c.filter(x => x.tipo === 'Km0').length, c.filter(x => x.tipo === 'Nuovo').length]; }).sort((x, y) => y[2] - x[2] || y[1] - x[1]);
        if (has('marche')) fogli.push({ nome: 'Performance marchi', tabelle: [{ titolo: 'Performance per marca (tutte le voci scelte)', colonne: [T('Marca', 20), I('Preventivi'), I('Contratti'), Q('Conversione', 12), I('Annullati'), I('In corso'), I('Fallite'), I('Usato'), I('Km0'), I('Nuovo')],
            righe: mk, totale: ['Totale', RM.length, RMc.length, r(RMc.length, RM.length), ANNx.length, RM.filter(x => x.stato === 'In corso').length, RM.filter(isF).length, RMc.filter(x => x.tipo === 'Usato').length, RMc.filter(x => x.tipo === 'Km0').length, RMc.filter(x => x.tipo === 'Nuovo').length] }] });
        // motivi di fallimento
        const motK = [...new Set(D.flatMap(d => d.motivi.map(m => m.k)))];
        if (has('fall')) fogli.push({ nome: 'Trattative fallite', tabelle: [{ titolo: 'Motivi di fallimento', colonne: [T('Voce', 30)].concat(motK.map(k => I(k, 16)), I('Totale', 10)), righe: D.map(d => [lab(d.vw)].concat(motK.map(k => (d.motivi.find(m => m.k === k) || { n: 0 }).n), d.F.length)) }] });
        // servizi
        if (has('serv')) fogli.push({ nome: 'Servizi', tabelle: [{ titolo: 'Servizi sui contratti (righe del foglio AVANZAMENTO)', colonne: [T('Voce', 30), I('Contratti del foglio', 14)].concat(SERVIZI.flatMap(k => [I(k, 13), Q('%', 9)])),
            righe: D.map(d => [lab(d.vw), d.SV].concat(d.serv.flatMap(x => [x.n, r(x.n, d.SV)]))) }] });
        const DP = D.filter(d => !d.isB);
        // preventivi telefonici di tutte le voci scelte, senza doppioni
        const uniPT = new Map(); DP.forEach(d => d.X.forEach(p => uniPT.set(p.id, p)));
        const PTx = [...uniPT.values()];
        const ptPer = key => { const g = by(PTx, key); return [...g].map(([k, l]) => [k, l.length].concat(ST.map(s => l.filter(p => p.st === s).length), l.filter(p => p.contr).length, r(l.filter(p => p.contr).length, l.length))).sort((x, y) => y[1] - x[1]); };
        const ptCol = first => [T(first, 26), I('Preventivi')].concat(ST.map(s => I(STL[s], 15)), I('Diventati contratto', 15), Q('Conversione', 12));
        const ptTot = () => ['Totale', PTx.length].concat(ST.map(s => PTx.filter(p => p.st === s).length), PTx.filter(p => p.contr).length, r(PTx.filter(p => p.contr).length, PTx.length));
        if (has('pt') && DP.length) fogli.push({ nome: 'Preventivi telefonici', tabelle: [{ titolo: 'Preventivi telefonici (sezione In bound)', nota: 'Diventati contratto = preventivo abbinato a un contratto (stesso cliente o stessa targa/telaio, contratto firmato dopo il preventivo)',
            colonne: [T('Voce', 30), I('Preventivi')].concat(ST.map(s => I(STL[s], 15)), I('Diventati contratto', 15), Q('Conversione', 12)),
            righe: DP.map(d => [lab(d.vw), d.X.length].concat(d.esiti.map(e => e.n), d.ptCh, r(d.ptCh, d.X.length))) },
            { titolo: 'Preventivi telefonici per mese', colonne: [T('Voce', 30)].concat(mh, I('Totale', 10)), righe: DP.map(d => [lab(d.vw)].concat(d.ptv, d.X.length)) },
            { titolo: 'Per consulente (tutte le voci scelte)', colonne: ptCol('Consulente'), righe: ptPer(p => p.vend), totale: PTx.length ? ptTot() : null },
            { titolo: 'Per operatore che ha inserito il preventivo', colonne: ptCol('Operatore'), righe: ptPer(p => p.op), totale: PTx.length ? ptTot() : null }] });
        // elenchi
        const riga = c => [dd(c.data), c.cliente, c.vend, SEDI[c.sede], c.veicolo, c.tipo, c.origine, esito(c), c.motivo || '', c.b2b ? 'Sì' : '', c.pag || '',
            c.serv ? (c.serv['Blockshaft'] ? 'Sì' : '') : '', c.serv ? (c.serv['Lojack'] ? 'Sì' : '') : '', c.serv ? (c.serv['FIR'] ? 'Sì' : '') : '', c.serv ? (c.serv['Garanzia Mawdy'] ? 'Sì' : '') : '', c.serv ? (c.serv['Pack manutenzione'] ? 'Sì' : '') : '',
            c.tel ? dd(c.tel.data) : '', isC(c) ? (c.foglio ? 'Sì' : 'No') : '', c.dataT ? dd(c.dataT) : '', provC(c)];
        const colL = [T('Data', 11), T('Cliente', 28), T('Consulente', 22), T('Sede', 28), T('Veicolo', 34), T('Tipo', 10), T('Origine', 22), T('Esito', 12), T('Motivo fallimento', 24), T('B2B', 6), T('Pagamento', 14), T('Blockshaft', 10), T('Lojack', 8), T('FIR', 6), T('Garanzia Mawdy', 10), T('Pack manut.', 10), T('Prev. telefonico del', 13), T('Nel foglio', 9), T('Data trattativa', 13), T('Provenienza contratto', 26)];
        const tutti = [...uniTR.values()].sort(sortD);
        if (M.s.ann) fogli.push({ nome: 'Annullati', tabelle: [{ titolo: 'Contratti annullati', colonne: colL, righe: ANNx.slice().sort(sortD).map(riga) }] });
        if (M.s.lista) fogli.push({ nome: 'Contratti', tabelle: [{ titolo: 'Elenco dei contratti (chiusi nel periodo)', colonne: colL, righe: [...uniC.values()].sort(sortD).map(riga) }] });
        if (M.s.prev) fogli.push({ nome: 'Preventivi', tabelle: [{ titolo: 'Elenco di tutte le trattative (preventivi)', colonne: colL, righe: tutti.map(riga) }] });
        if (M.s.ptL && DP.length) fogli.push({ nome: 'Elenco prev. telefonici', tabelle: [{ titolo: 'Elenco dei preventivi telefonici (sezione In bound)',
            colonne: [T('Data', 11), T('Cliente', 28), T('Tipo', 10), T('Marca', 16), T('Modello', 22), T('Consulente', 22), T('Sede', 28), T('Operatore', 22), T('Esito', 22), T('Diventato contratto il', 16)],
            righe: PTx.slice().sort(sortD).map(p => [dd(p.data), p.cliente, p.tipo, p.marca || '', p.modello || '', p.vend, SEDI[p.sede] || '', p.op, STL[p.st], p.contr ? dd(p.contr.data) : '']) }] });
        if (!fogli.length) throw new Error('Con le scelte fatte non c\'è nulla da esportare');
        const amb = D.length === 1 ? lab(D[0].vw) : D.length + ' voci';
        const body = { titolo: 'Report commerciale' + (D.length === 1 ? ' · ' + lab(D[0].vw) : ''), sottotitolo: `Periodo ${M.per} · ${amb} · B2B ${M.b2b ? 'incluso' : 'escluso'} · Gruppo Autoscala`,
            file: `commerciale_${M.s.anno}_${String(M.s.da).padStart(2, '0')}-${String(M.s.a).padStart(2, '0')}${D.length === 1 ? '_' + lab(D[0].vw).replace(/[^A-Za-z0-9]+/g, '_') : ''}.xlsx`, fogli };
        const res = await fetch('/api/commerciale/export/excel', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) { let m = 'Errore ' + res.status; try { m = (await res.json()).error || m; } catch (e) { /* */ } throw new Error(m); }
        const blob = await res.blob(), url = URL.createObjectURL(blob), aEl = document.createElement('a');
        aEl.href = url; aEl.download = body.file; document.body.appendChild(aEl); aEl.click(); aEl.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    /* ================= PDF: report impaginato e stampa ================= */
    const PAL = { c1: '#0f5662', c2: '#9fcbd2', ink: '#16262a', ink2: '#5f7479', line: '#dbe6e8', soft: '#dfeef0' };
    function svgBars(labels, sets, W, H) {
        W = W || 520; H = H || 210;
        const pad = { l: 30, r: 8, t: 18, b: 22 }, max = Math.max(1, ...sets.flatMap(s => s.data)), step = Math.pow(10, Math.floor(Math.log10(max))) * (max / Math.pow(10, Math.floor(Math.log10(max))) > 5 ? 2 : 1);
        const top = Math.ceil(max / step) * step || 1, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, gw = iw / labels.length, bw = Math.min(18, (gw - 8) / sets.length);
        let s = '';
        for (let v = 0; v <= top; v += step) { const y = pad.t + ih - v / top * ih; s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="${PAL.line}"/><text x="${pad.l - 5}" y="${y + 3}" font-size="8" text-anchor="end" fill="${PAL.ink2}">${v}</text>`; }
        labels.forEach((lb, i) => {
            const x0 = pad.l + i * gw + (gw - bw * sets.length) / 2;
            sets.forEach((st, j) => { const v = st.data[i] || 0, h = v / top * ih, x = x0 + j * bw, y = pad.t + ih - h;
                s += `<rect x="${x + 1}" y="${y}" width="${bw - 2}" height="${h}" rx="2" fill="${st.color}"/>` + (v ? `<text x="${x + bw / 2}" y="${y - 3}" font-size="8" font-weight="700" text-anchor="middle" fill="${PAL.ink}">${v}</text>` : ''); });
            s += `<text x="${pad.l + i * gw + gw / 2}" y="${H - 6}" font-size="8.5" text-anchor="middle" fill="${PAL.ink2}">${lb}</text>`;
        });
        return `<svg viewBox="0 0 ${W} ${H}" width="100%">${s}</svg>`;
    }
    function svgDonut(parts, label) {
        const tot = parts.reduce((x, p) => x + p.n, 0) || 1; let a0 = -Math.PI / 2, s = '';
        parts.forEach(p => { if (!p.n) return; const a1 = a0 + p.n / tot * Math.PI * 2, big = a1 - a0 > Math.PI ? 1 : 0;
            const P = (a, r) => [60 + r * Math.cos(a), 60 + r * Math.sin(a)];
            const [x1, y1] = P(a0, 52), [x2, y2] = P(a1, 52), [x3, y3] = P(a1, 34), [x4, y4] = P(a0, 34);
            s += p.n === tot ? `<circle cx="60" cy="60" r="43" fill="none" stroke="${p.c}" stroke-width="18"/>` : `<path d="M${x1} ${y1} A52 52 0 ${big} 1 ${x2} ${y2} L${x3} ${y3} A34 34 0 ${big} 0 ${x4} ${y4} Z" fill="${p.c}"/>`; a0 = a1; });
        return `<svg viewBox="0 0 120 120" width="120" height="120">${s}<text x="60" y="60" text-anchor="middle" font-size="18" font-weight="800" fill="${PAL.ink}">${tot === 1 && !parts.some(p => p.n) ? 0 : parts.reduce((x, p) => x + p.n, 0)}</text><text x="60" y="74" text-anchor="middle" font-size="8" fill="${PAL.ink2}">${label}</text></svg>`;
    }
    const pHb = rows => { const mx = Math.max(1, ...rows.map(r => r.n)); return rows.map(r => `<div class="hb"><span>${esc(r.k)}</span><i><b style="width:${r.n / mx * 100}%"></b></i><em>${r.n}</em></div>`).join(''); };
    const pTab = (head, rows, tot) => `<table><tr>${head.map((h, i) => `<th${i ? '' : ' class="l"'}>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map((v, i) => `<td${i ? '' : ' class="l"'}>${v}</td>`).join('')}</tr>`).join('')}${tot ? `<tr class="tot">${tot.map((v, i) => `<td${i ? '' : ' class="l"'}>${v}</td>`).join('')}</tr>` : ''}</table>`;
    function pdfSection(d, M) {
        const tit = d.vw.k === 'v' ? 'Report venditore: ' + d.vw.v : d.vw.k === 'all' ? 'Report commerciale: Panoramica' : d.vw.k === 'b2b' ? 'Report B2B' + (d.vw.v ? ': ' + d.vw.v : '') : d.vw.s === 'Noleggio' ? 'Report Noleggio' : 'Report sede: ' + SEDI[d.vw.s];
        const sub = (d.vw.k === 'v' ? sedeLab(d.vw.v, d.vw.s) : 'Gruppo Autoscala') + ' · periodo ' + M.per + (d.isB ? '' : ' · B2B ' + (M.b2b ? 'incluso' : 'escluso'));
        const nm = d.ms.length, iMax = d.pv.indexOf(Math.max(...d.pv)), nz = d.pv.filter(x => x > 0), iMin = d.pv.indexOf(nz.length ? Math.min(...nz) : 0);
        const tipP = [...d.tip].sort((x, y) => y.p - x.p)[0], oriP = [...d.ori].sort((x, y) => y.p - x.p);
        const convBest = d.ori.filter(o => o.c >= 3 && o !== oriP[0]).sort((x, y) => y.c / y.p - x.c / x.p).slice(0, 2);
        const kp = (l, v, s) => `<div class="kpi"><small>${l}</small><b>${v}</b><span>${s}</span></div>`;
        const ct = (head, list, extra) => pTab([head, 'Preventivi', 'Contratti', 'Conv.'].concat(extra ? ['di cui 📞'] : []),
            list.map(o => [esc(o.k), nf(o.p), o.c || '–', o.c ? pct(o.c, o.p) : '–'].concat(extra ? [o.tel || '–'] : [])), ['Totale', nf(d.P), nf(d.Cn), pct(d.Cn, d.P)].concat(extra ? [d.TEL] : []));
        // NUOVO: ogni argomento e' un blocco a se', e si stampa solo se scelto in "Contenuto"
        const has = k => !M.s.cont || M.s.cont.includes(k);
        const blocchi = [];   // { t: titolo, cards: [...], g2: true se le card vanno affiancate }
        const blocco = (t, cards, g2) => { cards = cards.filter(Boolean); if (cards.length) blocchi.push({ t, cards, g2: g2 !== false }); };
        const cAnd = `<div class="card"><h3>Andamento mensile</h3><p class="h">${d.P ? `Picco di preventivi a ${MESIL[d.ms[iMax]]} (${d.pv[iMax]}), calo a ${MESIL[d.ms[iMin]]} (${d.pv[iMin]})` : 'Nessuna trattativa nel periodo'}</p>
              <div class="leg"><i style="background:${PAL.c2}"></i>Preventivi <i style="background:${PAL.c1}"></i>Contratti</div>${svgBars(d.ms.map(m => MESI[m]), [{ data: d.pv, color: PAL.c2 }, { data: d.cv, color: PAL.c1 }])}</div>`;
        const cTip = `<div class="card"><h3>Tipologia veicolo</h3><p class="h">${tipP && d.P ? `${tipP.k === 'Usato' ? "L'usato" : tipP.k === 'Km0' ? 'Il Km0' : tipP.k === 'Nuovo' ? 'Il nuovo' : tipP.k} vale il ${pct(tipP.p, d.P)} dei preventivi` : ''}</p>
              ${ct('Tipologia', d.tip)}
              <h3 style="margin-top:12px">Pagamento</h3><p class="h">Contratti per modalità</p><div class="don">${svgDonut([{ n: d.FIN, c: PAL.c1 }, { n: d.PC, c: PAL.c2 }, { n: d.NI, c: '#cfdadc' }], 'contratti')}
              <ul><li><i style="background:${PAL.c1}"></i><b>Finanziamento</b> ${d.FIN} · ${pct(d.FIN, d.Cn)}</li><li><i style="background:${PAL.c2}"></i><b>PC</b> ${d.PC} · ${pct(d.PC, d.Cn)}</li>${d.NI ? `<li><i style="background:#cfdadc"></i><b>Non indicato</b> ${d.NI} · ${pct(d.NI, d.Cn)}</li>` : ''}</ul></div></div>`;
        blocco(has('mens') && has('tip') ? 'Andamento e tipologia' : has('mens') ? 'Andamento mensile' : 'Tipologia e pagamento', [has('mens') && cAnd, has('tip') && cTip]);
        if (has('ori')) blocco('Canali', [`<div class="card"><h3>Contratti per origine</h3><p class="h">${d.ori[0] ? `${esc(d.ori[0].k)} porta il ${pct(d.ori[0].c, d.Cn)} dei contratti` : ''}</p>${pHb(d.ori.filter(o => o.c).map(o => ({ k: o.k, n: o.c })))}</div>`,
            `<div class="card"><h3>Preventivi e contratti per fonte</h3><p class="h">${oriP[0] ? `${esc(oriP[0].k)} genera il ${pct(oriP[0].p, d.P)} dei preventivi` : ''}${convBest.length ? `; ${convBest.map(x => esc(x.k)).join(' e ')} convertono meglio` : ''}</p>
              ${ct('Fonte', oriP, !d.isB)}</div>`]);
        blocco(has('marche') && has('fall') ? 'Marche e trattative fallite' : has('marche') ? 'Performance marchi' : 'Trattative fallite', [
            has('marche') && `<div class="card"><h3>Performance marchi</h3><p class="h">Tutte le marche, per contratti</p>${ct('Marca', d.marche)}</div>`,
            has('fall') && `<div class="card"><h3>Motivi di fallimento</h3><p class="h">${d.F.length} trattative fallite (${pct(d.F.length, d.P)} dei preventivi)</p>${pHb(d.motivi)}</div>`]);
        if (has('pt') && !d.isB) {
            const ptRighe = key => [...by(d.X, key)].map(([k, l]) => ({ k, n: l.length, c: l.filter(p => p.contr).length })).sort((x, y) => y.n - x.n);
            const ptT = (head, rows) => pTab([head, 'Preventivi', 'Diventati contratto', 'Conv.'], rows.map(x => [esc(x.k), x.n, x.c || '–', pct(x.c, x.n)]), ['Totale', d.X.length, d.ptCh, pct(d.ptCh, d.X.length)]);
            blocco('Preventivi telefonici', [`<div class="card"><h3>Preventivi telefonici per mese</h3><p class="h">Sezione In bound · ${d.X.length} preventivi, ${d.ptCh} diventati contratto (${pct(d.ptCh, d.X.length)})</p>
              <div class="leg"><i style="background:${PAL.c2}"></i>Preventivi <i style="background:#2f9e6e"></i>Diventati contratto</div>${svgBars(d.ms.map(m => MESI[m]), [{ data: d.ptv, color: PAL.c2 }, { data: d.ptc, color: '#2f9e6e' }])}</div>`,
                `<div class="card"><h3>Esito</h3><p class="h">Stato attuale di ogni preventivo</p>${pTab(['Stato', 'Preventivi', '%'], d.esiti.map(e => [STL[e.s], e.n, pct(e.n, d.X.length)]), ['Totale', d.X.length, d.X.length ? '100%' : '–'])}</div>`,
                d.vw.k !== 'v' && d.X.length ? `<div class="card"><h3>Per consulente</h3><p class="h">Preventivi assegnati a ogni consulente</p>${ptT('Consulente', ptRighe(p => p.vend))}</div>` : '',
                d.X.length ? `<div class="card"><h3>Per operatore</h3><p class="h">Chi ha inserito il preventivo</p>${ptT('Operatore', ptRighe(p => p.op))}</div>` : '']);
        }
        if (has('cons') && d.group && d.cons.length) {
            const Mx = origMatrix(d.C);
            blocco('Consulenti', [`<div class="card"><h3>Classifica consulenti</h3>${pTab(['Consulente', 'Sede', 'Preventivi', 'Contratti', 'Conv.', 'Annullati', 'Fallite'].concat(d.isB ? [] : ['Prev. tel.', 'Da prev. tel.']).concat(['Finanziati']),
                d.cons.map(c => [esc(c.k), c.sede, nf(c.p), c.n, pct(c.n, c.p), c.ann || '–', c.f || '–'].concat(d.isB ? [] : [c.pt || '–', c.tel || '–']).concat([pct(c.fin, c.cf)])),
                ['Totale', '', nf(d.P), d.Cn, pct(d.Cn, d.P), d.A, d.F.length].concat(d.isB ? [] : [d.X.length, d.TEL]).concat([pct(d.FIN, d.CFn)]))}</div>`,
              `<div class="card"><h3>Origini per consulente</h3>${pTab(['Consulente'].concat(Mx.cols.map(esc), ['Totale']), Mx.rows.map(r => [esc(r.v)].concat(Mx.cols.map(c => r.m[c] || '–'), [r.n])), ['Totale'].concat(Mx.cols.map(c => Mx.tot[c] || 0), [d.Cn]))}</div>`], false);
        }
        if (has('serv')) blocco('Servizi sui contratti', [`<div class="card"><h3>Servizi e accessori</h3><p class="h">Numero di contratti con il servizio</p>${pHb(d.serv.slice().sort((x, y) => y.n - x.n))}</div>`,
            `<div class="card"><h3>Incidenza sui ${d.SV} contratti del foglio</h3><p class="h">Quota di contratti con il servizio</p>${pTab(['Servizio', 'Contratti', 'Incidenza'], d.serv.slice().sort((x, y) => y.n - x.n).map(x => [x.k, x.n, pct(x.n, d.SV)]), ['Contratti del foglio', d.SV, ''])}</div>`]);
        // niente da stampare per questa voce (es. solo preventivi telefonici su una voce B2B): pagina saltata
        if (!has('riep') && !blocchi.length) return '';
        const soloPt = M.s.cont && M.s.cont.length === 1 && M.s.cont[0] === 'pt';
        let h = `<section class="amb"><header><h1>${esc(soloPt ? 'Preventivi telefonici · ' + lab(d.vw) : tit)}</h1><p>${esc(sub)}</p></header>`;
        if (has('riep')) h += `<div class="kpis">
            ${kp('Preventivi', nf(d.P), 'media ' + (d.P / nm).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' al mese')}
            ${kp('Contratti', nf(d.Cn), 'media ' + (d.Cn / nm).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' al mese' + (d.PRIMA ? ' · ' + d.PRIMA + ' da trattative di mesi precedenti' : ''))}
            ${kp('Conversione', pct(d.Cn, d.P), 'contratti / preventivi')}
            ${kp('Contratti annullati', nf(d.A), 'stato annullata')}
            ${d.isB ? kp('Trattative fallite', nf(d.F.length), pct(d.F.length, d.P) + ' dei preventivi') : kp('Preventivi telefonici', nf(d.X.length), d.ptCh + ' diventati contratto')}
          </div>`;
        h += blocchi.map(x => `<div class="blk"><h2>${x.t}</h2>${x.g2 && x.cards.length > 1 ? `<div class="g2">${x.cards.join('')}</div>` : x.cards.join('')}</div>`).join('');
        h += `<footer>Gruppo Autoscala · BI Commerciale · fonti: CSV trattative, foglio AVANZAMENTO, preventivi telefonici · generato il ${new Date().toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</footer>`;
        return h + '</section>';
    }
    function pdf(D, M) {
        const title = D.length === 1 ? (D[0].vw.k === 'v' ? 'Report venditore – ' + D[0].vw.v : 'Report commerciale – ' + lab(D[0].vw)) : 'Report commerciale – ' + M.per;
        const css = `@page{size:A4;margin:11mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          body{margin:0;font-family:Inter,'Segoe UI',Arial,sans-serif;color:${PAL.ink};font-size:10.5px}
          .amb{page-break-after:always}.amb:last-child{page-break-after:auto}
          header{border-left:5px solid ${PAL.c1};padding:2px 0 2px 12px;margin-bottom:12px}header h1{margin:0;font-size:21px}header p{margin:3px 0 0;color:${PAL.ink2}}
          h2{font-size:13px;margin:14px 0 7px;color:${PAL.ink}}h3{font-size:11.5px;margin:0}
          .h{margin:2px 0 8px;color:${PAL.ink2};font-size:9.5px}
          .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}
          .kpi{border:1px solid ${PAL.line};border-top:3px solid ${PAL.c1};border-radius:8px;padding:8px 9px}.kpi small{display:block;color:${PAL.ink2};font-size:9px}.kpi b{display:block;font-size:20px;margin:3px 0}.kpi span{color:${PAL.ink2};font-size:8.5px}
          .g2{display:grid;grid-template-columns:1fr 1fr;gap:9px}
          .card{border:1px solid ${PAL.line};border-radius:9px;padding:10px;break-inside:avoid;margin-bottom:9px}.blk{break-inside:avoid;page-break-inside:avoid}
          table{width:100%;border-collapse:collapse;font-size:9.5px}th{background:${PAL.c1};color:#fff;text-align:right;padding:5px 6px;font-size:8.5px;text-transform:uppercase}th.l,td.l{text-align:left}
          td{padding:4.5px 6px;text-align:right;border-bottom:1px solid ${PAL.line}}td.l{font-weight:700}tr.tot td{background:${PAL.soft};font-weight:800;border-bottom:0}
          .hb{display:grid;grid-template-columns:120px 1fr 30px;gap:6px;align-items:center;margin:4px 0;font-size:9.5px}.hb span{font-weight:700;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.hb i{height:8px;background:#ecf2f3;border-radius:4px;overflow:hidden}.hb b{display:block;height:100%;background:${PAL.c1}}.hb em{font-style:normal;font-weight:800;text-align:right}
          .leg{font-size:9px;color:${PAL.ink2};margin-bottom:2px}.leg i{display:inline-block;width:8px;height:8px;border-radius:2px;margin:0 4px 0 8px}
          .don{display:flex;align-items:center;gap:12px}.don ul{list-style:none;margin:0;padding:0}.don li{margin:4px 0}.don li i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px}
          footer{margin-top:8px;color:${PAL.ink2};font-size:8px;border-top:1px solid ${PAL.line};padding-top:5px}`;
        const pagine = D.map(d => pdfSection(d, M)).join('');
        if (!pagine) throw new Error('Con le scelte fatte non c\'è nulla da stampare (i preventivi telefonici non valgono per il B2B)');
        const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${pagine}</body></html>`;
        const fr = document.createElement('iframe');
        fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
        document.body.appendChild(fr);
        const doc = fr.contentWindow.document; doc.open(); doc.write(html); doc.close();
        const go = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } finally { setTimeout(() => fr.remove(), 60000); } };
        setTimeout(go, 350);
    }


    /* ================= avvio ================= */
    // Barra in alto del CRM color ottanio mentre e' aperto il Commerciale:
    // <html data-bi="commerciale"> finche' la pagina e' visibile (stili in commerciale.css)
    let barObs = null;
    function seguiBarra() {
        const page = document.getElementById('commercialePage');
        if (!page || barObs) return;
        const agg = () => {
            const vis = page.style.display !== 'none' && getComputedStyle(page).display !== 'none';
            if (vis) document.documentElement.setAttribute('data-bi', 'commerciale');
            else if (document.documentElement.getAttribute('data-bi') === 'commerciale') document.documentElement.removeAttribute('data-bi');
        };
        barObs = new MutationObserver(agg);
        barObs.observe(page, { attributes: true, attributeFilter: ['style', 'class'] });
        agg();
    }
    function init() {
        rootEl = document.getElementById('commercialeRoot');
        if (!rootEl) return;
        seguiBarra();
        if (!rootEl.dataset.ready) { shell(); rootEl.dataset.ready = '1'; }
        selects(); shellSrc();
        load(true);
    }
    // cambio tema: i grafici si ridisegnano con i colori nuovi
    new MutationObserver(() => {
        if (!rootEl || !rootEl.offsetParent || !loaded) return;
        requestAnimationFrame(render);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // link precisi dalla pagina BI (bi-home.js): apre il Commerciale direttamente su una vista
    // ({k:'all'} panoramica, {k:'sede',s:'Agnano'}, {k:'b2b'}, {k:'marche'}, {k:'pt'}, {k:'ann'}, {k:'list'})
    function vista(vw) { view = vw || { k: 'all' }; }
    window.CommercialeBI = { init, vista };
})();
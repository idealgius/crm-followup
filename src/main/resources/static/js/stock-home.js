/* =====================================================================
   AREA STOCK — capitolo 02 della BI
   ---------------------------------------------------------------------
   Il file Excel dello stock viene letto QUI nel browser (libreria XLSX già
   caricata in index.html), normalizzato con le regole concordate e inviato
   come JSON a POST /api/stock/import, che sostituisce l'import precedente:
   tutti vedono sempre l'ultimo caricamento (stesso schema di Consegne).

   Regole di normalizzazione
     Stato     FREE / DISPONIBILE -> Disponibile · RESERVED -> Prenotata
               CONTRATTUALIZZATA -> Venduta
     Tipo      NEW / NUOVO -> Nuova · USED -> Usata · KM 0 -> Km 0
               non specificato: km > 0 -> Usata, altrimenti Km 0
     Km        per Nuova e Km 0 con valore 0 non si scrivono
     Categoria "Commerciale" -> "Per Commercianti", vettura -> vuoto
     Fornitore N.D -> "Non specificato"
     Marchi    varianti unite (DR AUTOMOBILES -> DR, Citro?n -> Citroën, ...)
     Targa     righe doppie: si tiene quella con più dati
     Vuoto     dove il file è vuoto non si scrive nulla
   ===================================================================== */
(function () {
    const API = '/api/stock';

    let rootEl = null;
    let meta = null;      // risposta del server (ultimo import, permessi)
    let rows = [];        // vetture normalizzate
    let charts = [];
    let ov = null;        // modale elenco / scheda
    let view = { base: [], title: '', f: {}, stato: '', tipo: '', q: '', hasMarca: false };

    /* ================= utilità ================= */
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const fmt = n => Number(n || 0).toLocaleString('it-IT');
    const eur = n => (n === null || n === undefined || n === '') ? '' : Number(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
    const when = iso => iso ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const fmtDay = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); };
    const vede = key => typeof canSeeChart !== 'function' || canSeeChart(key);
    const norm = s => String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cmp = (a, b) => String(a || '').localeCompare(String(b || ''), 'it', { sensitivity: 'base', numeric: true });

    async function api(path, opts = {}) {
        const res = await fetch(API + path, { credentials: 'same-origin', ...opts });
        let data = null;
        try { data = await res.json(); } catch (e) { /* risposta vuota */ }
        if (!res.ok) throw new Error((data && data.error) || ('Errore ' + res.status));
        return data;
    }

    /* ================= lettura e normalizzazione del file ================= */
    function decode(s) {
        return String(s ?? '').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'")
            .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\u00a0/g, ' ').trim();
    }
    function txt(v) {
        if (v instanceof Date) return isoDate(v);
        return decode(v);
    }
    function num(v) {
        if (typeof v === 'number') return isFinite(v) ? v : null;
        let s = decode(v).replace(/[€\s]/g, '');
        if (!s) return null;
        if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
        else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
        const n = parseFloat(s);
        return isFinite(n) ? n : null;
    }
    function isoDate(v) {
        if (v instanceof Date) {
            if (isNaN(v)) return '';
            const d = new Date(v.getTime() + 12 * 3600 * 1000);   // evita lo scarto di fuso di xlsx
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        }
        if (typeof v === 'number' && v > 20000 && v < 80000) return isoDate(new Date(Math.round((v - 25569) * 86400000)));
        const s = decode(v);
        const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/.exec(s);
        if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        const i = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
        return i ? i[0] : '';
    }
    function titleCase(s) {
        return s.toLowerCase().replace(/(^|[\s\-\/'])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
    }
    function sentenceIfUpper(s) {
        s = decode(s);
        return (s && s === s.toUpperCase() && s !== s.toLowerCase()) ? titleCase(s) : s;
    }

    // Marchi: chiave di confronto senza accenni, spazi e simboli -> nome definitivo
    const MARCHI_SPECIALI = {
        DRAUTOMOBILES: 'DR', DR: 'DR', CITRON: 'Citroën', TOYOTAOFFICIAL: 'Toyota', MERCEDES: 'Mercedes-Benz', MERCEDESBENZ: 'Mercedes-Benz',
        ICKX: 'ICH-X', ICHX: 'ICH-X', FIAT: 'Fiat', JEEP: 'Jeep', BMW: 'BMW', MG: 'MG', BYD: 'BYD', DS: 'DS', MINI: 'Mini'
    };
    function marca(raw) {
        const s = decode(raw).replace(/\uFFFD/g, '?');
        if (!s) return '';
        const key = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (MARCHI_SPECIALI[key]) return MARCHI_SPECIALI[key];
        if (s === s.toUpperCase()) return s.length <= 3 ? s : titleCase(s);
        return s;
    }

    function carburante(raw) {
        let s = decode(raw);
        if (!s) return '';
        s = s.toLowerCase().replace(/\bgpl\b/g, 'GPL');
        return s.charAt(0).toUpperCase() + s.slice(1);
    }
    function siNo(raw) {
        const s = norm(raw);
        if (!s) return '';
        if (['si', 'yes', 'true', '1', 'x', 'presenti', 'presente', 'ok'].includes(s)) return 'Sì';
        if (['no', 'false', '0', 'assenti', 'assente', 'mancanti'].includes(s)) return 'No';
        return decode(raw);
    }
    function statoOf(raw) {
        const s = norm(raw);
        if (s === 'free' || s === 'disponibile') return 'Disponibile';
        if (s === 'reserved' || s === 'prenotata' || s === 'prenotato') return 'Prenotata';
        if (s === 'contrattualizzata' || s === 'contrattualizzato' || s === 'venduta' || s === 'venduto') return 'Venduta';
        return decode(raw) ? 'Altro' : '';
    }
    function tipoOf(raw, km) {
        const t = norm(raw);
        if (['new', 'nuovo', 'nuova'].includes(t)) return 'Nuova';
        if (['used', 'usato', 'usata'].includes(t)) return 'Usata';
        if (/^km0|^kmzero/.test(t)) return 'Km 0';
        return (km && km > 0) ? 'Usata' : 'Km 0';
    }

    // Colonne cercate nel file: prima nome identico, poi nome che contiene la parola
    const CAMPI = [
        { k: 'stato', ex: ['stato', 'statovettura', 'statoveicolo'], req: 1 },
        { k: 'marca', ex: ['marca', 'marchio'], req: 1 },
        { k: 'modello', ex: ['modello'], req: 1 },
        { k: 'versione', ex: ['versione', 'allestimento'] },
        { k: 'tipo', ex: ['tipo', 'tipovettura', 'tipoveicolo', 'tipologia'] },
        { k: 'categoria', ex: ['categoria'] },
        { k: 'km', ex: ['km', 'chilometri', 'kmpercorsi'] },
        { k: 'colore', ex: ['colore'] },
        { k: 'cambio', ex: ['cambio'] },
        { k: 'carrozzeria', ex: ['carrozzeria'] },
        { k: 'carburante', ex: ['carburante', 'alimentazione'] },
        { k: 'listino', ex: ['prezzolistino', 'listino'] },
        { k: 'bottom', ex: ['prezzobottom', 'bottom'] },
        { k: 'fornitore', ex: ['fornitore'] },
        { k: 'inizio', ex: ['dataingressostock', 'ingressostock', 'datainiziostock', 'iniziostock'], has: ['ingressostock', 'iniziostock'] },
        { k: 'giorni', ex: ['giorniinstock', 'giornistock'], has: ['giorniinstock'] },
        { k: 'iva', ex: ['ivaesposta', 'iva'] },
        { k: 'sede', ex: ['sede', 'sedeubicazione', 'ubicazione', 'sedediubicazione'], has: ['ubicazione'] },
        { k: 'optionals', ex: ['optionals', 'optional', 'accessori'] },
        { k: 'note', ex: ['note', 'nota'] },
        // interventi: nel file sono separati tra officina e carrozzeria (dettaglio + costo)
        { k: 'intOffDet', ex: ['dettagliointerventiofficina'] },
        { k: 'intOffCosto', ex: ['costointerventiofficina'] },
        { k: 'intCarDet', ex: ['dettagliointerventicarrozzeria'] },
        { k: 'intCarCosto', ex: ['costointerventicarrozzeria'] },
        { k: 'interventi', ex: ['interventi', 'dettagliointerventi'], alt: 1 },
        { k: 'intervPrezzo', ex: ['costointerventi', 'prezzointerventi'], alt: 1 },
        { k: 'documenti', ex: ['documenti', 'documentazione', 'documento'] },
        // cliente: nel file nome e cognome sono in due colonne
        { k: 'clienteNome', ex: ['clientenome', 'nomecliente'] },
        { k: 'clienteCognome', ex: ['clientecognome', 'cognomecliente'] },
        { k: 'cliente', ex: ['cliente', 'intestatario'], alt: 1 },
        { k: 'prezzoVenduto', ex: ['prezzovendita', 'prezzovenduto', 'prezzodivendita', 'prezzocliente', 'prezzofinale', 'prezzocontratto'] },
        { k: 'targa', ex: ['targa'] },
        { k: 'telaio', ex: ['telaio', 'telaiovin', 'vin', 'numerotelaio'], has: ['telaio'] }
    ];
    function mapColumns(headers) {
        const hn = headers.map(norm), map = {}, used = new Set();
        CAMPI.forEach(c => {            // 1) nome identico
            const i = hn.findIndex((h, ix) => !used.has(ix) && c.ex.includes(h));
            if (i >= 0) { map[c.k] = headers[i]; used.add(i); }
        });
        CAMPI.forEach(c => {            // 2) nome che contiene la parola
            if (map[c.k] || !c.has) return;
            const i = hn.findIndex((h, ix) => !used.has(ix) && c.has.some(w => h.includes(w))
                && (!c.also || c.also.some(w => h.includes(w)))
                && (!c.not || !c.not.some(w => h.includes(w))));
            if (i >= 0) { map[c.k] = headers[i]; used.add(i); }
        });
        return map;
    }

    // Interventi: testo unico con officina e carrozzeria, costo = somma dei due
    function interventiOf(r, get) {
        const det = [], cost = [];
        const off = decode(get(r, 'intOffDet')), car = decode(get(r, 'intCarDet')), gen = decode(get(r, 'interventi'));
        if (off) det.push('Officina: ' + off);
        if (car) det.push('Carrozzeria: ' + car);
        if (gen && !off && !car) det.push(gen);
        [num(get(r, 'intOffCosto')), num(get(r, 'intCarCosto')), num(get(r, 'intervPrezzo'))].forEach(c => { if (c && c > 0) cost.push(c); });
        const o = {};
        if (det.length) o.interventi = det.join('\n');
        if (cost.length) o.intervPrezzo = Math.round(cost.reduce((a, b) => a + b, 0) * 100) / 100;
        return o;
    }

    function parseWorkbook(buf) {
        if (typeof XLSX === 'undefined') throw new Error('Libreria Excel non caricata: ricarica la pagina.');
        const wb = XLSX.read(buf, { type: 'array', cellDates: true });
        // foglio con più righe (di solito l'unico)
        let best = null;
        wb.SheetNames.forEach(n => {
            const j = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: true });
            if (!best || j.length > best.length) best = j;
        });
        if (!best || !best.length) throw new Error('Il file non contiene righe.');
        const headers = Object.keys(best[0]);
        const map = mapColumns(headers);
        const mancanti = CAMPI.filter(c => c.req && !map[c.k]).map(c => c.k);
        if (mancanti.length) throw new Error('Nel file mancano le colonne: ' + mancanti.join(', ') + '. Colonne trovate: ' + headers.join(', '));

        const get = (r, k) => map[k] ? r[map[k]] : '';
        const out = []; let scartate = 0; const altri = new Set();
        best.forEach(r => {
            const mr = marca(get(r, 'marca')), md = decode(get(r, 'modello'));
            if (!mr || !md) { scartate++; return; }
            const kmRaw = num(get(r, 'km'));
            const tipo = tipoOf(get(r, 'tipo'), kmRaw);
            const km = (kmRaw && kmRaw > 0) ? Math.round(kmRaw) : null;     // 0 -> niente km (Nuova, Km 0 e Usata)
            const stato = statoOf(get(r, 'stato'));
            if (stato === 'Altro') altri.add(decode(get(r, 'stato')));
            const fornitore = (() => { const f = decode(get(r, 'fornitore')); return /^n\.?\s*\/?\s*d\.?$/i.test(f) ? 'Non specificato' : f; })();
            const o = {
                stato: stato || undefined, marca: mr, modello: md, versione: decode(get(r, 'versione')),
                tipo, categoria: /commerc/i.test(txt(get(r, 'categoria'))) ? 'Per Commercianti' : '',
                km, colore: decode(get(r, 'colore')), cambio: decode(get(r, 'cambio')), carrozzeria: decode(get(r, 'carrozzeria')),
                carburante: carburante(get(r, 'carburante')),
                listino: num(get(r, 'listino')), bottom: num(get(r, 'bottom')), fornitore,
                inizio: isoDate(get(r, 'inizio')), giorni: num(get(r, 'giorni')),
                iva: siNo(get(r, 'iva')), sede: sentenceIfUpper(get(r, 'sede')),
                optionals: decode(get(r, 'optionals')), note: decode(get(r, 'note')),
                ...interventiOf(r, get),
                documenti: siNo(get(r, 'documenti')),
                cliente: sentenceIfUpper(get(r, 'cliente')) || sentenceIfUpper([decode(get(r, 'clienteNome')), decode(get(r, 'clienteCognome'))].filter(Boolean).join(' ')),
                prezzoVenduto: num(get(r, 'prezzoVenduto')),
                targa: decode(get(r, 'targa')).toUpperCase(), telaio: decode(get(r, 'telaio')).toUpperCase()
            };
            ['listino', 'bottom', 'prezzoVenduto'].forEach(k => { if (o[k] === 0) delete o[k]; });   // prezzo 0 = non indicato
            Object.keys(o).forEach(k => { if (o[k] === '' || o[k] === null || o[k] === undefined || Number.isNaN(o[k])) delete o[k]; });
            out.push(o);
        });

        // Targhe doppie: si tiene la riga con più dati
        const filled = o => Object.keys(o).length;
        const seen = new Map(); let duplicati = 0;
        out.forEach(o => {
            const key = o.targa ? 'T' + o.targa : (o.telaio ? 'V' + o.telaio : null);
            if (!key) return;
            const prev = seen.get(key);
            if (!prev) { seen.set(key, o); return; }
            duplicati++;
            if (filled(o) > filled(prev)) { prev._drop = true; seen.set(key, o); } else o._drop = true;
        });
        const finale = out.filter(o => !o._drop);
        return { rows: finale, scartate, duplicati, altri: [...altri], mancanti: CAMPI.filter(c => !map[c.k] && !c.alt).map(c => c.k) };
    }

    /* ================= UI ================= */
    function shell() {
        rootEl.innerHTML = `
        <div class="cg-band">
          <div class="cg-band-top">
            <div>
              <div class="cg-back-row"><button type="button" class="cg-back" onclick="MacroHome.openBI()">&larr; BI</button></div>
              <h1>Stock</h1>
              <p>Vetture in giacenza per marchio, tipo, motorizzazione e stato</p>
            </div>
            <div class="cg-actions">
              <label class="cg-btn" id="stImportLbl" style="display:none">Importa stock (Excel)<input type="file" accept=".xlsx,.xls" id="stFile" hidden></label>
            </div>
          </div>
          <div class="cg-src" id="stSrc"></div>
        </div>
        <div class="cg-wrap" id="stBody"></div>`;
        rootEl.querySelector('#stFile').addEventListener('change', e => importFile(e.target));
    }

    function setSrc(msg, isErr) {
        const s = meta && meta.stock;
        const imp = rootEl.querySelector('#stImportLbl');
        if (imp) imp.style.display = meta && meta.puoImportare ? '' : 'none';
        rootEl.querySelector('#stSrc').innerHTML =
            `Ultimo import stock: <b>${s ? fmt(s.righe || 0) + ' vetture · ' + when(s.aggiornatoAt) + (s.aggiornatoDa ? ' da ' + esc(s.aggiornatoDa) : '') : 'nessuno'}</b>` +
            (msg ? `<div class="cg-msg ${isErr ? 'err' : ''}">${msg}</div>` : '');
    }

    function applyServerData(d) {
        meta = d;
        rows = (d.stock && Array.isArray(d.stock.rows) ? d.stock.rows : []).map((r, i) => ({ ...r, _i: i }));
    }

    async function reload(msg) {
        try { applyServerData(await api('/data')); render(msg); }
        catch (e) { setSrc('Impossibile caricare lo stock: ' + esc(e.message), true); }
    }

    function importFile(input) {
        const file = input.files && input.files[0]; if (!file) return;
        const lbl = rootEl.querySelector('#stImportLbl');
        const r = new FileReader();
        r.onload = async () => {
            try {
                const p = parseWorkbook(r.result);
                if (!p.rows.length) throw new Error('Il file non contiene vetture valide.');
                lbl.classList.add('cg-busy');
                const d = await api('/import', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: p.rows })
                });
                applyServerData(d);
                let m = `Import completato: ${fmt(p.rows.length)} vetture. Ora le vedono tutti.`;
                if (p.duplicati) m += ` Righe doppie (stessa targa o telaio) unite: ${p.duplicati}.`;
                if (p.scartate) m += ` Righe senza marca o modello scartate: ${p.scartate}.`;
                if (p.altri.length) m += ` Stati non riconosciuti (contati come "Altro"): ${esc(p.altri.join(', '))}.`;
                if (p.mancanti.length) m += ` Colonne non trovate nel file: ${esc(p.mancanti.join(', '))}.`;
                render(m);
            } catch (e) { setSrc(esc(e.message), true); }
            finally { lbl.classList.remove('cg-busy'); input.value = ''; }
        };
        r.readAsArrayBuffer(file);
    }

    /* ================= calcoli ================= */
    const count = (arr, fn) => { const m = new Map(); arr.forEach(r => { const k = fn(r); m.set(k, (m.get(k) || 0) + 1); }); return m; };
    const sortedDesc = m => [...m.entries()].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]));

    function match(r, f) {
        return (!f.stato || r.stato === f.stato) && (!f.tipo || r.tipo === f.tipo) && (!f.marca || r.marca === f.marca)
            && (!f.carb || (f.carb === '__none' ? !r.carburante : r.carburante === f.carb))
            && (!f.sede || (f.sede === '__none' ? !r.sede : r.sede === f.sede));
    }

    function render(msg) {
        destroyCharts();
        setSrc(msg);
        const body = rootEl.querySelector('#stBody');
        if (!rows.length) {
            const canImp = meta && meta.puoImportare;
            body.innerHTML = `<div class="cg-card cg-empty"><h2>Nessuno stock caricato</h2>
                <p>${canImp ? 'Usa "Importa stock (Excel)" in alto per caricare il file: lo vedranno tutti.' : 'Chi ha il permesso completo sullo Stock deve ancora caricare il file.'}</p></div>`;
            return;
        }
        const tot = rows.length;
        const tipo = count(rows, r => r.tipo), stato = count(rows, r => r.stato || '—');
        const marchi = count(rows, r => r.marca);
        const kpi = (icon, bg, label, n, f, sub) => `<button type="button" class="cg-kpi" data-f='${esc(JSON.stringify(f))}' data-t="${esc(label)}">
            <span class="cg-k-top">${label}<span class="cg-dot" style="background:${bg}">${icon}</span></span>
            <span class="cg-num">${fmt(n)}</span><span class="cg-sub">${sub}</span></button>`;
        const pc = n => tot ? Math.round(n / tot * 100) + '% del totale' : '';
        const nD = stato.get('Disponibile') || 0, nP = stato.get('Prenotata') || 0, nV = stato.get('Venduta') || 0;

        body.innerHTML = `
        <div class="cg-kpis">
          ${kpi('🚗', 'var(--cg-teal-soft)', 'Totale vetture', tot, {}, `${fmt(nD)} disponibili · ${fmt(nP)} prenotate · ${fmt(nV)} vendute`)}
          ${kpi('✨', 'var(--cg-teal-soft)', 'Nuove', tipo.get('Nuova') || 0, { tipo: 'Nuova' }, pc(tipo.get('Nuova') || 0))}
          ${kpi('🔁', 'var(--cg-amber-soft)', 'Usate', tipo.get('Usata') || 0, { tipo: 'Usata' }, pc(tipo.get('Usata') || 0))}
          ${kpi('🏁', 'var(--cg-violet-soft)', 'Km 0', tipo.get('Km 0') || 0, { tipo: 'Km 0' }, pc(tipo.get('Km 0') || 0))}
        </div>
        <div class="cg-kpis st-kpis2">
          ${kpi('✅', 'var(--cg-teal-soft)', 'Disponibili', nD, { stato: 'Disponibile' }, pc(nD))}
          ${kpi('🔖', 'var(--cg-amber-soft)', 'Prenotate', nP, { stato: 'Prenotata' }, pc(nP))}
          ${kpi('🤝', 'var(--cg-violet-soft)', 'Vendute', nV, { stato: 'Venduta' }, pc(nV))}
          <button type="button" class="cg-kpi" id="stGoBrands"><span class="cg-k-top">Marchi<span class="cg-dot" style="background:var(--cg-grey-soft)">🏷️</span></span>
            <span class="cg-num">${fmt(marchi.size)}</span><span class="cg-sub">Vai all'elenco per marchio</span></button>
        </div>
        <div class="st-charts">
          <div class="cg-card ${vede('G_ST_TIPO') ? '' : 'chart-perm-hidden'}"><div class="st-ch-head"><div><h2>Nuove, usate e Km 0</h2><p class="cg-hint" data-hint="stChTipo"></p></div>${typeBtns('stChTipo')}</div><div class="st-chart-box"><canvas id="stChTipo"></canvas></div></div>
          <div class="cg-card ${vede('G_ST_STATO') ? '' : 'chart-perm-hidden'}"><div class="st-ch-head"><div><h2>Disponibili, prenotate e vendute</h2><p class="cg-hint" data-hint="stChStato"></p></div>${typeBtns('stChStato')}</div><div class="st-chart-box"><canvas id="stChStato"></canvas></div></div>
          <div class="cg-card ${vede('G_ST_MOTORE') ? '' : 'chart-perm-hidden'}"><div class="st-ch-head"><div><h2>Per motorizzazione</h2><p class="cg-hint" data-hint="stChMotore"></p></div>${typeBtns('stChMotore')}</div><div class="st-chart-box"><canvas id="stChMotore"></canvas></div></div>
          <div class="cg-card ${vede('G_ST_MARCHI') ? '' : 'chart-perm-hidden'}"><div class="st-ch-head"><div><h2>Per marchio</h2><p class="cg-hint" data-hint="stChMarchi"></p></div>${typeBtns('stChMarchi')}</div><div class="st-chart-box"><canvas id="stChMarchi"></canvas></div></div>
          <div class="cg-card st-wide ${vede('G_ST_SEDE') ? '' : 'chart-perm-hidden'}"><div class="st-ch-head"><div><h2>Per sede</h2><p class="cg-hint" data-hint="stChSede"></p></div>${typeBtns('stChSede')}</div><div class="st-chart-box" data-box="stChSede"><canvas id="stChSede"></canvas></div></div>
        </div>
        <div class="cg-card" id="stBrandsCard" style="margin-top:16px">
          <h2>Marchi</h2><p class="cg-hint">In ordine alfabetico · clicca un marchio per vedere modelli e vetture</p>
          <div class="st-brands" id="stBrands"></div>
        </div>`;

        body.querySelectorAll('.cg-kpi[data-f]').forEach(b => b.addEventListener('click', () => openList(b.dataset.t, JSON.parse(b.dataset.f))));
        body.querySelector('#stGoBrands').addEventListener('click', () => body.querySelector('#stBrandsCard').scrollIntoView({ behavior: 'smooth', block: 'start' }));
        drawCharts();
        body.querySelectorAll('[data-ct]').forEach(btn => btn.addEventListener('click', () => {
            const [id, t] = btn.dataset.ct.split('|'); tipiGrafico[id] = t;
            try { localStorage.setItem(LS_TIPI, JSON.stringify(tipiGrafico)); } catch (e) { /* non bloccante */ }
            btn.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === btn));
            destroyCharts(); drawCharts();
        }));
        drawBrands();
    }

    function drawBrands() {
        const by = new Map();
        rows.forEach(r => {
            const b = by.get(r.marca) || { n: 0, D: 0, P: 0, V: 0 };
            b.n++;
            if (r.stato === 'Disponibile') b.D++; else if (r.stato === 'Prenotata') b.P++; else if (r.stato === 'Venduta') b.V++;
            by.set(r.marca, b);
        });
        const box = rootEl.querySelector('#stBrands');
        box.innerHTML = [...by.keys()].sort(cmp).map(m => {
            const b = by.get(m);
            return `<button type="button" class="st-brand" data-m="${esc(m)}">
                <span class="st-logo"><img src="/img/marchi/${slug(m)}.png" alt="" loading="lazy" data-m="${esc(m)}"></span>
                <span class="st-bname">${esc(m)}</span><span class="st-bnum">${fmt(b.n)}</span>
                <span class="st-bsplit"><span class="st-d" title="Disponibili">${b.D}</span><span class="st-p" title="Prenotate">${b.P}</span><span class="st-v" title="Vendute">${b.V}</span></span>
            </button>`;
        }).join('');
        box.querySelectorAll('.st-brand').forEach(b => b.addEventListener('click', () => openList(b.dataset.m, { marca: b.dataset.m })));
        // logo mancante: prova senza trattini (es. sportequipe.png), poi la scritta del marchio
        box.querySelectorAll('img').forEach(img => img.addEventListener('error', () => {
            if (!img.dataset.alt) { img.dataset.alt = '1'; img.src = '/img/marchi/' + slug(img.dataset.m).replace(/-/g, '') + '.png'; return; }
            const s = document.createElement('span'); s.className = 'st-logo-txt'; s.textContent = img.dataset.m; img.replaceWith(s);
        }));
    }
    function slug(m) {
        return String(m).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    /* ================= grafici ================= */
    const PALETTE = ['#5cc6a7', '#e8a13a', '#4d8fd6', '#8f7bd6', '#e46a6a', '#3a6aa6', '#9ac86b', '#d68fb1', '#6bc2d6', '#b59a6a', '#7d8a99', '#d6c25c'];
    function destroyCharts() { charts.forEach(c => { try { c.destroy(); } catch (e) { /* già distrutto */ } }); charts = []; }
    // ===== grafici: ciambella / colonne / linee (scelta ricordata nel browser) =====
    const LS_TIPI = 'stock_grafici_v1';
    const DEF_TIPI = { stChTipo: 'doughnut', stChStato: 'doughnut', stChMotore: 'bar', stChMarchi: 'bar', stChSede: 'bar' };
    let tipiGrafico = (() => { try { return { ...DEF_TIPI, ...JSON.parse(localStorage.getItem(LS_TIPI) || '{}') }; } catch (e) { return { ...DEF_TIPI }; } })();
    const ICO = {
        doughnut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 4v4.5"/></svg>',
        bar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 20V11M12 20V5M18 20v-6"/></svg>',
        line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-6 4 3 5-7 4 4"/></svg>'
    };
    const NOMI = { doughnut: 'Ciambella', bar: 'Colonne', line: 'Linee' };
    function typeBtns(id) {
        return `<div class="cg-an-types">${Object.keys(ICO).map(t => `<button type="button" title="${NOMI[t]}" class="${tipiGrafico[id] === t ? 'on' : ''}" data-ct="${id}|${t}">${ICO[t]}</button>`).join('')}</div>`;
    }
    const pctS = (n, tot) => tot ? (Math.round(n / tot * 1000) / 10).toLocaleString('it-IT') + '%' : '0%';
    const MESI3 = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
    // etichette "numero · %" disegnate in fondo alle barre
    const barLabels = {
        id: 'stBarLabels',
        afterDatasetsDraw(chart) {
            const o = chart.options.plugins.stBarLabels; if (!o || !o.on) return;
            const { ctx } = chart, ds = chart.data.datasets[0], meta = chart.getDatasetMeta(0);
            ctx.save(); ctx.font = '600 11px Inter, system-ui, sans-serif'; ctx.fillStyle = o.color; ctx.textBaseline = 'middle';
            meta.data.forEach((el, i) => {
                const v = ds.data[i]; if (!v) return;
                const t = `${fmt(v)} · ${pctS(v, o.tot)}`;
                if (chart.options.indexAxis === 'y') { ctx.textAlign = 'left'; ctx.fillText(t, el.x + 6, el.y); }
                else { ctx.textAlign = 'center'; ctx.fillText(t, el.x, el.y - 9); }
            });
            ctx.restore();
        }
    };
    // dati di ogni grafico: voci [chiave, numero, etichetta] + filtro per aprire l'elenco
    function chartData(id) {
        if (id === 'stChTipo') return { voci: sortedDesc(count(rows, r => r.tipo)).map(([k, n]) => [k, n, k]), key: 'tipo', get: r => r.tipo,
            colors: { 'Nuova': '#5cc6a7', 'Usata': '#e8a13a', 'Km 0': '#8f7bd6' }, hint: 'Clicca per vedere le vetture' };
        if (id === 'stChStato') return { voci: sortedDesc(count(rows, r => r.stato || '—')).map(([k, n]) => [k, n, k]), key: 'stato', get: r => r.stato || '—',
            colors: { 'Disponibile': '#5cc6a7', 'Prenotata': '#e8a13a', 'Venduta': '#8f7bd6' }, hint: 'Clicca per vedere le vetture' };
        if (id === 'stChMotore') return { voci: sortedDesc(count(rows, r => r.carburante || '__none')).map(([k, n]) => [k, n, k === '__none' ? 'Non indicata' : k]),
            key: 'carb', get: r => r.carburante || '__none', colors: {}, hint: 'Dalla colonna Carburante · clicca per vedere le vetture' };
        if (id === 'stChSede') return { voci: sortedDesc(count(rows, r => r.sede || '__none')).map(([k, n]) => [k, n, k === '__none' ? 'Non indicata' : k]),
            key: 'sede', get: r => r.sede || '__none', colors: {}, hint: 'Dove si trovano le vetture (colonna Sede / Ubicazione) · clicca per vedere le vetture' };
        return { voci: sortedDesc(count(rows, r => r.marca)).slice(0, 12).map(([k, n]) => [k, n, k]), key: 'marca', get: r => r.marca, colors: {},
            hint: 'I 12 marchi con più vetture · clicca per vedere le vetture' };
    }
    function drawCharts() {
        if (typeof Chart === 'undefined') return;
        const ink = getComputedStyle(rootEl).getPropertyValue('--cg-ink-2').trim() || '#6b7a8c';
        const ink1 = getComputedStyle(rootEl).getPropertyValue('--cg-ink').trim() || '#1f2d3d';
        const grid = getComputedStyle(rootEl).getPropertyValue('--cg-line').trim() || '#e3e8ef';
        const tot = rows.length;
        ['stChTipo', 'stChStato', 'stChMotore', 'stChMarchi', 'stChSede'].forEach((id, gi) => {
            const el = rootEl.querySelector('#' + id); if (!el) return;
            const d = chartData(id), tipo = tipiGrafico[id];
            const col = (k, i) => d.colors[k] || (id === 'stChMotore' && tipo !== 'doughnut' ? '#4d8fd6' : id === 'stChMarchi' && tipo !== 'doughnut' ? '#5cc6a7' : id === 'stChSede' && tipo !== 'doughnut' ? '#e8a13a' : PALETTE[i % PALETTE.length]);
            // barre orizzontali con tante voci: il riquadro si allunga per mostrarle tutte con il nome
            const boxEl = el.parentElement;
            boxEl.style.height = (tipo === 'bar' && d.voci.length > 5) ? Math.max(290, d.voci.length * 26 + 50) + 'px'
                : (tipo !== 'bar' && d.voci.length > 9) ? (290 + Math.ceil(d.voci.length / 3) * 22) + 'px' : '';   // legenda lunga sotto il grafico
            const hint = rootEl.querySelector(`[data-hint="${id}"]`);
            if (hint) hint.textContent = tipo === 'line' ? 'Ingressi in stock mese per mese (data ingresso) · clicca un punto' : d.hint;
            const open = (k, label, extra) => openList(label, { [d.key]: k, ...(extra || {}) });
            let cfg;
            if (tipo === 'line') {
                // andamento tra un import e l'altro: ogni import salva una "fotografia" dei conteggi
                // (una per giorno). Linee dritte tra un punto e l'altro: se il valore non cambia, la linea resta piatta.
                const campo = { tipo: 'tipo', stato: 'stato', carb: 'carburante', marca: 'marca', sede: 'sede' }[d.key];
                const storico = (meta && Array.isArray(meta.storico)) ? meta.storico : [];
                const top = d.voci.slice(0, 6);
                const lab = f => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f.at || ''); return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '—'; };
                if (hint) hint.textContent = storico.length > 1
                    ? `Andamento tra gli import (${storico.length} caricamenti) · clicca un punto`
                    : 'Per vedere l\'andamento servono almeno due import in giorni diversi: ogni import viene ricordato';
                cfg = { type: 'line',
                    data: { labels: storico.map(lab),
                        datasets: top.map(([k, n, l], i) => ({ label: `${l} · ${fmt(n)}`, data: storico.map(f => (f[campo] && f[campo][k]) || 0),
                            borderColor: d.colors[k] || PALETTE[i % PALETTE.length], backgroundColor: d.colors[k] || PALETTE[i % PALETTE.length],
                            tension: 0, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2.5 })) },
                    options: { maintainAspectRatio: false,
                        plugins: { legend: { position: 'bottom', labels: { color: ink, usePointStyle: true, boxWidth: 8, padding: 12 } },
                            tooltip: { callbacks: { title: it => { const f = storico[it[0].dataIndex]; return `Import del ${lab(f)}${f.da ? ' · ' + f.da : ''}`; },
                                label: c => { const f = storico[c.dataIndex]; return ` ${c.dataset.label.split(' · ')[0]}: ${fmt(c.parsed.y)} · ${pctS(c.parsed.y, f.totale || 0)}`; } } } },
                        scales: { x: { offset: storico.length < 3, ticks: { color: ink }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: ink, precision: 0 }, grid: { color: grid } } },
                        onClick: (ev, els) => { if (els.length) { const v = top[els[0].datasetIndex]; open(v[0], v[2]); } } } };
            } else if (tipo === 'doughnut') {
                cfg = { type: 'doughnut',
                    data: { labels: d.voci.map(v => `${v[2]} · ${fmt(v[1])} (${pctS(v[1], tot)})`), datasets: [{ data: d.voci.map(v => v[1]), backgroundColor: d.voci.map((v, i) => d.colors[v[0]] || PALETTE[i % PALETTE.length]), borderWidth: 0 }] },
                    options: { maintainAspectRatio: false, cutout: '58%',
                        plugins: { legend: { position: d.voci.length > 4 && d.voci.length <= 9 ? 'right' : 'bottom', labels: { color: ink, usePointStyle: true, padding: 10, boxWidth: 8, font: { size: 11.5 } } },
                            tooltip: { callbacks: { label: c => ` ${fmt(c.parsed)} vetture · ${pctS(c.parsed, tot)}` } } },
                        onClick: (ev, els) => { if (els.length) { const v = d.voci[els[0].index]; open(v[0], v[2]); } } } };
            } else {
                const horiz = d.voci.length > 5;
                const maxV = Math.max(...d.voci.map(v => v[1]), 1);
                cfg = { type: 'bar',
                    data: { labels: d.voci.map(v => v[2]), datasets: [{ data: d.voci.map(v => v[1]), backgroundColor: d.voci.map((v, i) => col(v[0], i)), borderRadius: 6, maxBarThickness: 46 }] },
                    options: { indexAxis: horiz ? 'y' : 'x', maintainAspectRatio: false,
                        layout: { padding: horiz ? { right: 70 } : { top: 18 } },
                        plugins: { legend: { display: false }, stBarLabels: { on: true, tot, color: ink1 },
                            tooltip: { callbacks: { label: c => ` ${fmt(c.parsed[horiz ? 'x' : 'y'])} vetture · ${pctS(c.parsed[horiz ? 'x' : 'y'], tot)}` } } },
                        scales: horiz
                            ? { x: { beginAtZero: true, suggestedMax: maxV * 1.08, ticks: { color: ink, precision: 0 }, grid: { color: grid } },
                                y: { ticks: { color: ink, autoSkip: false, callback: function (v) { const t = String(this.getLabelForValue(v)); return t.length > 30 ? t.slice(0, 29) + '…' : t; } }, grid: { display: false } } }
                            : { y: { beginAtZero: true, suggestedMax: maxV * 1.12, ticks: { color: ink, precision: 0 }, grid: { color: grid } },
                                x: { ticks: { color: ink, autoSkip: false, maxRotation: 0, callback: function (v) { const t = String(this.getLabelForValue(v)); return t.length > 16 ? t.slice(0, 15) + '…' : t; } }, grid: { display: false } } },
                        onClick: (ev, els) => { if (els.length) { const v = d.voci[els[0].index]; open(v[0], v[2]); } } },
                    plugins: [barLabels] };
            }
            charts.push(new Chart(el, cfg));
        });
    }

    /* ================= modale: elenco vetture e scheda ================= */
    function ensureModal() {
        if (ov) return;
        ov = document.createElement('div');
        ov.className = 'cg-ov';
        ov.innerHTML = `<div class="cg-modal" role="dialog" aria-modal="true">
            <div class="cg-m-head"><div><h3 id="stMTitle"></h3><div class="cg-stat" id="stMStat"></div></div>
              <button type="button" class="cg-x" id="stMClose" aria-label="Chiudi">✕</button></div>
            <div id="stMList">
              <div class="cg-m-tools"><input type="search" id="stMSearch" placeholder="Cerca modello, versione, targa, telaio, cliente…">
                <div class="cg-chips" id="stMStato"></div><div class="cg-chips" id="stMTipo"></div>
                <div class="st-fbar" id="stMFilt"></div></div>
              <div class="cg-m-body" id="stMBody"></div>
            </div>
            <div id="stMDet" style="display:none"></div>
          </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });
        ov.querySelector('#stMClose').addEventListener('click', closeModal);
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('open')) closeModal(); });
        ov.querySelector('#stMSearch').addEventListener('input', e => { view.q = e.target.value; renderList(); });
        ov.querySelector('#stMStato').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { view.stato = b.dataset.v; renderList(); } });
        ov.querySelector('#stMTipo').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { view.tipo = b.dataset.v; renderList(); } });
        ov.querySelector('#stMBody').addEventListener('click', e => {
            const so = e.target.closest('[data-sort]');
            if (so) { const k = so.dataset.sort; view.sort = { k, dir: view.sort.k === k ? -view.sort.dir : (['listino', 'km', 'giorni'].includes(k) ? -1 : 1) }; renderList(); return; }
            if (e.target.closest('#stMore')) { view.limit += 200; renderList(); return; }
            const tr = e.target.closest('tr[data-i]'); if (tr) showDetail(+tr.dataset.i);
        });
        // filtri: menu a tendina (piu' scelte) e intervalli prezzo / km / giorni
        const filt = ov.querySelector('#stMFilt');
        filt.addEventListener('click', e => {
            const btn = e.target.closest('.st-ms > button');
            if (btn) { const box = btn.parentElement, op = box.classList.contains('open'); filt.querySelectorAll('.st-ms.open').forEach(m => m.classList.remove('open')); if (!op) box.classList.add('open'); return; }
            const all = e.target.closest('[data-all]');
            if (all) { view.sel[all.dataset.all] = new Set(); renderList(all.dataset.all); return; }
            if (e.target.closest('#stReset')) { view.sel = {}; view.rng = {}; view.psq = {}; renderList(); }
        });
        filt.addEventListener('change', e => {
            const cb = e.target.closest('input[data-ms]');
            if (cb) { const k = cb.dataset.ms; view.sel[k] = view.sel[k] || new Set(); if (cb.checked) view.sel[k].add(cb.value); else view.sel[k].delete(cb.value); renderList(k); return; }
        });
        filt.addEventListener('input', e => {
            const ps = e.target.closest('input[data-ps]');
            if (ps) { view.psq = view.psq || {}; view.psq[ps.dataset.ps] = ps.value; applyPopSearch(ps); return; }
            const r = e.target.closest('input[data-rng]');
            if (r) { const v = r.value === '' ? null : Number(r.value); view.rng[r.dataset.rng] = v; clearTimeout(view._t); view._t = setTimeout(() => renderList('__keep', r.dataset.rng), 300); }
        });
        filt.addEventListener('keydown', e => {
            const ps = e.target.closest('input[data-ps]'); if (!ps || e.key !== 'Enter') return;
            e.preventDefault();
            const vis = [...ps.closest('.st-pop').querySelectorAll('label[data-n]')].filter(l => l.style.display !== 'none');
            if (vis.length === 1) vis[0].querySelector('input').click();
        });
        document.addEventListener('click', e => { if (ov && !e.target.closest('.st-ms')) ov.querySelectorAll('.st-ms.open').forEach(m => m.classList.remove('open')); });
    }
    function closeModal() { if (ov) ov.classList.remove('open'); }

    function openList(title, f) {
        ensureModal();
        view = { base: rows.filter(r => match(r, f)), title, f, stato: '', tipo: '', q: '', hasMarca: !!f.marca,
            sel: {}, rng: {}, psq: {}, sort: { k: '', dir: 1 }, limit: 200 };
        ov.querySelector('#stMSearch').value = '';
        ov.querySelector('#stMList').style.display = '';
        ov.querySelector('#stMDet').style.display = 'none';
        renderList();
        ov.classList.add('open');
        ov.querySelector('#stMSearch').focus();
    }

    // campi filtrabili con menu a tendina
    const MS = [['marca', 'Marchio'], ['modello', 'Modello'], ['carburante', 'Motorizzazione'], ['sede', 'Sede'], ['fornitore', 'Fornitore']];
    const RNG = [['listino', 'Prezzo €'], ['km', 'Km'], ['giorni', 'Giorni in stock']];
    function renderFilters(openKey, focusRng) {
        const b = view.base, filt = ov.querySelector('#stMFilt');
        const ms = MS.filter(([k]) => !(k === 'marca' && view.hasMarca)).map(([k, label]) => {
            const cnt = count(b, r => r[k] || '—'); if (cnt.size < 2) return '';
            const sel = view.sel[k] || new Set();
            return `<div class="st-ms ${openKey === k ? 'open' : ''}"><button type="button" class="${sel.size ? 'on' : ''}">${label}${sel.size ? ` (${sel.size})` : ''} ▾</button>
              <div class="st-pop"><input type="search" class="st-psearch" data-ps="${k}" placeholder="Cerca ${label.toLowerCase()}…" autocomplete="off">
              ${[...cnt.keys()].sort(cmp).map(v => `<label data-n="${esc(norm(v === '—' ? 'Non indicato' : v))}"><input type="checkbox" data-ms="${k}" value="${esc(v)}" ${sel.has(v) ? 'checked' : ''}><span>${v === '—' ? 'Non indicato' : esc(v)}</span><em>${fmt(cnt.get(v))}</em></label>`).join('')}
              <p class="st-pnone" style="display:none">Nessun risultato</p>
              <button type="button" class="st-all" data-all="${k}">Tutti</button></div></div>`;
        }).join('');
        const rng = RNG.map(([k, label]) => `<div class="st-rng"><small>${label}</small><span>
            <input type="number" min="0" placeholder="da" data-rng="${k}_min" value="${view.rng[k + '_min'] ?? ''}">
            <input type="number" min="0" placeholder="a" data-rng="${k}_max" value="${view.rng[k + '_max'] ?? ''}"></span></div>`).join('');
        filt.innerHTML = ms + rng + '<button type="button" class="st-reset" id="stReset">Azzera filtri</button>';
        // ricerca dentro i menu: si mantiene quando l'elenco si ridisegna
        filt.querySelectorAll('[data-ps]').forEach(i => { i.value = (view.psq && view.psq[i.dataset.ps]) || ''; applyPopSearch(i); });
        if (openKey && view.psq && view.psq[openKey]) { const i = filt.querySelector(`[data-ps="${openKey}"]`); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
        if (focusRng) { const i = filt.querySelector(`[data-rng="${focusRng}"]`); if (i) { i.focus(); const l = i.value.length; try { i.setSelectionRange(l, l); } catch (e) { /* number */ } } }
    }
    // filtra le voci di un menu: senza accenti e maiuscole, basta una parte del nome ("cit" -> Citroën)
    function applyPopSearch(input) {
        const q = norm(input.value), pop = input.closest('.st-pop'); let n = 0;
        pop.querySelectorAll('label[data-n]').forEach(l => { const ok = !q || l.dataset.n.includes(q); l.style.display = ok ? '' : 'none'; if (ok) n++; });
        pop.querySelector('.st-pnone').style.display = n ? 'none' : '';
    }
    function passFilters(r) {
        for (const [k] of MS) { const sel = view.sel[k]; if (sel && sel.size && !sel.has(r[k] || '—')) return false; }
        for (const [k] of RNG) {
            const v = r[k], mn = view.rng[k + '_min'], mx = view.rng[k + '_max'];
            if ((mn != null || mx != null) && (v == null)) return false;
            if (mn != null && v < mn) return false;
            if (mx != null && v > mx) return false;
        }
        return true;
    }

    function renderList(openKey, focusRng) {
        const f = view.f, b = view.base;
        if (openKey !== '__keep' || !ov.querySelector('#stMFilt').children.length) renderFilters(openKey, focusRng);
        // chip stato e tipo (con conteggi sulla base, solo se c'è più di una scelta)
        const chips = (arr, cur, label) => {
            const cnt = count(b, r => arr.key(r)); const keys = [...cnt.keys()].filter(Boolean);
            if (keys.length < 2) return '';
            return `<button type="button" class="cg-chip ${cur ? '' : 'on'}" data-v="">${label} (${fmt(b.length)})</button>` +
                keys.sort(cmp).map(k => `<button type="button" class="cg-chip ${cur === k ? 'on' : ''}" data-v="${esc(k)}">${esc(k)} (${fmt(cnt.get(k))})</button>`).join('');
        };
        ov.querySelector('#stMStato').innerHTML = chips({ key: r => r.stato }, view.stato, 'Tutti gli stati');
        ov.querySelector('#stMTipo').innerHTML = chips({ key: r => r.tipo }, view.tipo, 'Tutti i tipi');

        const q = norm(view.q);
        let list = b.filter(r => (!view.stato || r.stato === view.stato) && (!view.tipo || r.tipo === view.tipo) && passFilters(r));
        if (q) list = list.filter(r => norm([r.marca, r.modello, r.versione, r.targa, r.telaio, r.cliente, r.colore, r.carburante].join(' ')).includes(q));
        const byName = (x, y) => cmp(x.marca, y.marca) || cmp(x.modello, y.modello) || cmp(x.versione, y.versione);
        const sk = view.sort.k, sd = view.sort.dir;
        list = list.slice().sort((x, y) => {
            if (!sk) return byName(x, y);
            if (['listino', 'km', 'giorni'].includes(sk)) {      // numeri: i valori mancanti sempre in fondo
                const a = x[sk], c = y[sk];
                if (a == null && c == null) return byName(x, y);
                if (a == null) return 1; if (c == null) return -1;
                return (a - c) * sd || byName(x, y);
            }
            return cmp(x[sk], y[sk]) * sd || byName(x, y);
        });

        ov.querySelector('#stMTitle').textContent = view.title;
        const d = list.filter(r => r.stato === 'Disponibile').length, p = list.filter(r => r.stato === 'Prenotata').length, v = list.filter(r => r.stato === 'Venduta').length;
        ov.querySelector('#stMStat').innerHTML = `<span class="cg-n">${fmt(list.length)}</span><span class="cg-of">vetture · ${fmt(d)} disponibili · ${fmt(p)} prenotate · ${fmt(v)} vendute</span>`;

        const body = ov.querySelector('#stMBody');
        if (!list.length) { body.innerHTML = '<div class="cg-empty-msg">Nessuna vettura con questi filtri.</div>'; return; }
        const showM = !view.hasMarca;
        const th = (label, k) => `<th><button type="button" class="st-sort ${sk === k ? 'on' : ''}" data-sort="${k}">${label} ${sk === k ? (sd === 1 ? '↑' : '↓') : '↕'}</button></th>`;
        const shown = list.slice(0, view.limit);
        body.innerHTML = `<div class="cg-scroll"><table class="cg-list"><thead><tr>
            ${showM ? th('Marchio', 'marca') : ''}${th('Modello / Versione', 'modello')}<th>Tipo</th><th>Motorizzazione</th><th>Targa / Telaio</th>${th('Sede', 'sede')}${th('Km', 'km')}${th('Giorni', 'giorni')}${th('Prezzo', 'listino')}<th>Stato</th></tr></thead><tbody>
            ${shown.map(r => `<tr class="st-row" data-i="${r._i}">
                ${showM ? `<td class="cg-cl">${esc(r.marca)}</td>` : ''}
                <td class="${showM ? '' : 'cg-cl'}">${esc(r.modello)}${r.versione ? `<span class="st-sub">${esc(r.versione)}</span>` : ''}</td>
                <td>${esc(r.tipo || '')}${r.categoria ? `<span class="st-sub">${esc(r.categoria)}</span>` : ''}</td>
                <td>${esc(r.carburante || '')}</td>
                <td class="st-mono">${esc(r.targa || '')}${r.targa && r.telaio ? '<br>' : ''}${esc(r.telaio || '')}</td>
                <td>${esc(r.sede || '')}</td>
                <td>${r.km ? fmt(r.km) : ''}</td>
                <td>${r.giorni != null ? fmt(r.giorni) : ''}</td>
                <td>${eur(r.listino)}${r.prezzoVenduto ? `<span class="st-sub">venduta ${eur(r.prezzoVenduto)}</span>` : ''}</td>
                <td>${tag(r.stato)}${r.cliente ? `<span class="st-sub">${esc(r.cliente)}</span>` : ''}</td>
            </tr>`).join('')}</tbody></table></div>` +
            (list.length > shown.length ? `<button type="button" class="cg-chip st-more" id="stMore">Mostra altre ${fmt(Math.min(200, list.length - shown.length))} (ne restano ${fmt(list.length - shown.length)})</button>` : '');
    }
    const tag = s => !s ? '' : `<span class="cg-tag ${s === 'Disponibile' ? 'st-tag-d' : s === 'Prenotata' ? 'st-tag-p' : s === 'Venduta' ? 'st-tag-v' : ''}">${esc(s)}</span>`;

    function showDetail(i) {
        const r = rows[i]; if (!r) return;
        const field = (label, val) => (val === undefined || val === null || val === '') ? '' : `<div class="st-f"><small>${label}</small><b>${esc(val)}</b></div>`;
        const box = (title, html, cls) => html ? `<div class="st-box ${cls || ''}"><h5>${title}</h5>${html}</div>` : '';
        const det = ov.querySelector('#stMDet');
        det.innerHTML = `<div class="st-det">
          <div class="st-det-top">
            <div><button type="button" class="cg-chip" id="stBack">&larr; Torna all'elenco</button>
              <h4 style="margin-top:12px">${esc(r.marca)} ${esc(r.modello)}</h4>
              ${r.versione ? `<span class="st-sub">${esc(r.versione)}</span>` : ''}</div>
            <div>${tag(r.stato)}</div>
          </div>
          <div class="st-grid">
            ${field('Tipo', r.tipo)}${field('Categoria', r.categoria)}${field('Motorizzazione', r.carburante)}
            ${field('Cambio', r.cambio)}${field('Carrozzeria', r.carrozzeria)}${field('Colore', r.colore)}
            ${field('Km', r.km ? fmt(r.km) + ' km' : '')}${field('Targa', r.targa)}${field('Telaio', r.telaio)}
            ${field('Sede', r.sede)}${field('Fornitore', r.fornitore)}${field('Data inizio stock', fmtDay(r.inizio))}
            ${field('Giorni in stock', r.giorni != null ? fmt(r.giorni) : '')}${field('IVA esposta', r.iva)}${field('Documenti', r.documenti)}
            ${field('Prezzo di vendita', eur(r.listino))}${field('Prezzo di acquisto', eur(r.bottom))}
          </div>
          ${box('Cliente e vendita', (r.cliente || r.prezzoVenduto) ? `<p>${r.cliente ? '<b>' + esc(r.cliente) + '</b>' : ''}${r.cliente && r.prezzoVenduto ? ' · ' : ''}${r.prezzoVenduto ? 'prezzo ' + esc(eur(r.prezzoVenduto)) : ''}</p>` : '', 'sale')}
          ${box('Optionals', r.optionals ? `<p>${esc(r.optionals)}</p>` : '')}
          ${box('Note', r.note ? `<p>${esc(r.note)}</p>` : '')}
          ${box('Interventi', (r.interventi || r.intervPrezzo) ? `<p>${esc(r.interventi || '')}${r.interventi && r.intervPrezzo ? '<br>' : ''}${r.intervPrezzo ? 'Prezzo: ' + esc(eur(r.intervPrezzo)) : ''}</p>` : '')}
        </div>`;
        ov.querySelector('#stMList').style.display = 'none';
        det.style.display = '';
        det.querySelector('#stBack').addEventListener('click', () => {
            det.style.display = 'none'; ov.querySelector('#stMList').style.display = '';
        });
    }

    /* ================= avvio ================= */
    function init() {
        rootEl = document.getElementById('stockRoot');
        if (!rootEl) return;
        if (!rootEl.dataset.ready) { shell(); rootEl.dataset.ready = '1'; }
        if (!rows.length) rootEl.querySelector('#stBody').innerHTML = '<div class="cg-card cg-empty"><p>Caricamento stock…</p></div>';
        reload();
    }

    window.StockHome = { init };
})();
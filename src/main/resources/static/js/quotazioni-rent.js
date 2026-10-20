/* =====================================================================
   QUOTAZIONI RENT
   Import delle quotazioni dei portali di noleggio (PDF di Ayvens, Arval,
   Agos...), classifiche per Privato / P.IVA / Azienda, top 5, ricerca
   "cosa stai cercando?" e statistiche per singolo portale.

   - I PDF si leggono qui nel browser con pdf.js (caricato solo quando
     serve): al server arrivano solo i dati estratti (/api/quotazioni-rent).
   - Quanto conviene davvero un'offerta: costo totale = anticipo + canone x
     mesi + spese iniziali; costo mensile reale = costo totale / mesi.
     Privato: confronto IVA inclusa (paga l'IVA). P.IVA e Azienda: + IVA.
   - Dove si apre: chi nell'In bound vede piu' di 7 sezioni ha il pulsante
     📝 dentro Rent; chi ne vede 7 o meno ha la voce "Quotazioni Rent" nel
     menu in alto. Mai tutti e due. Permesso: sezione QUOTAZIONI_RENT.
   ===================================================================== */
(function () {
    'use strict';

    const IVA = 0.22;
    const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const PDFLIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';   // per togliere le condizioni generali dai PDF da conservare
    const TIPI = { PRIVATO: 'Privato', PIVA: 'P.IVA', AZIENDA: 'Azienda' };

    /* ================= LETTURA DEL PDF ================= */
    // Le righe del PDF ricostruite dalla posizione dei testi (stessa riga = stessa altezza);
    // tra due blocchi lontani si mettono 3 spazi, cosi' le colonne restano separate.
    async function righeDaPdf(pdfjsLib, data, maxPag) {
        const doc = await pdfjsLib.getDocument({ data, disableFontFace: true, isEvalSupported: false }).promise;
        const out = [];
        for (let n = 1; n <= Math.min(doc.numPages, maxPag || 4); n++) {
            const pg = await doc.getPage(n), tc = await pg.getTextContent();
            const it = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || 8 }));
            it.sort((a, b) => b.y - a.y || a.x - b.x);
            const righe = [];
            it.forEach(i => { const r = righe.find(r => Math.abs(r.y - i.y) <= Math.max(2, i.h * 0.35)); if (r) r.it.push(i); else righe.push({ y: i.y, it: [i] }); });
            righe.sort((a, b) => b.y - a.y);
            righe.forEach(r => {
                r.it.sort((a, b) => a.x - b.x);
                let t = '', fine = null;
                r.it.forEach(i => { if (fine !== null) { const gap = i.x - fine; t += gap > 12 ? '   ' : gap > 1.5 ? ' ' : ''; } t += i.s; fine = i.x + i.w; });
                out.push(t.replace(/\s+$/, ''));
            });
            out.push('<<PAGINA>>');
        }
        return out;
    }

    /* ================= RICONOSCIMENTO DEI DATI ================= */
    const MARCHE = ['ALFA ROMEO', 'AUDI', 'BMW', 'BYD', 'CITROEN', 'CITROËN', 'CUPRA', 'DACIA', 'DR', 'DS', 'EVO', 'FIAT', 'FORD', 'FERRARI', 'HONDA', 'HYUNDAI',
        'ICH-X', 'INFINITI', 'IVECO', 'JAECOO', 'JAGUAR', 'JEEP', 'KIA', 'LAMBORGHINI', 'LANCIA', 'LAND ROVER', 'LEAPMOTOR', 'LEXUS', 'LYNK & CO', 'MAXUS', 'MAZDA',
        'MASERATI', 'MERCEDES-BENZ', 'MERCEDES', 'MG', 'MINI', 'MITSUBISHI', 'NISSAN', 'OMODA', 'OPEL', 'PEUGEOT', 'POLESTAR', 'PORSCHE', 'RENAULT', 'SAAB', 'SEAT',
        'SKODA', 'ŠKODA', 'SMART', 'SPORTEQUIPE', 'SSANGYONG', 'KGM', 'SUBARU', 'SUZUKI', 'SWM', 'TESLA', 'TIGER', 'TOYOTA', 'VOLKSWAGEN', 'VW', 'VOLVO', 'XPENG'];
    const NOME_MARCA = { 'CITROËN': 'CITROEN', 'MERCEDES': 'MERCEDES-BENZ', 'ŠKODA': 'SKODA', 'VW': 'VOLKSWAGEN', 'KGM': 'SSANGYONG' };
    const N = '(\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:[.,]\\d+)?)';

    // "1.999,99" "266,43" "15081.97" "26.000.000" "36000" -> numero
    function num(s) {
        if (s == null) return null;
        let t = String(s).replace(/[€\s]/g, '').replace(/[^\d.,]/g, '');
        if (!t) return null;
        if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
        else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
        else if (/^\d{1,3}\.\d{3}$/.test(t)) t = t.replace('.', '');
        const v = parseFloat(t);
        return isFinite(v) ? v : null;
    }
    const r2 = v => v == null ? null : Math.round(v * 100) / 100;
    const trova = (testo, re, g) => { const m = testo.match(re); return m ? m[g || 1] : null; };
    const dopo = (righe, re) => { const i = righe.findIndex(l => re.test(l)); return i >= 0 && i + 1 < righe.length ? righe[i + 1] : null; };
    const colonna0 = s => s ? s.split(/\s{3,}/)[0].trim() : null;

    function riconosciPortale(tutto, file) {
        const t = tutto.toLowerCase(), f = String(file || '').toLowerCase();
        if (/arval/.test(t)) return 'Arval';
        if (/agos renting/.test(t)) return 'Agos';
        if (/ayvens|ald automotive|\bald\b/.test(t)) return 'Ayvens';
        if (/leasys/.test(t)) return 'Leasys';
        if (/unipol\s*rental/.test(t)) return 'UnipolRental';
        if (/alphabet/.test(t)) return 'Alphabet';
        if (/athlon/.test(t)) return 'Athlon';
        if (/free2move/.test(t)) return 'Free2Move';
        if (/ayvens|ald/.test(f)) return 'Ayvens';
        if (/arval/.test(f)) return 'Arval';
        if (/agos/.test(f)) return 'Agos';
        return 'Altro';
    }

    // riga che inizia con una marca -> { marca, modello, versione, descrizione }
    function veicoloDa(righe) {
        const up = MARCHE.slice().sort((a, b) => b.length - a.length);
        for (const l0 of righe) {
            const l = l0.replace(/^\s*(Veicolo|Marca \/ Modello[^:]*)\s*:\s*/i, '');
            const U = l.toUpperCase();
            const m = up.find(b => U.startsWith(b + ' '));
            if (!m || /^Veicolo:/i.test(l0)) continue;
            const desc = colonna0(l);
            if (!desc || desc.length < m.length + 2) continue;
            const marca = NOME_MARCA[m] || m;
            let resto = desc.slice(m.length).trim();
            const parti = resto.split(/\s+\/\s+/);
            const modello = (parti[0] || '').split(/\s+/)[0] || '';
            let versione = parti.length > 1
                ? parti.slice(1).filter(p => !/^\d{4}$/.test(p) && !/^\dP$/i.test(p) && !/^(berlina|suv|station wagon|sw|hatchback|crossover|monovolume|coupe|cabrio|furgone)$/i.test(p)).join(' ')
                : (parti[0] || '').split(/\s+/).slice(1).join(' ');
            versione = (parti.length > 1 ? (parti[0].split(/\s+/).slice(1).join(' ') + ' ' + versione) : versione).replace(/\(PROMO[^)]*\)/ig, '').replace(/\s+/g, ' ').trim();
            return { marca, modello: modello.toUpperCase(), versione, descrizione: desc.replace(/\s+/g, ' ').trim(), riga: l0 };
        }
        return null;
    }

    function alimentazioneDa(s) {
        const t = String(s || '').toLowerCase();
        if (/plug[- ]?in|phev/.test(t)) return 'Plug-in';
        if (/elettric|\bev\b|bev\b|e-tech electric|full electric/.test(t)) return 'Elettrica';
        if (/hybrid|ibrid|mhev|hev/.test(t)) return 'Ibrida';
        if (/diesel|gasolio|\bd\b|tdi|hdi|crdi|multijet|bluehdi|dci/.test(t)) return 'Diesel';
        if (/gpl/.test(t)) return 'GPL';
        if (/metano/.test(t)) return 'Metano';
        if (/benzina|tsi|tce|puretech|turbo|mpi|t-gdi/.test(t)) return 'Benzina';
        return '';
    }

    const SOCIETA = /\b(S\.?\s?R\.?\s?L\.?\s?S?|S\.?\s?P\.?\s?A\.?|S\.?\s?N\.?\s?C\.?|S\.?\s?A\.?\s?S\.?|S\.?C\.?A\.?R\.?L\.?|SOC\.?|SOCIETA'?|SOCIETÀ|COOP|COOPERATIVA|CONSORZIO|ONLUS|ASSOCIAZIONE|FONDAZIONE|IMPRESA|GROUP|HOLDING)\b/i;
    function tipoClienteDa(cliente, cf, piva) {
        if (cliente && SOCIETA.test(cliente)) return 'AZIENDA';
        if (cf && /^\d{11}$/.test(cf)) return 'AZIENDA';
        if (piva) return 'PIVA';
        return 'PRIVATO';
    }

    // Legge una quotazione dalle righe del PDF. Restituisce i dati con IVA esclusa
    // e IVA inclusa gia' calcolati, piu' gli avvisi su cosa non si e' trovato.
    function leggiQuotazione(righe, file) {
        const pag1 = righe.slice(0, Math.max(1, righe.indexOf('<<PAGINA>>')));
        const t1 = pag1.join('\n'), tutto = righe.join('\n');
        const portale = riconosciPortale(tutto, file);
        const q = { portale, file: file || '', avvisi: [] };
        let canone = null, canoneIncl = null, anticipo = null, ivaCanone = null, ivaAnticipo = null;

        if (portale === 'Ayvens') {
            const m = t1.match(/(\d{5,}\/\d{1,4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/);
            if (m) { q.numero = m[1]; q.data = m[2]; q.scadenza = m[3]; }
            q.cliente = colonna0(dopo(pag1, /^\s*SPETT\.?\s?LE\b/i));
            canone = num(trova(t1, new RegExp('CANONE\\s+' + N + '\\s*€?\\s*/\\s*MESE', 'i')));
            anticipo = num(trova(t1, new RegExp('ANTICIPO\\s+' + N + '\\s*€', 'i')));
            q.mesi = num(trova(t1, /DURATA\s+(\d+)/i));
            q.kmTotali = num(trova(t1, new RegExp('KM TOTALI\\s+' + N, 'i')));
            q.listinoEscl = num(trova(t1, new RegExp('Totale veicolo\\s+' + N, 'i'))) || num(trova(t1, new RegExp('Listino\\s+' + N, 'i')));
            q.quotaServiziEscl = num(trova(t1, new RegExp('\\bServizi\\s+' + N + '\\s*€', 'i')));
            q.quotaNoleggioEscl = num(trova(t1, new RegExp('Puro noleggio\\s+' + N, 'i')));
            q.alimentazione = alimentazioneDa(trova(t1, /Motorizzazione:?\s+([^\n]+?)(\s{3}|\n|$)/i));
            const pn = trova(t1, /\bPneumatici\s+(Si|No)\b/i), so = trova(t1, /Sostituzione Veicolo\s+(Si|No)\b/i);
            if (pn) q.pneumatici = /si/i.test(pn);
            if (so) q.sostitutiva = /si/i.test(so);
            ivaCanone = ivaAnticipo = /IVA esclusa/i.test(t1) ? 'ESCL' : 'ESCL';
        } else if (portale === 'Arval') {
            q.numero = (trova(t1, /Offerta n°\s+(\d+\s*\/\s*\d+)/i) || '').replace(/\s+/g, '') || null;
            q.cliente = (trova(t1, /Ragione Sociale\s+([^\n]+?)(\s{3}|\n|$)/i) || trova(t1, /(?:Nome e Cognome|Cliente)\s*:?\s+([^\n]+?)(\s{3}|\n|$)/i));
            q.cf = trova(t1, /CF Cliente\s+([A-Z0-9]{11,16})/i);
            q.scadenza = trova(t1, /Data validit[àa]\s+(\d{2}\/\d{2}\/\d{4})/i);
            canone = num(trova(t1, new RegExp('Canone\\s+' + N + '\\s*€\\s*/\\s*mese', 'i')));
            q.mesi = num(trova(t1, /durata\s+(\d+)\s*mesi/i));
            q.kmTotali = num(trova(t1, new RegExp('km totali\\s+' + N, 'i')));
            const ma = t1.match(new RegExp('Anticipo\\s*\\*?\\s+' + N + '\\s*€\\s*(\\+\\s*IVA)?', 'i'));
            anticipo = ma ? num(ma[1]) : null;
            ivaAnticipo = ma && ma[2] ? 'ESCL' : (/IVA esclusa/i.test(t1) ? 'ESCL' : 'INCL');
            ivaCanone = /IVA esclusa/i.test(t1) ? 'ESCL' : /IVA inclusa/i.test(t1) ? 'INCL' : 'ESCL';
            const lis = num(trova(t1, new RegExp('Prezzo di Listino\\s*\\[\\d\\]:\\s*' + N, 'i')));
            const opt = num(trova(t1, new RegExp('Prezzo di Listino Optional\\s*\\[\\d\\]:\\s*' + N, 'i')));
            const aft = num(trova(t1, new RegExp('Prezzo Accessori AfterMarket:\\s*' + N, 'i')));
            if (lis != null) q.listinoEscl = r2(lis + (opt || 0) + (aft || 0));
            q.quotaServiziEscl = num(trova(t1, new RegExp('Quota Servizi\\s+' + N, 'i')));
            q.quotaNoleggioEscl = num(trova(t1, new RegExp('Quota Locazione\\s+' + N, 'i')));
            q.alimentazione = alimentazioneDa(trova(t1, /Motorizzazione\s+([^\n,]+)/i));
            if (/No pneumatici/i.test(t1)) q.pneumatici = false; else if (/•\s*Pneumatici/i.test(t1)) q.pneumatici = true;
            if (/No Veicolo sostitutivo/i.test(t1)) q.sostitutiva = false; else if (/•\s*Veicolo sostitutivo/i.test(t1)) q.sostitutiva = true;
        } else if (portale === 'Agos') {
            q.numero = trova(t1, /Richiesta nr\.\s+([A-Z0-9]+)/i);
            q.data = trova(t1, /Data offerta:\s*(\d{2}\/\d{2}\/\d{4})/i);
            q.cliente = colonna0(dopo(pag1, /^\s*Richiedente\b/i));
            q.cf = trova(t1, /C\.F\.\s+([A-Z0-9]{11,16})/i);
            const iHead = pag1.findIndex(l => /Anticipo\s*\(iva/i.test(l));
            if (iHead >= 0) {
                ivaAnticipo = /iva\s*escl/i.test(pag1[iHead]) ? 'ESCL' : 'INCL';
                const v = pag1[iHead + 1] || '';
                anticipo = num(trova(v, new RegExp('^\\s*' + N + '\\s*€')));
                q.mesi = num(trova(v, /(\d+)\s*mesi/i));
                q.kmAnnui = num(trova(v, new RegExp(N + '\\s*Km', 'i')));
            }
            const esc = pag1.find(l => /^\s*IVA escl\./i.test(l)), inc = pag1.find(l => /^\s*IVA incl\./i.test(l));
            const nn = l => l ? (l.match(new RegExp(N + '\\s*€', 'g')) || []).map(x => num(x)) : [];
            const e = nn(esc), i = nn(inc);
            canone = e[0] != null ? e[0] : null; canoneIncl = i[0] != null ? i[0] : null; ivaCanone = 'ESCL';
            if (e[1] != null) q.quotaServiziEscl = e[1];
            if (e[2] != null) q.quotaNoleggioEscl = e[2];
            q.speseEscl = num(trova(t1, new RegExp('Spese istruttoria pratica:\\s*' + N, 'i')));
            if (/Km\s*0\b/i.test(t1)) q.stato = 'Km 0'; else if (/\busato\b/i.test(t1)) q.stato = 'Usato';
            const pa = trova(t1, /Pneumatici aggiuntivi:\s*(\d+)/i);
            if (pa != null) q.pneumatici = +pa > 0;
            q.sostitutiva = /Veicolo sostitutivo/i.test(t1) ? true : null;
        }

        // ---- valori comuni / di riserva (anche per portali non ancora conosciuti) ----
        const v = veicoloDa(pag1);
        if (v) {
            q.marca = v.marca; q.modello = v.modello; q.versione = v.versione; q.veicolo = v.descrizione;
            if (portale === 'Arval') {   // la descrizione Arval continua sulla riga sotto (es. "S&S MAX")
                const k = pag1.indexOf(v.riga), sotto = pag1[k + 1] || '';
                if (sotto && sotto.length < 30 && !/\s{3}|:|il veicolo/i.test(sotto)) { q.versione = (q.versione + ' ' + sotto.trim()).trim(); q.veicolo += ' ' + sotto.trim(); }
            }
            if (portale === 'Agos') {   // stessa riga: listino, optional, totale (IVA inclusa)
                const nums = (v.riga.match(new RegExp(N + '\\s*€', 'g')) || []).map(x => num(x));
                const head = pag1.find(l => /Listino IVA (inclusa|esclusa)/i.test(l)) || '';
                const tot = nums[nums.length - 1];
                if (tot) q.listinoEscl = /esclusa/i.test(head) ? tot : r2(tot / (1 + IVA));
            }
            if (!q.alimentazione) q.alimentazione = alimentazioneDa(v.descrizione);
        }
        if (canone == null) { canone = num(trova(t1, new RegExp('canone[^\\d\\n]{0,40}' + N, 'i'))); if (canone != null) q.avvisi.push('canone letto in modo generico: controllalo'); }
        if (anticipo == null) { const a = trova(t1, new RegExp('anticipo[^\\d\\n]{0,40}' + N, 'i')); anticipo = a != null ? num(a) : null; }
        if (q.mesi == null) q.mesi = num(trova(t1, /(\d{2})\s*mesi/i));
        if (q.kmTotali == null && q.kmAnnui != null && q.mesi) q.kmTotali = Math.round(q.kmAnnui * q.mesi / 12);
        if (q.kmAnnui == null && q.kmTotali != null && q.mesi) q.kmAnnui = Math.round(q.kmTotali / q.mesi * 12);
        if (!ivaCanone) ivaCanone = /iva\s+inclusa/i.test(t1) && !/iva\s+esclusa/i.test(t1) ? 'INCL' : 'ESCL';
        if (!ivaAnticipo) ivaAnticipo = ivaCanone;
        if (!q.stato) q.stato = 'Nuovo';

        // ---- IVA: si tengono sempre tutti e due i valori ----
        if (canone != null) {
            if (ivaCanone === 'INCL') { q.canoneIncl = canone; q.canoneEscl = r2(canone / (1 + IVA)); }
            else { q.canoneEscl = canone; q.canoneIncl = canoneIncl != null ? canoneIncl : r2(canone * (1 + IVA)); }
        }
        if (anticipo == null) { anticipo = 0; q.avvisi.push('anticipo non trovato: considerato 0'); }
        if (ivaAnticipo === 'INCL') { q.anticipoIncl = anticipo; q.anticipoEscl = r2(anticipo / (1 + IVA)); }
        else { q.anticipoEscl = anticipo; q.anticipoIncl = r2(anticipo * (1 + IVA)); }
        q.ivaCanone = ivaCanone; q.ivaAnticipo = ivaAnticipo;

        // ---- tipo di cliente ----
        const piva = trova(t1, /(?:P\.?\s?IVA|Partita\s+IVA)\s*(?:cliente)?\s*:?\s*(\d{11})/i);
        q.tipoCliente = tipoClienteDa(q.cliente, q.cf, piva);
        if (q.cliente) q.cliente = q.cliente.replace(/\s+/g, ' ').trim();
        if (!q.data) q.data = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

        if (portale === 'Altro') q.avvisi.push('portale non riconosciuto: controlla tutti i valori');
        if (q.canoneEscl == null) q.avvisi.push('canone non trovato');
        if (!q.mesi) q.avvisi.push('durata non trovata');
        if (!q.kmTotali) q.avvisi.push('km non trovati');
        if (!q.cliente) q.avvisi.push('cliente non trovato');
        if (!q.marca) q.avvisi.push('veicolo non riconosciuto');
        return q;
    }

    /* ================= CALCOLI ================= */
    // base INCL = IVA inclusa (privato), ESCL = + IVA (P.IVA, azienda)
    const baseDi = q => q.tipoCliente === 'PRIVATO' ? 'INCL' : 'ESCL';
    function costi(q, base) {
        base = base || baseDi(q);
        const inc = base === 'INCL';
        const canone = inc ? q.canoneIncl : q.canoneEscl, anticipo = (inc ? q.anticipoIncl : q.anticipoEscl) || 0;
        const spese = (q.speseEscl || 0) * (inc ? 1 + IVA : 1), mesi = q.mesi || 0;
        const totale = canone != null && mesi ? anticipo + canone * mesi + spese : null;
        const totEscl = q.canoneEscl != null && mesi ? (q.anticipoEscl || 0) + q.canoneEscl * mesi + (q.speseEscl || 0) : null;
        return {
            base, canone, anticipo, spese, totale,
            mensile: totale != null ? totale / mesi : null,
            alKm: totale != null && q.kmTotali ? totale / q.kmTotali : null,
            suListino: totEscl != null && q.listinoEscl ? totEscl / q.listinoEscl : null
        };
    }

    if (typeof document === 'undefined') {   // prove fuori dal browser (node)
        if (typeof module !== 'undefined') module.exports = { righeDaPdf, leggiQuotazione, costi, num };
        return;
    }

    /* ================= STATO E UTILITA' ================= */
    let quot = [], puoModificare = false, livelloAcc = null, caricato = false, rootEl = null, pdfMaxKb = 200 * 1024;
    const st = { portale: 'Tutti', ordina: 'mensile', tipoTab: 'PRIVATO', cerca: null, elencoQ: '', mese: '', grafici: [] };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const eur = (v, dec) => v == null || !isFinite(v) ? '–' : v.toLocaleString('it-IT', { minimumFractionDigits: dec == null ? 2 : dec, maximumFractionDigits: dec == null ? 2 : dec }) + ' €';
    const nf = v => v == null ? '–' : Math.round(v).toLocaleString('it-IT');
    const pct = (a, b) => b ? (a / b * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + '%' : '–';
    const ivaLab = base => base === 'INCL' ? 'IVA incl.' : '+ IVA';
    const dataNum = d => { const m = String(d || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? +(m[3] + m[2] + m[1]) : 0; };
    const nomeVeicolo = q => [q.marca, q.modello].filter(Boolean).join(' ') || q.veicolo || 'Veicolo';
    const mediana = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const media = a => { const s = a.filter(x => x != null); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; };
    const contaPer = (arr, fn) => { const m = new Map(); arr.forEach(x => { const k = fn(x); if (k == null || k === '') return; m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
    const kmLab = k => k == null ? '–' : (Math.round(k / 1000) * 1000).toLocaleString('it-IT') + ' km/anno';
    const conAnticipo = q => (q.anticipoEscl || 0) > 0;
    const tipoQuotazione = q => `${q.mesi || '?'} mesi · ${kmLab(q.kmAnnui)} · ${conAnticipo(q) ? 'con anticipo' : 'senza anticipo'}`;
    const delPortale = () => st.portale === 'Tutti' ? quot : quot.filter(q => q.portale === st.portale);
    const ordinaPer = (lista, base) => {
        const k = st.ordina === 'km' ? 'alKm' : st.ordina === 'listino' ? 'suListino' : 'mensile';
        return lista.map(q => ({ q, c: costi(q, base) })).filter(x => x.c[k] != null).sort((a, b) => a.c[k] - b.c[k]);
    };

    // NUOVO: offerte uguali (stesso portale, auto, durata, km, canone e anticipo) contate una volta sola
    // nelle classifiche, con "richiesta N volte"; per la top 5 anche una sola offerta per auto.
    const nV = t => String(t || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const condKey = q => [q.portale, nV(q.marca), nV(q.modello), nV(q.versione), q.mesi, Math.round(q.kmTotali || 0), Math.round(q.canoneEscl || 0), Math.round(q.anticipoEscl || 0)].join('|');
    function unici(lista, perAuto) {     // lista gia' ordinata: si tiene la prima (la migliore) di ogni gruppo
        const g = new Map(), out = [];
        lista.forEach(x => {
            const k = perAuto ? nV(x.q.marca) + '|' + nV(x.q.modello) : condKey(x.q);
            const y = g.get(k);
            if (y) { if (perAuto) y.nAuto += 1; else y.n += 1; }
            else { const z = Object.assign({ n: 1, nAuto: 1 }, x); g.set(k, z); out.push(z); }
        });
        return out;
    }
    const meseDi = q => { const m = String(q.data || '').match(/\d{2}\/(\d{2})\/(\d{4})/); return m ? m[2] + '-' + m[1] : ''; };
    const MESI_IT = ['', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    const nomeMese = k => { const [y, m] = k.split('-'); return MESI_IT[+m] + ' ' + y; };
    const mb = kb => (kb / 1024).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' MB';

    async function api(url, opt) {
        const r = await fetch(url, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, opt || {}));
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || ('Errore ' + r.status));
        return d;
    }

    /* ================= DOVE SI APRE: MENU O PULSANTE NEL RENT ================= */
    const IN_BOUND = ['DASHBOARD', 'FOLLOWUPS', 'WAITING', 'CONTACTS', 'PREVENTIVI', 'PROMO', 'RENT', 'SERVICE', 'VEICOLI', 'GRAFICI'];
    const vedeSez = s => typeof hasAccess === 'function' ? hasAccess(s) : false;
    function sezioniInBound() { return IN_BOUND.filter(vedeSez).length; }
    // "menu" = voce Quotazioni Rent in alto; "rent" = pulsante 📝 dentro Rent; null = niente
    function dove() {
        if (!livelloAcc || livelloAcc === 'NONE') return null;
        if (!vedeSez('RENT')) return 'menu';          // senza Rent il pulsante non si vedrebbe mai
        return sezioniInBound() > 7 ? 'rent' : 'menu';
    }
    let nDaVerificare = 0;
    async function refreshNav() {
        if (typeof currentUser === 'undefined' || !currentUser) return;
        try { const d = await api('/api/quotazioni-rent/accesso'); livelloAcc = d.livello || 'NONE'; nDaVerificare = +d.daVerificare || 0; }
        catch (e) { livelloAcc = livelloAcc || 'NONE'; }
        const w = dove();
        const nav = document.getElementById('navQuotazioni'), btn = document.getElementById('rentQuotBtn');
        if (nav) nav.style.display = w === 'menu' ? 'inline-block' : 'none';
        if (btn) btn.style.display = w === 'rent' ? '' : 'none';
        // NUOVO: numerino rosso = quotazioni da verificare (ancora valide?)
        // chi ha il pulsante 📝 dentro Rent vede il numerino anche sulla voce Rent del menu
        const navRent = document.getElementById('navRent');
        [[nav, w === 'menu'], [btn, w === 'rent'], [navRent, w === 'rent']].forEach(([el, si]) => {
            if (!el) return;
            let b = el.querySelector('.qr-nbadge');
            if (!nDaVerificare || !si) { if (b) b.remove(); return; }
            if (!b) { b = document.createElement('span'); b.className = 'qr-nbadge'; el.appendChild(b); }
            b.textContent = nDaVerificare; b.title = nDaVerificare + (nDaVerificare === 1 ? ' quotazione da verificare' : ' quotazioni da verificare');
        });
        if (livelloAcc && livelloAcc !== 'NONE') inTempoReale();
        // dopo un aggiornamento della pagina su #quotazioni: ora che il permesso e' noto, si apre
        if (w && location.hash === '#quotazioni' && document.getElementById('quotazioniPage')?.style.display === 'none' && typeof showPage === 'function') showPage('quotazioni', false);
    }
    const livello = () => livelloAcc;

    /* ================= IN TEMPO REALE =================
       Ogni modifica (import, eliminazione, correzione, PDF, verifica) arriva subito a tutti:
       il server avvisa sul canale /topic/quotazioni (stesso sistema del Rent) e qui si
       ricaricano i dati. Se si sta scrivendo in un campo, si aspetta che si finisca. */
    let stomp = null, attesa = null, dopoFocus = false;
    function inTempoReale() {
        if (stomp || typeof StompJs === 'undefined' || typeof SockJS === 'undefined') return;
        stomp = new StompJs.Client({
            webSocketFactory: () => new SockJS('/ws'), reconnectDelay: 5000,
            onConnect: () => {
                stomp.subscribe('/topic/quotazioni', () => { clearTimeout(attesa); attesa = setTimeout(arrivate, 300); });
                if (caricato) arrivate();   // dopo una riconnessione: si recupera quello che e' cambiato nel frattempo
            }
        });
        stomp.activate();
    }
    function arrivate() {
        refreshNav();
        if (!rootEl || rootEl.offsetParent === null) return;
        const a = document.activeElement;
        if (a && rootEl.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { dopoFocus = true; return; }
        carica(true);
    }
    document.addEventListener('focusout', () => { if (dopoFocus) setTimeout(() => { const a = document.activeElement; if (!(a && rootEl && rootEl.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))) { dopoFocus = false; carica(true); } }, 50); });

    /* ================= CONTROLLO DI VALIDITA' =================
       30 giorni dopo il caricamento si chiede se la quotazione e' ancora valida:
       si -> ricontrollo tra 15 giorni; no -> eliminata (dati e PDF). */
    const oggiIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    function prossimoControllo(q) {
        if (q.prossimoControllo) return String(q.prossimoControllo).slice(0, 10);
        const c = String(q.caricataIl || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(c)) return null;
        const d = new Date(c + 'T12:00:00'); d.setDate(d.getDate() + 30);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    const daVerif = q => { const p = prossimoControllo(q); return !!p && p <= oggiIso(); };
    const itData = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '–';
    const giorniDa = iso => { if (!iso) return null; return Math.round((new Date(oggiIso() + 'T12:00:00') - new Date(String(iso).slice(0, 10) + 'T12:00:00')) / 864e5); };

    /* ================= PAGINA ================= */
    function shell() {
        rootEl.innerHTML = `
          <div class="qr-head">
            <div>
              <button type="button" class="qr-back" data-act="rent" hidden>← Torna al Rent</button>
              <h2>📝 QUOTAZIONI RENT</h2>
              <p class="qr-sub">Le quotazioni dei portali di noleggio: quali convengono davvero, cosa si cerca di più, su cosa puntare</p>
            </div>
            <div class="qr-head-a">
              <input type="file" id="qrFile" accept=".pdf,application/pdf" multiple hidden>
              <button type="button" class="qr-btn go" data-act="importa" hidden title="Oppure trascina i PDF in un punto qualsiasi della pagina">📥 Importa quotazioni PDF</button>
            </div>
          </div>
          <div class="qr-msg" hidden></div>
          <div class="qr-drop" hidden><div><b>📥 Rilascia qui i PDF delle quotazioni</b><span>Puoi trascinarne anche più di uno insieme</span></div></div>
          <div class="qr-tabs" role="tablist"></div>
          <div class="qr-body"></div>`;
        rootEl.addEventListener('click', clic);
        rootEl.addEventListener('change', cambia);
        rootEl.addEventListener('input', e => { if (e.target.matches('[data-elq]')) { st.elencoQ = e.target.value; disegnaElenco(); } });
        rootEl.querySelector('#qrFile').addEventListener('change', e => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) importa(f); });
        trascina();
    }

    // NUOVO: trascinando uno o piu' PDF sulla pagina parte l'import (come un allegato in una mail)
    function trascina() {
        let dentro = 0;
        const attiva = () => rootEl && rootEl.offsetParent !== null && puoModificare && !document.querySelector('.qr-ov');
        const sonoFile = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
        const area = () => rootEl.querySelector('.qr-drop');
        const spegni = () => { dentro = 0; area().hidden = true; };
        window.addEventListener('dragenter', e => { if (!sonoFile(e) || !attiva()) return; e.preventDefault(); dentro++; area().hidden = false; });
        window.addEventListener('dragover', e => { if (!sonoFile(e) || !attiva()) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
        window.addEventListener('dragleave', e => { if (!sonoFile(e) || !attiva()) return; dentro = Math.max(0, dentro - 1); if (!dentro) area().hidden = true; });
        window.addEventListener('drop', e => {
            if (!sonoFile(e) || !attiva()) return;
            e.preventDefault(); spegni();                 // senza, il browser aprirebbe il PDF al posto del CRM
            const tutti = [...(e.dataTransfer.files || [])];
            const pdf = tutti.filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
            if (!pdf.length) { messaggio('⚠️ Trascina dei file PDF: ' + (tutti.length === 1 ? 'questo file non è' : 'questi file non sono') + ' un PDF.', 'err'); return; }
            if (pdf.length < tutti.length) messaggio(`⚠️ ${tutti.length - pdf.length} file non PDF ignorati.`, 'err'); else messaggio('');
            importa(pdf);
        });
    }

    function messaggio(t, tipo) {
        const m = rootEl.querySelector('.qr-msg');
        if (!t) { m.hidden = true; return; }
        m.hidden = false; m.className = 'qr-msg ' + (tipo || ''); m.innerHTML = t;
    }

    async function carica(silenzioso) {
        try {
            const d = await api('/api/quotazioni-rent');
            quot = (d.quotazioni || []).filter(q => q && q.canoneEscl != null && q.mesi);
            puoModificare = !!d.puoModificare;
            if (d.pdfMaxKb) pdfMaxKb = d.pdfMaxKb;
            caricato = true;
            if (!silenzioso) messaggio('');
        } catch (e) { messaggio('⚠️ ' + esc(e.message), 'err'); quot = []; }
        disegna();
    }

    function disegna() {
        if (!rootEl) return;
        rootEl.querySelector('[data-act="importa"]').hidden = !puoModificare;
        rootEl.querySelector('.qr-back').hidden = dove() !== 'rent';
        const portali = [...new Set(quot.map(q => q.portale))].sort((a, b) => quot.filter(q => q.portale === b).length - quot.filter(q => q.portale === a).length);
        if (st.portale !== 'Tutti' && !portali.includes(st.portale)) st.portale = 'Tutti';
        rootEl.querySelector('.qr-tabs').innerHTML = ['Tutti'].concat(portali).map(p => {
            const n = p === 'Tutti' ? quot.length : quot.filter(q => q.portale === p).length;
            return `<button type="button" role="tab" aria-selected="${st.portale === p}" class="${st.portale === p ? 'on' : ''}" data-portale="${esc(p)}">${p === 'Tutti' ? '🗂️ Tutti i portali' : esc(p)} <b>${n}</b></button>`;
        }).join('');
        const body = rootEl.querySelector('.qr-body');
        distruggiGrafici();
        if (!quot.length) {
            body.innerHTML = `<div class="qr-card qr-vuoto"><div style="font-size:44px">📝</div><h3>Nessuna quotazione caricata</h3>
              <p>${puoModificare ? 'Trascina qui i PDF dei portali (Ayvens, Arval, Agos…) oppure premi <b>📥 Importa quotazioni PDF</b>. Puoi caricarne anche più di uno insieme.' : 'Le quotazioni compariranno qui quando qualcuno le importa.'}</p></div>`;
            return;
        }
        const L = delPortale();
        const dv = puoModificare ? quot.filter(daVerif) : [];
        body.innerHTML = `
          ${dv.length ? `<div class="qr-verif"><div><b>⏰ ${dv.length === 1 ? '1 quotazione da verificare' : dv.length + ' quotazioni da verificare'}</b>
              <span>Caricate da più di 30 giorni (o rimandate di 15): sono ancora valide? Quelle non più valide si eliminano, le altre si ricontrollano tra 15 giorni.</span></div>
              <button type="button" class="qr-btn go" data-act="verifiche">Controlla ${dv.length === 1 ? 'ora' : 'l\'elenco'}</button></div>` : ''}
          ${kpi(L)}
          <section class="qr-card qr-cerca-card"><h3>🔍 Cosa stai cercando?</h3><p class="qr-hint">Imposta anticipo, rata e il resto: ti mostro le quotazioni caricate che si avvicinano di più, dalla più conveniente.</p>${formCerca()}<div class="qr-cerca-ris"></div></section>
          <section class="qr-card"><div class="qr-card-h"><h3>🏆 Top 5 quotazioni${st.portale === 'Tutti' ? '' : ' · ' + esc(st.portale)}</h3>${selOrdina()}</div>
            <p class="qr-hint">Le più convenienti, una per auto (così non escono 5 volte le stesse), confrontate tutte + IVA: privati e aziende sulla stessa base.</p>${top5(L)}</section>
          <section class="qr-card"><div class="qr-card-h"><h3>📊 Classifiche per tipo di cliente</h3>${selOrdina()}</div>
            <div class="qr-ttabs">${Object.entries(TIPI).map(([k, l]) => `<button type="button" class="${st.tipoTab === k ? 'on' : ''}" data-tipotab="${k}">${l} <b>${L.filter(q => q.tipoCliente === k).length}</b></button>`).join('')}</div>
            <div class="qr-classifica">${classifica(L)}</div></section>
          <section class="qr-card"><h3>📈 Cosa gira di più${st.portale === 'Tutti' ? '' : ' su ' + esc(st.portale)}</h3>${piuRichieste(L)}
            <div class="qr-charts">
              <div class="qr-ch"><h4>Tipo di cliente</h4><div class="qr-ch-b"><canvas id="qrChTipo"></canvas></div></div>
              <div class="qr-ch"><h4>Durata</h4><div class="qr-ch-b"><canvas id="qrChDurata"></canvas></div></div>
              <div class="qr-ch"><h4>Km all'anno</h4><div class="qr-ch-b"><canvas id="qrChKm"></canvas></div></div>
              <div class="qr-ch"><h4>Fasce di canone (+ IVA)</h4><div class="qr-ch-b"><canvas id="qrChCanone"></canvas></div></div>
              <div class="qr-ch"><h4>Con o senza anticipo</h4><div class="qr-ch-b"><canvas id="qrChAnticipo"></canvas></div></div>
              <div class="qr-ch"><h4>Alimentazione</h4><div class="qr-ch-b"><canvas id="qrChAlim"></canvas></div></div>
              <div class="qr-ch qr-wide"><h4>Marche più quotate</h4><div class="qr-ch-b tall"><canvas id="qrChMarche"></canvas></div></div>
              <div class="qr-ch qr-wide"><h4>Quotazioni caricate per mese</h4><div class="qr-ch-b"><canvas id="qrChMese"></canvas></div></div>
            </div></section>
          ${st.portale === 'Tutti' && [...new Set(quot.map(q => q.portale))].length > 0 ? `<section class="qr-card"><h3>⚖️ Confronto tra portali</h3><p class="qr-hint">Ogni portale con i suoi numeri: costi medi, quotazione tipo, marca più quotata e la sua offerta migliore.</p>${confronto()}</section>` : ''}
          ${archivio(L)}`;
        disegnaElenco();
        grafici(L);
        if (st.cerca) cerca();
    }

    // Le card in alto: le migliori offerte, pronte da cliccare (non medie che non servono a scegliere)
    function kpi(L) {
        const migliore = (lista, base) => unici(ordinaPer(lista, base))[0];
        const card = (ic, titolo, x, nota) => x ? `<button type="button" class="qr-kpi qr-best" data-det="${esc(x.q.id)}">
            <small>${ic} ${titolo}</small><b>${esc(nomeVeicolo(x.q))}</b>
            <strong>${eur(x.c.mensile, 0)}<em>/mese reali ${ivaLab(x.c.base)}</em></strong>
            <span>${eur(x.c.canone, 0)} × ${x.q.mesi} mesi${x.c.anticipo ? ' + ' + eur(x.c.anticipo, 0) + ' anticipo' : ' · senza anticipo'} · ${kmLab(x.q.kmAnnui)}</span>
            <span class="qr-best-p">${esc(x.q.portale)}${nota ? ' · ' + nota : ''}</span></button>`
            : `<div class="qr-kpi qr-best vuota"><small>${ic} ${titolo}</small><b>–</b><span>nessuna quotazione${st.portale === 'Tutti' ? '' : ' su ' + esc(st.portale)}</span></div>`;
        const tq = contaPer(L, tipoQuotazione)[0];
        const esempio = tq ? L.find(q => tipoQuotazione(q) === tq[0]) : null;
        return `<div class="qr-kpis">
          ${card('🏆', 'La più conveniente', migliore(L, 'ESCL'), 'tra tutte, + IVA')}
          ${card('🚫', 'Migliore senza anticipo', migliore(L.filter(q => !conAnticipo(q)), 'ESCL'))}
          ${card('👤', 'Migliore per privato', migliore(L.filter(q => q.tipoCliente === 'PRIVATO'), 'INCL'))}
          ${card('🧾', 'Migliore per P.IVA', migliore(L.filter(q => q.tipoCliente === 'PIVA'), 'ESCL'))}
          ${card('🏢', 'Migliore per azienda', migliore(L.filter(q => q.tipoCliente === 'AZIENDA'), 'ESCL'))}
          ${tq ? `<button type="button" class="qr-kpi qr-best" data-act="cercatipo" data-mesi="${esempio.mesi || ''}" data-km="${esempio.kmAnnui ? Math.round(esempio.kmAnnui / 5000) * 5000 : ''}" data-ant="${conAnticipo(esempio) ? '' : 'no'}">
              <small>🔥 La più richiesta</small><b>${esc(tq[0])}</b><span>${tq[1]} quotazioni su ${L.length} (${pct(tq[1], L.length)})</span><span class="qr-best-p">Clicca per vedere le offerte migliori così</span></button>` : ''}
        </div>`;
    }

    const selOrdina = () => `<label class="qr-ord">Ordina per <select data-ordina>
        <option value="mensile" ${st.ordina === 'mensile' ? 'selected' : ''}>Costo mensile reale</option>
        <option value="km" ${st.ordina === 'km' ? 'selected' : ''}>Costo al km</option>
        <option value="listino" ${st.ordina === 'listino' ? 'selected' : ''}>Costo rispetto al listino</option></select></label>`;

    // riga di un'offerta (top 5, classifiche, ricerca)
    function rigaOfferta(x, i, extra) {
        const q = x.q, c = x.c;
        return `<button type="button" class="qr-off ${i === 0 ? 'best' : ''}" data-det="${esc(q.id)}">
          <span class="qr-pos">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
          <span class="qr-off-v"><b>${esc(nomeVeicolo(q))}</b><small>${esc(q.versione || '')}</small>
            <em><i class="qr-pt">${esc(q.portale)}</i> <i class="qr-tc t-${q.tipoCliente}">${TIPI[q.tipoCliente] || ''}</i> ${esc(q.cliente || '')}${q.data ? ' · ' + esc(q.data) : ''}</em>
            ${x.n > 1 || x.nAuto > 1 ? `<em class="qr-rip">${x.n > 1 ? '🔁 stesse condizioni richieste ' + x.n + ' volte' : ''}${x.n > 1 && x.nAuto > 1 ? ' · ' : ''}${x.nAuto > 1 ? 'la migliore di ' + x.nAuto + ' offerte su questa auto' : ''}</em>` : ''}</span>
          <span class="qr-off-n"><small>Canone</small><b>${eur(c.canone)}</b><em>${ivaLab(c.base)}</em></span>
          <span class="qr-off-n"><small>Anticipo</small><b>${c.anticipo ? eur(c.anticipo, 0) : 'Nessuno'}</b><em>${q.speseEscl ? '+ spese ' + eur(c.spese, 0) : '&nbsp;'}</em></span>
          <span class="qr-off-n"><small>Durata</small><b>${q.mesi} mesi</b><em>${kmLab(q.kmAnnui)}</em></span>
          <span class="qr-off-n hi"><small>${st.ordina === 'km' ? 'Al km' : st.ordina === 'listino' ? 'Sul listino' : 'Mensile reale'}</small>
            <b>${st.ordina === 'km' ? (c.alKm != null ? c.alKm.toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' €' : '–') : st.ordina === 'listino' ? pct(c.suListino, 1) : eur(c.mensile)}</b>
            <em>${st.ordina === 'mensile' ? 'totale ' + eur(c.totale, 0) : 'mensile ' + eur(c.mensile, 0)}</em></span>
          ${extra || ''}
        </button>`;
    }

    function top5(L) {
        const T = unici(unici(ordinaPer(L, 'ESCL')), true).slice(0, 5);   // offerte diverse, una per auto
        return T.length ? `<div class="qr-offs">${T.map((x, i) => rigaOfferta(x, i)).join('')}</div>` : '<p class="qr-hint">Nessuna quotazione completa.</p>';
    }

    function classifica(L) {
        const tipo = st.tipoTab, base = tipo === 'PRIVATO' ? 'INCL' : 'ESCL';
        const R = unici(ordinaPer(L.filter(q => q.tipoCliente === tipo), base));   // offerte uguali una volta sola
        if (!R.length) return `<p class="qr-hint">Nessuna quotazione per ${TIPI[tipo]}${st.portale === 'Tutti' ? '' : ' su ' + esc(st.portale)}.</p>`;
        const mostra = st.tutteClass ? R : R.slice(0, 10);
        return `<p class="qr-hint">${TIPI[tipo]}: importi ${base === 'INCL' ? 'IVA inclusa (il privato paga l\'IVA)' : '+ IVA'}. Il costo mensile reale tiene conto dell'anticipo e delle spese iniziali: 280 € con 3.000 € di anticipo su 36 mesi costa in realtà 363 € al mese.</p>
          <div class="qr-offs">${mostra.map((x, i) => rigaOfferta(x, i)).join('')}</div>
          ${R.length > 10 ? `<button type="button" class="qr-link" data-act="tutteclass">${st.tutteClass ? 'Mostra solo le prime 10' : 'Mostra tutte (' + R.length + ' offerte diverse)'}</button>` : ''}`;
    }

    function piuRichieste(L) {
        const T = contaPer(L, tipoQuotazione).slice(0, 5);
        const M = contaPer(L, q => nomeVeicolo(q)).slice(0, 5);
        const tc = contaPer(L, q => TIPI[q.tipoCliente]);
        if (!T.length) return '';
        return `<div class="qr-piu">
          <div class="qr-piu-top"><small>La quotazione più richiesta</small><b>${esc(T[0][0])}</b><span>${T[0][1]} quotazioni su ${L.length} (${pct(T[0][1], L.length)})${tc[0] ? ' · cliente più frequente: ' + esc(tc[0][0]) : ''}</span></div>
          <div><h4>Le combinazioni più richieste</h4><ol class="qr-ol">${T.map(([k, n]) => `<li><span>${esc(k)}</span><b>${n}</b><i style="width:${n / T[0][1] * 100}%"></i></li>`).join('')}</ol></div>
          <div><h4>I modelli più quotati</h4><ol class="qr-ol">${M.map(([k, n]) => `<li><span>${esc(k)}</span><b>${n}</b><i style="width:${n / M[0][1] * 100}%"></i></li>`).join('')}</ol></div>
        </div>`;
    }

    function confronto() {
        const P = [...new Set(quot.map(q => q.portale))];
        const righe = P.map(p => {
            const L = quot.filter(q => q.portale === p), C = L.map(q => costi(q, 'ESCL'));
            const best = ordinaPer(L, 'ESCL')[0], tq = contaPer(L, tipoQuotazione)[0], mk = contaPer(L, q => q.marca)[0];
            return `<tr><td class="l"><b>${esc(p)}</b></td><td>${L.length}</td><td>${eur(media(L.map(q => q.canoneEscl)), 0)}</td><td>${eur(media(C.map(c => c.mensile)), 0)}</td>
              <td>${pct(L.filter(q => !conAnticipo(q)).length, L.length)}</td><td class="l">${tq ? esc(tq[0]) : '–'}</td><td class="l">${mk ? esc(mk[0]) + ' (' + mk[1] + ')' : '–'}</td>
              <td class="l">${best ? `<button type="button" class="qr-link" data-det="${esc(best.q.id)}">${esc(nomeVeicolo(best.q))} · ${eur(best.c.mensile, 0)}/mese</button>` : '–'}</td></tr>`;
        }).join('');
        return `<div class="qr-scroll"><table class="qr-t"><tr><th class="l">Portale</th><th>Quotazioni</th><th>Canone medio + IVA</th><th>Mensile reale medio + IVA</th><th>Senza anticipo</th><th class="l">Quotazione tipo</th><th class="l">Marca più quotata</th><th class="l">Offerta migliore</th></tr>${righe}</table></div>`;
    }

    // NUOVO: archivio = "cartella" delle quotazioni, divisa per portale (tab in alto) e per mese
    function archivio(L) {
        const mesi = contaPer(L, meseDi).sort((a, b) => b[0].localeCompare(a[0]));
        if (st.mese && !mesi.some(m => m[0] === st.mese)) st.mese = '';
        const usati = quot.reduce((t, q) => t + (+q.pdfKb || 0), 0), nPdf = quot.filter(q => q.pdfKey).length;
        return `<section class="qr-card qr-arch"><div class="qr-card-h"><h3>🗂️ Archivio quotazioni${st.portale === 'Tutti' ? '' : ' · ' + esc(st.portale)}</h3>
            <div class="qr-arch-a"><span class="qr-spazio" title="Spazio usato dai PDF conservati (i dati delle quotazioni non contano: pesano pochissimo)">📎 ${nPdf} PDF · ${mb(usati)} su ${mb(pdfMaxKb)}<i style="width:${Math.min(100, usati / pdfMaxKb * 100)}%"></i></span>
            ${puoModificare && nPdf ? '<button type="button" class="qr-btn" data-act="pulizia">Libera spazio</button>' : ''}
            <input type="search" class="qr-in" data-elq placeholder="Cerca cliente, veicolo, numero…" value="${esc(st.elencoQ)}"></div></div>
          <div class="qr-mesi"><button type="button" class="${st.mese ? '' : 'on'}" data-mese="">📁 Tutti i mesi <b>${L.length}</b></button>${mesi.map(([k, n]) => `<button type="button" class="${st.mese === k ? 'on' : ''}" data-mese="${k}">📁 ${nomeMese(k)} <b>${n}</b></button>`).join('')}</div>
          <div class="qr-elenco"></div></section>`;
    }

    function disegnaElenco() {
        const box = rootEl && rootEl.querySelector('.qr-elenco'); if (!box) return;
        const q0 = st.elencoQ.trim().toLowerCase();
        const L = delPortale().filter(q => (!st.mese || meseDi(q) === st.mese) && (!q0 || [q.cliente, q.veicolo, q.numero, q.portale, q.marca, q.modello].join(' ').toLowerCase().includes(q0)))
            .sort((a, b) => dataNum(b.data) - dataNum(a.data) || String(b.caricataIl || '').localeCompare(String(a.caricataIl || '')));
        if (!L.length) { box.innerHTML = '<p class="qr-hint">Nessuna quotazione trovata.</p>'; return; }
        box.innerHTML = `<div class="qr-scroll"><table class="qr-t qr-el"><tr><th class="l">Data</th><th class="l">Portale</th><th class="l">N°</th><th class="l">Cliente</th><th class="l">Tipo</th><th class="l">Veicolo</th><th>Canone + IVA</th><th>Anticipo + IVA</th><th>Durata</th><th>Km/anno</th><th>Mensile reale</th><th title="PDF conservato">📎</th>${puoModificare ? '<th></th>' : ''}</tr>
          ${L.map(q => { const c = costi(q); return `<tr data-det="${esc(q.id)}"><td class="l">${esc(q.data || '')}</td><td class="l">${esc(q.portale)}</td><td class="l">${esc(q.numero || '')}</td><td class="l">${esc(q.cliente || '–')}</td>
            <td class="l">${puoModificare ? `<select data-tipo="${esc(q.id)}">${Object.entries(TIPI).map(([k, l]) => `<option value="${k}" ${q.tipoCliente === k ? 'selected' : ''}>${l}</option>`).join('')}</select>` : (TIPI[q.tipoCliente] || '')}</td>
            <td class="l">${esc(nomeVeicolo(q))}<small>${esc(q.versione || '')}</small></td><td>${eur(q.canoneEscl)}</td><td>${q.anticipoEscl ? eur(q.anticipoEscl, 0) : '–'}</td><td>${q.mesi}</td><td>${nf(q.kmAnnui)}</td>
            <td><b>${eur(c.mensile, 0)}</b><small>${ivaLab(c.base)}</small></td>
            <td>${q.pdfKey ? `<a class="qr-pdf" href="/api/quotazioni-rent/${encodeURIComponent(q.id)}/pdf" target="_blank" rel="noopener" title="Apri il PDF (${nf(q.pdfKb)} KB)">📎</a>` : '<span class="qr-nopdf" title="PDF non conservato">–</span>'}</td>
            ${puoModificare ? `<td><button type="button" class="qr-del" data-del="${esc(q.id)}" title="Elimina">🗑️</button></td>` : ''}</tr>`; }).join('')}</table></div>`;
    }

    /* ---------- ricerca "cosa stai cercando?" ---------- */
    function formCerca() {
        const c = st.cerca || {};
        const opt = (v, l, sel) => `<option value="${v}" ${String(sel) === String(v) ? 'selected' : ''}>${l}</option>`;
        return `<form class="qr-form" data-cerca>
          <label>Cliente<select name="tipo">${opt('', 'Tutti', c.tipo || '')}${Object.entries(TIPI).map(([k, l]) => opt(k, l, c.tipo)).join('')}</select></label>
          <label>Anticipo<select name="ant">${opt('', 'Indifferente', c.ant || '')}${opt('no', 'Senza anticipo', c.ant)}${opt('max', 'Al massimo…', c.ant)}</select></label>
          <label class="qr-antmax" ${c.ant === 'max' ? '' : 'hidden'}>Anticipo massimo €<input type="number" name="antMax" min="0" step="100" value="${esc(c.antMax || '')}" placeholder="es. 2000"></label>
          <label>Rata intorno a €<input type="number" name="rata" min="0" step="10" value="${esc(c.rata || '')}" placeholder="es. 300"></label>
          <label>La rata è<select name="iva">${opt('ESCL', '+ IVA', c.iva || 'ESCL')}${opt('INCL', 'IVA inclusa', c.iva)}</select></label>
          <label>Tolleranza<select name="tol">${['10', '15', '25', '40'].map(v => opt(v, '± ' + v + '%', c.tol || '15')).join('')}</select></label>
          <label>Durata<select name="mesi">${opt('', 'Tutte', c.mesi || '')}${[24, 36, 48, 60, 72].map(v => opt(v, v + ' mesi', c.mesi)).join('')}</select></label>
          <label>Km all'anno<select name="km">${opt('', 'Tutti', c.km || '')}${[10000, 15000, 20000, 25000, 30000, 40000].map(v => opt(v, 'circa ' + v.toLocaleString('it-IT'), c.km)).join('')}</select></label>
          <label>Alimentazione<select name="alim">${opt('', 'Tutte', c.alim || '')}${['Benzina', 'Diesel', 'Ibrida', 'Plug-in', 'Elettrica', 'GPL'].map(v => opt(v, v, c.alim)).join('')}</select></label>
          <label class="qr-w">Marca o modello<input type="text" name="testo" value="${esc(c.testo || '')}" placeholder="es. Fiat 600, Citroen, i10"></label>
          <div class="qr-form-a"><button type="submit" class="qr-btn go">Cerca</button><button type="button" class="qr-btn" data-act="cercareset">Azzera</button></div>
        </form>`;
    }

    function cerca() {
        const box = rootEl.querySelector('.qr-cerca-ris'); if (!box || !st.cerca) return;
        const c = st.cerca, base = c.iva === 'INCL' ? 'INCL' : 'ESCL', rata = +c.rata || 0, tol = (+c.tol || 15) / 100;
        const parole = String(c.testo || '').toLowerCase().split(/\s+/).filter(Boolean);
        let L = delPortale().filter(q => {
            if (c.tipo && q.tipoCliente !== c.tipo) return false;
            if (c.ant === 'no' && conAnticipo(q)) return false;
            if (c.ant === 'max' && c.antMax !== '' && (base === 'INCL' ? q.anticipoIncl : q.anticipoEscl) > +c.antMax) return false;
            if (c.mesi && q.mesi !== +c.mesi) return false;
            if (c.km && q.kmAnnui && Math.abs(q.kmAnnui - +c.km) > +c.km * 0.25) return false;
            if (c.alim && q.alimentazione !== c.alim) return false;
            if (parole.length) { const h = [q.marca, q.modello, q.versione, q.veicolo].join(' ').toLowerCase(); if (!parole.every(p => h.includes(p))) return false; }
            return true;
        }).map(q => ({ q, c: costi(q, base) })).filter(x => x.c.mensile != null);
        if (!L.length) { box.innerHTML = '<div class="qr-noris">Nessuna quotazione caricata con queste caratteristiche. Prova ad allargare la ricerca (durata, km o anticipo).</div>'; return; }
        let titolo, lista, vicine = false;
        if (rata) {
            const inFascia = L.filter(x => Math.abs(x.c.canone - rata) <= rata * tol);
            if (inFascia.length) { lista = inFascia.sort((a, b) => a.c.mensile - b.c.mensile); titolo = `${inFascia.length} quotazioni con rata tra ${eur(rata * (1 - tol), 0)} e ${eur(rata * (1 + tol), 0)} ${ivaLab(base)}, dalla più conveniente`; }
            else { vicine = true; lista = L.sort((a, b) => Math.abs(a.c.canone - rata) - Math.abs(b.c.canone - rata)).slice(0, 8).sort((a, b) => a.c.mensile - b.c.mensile); titolo = `Nessuna rata intorno a ${eur(rata, 0)}: ecco le ${lista.length} più vicine`; }
        } else { lista = L.sort((a, b) => a.c.mensile - b.c.mensile); titolo = `${L.length} quotazioni trovate, dalla più conveniente`; }
        lista = unici(lista);   // offerte uguali una volta sola
        const mostra = lista.slice(0, 10);
        const extra = x => rata ? `<span class="qr-diff ${x.c.canone <= rata ? 'giu' : 'su'}">${x.c.canone <= rata ? '−' : '+'}${eur(Math.abs(x.c.canone - rata), 0)}<small>dalla rata cercata</small></span>` : '';
        box.innerHTML = `<div class="qr-ris-h ${vicine ? 'warn' : ''}">${esc(titolo)} · importi ${base === 'INCL' ? 'IVA inclusa' : '+ IVA'}</div>
          <div class="qr-offs">${mostra.map((x, i) => rigaOfferta(x, i, extra(x))).join('')}</div>
          ${lista.length > 10 ? `<p class="qr-hint">Mostrate le prime 10 di ${lista.length}.</p>` : ''}`;
    }

    /* ---------- grafici (Chart.js, gia' caricato dal CRM) ---------- */
    function distruggiGrafici() { st.grafici.forEach(g => { try { g.destroy(); } catch (e) { /* */ } }); st.grafici = []; }
    function grafici(L) {
        if (typeof Chart === 'undefined') return;
        const css = getComputedStyle(document.documentElement);
        const ink = (css.getPropertyValue('--text-secondary') || '#9aa3b2').trim() || '#9aa3b2', line = (css.getPropertyValue('--border') || '#2a2e3b').trim() || '#2a2e3b';
        const PAL = ['#2fd47a', '#3fa7ff', '#f4b740', '#b07cf0', '#ff7a59', '#22c3c9', '#e85d9c', '#9aa7bd', '#7ad151', '#f06b6b'];
        const crea = (id, tipo, labels, data, opz) => {
            const el = document.getElementById(id); if (!el) return;
            const ciambella = tipo === 'doughnut';
            st.grafici.push(new Chart(el.getContext('2d'), {
                type: tipo, data: { labels, datasets: [{ data, backgroundColor: ciambella ? PAL : (opz && opz.colore) || '#2fd47a', borderColor: ciambella ? 'transparent' : undefined, borderRadius: ciambella ? 0 : 6, tension: .3, fill: tipo === 'line', pointRadius: 3 }] },
                options: Object.assign({ responsive: true, maintainAspectRatio: false, animation: false,
                    plugins: { legend: { display: ciambella, position: 'bottom', labels: { color: ink, boxWidth: 12, font: { size: 11 } } },
                        tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw} (${pct(c.raw, data.reduce((a, b) => a + b, 0))})` } } },
                    scales: ciambella ? {} : { x: { beginAtZero: true, ticks: { color: ink, precision: 0 }, grid: { color: line } }, y: { beginAtZero: true, ticks: { color: ink, precision: 0 }, grid: { color: line } } } }, opz && opz.options)
            }));
        };
        const tc = Object.keys(TIPI).map(k => [TIPI[k], L.filter(q => q.tipoCliente === k).length]).filter(x => x[1]);
        crea('qrChTipo', 'doughnut', tc.map(x => x[0]), tc.map(x => x[1]));
        const du = contaPer(L, q => q.mesi).sort((a, b) => a[0] - b[0]);
        crea('qrChDurata', 'bar', du.map(x => x[0] + ' mesi'), du.map(x => x[1]));
        const km = contaPer(L, q => q.kmAnnui ? Math.round(q.kmAnnui / 5000) * 5000 : null).sort((a, b) => a[0] - b[0]);
        crea('qrChKm', 'bar', km.map(x => x[0].toLocaleString('it-IT')), km.map(x => x[1]), { colore: '#3fa7ff' });
        const F = [[0, 250], [250, 300], [300, 350], [350, 400], [400, 500], [500, 700], [700, 1e9]];
        const fl = F.map(([a, b]) => b > 1e8 ? 'oltre ' + a : a + '–' + b), fv = F.map(([a, b]) => L.filter(q => q.canoneEscl >= a && q.canoneEscl < b).length);
        crea('qrChCanone', 'bar', fl, fv, { colore: '#f4b740' });
        const an = [['Senza anticipo', L.filter(q => !conAnticipo(q)).length], ['Con anticipo', L.filter(conAnticipo).length]].filter(x => x[1]);
        crea('qrChAnticipo', 'doughnut', an.map(x => x[0]), an.map(x => x[1]));
        const al = contaPer(L, q => q.alimentazione || 'Non indicata');
        crea('qrChAlim', 'doughnut', al.map(x => x[0]), al.map(x => x[1]));
        const mk = contaPer(L, q => q.marca || 'Non indicata').slice(0, 12);
        crea('qrChMarche', 'bar', mk.map(x => x[0]), mk.map(x => x[1]), { colore: '#b07cf0', options: { indexAxis: 'y' } });
        const ms = contaPer(L, q => { const m = String(q.data || '').match(/\d{2}\/(\d{2})\/(\d{4})/); return m ? m[2] + '-' + m[1] : null; }).sort((a, b) => a[0].localeCompare(b[0]));
        crea('qrChMese', 'line', ms.map(x => x[0].split('-').reverse().join('/')), ms.map(x => x[1]), { colore: 'rgba(47,212,122,.25)', options: { elements: { line: { borderColor: '#2fd47a' } } } });
    }

    /* ---------- dettaglio di una quotazione ---------- */
    function finestra(titolo, html, largo) {
        const ov = document.createElement('div');
        ov.className = 'qr-ov';
        ov.innerHTML = `<div class="qr-modal ${largo ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(titolo)}"><div class="qr-m-h"><h3>${esc(titolo)}</h3><button type="button" class="qr-x" data-x aria-label="Chiudi">✕</button></div><div class="qr-m-b">${html}</div></div>`;
        const chiudi = () => { ov.remove(); document.removeEventListener('keydown', esc1); };
        const esc1 = e => { if (e.key === 'Escape' && [...document.querySelectorAll('.qr-ov')].pop() === ov) chiudi(); };   // Esc chiude solo quella in primo piano
        ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-x]')) chiudi(); });
        document.addEventListener('keydown', esc1);
        document.body.appendChild(ov);
        ov.chiudi = chiudi;
        return ov;
    }
    function dettaglio(id) {
        const q = quot.find(x => String(x.id) === String(id)); if (!q) return;
        const ce = costi(q, 'ESCL'), ci = costi(q, 'INCL');
        const f = (l, v) => `<div class="qr-f"><small>${l}</small><b>${v}</b></div>`;
        const sn = v => v === true ? 'Sì' : v === false ? 'No' : '–';
        finestra(`${nomeVeicolo(q)} · ${q.portale}`, `
          <p class="qr-hint">${esc(q.veicolo || '')}</p>
          <div class="qr-grid">
            ${f('Portale', esc(q.portale))}${f('N° quotazione', esc(q.numero || '–'))}${f('Data', esc(q.data || '–'))}
            ${f('Cliente', esc(q.cliente || '–'))}${f('Tipo cliente', TIPI[q.tipoCliente] || '–')}${f('Codice fiscale', esc(q.cf || '–'))}
            ${f('Canone', eur(q.canoneEscl) + ' + IVA · ' + eur(q.canoneIncl) + ' IVA incl.')}${f('Anticipo', q.anticipoEscl ? eur(q.anticipoEscl) + ' + IVA · ' + eur(q.anticipoIncl) + ' IVA incl.' : 'Nessuno')}${f('Spese iniziali', q.speseEscl ? eur(q.speseEscl) + ' + IVA' : '–')}
            ${f('Durata', q.mesi + ' mesi')}${f('Km', nf(q.kmTotali) + ' totali · ' + nf(q.kmAnnui) + ' l\'anno')}${f('Stato veicolo', esc(q.stato || '–'))}
            ${f('Alimentazione', esc(q.alimentazione || '–'))}${f('Listino', q.listinoEscl ? eur(q.listinoEscl, 0) + ' + IVA' : '–')}${f('Di cui servizi', q.quotaServiziEscl ? eur(q.quotaServiziEscl) + ' + IVA' : '–')}
            ${f('Pneumatici', sn(q.pneumatici))}${f('Veicolo sostitutivo', sn(q.sostitutiva))}${f('Caricata', esc((q.caricataDa || '') + (q.caricataIl ? ' · ' + new Date(q.caricataIl).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')))}
          </div>
          <h4 class="qr-h4">Quanto costa davvero</h4>
          <div class="qr-scroll"><table class="qr-t"><tr><th class="l"></th><th>Costo totale</th><th>Mensile reale</th><th>Al km</th><th>Sul listino</th></tr>
            <tr><td class="l">+ IVA (P.IVA, azienda)</td><td>${eur(ce.totale)}</td><td><b>${eur(ce.mensile)}</b></td><td>${ce.alKm != null ? ce.alKm.toLocaleString('it-IT', { maximumFractionDigits: 3 }) + ' €' : '–'}</td><td>${pct(ce.suListino, 1)}</td></tr>
            <tr><td class="l">IVA inclusa (privato)</td><td>${eur(ci.totale)}</td><td><b>${eur(ci.mensile)}</b></td><td>${ci.alKm != null ? ci.alKm.toLocaleString('it-IT', { maximumFractionDigits: 3 }) + ' €' : '–'}</td><td></td></tr></table></div>
          <p class="qr-hint">Costo totale = anticipo + canone × ${q.mesi} mesi${q.speseEscl ? ' + spese iniziali' : ''}. Mensile reale = costo totale diviso i mesi. "Sul listino" = quanto si paga in tutto rispetto al prezzo dell'auto.${q.file ? ' File: ' + esc(q.file) : ''}</p>
          <div class="qr-vinfo ${daVerif(q) ? 'scad' : ''}">⏰ Controllo di validità: ${daVerif(q) ? '<b>da fare</b>' : 'il ' + itData(prossimoControllo(q))}${q.verifiche ? ` · confermata valida ${q.verifiche} ${q.verifiche === 1 ? 'volta' : 'volte'}${q.ultimaVerificaDa ? ', l\'ultima da ' + esc(q.ultimaVerificaDa) + ' il ' + itData(q.ultimaVerificaIl) : ''}` : ''}
            ${puoModificare && daVerif(q) ? `<span class="qr-vbtn"><button type="button" class="qr-btn go" data-valida="${esc(q.id)}">✅ Ancora valida</button><button type="button" class="qr-btn qr-no" data-nonvalida="${esc(q.id)}">🗑️ Non più valida: elimina</button></span>` : ''}</div>
          <div class="qr-m-a">${q.pdfKey ? `<a class="qr-btn go qr-a" href="/api/quotazioni-rent/${encodeURIComponent(q.id)}/pdf" target="_blank" rel="noopener">📎 Apri il PDF (${nf(q.pdfKb)} KB)</a>${puoModificare ? `<button type="button" class="qr-btn" data-togli-pdf="${esc(q.id)}">Togli il PDF (i dati restano)</button>` : ''}` : '<span class="qr-hint">PDF non conservato per questa quotazione.</span>'}</div>`, true);
    }

    /* ================= IMPORT DEI PDF ================= */
    let pdfjsPromessa = null;
    function pdfjs() {
        if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
        if (pdfjsPromessa) return pdfjsPromessa;
        pdfjsPromessa = new Promise((ok, ko) => {
            const s = document.createElement('script');
            s.src = PDFJS_URL; s.async = true;
            s.onload = () => { if (!window.pdfjsLib) { ko(new Error('Lettore PDF non disponibile')); return; } window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; ok(window.pdfjsLib); };
            s.onerror = () => { pdfjsPromessa = null; ko(new Error('Non riesco a caricare il lettore PDF: controlla la connessione e riprova')); };
            document.head.appendChild(s);
        });
        return pdfjsPromessa;
    }

    async function importa(files) {
        const btn = rootEl.querySelector('[data-act="importa"]');
        btn.disabled = true; const t0 = btn.textContent; btn.textContent = '⏳ Leggo i PDF…';
        const lette = [];
        try {
            const lib = await pdfjs();
            for (const f of files) {
                try {
                    const righe = await righeDaPdf(lib, new Uint8Array(await f.arrayBuffer()), 4);
                    const q = leggiQuotazione(righe, f.name);
                    Object.defineProperty(q, '_file', { value: f, enumerable: false });   // per conservare il PDF (non va al server con i dati)
                    lette.push(q);
                } catch (e) { lette.push({ file: f.name, errore: 'PDF non leggibile (' + e.message + ')', avvisi: [] }); }
            }
        } catch (e) { messaggio('⚠️ ' + esc(e.message), 'err'); return; }
        finally { btn.disabled = false; btn.textContent = t0; }
        anteprima(lette);
    }

    // NUOVO: "stesse condizioni" = stesso portale, stessa auto (marca, modello, versione), stessa
    // durata e km, stesso canone e anticipo (scarto di 1 €). Di solito e' la stessa offerta
    // fatta a un altro cliente: all'import si sceglie se tenerla (conta come una richiesta in piu')
    // o no (le statistiche restano su offerte diverse).
    const normV = t => String(t || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const stesseCondizioni = (a, b) => a.portale === b.portale && normV(a.marca) === normV(b.marca) && normV(a.modello) === normV(b.modello)
        && normV(a.versione) === normV(b.versione) && +a.mesi === +b.mesi && Math.abs((a.kmTotali || 0) - (b.kmTotali || 0)) < 1
        && Math.abs((a.canoneEscl || 0) - (b.canoneEscl || 0)) <= 1 && Math.abs((a.anticipoEscl || 0) - (b.anticipoEscl || 0)) <= 1;

    function anteprima(lette) {
        const chiaveQ = q => (q.portale + '|' + q.numero).toUpperCase();
        const gia = new Set(quot.map(chiaveQ));
        const ok = lette.filter(q => !q.errore && q.canoneEscl != null && q.mesi);
        // per ogni quotazione nuova: una gia' caricata (o una prima nello stesso import) con le stesse condizioni
        const uguale = lette.map((q, i) => {
            if (q.errore || q.canoneEscl == null || !q.mesi || gia.has(chiaveQ(q))) return null;
            const inArchivio = quot.find(x => chiaveQ(x) !== chiaveQ(q) && stesseCondizioni(x, q));
            if (inArchivio) return { q: inArchivio, dove: 'archivio' };
            const prima = lette.slice(0, i).find(x => !x.errore && x.canoneEscl != null && chiaveQ(x) !== chiaveQ(q) && stesseCondizioni(x, q));
            return prima ? { q: prima, dove: 'import' } : null;
        });
        const nUguali = uguale.filter(Boolean).length;
        const righe = lette.map((q, i) => {
            if (q.errore || q.canoneEscl == null || !q.mesi) return `<tr class="ko"><td class="l"><input type="checkbox" disabled></td><td class="l" colspan="9"><b>${esc(q.file)}</b> — ${esc(q.errore || 'non riesco a leggere canone o durata: questo PDF non viene importato')}</td></tr>`;
            const c = costi(q), dup = gia.has(chiaveQ(q)), u = uguale[i];
            const avvUguale = u ? `<span class="qr-dup">🔁 Stesse condizioni ${u.dove === 'archivio' ? 'già caricate' : 'di un altro PDF di questo import'}: ${esc(u.q.cliente || 'altro cliente')}${u.q.data ? ' del ' + esc(u.q.data) : ''}${u.q.numero ? ' (n° ' + esc(u.q.numero) + ')' : ''}. Spunta la casella se vuoi tenerla lo stesso.</span>` : '';
            return `<tr class="${u ? 'qr-uguale' : ''}"><td class="l"><input type="checkbox" data-ok="${i}" ${u ? '' : 'checked'}></td><td class="l"><b>${esc(q.portale)}</b><small>${esc(q.numero || '')}${dup ? ' · <span class="qr-dup">già caricata: verrà aggiornata</span>' : ''}</small></td>
              <td class="l">${esc(q.cliente || '–')}<small>${esc(q.cf || '')}</small></td>
              <td class="l"><select data-tipoimp="${i}">${Object.entries(TIPI).map(([k, l]) => `<option value="${k}" ${q.tipoCliente === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
              <td class="l">${esc(nomeVeicolo(q))}<small>${esc(q.versione || '')}</small></td>
              <td>${eur(q.canoneEscl)}<small>${eur(q.canoneIncl)} IVA incl.</small></td><td>${q.anticipoEscl ? eur(q.anticipoEscl, 0) : '–'}<small>${q.speseEscl ? 'spese ' + eur(q.speseEscl, 0) : ''}</small></td>
              <td>${q.mesi} mesi<small>${nf(q.kmTotali)} km</small></td><td><b>${eur(c.mensile, 0)}</b><small>${ivaLab(c.base)}</small></td>
              <td class="l">${avvUguale}${q.avvisi.length ? `<span class="qr-avv">⚠️ ${esc(q.avvisi.join(' · '))}</span>` : (u ? '' : '✅')}</td></tr>`;
        }).join('');
        const ov = finestra('Quotazioni lette dai PDF', `
          <p class="qr-hint">Controlla i dati letti. Il <b>tipo di cliente</b> lo riconosco da ragione sociale e codice fiscale: se è sbagliato correggilo dalla tendina. Le quotazioni già caricate (stesso portale e numero) vengono aggiornate, non doppiate.</p>
          ${nUguali ? `<div class="qr-ris-h warn">🔁 ${nUguali === 1 ? '1 quotazione ha' : nUguali + ' quotazioni hanno'} le stesse condizioni (stesso portale, auto, durata, km, canone e anticipo) di una già presente, a un altro cliente. Le ho lasciate <b>non spuntate</b>: spuntale se vuoi tenerle, così contano come una richiesta in più nelle statistiche.</div>` : ''}
          <div class="qr-scroll"><table class="qr-t qr-imp"><tr><th class="l"></th><th class="l">Portale · N°</th><th class="l">Cliente</th><th class="l">Tipo</th><th class="l">Veicolo</th><th>Canone + IVA</th><th>Anticipo + IVA</th><th>Durata</th><th>Mensile reale</th><th class="l">Controllo</th></tr>${righe}</table></div>
          <label class="qr-conserva"><input type="checkbox" data-conserva ${conservaPdf() ? 'checked' : ''}> 📎 <b>Conserva anche i PDF nell'archivio</b>
            <span>Solo le pagine dell'offerta, senza le condizioni generali (es. Agos da 14 a 2 pagine). Circa 40–600 KB l'uno · spazio usato ${mb(quot.reduce((t, q) => t + (+q.pdfKb || 0), 0))} su ${mb(pdfMaxKb)}</span></label>
          <div class="qr-m-a"><span class="qr-hint">${ok.length - nUguali} su ${lette.length} spuntate${nUguali ? ' · ' + nUguali + ' con stesse condizioni da decidere' : ''}</span><button type="button" class="qr-btn" data-x>Annulla</button><button type="button" class="qr-btn go" data-salva ${ok.length ? '' : 'disabled'}>Importa</button></div>`, true);
        ov.querySelector('[data-salva]').addEventListener('click', async e => {
            const scelte = lette.map((q, i) => {
                const cb = ov.querySelector(`[data-ok="${i}"]`); if (!cb || !cb.checked) return null;
                const s = ov.querySelector(`[data-tipoimp="${i}"]`); const x = Object.assign({}, q, { tipoCliente: s ? s.value : q.tipoCliente });
                if (x.avvisi && x.avvisi.length) x.note = x.avvisi.join(' · ');
                delete x.avvisi; return x;
            }).filter(Boolean);
            if (!scelte.length) return;
            const conserva = ov.querySelector('[data-conserva]').checked;
            conservaPdf(conserva);
            const fileDi = new Map(lette.filter(q => q._file).map(q => [(q.portale + '|' + q.numero).toUpperCase(), q._file]));
            e.target.disabled = true; e.target.textContent = 'Salvo…';
            try {
                const d = await api('/api/quotazioni-rent', { method: 'POST', body: JSON.stringify({ quotazioni: scelte }) });
                let pdfOk = 0, pdfKo = [];
                if (conserva) {
                    const da = (d.salvate || []).filter(x => fileDi.has((x.portale + '|' + x.numero).toUpperCase()));
                    for (let k = 0; k < da.length; k++) {
                        e.target.textContent = `Salvo i PDF ${k + 1}/${da.length}…`;
                        const f = fileDi.get((da[k].portale + '|' + da[k].numero).toUpperCase());
                        try { await salvaPdf(da[k].id, f); pdfOk++; }
                        catch (err) { pdfKo.push(f.name + ': ' + err.message); if (/spazio/i.test(err.message)) break; }
                    }
                }
                ov.chiudi();
                messaggio(`✅ Import completato: ${d.nuove} nuove${d.aggiornate ? ', ' + d.aggiornate + ' aggiornate' : ''} · ${d.totale} quotazioni in tutto.`
                    + (conserva ? ` 📎 ${pdfOk} PDF conservati.` : '') + (pdfKo.length ? `<br>⚠️ PDF non conservati: ${esc(pdfKo.join(' · '))}` : ''), pdfKo.length ? 'err' : 'ok');
                await carica(true);
            } catch (err) { e.target.disabled = false; e.target.textContent = 'Importa'; alert('Import non riuscito: ' + err.message); }
        });
    }

    /* ================= PDF CONSERVATI ================= */
    function conservaPdf(v) {
        try { if (v === undefined) return localStorage.getItem('qrConservaPdf') !== '0'; localStorage.setItem('qrConservaPdf', v ? '1' : '0'); } catch (e) { /* */ }
        return v === undefined ? true : v;
    }
    let pdfLibPromessa = null;
    function pdfLib() {
        if (window.PDFLib) return Promise.resolve(window.PDFLib);
        if (pdfLibPromessa) return pdfLibPromessa;
        pdfLibPromessa = new Promise((ok, ko) => {
            const s = document.createElement('script'); s.src = PDFLIB_URL; s.async = true;
            s.onload = () => window.PDFLib ? ok(window.PDFLib) : ko(new Error('pdf-lib non disponibile'));
            s.onerror = () => { pdfLibPromessa = null; ko(new Error('non riesco a caricare lo strumento per i PDF')); };
            document.head.appendChild(s);
        });
        return pdfLibPromessa;
    }
    // tiene solo le pagine dell'offerta: si ferma alla prima pagina delle "Condizioni generali"
    async function pdfLeggero(file) {
        const buf = new Uint8Array(await file.arrayBuffer());
        try {
            const lib = await pdfjs(), doc = await lib.getDocument({ data: buf.slice(), disableFontFace: true, isEvalSupported: false }).promise;
            let fine = doc.numPages;
            for (let n = 2; n <= doc.numPages; n++) {
                const t = (await (await doc.getPage(n)).getTextContent()).items.map(i => i.str).join(' ');
                if (/CONDIZIONI\s+GENERALI\s+(DEL|DI|DEL\s+CONTRATTO)/i.test(t)) { fine = n - 1; break; }
            }
            if (fine >= doc.numPages) return buf;
            const PL = await pdfLib(), src = await PL.PDFDocument.load(buf, { ignoreEncryption: true }), out = await PL.PDFDocument.create();
            (await out.copyPages(src, [...Array(fine).keys()])).forEach(pg => out.addPage(pg));
            const ridotto = await out.save({ useObjectStreams: true });
            return ridotto.length < buf.length ? ridotto : buf;
        } catch (e) { return buf; }   // se qualcosa va storto si conserva il PDF intero
    }
    function base64(bytes) {
        let s = ''; const passo = 0x8000;
        for (let i = 0; i < bytes.length; i += passo) s += String.fromCharCode.apply(null, bytes.subarray(i, i + passo));
        return btoa(s);
    }
    async function salvaPdf(id, file) {
        const b = await pdfLeggero(file);
        return api('/api/quotazioni-rent/' + encodeURIComponent(id) + '/pdf', { method: 'PUT', body: JSON.stringify({ nome: file.name, dati: base64(b) }) });
    }
    async function togliPdf(id) {
        if (!confirm('Togliere il PDF di questa quotazione? I dati restano nell\'archivio e nelle statistiche.')) return;
        try { await api('/api/quotazioni-rent/' + encodeURIComponent(id) + '/pdf', { method: 'DELETE' }); document.querySelectorAll('.qr-ov').forEach(o => o.remove()); await carica(); }
        catch (e) { alert('Non tolto: ' + e.message); }
    }
    function pulizia() {
        const conPdf = quot.filter(q => q.pdfKey);
        const oggi = new Date(), sei = new Date(oggi.getFullYear(), oggi.getMonth() - 6, oggi.getDate());
        const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const ov = finestra('Libera spazio', `
          <p class="qr-hint">Toglie i PDF delle quotazioni caricate prima della data scelta. <b>I dati restano</b>: classifiche, ricerca e statistiche non cambiano, sparisce solo il file.</p>
          <label class="qr-lab">Togli i PDF caricati prima del <input type="date" class="qr-in" data-primadel value="${iso(sei)}"></label>
          <p class="qr-hint" data-stima></p>
          <div class="qr-m-a"><button type="button" class="qr-btn" data-x>Annulla</button><button type="button" class="qr-btn go" data-ok-pul>Togli i PDF</button></div>`);
        const stima = () => { const v = ov.querySelector('[data-primadel]').value; const L = conPdf.filter(q => String(q.caricataIl || '').slice(0, 10) < v);
            ov.querySelector('[data-stima]').textContent = `${L.length} PDF su ${conPdf.length} · si liberano ${mb(L.reduce((t, q) => t + (+q.pdfKb || 0), 0))}`; return L.length; };
        ov.querySelector('[data-primadel]').addEventListener('input', stima); stima();
        ov.querySelector('[data-ok-pul]').addEventListener('click', async () => {
            if (!stima()) return;
            try { const d = await api('/api/quotazioni-rent/pdf/pulizia', { method: 'POST', body: JSON.stringify({ primaDel: ov.querySelector('[data-primadel]').value }) });
                ov.chiudi(); messaggio(`✅ Tolti ${d.tolti} PDF · liberati ${mb(d.liberatiKb)}. I dati delle quotazioni restano.`, 'ok'); await carica(true); }
            catch (e) { alert('Non riuscito: ' + e.message); }
        });
    }

    /* ---------- finestra delle quotazioni da verificare ---------- */
    function verifiche() {
        const L = quot.filter(daVerif).sort((a, b) => String(a.caricataIl || '').localeCompare(String(b.caricataIl || '')));
        if (!L.length) { messaggio('✅ Nessuna quotazione da verificare.', 'ok'); return; }
        const ov = finestra(L.length === 1 ? 'Quotazione da verificare' : L.length + ' quotazioni da verificare', `
          <p class="qr-hint">Per ognuna: <b>✅ Ancora valida</b> la ricontrolli tra 15 giorni, <b>🗑️ Non più valida</b> la elimina del tutto (dati e PDF). Con 🔍 vedi tutto il dettaglio prima di decidere.</p>
          <div class="qr-vlist">${L.map(q => { const c = costi(q); return `<div class="qr-vrow" data-vrow="${esc(q.id)}">
              <div><b>${esc(nomeVeicolo(q))}</b> <i class="qr-pt">${esc(q.portale)}</i> <i class="qr-tc t-${q.tipoCliente}">${TIPI[q.tipoCliente] || ''}</i>
                <small>${esc(q.versione || '')}</small>
                <small>${esc(q.cliente || '–')} · n° ${esc(q.numero || '–')} · ${eur(c.canone, 0)} ${ivaLab(c.base)} × ${q.mesi} mesi${c.anticipo ? ' + ' + eur(c.anticipo, 0) + ' anticipo' : ''}</small>
                <small>Caricata il ${itData(q.caricataIl)} (${giorniDa(q.caricataIl)} giorni fa)${q.verifiche ? ' · già confermata ' + q.verifiche + (q.verifiche === 1 ? ' volta' : ' volte') : ''}${q.pdfKey ? ' · 📎 PDF' : ''}</small></div>
              <div class="qr-vbtn"><button type="button" class="qr-btn" data-vdet="${esc(q.id)}">🔍 Dettaglio</button>
                <button type="button" class="qr-btn go" data-valida="${esc(q.id)}">✅ Ancora valida</button>
                <button type="button" class="qr-btn qr-no" data-nonvalida="${esc(q.id)}">🗑️ Non più valida</button></div></div>`; }).join('')}</div>
          ${L.length > 1 ? `<div class="qr-m-a"><button type="button" class="qr-btn" data-x>Chiudi</button><button type="button" class="qr-btn go" data-tuttevalide>✅ Sono tutte ancora valide</button></div>` : ''}`, true);
        ov.classList.add('qr-ov-verif');
        const tv = ov.querySelector('[data-tuttevalide]');
        if (tv) tv.addEventListener('click', async () => {
            const ids = [...ov.querySelectorAll('[data-vrow]')].map(r => r.dataset.vrow);
            if (!confirm(`Confermi che tutte le ${ids.length} quotazioni sono ancora valide? Si ricontrollano tra 15 giorni.`)) return;
            tv.disabled = true;
            for (const id of ids) { try { await api('/api/quotazioni-rent/' + encodeURIComponent(id) + '/verifica', { method: 'POST', body: JSON.stringify({ valida: true }) }); } catch (e) { /* gia' fatta da un collega */ } }
            ov.chiudi(); messaggio(`✅ ${ids.length} quotazioni confermate valide: le ricontrolli tra 15 giorni.`, 'ok'); await carica(true); refreshNav();
        });
    }
    async function rispondi(id, valida, btn) {
        const q = quot.find(x => String(x.id) === String(id));
        if (btn) btn.disabled = true;
        try {
            await api('/api/quotazioni-rent/' + encodeURIComponent(id) + '/verifica', { method: 'POST', body: JSON.stringify({ valida }) });
            const riga = [...document.querySelectorAll('.qr-ov [data-vrow]')].find(r => r.dataset.vrow === String(id));
            if (riga) { riga.classList.add(valida ? 'fatta' : 'tolta'); riga.querySelector('.qr-vbtn').innerHTML = valida ? '<span class="qr-vok">✅ Valida · ricontrollo tra 15 giorni</span>' : '<span class="qr-vko">🗑️ Eliminata</span>'; }
            else document.querySelectorAll('.qr-ov').forEach(o => { if (!o.classList.contains('qr-ov-verif')) o.remove(); });
            messaggio(valida ? `✅ ${esc(q ? nomeVeicolo(q) : 'Quotazione')}: ancora valida, la ricontrolli tra 15 giorni.` : `🗑️ ${esc(q ? nomeVeicolo(q) : 'Quotazione')} (${esc(q ? q.portale : '')}) eliminata: non era più valida.`, 'ok');
            await carica(true); refreshNav();
            const ov = document.querySelector('.qr-ov-verif');
            if (ov && !ov.querySelector('.qr-vrow:not(.fatta):not(.tolta)')) setTimeout(() => ov.chiudi && ov.chiudi(), 900);
        } catch (e) { if (btn) btn.disabled = false; alert('Non salvato: ' + e.message); }
    }
    document.addEventListener('click', e => {
        if (!e.target.closest) return;
        const v = e.target.closest('[data-valida]'); if (v) { rispondi(v.dataset.valida, true, v); return; }
        const n = e.target.closest('[data-nonvalida]'); if (n) { rispondi(n.dataset.nonvalida, false, n); return; }
        const d = e.target.closest('[data-vdet]'); if (d) dettaglio(d.dataset.vdet);
    });

    /* ================= EVENTI ================= */
    function clic(e) {
        const a = e.target.closest('[data-act]');
        if (a) {
            const act = a.dataset.act;
            if (act === 'importa') rootEl.querySelector('#qrFile').click();
            else if (act === 'rent' && typeof showPage === 'function') showPage('rent');
            else if (act === 'pulizia') pulizia();
            else if (act === 'verifiche') verifiche();
            else if (act === 'cercatipo') {   // dalla card "la più richiesta": ricerca gia' impostata
                st.cerca = { tipo: '', ant: a.dataset.ant, antMax: '', rata: '', iva: 'ESCL', tol: '15', mesi: a.dataset.mesi, km: a.dataset.km, alim: '', testo: '' };
                const card = rootEl.querySelector('.qr-cerca-card'); card.querySelector('form').outerHTML = formCerca(); cerca();
                card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            else if (act === 'tutteclass') { st.tutteClass = !st.tutteClass; rootEl.querySelector('.qr-classifica').innerHTML = classifica(delPortale()); }
            else if (act === 'cercareset') { st.cerca = null; const card = rootEl.querySelector('.qr-cerca-card'); card.querySelector('form').outerHTML = formCerca(); card.querySelector('.qr-cerca-ris').innerHTML = ''; }
            return;
        }
        if (e.target.closest('a')) return;   // 📎 apre il PDF in una nuova scheda
        const p = e.target.closest('[data-portale]'); if (p) { st.portale = p.dataset.portale; st.mese = ''; disegna(); return; }
        const ms = e.target.closest('[data-mese]'); if (ms) { st.mese = ms.dataset.mese; rootEl.querySelectorAll('[data-mese]').forEach(b => b.classList.toggle('on', b === ms)); disegnaElenco(); return; }
        const t = e.target.closest('[data-tipotab]'); if (t) { st.tipoTab = t.dataset.tipotab; st.tutteClass = false; rootEl.querySelectorAll('[data-tipotab]').forEach(b => b.classList.toggle('on', b === t)); rootEl.querySelector('.qr-classifica').innerHTML = classifica(delPortale()); return; }
        const d = e.target.closest('[data-del]');
        if (d) { e.stopPropagation(); elimina(d.dataset.del); return; }
        if (e.target.closest('select')) return;
        const det = e.target.closest('[data-det]'); if (det) dettaglio(det.dataset.det);
    }
    function cambia(e) {
        if (e.target.matches('[data-ordina]')) { st.ordina = e.target.value; disegna(); return; }
        if (e.target.matches('[data-tipo]')) { correggiTipo(e.target.dataset.tipo, e.target.value); return; }
        const f = e.target.closest('form[data-cerca]');
        if (f && e.target.name === 'ant') f.querySelector('.qr-antmax').hidden = e.target.value !== 'max';
    }
    document.addEventListener('submit', e => {
        const f = e.target.closest && e.target.closest('form[data-cerca]'); if (!f || !rootEl || !rootEl.contains(f)) return;
        e.preventDefault();
        st.cerca = Object.fromEntries(new FormData(f).entries());
        cerca();
    });

    document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-togli-pdf]'); if (b) togliPdf(b.dataset.togliPdf); });

    async function correggiTipo(id, tipo) {
        try { const d = await api('/api/quotazioni-rent/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ tipoCliente: tipo }) });
            const i = quot.findIndex(q => String(q.id) === String(id)); if (i >= 0) quot[i] = d.quotazione; disegna(); }
        catch (e) { alert('Non salvato: ' + e.message); disegna(); }
    }
    async function elimina(id) {
        const q = quot.find(x => String(x.id) === String(id)); if (!q) return;
        if (!confirm(`Eliminare la quotazione ${q.portale} ${q.numero || ''} (${nomeVeicolo(q)}${q.cliente ? ', ' + q.cliente : ''})?`)) return;
        try { await api('/api/quotazioni-rent/' + encodeURIComponent(id), { method: 'DELETE' }); quot = quot.filter(x => String(x.id) !== String(id)); disegna(); }
        catch (e) { alert('Non eliminata: ' + e.message); }
    }

    /* ================= GRAFICA =================
       Gli stili stanno qui dentro (non in un file .css a parte): cosi' la pagina ha
       sempre la sua grafica, anche se il file css non arriva al browser. */
    const STILI = "/* =====================================================================\n   QUOTAZIONI RENT — stili (prefisso qr-). Colori del Rent (verde).\n   ===================================================================== */\n#quotazioniRoot, .qr-ov { --qr-acc:#2fd47a; --qr-acc2:#1fa35c; --qr-card:var(--bg-card, #171a23); --qr-bg:var(--bg-primary, #0f1117);\n  --qr-ink:var(--text-primary, #eef1f6); --qr-ink2:var(--text-secondary, #9aa3b2); --qr-line:var(--border, #2a2e3b); --qr-soft:rgba(47,212,122,.1); }\n#quotazioniPage { padding-bottom:40px; }\n#quotazioniRoot { max-width:1500px; margin:0 auto; color:var(--qr-ink); }\n#quotazioniRoot *, .qr-ov * { box-sizing:border-box; }\n\n.qr-head { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; flex-wrap:wrap; margin:6px 0 16px; }\n.qr-head h2 { margin:4px 0 2px; letter-spacing:3px; color:var(--qr-acc); }\n.qr-sub { margin:0; color:var(--qr-ink2); font-size:13px; }\n.qr-back { border:0; background:none; color:var(--qr-ink2); font-weight:700; cursor:pointer; padding:0; font-size:13px; }\n.qr-back:hover { color:var(--qr-acc); }\n.qr-btn { height:40px; padding:0 16px; border-radius:11px; border:1px solid var(--qr-line); background:var(--qr-card); color:var(--qr-ink); font:inherit; font-size:13px; font-weight:800; cursor:pointer; }\n.qr-btn:hover { border-color:var(--qr-acc); }\n.qr-btn.go { background:var(--qr-acc); border-color:var(--qr-acc); color:#062b16; }\n.qr-btn.go:hover { background:#46e08b; }\n.qr-btn:disabled { opacity:.55; cursor:default; }\n.qr-msg { padding:11px 14px; border-radius:12px; margin-bottom:14px; font-size:13.5px; font-weight:600; border:1px solid var(--qr-line); }\n.qr-msg.ok { background:rgba(47,212,122,.12); border-color:rgba(47,212,122,.4); }\n.qr-msg.err { background:rgba(229,72,77,.12); border-color:rgba(229,72,77,.45); color:#ffb4b6; }\n\n.qr-tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px; }\n.qr-tabs button { height:38px; padding:0 14px; border-radius:999px; border:1px solid var(--qr-line); background:var(--qr-card); color:var(--qr-ink); font:inherit; font-size:13px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:8px; }\n.qr-tabs button b { font-size:11px; padding:2px 8px; border-radius:999px; background:var(--qr-soft); color:var(--qr-acc); }\n.qr-tabs button.on { background:var(--qr-acc); border-color:var(--qr-acc); color:#062b16; }\n.qr-tabs button.on b { background:rgba(0,0,0,.15); color:#062b16; }\n\n.qr-card { background:var(--qr-card); border:1px solid var(--qr-line); border-radius:18px; padding:18px 20px; margin-bottom:16px; }\n.qr-card h3 { margin:0 0 4px; font-size:15px; letter-spacing:.3px; }\n.qr-card-h { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:4px; }\n.qr-hint { margin:4px 0 12px; color:var(--qr-ink2); font-size:12.5px; line-height:1.45; }\n.qr-vuoto { text-align:center; padding:50px 20px; }\n.qr-vuoto p { color:var(--qr-ink2); max-width:520px; margin:6px auto 0; }\n\n.qr-kpis { display:grid; grid-template-columns:repeat(6, minmax(0,1fr)); gap:12px; margin-bottom:16px; }\n.qr-kpi { background:var(--qr-card); border:1px solid var(--qr-line); border-top:3px solid var(--qr-acc); border-radius:16px; padding:13px 14px; min-width:0; }\n.qr-kpi small { display:block; font-size:11px; font-weight:800; letter-spacing:.5px; text-transform:uppercase; color:var(--qr-ink2); }\n.qr-kpi b { display:block; font-size:24px; font-weight:900; margin:6px 0 2px; }\n.qr-kpi span { font-size:11.5px; color:var(--qr-ink2); }\n\n.qr-ord { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:var(--qr-ink2); }\n.qr-ord select, .qr-in, .qr-form select, .qr-form input, .qr-el select, .qr-imp select { height:36px; border-radius:10px; border:1.5px solid var(--qr-line); background:var(--qr-bg); color:var(--qr-ink); padding:0 10px; font:inherit; font-size:13px; }\n.qr-in { min-width:260px; }\n.qr-ord select:focus, .qr-in:focus, .qr-form select:focus, .qr-form input:focus { outline:none; border-color:var(--qr-acc); }\n\n/* offerte (top 5, classifiche, ricerca) */\n.qr-offs { display:flex; flex-direction:column; gap:8px; }\n.qr-off { display:grid; grid-template-columns:44px minmax(220px,2.2fr) repeat(4, minmax(100px,1fr)) auto; gap:12px; align-items:center; width:100%; text-align:left;\n  border:1px solid var(--qr-line); background:var(--qr-bg); color:inherit; font:inherit; border-radius:14px; padding:10px 14px; cursor:pointer; }\n.qr-off:hover { border-color:var(--qr-acc); }\n.qr-off.best { border-color:rgba(47,212,122,.55); background:linear-gradient(90deg, rgba(47,212,122,.10), transparent 60%); }\n.qr-pos { font-size:22px; font-weight:900; text-align:center; color:var(--qr-ink2); }\n.qr-off-v { min-width:0; }\n.qr-off-v b { display:block; font-size:14.5px; }\n.qr-off-v small { display:block; font-size:12px; color:var(--qr-ink2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n.qr-off-v em { display:block; font-style:normal; font-size:11.5px; color:var(--qr-ink2); margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n.qr-pt, .qr-tc { font-style:normal; font-weight:800; font-size:10.5px; padding:2px 7px; border-radius:999px; background:var(--qr-soft); color:var(--qr-acc); }\n.qr-tc.t-PRIVATO { background:rgba(63,167,255,.14); color:#6dbbff; }\n.qr-tc.t-PIVA { background:rgba(244,183,64,.16); color:#f4b740; }\n.qr-tc.t-AZIENDA { background:rgba(176,124,240,.16); color:#c39cf5; }\n.qr-off-n small { display:block; font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.4px; color:var(--qr-ink2); }\n.qr-off-n b { display:block; font-size:14px; margin:2px 0 1px; white-space:nowrap; }\n.qr-off-n em { display:block; font-style:normal; font-size:11px; color:var(--qr-ink2); white-space:nowrap; }\n.qr-off-n.hi b { color:var(--qr-acc); font-size:17px; }\n.qr-diff { font-weight:900; font-size:13px; text-align:right; white-space:nowrap; }\n.qr-diff small { display:block; font-weight:600; font-size:10.5px; color:var(--qr-ink2); }\n.qr-diff.giu { color:var(--qr-acc); } .qr-diff.su { color:#f4b740; }\n.qr-link { border:0; background:none; color:var(--qr-acc); font:inherit; font-weight:800; cursor:pointer; padding:8px 0 0; font-size:13px; text-align:left; }\n\n.qr-ttabs { display:flex; gap:6px; margin:6px 0 4px; flex-wrap:wrap; }\n.qr-ttabs button { height:34px; padding:0 14px; border-radius:10px; border:1px solid var(--qr-line); background:var(--qr-bg); color:var(--qr-ink); font:inherit; font-size:13px; font-weight:800; cursor:pointer; }\n.qr-ttabs button b { margin-left:6px; color:var(--qr-ink2); }\n.qr-ttabs button.on { border-color:var(--qr-acc); box-shadow:inset 0 0 0 1px var(--qr-acc); }\n\n/* ricerca */\n.qr-form { display:grid; grid-template-columns:repeat(5, minmax(0,1fr)); gap:10px 12px; align-items:end; }\n.qr-form label { display:flex; flex-direction:column; gap:4px; font-size:11px; font-weight:800; letter-spacing:.4px; text-transform:uppercase; color:var(--qr-ink2); min-width:0; }\n.qr-form label[hidden] { display:none; }\n.qr-form .qr-w { grid-column:span 2; }\n.qr-form-a { display:flex; gap:8px; }\n.qr-cerca-ris { margin-top:14px; }\n.qr-ris-h { font-size:13px; font-weight:700; margin-bottom:10px; padding:9px 12px; border-radius:10px; background:var(--qr-soft); }\n.qr-ris-h.warn { background:rgba(244,183,64,.14); color:#f4c56a; }\n.qr-noris { padding:14px; border-radius:12px; border:1px dashed var(--qr-line); color:var(--qr-ink2); font-size:13px; }\n\n/* cosa gira di piu' */\n.qr-piu { display:grid; grid-template-columns:1fr 1.2fr 1fr; gap:16px; margin:8px 0 14px; }\n.qr-piu h4, .qr-ch h4 { margin:0 0 8px; font-size:12px; letter-spacing:.6px; text-transform:uppercase; color:var(--qr-ink2); }\n.qr-piu-top { border-radius:14px; padding:14px; background:linear-gradient(135deg, rgba(47,212,122,.16), rgba(47,212,122,.04)); border:1px solid rgba(47,212,122,.35); }\n.qr-piu-top small { display:block; font-size:11px; font-weight:800; letter-spacing:.5px; text-transform:uppercase; color:var(--qr-ink2); }\n.qr-piu-top b { display:block; font-size:18px; margin:6px 0; }\n.qr-piu-top span { font-size:12px; color:var(--qr-ink2); }\n.qr-ol { list-style:none; margin:0; padding:0; }\n.qr-ol li { position:relative; display:flex; justify-content:space-between; gap:10px; padding:6px 10px; margin-bottom:4px; border-radius:8px; font-size:13px; overflow:hidden; }\n.qr-ol li i { position:absolute; left:0; top:0; bottom:0; background:var(--qr-soft); z-index:0; border-radius:8px; }\n.qr-ol li span, .qr-ol li b { position:relative; z-index:1; }\n.qr-charts { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:14px; }\n.qr-ch { border:1px solid var(--qr-line); border-radius:14px; padding:12px; min-width:0; }\n.qr-ch.qr-wide { grid-column:span 3; }\n.qr-ch-b { position:relative; height:220px; }\n.qr-ch-b.tall { height:300px; }\n\n/* tabelle */\n.qr-scroll { overflow:auto; }\n.qr-t { width:100%; border-collapse:collapse; font-size:13px; }\n.qr-t th { text-align:right; font-size:10.5px; letter-spacing:.4px; text-transform:uppercase; color:var(--qr-ink2); padding:8px; border-bottom:1.5px solid var(--qr-line); white-space:nowrap; }\n.qr-t td { text-align:right; padding:8px; border-bottom:1px solid var(--qr-line); vertical-align:top; }\n.qr-t th.l, .qr-t td.l { text-align:left; }\n.qr-t td small { display:block; font-size:11px; color:var(--qr-ink2); }\n.qr-el tr[data-det] { cursor:pointer; }\n.qr-el tr[data-det]:hover td { background:rgba(255,255,255,.03); }\n.qr-del { border:0; background:none; cursor:pointer; font-size:15px; opacity:.7; }\n.qr-del:hover { opacity:1; }\n.qr-imp tr.ko td { color:#ffb4b6; }\n.qr-avv { color:#f4c56a; font-size:12px; }\n.qr-dup { color:#f4b740; font-weight:700; }\n.qr-uguale td { background:rgba(244,183,64,.06); }\n.qr-rip { color:#f4b740 !important; font-weight:700; }\n.qr-arch-a { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }\n.qr-spazio { position:relative; overflow:hidden; display:inline-block; padding:8px 12px; border-radius:10px; border:1px solid var(--qr-line); font-size:12px; font-weight:700; color:var(--qr-ink2); }\n.qr-spazio i { position:absolute; left:0; bottom:0; height:3px; background:var(--qr-acc); }\n.qr-mesi { display:flex; gap:6px; flex-wrap:wrap; margin:10px 0 12px; }\n.qr-mesi button { height:34px; padding:0 12px; border-radius:10px; border:1px solid var(--qr-line); background:var(--qr-bg); color:var(--qr-ink); font:inherit; font-size:12.5px; font-weight:700; cursor:pointer; }\n.qr-mesi button b { margin-left:6px; color:var(--qr-ink2); }\n.qr-mesi button.on { border-color:var(--qr-acc); box-shadow:inset 0 0 0 1px var(--qr-acc); }\n.qr-pdf { text-decoration:none; font-size:16px; }\n.qr-nopdf { color:var(--qr-ink2); }\n.qr-a { display:inline-flex; align-items:center; text-decoration:none; }\n.qr-conserva { display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px; margin-top:12px; padding:10px 12px; border-radius:12px; border:1px solid var(--qr-line); font-size:13px; cursor:pointer; }\n.qr-conserva span { width:100%; padding-left:24px; font-size:12px; color:var(--qr-ink2); }\n.qr-lab { display:flex; align-items:center; gap:10px; font-size:13px; font-weight:700; }\n.qr-verif { display:flex; justify-content:space-between; align-items:center; gap:14px; flex-wrap:wrap; padding:14px 18px; margin-bottom:16px; border-radius:16px; border:1px solid rgba(244,183,64,.5); background:rgba(244,183,64,.1); }\n.qr-verif b { display:block; font-size:15px; color:#f4c56a; }\n.qr-verif span { font-size:12.5px; color:var(--qr-ink2); }\n.qr-vlist { display:flex; flex-direction:column; gap:8px; }\n.qr-vrow { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; padding:12px 14px; border-radius:14px; border:1px solid var(--qr-line); background:var(--qr-bg); }\n.qr-vrow small { display:block; font-size:12px; color:var(--qr-ink2); margin-top:2px; }\n.qr-vrow.fatta { opacity:.6; border-color:rgba(47,212,122,.5); }\n.qr-vrow.tolta { opacity:.45; text-decoration:line-through; }\n.qr-vbtn { display:flex; gap:8px; flex-wrap:wrap; }\n.qr-btn.qr-no { border-color:rgba(229,72,77,.5); color:#ff9a9d; }\n.qr-btn.qr-no:hover { background:rgba(229,72,77,.12); }\n.qr-vok { color:var(--qr-acc); font-weight:800; font-size:13px; }\n.qr-vko { color:#ff9a9d; font-weight:800; font-size:13px; }\n.qr-vinfo { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-top:14px; padding:10px 14px; border-radius:12px; border:1px solid var(--qr-line); font-size:13px; color:var(--qr-ink2); }\n.qr-vinfo.scad { border-color:rgba(244,183,64,.5); background:rgba(244,183,64,.08); color:#f4c56a; }\n.qr-nbadge { display:inline-block; min-width:18px; height:18px; padding:0 5px; margin-left:6px; border-radius:999px; background:#e5484d; color:#fff; font-size:11px; font-weight:800; line-height:18px; text-align:center; vertical-align:middle; }\n.qr-best { text-align:left; color:inherit; font:inherit; cursor:pointer; display:flex; flex-direction:column; gap:3px; }\n.qr-best:hover { border-color:var(--qr-acc); }\n.qr-best.vuota { cursor:default; opacity:.6; }\n.qr-best b { font-size:16px !important; margin:4px 0 0 !important; line-height:1.25; }\n.qr-best strong { font-size:22px; font-weight:900; color:var(--qr-acc); }\n.qr-best strong em { font-style:normal; font-size:11px; font-weight:700; color:var(--qr-ink2); margin-left:4px; }\n.qr-best .qr-best-p { font-weight:700; color:var(--qr-ink); opacity:.75; }\n.qr-drop { position:fixed; inset:0; z-index:10040; background:rgba(5,20,12,.78); display:flex; align-items:center; justify-content:center; padding:24px; pointer-events:none; }\n.qr-drop[hidden] { display:none; }\n.qr-drop div { border:3px dashed var(--qr-acc); border-radius:28px; padding:60px 70px; text-align:center; background:rgba(47,212,122,.08); }\n.qr-drop b { display:block; font-size:24px; color:var(--qr-acc); }\n.qr-drop span { display:block; margin-top:8px; color:#cfe9da; font-size:14px; }\n.qr-uguale .qr-dup { display:block; font-size:12px; max-width:340px; line-height:1.35; }\n\n/* finestre */\n.qr-ov { position:fixed; inset:0; z-index:10050; background:rgba(5,8,12,.62); display:flex; align-items:flex-start; justify-content:center; padding:5vh 16px; overflow:auto; }\n.qr-modal { width:min(820px, 100%); background:var(--qr-card); color:var(--qr-ink); border:1px solid var(--qr-line); border-radius:20px; box-shadow:0 30px 80px -20px rgba(0,0,0,.6); }\n.qr-modal.wide { width:min(1240px, 100%); }\n.qr-m-h { display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid var(--qr-line); }\n.qr-m-h h3 { margin:0; font-size:16px; }\n.qr-x { border:1px solid var(--qr-line); background:none; color:inherit; border-radius:10px; width:34px; height:34px; cursor:pointer; }\n.qr-m-b { padding:16px 20px 20px; }\n.qr-m-a { display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-top:14px; }\n.qr-m-a .qr-hint { margin:0 auto 0 0; }\n.qr-grid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:8px; }\n.qr-f { background:var(--qr-bg); border-radius:12px; padding:9px 12px; min-width:0; }\n.qr-f small { display:block; font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.4px; color:var(--qr-ink2); }\n.qr-f b { font-size:13.5px; word-break:break-word; }\n.qr-h4 { margin:16px 0 8px; font-size:12px; letter-spacing:.6px; text-transform:uppercase; color:var(--qr-ink2); }\n\n/* pulsante 📝 nel Rent */\n#rentQuotBtn { width:auto; padding:10px 14px; font-size:16px; line-height:1; }\n\n@media (max-width:1200px) { .qr-kpis { grid-template-columns:repeat(3, minmax(0,1fr)); } .qr-form { grid-template-columns:repeat(3, minmax(0,1fr)); } .qr-piu { grid-template-columns:1fr; } }\n@media (max-width:900px) {\n  .qr-off { grid-template-columns:36px 1fr 1fr; } .qr-off-v { grid-column:2 / -1; }\n  .qr-charts { grid-template-columns:1fr; } .qr-ch.qr-wide { grid-column:auto; }\n  .qr-grid { grid-template-columns:repeat(2, minmax(0,1fr)); }\n}\n@media (max-width:560px) { .qr-kpis, .qr-form { grid-template-columns:1fr 1fr; } .qr-form .qr-w { grid-column:span 2; } .qr-in { min-width:0; width:100%; } }\n";
    function stili() {
        if (document.getElementById('qr-stili')) return;
        const el = document.createElement('style');
        el.id = 'qr-stili'; el.textContent = STILI;
        document.head.appendChild(el);
    }
    stili();

    /* ================= AVVIO ================= */
    function apri() {
        rootEl = document.getElementById('quotazioniRoot');
        if (!rootEl) return Promise.resolve();
        if (!rootEl.dataset.ready) { shell(); rootEl.dataset.ready = '1'; }
        // nel pulsante 📝 del Rent resta acceso "Rent" nel menu; con la voce dedicata, "Quotazioni Rent"
        const w = dove(), nav = document.getElementById(w === 'rent' ? 'navRent' : 'navQuotazioni');
        if (nav) nav.classList.add('active');
        return carica();
    }
    // cambio tema: grafici ridisegnati con i colori giusti
    new MutationObserver(() => { if (rootEl && caricato && rootEl.offsetParent) disegna(); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    window.QuotazioniRent = { apri, refreshNav, livello, dove };
})();
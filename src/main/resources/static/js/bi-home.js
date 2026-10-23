/* =====================================================================
   BI — pagina della macro-sezione (Gruppo Autoscala CRM)
   ---------------------------------------------------------------------
   Si apre dalla card "BI" della home (MacroHome.openBI). Quattro capitoli:
     01 Consegne    -> "Entra" apre l'area Consegne (Tempistiche / Analisi)
     02 Stock       -> "Entra" apre l'area Stock (pedana con i loghi dei marchi)
     03 Commerciale -> "Entra" apre l'area Commerciale (abitacolo digitale: lead, vendite, noleggio)
     04 Service     -> in arrivo (officina connessa: la Sportequipe sul ponte
                       sollevatore, scansione di diagnosi con i punti controllati,
                       ordine di lavoro che si completa da solo).
                       Foto: /img/macro/sportequipe-service.png
   I capitoli scorrono da soli (pausa con il mouse sopra), il cambio e' una
   lama di luce che attraversa il palco. Le animazioni girano solo mentre
   la pagina e' visibile (start/stop). Stili in /css/bi-home.css (prefisso bh-).

   SEZIONE APERTA: cliccando un capitolo (01 Consegne, 02 Stock...) gli altri si
   nascondono, lo scorrimento automatico si ferma e al posto dell'animazione compare
   la scheda della sezione con tutte le sue voci. Ogni voce apre ESATTAMENTE quella
   parte: la scheda giusta, la vista giusta del menu o il solo riquadro richiesto
   (vista "Solo questo" di bi-tools.js, con "← Torna a ..."). "← Tutte le sezioni"
   (o Esc) torna alla pagina BI normale. Stili in /css/bi-tools.css (prefisso bh-x).
   ===================================================================== */
(function () {
    let root = null, scene = null;

    /* ---------- link precisi: aprono proprio la parte scelta ---------- */
    // aspetta che la pagina abbia disegnato quello che serve (i dati arrivano dal server)
    const aspetta = (test, ms = 10000) => new Promise(res => {
        const t0 = Date.now();
        (function giro() { let v = null; try { v = test(); } catch (e) { /* */ } if (v) return res(v); if (Date.now() - t0 > ms) return res(null); setTimeout(giro, 150); })();
    });
    const vede = el => !!el && !!(el.offsetParent || el.getClientRects().length);
    function trovaRiquadro(rootId, titolo) {
        const r = document.getElementById(rootId); if (!r) return null;
        const t = titolo.toLowerCase();
        return [...r.querySelectorAll('.cg-card, .cm-card')].find(c => {
            const h = c.querySelector('h2, h3');
            return h && h.textContent.trim().toLowerCase().startsWith(t) && vede(c);
        }) || null;
    }
    // mostra solo quel riquadro (bi-tools.js: "Solo questo"), con la barra "← Torna a ..."
    async function soloRiquadro(rootId, titolo) {
        const c = await aspetta(() => trovaRiquadro(rootId, titolo));
        if (!c) return;
        await new Promise(r => setTimeout(r, 350));       // i grafici si disegnano
        const c2 = trovaRiquadro(rootId, titolo) || c;
        if (window.BiTools && BiTools.focus) BiTools.focus(c2, true); else c2.scrollIntoView({ block: 'start' });
        window.scrollTo(0, 0);
    }
    async function clicca(sel) { const b = await aspetta(() => { const x = document.querySelector(sel); return vede(x) ? x : null; }); if (b) b.click(); }
    // CONSEGNE: scheda (tempi / analisi) e poi, se serve, il riquadro o il pulsante
    async function consegne(tab, dopo) {
        if (!window.MacroHome) return;
        if (window.BiTools && BiTools.esciFocus) BiTools.esciFocus();
        MacroHome.openConsegne();
        const b = await aspetta(() => document.querySelector(`#consegneRoot .cg-tab[data-tab="${tab}"]`));
        if (b && !b.classList.contains('on')) b.click();
        if (dopo) await dopo();
    }
    async function stock(vista, titolo) {
        if (!window.MacroHome) return;
        if (window.BiTools && BiTools.esciFocus) BiTools.esciFocus();
        if (window.StockHome && StockHome.vista) StockHome.vista(vista);
        MacroHome.openStock();
        if (titolo) await soloRiquadro('stockRoot', titolo);
    }
    async function commerciale(vw, titolo) {
        if (!window.MacroHome) return;
        if (window.BiTools && BiTools.esciFocus) BiTools.esciFocus();
        if (window.CommercialeBI && CommercialeBI.vista) CommercialeBI.vista(vw);
        MacroHome.openCommerciale();
        if (titolo) await soloRiquadro('commercialeRoot', titolo);
    }
    // Le voci di ogni sezione. SUB: le tre in evidenza sotto i capitoli (indici di OPZ).
    const OPZ = [
        [   // 01 CONSEGNE
            { i: '⏱️', t: 'Tempistiche consegne', d: 'Per mese di contratto: consegnate nello stesso mese, dopo 1, 2… mesi', go: () => consegne('tempi', () => soloRiquadro('consegneRoot', 'Tempistiche consegne')) },
            { i: '⏳', t: 'Da consegnare, per motivo', d: 'Le vetture ancora da consegnare, divise per stato del foglio', go: () => consegne('tempi', () => soloRiquadro('consegneRoot', 'Da consegnare')) },
            { i: '✓', t: 'Verifiche e quadratura', d: 'Il controllo che i conti tornino tra foglio e CSV, con il dettaglio', go: () => consegne('tempi', () => clicca('#cgQuad')) },
            { i: '🔍', t: 'Da verificare a mano', d: 'Pratiche da controllare una per una (abbinamenti incerti)', go: () => consegne('tempi', () => clicca('#cgVerify')) },
            { i: '📄', t: 'Solo nel foglio Google', d: 'Contratti nel foglio DATABASE senza trattativa nel CSV', go: () => consegne('tempi', () => clicca('#cgSolo')) },
            { i: '📊', t: 'Analisi avanzamento', d: "Tutti i grafici dell'analisi, con i filtri", go: () => consegne('analisi') },
            { i: '📈', t: 'Vendite del periodo', d: 'Consegnate, da consegnare e annullate', go: () => consegne('analisi', () => soloRiquadro('consegneRoot', 'Vendite:')) },
            { i: '👤', t: 'Consulenti', d: 'Vendite, consegnate, in lavorazione e annullate per consulente', go: () => consegne('analisi', () => soloRiquadro('consegneRoot', 'Consulenti:')) },
            { i: '💳', t: 'Pagamento e finanziamenti', d: 'Metodo di pagamento dei contratti', go: () => consegne('analisi', () => soloRiquadro('consegneRoot', 'Metodo di pagamento')) },
            { i: '🛡️', t: 'Servizi venduti', d: 'Mawdy, FIR, pack manutenzione, Lojack, Blockshaft (uno per volta)', go: () => consegne('analisi', () => soloRiquadro('consegneRoot', 'Solo Mawdy')) }
        ],
        [   // 02 STOCK
            { i: '📊', t: 'Panoramica e grafici', d: 'Totale vetture, nuove / usate / Km 0 e tutti i grafici', go: () => stock('panoramica') },
            { i: '🏷️', t: 'Per marchio e modello', d: 'Tutti i marchi in ordine alfabetico, poi modelli e vetture', go: () => stock('marchi') },
            { i: '🚦', t: 'Disponibili, prenotate, vendute', d: 'Solo il grafico dello stato delle vetture, con i numeri in evidenza', go: () => stock('panoramica', 'Disponibili, prenotate e vendute') },
            { i: '🔁', t: 'Nuove, usate e Km 0', d: 'Solo il grafico per tipo di vettura', go: () => stock('panoramica', 'Nuove, usate e Km 0') },
            { i: '⛽', t: 'Per motorizzazione', d: 'Benzina, diesel, ibrido, elettrico…', go: () => stock('panoramica', 'Per motorizzazione') },
            { i: '🕒', t: 'Giacenza', d: 'Da quanti giorni le vetture sono in stock (fasce di giorni)', go: () => stock('panoramica', 'Giacenza') },
            { i: '⚠️', t: 'Giacenza per marchio', d: 'Modelli critici e vetture ferme da troppo tempo', go: () => stock('panoramica', 'Giacenza per marchio') },
            { i: '📋', t: 'Tutte le vetture', d: "L'elenco completo, con ricerca e filtri", go: () => stock('tutte') },
            { i: '🆕', t: 'Nuove entrate', d: "Le vetture entrate con l'ultimo caricamento", go: () => stock('nuove') },
            { i: '📤', t: 'Rimosse', d: 'Vetture uscite dallo stock, con il motivo', go: () => stock('rimosse') }
        ],
        [   // 03 COMMERCIALE
            { i: '📊', t: 'Panoramica', d: 'Preventivi, contratti, conversione e annullati di tutte le sedi', go: () => commerciale({ k: 'all' }) },
            { i: '🏢', t: 'Per sede', d: 'Ognuna con i suoi consulenti', chips: [['Agnano', () => commerciale({ k: 'sede', s: 'Agnano' })], ['Casamarciano', () => commerciale({ k: 'sede', s: 'Casamarciano' })], ['Salerno', () => commerciale({ k: 'sede', s: 'Salerno' })]] },
            { i: '🏆', t: 'Classifica consulenti', d: 'Preventivi, contratti e conversione di ogni consulente', go: () => commerciale({ k: 'all' }, 'Classifica consulenti') },
            { i: '💼', t: 'B2B e Noleggio', d: 'I contratti B2B e quelli del Noleggio', chips: [['B2B', () => commerciale({ k: 'b2b' })], ['Noleggio', () => commerciale({ k: 'sede', s: 'Noleggio' })]] },
            { i: '📈', t: 'Andamento mensile', d: 'Preventivi, contratti, annullati e fallite mese per mese', go: () => commerciale({ k: 'all' }, 'Andamento mensile') },
            { i: '🧭', t: 'Origini', d: 'Da dove arrivano preventivi e contratti (sito, Autoscout, ingresso…)', go: () => commerciale({ k: 'all' }, 'Preventivi e contratti per origine') },
            { i: '🏷️', t: 'Performance marchi', d: 'Preventivi, contratti e conversione per marca', go: () => commerciale({ k: 'marche' }) },
            { i: '📞', t: 'Preventivi telefonici', d: 'I preventivi fatti al telefono e quanti diventano contratti', go: () => commerciale({ k: 'pt' }) },
            { i: '↩️', t: 'Contratti annullati', d: 'Annullati per sede, con il motivo e la fonte', go: () => commerciale({ k: 'ann' }) },
            { i: '📋', t: 'Tutte le trattative', d: "L'elenco completo con ricerca e filtri", go: () => commerciale({ k: 'list' }) }
        ],
        [   // 04 SERVICE (in arrivo)
            { i: '📦', t: 'Magazzino ricambi', d: 'In arrivo' }, { i: '🧾', t: 'Ordini di lavoro', d: 'In arrivo' }, { i: '🛎️', t: 'Accettazione', d: 'In arrivo' }
        ]
    ];
    const SUB = [[0, 5, 2], [0, 1, 2], [0, 2, 7], [0, 1, 2]];

    // SERVICE: officina "connessa" — la Sportequipe sale sul ponte, una scansione
    // la attraversa e compaiono i punti di diagnosi; l'ordine di lavoro si spunta da solo.
    // Foto della vettura: /img/macro/sportequipe-service.png (sfondo gia' tolto).
    function serviceScene() {
        // Coordinate del palco: 750 x 580. Vettura: foto ritagliata 413 x 244.
        const CW = 356, CK = CW / 413, CH = Math.round(244 * CK), CX = 146, CY = 236;
        const at = (x, y) => [CX + x * CK, CY + y * CK];
        // punti di diagnosi sulla vettura (coordinate della foto) e dove va l'etichetta
        const PTS = [
            { p: [242, 185], l: [-40, 96], t: 'Freni anteriori', v: '92%', ok: 1 },
            { p: [120, 108], l: [-150, -40], t: 'Olio motore', v: 'Da sostituire', ok: 0 },
            { p: [40, 150], l: [-150, 66], t: 'Batteria 12V', v: '12,6 V', ok: 1 },
            { p: [300, 60], l: [-150, -96], t: 'Climatizzazione', v: 'OK', ok: 1 },
            { p: [392, 140], l: [-10, 120], t: 'Pneumatici', v: '6,8 mm', ok: 1 }
        ];
        const SCAN = 7;   // secondi della scansione (la vettura sale, scansione, scende)
        let callouts = '';
        PTS.forEach((d, i) => {
            const [x, y] = at(d.p[0], d.p[1]), lx = x + d.l[0], ly = y + d.l[1];
            const delay = (1.2 + (d.p[0] / 413) * 3.6).toFixed(2);
            const left = d.l[0] < -60, w = 136;
            callouts += `<g class="sv-co" style="--dl:${delay}s">
              <circle class="sv-co-r" cx="${x}" cy="${y}" r="10"/><circle class="sv-co-d" cx="${x}" cy="${y}" r="4"/>
              <path class="sv-co-l" d="M${x} ${y} L${lx + (left ? w : 0)} ${ly}"/>
              <g transform="translate(${left ? lx : lx} ${ly - 17})"><rect width="${w}" height="34" rx="9" class="sv-co-b"/>
                <text x="12" y="14" class="sv-co-t">${d.t.toUpperCase()}</text>
                <text x="12" y="27" class="sv-co-v ${d.ok ? '' : 'warn'}">${d.ok ? '● ' : '▲ '}${d.v}</text></g></g>`;
        });
        const floorLines = [];
        for (let i = -10; i <= 10; i++) floorLines.push(`<line x1="${375 + i * 26}" y1="420" x2="${375 + i * 110}" y2="600"/>`);
        for (let j = 0; j < 7; j++) { const y = 420 + Math.pow(j / 6, 1.7) * 160; floorLines.push(`<line x1="0" y1="${y}" x2="750" y2="${y}"/>`); }
        return `
        <div class="sv">
          <svg class="sv-bg" viewBox="0 0 750 580" preserveAspectRatio="none">
            <defs>
              <linearGradient id="svWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1420"/><stop offset="1" stop-color="#121b2a"/></linearGradient>
              <linearGradient id="svFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#17202d"/><stop offset="1" stop-color="#0b0f16"/></linearGradient>
              <radialGradient id="svSpot" cx="50%" cy="0%" r="70%"><stop offset="0" stop-color="#7cc4ff" stop-opacity=".35"/><stop offset="1" stop-color="#7cc4ff" stop-opacity="0"/></radialGradient>
            </defs>
            <rect width="750" height="420" fill="url(#svWall)"/>
            ${[60, 170, 280, 470, 580, 690].map(x => `<rect x="${x}" y="40" width="2" height="380" fill="rgba(255,255,255,.035)"/>`).join('')}
            <rect x="0" y="372" width="750" height="48" fill="rgba(255,255,255,.025)"/>
            <rect y="420" width="750" height="160" fill="url(#svFloor)"/>
            <g stroke="rgba(124,196,255,.10)" stroke-width="1">${floorLines.join('')}</g>
            <polygon points="250,0 500,0 640,580 110,580" fill="url(#svSpot)" class="sv-cone"/>
            ${[0, 1, 2].map(i => `<rect x="${200 + i * 120}" y="${14 + i * 0}" width="110" height="4" rx="2" fill="#bfe3ff" class="sv-led" style="animation-delay:${i * .4}s"/>`).join('')}
          </svg>

          <!-- ponte sollevatore -->
          <div class="sv-post sv-l"><i></i></div><div class="sv-post sv-r"><i></i></div>
          <div class="sv-lift" style="--cx:${CX}px;--cy:${CY}px;--cw:${CW}px;--ch:${CH}px">
            <div class="sv-arm sv-a1"></div><div class="sv-arm sv-a2"></div>
            <div class="sv-car">
              <img class="sv-img" src="/img/macro/sportequipe-service.png" alt="">
              <img class="sv-xray" src="/img/macro/sportequipe-service.png" alt="">
              <div class="sv-beam"></div>
            </div>
            <svg class="sv-co-svg" viewBox="0 0 750 580">${callouts}</svg>
          </div>
          <div class="sv-shadow"></div>
          <img class="sv-refl" src="/img/macro/sportequipe-service.png" alt="" style="left:${CX}px;top:${CY + CH - 6}px;width:${CW}px">

          <!-- HUD diagnosi -->
          <div class="sv-hud">
            <svg viewBox="0 0 44 44" class="sv-ring"><circle cx="22" cy="22" r="18" class="bg"/><circle cx="22" cy="22" r="18" class="fg"/></svg>
            <div><small>DIAGNOSI IN CORSO</small><b><span class="sv-pct">0</span>%</b><em>Sportequipe · OdL 2026-0418</em></div>
          </div>
          <!-- ordine di lavoro -->
          <div class="sv-odl">
            <div class="sv-odl-h"><small>ORDINE DI LAVORO</small><b>Tagliando 30.000 km</b></div>
            ${['Accettazione', 'Diagnosi elettronica', 'Cambio olio e filtri', 'Controllo freni', 'Lavaggio e consegna'].map((x, i) => `<div class="sv-step" style="--i:${i}"><i></i><span>${x}</span></div>`).join('')}
            <div class="sv-odl-f"><span>Ricambi riservati</span><b>3 / 3</b></div>
          </div>
          <div class="sv-chip"><i></i>Officina connessa · in arrivo</div>
        </div>`;
    }

    // COMMERCIALE: plancia notturna. Coordinate del palco 750 x 580.
    // Parabrezza (strada, citta', auto davanti), display curvo con due quadranti (vendite e
    // noleggio del mese: numeri veri) e al centro l'andamento degli ultimi 6 mesi; bocchette,
    // luce ambiente, tunnel con cambio e start, volante.
    function cockpitScene() {
        let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
        // skyline con finestre accese
        let city = '', win = '';
        for (let x = 70; x < 690; ) {
            const w = 10 + Math.round(rnd() * 22), h = 8 + Math.round(rnd() * (Math.abs(x - 375) < 120 ? 34 : 20));
            city += `<rect x="${x}" y="${158 - h}" width="${w}" height="${h}"/>`;
            for (let wy = 158 - h + 3; wy < 155; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 4) if (rnd() < .22) win += `<rect x="${wx}" y="${wy}" width="1.6" height="1.6" opacity="${(.35 + rnd() * .6).toFixed(2)}"/>`;
            x += w + Math.round(rnd() * 3);
        }
        let stars = ''; for (let k = 0; k < 26; k++) stars += `<circle cx="${(80 + rnd() * 590).toFixed(0)}" cy="${(20 + rnd() * 90).toFixed(0)}" r="${(.5 + rnd() * .8).toFixed(1)}" opacity="${(.25 + rnd() * .5).toFixed(2)}"/>`;
        // quadrante: 270 gradi, tacche
        const dial = (id, lab, col1, col2) => {
            let t = '';
            for (let k = 0; k <= 40; k++) {
                const a = (135 + k * 270 / 40) * Math.PI / 180, big = k % 5 === 0, r1 = big ? 64 : 68, r2 = 74;
                t += `<line x1="${(100 + r1 * Math.cos(a)).toFixed(1)}" y1="${(100 + r1 * Math.sin(a)).toFixed(1)}" x2="${(100 + r2 * Math.cos(a)).toFixed(1)}" y2="${(100 + r2 * Math.sin(a)).toFixed(1)}" class="${big ? 'bh-ck-tb' : ''}"/>`;
            }
            return `<div class="bh-ck-dial" data-ck="${id}">
              <svg viewBox="0 0 200 200"><defs><linearGradient id="bh-ckd-${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${col1}"/><stop offset="1" stop-color="${col2}"/></linearGradient>
                <radialGradient id="bh-ckf-${id}"><stop offset=".55" stop-color="${col2}" stop-opacity=".10"/><stop offset="1" stop-color="${col2}" stop-opacity="0"/></radialGradient></defs>
                <circle cx="100" cy="100" r="96" fill="url(#bh-ckf-${id})"/>
                <circle cx="100" cy="100" r="84" class="bh-ck-trk"/>
                <circle cx="100" cy="100" r="84" class="bh-ck-arc" stroke="url(#bh-ckd-${id})"/>
                <g class="bh-ck-tk">${t}</g>
                <g class="bh-ck-nd"><circle cx="184" cy="100" r="5.5" fill="#fff"/><circle cx="184" cy="100" r="11" fill="${col2}" opacity=".35"/></g>
                <text x="60" y="181" class="bh-ck-mm">0</text><text x="140" y="181" class="bh-ck-mm" data-ck-max>–</text></svg>
              <div class="bh-ck-dv"><small>${lab}</small><b data-ck-val>–</b><em>contratti</em><span data-ck-mese>mese in corso</span></div>
              <div class="bh-ck-best" data-ck-best>&nbsp;</div>
            </div>`;
        };
        return `<div class="bh-ck" id="bh-ck">
          <svg class="bh-ck-wind" viewBox="0 0 750 232" preserveAspectRatio="none">
            <defs>
              <linearGradient id="bh-cks" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070a18"/><stop offset=".5" stop-color="#151a36"/><stop offset=".8" stop-color="#352947"/><stop offset="1" stop-color="#5d3540"/></linearGradient>
              <radialGradient id="bh-ckh" cx=".5" cy="1" r=".6"><stop offset="0" stop-color="#ff8a4a" stop-opacity=".45"/><stop offset="1" stop-color="#ff8a4a" stop-opacity="0"/></radialGradient>
              <linearGradient id="bh-ckr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1b22"/><stop offset="1" stop-color="#08090c"/></linearGradient>
              <radialGradient id="bh-ckt"><stop offset="0" stop-color="#ff3b2f" stop-opacity=".9"/><stop offset="1" stop-color="#ff3b2f" stop-opacity="0"/></radialGradient>
              <radialGradient id="bh-ckl"><stop offset="0" stop-color="#ffc070" stop-opacity=".55"/><stop offset="1" stop-color="#ffc070" stop-opacity="0"/></radialGradient>
              <linearGradient id="bh-ckm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2c34"/><stop offset="1" stop-color="#101116"/></linearGradient>
            </defs>
            <rect width="750" height="160" fill="url(#bh-cks)"/>
            <g fill="#fff">${stars}</g>
            <ellipse cx="375" cy="160" rx="380" ry="46" fill="url(#bh-ckh)"/>
            <g fill="#0b0d1a">${city}</g><g fill="#ffcf7a">${win}</g>
            <polygon points="0,232 340,158 410,158 750,232" fill="url(#bh-ckr)"/>
            <line x1="342" y1="158" x2="40" y2="232" class="bh-ck-edge"/><line x1="408" y1="158" x2="710" y2="232" class="bh-ck-edge"/>
            ${[0.18, 0.34, 0.55, 0.82].map(q => { const y = 158 + q * 74, h = 6 + q * 70, xl = 340 - q * 300 - 14 * q, xr = 410 + q * 300 + 14 * q, r = 1.2 + q * 3; return [[xl, -1], [xr, 1]].map(([x, d]) => `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x.toFixed(1)}" y2="${(y - h).toFixed(1)}" class="bh-ck-pole" stroke-width="${(.6 + q * 1.6).toFixed(1)}"/><line x1="${x.toFixed(1)}" y1="${(y - h).toFixed(1)}" x2="${(x - d * (3 + q * 14)).toFixed(1)}" y2="${(y - h).toFixed(1)}" class="bh-ck-pole" stroke-width="${(.6 + q * 1.4).toFixed(1)}"/><circle cx="${(x - d * (3 + q * 14)).toFixed(1)}" cy="${(y - h + 1).toFixed(1)}" r="${(r * 3).toFixed(1)}" fill="url(#bh-ckl)"/><circle cx="${(x - d * (3 + q * 14)).toFixed(1)}" cy="${(y - h + 1).toFixed(1)}" r="${(r * .55).toFixed(1)}" fill="#ffe3b0"/>`).join(''); }).join('')}
            <line x1="362" y1="158" x2="250" y2="232" class="bh-ck-lane"/><line x1="388" y1="158" x2="500" y2="232" class="bh-ck-lane"/>
            <g class="bh-ck-car"><ellipse cx="381" cy="176" rx="30" ry="9" fill="url(#bh-ckt)" opacity=".5"/>
              <path d="M364,174 L366,166 Q368,162 373,162 L389,162 Q394,162 396,166 L398,174 Z" fill="#0a0b0f"/>
              <rect x="362" y="170" width="38" height="7" rx="2" fill="#111218"/>
              <rect x="364" y="171" width="7" height="2.4" rx="1" fill="#ff4a3a"/><rect x="391" y="171" width="7" height="2.4" rx="1" fill="#ff4a3a"/>
              <circle cx="367.5" cy="172.2" r="6" fill="url(#bh-ckt)"/><circle cx="394.5" cy="172.2" r="6" fill="url(#bh-ckt)"/></g>
            <path d="M0,0 L96,0 L18,232 L0,232 Z" fill="#06070a"/><path d="M750,0 L654,0 L732,232 L750,232 Z" fill="#06070a"/>
            <rect width="750" height="12" fill="#06070a"/>
            <rect x="371" y="10" width="8" height="12" fill="#0b0c10"/>
            <rect x="318" y="18" width="114" height="34" rx="12" fill="url(#bh-ckm)" stroke="rgba(255,255,255,.08)"/>
            <rect x="326" y="24" width="98" height="22" rx="8" fill="#0d1222"/><path d="M330,40 L352,26 L366,26 L344,40 Z" fill="rgba(255,255,255,.06)"/>
          </svg>
          <div class="bh-ck-dash">
            <div class="bh-ck-disp">
              ${dial('v', 'VENDITE · MESE', '#ff6a1a', '#ffb36b')}
              <div class="bh-ck-mid">
                <div class="bh-ck-sb"><b data-ck-ora>--:--</b><span data-ck-data></span><span class="bh-ck-ic"><i class="bh-ck-sig"><i></i><i></i><i></i></i>18°</span></div>
                <div class="bh-ck-ch"><div class="bh-ck-cht"><small>CONTRATTI · ULTIMI 6 MESI</small><span><i class="v"></i>Vendita<i class="n"></i>Noleggio</span></div>
                  <div class="bh-ck-bars" data-ck-bars>${'<div><i class="v"></i><i class="n"></i><em></em></div>'.repeat(6)}</div></div>
                <div class="bh-ck-ind">
                  <div><small>LEAD · OGGI</small><b data-n="38">0</b><em class="bh-up">▲ 12%</em></div>
                  <div><small>OBIETTIVO</small><b><span data-n="78">0</span>%</b><span class="bh-ck-pb"><i></i></span></div>
                </div>
              </div>
              ${dial('n', 'NOLEGGIO · MESE', '#2f7de0', '#8fd0ff')}
            </div>
            <div class="bh-ck-vent bh-l"></div><div class="bh-ck-vent bh-r"></div>
            <div class="bh-ck-strip"></div>
          </div>
          <div class="bh-ck-console">
            <div class="bh-ck-gear"><span>P</span><span>R</span><span>N</span><span class="on">D</span></div>
            <div class="bh-ck-start"><b>ENGINE</b><small>START · STOP</small></div>
            <div class="bh-ck-clim"><span>21,5°</span><small>AUTO</small></div>
          </div>
          <svg class="bh-ck-wheel" viewBox="0 0 360 360"><defs><linearGradient id="bh-ckw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2b31"/><stop offset=".25" stop-color="#121317"/><stop offset="1" stop-color="#08090b"/></linearGradient></defs>
            <circle cx="180" cy="180" r="150" fill="none" stroke="url(#bh-ckw)" stroke-width="34"/>
            <circle cx="180" cy="180" r="150" fill="none" stroke="rgba(255,140,60,.55)" stroke-width="1.2" stroke-dasharray="3 4"/>
            <path d="M42,196 C90,170 270,170 318,196 L304,232 C250,212 110,212 56,232 Z" fill="#101115"/>
            <circle cx="180" cy="214" r="46" fill="#121318" stroke="rgba(255,255,255,.07)"/><circle cx="180" cy="214" r="18" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="2"/>
            <rect x="78" y="186" width="26" height="12" rx="4" fill="#1d1f25"/><rect x="256" y="186" width="26" height="12" rx="4" fill="#1d1f25"/></svg>
        </div>`;
    }

    function template() {
        return `
<div class="bh-page">
 <aside class="bh-side" id="bh-side" hidden aria-label="Opzioni della sezione"></aside>
 <div class="bh-frame" id="bh-frame"><div class="bh-stagewrap" id="bh-sw">
  <div class="bh-card">
    <div class="bh-hd"><small>BUSINESS INTELLIGENCE</small><h1>BI</h1></div>
    <div class="bh-av" id="bh-av">GP</div>

    <nav class="bh-rail">
      <button class="bh-ch" data-c="0" type="button" style="--c:#f4a83a"><span class="bh-n">01</span><span class="bh-t">Consegne</span><span class="bh-d">Tempistiche, analisi e verifiche</span><span class="bh-bar"><i></i></span></button>
      <button class="bh-ch" data-c="1" type="button" style="--c:#3fcfae"><span class="bh-n">02</span><span class="bh-t">Stock</span><span class="bh-d">Giacenza, marchi e motorizzazioni</span><span class="bh-bar"><i></i></span></button>
      <button class="bh-ch" data-c="2" type="button" style="--c:#ff7a1a"><span class="bh-n">03</span><span class="bh-t">Commerciale</span><span class="bh-d">Contratti, origini e preventivi</span><span class="bh-bar"><i></i></span></button>
      <button class="bh-ch" data-c="3" type="button" style="--c:#4aa8ff"><span class="bh-n">04</span><span class="bh-t">Service</span><span class="bh-d">Prossimamente</span><span class="bh-bar"><i></i></span></button>
      <ul class="bh-sub" id="bh-sub"></ul>
    </nav>
    <button class="bh-enter" type="button" id="bh-enter">Entra <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#111" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <button class="bh-back" type="button">← Home</button>

    <div class="bh-stage" id="bh-stage">
      <div class="bh-spot"></div><div class="bh-floor"></div>

      <!-- CONSEGNE -->
      <div class="bh-scene" data-s="0">
        <div class="bh-cap"><i></i>Consegna al cliente</div>
        <div class="bh-k3" id="bh-k3"><div class="bh-body" id="bh-k3b"><img src="/img/macro/ich-x-k3.png" alt=""><img class="bh-refl" src="/img/macro/ich-x-k3.png" alt="">
          <span class="bh-bl" style="left:28%;top:36%;width:18%;height:22%"></span><span class="bh-bl" style="left:12%;top:38%;width:9%;height:16%"></span></div></div>
        <div class="bh-ho" id="bh-ho"><img class="bh-hand bh-cli" id="bh-cli" src="/img/macro/mano-cliente-3d.png" alt=""><div class="bh-fsh" id="bh-fsh"></div><div class="bh-fob" id="bh-fob"><svg viewBox="0 0 120 110" xmlns="http://www.w3.org/2000/svg" class="fob-svg">
  <defs>
    <linearGradient id="bhfobside" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b3f47"/><stop offset="1" stop-color="#15171b"/></linearGradient>
    <radialGradient id="bhfobtop" cx="30%" cy="20%" r="90%"><stop offset="0" stop-color="#8a909b"/><stop offset=".45" stop-color="#5a5f69"/><stop offset="1" stop-color="#34373e"/></radialGradient>
    <linearGradient id="bhfobpan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1e25"/><stop offset=".5" stop-color="#08090c"/><stop offset="1" stop-color="#030405"/></linearGradient>
    <linearGradient id="bhfobgl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".45" stop-color="#fff" stop-opacity=".06"/><stop offset=".46" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="bhfobrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d737e"/><stop offset="1" stop-color="#1a1c21"/></linearGradient>
    <filter id="bhfobgrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="4" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .07 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <filter id="bhfobglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <radialGradient id="bhfobp" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#e2f9ff" stop-opacity=".95"/><stop offset="1" stop-color="#5fd0ff" stop-opacity="0"/></radialGradient>
    <clipPath id="bhfobpc"><path d="M34,16 L86,16 Q88,16 89.5,17.5 L102,30 Q104,32 104,34 L104,64 Q104,66 102,68 L89.5,80.5 Q88,82 86,82 L34,82 Q32,82 30.5,80.5 L18,68 Q16,66 16,64 L16,34 Q16,32 18,30 L30.5,17.5 Q32,16 34,16 Z"/></clipPath>
  </defs>
  <!-- spessore (fianco) -->
  <path d="M30,6 Q27,6 25,8 L8,25 Q6,27 6,30 L6,68 Q6,71 8,73 L25,90 Q27,92 30,92 L90,92 Q93,92 95,90 L112,73 Q114,71 114,68 L114,30 Q114,27 112,25 L95,8 Q93,6 90,6 Z" transform="translate(0,9)" fill="url(#bhfobside)"/>
  <path d="M30,6 Q27,6 25,8 L8,25 Q6,27 6,30 L6,68 Q6,71 8,73 L25,90 Q27,92 30,92 L90,92 Q93,92 95,90 L112,73 Q114,71 114,68 L114,30 Q114,27 112,25 L95,8 Q93,6 90,6 Z" transform="translate(0,4.5)" fill="#2a2d33"/>
  <!-- asola portachiavi sul fianco -->
  <rect x="44" y="96" width="32" height="7" rx="2.5" fill="#0d0e11"/>
  <!-- faccia superiore opaca -->
  <path d="M30,6 Q27,6 25,8 L8,25 Q6,27 6,30 L6,68 Q6,71 8,73 L25,90 Q27,92 30,92 L90,92 Q93,92 95,90 L112,73 Q114,71 114,68 L114,30 Q114,27 112,25 L95,8 Q93,6 90,6 Z" fill="url(#bhfobtop)"/>
  <path d="M30,6 Q27,6 25,8 L8,25 Q6,27 6,30 L6,68 Q6,71 8,73 L25,90 Q27,92 30,92 L90,92 Q93,92 95,90 L112,73 Q114,71 114,68 L114,30 Q114,27 112,25 L95,8 Q93,6 90,6 Z" fill="#000" filter="url(#bhfobgrain)"/>
  <path d="M30,6 Q27,6 25,8 L8,25 Q6,27 6,30 L6,68 Q6,71 8,73 L25,90 Q27,92 30,92 L90,92 Q93,92 95,90 L112,73 Q114,71 114,68 L114,30 Q114,27 112,25 L95,8 Q93,6 90,6 Z" fill="none" stroke="#a9afb9" stroke-opacity=".55" stroke-width="1"/>
  <!-- inserto nero lucido con bordo smussato -->
  <path d="M34,16 L86,16 Q88,16 89.5,17.5 L102,30 Q104,32 104,34 L104,64 Q104,66 102,68 L89.5,80.5 Q88,82 86,82 L34,82 Q32,82 30.5,80.5 L18,68 Q16,66 16,64 L16,34 Q16,32 18,30 L30.5,17.5 Q32,16 34,16 Z" transform="translate(0,1.2)" fill="#000" opacity=".6"/>
  <path d="M34,16 L86,16 Q88,16 89.5,17.5 L102,30 Q104,32 104,34 L104,64 Q104,66 102,68 L89.5,80.5 Q88,82 86,82 L34,82 Q32,82 30.5,80.5 L18,68 Q16,66 16,64 L16,34 Q16,32 18,30 L30.5,17.5 Q32,16 34,16 Z" fill="url(#bhfobpan)" stroke="url(#bhfobrim)" stroke-width="1.4"/>
  <g clip-path="url(#bhfobpc)">
    <!-- fughe tra i 4 tasti -->
    <path d="M60,16 V82 M16,49 H104" stroke="#000" stroke-width="2.2"/>
    <path d="M61.2,16 V82 M16,50.2 H104" stroke="#2b2f37" stroke-width=".7"/>
    <!-- riflesso -->
    <path d="M10,10 H112 L112,30 L10,62 Z" fill="url(#bhfobgl)"/>
  </g>
  <g fill="none" stroke="#f1f5fa" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" filter="url(#bhfobglow)">
    <!-- alto sx: chiudi -->
    <g transform="translate(40,33)"><rect x="-4.5" y="-1" width="9" height="7" rx="1.5"/><path d="M-2.3,-1 v-2.3 a2.3,2.3 0 0 1 4.6,0 v2.3"/></g>
    <!-- alto dx: bagagliaio (auto con portellone aperto) -->
    <g transform="translate(80,34)"><path d="M-8,4 H8 M-7,4 V1 L-4,-3 H2.5 L5,0.5"/><path d="M5,0.5 L9,-4.5"/><path d="M-7,1 H7"/></g>
    <!-- basso sx: avvio a distanza -->
    <g transform="translate(40,66)"><path d="M-4.2,1.8 a4.6,4.6 0 1 0 4.4,-6"/><path d="M-0.5,-6.8 l2.2,2.2 l-2.7,1.5"/></g>
    <!-- basso dx: apri -->
    <g transform="translate(81,66)"><rect x="-4.5" y="-1" width="9" height="7" rx="1.5"/><path d="M-2.3,-1 v-2.3 a2.3,2.3 0 0 1 4.6,-.5"/></g>
  </g>
  <!-- led centrale -->
  <rect x="53" y="47.2" width="14" height="3.6" rx="1.8" fill="#15181e" stroke="#3a3f48" stroke-width=".5"/>
  <rect class="k-led" x="55" y="48.3" width="10" height="1.4" rx=".7" fill="#ff5a5a" opacity="0"/>
  <circle class="k-press" cx="81" cy="66" r="14" fill="url(#bhfobp)" opacity="0"/>
</svg></div><img class="bh-hand bh-con" id="bh-con" src="/img/macro/mano-consulente-3d.png" alt=""></div>
        <div class="bh-ok" id="bh-okb"><i><svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></i>Consegnata</div>
      </div>

      <!-- STOCK -->
      <div class="bh-scene" data-s="1">
        <div class="bh-cap"><i></i>I nostri marchi · stock</div>
        <div class="bh-disc"></div>
        <div class="bh-turn"><div class="bh-ring" id="bh-ring"></div></div>
        <div class="bh-chip"><i></i>Vetture in stock</div>
      </div>
      <!-- COMMERCIALE: plancia di un'auto di notte (cockpitScene). Vendite e noleggio del mese sono
           veri (dal Commerciale), lead e obiettivo restano indicativi -->
      <div class="bh-scene" data-s="2">
        <div class="bh-cap"><i></i>Lead, vendite e noleggio</div>
        ${cockpitScene()}
      </div>
      <!-- SERVICE: officina connessa (in arrivo), disegnata da serviceScene() -->
      <div class="bh-scene" data-s="3">
        <div class="bh-cap"><i></i>Officina · ricambi · ordini di lavoro · prossimamente</div>
        ${serviceScene()}
      </div>
      <div class="bh-beam" id="bh-beam"></div>
    </div>
  </div>
 </div></div>
</div>

`;
    }

  function initScene() {
  const $ = id => document.getElementById(id);
  let active = false;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sw = $('bh-sw');
  function scale() {
    // NUOVO (telefono): il riquadro non si rimpicciolisce tutto insieme (diventerebbe illeggibile).
    // Il testo resta a grandezza normale e si rimpicciolisce solo il palco con l'animazione (750x580).
    if (matchMedia('(max-width:760px)').matches) {
      const card = sw.querySelector('.bh-card'), cs = getComputedStyle(card);
      const w = card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      sw.style.setProperty('--k', Math.max(.2, Math.min(1, w / 750)).toFixed(4));
    } else sw.style.setProperty('--k', ($('bh-frame').clientWidth / 1100).toFixed(4));
    // il pannello delle opzioni e' alto quanto il riquadro (su schermo stretto va sotto e ha la sua altezza)
    const sd = $('bh-side'); if (sd) sd.style.height = matchMedia('(max-width:900px)').matches ? '' : $('bh-frame').clientHeight + 'px';
  }
  addEventListener('resize', () => { if (active) scale(); });
  // il riquadro si ridimensiona anche quando si apre/chiude il pannello delle opzioni a sinistra
  if (window.ResizeObserver) new ResizeObserver(() => { if (active) scale(); }).observe($('bh-frame'));

  const CH = [
    { acc: '#f4a83a', tint: 'rgba(244,168,58,.28)', sub: SUB[0].map(k => [OPZ[0][k].t]) },
    { acc: '#3fcfae', tint: 'rgba(63,207,174,.26)', sub: SUB[1].map(k => [OPZ[1][k].t]) },
    { acc: '#ff7a1a', tint: 'rgba(255,106,26,.18)', sub: SUB[2].map(k => [OPZ[2][k].t]) },
    { acc: '#4aa8ff', tint: 'rgba(74,168,255,.22)', sub: [['Magazzino ricambi', 'In arrivo'], ['Ordini di lavoro', 'In arrivo'], ['Accettazione', 'In arrivo']], off: true }
  ];
  // permessi: si rileggono ogni volta che la pagina si apre
  function permessi() {
    const M = window.MacroHome || {};
    CH[0].off = !(M.canConsegne ? M.canConsegne() : true);
    CH[1].off = !(M.canStock && M.canStock());
    CH[2].off = !(M.canCommerciale && M.canCommerciale());
  }
  permessi();
  const DUR = 9000;
  let cur = -1, timer = null, paused = false;
  let trT = null;
  // porta le scene allo stato finale (solo quella corrente visibile): annulla transizioni a meta'
  function settle() {
    clearTimeout(trT); trT = null;
    document.querySelectorAll('#biPage .bh-scene').forEach(s => {
      s.classList.remove('bh-hide', 'bh-reveal');
      s.classList.toggle('bh-on', cur >= 0 && +s.dataset.s === cur);
    });
  }
  let go = function (i, first) {
    if (i === cur) return;
    settle();
    const c = CH[i];
    sw.style.setProperty('--acc', c.acc); sw.style.setProperty('--tint', c.tint);
    document.querySelectorAll('#biPage .bh-ch').forEach(b => { b.classList.remove('bh-on'); if (+b.dataset.c === i) { void b.offsetWidth; b.classList.add('bh-on'); b.style.setProperty('--dur', DUR + 'ms'); } });
    $('bh-enter').classList.toggle('bh-off', !!c.off);
    $('bh-enter').firstChild.textContent = c.off ? 'In arrivo ' : 'Entra ';
    const sub = $('bh-sub'); sub.innerHTML = c.sub.map((s, k) => `<li data-sub="${i}|${k}"><i></i><span>${s[0]}</span>${s[1] ? `<em>${s[1]}</em>` : ''}</li>`).join('');
    [...sub.children].forEach((li, k) => setTimeout(() => li.classList.add('bh-in'), 250 + k * 90));
    const scenes = document.querySelectorAll('#biPage .bh-scene');
    if (first) { scenes.forEach(s => s.classList.toggle('bh-on', +s.dataset.s === i)); }
    else {
      const oldS = scenes[cur], newS = scenes[i];
      $('bh-beam').classList.remove('bh-go'); void $('bh-beam').offsetWidth; $('bh-beam').classList.add('bh-go');
      if (oldS) oldS.classList.add('bh-hide');
      newS.classList.add('bh-on', 'bh-reveal');
      trT = setTimeout(settle, 950);
    }
    cur = i;
  };
  function restart() { clearInterval(timer); if (active && !paused && !reduce && xp < 0) timer = setInterval(() => go((cur + 1) % CH.length), DUR); }

  /* ---------- NUOVO: SEZIONE APERTA = pannello delle opzioni a SINISTRA del riquadro ----------
     Cliccando un capitolo (Consegne, Stock, Commerciale, Service) a sinistra compare un pannello con
     TUTTE le voci della sezione (scorre se non ci sta) e lo scorrimento automatico si ferma.
     Cliccando un altro capitolo il pannello passa a quello; ✕ o Esc lo chiudono. Niente piu'
     "Mostra opzioni / Nascondi": resta solo "Entra". */
  let xp = -1;
  const rail = document.querySelector('#biPage .bh-rail'), side = $('bh-side');
  const posTog = () => {};
  const NOMI = ['Consegne', 'Stock', 'Commerciale', 'Service'], DESC = ['Tempistiche, analisi e verifiche', 'Giacenza, marchi e motorizzazioni', 'Contratti, origini e preventivi', 'Prossimamente'];
  function espandi(i) {
    xp = i; clearInterval(timer);
    rail.classList.add('bh-x-on');
    const c = CH[i], vietato = c.off && i !== 3;
    side.style.setProperty('--acc', c.acc);
    side.innerHTML = `<div class="bh-side-h"><div><small>${String(i + 1).padStart(2, '0')} · OPZIONI</small><b>${NOMI[i]}</b><em>${DESC[i]}</em></div>
        <button type="button" class="bh-side-x" aria-label="Chiudi le opzioni" title="Chiudi (Esc)">✕</button></div>
      <div class="bh-x-list">${(vietato ? '<p class="bh-x-msg">Non hai il permesso per questa sezione: chiedilo a un amministratore (pagina Permessi).</p>' : i === 3 ? '<p class="bh-x-msg">In arrivo: saranno disponibili presto.</p>' : '') +
      OPZ[i].map((o, k) => { const ok = !vietato && (o.go || o.chips); return `<div class="bh-xo ${ok ? '' : 'off'}" ${ok && o.go ? `data-xo="${i}|${k}" role="button" tabindex="0"` : ''}>
        <span class="bh-xo-i">${o.i}</span><span class="bh-xo-t"><b>${o.t}</b><em>${o.d}</em>${o.chips && ok ? `<span class="bh-xo-c">${o.chips.map((ch, j) => `<button type="button" data-xc="${i}|${k}|${j}">${ch[0]}</button>`).join('')}</span>` : ''}</span></div>`; }).join('')}</div>`;
    const prima = side.hidden;
    side.hidden = false;
    if (prima) { side.classList.remove('bh-side-in'); void side.offsetWidth; side.classList.add('bh-side-in'); }
    side.querySelector('.bh-x-list').scrollTop = 0;
  }
  function chiudi() {
    if (xp < 0) return;
    xp = -1;
    rail.classList.remove('bh-x-on');
    side.hidden = true; side.innerHTML = '';
    restart();
  }
  side.addEventListener('click', e => { if (e.target.closest('.bh-side-x')) chiudi(); });
  side.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
  // la rotellina scorre l'elenco senza muovere la pagina
  rail.addEventListener('wheel', e => { const l = e.target.closest('.bh-x-list'); if (l && l.scrollHeight > l.clientHeight) e.stopPropagation(); }, { passive: true });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && active && xp >= 0) chiudi(); });
  document.querySelectorAll('#biPage .bh-ch').forEach(b => b.addEventListener('click', () => { go(+b.dataset.c); espandi(+b.dataset.c); }));
  $('bh-frame').addEventListener('pointerenter', () => { paused = true; sw.classList.add('bh-paused'); clearInterval(timer); });
  $('bh-frame').addEventListener('pointerleave', () => { paused = false; sw.classList.remove('bh-paused'); restart(); });

  /* ---------- STOCK: pedana girevole con i loghi ---------- */
  // loghi dei marchi (cartella /img/marchi). Prima questi (i piu' venduti), poi tutti gli altri
  // marchi che hanno un logo nella cartella: si prova a caricarli e si tengono quelli che esistono.
  const PRIMI = ['peugeot', 'citroen', 'fiat', 'dr', 'bmw', 'volkswagen', 'audi', 'mg', 'sportequipe', 'ich-x', 'dacia', 'toyota', 'ford', 'kia', 'alfa-romeo', 'byd', 'opel', 'nissan'];
  const slugM = m => String(m).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const ALTRI = (typeof MARCHE_LIST !== 'undefined' ? MARCHE_LIST : []).concat(['ABARTH', 'ALPINE', 'HONDA', 'JAGUAR', 'LEXUS', 'LYNK & CO', 'POLESTAR', 'SUBARU', 'VOLVO', 'XPENG', 'KGM', 'SSANGYONG', 'MERCEDES'])
    .map(slugM).filter(x => x && x !== 'marca-generica' && !PRIMI.includes(x)).sort();
  const CANDIDATI = [...new Set(PRIMI.concat(ALTRI))];
  // La pedana ha 18 posti (piu' loghi insieme non ci stanno): quando un logo passa DIETRO, dove
  // non si vede, prende il marchio successivo. Giro dopo giro passano tutti, senza doppioni davanti.
  const ring = $('bh-ring'), N = 18, R = 270, POSTI = [];
  for (let i = 0; i < N; i++) {
    const d = document.createElement('div'); d.className = 'bh-plq';
    d.style.transform = `rotateY(${i * 360 / N}deg) translateZ(${R}px)`;
    d.innerHTML = '<img alt="">'; d.style.visibility = 'hidden'; ring.appendChild(d);
    POSTI.push({ el: d, img: d.querySelector('img'), dietro: false });
  }
  const loghi = [];        // url dei loghi che esistono, nell'ordine di CANDIDATI
  let prossimo = 0;
  const prova = (url) => new Promise(ok => { const im = new Image(); im.onload = () => ok(url); im.onerror = () => ok(null); im.src = url; });
  const caricaLogo = async sl => (await prova('/img/marchi/' + sl + '.png')) || (sl.includes('-') ? await prova('/img/marchi/' + sl.replace(/-/g, '') + '.png') : null);
  // elenco vero dei file della cartella (dal server); se non arriva, si provano i nomi dei marchi
  const daServer = fetch('/api/marchi/loghi', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null)
    .then(d => {
      const nomi = d && Array.isArray(d.loghi) ? d.loghi : [];
      if (!nomi.length) return null;
      const base = n => n.replace(/\.[a-z]+$/i, '').toLowerCase();
      const ord = n => { const i = PRIMI.findIndex(p => p === base(n) || p.replace(/-/g, '') === base(n).replace(/-/g, '')); return i < 0 ? 999 : i; };
      return nomi.slice().sort((x, y) => ord(x) - ord(y) || x.localeCompare(y)).map(n => '/img/marchi/' + encodeURIComponent(n));
    });
  daServer.then(lista => lista || Promise.all(CANDIDATI.map(caricaLogo))).then(urls => {
    urls.forEach(u => { if (u) loghi.push(u); });
    if (!loghi.length) return;
    POSTI.forEach((p, i) => { p.img.src = loghi[i % loghi.length]; p.el.style.visibility = ''; });
    prossimo = N % loghi.length;
    if (loghi.length > N) setInterval(cambiaDietro, 250);
  });
  function cambiaDietro() {
    if (document.hidden || !ring.getAnimations) return;
    const an = ring.getAnimations().find(a => a.animationName === 'bh-spin');
    if (!an || an.currentTime == null) return;
    const giro = -((an.currentTime % 40000) / 40000) * 360;          // bh-spin: rotateY da 0 a -360 in 40s
    POSTI.forEach((p, i) => {
      const ang = (((i * 360 / N + giro) % 360) + 360) % 360;         // 180 = esattamente dietro
      const dietro = ang > 140 && ang < 220;
      if (dietro && !p.dietro) { p.img.src = loghi[prossimo]; prossimo = (prossimo + 1) % loghi.length; }
      p.dietro = dietro;
    });
  }
  // La rotazione della pedana e' in CSS (bh-spin) e parte al caricamento, senza legame con il
  // capitolo: Stock risultava sfasato e si fermava con il mouse sopra. Qui la riportiamo a 0
  // ogni volta che il capitolo diventa attivo e la forziamo in play: con play() esplicito
  // animation-play-state (es. regola .bh-paused) non la ferma piu', come per le altre scene.
  const stockScene = document.querySelector('#biPage .bh-scene[data-s="1"]');
  function stockSpin() {
    if (reduce || !stockScene || !stockScene.getAnimations) return;
    stockScene.getAnimations({ subtree: true }).forEach(a => {
      if (a.animationName === 'bh-spin') { a.currentTime = 0; a.play(); }
    });
  }

  /* ---------- CONSEGNE: passaggio della chiave ---------- */
  const ho = $('bh-ho'), cli = $('bh-cli'), con = $('bh-con'), fob = $('bh-fob'), fsh = $('bh-fsh'), okb = $('bh-okb');
  const press = fob.querySelector('.k-press'), led = fob.querySelector('.k-led');
  const blinks = document.querySelectorAll('#biPage .bh-k3 .bh-bl'), k3b = $('bh-k3b');
  const waves = [0, 1, 2].map(() => { const w = document.createElement('span'); w.className = 'bh-wave'; ho.appendChild(w); return w; });
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), ease = t => 1 - Math.pow(1 - t, 3), eio = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const seg = (t, a, b) => clamp((t - a) / (b - a)), lerp = (a, b, t) => a + (b - a) * t;
  const PALM = { x: .388, y: .487 }, TIP = { x: .184, y: .146 }, POS = { x: 30, y: 170 }, P_T = 7.4;
  let lastSettle = -1;
  function frame(now) {
    if (!active) return;
    requestAnimationFrame(frame);
    if (cur !== 0 || reduce) return;
    const t = (now / 1000) % P_T;
    const pw = cli.offsetWidth, ph = cli.offsetHeight, gw = con.offsetWidth, gh = con.offsetHeight, fw = fob.offsetWidth;
    if (!pw || !gw) return;
    const up = ease(seg(t, .5, 1.4)) - ease(seg(t, 6.7, 7.3));
    const dip = Math.sin(Math.PI * seg(t, 2.72, 3.15)) * 7, hold = Math.sin(Math.PI * seg(t, 3.2, 6.5)) * -2;
    const py = POS.y + lerp(70, 0, up) + dip + hold, prot = lerp(8, 0, up) + dip * .4;
    cli.style.transformOrigin = '70% 90%'; cli.style.transform = `translate(${POS.x}px, ${py}px) rotate(${prot}deg)`; cli.style.opacity = clamp(up * 2.5);
    const P = { x: POS.x + PALM.x * pw, y: py + PALM.y * ph };
    const tip = { x: (1 - TIP.x) * gw, y: (1 - TIP.y) * gh }, target = { x: P.x + 4, y: P.y - 70 }, start = { x: target.x + 40, y: target.y - 210 };
    const inT = eio(seg(t, .25, 1.75)), down = eio(seg(t, 1.75, 2.4)), out = eio(seg(t, 2.75, 3.7));
    let fx = lerp(start.x, target.x, inT), fy = lerp(start.y, target.y, inT) + down * 24; fx = lerp(fx, start.x, out); fy = lerp(fy, start.y, out);
    const tilt = lerp(-14, 0, inT) + down * 6 - out * 12;
    con.style.transformOrigin = '0 0';
    con.style.transform = `translate(${fx - tip.x}px, ${fy - tip.y}px) translate(${tip.x}px, ${tip.y}px) rotate(${tilt}deg) translate(${-tip.x}px, ${-tip.y}px) translate(${gw / 2}px, ${gh / 2}px) rotate(180deg) translate(${-gw / 2}px, ${-gh / 2}px)`;
    con.style.opacity = Math.min(seg(t, .25, .75), 1 - seg(t, 3.2, 3.7));
    let cx, cy, rot, sy = 1;
    if (t < 2.5) { const s = Math.exp(-2 * Math.max(0, t - .3)) * Math.sin(8 * t) * 14; cx = fx; cy = fy + 14; rot = -22 + s + tilt * .5; fsh.style.opacity = 0; }
    else { const f = ease(seg(t, 2.5, 2.8)), b = Math.sin(Math.PI * seg(t, 2.8, 3.02)) * -5;
      cx = lerp(fx, P.x, f); cy = lerp(fy + 14, P.y - 8, f) + b; rot = lerp(-22, -16, f) + prot * .6; sy = lerp(1, .8, f);
      fsh.style.opacity = f * .9; fsh.style.transform = `translate(${P.x - 31}px, ${P.y + 10}px)`; }
    const fade = 1 - seg(t, 6.6, 7.0);
    fob.style.transform = `translate(${cx - fw / 2}px, ${cy - fw / 2}px) rotate(${rot}deg) scaleY(${sy})`;
    fob.style.opacity = (t < .25 ? 0 : 1) * fade; fsh.style.opacity = parseFloat(fsh.style.opacity || 0) * fade;
    const pr = Math.sin(Math.PI * seg(t, 3.9, 4.35)); press.style.opacity = pr; led.style.opacity = pr;
    const k = parseFloat(getComputedStyle(sw).getPropertyValue('--k')) || 1;
    const car = $('bh-k3').getBoundingClientRect(), s = ho.getBoundingClientRect();
    const tx = (car.left - s.left + car.width * .3) / k, ty = (car.top - s.top + car.height * .45) / k;
    waves.forEach((w, i) => { const q = seg(t, 4.05 + i * .18, 4.95 + i * .18); w.style.opacity = q > 0 && q < 1 ? (1 - q) * .9 : 0;
      w.style.left = lerp(P.x, tx, q) + 'px'; w.style.top = lerp(P.y - 16, ty, q) + 'px'; w.style.transform = `scale(${.6 + q * 1.4})`; });
    const bl = Math.max(Math.sin(Math.PI * seg(t, 4.75, 5.1)), Math.sin(Math.PI * seg(t, 5.25, 5.6)));
    blinks.forEach(x => x.style.opacity = bl);
    const cyc = Math.floor(now / 1000 / P_T);
    if (t > 4.75 && lastSettle !== cyc) { lastSettle = cyc; k3b.classList.remove('bh-settle'); void k3b.offsetWidth; k3b.classList.add('bh-settle'); }
    okb.classList.toggle('bh-show', t > 5.3 && t < 6.9);
  }
  // COMMERCIALE: la sequenza riparte ogni 7 secondi mentre il capitolo e' attivo
  const cm = $('bh-ck');
  // NUOVO: orologio della plancia e numeri veri (vendite e noleggio del mese, dal Commerciale)
  const MES = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const MESL = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const GG = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const ora = () => { const d = new Date(), o = cm.querySelector('[data-ck-ora]'), g = cm.querySelector('[data-ck-data]');
    if (o) o.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (g) g.textContent = GG[d.getDay()] + ' ' + d.getDate() + ' ' + MES[d.getMonth()]; };
  ora(); setInterval(ora, 20000);
  let ckDati = null, ckQuando = 0;
  function ckMostra() {
    const M = ckDati && ckDati.mesi, cur = M && M[M.length - 1];
    [['v', 'v'], ['n', 'n']].forEach(([id, f]) => {
      const el = cm.querySelector(`[data-ck="${id}"]`); if (!el) return;
      const val = el.querySelector('[data-ck-val]'), mx = el.querySelector('[data-ck-max]'), best = el.querySelector('[data-ck-best]'), mese = el.querySelector('[data-ck-mese]');
      if (!cur) { val.textContent = '–'; delete val.dataset.n; mx.textContent = '–'; best.innerHTML = 'dati non disponibili'; el.style.setProperty('--p', 0); el.style.setProperty('--a', '135deg'); return; }
      const top = M.reduce((b, x) => x[f] > b[f] ? x : b, M[0]), max = Math.max(1, top[f]), p = Math.min(1, cur[f] / max);
      val.dataset.n = cur[f]; if (!cm.classList.contains('bh-run')) val.textContent = cur[f];
      mx.textContent = max; mese.textContent = MESL[cur.m - 1] + ' · in corso';
      best.innerHTML = top === cur ? 'mese migliore degli ultimi 6' : `mese migliore: <b>${top[f]}</b> a ${MESL[top.m - 1]}`;
      el.style.setProperty('--p', p.toFixed(3)); el.style.setProperty('--a', (135 + 270 * p).toFixed(1) + 'deg');
    });
    const bars = cm.querySelector('[data-ck-bars]'); if (!bars) return;
    const mx = M ? Math.max(1, ...M.map(x => Math.max(x.v, x.n))) : 1;
    [...bars.children].forEach((b, i) => { const x = M && M[i];
      b.children[0].style.setProperty('--h', x ? Math.max(3, x.v / mx * 100) + '%' : '3%'); b.children[0].title = x ? x.v + ' vendite' : '';
      b.children[1].style.setProperty('--h', x ? Math.max(3, x.n / mx * 100) + '%' : '3%'); b.children[1].title = x ? x.n + ' noleggi' : '';
      b.children[2].textContent = x ? MES[x.m - 1] : ''; b.classList.toggle('cur', !!x && i === M.length - 1); });
  }
  async function ckCarica() {
    if (Date.now() - ckQuando < 5 * 60 * 1000 && ckDati) return;
    ckQuando = Date.now();
    const M = window.MacroHome, C = window.CommercialeBI;
    try { ckDati = (M && M.canCommerciale && M.canCommerciale() && C && C.riepilogoMesi) ? await C.riepilogoMesi() : null; } catch (e) { ckDati = null; }
    ckMostra();
  }
  ckMostra();
  const count = () => cm.querySelectorAll('[data-n]').forEach(el => { const n = +el.dataset.n; let v = 0; const st = Math.max(1, Math.round(n / 40));
    const iv = setInterval(() => { v = Math.min(n, v + st); el.textContent = v; if (v >= n) clearInterval(iv); }, 30); });
  const cmRun = () => { cm.classList.remove('bh-run'); void cm.offsetWidth; cm.classList.add('bh-run'); count(); };
  setInterval(() => { if (active && cur === 2 && !reduce) cmRun(); }, 9000);
  // SERVICE: ogni 10,5 secondi la sequenza riparte (sale, scansione, diagnosi, scende)
  const sv = document.querySelector('#biPage .sv'), svPct = sv && sv.querySelector('.sv-pct');
  let svT0 = 0;
  const svRun = () => { if (!sv || reduce) return; sv.classList.remove('sv-run'); void sv.offsetWidth; sv.classList.add('sv-run'); svT0 = performance.now(); };
  setInterval(() => { if (active && cur === 3) svRun(); }, 10500);
  setInterval(() => { if (!active || cur !== 3 || !svPct) return; const s = (performance.now() - svT0) / 1000; svPct.textContent = Math.max(0, Math.min(100, Math.round((s - 1.2) / 3.8 * 100))); }, 80);
  const go0 = go; go = function (i, f) { go0(i, f); posTog(); if (i === 2) cmRun(); else if (i === 1) stockSpin(); else if (i === 3) svRun(); };
  // Avvio/arresto: tutto gira solo mentre la pagina BI e' visibile
  function start() {
    permessi(); chiudi(); setTimeout(posTog, 0);
    ckCarica();
    scale(); active = true; paused = false; settle();
    if (cur < 0) go(0, true); else if (cur === 2) cmRun(); else if (cur === 1) stockSpin(); else if (cur === 3) svRun();
    restart();
    if (!reduce) requestAnimationFrame(frame);
  }
  function stop() { active = false; clearInterval(timer); }
  return { start, stop, chiudi };
  }


    function build() {
        if (root) return;
        root = document.createElement('div');
        root.id = 'biPage';
        root.style.display = 'none';
        root.innerHTML = template();
        const nav = document.querySelector('#mainApp .navbar');
        if (nav && nav.parentNode) nav.parentNode.insertBefore(root, nav.nextSibling);
        else document.getElementById('mainApp').appendChild(root);
        // azioni
        root.addEventListener('keydown', e => { const x = e.target.closest && e.target.closest('[data-xo]'); if (e.key === 'Enter' && x) x.click(); });
        root.addEventListener('click', e => {
            if (e.target.closest('#bh-enter')) {
                if (!e.target.closest('#bh-enter').classList.contains('bh-off')) {
                    const act = root.querySelector('.bh-ch.bh-on');
                    if (act && act.dataset.c === '1') MacroHome.openStock();
                    else if (act && act.dataset.c === '2') MacroHome.openCommerciale();
                    else if (act && act.dataset.c === '0') openTab('tempi');
                }
                return;
            }
            if (e.target.closest('.bh-back')) { if (window.MacroHome) MacroHome.show(); return; }
            // voci della sezione aperta (e chip, es. le sedi)
            const xc = e.target.closest('[data-xc]');
            if (xc) { const [c, k, j] = xc.dataset.xc.split('|').map(Number); const o = OPZ[c][k]; if (o && o.chips && o.chips[j]) o.chips[j][1](); return; }
            const xo = e.target.closest('[data-xo]');
            if (xo) { const [c, k] = xo.dataset.xo.split('|').map(Number); const o = OPZ[c][k]; if (o && o.go) o.go(); return; }
            // le tre voci sotto i capitoli: aprono proprio quella parte
            const li = e.target.closest('[data-sub]');
            if (li && window.MacroHome) {
                const [c, k] = li.dataset.sub.split('|').map(Number);
                const permesso = c === 0 ? (!MacroHome.canConsegne || MacroHome.canConsegne()) : c === 1 ? MacroHome.canStock && MacroHome.canStock() : c === 2 ? MacroHome.canCommerciale && MacroHome.canCommerciale() : false;
                const o = SUB[c] && OPZ[c][SUB[c][k]];
                if (permesso && o && o.go) o.go();
            }
        });
        scene = initScene();
    }
    // apre l'area Consegne sulla scheda richiesta
    function openTab(tab) {
        if (!window.MacroHome) return;
        MacroHome.openConsegne();
        if (tab === 'analisi') setTimeout(() => { const b = document.querySelector('.cg-tab[data-tab="analisi"]'); if (b) b.click(); }, 60);
    }
    function initials() {
        const n = (typeof currentUser !== 'undefined' && currentUser && currentUser.fullName) || '';
        return n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'BI';
    }
    function show() {
        build();
        root.style.display = 'block';
        const av = document.getElementById('bh-av'); if (av) av.textContent = initials();
        if (scene) scene.start();
    }
    function hide() {
        if (root) root.style.display = 'none';
        if (scene) scene.stop();
    }
    window.BIHome = { show, hide };
})();
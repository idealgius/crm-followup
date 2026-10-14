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

    function template() {
        return `
<div class="bh-page">
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
      <!-- COMMERCIALE (grafica provvisoria, da definire) -->
      <div class="bh-scene" data-s="2">
        <div class="bh-cap"><i></i>Lead, vendite e noleggio</div>
        <div class="bh-ck" id="bh-ck">
          <!-- parabrezza notturno -->
          <div class="bh-ck-sky"><svg viewBox="0 0 750 140" preserveAspectRatio="none"><path d="M0,110 L60,92 L120,100 L190,78 L260,96 L330,84 L410,102 L480,86 L560,98 L640,80 L750,96 L750,140 L0,140 Z" fill="#1b1e2a"/></svg></div>
          <!-- plancia con display curvo -->
          <div class="bh-ck-dash">
            <div class="bh-ck-disp">
              <div class="bh-ck-p">
                <small>LEAD · OGGI</small><b data-n="38">0</b><em class="bh-up">▲ 12% vs ieri</em>
                <svg class="bh-ck-spark" viewBox="0 0 160 40"><path d="M0,32 L20,28 L40,30 L60,20 L80,24 L100,14 L120,18 L140,8 L160,10" /></svg>
              </div>
              <div class="bh-ck-g">
                <svg viewBox="0 0 220 130"><defs><linearGradient id="bh-ckg" x1="0" x2="1"><stop offset="0" stop-color="#ff7a1a"/><stop offset="1" stop-color="#ffd27a"/></linearGradient></defs>
                  <path d="M20,118 A90,90 0 0 1 200,118" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="12" stroke-linecap="round"/>
                  <path class="bh-ck-arc" d="M20,118 A90,90 0 0 1 200,118" fill="none" stroke="url(#bh-ckg)" stroke-width="12" stroke-linecap="round"/>
                  <g class="bh-ck-ticks"></g>
                  <line class="bh-ck-needle" x1="110" y1="118" x2="110" y2="40" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
                  <circle cx="110" cy="118" r="7" fill="#ff7a1a"/></svg>
                <div class="bh-ck-gv"><b data-n="78">0</b><span>%</span></div><small>OBIETTIVO DEL MESE</small>
              </div>
              <div class="bh-ck-r">
                <div class="bh-ck-p2"><small>VENDITE · MESE</small><b data-n="142">0</b>
                  <div class="bh-ck-bars"><i style="--h:40%"></i><i style="--h:62%"></i><i style="--h:55%"></i><i style="--h:80%"></i><i style="--h:100%"></i></div></div>
                <div class="bh-ck-p2"><small>NOLEGGIO · MESE</small><b data-n="27">0</b>
                  <div class="bh-ck-bars bh-rent"><i style="--h:30%"></i><i style="--h:45%"></i><i style="--h:70%"></i><i style="--h:60%"></i><i style="--h:90%"></i></div></div>
              </div>
            </div>
            <div class="bh-ck-strip"></div>
          </div>
          <!-- tunnel centrale con tasti e manopola -->
          <div class="bh-ck-console">
            <div class="bh-ck-keys"></div>
            <div class="bh-ck-knob"><span></span></div>
          </div>
          <!-- volante -->
          <svg class="bh-ck-wheel" viewBox="0 0 300 300"><circle cx="150" cy="150" r="128" fill="none" stroke="#0c0d10" stroke-width="26"/><circle cx="150" cy="150" r="128" fill="none" stroke="rgba(255,122,26,.35)" stroke-width="1.5"/>
            <path d="M40,170 C80,150 220,150 260,170 L250,200 C210,182 90,182 50,200 Z" fill="#0f1014"/><circle cx="150" cy="168" r="34" fill="#111216" stroke="rgba(255,255,255,.08)"/></svg>
          <!-- luci ambiente sui sedili -->
          <span class="bh-ck-seat bh-l"></span><span class="bh-ck-seat bh-r"></span>
        </div>
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
  function scale() { sw.style.setProperty('--k', ($('bh-frame').clientWidth / 1100).toFixed(4)); }
  addEventListener('resize', () => { if (active) scale(); });

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
    if (xp >= 0 && xp !== i) chiudi();
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

  /* ---------- SEZIONE APERTA: solo quel capitolo, con tutte le sue voci ---------- */
  let xp = -1;
  const rail = document.querySelector('#biPage .bh-rail'), stage = $('bh-stage');
  // Sotto le tre voci del capitolo c'e' sempre "Mostra opzioni". Solo cliccandolo restano
  // il capitolo e la sua animazione (gli altri capitoli si nascondono, lo scorrimento
  // automatico si ferma) e nella colonna compare l'elenco con TUTTE le voci della sezione
  // (scorre se non ci sta). "Nascondi opzioni" / "← Tutte le sezioni" / Esc tornano come prima.
  const tg = document.createElement('button');
  tg.type = 'button'; tg.className = 'bh-x-tog'; tg.innerHTML = 'Mostra opzioni <span>▾</span>';
  // in basso, accanto a "Entra" (nella colonna non c'e' spazio sotto i quattro capitoli)
  $('bh-enter').insertAdjacentElement('afterend', tg);
  const posTog = () => { const e = $('bh-enter'); tg.style.left = (e.offsetLeft + e.offsetWidth + 10) + 'px'; tg.style.display = cur === 3 ? 'none' : ''; };   // Service: in arrivo, niente opzioni
  function espandi(i) {
    xp = i; clearInterval(timer);
    rail.classList.add('bh-x-on', 'bh-x-open');
    document.querySelectorAll('#biPage .bh-ch').forEach(b => b.classList.toggle('bh-x-hid', +b.dataset.c !== i));
    let back = rail.querySelector('.bh-x-back');
    if (!back) { back = document.createElement('button'); back.type = 'button'; back.className = 'bh-x-back'; back.textContent = '← Tutte le sezioni'; rail.insertBefore(back, rail.firstChild); }
    const c = CH[i], vietato = c.off && i !== 3;
    let l = rail.querySelector('.bh-x-list');
    if (!l) { l = document.createElement('div'); l.className = 'bh-x-list'; rail.appendChild(l); }
    l.innerHTML = (vietato ? '<p class="bh-x-msg">Non hai il permesso per questa sezione: chiedilo a un amministratore (pagina Permessi).</p>' : i === 3 ? '<p class="bh-x-msg">In arrivo: saranno disponibili presto.</p>' : '') +
      OPZ[i].map((o, k) => { const ok = !vietato && (o.go || o.chips); return `<div class="bh-xo ${ok ? '' : 'off'}" ${ok && o.go ? `data-xo="${i}|${k}" role="button" tabindex="0"` : ''}>
        <span class="bh-xo-i">${o.i}</span><span class="bh-xo-t"><b>${o.t}</b><em>${o.d}</em>${o.chips && ok ? `<span class="bh-xo-c">${o.chips.map((ch, j) => `<button type="button" data-xc="${i}|${k}|${j}">${ch[0]}</button>`).join('')}</span>` : ''}</span></div>`; }).join('');
    // l'elenco arriva fino a sopra il pulsante "Entra" e poi scorre (misure del palco, non scalate)
    l.style.maxHeight = Math.max(120, $('bh-enter').offsetTop - (rail.offsetTop + l.offsetTop) - 14) + 'px';
    l.scrollTop = 0;
    tg.innerHTML = 'Nascondi <span>▴</span>'; tg.setAttribute('aria-expanded', 'true');
  }
  function chiudi() {
    if (xp < 0) return;
    xp = -1;
    rail.classList.remove('bh-x-on', 'bh-x-open');
    document.querySelectorAll('#biPage .bh-ch').forEach(b => b.classList.remove('bh-x-hid'));
    rail.querySelectorAll('.bh-x-list, .bh-x-back').forEach(x => x.remove());
    tg.innerHTML = 'Mostra opzioni <span>▾</span>'; tg.setAttribute('aria-expanded', 'false');
    restart();
  }
  rail.addEventListener('click', e => { if (e.target.closest('.bh-x-back')) chiudi(); });
  tg.addEventListener('click', () => { if (xp >= 0) chiudi(); else espandi(cur); });
  // la rotellina scorre l'elenco senza muovere la pagina
  rail.addEventListener('wheel', e => { const l = e.target.closest('.bh-x-list'); if (l && l.scrollHeight > l.clientHeight) e.stopPropagation(); }, { passive: true });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && active && xp >= 0) chiudi(); });
  document.querySelectorAll('#biPage .bh-ch').forEach(b => b.addEventListener('click', () => { go(+b.dataset.c); restart(); }));
  $('bh-frame').addEventListener('pointerenter', () => { paused = true; sw.classList.add('bh-paused'); clearInterval(timer); });
  $('bh-frame').addEventListener('pointerleave', () => { paused = false; sw.classList.remove('bh-paused'); restart(); });

  /* ---------- STOCK: pedana girevole con i loghi ---------- */
  // loghi dei marchi (cartella /img/marchi), nell'ordine dei piu' venduti
  const LOGHI = ["/img/marchi/peugeot.png", "/img/marchi/citroen.png", "/img/marchi/fiat.png", "/img/marchi/dr.png", "/img/marchi/bmw.png", "/img/marchi/volkswagen.png", "/img/marchi/audi.png", "/img/marchi/mg.png", "/img/marchi/sportequipe.png", "/img/marchi/ich-x.png", "/img/marchi/dacia.png", "/img/marchi/toyota.png", "/img/marchi/ford.png", "/img/marchi/kia.png", "/img/marchi/alfa-romeo.png", "/img/marchi/byd.png", "/img/marchi/opel.png", "/img/marchi/nissan.png"];
  const ring = $('bh-ring'), N = LOGHI.length, R = 270;
  LOGHI.forEach((src, i) => {
    const d = document.createElement('div'); d.className = 'bh-plq';
    d.style.transform = `rotateY(${i * 360 / N}deg) translateZ(${R}px)`;
    d.innerHTML = `<img src="${src}" alt="">`; ring.appendChild(d);
  });
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
  // tasti della console che si accendono a turno
  const keys = cm.querySelector('.bh-ck-keys'); for (let i = 0; i < 12; i++) keys.appendChild(document.createElement('i'));
  setInterval(() => { if (!active || cur !== 2) return; const k = keys.children; [...k].forEach(x => x.classList.remove('bh-lit')); for (let j = 0; j < 3; j++) k[Math.floor(Math.random() * k.length)].classList.add('bh-lit'); }, 900);
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
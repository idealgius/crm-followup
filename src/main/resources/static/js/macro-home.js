/* =====================================================================
   HOME "MACRO CATEGORIE" + AREA CONSEGNE — Gruppo Autoscala CRM
   ---------------------------------------------------------------------
   Dopo il login (e aprendo il CRM senza una sezione nell'URL) compare la
   schermata con due card:
     - IN BOUND  -> tutto il CRM attuale (entra nella pagina di default
                    del ruolo, esattamente come prima)
     - CONSEGNE  -> nuova area separata (#consegnePage in index.html),
                    (contenuto costruito da /js/consegne.js)
   La home NON e' un overlay: e' un blocco normale sotto la navbar che
   prende il posto delle pagine, cosi' navbar, ESCI, tema e menu a
   tendina restano sempre utilizzabili e non ci sono problemi di z-index.
   Classi CSS con prefisso mh- (vedi /css/macro-home.css).

   GRAFICA "SHOWROOM": due postazioni sempre affiancate (il contenuto e'
   disegnato a 560x470 e scalato alla larghezza disponibile), auto su
   pavimento lucido con riflesso, smartphone animato (richieste e chiamate,
   senza nomi di persone) e passaggio chiavi con mani 3D. Le animazioni
   girano SOLO mentre la home e' visibile (initScene -> start/stop).
   Immagini in /img/macro/: sportequipe-retro.png, ich-x-k3.png,
   mano-cliente-3d.png, mano-consulente-3d.png.
   ===================================================================== */
(function () {
    const IMG = '/img/macro/';
    const PAGE_IDS = ['dashboardPage', 'followupsPage', 'waitingPage', 'contactsPage', 'promoPage',
        'adminPage', 'rentPage', 'servicePage', 'veicoliPage', 'preventiviPage', 'allChartsPage'];
    let root = null;
    let scene = null;
    let inConsegne = false;

    // La selezione area (e l'area Consegne) la vede SOLO chi ha il permesso
    // CONSEGNE (pagina Permessi per Ruolo / per Operatore; default:
    // Moderatore, Gestore, Admin). Tutti gli altri entrano direttamente in
    // In bound. Il parametro role resta per compatibilita' con le chiamate
    // esistenti: vale il permesso effettivo dell'utente loggato.
    function canShow() {
        if (typeof currentUser === 'undefined' || !currentUser) return false;
        return typeof hasAccess === 'function' && hasAccess('CONSEGNE');
    }

    // Voce "Seleziona Area" nel menu del nome e clic sul logo: solo per chi puo'
    function refreshNav() {
        const ok = canShow();
        const item = document.getElementById('navSelectArea');
        if (item) item.style.display = ok ? 'flex' : 'none';
        const logo = document.getElementById('navLogo');
        if (logo) { logo.style.cursor = ok ? 'pointer' : ''; logo.title = ok ? 'Torna alla selezione area' : ''; }
    }

    function hideAllPages() {
        PAGE_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const consegne = document.getElementById('consegnePage');
        if (consegne) consegne.style.display = 'none';
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    }

    // Le voci della navbar (Dashboard, Follow-up, ...) appartengono a
    // In bound: in Home e in Consegne vengono nascoste.
    function setNavLinksVisible(visible) {
        const links = document.querySelector('.nav-links');
        if (links) links.style.visibility = visible ? '' : 'hidden';
    }

    function setBadge(text) {
        const badge = document.getElementById('navBrandBadge');
        if (badge) badge.textContent = text;
    }

    // Uscendo da In bound si fermano polling e WebSocket, come fa showPage()
    function stopInboundLiveUpdates() {
        if (typeof stopContactPolling === 'function') stopContactPolling();
        if (typeof disconnectContactWebSocket === 'function') disconnectContactWebSocket();
        if (typeof disconnectRentWebSocket === 'function') disconnectRentWebSocket();
        if (typeof disconnectServiceWebSocket === 'function') disconnectServiceWebSocket();
    }

    function build() {
        if (root) return;
        root = document.createElement('div');
        root.id = 'mhHome';
        root.className = 'mh-home';
        root.style.display = 'none';
        root.innerHTML = template();
        root.addEventListener('click', function (e) {
            const card = e.target.closest('[data-mh]');
            if (!card) return;
            if (card.getAttribute('data-mh') === 'inbound') openInbound();
            else openConsegne();
        });
        const nav = document.querySelector('#mainApp .navbar');
        if (nav && nav.parentNode) nav.parentNode.insertBefore(root, nav.nextSibling);
        else document.getElementById('mainApp').appendChild(root);
        scene = initScene();
    }

    function show() {
        if (!canShow()) return;
        build();
        stopInboundLiveUpdates();
        hideAllPages();
        inConsegne = false;
        setNavLinksVisible(false);
        document.body.removeAttribute('data-role-theme');
        setBadge('HOME');
        root.style.display = 'block';
        if (scene) scene.start();
        history.replaceState(null, '', window.location.pathname + '#home');
        sessionStorage.setItem('currentPage', 'home');
        window.scrollTo(0, 0);
    }

    function hide() {
        if (root) root.style.display = 'none';
        if (scene) scene.stop();
    }

    // Chiamata all'inizio di showPage(): qualunque pagina di In bound si
    // apra, la home e l'area Consegne si chiudono e la navbar torna normale.
    function onShowPage() {
        hide();
        const consegne = document.getElementById('consegnePage');
        if (consegne) consegne.style.display = 'none';
        inConsegne = false;
        setNavLinksVisible(true);
    }

    function openInbound() {
        const role = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.role : 'UTENTE';
        showPage(getDefaultPageForRole(role));
    }

    function openConsegne() {
        if (!canShow()) return;
        hide();
        stopInboundLiveUpdates();
        hideAllPages();
        inConsegne = true;
        setNavLinksVisible(false);
        document.body.removeAttribute('data-role-theme');
        setBadge('CONSEGNE');
        const page = document.getElementById('consegnePage');
        if (page) page.style.display = 'block';
        if (window.Consegne) Consegne.init();
        history.replaceState(null, '', window.location.pathname + '#consegne');
        sessionStorage.setItem('currentPage', 'consegne');
        window.scrollTo(0, 0);
    }

    // Al logout: chiude tutto e ripristina la navbar per il prossimo login
    function reset() {
        hide();
        const consegne = document.getElementById('consegnePage');
        if (consegne) consegne.style.display = 'none';
        inConsegne = false;
        setNavLinksVisible(true);
    }

    function template() {
        return `
<div class="mh-home-wrap">
  <header class="mh-head">
    <h1 id="mh-greet">Buongiorno</h1>
    <p>Scegli l'area in cui vuoi lavorare.</p>
  </header>

  <div class="mh-bays">
    <!-- IN BOUND -->
    <button class="mh-bay mh-in" type="button" data-mh="inbound" aria-label="Entra in In bound"><div class="mh-bay-in">
      <div class="mh-stage">
        <div class="mh-spot"></div><div class="mh-floor"></div>
        <div class="mh-streaks"><span style="top:10px;width:70%"></span><span style="top:34px;width:50%;left:12%"></span><span style="top:58px;width:62%;left:4%"></span></div>
        <div class="mh-car mh-enter" id="mh-sp"><div class="mh-body" id="mh-spBody"><img src="/img/macro/sportequipe-retro.png" alt=""><div class="mh-sheen" style="-webkit-mask-image:url('/img/macro/sportequipe-retro.png');mask-image:url('/img/macro/sportequipe-retro.png')"></div>
          <span class="mh-glow mh-g1"></span><span class="mh-glow mh-g2"></span>
</div><img class="mh-refl" src="/img/macro/sportequipe-retro.png" alt=""><div class="mh-shadow"></div></div>
        <div class="mh-phone" id="mh-phone">
          <div class="mh-screen">
            <div class="mh-island"></div>
            <div class="mh-sb"><span id="mh-clock">9:41</span><span>●●● ▮</span></div>
            <div class="mh-app-h"><b>Oggi</b><span class="mh-pill"><b id="mh-cnt">12</b></span></div>
            <div class="mh-bars" id="mh-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
            <div class="mh-call" id="mh-call">
              <div class="mh-pulse"><svg viewBox="0 0 24 24" fill="none"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" fill="#a9c1ff"/></svg></div>
              <b>Chiamata in arrivo</b><span id="mh-callSub">Linea vendite · Agnano</span><span class="mh-timer" id="mh-callTimer">00:00</span>
              <div class="mh-btns"><i class="mh-no"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg></i><i class="mh-ok"><svg viewBox="0 0 24 24" fill="none"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" fill="#fff"/></svg></i></div>
            </div>
            <div class="mh-notif" id="mh-notif"><div class="mh-t"><span>CRM Autoscala</span><span>ora</span></div><b id="mh-nTitle"></b><div id="mh-nText"></div></div>
            <div class="mh-list" id="mh-list"></div>
          </div>
        </div>
      </div>
      <div class="mh-info">
        <div>
          <div class="mh-kicker"><i></i>Richieste in arrivo</div>
          <h2>In bound</h2>
          <p>Registro contatti, follow-up, recall, preventivi e tutte le sezioni di oggi.</p>
        </div>
        <span class="mh-go"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </div>
    </div></button>

    <!-- CONSEGNE -->
    <button class="mh-bay mh-out" type="button" data-mh="consegne" aria-label="Entra in Consegne"><div class="mh-bay-in">
      <div class="mh-stage">
        <div class="mh-spot"></div><div class="mh-floor"></div>
        <div class="mh-car mh-enter" id="mh-k3"><div class="mh-body" id="mh-k3Body"><img src="/img/macro/ich-x-k3.png" alt=""><div class="mh-sheen" style="-webkit-mask-image:url('/img/macro/ich-x-k3.png');mask-image:url('/img/macro/ich-x-k3.png');animation-delay:4.5s"></div>
          <span class="mh-glow mh-blink mh-b1"></span><span class="mh-glow mh-blink mh-b2"></span></div><img class="mh-refl" src="/img/macro/ich-x-k3.png" alt=""><div class="mh-shadow"></div></div>
        <div class="mh-floorflash" id="mh-floorflash"></div>
        <div class="mh-handover" id="mh-handover">
          <img class="mh-hand mh-hand-cliente" id="mh-palm" src="/img/macro/mano-cliente-3d.png" alt="">
          <div class="mh-fob-shadow" id="mh-fobShadow"></div>
          <div class="mh-fob" id="mh-fob"><svg viewBox="0 0 120 110" xmlns="http://www.w3.org/2000/svg" class="fob-svg">
  <defs>
    <linearGradient id="mhfobside" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b3f47"/><stop offset="1" stop-color="#15171b"/></linearGradient>
    <radialGradient id="mhfobtop" cx="30%" cy="20%" r="90%"><stop offset="0" stop-color="#8a909b"/><stop offset=".45" stop-color="#5a5f69"/><stop offset="1" stop-color="#34373e"/></radialGradient>
    <linearGradient id="mhfobpan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1e25"/><stop offset=".5" stop-color="#08090c"/><stop offset="1" stop-color="#030405"/></linearGradient>
    <linearGradient id="mhfobgl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".45" stop-color="#fff" stop-opacity=".06"/><stop offset=".46" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="mhfobrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d737e"/><stop offset="1" stop-color="#1a1c21"/></linearGradient>
    <filter id="mhfobgrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="4" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .07 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <filter id="mhfobglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <radialGradient id="mhfobp" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#e2f9ff" stop-opacity=".95"/><stop offset="1" stop-color="#5fd0ff" stop-opacity="0"/></radialGradient>
    <clipPath id="mhfobpc"><path d="M34,16 L86,16 Q88,16 89.5,17.5 L102,30 Q104,32 104,34 L104,64 Q104,66 102,68 L89.5,80.5 Q88,82 86,82 L34,82 Q32,82 30.5,80.5 L18,68 Q16,66 16,64 L16,34 Q16,32 18,30 L30.5,17.5 Q32,16 34,16 Z"/></clipPath>
  </defs>
  <!-- spessore (fianco) -->
  <path d="M30,6 Q27,6 25,8 L8,25 Q6,27 6,30 L6,68 Q6,71 8,73 L25,90 Q27,92 30,92 L90,92 Q93,92 95,90 L112,73 Q114,71 114,68 L114,30 Q114,27 112,25 L95,8 Q93,6 90,6 Z" transform="translate(0,9)" fill="url(#mhfobside)"/>
  <path d="M30,6 Q27,6 25,8 L8,25 Q6,27 6,30 L6,68 Q6,71 8,73 L25,90 Q27,92 30,92 L90,92 Q93,92 95,90 L112,73 Q114,71 114,68 L114,30 Q114,27 112,25 L95,8 Q93,6 90,6 Z" transform="translate(0,4.5)" fill="#2a2d33"/>
  <!-- asola portachiavi sul fianco -->
  <rect x="44" y="96" width="32" height="7" rx="2.5" fill="#0d0e11"/>
  <!-- faccia superiore opaca -->
  <path d="M30,6 Q27,6 25,8 L8,25 Q6,27 6,30 L6,68 Q6,71 8,73 L25,90 Q27,92 30,92 L90,92 Q93,92 95,90 L112,73 Q114,71 114,68 L114,30 Q114,27 112,25 L95,8 Q93,6 90,6 Z" fill="url(#mhfobtop)"/>
  <path d="M30,6 Q27,6 25,8 L8,25 Q6,27 6,30 L6,68 Q6,71 8,73 L25,90 Q27,92 30,92 L90,92 Q93,92 95,90 L112,73 Q114,71 114,68 L114,30 Q114,27 112,25 L95,8 Q93,6 90,6 Z" fill="#000" filter="url(#mhfobgrain)"/>
  <path d="M30,6 Q27,6 25,8 L8,25 Q6,27 6,30 L6,68 Q6,71 8,73 L25,90 Q27,92 30,92 L90,92 Q93,92 95,90 L112,73 Q114,71 114,68 L114,30 Q114,27 112,25 L95,8 Q93,6 90,6 Z" fill="none" stroke="#a9afb9" stroke-opacity=".55" stroke-width="1"/>
  <!-- inserto nero lucido con bordo smussato -->
  <path d="M34,16 L86,16 Q88,16 89.5,17.5 L102,30 Q104,32 104,34 L104,64 Q104,66 102,68 L89.5,80.5 Q88,82 86,82 L34,82 Q32,82 30.5,80.5 L18,68 Q16,66 16,64 L16,34 Q16,32 18,30 L30.5,17.5 Q32,16 34,16 Z" transform="translate(0,1.2)" fill="#000" opacity=".6"/>
  <path d="M34,16 L86,16 Q88,16 89.5,17.5 L102,30 Q104,32 104,34 L104,64 Q104,66 102,68 L89.5,80.5 Q88,82 86,82 L34,82 Q32,82 30.5,80.5 L18,68 Q16,66 16,64 L16,34 Q16,32 18,30 L30.5,17.5 Q32,16 34,16 Z" fill="url(#mhfobpan)" stroke="url(#mhfobrim)" stroke-width="1.4"/>
  <g clip-path="url(#mhfobpc)">
    <!-- fughe tra i 4 tasti -->
    <path d="M60,16 V82 M16,49 H104" stroke="#000" stroke-width="2.2"/>
    <path d="M61.2,16 V82 M16,50.2 H104" stroke="#2b2f37" stroke-width=".7"/>
    <!-- riflesso -->
    <path d="M10,10 H112 L112,30 L10,62 Z" fill="url(#mhfobgl)"/>
  </g>
  <g fill="none" stroke="#f1f5fa" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" filter="url(#mhfobglow)">
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
  <circle class="k-press" cx="81" cy="66" r="14" fill="url(#mhfobp)" opacity="0"/>
</svg></div>
          <img class="mh-hand mh-hand-consulente" id="mh-giver" src="/img/macro/mano-consulente-3d.png" alt="">
        </div>
        <div class="mh-badge" id="mh-badge"><i><svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></i>Consegnata</div>
      </div>
      <div class="mh-info">
        <div>
          <div class="mh-kicker"><i></i>Vetture in consegna</div>
          <h2>Consegne</h2>
          <p>Tempi di consegna, vetture ancora da consegnare e motivo dell'attesa.</p>
        </div>
        <span class="mh-go"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </div>
    </div></button>
  </div>
</div>
`;
    }

    /* ================= SCENA ANIMATA ================= */

    function initScene() {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      function setGreeting() {
        const h = new Date().getHours();
        const nome = (typeof currentUser !== 'undefined' && currentUser && (currentUser.fullName || '').trim().split(/\s+/)[0]) || '';
        document.getElementById('mh-greet').textContent = (h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera') + (nome ? ', ' + nome : '');
      }

      /* parallasse leggera al passaggio del mouse */
      document.querySelectorAll('.mh-bay').forEach(b => {
        b.addEventListener('pointermove', e => {
          const r = b.getBoundingClientRect();
          b.style.setProperty('--mx', ((e.clientX - r.left) / r.width - .5).toFixed(3));
          b.style.setProperty('--my', ((e.clientY - r.top) / r.height - .5).toFixed(3));
        });
        b.addEventListener('pointerleave', () => { b.style.setProperty('--mx', 0); b.style.setProperty('--my', 0); });
      });
      // le due postazioni restano sempre affiancate: il contenuto (disegnato a 560x470) si scala
      const bayEls = [...document.querySelectorAll('.mh-bay')];
      function scaleBays() { bayEls.forEach(b => b.style.setProperty('--k', (b.clientWidth / 560).toFixed(4))); }
      scaleBays(); window.addEventListener('resize', scaleBays);
      if (window.ResizeObserver) new ResizeObserver(scaleBays).observe(document.querySelector('.mh-bays'));
      // ingresso delle auto a ogni apertura della home, poi seguono la parallasse
      function replayEnter() {
        document.querySelectorAll('.mh-car').forEach(c => { c.classList.remove('mh-enter'); void c.offsetWidth; c.classList.add('mh-enter'); });
        setTimeout(() => document.querySelectorAll('.mh-car.mh-enter').forEach(c => c.classList.remove('mh-enter')), 1900);
      }

      /* ===== smartphone: richieste e chiamate (senza nomi di persone) ===== */
      const ICON = {
        car: '<svg viewBox="0 0 24 24" fill="none" stroke="#0f1420" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16v-3l2-5h12l2 5v3M4 16h16M7 16v2M17 16v2"/></svg>',
        key: '<svg viewBox="0 0 24 24" fill="none" stroke="#0f1420" stroke-width="2.4" stroke-linecap="round"><circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3"/></svg>',
        wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="#0f1420" stroke-width="2.4" stroke-linecap="round"><path d="M15 5a4 4 0 0 0-5 5L4 16l4 4 6-6a4 4 0 0 0 5-5l-3 3-3-3z"/></svg>',
        doc: '<svg viewBox="0 0 24 24" fill="none" stroke="#0f1420" stroke-width="2.4" stroke-linecap="round"><path d="M7 3h7l4 4v14H7zM10 12h5M10 16h5"/></svg>',
        cal: '<svg viewBox="0 0 24 24" fill="none" stroke="#0f1420" stroke-width="2.4" stroke-linecap="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
        phone: '<svg viewBox="0 0 24 24" fill="#0f1420"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>'
      };
      const POOL = [
        { cat: 'Info Vendita', sub: 'Sportequipe 6 GT · Agnano', ic: 'car', col: '#8fb0ff' },
        { cat: 'Info Noleggio', sub: 'ICH-X K3 · 36 mesi', ic: 'key', col: '#ffc27a' },
        { cat: 'Service', sub: 'Tagliando · Salerno', ic: 'wrench', col: '#7fe0b8' },
        { cat: 'Preventivo', sub: 'Peugeot 208 Hybrid', ic: 'doc', col: '#d6a8ff' },
        { cat: 'Appuntamento', sub: 'Sabato 10:30 · Agnano', ic: 'cal', col: '#ff9fb2' }
      ];
      const CALL = { cat: 'Chiamata registrata', sub: 'Info Vendita · 2 min', ic: 'phone', col: '#9fe3ff' };
      const list = document.getElementById('mh-list'), cnt = document.getElementById('mh-cnt');
      const notif = document.getElementById('mh-notif'), phone = document.getElementById('mh-phone');
      const call = document.getElementById('mh-call'), callTimer = document.getElementById('mh-callTimer');
      const bars = [...document.querySelectorAll('#mh-bars i')];
      const spGlows = document.querySelectorAll('.mh-in .mh-glow');
      const OK = '<svg width="7" height="7" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" stroke-width="4" fill="none"/></svg>';
      function rowHTML(p, done, tm) {
        return `<div class="mh-av" style="background:${p.col}">${ICON[p.ic]}</div>
          <div class="mh-tx"><b>${p.cat}</b><span>${p.sub}</span></div>
          <span class="mh-tm">${tm}</span><div class="mh-ck ${done ? 'mh-on' : ''}">${done ? OK : ''}</div>`;
      }
      [[POOL[1], '4 min'], [POOL[2], '12 min'], [POOL[3], '25 min'], [POOL[4], '40 min']]
        .forEach(([p, tm], k) => { const r = document.createElement('div'); r.className = 'mh-row'; r.innerHTML = rowHTML(p, k > 0, tm); list.appendChild(r); });
      let hist = [3, 5, 4, 7, 6, 8, 5, 4];
      function drawBars() { const m = Math.max(...hist, 8); bars.forEach((b, i) => b.style.height = (18 + hist[i] / m * 82) + '%'); }
      drawBars();
      let n = 12, idx = 0, cycle = 0;
      function addRow(p) {
        const r = document.createElement('div'); r.className = 'mh-row mh-new'; r.innerHTML = rowHTML(p, false, 'ora');
        r.style.transform = 'translateY(-10px)'; r.style.opacity = '0';
        list.prepend(r); requestAnimationFrame(() => { r.style.transform = ''; r.style.opacity = ''; });
        while (list.children.length > 4) list.lastElementChild.remove();
        cnt.textContent = ++n; cnt.classList.remove('mh-bump'); void cnt.offsetWidth; cnt.classList.add('mh-bump');
        hist[hist.length - 1]++; drawBars();
        // i fari della Sportequipe "rispondono" a ogni nuova richiesta
        spGlows.forEach(g => { g.style.animation = 'none'; g.style.opacity = 1; setTimeout(() => { g.style.opacity = ''; g.style.animation = ''; }, 380); });
        setTimeout(() => {
          const prev = list.children[1]; if (prev) { prev.classList.remove('mh-new'); const ck = prev.querySelector('.mh-ck'); ck.classList.add('mh-on'); ck.innerHTML = OK; }
        }, 900);
        setTimeout(() => { const f = list.children[0]; if (f) f.classList.remove('mh-new'); }, 1400);
        if (Math.random() < .35) { hist.shift(); hist.push(1); setTimeout(drawBars, 300); }
      }
      function ringPhone() { phone.classList.remove('mh-ring'); void phone.offsetWidth; phone.classList.add('mh-ring'); }
      function arrive() {
        cycle++;
        if (cycle % 3 === 0) {
          // chiamata in arrivo -> risposta -> registrata
          call.classList.remove('mh-live'); call.classList.add('mh-show'); ringPhone();
          const r2 = setTimeout(ringPhone, 1000);
          setTimeout(() => {
            call.classList.add('mh-live'); let sec = 0; callTimer.textContent = '00:00';
            const iv = setInterval(() => { sec++; callTimer.textContent = '00:0' + Math.min(sec, 9); }, 300);
            setTimeout(() => { clearInterval(iv); call.classList.remove('mh-show'); addRow(CALL); }, 1300);
          }, 1500);
          return;
        }
        const p = POOL[idx++ % POOL.length];
        document.getElementById('mh-nTitle').textContent = 'Nuova richiesta · ' + p.cat;
        document.getElementById('mh-nText').textContent = p.sub;
        notif.classList.add('mh-show'); ringPhone();
        setTimeout(() => { notif.classList.remove('mh-show'); addRow(p); }, 1300);
      }
      const clock = document.getElementById('mh-clock'); const d = new Date(); clock.textContent = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
      let phoneTimer = null, phoneFirst = null;

      /* ===== consegna delle chiavi (timeline in JS) ===== */
      const scene = document.getElementById('mh-handover'), palm = document.getElementById('mh-palm'), giver = document.getElementById('mh-giver');
      const fob = document.getElementById('mh-fob'), fobShadow = document.getElementById('mh-fobShadow'), badge = document.getElementById('mh-badge');
      const press = fob.querySelector('.k-press'), led = fob.querySelector('.k-led');
      const blinks = document.querySelectorAll('.mh-out .mh-blink'), floorflash = document.getElementById('mh-floorflash');
      const k3 = document.getElementById('mh-k3'), k3Body = document.getElementById('mh-k3Body');
      const waves = [0, 1, 2].map(() => { const w = document.createElement('span'); w.className = 'mh-wave'; scene.appendChild(w); return w; });
      const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
      const ease = t => 1 - Math.pow(1 - t, 3), easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const seg = (t, a, b) => clamp((t - a) / (b - a));
      const lerp = (a, b, t) => a + (b - a) * t;
      const PERIOD = 7.4;
      let active = false;
      // Punti delle immagini 3D (in frazioni della foto): centro del palmo e punta delle dita
      const PALM_PT = { x: .388, y: .487 }, TIP_PT = { x: .184, y: .146 };
      const PALM_POS = { x: 14, y: 150 };
      let lastSettle = -1;

      function frame(now) {
        if (!active) return;
        const t = (now / 1000) % PERIOD;
        const pw = palm.offsetWidth, ph = palm.offsetHeight, gw = giver.offsetWidth, gh = giver.offsetHeight, fw = fob.offsetWidth;
        if (!pw || !gw) { requestAnimationFrame(frame); return; }

        // mano del cliente: sale dal basso, accusa il peso della chiave, poi riscende
        const up = ease(seg(t, .5, 1.4)) - ease(seg(t, 6.7, 7.3));
        const catchDip = Math.sin(Math.PI * seg(t, 2.72, 3.15)) * 7;
        const hold = Math.sin(Math.PI * seg(t, 3.2, 6.5)) * -2;
        const py = PALM_POS.y + lerp(60, 0, up) + catchDip + hold;
        const prot = lerp(8, 0, up) + catchDip * .4;
        palm.style.transform = `translate(${PALM_POS.x}px, ${py}px) rotate(${prot}deg)`;
        palm.style.transformOrigin = '70% 90%';
        palm.style.opacity = clamp(up * 2.5);
        const P = { x: PALM_POS.x + PALM_PT.x * pw, y: py + PALM_PT.y * ph };

        // mano del consulente (stessa mano 3D ruotata di 180°): arriva dall'alto a sinistra,
        // porge la chiave sopra il palmo, la lascia e si ritira
        const tip = { x: (1 - TIP_PT.x) * gw, y: (1 - TIP_PT.y) * gh };     // punta delle dita dopo la rotazione
        const target = { x: P.x + 4, y: P.y - 64 };
        const start = { x: -150, y: -170 };
        const inT = easeIO(seg(t, .25, 1.75)), down = easeIO(seg(t, 1.75, 2.4)), out = easeIO(seg(t, 2.75, 3.7));
        let fx0 = lerp(start.x, target.x, inT), fy0 = lerp(start.y, target.y, inT) + down * 22;
        fx0 = lerp(fx0, start.x, out); fy0 = lerp(fy0, start.y, out);
        const tilt = lerp(-14, 0, inT) + down * 6 - out * 12;
        giver.style.transformOrigin = '0 0';
        giver.style.transform = `translate(${fx0 - tip.x}px, ${fy0 - tip.y}px) translate(${tip.x}px, ${tip.y}px) rotate(${tilt}deg) translate(${-tip.x}px, ${-tip.y}px) translate(${gw / 2}px, ${gh / 2}px) rotate(180deg) translate(${-gw / 2}px, ${-gh / 2}px)`;
        giver.style.opacity = t < 3.7 ? 1 : 0;

        // chiave: stretta tra le dita (dondola appena), poi lasciata cadere nel palmo
        const release = 2.5;
        let cx, cy, rot, sy = 1;
        if (t < release) {
          const swing = Math.exp(-2 * Math.max(0, t - .3)) * Math.sin(8 * t) * 14;
          cx = fx0; cy = fy0 + 12; rot = -22 + swing + tilt * .5;
          fobShadow.style.opacity = 0;
        } else {
          const f = ease(seg(t, release, release + .3));
          const bounce = Math.sin(Math.PI * seg(t, release + .3, release + .52)) * -5;
          cx = lerp(fx0, P.x, f); cy = lerp(fy0 + 12, P.y - 8, f) + bounce; rot = lerp(-22, -16, f) + prot * .6;
          sy = lerp(1, .78, f);
          fobShadow.style.opacity = f * .9;
          fobShadow.style.transform = `translate(${P.x - 26}px, ${P.y + 8}px)`;
        }
        const fade = 1 - seg(t, 6.6, 7.0);
        fob.style.transform = `translate(${cx - fw / 2}px, ${cy - fw / 2}px) rotate(${rot}deg) scaleY(${sy})`;
        fob.style.opacity = (t < .25 ? 0 : 1) * fade;
        fobShadow.style.opacity = parseFloat(fobShadow.style.opacity || 0) * fade;

        // tasto "apri" premuto -> onde verso l'auto -> frecce che lampeggiano, l'auto si "assesta"
        const pr = Math.sin(Math.PI * seg(t, 3.9, 4.35));
        press.style.opacity = pr; led.style.opacity = pr;
        const car = k3.getBoundingClientRect(), s = scene.getBoundingClientRect();
        const k = parseFloat(getComputedStyle(scene.closest('.mh-bay')).getPropertyValue('--k')) || 1;
        const tx = (car.left - s.left + car.width * .34) / k, ty = (car.top - s.top + car.height * .45) / k;
        waves.forEach((w, i) => {
          const k = seg(t, 4.05 + i * .18, 4.95 + i * .18);
          w.style.opacity = k > 0 && k < 1 ? (1 - k) * .9 : 0;
          w.style.left = lerp(P.x, tx, k) + 'px'; w.style.top = lerp(P.y - 16, ty, k) + 'px';
          w.style.transform = `scale(${.6 + k * 1.4})`;
        });
        const bl = Math.max(Math.sin(Math.PI * seg(t, 4.75, 5.1)), Math.sin(Math.PI * seg(t, 5.25, 5.6)));
        blinks.forEach(b => b.style.opacity = bl);
        floorflash.style.opacity = bl * .9;
        const cyc = Math.floor((now / 1000) / PERIOD);
        if (t > 4.75 && lastSettle !== cyc) { lastSettle = cyc; k3Body.classList.remove('mh-settle'); void k3Body.offsetWidth; k3Body.classList.add('mh-settle'); }
        badge.classList.toggle('mh-show', t > 5.3 && t < 6.9);
        requestAnimationFrame(frame);
      }
      // Avvio/arresto: le animazioni girano SOLO mentre la home e' visibile
      function start() {
        setGreeting(); scaleBays();
        if (reduce) {
          palm.style.transform = `translate(${PALM_POS.x}px, ${PALM_POS.y}px)`; palm.style.opacity = 1;
          giver.style.display = 'none'; badge.classList.add('mh-show');
          return;
        }
        replayEnter();
        if (!active) { active = true; requestAnimationFrame(frame); }
        if (!phoneTimer) { phoneFirst = setTimeout(arrive, 1600); phoneTimer = setInterval(arrive, 3800); }
      }
      function stop() {
        active = false;
        clearTimeout(phoneFirst); clearInterval(phoneTimer); phoneTimer = null;
      }
      return { start, stop };
    }

    window.MacroHome = {
        canShow: canShow,
        refreshNav: refreshNav,
        show: show,
        hide: hide,
        onShowPage: onShowPage,
        openConsegne: openConsegne,
        reset: reset,
        isInConsegne: function () { return inConsegne; }
    };
})();
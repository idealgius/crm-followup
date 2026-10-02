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
    let inStock = false;

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
        const stockP = document.getElementById('stockPage');
        if (stockP) stockP.style.display = 'none';
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
            else openBI();
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
        hideBI();
        const cgp = document.getElementById('consegnePage'); if (cgp) cgp.style.display = 'none';
        inConsegne = false; inStock = false;
        setNavLinksVisible(false);
        document.body.removeAttribute('data-role-theme');
        setBadge('HOME');
        root.style.display = 'block';
        document.body.classList.add('mh-home-on');   // navbar: niente scritta HOME, logo al centro
        if (scene) scene.start();
        history.replaceState(null, '', window.location.pathname + '#home');
        sessionStorage.setItem('currentPage', 'home');
        window.scrollTo(0, 0);
    }

    function hide() {
        if (root) root.style.display = 'none';
        document.body.classList.remove('mh-home-on');
        if (scene) scene.stop();
    }

    // Chiamata all'inizio di showPage(): qualunque pagina di In bound si
    // apra, la home e l'area Consegne si chiudono e la navbar torna normale.
    function onShowPage() {
        hide();
        hideBI();
        const consegne = document.getElementById('consegnePage');
        if (consegne) consegne.style.display = 'none';
        const stockP = document.getElementById('stockPage');
        if (stockP) stockP.style.display = 'none';
        inConsegne = false; inStock = false;
        setNavLinksVisible(true);
    }

    function openInbound() {
        const role = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.role : 'UTENTE';
        showPage(getDefaultPageForRole(role));
    }

    // Pagina della macro-sezione BI (capitoli Consegne / Stock / Commerciale, vedi /js/bi-home.js)
    function openBI() {
        if (!canShow()) return;
        hide();
        stopInboundLiveUpdates();
        hideAllPages();
        const consegne = document.getElementById('consegnePage');
        if (consegne) consegne.style.display = 'none';
        inConsegne = false; inStock = false;
        setNavLinksVisible(false);
        document.body.removeAttribute('data-role-theme');
        setBadge('BI');
        if (window.BIHome) BIHome.show();
        history.replaceState(null, '', window.location.pathname + '#bi');
        sessionStorage.setItem('currentPage', 'bi');
        window.scrollTo(0, 0);
    }
    function hideBI() { if (window.BIHome) BIHome.hide(); }

    function openConsegne() {
        if (!canShow()) return;
        hide();
        hideBI();
        stopInboundLiveUpdates();
        hideAllPages();
        inConsegne = true; inStock = false;
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

    // Area Stock (capitolo 02 della BI): pagina #stockPage, contenuto costruito da /js/stock-home.js.
    // Serve il permesso STOCK (almeno "Solo lettura") oltre a quello di accesso alla BI.
    function canStock() {
        if (!canShow()) return false;
        const a = hasAccess('STOCK');
        return !!a && a !== 'NONE';
    }
    function openStock() {
        if (!canStock()) return;
        hide();
        hideBI();
        stopInboundLiveUpdates();
        hideAllPages();
        inConsegne = false; inStock = true;
        setNavLinksVisible(false);
        document.body.removeAttribute('data-role-theme');
        setBadge('STOCK');
        const page = document.getElementById('stockPage');
        if (page) page.style.display = 'block';
        if (window.StockHome) StockHome.init();
        history.replaceState(null, '', window.location.pathname + '#stock');
        sessionStorage.setItem('currentPage', 'stock');
        window.scrollTo(0, 0);
    }

    // Al logout: chiude tutto e ripristina la navbar per il prossimo login
    function reset() {
        hide();
        hideBI();
        const consegne = document.getElementById('consegnePage');
        if (consegne) consegne.style.display = 'none';
        const stockP = document.getElementById('stockPage');
        if (stockP) stockP.style.display = 'none';
        inConsegne = false; inStock = false;
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

    <!-- BI: locandina con l'insegna della sede e grafici animati -->
    <button class="mh-bay mh-out mh-bi" type="button" data-mh="bi" aria-label="Entra in BI"><div class="mh-bay-in">
      <div class="mh-bi-bg"></div>
    <div class="mh-bi-stars"></div><div class="mh-bi-halo"></div>
    <div class="mh-bi-facade"><img src="/img/macro/sede-insegna.png" alt="Sede Gruppo Autoscala"></div>
    <div class="mh-bi-letters"></div><span class="mh-bi-shoot"></span><span class="mh-bi-shoot mh-bi-s2"></span>
    <div class="mh-bi-floor"></div>
    <div class="mh-bi-w" style="left:24px;top:218px;animation-delay:-1s"><small>Vendite per mese</small>
      <div class="mh-bi-bars"><i style="--h:45%"></i><i style="--h:70%;animation-delay:.1s"></i><i style="--h:55%;animation-delay:.2s"></i><i style="--h:88%;animation-delay:.3s"></i><i style="--h:64%;animation-delay:.4s"></i><i style="--h:100%;animation-delay:.5s;background:linear-gradient(180deg,#ffd08a,#f4a83a)"></i></div></div>
    <div class="mh-bi-w mh-bi-donut" style="left:190px;top:244px;padding:10px;animation-delay:-3s">
      <svg width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="36" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="12"/>
        <circle class="mh-bi-v" cx="48" cy="48" r="36" fill="none" stroke="#34c38f" stroke-width="12" stroke-linecap="round" transform="rotate(-90 48 48)"/>
        <text x="48" y="46" text-anchor="middle" fill="#fff" font-size="22" font-weight="800" font-family="Inter,sans-serif">✓</text>
        <text x="48" y="60" text-anchor="middle" fill="#aab3c2" font-size="8" font-weight="700" font-family="Inter,sans-serif">CONSEGNE</text></svg></div>
    <div class="mh-bi-w mh-bi-line" style="left:310px;top:216px;width:226px;animation-delay:-2s"><small>Importo finanziato</small><b>Andamento</b>
      <svg width="200" height="46" viewBox="0 0 200 46"><defs><linearGradient id="mh-bia" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4a83a" stop-opacity=".45"/><stop offset="1" stop-color="#f4a83a" stop-opacity="0"/></linearGradient></defs>
        <path class="mh-bi-a" d="M0,38 C20,30 30,34 50,24 S90,26 110,16 S150,20 170,8 L200,6 L200,46 L0,46 Z" fill="url(#mh-bia)"/>
        <path class="mh-bi-l" d="M0,38 C20,30 30,34 50,24 S90,26 110,16 S150,20 170,8 L200,6" fill="none" stroke="#f4a83a" stroke-width="3" stroke-linecap="round"/></svg></div>
    <div class="mh-bi-w mh-bi-kpi" style="left:372px;top:22px;animation-delay:-4s"><span class="mh-bi-live"></span><div><small>Dati sempre aggiornati</small><b style="font-size:13px">dal foglio, ogni 5 minuti</b></div></div>
    <div class="mh-bi-info"><div><div class="mh-bi-k"><i></i>Report e analisi</div><h2>BI</h2><p>Consegne, stock, report e analisi dei dati di vendita.</p></div>
      <span class="mh-bi-go"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div>
  
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

      // Avvio/arresto: le animazioni girano SOLO mentre la home e' visibile
      function start() {
        setGreeting(); scaleBays();
        if (reduce) return;
        replayEnter();
        if (!phoneTimer) { phoneFirst = setTimeout(arrive, 1600); phoneTimer = setInterval(arrive, 3800); }
      }
      function stop() {
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
        openBI: openBI,
        openStock: openStock,
        canStock: canStock,
        reset: reset,
        isInConsegne: function () { return inConsegne || inStock; },
        isInStock: function () { return inStock; }
    };
})();
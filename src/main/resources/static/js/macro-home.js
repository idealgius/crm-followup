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
   ===================================================================== */
(function () {
    const IMG = '/img/macro/';
    const PAGE_IDS = ['dashboardPage', 'followupsPage', 'waitingPage', 'contactsPage', 'promoPage',
        'adminPage', 'rentPage', 'servicePage', 'veicoliPage', 'preventiviPage', 'allChartsPage'];
    let root = null;
    let inConsegne = false;

    // NOLEGGIO e SERVICE hanno gia' la loro dashboard dedicata: niente home.
    function canShow(role) {
        role = role || (typeof currentUser !== 'undefined' && currentUser ? currentUser.role : null);
        return !!role && role !== 'NOLEGGIO' && role !== 'SERVICE';
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
        // riavvia le animazioni d'ingresso delle auto ogni volta che la home riappare
        root.querySelectorAll('.mh-car, .mh-speed').forEach(el => {
            el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
        });
        root.style.display = 'block';
        history.replaceState(null, '', window.location.pathname + '#home');
        sessionStorage.setItem('currentPage', 'home');
        window.scrollTo(0, 0);
    }

    function hide() {
        if (root) root.style.display = 'none';
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

    function arrow() {
        return '<div class="mh-arrow"><svg width="18" height="18" viewBox="0 0 24 24" fill="none">' +
            '<path d="M5 12h14M13 6l6 6-6 6" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
    }

    function template() {
        return '' +
        '<div class="mh-wrap">' +
          '<div class="mh-heading">' +
            '<h1>Gruppo Autoscala — CRM</h1>' +
            '<p>Scegli l\'area in cui vuoi lavorare</p>' +
          '</div>' +
          '<div class="mh-cards">' +

            /* ---------- IN BOUND ---------- */
            '<button type="button" class="mh-card mh-inbound" data-mh="inbound">' +
              '<div class="mh-glow"></div>' +
              '<div class="mh-bubble" style="width:70px;height:70px;top:20px;left:40px;background:#8fa3ff"></div>' +
              '<div class="mh-bubble" style="width:36px;height:36px;top:60px;left:130px;background:#c7d2ff;animation-delay:1.2s"></div>' +
              '<div class="mh-bubble" style="width:22px;height:22px;top:24px;left:200px;background:#5f78ff;animation-delay:2.1s"></div>' +
              arrow() +
              '<div class="mh-scene">' +
                '<div class="mh-car-wrap">' +
                  '<div class="mh-speed" style="top:60%"></div><div class="mh-speed" style="top:75%"></div>' +
                  '<img class="mh-car" src="' + IMG + 'sportequipe-6gt.png" alt="Sportequipe 6GT">' +
                '</div>' +
                '<svg class="mh-phone" viewBox="0 0 320 150" xmlns="http://www.w3.org/2000/svg">' +
                  '<g transform="translate(248,8)">' +
                    '<rect x="0" y="0" width="52" height="86" rx="10" fill="#11142a" stroke="#e8ecff" stroke-width="2.5"/>' +
                    '<rect x="6" y="10" width="40" height="58" rx="4" fill="#232752"/>' +
                    '<g class="mh-notif"><circle cx="26" cy="30" r="9" fill="#ffb648"/>' +
                    '<path d="M21 30l4 4 8-8" stroke="#11142a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>' +
                    '<rect x="10" y="46" width="32" height="4" rx="2" fill="#4f6bff"/>' +
                    '<rect x="10" y="54" width="22" height="4" rx="2" fill="#3a3f6b"/>' +
                  '</g>' +
                '</svg>' +
              '</div>' +
              '<div class="mh-label">' +
                '<div class="mh-eyebrow">Richieste in arrivo</div>' +
                '<h2>In bound</h2>' +
                '<p>Dashboard, Follow-up, Recall, Registro Contatti, Preventivi e tutte le sezioni attuali del CRM.</p>' +
              '</div>' +
            '</button>' +

            /* ---------- CONSEGNE ---------- */
            '<button type="button" class="mh-card mh-delivery" data-mh="consegne">' +
              '<div class="mh-glow"></div>' +
              '<div class="mh-bubble" style="width:60px;height:60px;top:26px;right:36px;background:#ffd39a;animation-delay:.4s"></div>' +
              '<div class="mh-bubble" style="width:30px;height:30px;top:80px;right:110px;background:#ffe6c2;animation-delay:1.6s"></div>' +
              '<div class="mh-bubble" style="width:18px;height:18px;top:30px;right:150px;background:#ffb648;animation-delay:2.6s"></div>' +
              arrow() +
              '<div class="mh-scene">' +
                '<div class="mh-car-wrap">' +
                  '<div class="mh-speed" style="top:58%"></div><div class="mh-speed" style="top:73%"></div>' +
                  '<img class="mh-car" src="' + IMG + 'ich-x-k3.png" alt="ICH-X K3">' +
                '</div>' +
                '<div class="mh-handover" aria-label="Consegna chiavi al cliente">' +
                  '<svg viewBox="0 0 220 120" xmlns="http://www.w3.org/2000/svg">' +
                    '<defs><linearGradient id="mhFob" x1="0" y1="0" x2="1" y2="0">' +
                      '<stop offset="0" stop-color="#3a3f4b"/><stop offset="1" stop-color="#15171d"/></linearGradient></defs>' +
                    '<g class="mh-hg"><image href="' + IMG + 'mano-consulente.png" x="4" y="6" width="96" height="96"/></g>' +
                    '<g transform="translate(200,26) scale(-1,1)"><g class="mh-hr">' +
                      '<image href="' + IMG + 'mano-cliente.png" x="0" y="0" width="96" height="96"/></g></g>' +
                    '<g class="mh-key">' +
                      '<circle cx="0" cy="0" r="5" fill="none" stroke="#e9ecf2" stroke-width="2.2"/>' +
                      '<rect x="-8" y="4" width="16" height="26" rx="7" fill="url(#mhFob)" stroke="#6b7180" stroke-width="1"/>' +
                      '<circle cx="0" cy="12" r="2.6" fill="#ffb648"/>' +
                      '<rect x="-4" y="18" width="8" height="2.6" rx="1.3" fill="#7c8394"/>' +
                      '<rect x="-4" y="22.5" width="8" height="2.6" rx="1.3" fill="#7c8394"/>' +
                    '</g>' +
                    '<g class="mh-done">' +
                      '<rect x="-42" y="0" width="84" height="22" rx="11" fill="#1fb46a"/>' +
                      '<path d="M-33 11l4 4 7-8" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
                      '<text x="-18" y="15.5" textLength="54" lengthAdjust="spacingAndGlyphs" font-size="10.5" font-weight="700" fill="#fff" font-family="Inter, Segoe UI, system-ui, sans-serif">Consegnata</text>' +
                    '</g>' +
                  '</svg>' +
                '</div>' +
              '</div>' +
              '<div class="mh-label">' +
                '<div class="mh-eyebrow">Vetture in consegna</div>' +
                '<h2>Consegne</h2>' +
                '<p>Tempistiche di consegna, vetture da consegnare e motivo del ritardo.</p>' +
              '</div>' +
            '</button>' +

          '</div>' +
        '</div>';
    }

    window.MacroHome = {
        canShow: canShow,
        show: show,
        hide: hide,
        onShowPage: onShowPage,
        openConsegne: openConsegne,
        reset: reset,
        isInConsegne: function () { return inConsegne; }
    };
})();
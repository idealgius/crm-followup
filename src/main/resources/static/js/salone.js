/* =====================================================================
   APPUNTAMENTI E INGRESSI (salone) — Gruppo Autoscala CRM
   ---------------------------------------------------------------------
   Pagina #salonePage (contenuto costruito qui, stili in /css/salone.css, prefisso sa-).
   Schede, come Tempistiche / Analisi delle Consegne:
     🚶 WALK-IN       barra in tempo reale dello stato dei consulenti (bollini verde / giallo / rosso),
                      calendario del mese + elenco degli ingressi del giorno (ordinabile),
                      "＋ Registra ingresso" (nome, cognome, cellulare, vetture, consulente).
                      Il consulente riceve la notifica e "Prende in carico": diventa Occupato.
     📅 APPUNTAMENTI  da import CSV (solo sede Gruppo Auto Scala srl = Agnano), calendario,
                      elenco del giorno, "Da assegnare" se il venditore non e' di Agnano.
                      Import e storico degli import: dal livello 2.
     📊 REPORT        (livello 3) walk-in per consulente, marchi richiesti, tempo negli stati,
                      tempo dalla presa in carico al ritorno disponibile, storico dei cambi di stato.
   💬 CHAT in basso a sinistra (su tutte le schede): solo livello 4 e ruoli Front Office / Consulenza / Back Office.
   Grafici del Report: 3 formati (ciambella / barre / linee nel tempo), scelta ricordata nel browser.

   Chi vede cosa (voce "Appuntamenti e ingressi" della pagina Permessi, a livelli):
     Livello 1 vede tutto ma non registra e non importa (Consulenza a livello 1: solo i propri)
     Livello 2 registra walk-in e importa · Livello 3 anche la scheda Report.
   Tutti gli orari sono mostrati in ora italiana (Europe/Rome), qualunque sia il PC.
   API: /api/salone/... (SaloneController.java)
   ===================================================================== */
(function () {
    const API = '/api/salone';
    const TZ = 'Europe/Rome';
    const PAGE_IDS = ['dashboardPage', 'followupsPage', 'waitingPage', 'contactsPage', 'promoPage',
        'adminPage', 'rentPage', 'servicePage', 'veicoliPage', 'preventiviPage', 'allChartsPage', 'consegnePage', 'stockPage', 'commercialePage'];
    const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    const GG = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
    const MARCHE_RISERVA = ['Alfa Romeo', 'Audi', 'BMW', 'BYD', 'Citroën', 'Cupra', 'Dacia', 'DR', 'DS', 'Fiat', 'Ford', 'Hyundai', 'ICH-X', 'Jeep', 'Kia', 'Lancia', 'Mazda',
        'Mercedes-Benz', 'MG', 'Mini', 'Nissan', 'Opel', 'Peugeot', 'Renault', 'Seat', 'Skoda', 'Sportequipe', 'Suzuki', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo'];
    const marche = () => (typeof MARCHE_LIST !== 'undefined' && Array.isArray(MARCHE_LIST) && MARCHE_LIST.length ? MARCHE_LIST : MARCHE_RISERVA);
    /* bollini */
    const STATI = {
        DISPONIBILE: { t: 'Disponibile', c: 'verde' },
        OCCUPATO: { t: 'Occupato', c: 'giallo' },
        NON_DISPONIBILE: { t: 'Non disponibile', c: 'rosso' },
        TEST_DRIVE: { t: 'Test drive', c: 'grigio' },
        IN_PIAZZALE: { t: 'In piazzale', c: 'azzurro' }
    };
    const COL = { DISPONIBILE: '#22c55e', OCCUPATO: '#f5b301', NON_DISPONIBILE: '#ef4444', TEST_DRIVE: '#8b95a5', IN_PIAZZALE: '#38bdf8' };
    const EMO = { DISPONIBILE: '🟢', OCCUPATO: '🟡', NON_DISPONIBILE: '🔴', TEST_DRIVE: '⚪', IN_PIAZZALE: '🔵' };
    const zeri = () => Object.fromEntries(Object.keys(STATI).map(k => [k, 0]));   // { DISPONIBILE: 0, ... } per tutti i bollini

    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pad = n => String(n).padStart(2, '0');
    const up1 = s => String(s || '').replace(/^./, c => c.toUpperCase());
    /* ---- tempo: sempre ora italiana ---- */
    const F_DATA = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
    const F_ORA = new Intl.DateTimeFormat('it-IT', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
    const F_DO = new Intl.DateTimeFormat('it-IT', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    const isoRoma = d => F_DATA.format(d);                   // aaaa-mm-gg in Italia
    const oggi = () => isoRoma(new Date());
    const ora = s => s ? F_ORA.format(new Date(s)) : '';
    const dataOra = s => s ? F_DO.format(new Date(s)).replace(',', ' alle') : '';
    const giornoLungo = g => new Date(g + 'T12:00:00Z').toLocaleDateString('it-IT', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const giornoCorto = g => new Date(g + 'T12:00:00Z').toLocaleDateString('it-IT', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
    const durata = min => {
        if (min == null || isNaN(min)) return '—';
        const m = Math.round(min);
        if (m < 60) return m + ' min';
        return Math.floor(m / 60) + ' h ' + pad(m % 60) + ' min';
    };
    const minDa = s => s ? (Date.now() - new Date(s).getTime()) / 60000 : 0;
    const nomeCliente = r => [r.nome, r.cognome].filter(Boolean).join(' ') || 'Cliente';
    const vettTxt = r => (r.vetture || []).map(v => [v.marca, v.modello].filter(Boolean).join(' ')).filter(Boolean);
    async function api(path, opt) {
        const res = await fetch(API + path, Object.assign({ credentials: 'same-origin' }, opt || {}));
        let d = null; try { d = await res.json(); } catch (e) { /* */ }
        if (!res.ok) throw new Error((d && d.error) || ('Errore ' + res.status));
        return d;
    }
    const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    // senza stato (CRM chiuso / non ancora in salone): bollino VUOTO; il grigio pieno e' il Test drive
    const bollino = (s, grande) => `<i class="sa-dot ${s && STATI[s] ? STATI[s].c : 'vuoto'}${grande ? ' g' : ''}" aria-hidden="true"></i>`;
    function toast(t) {
        const n = document.createElement('div'); n.className = 'sa-toast'; n.textContent = t;
        document.body.appendChild(n); setTimeout(() => n.classList.add('via'), 2600); setTimeout(() => n.remove(), 3000);
    }

    /* ================= permessi e navigazione ================= */
    const can = () => typeof hasAccess === 'function' && typeof currentUser !== 'undefined' && !!currentUser && hasAccess('SALONE');
    const canFull = () => typeof canWrite === 'function' && canWrite('SALONE');
    const entraDiretto = role => ['FRONT_OFFICE', 'CONSULENZA'].includes(role || (typeof currentUser !== 'undefined' && currentUser && currentUser.role)) && can();

    let root = null, aperta = false;
    const st = {
        tab: 'walkin', giorno: oggi(), mese: oggi().slice(0, 7), giorni: {}, ingressi: [], consulenti: [], puoGestire: false, vedeTutti: false, vedeReport: false, puoImportare: false,
        verso: 'desc', io: null, stati: [], mio: null, cambiaTutti: false,
        app: { giorno: oggi(), mese: oggi().slice(0, 7), giorni: {}, daAss: {}, lista: [], verso: 'asc', filtro: '', info: null, caricato: false },
        rep: { da: null, a: null, preset: '30', dati: null }
    };

    // la voce "Appuntamenti e ingressi" nel menu del nome: solo da Moderatore in su.
    // Front office e Consulenza entrano direttamente nel salone; tutti gli altri (es. il Noleggio)
    // lo trovano come SCHEDA nella barra in alto, accanto alle loro (RENT | APPUNTAMENTI E INGRESSI).
    const ruolo = () => (typeof currentUser !== 'undefined' && currentUser && currentUser.role) || '';
    const moderatoreSu = () => ['MODERATORE', 'GESTORE', 'ADMIN'].includes(ruolo());
    const usaScheda = () => can() && !entraDiretto() && !moderatoreSu();
    let scheda = false;
    function refreshNav() {
        const b = document.getElementById('navSalone');
        if (b) b.style.display = can() && moderatoreSu() ? 'flex' : 'none';
        if (can()) { avviaNotifiche(); Presenza.avvia(); Chat.ascolta(); }   // la chat si vede solo nel salone, ma i messaggi suonano ovunque
        scheda = usaScheda();
        Scheda.mostra(scheda);
        if (aperta) setTimeout(Menu.entra, 0);   // app.js rimette il menu ☰ dopo refreshNav: lo risistemo
    }

    /* ---------- SCHEDA nella barra in alto (come Registro contatti, Preventivi...) ---------- */
    const Scheda = (function () {
        const ID = 'navSaloneTab';
        function link() {
            let a = document.getElementById(ID);
            if (a) return a;
            const nav = document.querySelector('.nav-links'); if (!nav) return null;
            a = document.createElement('a');
            a.href = '#salone'; a.className = 'nav-link'; a.id = ID; a.style.display = 'none';
            a.innerHTML = '<span class="nav-link-icon">🚶</span><span class="nav-link-label">APPUNTAMENTI E INGRESSI</span><i class="sa-tab-n" hidden></i>';
            a.addEventListener('click', e => { e.preventDefault(); open(); });
            const dopo = document.getElementById('navRent');
            if (dopo && dopo.parentElement === nav) dopo.after(a); else nav.appendChild(a);
            return a;
        }
        function mostra(on) { const a = on ? link() : document.getElementById(ID); if (a) a.style.display = on ? '' : 'none'; }
        function attiva(on) { const a = document.getElementById(ID); if (a) a.classList.toggle('active', on); }
        function badge(n) { const i = document.querySelector('#' + ID + ' .sa-tab-n'); if (i) { i.hidden = !n; i.textContent = n; } }
        return { mostra, attiva, badge };
    })();

    /* ---------- MENU ☰ in alto a sinistra ----------
       In Appuntamenti e ingressi "Mostra Grafici" non c'entra: si nasconde. Per chi non e' Admin
       il ☰ sparisce; per l'Admin resta con una sola voce: "Elimina storico ingressi e appuntamenti". */
    const Menu = (function () {
        let voce = null, attivo = false;
        const W = () => document.getElementById('hamburgerMenuWrapper'), D = () => document.getElementById('hamburgerMenuDropdown');
        const admin = () => typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'ADMIN';
        function entra() {
            const w = W(), d = D(); if (!w || !d) return;
            attivo = true;
            [...d.children].forEach(c => { if (c !== voce && !c.dataset.saNascosto) { c.dataset.saNascosto = c.style.display || '-'; c.style.display = 'none'; } });
            d.style.display = 'none';
            if (!admin()) { w.style.display = 'none'; return; }
            if (!voce) {
                voce = document.createElement('button');
                voce.type = 'button';
                voce.setAttribute('style', 'width:100%;text-align:left;padding:12px 16px;background:none;border:none;color:#ff8a8d;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px');
                voce.innerHTML = '🗑 Elimina storico ingressi e appuntamenti';
                voce.addEventListener('click', () => { d.style.display = 'none'; apriElimina(); });
            }
            if (voce.parentElement !== d) d.appendChild(voce);
            voce.style.display = 'flex';
            w.style.display = 'block';
        }
        function esci() {
            if (!attivo) return;
            attivo = false;
            const w = W(), d = D(); if (!w || !d) return;
            [...d.children].forEach(c => { if (c.dataset.saNascosto) { c.style.display = c.dataset.saNascosto === '-' ? '' : c.dataset.saNascosto; delete c.dataset.saNascosto; } });
            if (voce) voce.remove();
            d.style.display = 'none';
            w.style.display = typeof hasAccess === 'function' && hasAccess('GRAFICI') ? 'block' : 'none';
        }
        return { entra, esci };
    })();

    /* ---------- ELIMINA STORICO (solo Admin, con password) ----------
       1) si sceglie cosa (walk-in, appuntamenti importati, storico degli import) e il periodo, o tutto
       2) finestra di conferma al centro con la password; il server la ricontrolla (SaloneController). */
    function apriElimina() {
        const ov = document.createElement('div');
        ov.className = 'sa-ov sa-ov-c';
        ov.innerHTML = `<div class="sa-modal sa-del" role="dialog" aria-modal="true" aria-label="Elimina storico">
          <header><div><small>SOLO ADMIN · APPUNTAMENTI E INGRESSI</small><h3>Elimina storico</h3></div><button type="button" class="sa-x" data-chiudi aria-label="Chiudi">✕</button></header>
          <div class="sa-mbody">
            <div class="sa-lbl" style="margin-top:0">Cosa eliminare</div>
            <label class="sa-chk"><input type="checkbox" data-w checked> <span><b>Walk-in</b> · i clienti registrati in salone (ingressi)</span></label>
            <label class="sa-chk"><input type="checkbox" data-ap checked> <span><b>Appuntamenti</b> · quelli arrivati dagli import (per data dell'appuntamento)</span></label>
            <label class="sa-chk"><input type="checkbox" data-im> <span><b>Storico degli import</b> · l'elenco degli import fatti e cosa era cambiato</span></label>
            <label class="sa-chk"><input type="checkbox" data-st> <span><b>Stati dei consulenti</b> · lo storico dei cambi di stato (verde / giallo / rosso); con "Tutto" anche lo stato attuale</span></label>
            <label class="sa-chk"><input type="checkbox" data-ch> <span><b>Chat</b> · i messaggi del gruppo e delle chat private</span></label>
            <button type="button" class="sa-btn2 sa-tutti" data-tutti>☑ Seleziona tutto</button>
            <div class="sa-lbl">Periodo</div>
            <label class="sa-chk"><input type="radio" name="saDelP" value="p" checked> <span>Solo un periodo</span></label>
            <div class="sa-row2" data-per><label>Dal<input type="date" data-da></label><label>Al<input type="date" data-a></label></div>
            <label class="sa-chk"><input type="radio" name="saDelP" value="t"> <span><b>Tutto</b> · azzera completamente i dati scelti sopra</span></label>
            <p class="sa-hint" style="margin-top:12px">Report e grafici si calcolano da walk-in e stati dei consulenti: eliminandoli si azzerano anche loro. Permessi e utenti non si toccano mai.</p>
            <div class="sa-err" data-err></div>
          </div>
          <footer><button type="button" class="sa-btn2" data-chiudi>Annulla</button><button type="button" class="sa-btn sa-btn-red" data-avanti>Continua</button></footer>
        </div>`;
        document.body.appendChild(ov);
        const q = x => ov.querySelector(x);
        q('[data-da]').value = oggi().slice(0, 8) + '01'; q('[data-a]').value = oggi();
        const chiudi = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = e => { if (e.key === 'Escape') chiudi(); };
        document.addEventListener('keydown', onKey);
        ov.addEventListener('change', () => { q('[data-per]').style.opacity = ov.querySelector('[name="saDelP"]:checked').value === 'p' ? '' : '.4'; });
        ov.addEventListener('click', e => {
            if (e.target === ov || e.target.closest('[data-chiudi]')) { chiudi(); return; }
            if (e.target.closest('[data-tutti]')) {
                const box = ['[data-w]', '[data-ap]', '[data-im]', '[data-st]', '[data-ch]'].map(q), tutti = box.every(x => x.checked);
                box.forEach(x => { x.checked = !tutti; });
                e.target.closest('[data-tutti]').textContent = tutti ? '☑ Seleziona tutto' : '☐ Togli tutto';
                return;
            }
            if (!e.target.closest('[data-avanti]')) return;
            const scelta = { walkin: q('[data-w]').checked, appuntamenti: q('[data-ap]').checked, storicoImport: q('[data-im]').checked,
                stati: q('[data-st]').checked, chat: q('[data-ch]').checked,
                tutto: ov.querySelector('[name="saDelP"]:checked').value === 't', da: q('[data-da]').value, a: q('[data-a]').value };
            const err = q('[data-err]');
            if (!scelta.walkin && !scelta.appuntamenti && !scelta.storicoImport && !scelta.stati && !scelta.chat) { err.textContent = 'Scegli almeno una cosa da eliminare.'; return; }
            if (!scelta.tutto && (!scelta.da || !scelta.a)) { err.textContent = 'Scegli il periodo: dal / al.'; return; }
            chiudi(); confermaElimina(scelta);
        });
    }
    function confermaElimina(sc) {
        const cosa = [sc.walkin && 'walk-in', sc.appuntamenti && 'appuntamenti importati', sc.storicoImport && 'storico degli import',
            sc.stati && 'stati dei consulenti', sc.chat && 'messaggi della chat'].filter(Boolean).join(', ');
        const quando = sc.tutto ? '<b>TUTTO</b> (nessun limite di date)' : `dal <b>${esc(sc.da.split('-').reverse().join('/'))}</b> al <b>${esc(sc.a.split('-').reverse().join('/'))}</b>`;
        const ov = document.createElement('div');
        ov.className = 'sa-ov sa-ov-c';
        ov.innerHTML = `<div class="sa-modal sa-conf" role="alertdialog" aria-modal="true" aria-label="Conferma eliminazione">
          <div class="sa-conf-i">⚠️</div>
          <h3>Confermi l'eliminazione?</h3>
          <p>Stai per eliminare <b>${esc(cosa)}</b> ${quando}.<br>L'operazione <b>non si può annullare</b>.</p>
          <label class="sa-conf-pw">Scrivi la password per procedere<input type="password" data-pw autocomplete="off"></label>
          <div class="sa-err" data-err></div>
          <div class="sa-conf-b"><button type="button" class="sa-btn2" data-chiudi>Annulla</button><button type="button" class="sa-btn sa-btn-red" data-ok>Elimina definitivamente</button></div>
        </div>`;
        document.body.appendChild(ov);
        const pw = ov.querySelector('[data-pw]'), err = ov.querySelector('[data-err]'), ok = ov.querySelector('[data-ok]');
        pw.focus();
        const chiudi = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = e => { if (e.key === 'Escape') chiudi(); if (e.key === 'Enter' && document.activeElement === pw) vai(); };
        document.addEventListener('keydown', onKey);
        async function vai() {
            if (!pw.value) { err.textContent = 'Scrivi la password.'; return; }
            ok.disabled = true; ok.textContent = 'Eliminazione…';
            try {
                const d = await post('/storico/elimina', Object.assign({}, sc, { password: pw.value }));
                chiudi();
                toast(`Eliminati: ${d.walkin} walk-in, ${d.appuntamenti} appuntamenti, ${d.import} import, ${d.cambi} cambi di stato, ${d.messaggi} messaggi`);
                caricaStati();
                st.app.caricato = false; st.rep.dati = null;
                if (st.tab === 'walkin') caricaGiorno(st.giorno); else if (st.tab === 'app') caricaApp(st.app.giorno); else caricaReport();
            } catch (e) { err.textContent = e.message; ok.disabled = false; ok.textContent = 'Elimina definitivamente'; pw.select(); }
        }
        ov.addEventListener('click', e => {
            if (e.target === ov || e.target.closest('[data-chiudi]')) { chiudi(); return; }
            if (e.target.closest('[data-ok]')) vai();
        });
    }

    /* ---------- PRESENZA: il consulente risulta Disponibile in automatico finche' il CRM resta aperto ----------
       Ogni 25 s questa finestra dice al server "ci sono". Se il consulente chiude la finestra, preme Esci,
       la sessione scade o il CRM viene ridistribuito (deploy), i segnali si fermano e dopo poco risulta
       "non in salone". Un semplice F5 non conta come uscita. Se ha scelto lui Occupato o Non disponibile
       il segnale non lo cambia. Il server lo fa solo negli orari del salone
       (lun-ven 8:30-20:00, sab 8:30-13:30 e 15:00-18:00, dom 10:30-13:00: ORARI in SaloneController). */
    const Presenza = (function () {
        let t = null, agganciato = false;
        const tabId = (() => { try { let x = sessionStorage.getItem('saTab'); if (!x) { x = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('saTab', x); } return x; } catch (e) { return 'x'; } })();
        async function segnale() {
            if (!can()) return;
            try {
                const d = await post('/stati/presenza', { tab: tabId });
                if (!d.consulente) { ferma(); return; }        // non e' un consulente del salone
                aggancia();
                const prima = st.mio ? statoDi(st.mio).stato : undefined;
                if (aperta && (prima === undefined || prima !== d.stato)) caricaStati();
            } catch (e) { /* rete o sessione scaduta: si riprova */ }
        }
        function aggancia() {
            if (agganciato) return;
            agganciato = true;
            window.addEventListener('pagehide', () => {
                if (!t) return;
                try { navigator.sendBeacon(API + '/stati/uscita', new Blob([JSON.stringify({ tab: tabId })], { type: 'application/json' })); } catch (e) { /* */ }
            });
            document.addEventListener('visibilitychange', () => { if (t && document.visibilityState === 'visible') segnale(); });
            // "Esci" dal menu: esce subito (non aspetta)
            if (typeof window.logout === 'function' && !window.logout.__sa) {
                const orig = window.logout;
                const w = function () {
                    const self = this, args = arguments, era = !!t;
                    ferma();
                    if (!era) return orig.apply(self, args);
                    fetch(API + '/stati/uscita', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tab: tabId, esci: true }) })
                        .catch(() => { /* */ }).finally(() => orig.apply(self, args));
                };
                w.__sa = true; window.logout = w;
            }
        }
        function avvia() { if (t) return; t = setInterval(segnale, 25000); segnale(); }
        function ferma() { clearInterval(t); t = null; }
        return { avvia, ferma };
    })();

    function open() {
        if (!can()) return;
        if (window.MacroHome) { try { MacroHome.hide(); } catch (e) { /* */ } }
        if (window.BIHome) { try { BIHome.hide(); } catch (e) { /* */ } }
        PAGE_IDS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
        if (typeof stopContactPolling === 'function') stopContactPolling();
        if (typeof disconnectContactWebSocket === 'function') disconnectContactWebSocket();
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        if (scheda) Scheda.attiva(true);        // e' una scheda della barra: la barra resta (RENT | APPUNTAMENTI E INGRESSI)
        else {
            const links = document.querySelector('.nav-links'); if (links) links.style.visibility = 'hidden';
            document.body.removeAttribute('data-role-theme');
            const badge = document.getElementById('navBrandBadge'); if (badge) badge.textContent = 'SALONE';
        }
        const page = document.getElementById('salonePage'); if (!page) return;
        page.style.display = 'block';
        aperta = true;
        build();
        history.replaceState(null, '', window.location.pathname + '#salone');
        sessionStorage.setItem('currentPage', 'salone');
        window.scrollTo(0, 0);
        caricaGiorno(st.giorno);
        caricaStati();
        Menu.entra();
    }
    function hide() {
        const page = document.getElementById('salonePage'); if (page) page.style.display = 'none';
        if (aperta) { const links = document.querySelector('.nav-links'); if (links) links.style.visibility = ''; }
        Scheda.attiva(false);
        aperta = false;
        Menu.esci();
        Chat.mostra(false);                     // il pulsante della chat solo dentro Appuntamenti e ingressi
    }

    /* ================= pagina ================= */
    function build() {
        if (root) return;
        root = document.getElementById('saloneRoot');
        root.innerHTML = `
          <div class="sa-band">
            <div class="sa-band-in">
              <div><small>SALONE · AGNANO</small><h1>Appuntamenti e ingressi</h1><p>Clienti in salone, consulenti e appuntamenti della giornata</p></div>
              <div class="sa-clock" id="saClock"></div>
            </div>
            <div class="sa-tabs" role="tablist"></div>
          </div>
          <div class="sa-wrap" id="saBody"></div>`;
        disegnaSchede();
        root.querySelector('.sa-tabs').addEventListener('click', e => {
            const b = e.target.closest('[data-tab]'); if (!b) return;
            st.tab = b.dataset.tab;
            disegnaSchede();
            if (st.tab === 'app') { if (!st.app.caricato) caricaApp(st.app.giorno); else { render(); caricaApp(st.app.giorno); } }
            else if (st.tab === 'report' && !st.rep.dati) caricaReport();
            else { render(); if (st.tab === 'walkin') caricaGiorno(st.giorno, true); }   // dati sempre freschi cambiando scheda
        });
        root.addEventListener('click', onClick);
        root.addEventListener('change', onChange);
        const tick = () => { const c = document.getElementById('saClock'); if (c) { const d = new Date(); c.innerHTML = `<b>${F_ORA.format(d)}</b><span>${d.toLocaleDateString('it-IT', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })}</span>`; } };
        tick(); setInterval(tick, 20000);
        // aggiornamento automatico (altri front office, prese in carico, stati)
        setInterval(() => { if (aperta && st.tab === 'walkin' && !document.querySelector('.sa-ov')) caricaGiorno(st.giorno, true); }, 15000);
        // appuntamenti di oggi: chi e' arrivato e chi e' gia' stato preso in carico (non mentre si legge una nota o c'e' una finestra aperta)
        setInterval(() => { if (aperta && st.tab === 'app' && st.app.giorno === oggi() && !document.querySelector('.sa-ov') && !root.querySelector('.sa-app details[open]')) caricaApp(st.app.giorno); }, 15000);
        setInterval(() => { if (aperta) caricaStati(); }, 5000);
        setInterval(() => { if (aperta) disegnaStati(); }, 30000);   // "da 12 min" sempre aggiornato
    }
    function disegnaSchede() {
        const t = root.querySelector('.sa-tabs');
        const L = [['walkin', '🚶 Walk-in'], ['app', '📅 Appuntamenti']].concat(st.vedeReport ? [['report', '📊 Report']] : []);
        if (!L.some(x => x[0] === st.tab)) st.tab = 'walkin';
        t.innerHTML = L.map(([k, n]) => `<button type="button" class="sa-tab ${st.tab === k ? 'on' : ''}" data-tab="${k}" role="tab" aria-selected="${st.tab === k}">${n}</button>`).join('');
    }

    async function caricaGiorno(g, silenzioso) {
        st.giorno = g;
        try {
            const [d, m] = await Promise.all([api('/ingressi?data=' + g), api('/giorni?mese=' + st.mese)]);
            const eraRep = st.vedeReport;
            st.ingressi = d.ingressi || []; st.consulenti = d.consulenti || []; if (d.reparti) st.reparti = d.reparti; st.puoGestire = !!d.puoGestire; st.io = d.io || null;
            st.vedeTutti = !!d.vedeTutti; st.vedeReport = !!d.vedeReport; st.puoImportare = !!d.puoImportare;
            st.chat = !!d.chat;
            if (aperta) Chat.mostra(st.chat);      // chat: solo nel salone e solo per i profili che ce l'hanno
            st.giorni = m.giorni || {};
            st.err = '';
            if (eraRep !== st.vedeReport && root) disegnaSchede();
        } catch (e) { st.err = e.message; }
        if (st.tab !== 'walkin') return;
        if (!silenzioso || !document.activeElement || !root.contains(document.activeElement) || document.activeElement.tagName === 'BUTTON') render();
    }

    /* ---------- stato dei consulenti (bollini) ---------- */
    async function caricaStati() {
        try {
            const d = await api('/stati');
            st.stati = d.stati || []; st.mio = d.mio || null; st.cambiaTutti = !!d.cambiaTutti; st.online = d.online || []; if (d.reparti) st.reparti = d.reparti;
            disegnaStati();
            Controllo.verifica();
        } catch (e) { /* rete: si riprova */ }
    }
    const statoDi = nome => st.stati.find(x => x.nome === nome) || { nome, stato: null };
    /* VENDITA / NOLEGGIO: due gruppi di consulenti separati (reparti dal server) */
    const REP = { VENDITA: { t: 'Vendita', i: '🚗' }, NOLEGGIO: { t: 'Noleggio', i: '🔑' } };
    const repDi = n => (st.reparti && st.reparti[n]) || 'VENDITA';
    // prima il reparto di chi guarda (un consulente del noleggio vede prima il noleggio)
    const perReparto = L => (st.mio && repDi(st.mio) === 'NOLEGGIO' ? ['NOLEGGIO', 'VENDITA'] : ['VENDITA', 'NOLEGGIO']).map(k => [k, L.filter(n => repDi(n) === k)]).filter(([, l]) => l.length);
    const tagNol = rep => rep === 'NOLEGGIO' ? '<span class="sa-tag sa-tag-nol">🔑 Noleggio</span>' : '';
    // "Occupato da 12 min con Rossi" / "Non ancora in salone": stato di un consulente in parole
    const testoStato = s => s && s.stato && s.assente ? 'Non disponibile · CRM chiuso da ' + durata(minDa(s.dal))
        : s && s.stato ? STATI[s.stato].t + ' da ' + durata(minDa(s.dal)) + (s.cliente && s.stato !== 'DISPONIBILE' && s.stato !== 'NON_DISPONIBILE' ? ' con ' + s.cliente : '')
        : (st.online || []).includes(s && s.nome) ? 'CRM aperto · fuori orario' : 'Non in salone (CRM chiuso)';
    const min1 = t => String(t || '').replace(/^./, c => c.toLowerCase());   // "Occupato da..." -> "occupato da..." (il nome del cliente resta com'e')
    // bollino che si aggiorna da solo ogni 5 secondi (vedi disegnaStati)
    const bollinoVivo = (nome, conTesto) => `<span class="sa-sd" data-sd="${esc(nome)}">${bollino(statoDi(nome).stato)}${conTesto ? `<small class="sa-sd-t">${esc(testoStato(statoDi(nome)))}</small>` : ''}</span>`;
    function barraStati() {
        if (!st.stati.length) return '<div class="sa-card sa-stati" id="saStati"><span class="sa-hint">Caricamento stato dei consulenti…</span></div>';
        return `<div class="sa-card sa-stati" id="saStati">${barraStatiIn()}</div>`;
    }
    function barraStatiIn() {
        const conta = zeri();
        st.stati.forEach(s => { if (s.stato && s.stato in conta) conta[s.stato]++; });
        const mio = st.mio ? statoDi(st.mio) : null;
        return `<div class="sa-stati-h">
            <div><h3>Consulenti in salone <span class="sa-live">● in tempo reale</span></h3>
              <p>${Object.entries(conta).map(([k, n]) => `${bollino(k)} ${n} ${STATI[k].t.toLowerCase()}`).join(' · ')}</p>
              ${mio ? '<p class="sa-hint">Con il CRM aperto risulti disponibile in automatico. Se in orario lo chiudi (o premi Esci, o non ricarichi dopo un aggiornamento) risulti <b>non disponibile</b> finché non rientri.</p>' : ''}</div>
            ${mio ? `<div class="sa-mio" role="group" aria-label="Il tuo stato"><span>Il tuo stato</span>
              ${Object.keys(STATI).map(k => `<button type="button" class="sa-mio-b ${STATI[k].c} ${mio.stato === k ? 'on' : ''}" data-stato="${k}">${bollino(k)} ${STATI[k].t}</button>`).join('')}</div>` : ''}
          </div>
          ${perReparto(st.stati.map(x => x.nome)).map(([k, nomi]) => `<div class="sa-rep-h">${REP[k].i} ${REP[k].t}</div>
          <div class="sa-stati-l">${nomi.map(statoDi).map(s => {
              // senza il CRM aperto il consulente resta "non in salone": il suo stato non si puo' cambiare da fuori
              const io = st.mio === s.nome, conn = io || (st.online || []).includes(s.nome), puo = io || (st.cambiaTutti && conn);
              return `<div class="sa-cs ${s.stato && STATI[s.stato] ? STATI[s.stato].c : 'vuoto'} ${io ? 'io' : ''}">
                <button type="button" class="sa-cs-b" ${puo ? `data-menu="${esc(s.nome)}"` : 'disabled'} title="${puo ? 'Cambia stato' : s.assente ? 'Oggi era entrato ma ora non ha il CRM aperto: risulta non disponibile finché non rientra' : st.cambiaTutti && !conn ? 'Non ha il CRM aperto: lo stato torna disponibile quando accede' : ''}">
                  ${bollino(s.stato, true)}
                  <span class="sa-cs-t"><b>${esc(s.nome)}${io ? ' (tu)' : ''}</b>
                  <em>${s.stato && s.assente ? 'Non disponibile · CRM chiuso da ' + durata(minDa(s.dal)) : s.stato ? STATI[s.stato].t + ' · da ' + durata(minDa(s.dal)) : conn ? 'CRM aperto · fuori orario del salone' : s.uscitoAt && isoRoma(new Date(s.uscitoAt)) === oggi() && !/^Non connesso|riavvio/.test(s.motivo || '') ? 'Uscito dal CRM alle ' + ora(s.uscitoAt) : 'Non ancora in salone oggi'}</em>
                  ${s.stato && s.stato !== 'DISPONIBILE' && s.stato !== 'NON_DISPONIBILE' && s.cliente ? `<em class="sa-cs-cl">con ${esc(s.cliente)}</em>` : ''}</span>
                </button></div>`;
          }).join('')}</div>`).join('')}`;
    }
    function disegnaStati() {
        const el = document.getElementById('saStati');
        if (el && !el.querySelector('.sa-menu')) el.innerHTML = barraStatiIn();
        document.querySelectorAll('[data-sd]').forEach(el => {
            const s = statoDi(el.dataset.sd), d = el.querySelector('.sa-dot'), t = el.querySelector('.sa-sd-t');
            if (d) d.className = 'sa-dot ' + (s.stato && STATI[s.stato] ? STATI[s.stato].c : 'vuoto');
            if (t) t.textContent = testoStato(s);
        });
        const chips = document.querySelectorAll('.sa-ov [data-c]');
        chips.forEach(b => { const s = statoDi(b.dataset.c).stato; const d = b.querySelector('.sa-dot'); if (d) d.className = 'sa-dot ' + (s && STATI[s] ? STATI[s].c : 'vuoto'); });
    }
    async function cambiaStato(stato, nome) {
        try {
            const d = await post('/stati', nome && nome !== st.mio ? { stato, nome } : { stato });
            st.stati = d.stati || st.stati; if (d.online) st.online = d.online; disegnaStati();
            toast((nome && nome !== st.mio ? nome + ': ' : 'Ora sei ') + STATI[stato].t.toLowerCase());
        } catch (e) { alert(e.message); }
    }
    function menuStato(btn, nome) {
        document.querySelectorAll('.sa-menu').forEach(x => x.remove());
        const m = document.createElement('div'); m.className = 'sa-menu';
        m.innerHTML = `<small>${esc(nome)}</small>` + Object.keys(STATI).map(k => `<button type="button" data-set="${k}">${bollino(k)} ${STATI[k].t}</button>`).join('');
        btn.parentElement.appendChild(m);
        m.addEventListener('click', ev => { const b = ev.target.closest('[data-set]'); if (!b) return; ev.stopPropagation(); m.remove(); cambiaStato(b.dataset.set, nome); });
        setTimeout(() => document.addEventListener('click', function via(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', via); } }), 0);
    }

    /* ================= render ================= */
    function render() {
        const body = root && root.querySelector('#saBody'); if (!body) return;
        if (st.tab === 'app') { renderApp(body); return; }
        if (st.tab === 'report') { renderReport(body); return; }
        const L = st.ingressi.slice().sort((a, b) => (a.ora < b.ora ? -1 : a.ora > b.ora ? 1 : 0) * (st.verso === 'desc' ? -1 : 1));
        const isOggi = st.giorno === oggi();
        const assegnati = st.ingressi.filter(r => r.consulente).length, presi = st.ingressi.filter(r => r.presoAt).length;
        const perCons = {}; st.ingressi.forEach(r => { if (r.consulente) perCons[r.consulente] = (perCons[r.consulente] || 0) + 1; });
        body.innerHTML = `
          ${st.err ? `<div class="sa-msg err">${esc(st.err)}</div>` : ''}
          ${barraStati()}
          <div class="sa-grid">
            <aside class="sa-side">
              <div class="sa-card">${calendario(st.mese, st.giorno, st.giorni, null, false)}</div>
              <div class="sa-card sa-sum">
                <h3>${st.vedeTutti ? 'Riepilogo del giorno' : 'I tuoi clienti del giorno'}</h3>
                <div class="sa-kpis"><div><b>${st.ingressi.length}</b><span>ingressi</span></div><div><b>${assegnati}</b><span>assegnati</span></div><div><b>${presi}</b><span>presi in carico</span></div></div>
                ${st.vedeTutti ? perReparto(st.consulenti).map(([k, l]) => `<div class="sa-rep-h sm">${REP[k].i} ${REP[k].t}</div>` + l.map(c => `<div class="sa-cons-row"><span>${bollino(statoDi(c).stato)} ${esc(c)}</span><b>${perCons[c] || 0}</b></div>`).join('')).join('') : ''}
              </div>
            </aside>
            <section class="sa-main">
              <div class="sa-card">
                <div class="sa-list-h">
                  <div><h2>${esc(up1(giornoLungo(st.giorno)))}</h2><p>${L.length} ingress${L.length === 1 ? 'o' : 'i'}${isOggi ? ' · oggi' : ''}${st.vedeTutti ? '' : ' · solo i clienti assegnati a te'}</p></div>
                  <div class="sa-list-a">
                    <button type="button" class="sa-btn2" data-act="verso">${st.verso === 'desc' ? '⬇️ Più recenti prima' : '⬆️ Meno recenti prima'}</button>
                    ${!isOggi ? '<button type="button" class="sa-btn2" data-act="oggi">Oggi</button>' : ''}
                    ${st.puoGestire && isOggi ? '<button type="button" class="sa-btn" data-act="nuovo">＋ Registra ingresso</button>' : ''}
                  </div>
                </div>
                <div class="sa-list">${L.length ? L.map(card).join('') : `<div class="sa-none">${isOggi ? (st.vedeTutti ? 'Nessun cliente registrato oggi.' + (st.puoGestire ? ' Usa “＋ Registra ingresso” quando entra un cliente.' : '') : 'Nessun cliente assegnato a te oggi.') : 'Nessun ingresso in questo giorno.'}</div>`}</div>
              </div>
            </section>
          </div>`;
    }

    /* calendario riusato da walk-in (solo passato) e appuntamenti (anche futuro) */
    function calendario(mese, sel, giorni, rossi, futuro) {
        const [y, m] = mese.split('-').map(Number);
        const primo = new Date(Date.UTC(y, m - 1, 1)), giorniMese = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const vuoti = (primo.getUTCDay() + 6) % 7;      // lunedi' = 0
        const og = oggi();
        let celle = '';
        for (let i = 0; i < vuoti; i++) celle += '<span></span>';
        for (let d = 1; d <= giorniMese; d++) {
            const g = `${y}-${pad(m)}-${pad(d)}`, n = giorni[g] || 0, r = rossi ? rossi[g] || 0 : 0;
            const off = !futuro && g > og;
            celle += `<button type="button" class="sa-day ${g === sel ? 'sel' : ''} ${g === og ? 'oggi' : ''} ${off ? 'fut' : ''}" data-giorno="${g}" ${off ? 'disabled' : ''} ${r ? `title="${r} da assegnare"` : ''}>
              <span>${d}</span>${n ? `<i>${n}</i>` : ''}${r ? '<b class="sa-day-r"></b>' : ''}</button>`;
        }
        return `<div class="sa-cal-h"><button type="button" class="sa-nav" data-mese="-1" aria-label="Mese prima">‹</button>
            <b>${up1(MESI[m - 1])} ${y}</b>
            <button type="button" class="sa-nav" data-mese="1" aria-label="Mese dopo" ${!futuro && mese >= og.slice(0, 7) ? 'disabled' : ''}>›</button></div>
          <div class="sa-cal">${GG.map(g => `<em>${g}</em>`).join('')}${celle}</div>`;
    }

    function card(r) {
        const v = vettTxt(r);
        const stato = !r.consulente ? '<span class="sa-st da">Da assegnare</span>'
            : r.liberoAt ? `<span class="sa-st ok">✓ Seguito per ${durata(r.minutiCliente)} · libero alle ${ora(r.liberoAt)}</span>`
            : r.presoAt ? `<span class="sa-st ok">✓ Preso in carico alle ${ora(r.presoAt)}</span>`
            : `<span class="sa-st wait">⏳ Notificato alle ${ora(r.assegnatoAt)} · da prendere in carico</span>`;
        const sc = r.consulente ? statoDi(r.consulente).stato : null;
        const sel = st.puoGestire && r.data === oggi()
            ? `<select class="sa-sel" data-assegna="${esc(r.id)}"><option value="">— Assegna a —</option>${perReparto(st.consulenti).map(([k, l]) => `<optgroup label="${REP[k].t}">` + l.map(c => { const s = statoDi(c).stato; return `<option value="${esc(c)}" ${c === r.consulente ? 'selected' : ''}>${EMO[s] || '○'} ${esc(c)}</option>`; }).join('') + '</optgroup>').join('')}</select>`
            : `<b class="sa-cons">${r.consulente ? bollino(sc) + ' ' + esc(r.consulente) : '—'}</b>`;
        const mioCliente = st.io && r.consulente && st.mio === r.consulente;
        const modif = st.puoGestire || mioCliente || st.cambiaTutti;   // NUOVO: clic sulla scheda = modifica i dati del cliente
        return `<article class="sa-in ${r.presoAt ? 'preso' : r.consulente ? 'att' : 'nuovo'}">
            <div class="sa-in-t"><b>${ora(r.ora)}</b></div>
            <div class="sa-in-c${modif ? ' sa-in-mod' : ''}" ${modif ? `data-modifica="${esc(r.id)}" role="button" tabindex="0" title="Clicca per modificare nome, cellulare, vetture e note"` : ''}>
              <div class="sa-in-n">${esc(nomeCliente(r))}${r.cellulare ? ` <a href="tel:${esc(r.cellulare)}" class="sa-tel">📞 ${esc(r.cellulare)}</a>` : ''}</div>
              <div class="sa-in-v">${r.consulente ? tagNol(repDi(r.consulente)) : ''}${r.daApp ? `<span class="sa-tag sa-tag-app">📅 Appuntamento${r.appOra ? ' delle ' + esc(r.appOra) : ''}${r.consulentePrevisto && r.consulentePrevisto !== r.consulente ? ' · era di ' + esc(r.consulentePrevisto) : ''}</span>` : ''}${v.length ? v.map(x => `<span class="sa-car">🚗 ${esc(x)}</span>`).join('') : '<span class="sa-hint">Nessuna vettura indicata</span>'}</div>
              ${r.note ? `<div class="sa-in-note">📝 ${esc(r.note)}</div>` : ''}
              <div class="sa-in-f">Inserito il ${esc(dataOra(r.ora))} da ${esc(r.registratoDa || '')}${r.assegnatoAt ? ` · assegnato alle ${ora(r.assegnatoAt)}` : ''}${r.modificatoAt ? ` · modificato alle ${ora(r.modificatoAt)} da ${esc(r.modificatoDa || '')}` : ''}${modif ? '<span class="sa-in-edit">✏️ Modifica</span>' : ''}</div>
            </div>
            <div class="sa-in-a">${sel}${stato}
              ${st.puoGestire && r.data === oggi() ? `<button type="button" class="sa-x" data-elimina="${esc(r.id)}" title="Elimina l'ingresso">🗑</button>` : ''}
              ${(mioCliente || st.cambiaTutti) && r.consulente && !r.presoAt && r.data === oggi() ? `<button type="button" class="sa-btn" data-presa="${esc(r.id)}">${mioCliente ? 'Prendo in carico ✓' : 'Segna preso in carico'}</button>` : ''}
            </div>
          </article>`;
    }

    async function onClick(e) {
        const mn = e.target.closest('[data-menu]'); if (mn) { menuStato(mn, mn.dataset.menu); return; }
        const so = e.target.closest('[data-stato]'); if (so) { cambiaStato(so.dataset.stato); return; }
        if (st.tab === 'app' && await onClickApp(e)) return;
        if (st.tab === 'report' && onClickReport(e)) return;
        const g = e.target.closest('[data-giorno]'); if (g) { caricaGiorno(g.dataset.giorno); return; }
        const m = e.target.closest('[data-mese]');
        if (m) { st.mese = spostaMese(st.mese, Number(m.dataset.mese)); caricaGiorno(st.giorno); return; }
        const a = e.target.closest('[data-act]');
        if (a) {
            if (a.dataset.act === 'verso') { st.verso = st.verso === 'desc' ? 'asc' : 'desc'; render(); }
            if (a.dataset.act === 'oggi') { st.mese = oggi().slice(0, 7); caricaGiorno(oggi()); }
            if (a.dataset.act === 'nuovo') apriForm();
            return;
        }
        const md = e.target.closest('[data-modifica]');
        if (md && !e.target.closest('a')) { const r = st.ingressi.find(x => x.id === md.dataset.modifica); if (r) apriModifica(r); return; }
        const el = e.target.closest('[data-elimina]');
        if (el) {
            if (!confirm('Eliminare questo ingresso?')) return;
            try { await post('/ingressi/' + encodeURIComponent(el.dataset.elimina), { elimina: true }); caricaGiorno(st.giorno); } catch (x) { alert(x.message); }
            return;
        }
        const p = e.target.closest('[data-presa]');
        if (p) { try { await post('/ingressi/' + encodeURIComponent(p.dataset.presa) + '/presa'); caricaGiorno(st.giorno); caricaStati(); } catch (x) { alert(x.message); } }
    }
    const spostaMese = (mese, d) => { const [y, mm] = mese.split('-').map(Number); const n = new Date(Date.UTC(y, mm - 1 + d, 1)); return n.getUTCFullYear() + '-' + pad(n.getUTCMonth() + 1); };
    async function onChange(e) {
        if (st.tab === 'app') { onChangeApp(e); return; }
        if (st.tab === 'report') { onChangeReport(e); return; }
        const s = e.target.closest('[data-assegna]'); if (!s) return;
        const ss = statoDi(s.value).stato;
        if (s.value && ss !== 'DISPONIBILE' && !confirm(`${s.value} risulta ${ss ? STATI[ss].t.toLowerCase() : 'non ancora in salone'}. Assegnare comunque?`)) { caricaGiorno(st.giorno); return; }
        try { await post('/ingressi/' + encodeURIComponent(s.dataset.assegna), { consulente: s.value }); caricaGiorno(st.giorno); }
        catch (x) { alert(x.message); caricaGiorno(st.giorno); }
    }

    /* ================= registra ingresso ================= */
    function apriForm() {
        const ov = document.createElement('div');
        ov.className = 'sa-ov';
        const ordinati = st.consulenti.slice().sort((a, b) => ordStato(statoDi(a).stato) - ordStato(statoDi(b).stato));
        ov.innerHTML = `<div class="sa-modal" role="dialog" aria-modal="true" aria-label="Registra ingresso">
          <header><div><small>WALK-IN · ${dataOra(new Date().toISOString())}</small><h3>Registra ingresso</h3></div><button type="button" class="sa-x" data-chiudi aria-label="Chiudi">✕</button></header>
          <div class="sa-mbody">
            <div class="sa-row3">
              <label>Nome<input type="text" id="saNome" autocomplete="off"></label>
              <label>Cognome<input type="text" id="saCognome" autocomplete="off"></label>
              <label>Cellulare<input type="tel" id="saCell" autocomplete="off" inputmode="tel"></label>
            </div>
            <div class="sa-lbl">Vetture di cui chiede informazioni</div>
            <div id="saVett"></div>
            <button type="button" class="sa-btn2" data-addv>＋ Aggiungi vettura</button>
            <div class="sa-lbl">Assegna a un consulente (salone di Agnano) · prima i disponibili</div>
            <div id="saCons">${perReparto(ordinati).map(([k, l]) => `<div class="sa-rep-h sm">${REP[k].i} ${REP[k].t}</div><div class="sa-chips">${l.map(c => `<button type="button" class="sa-chip" data-c="${esc(c)}">${bollino(statoDi(c).stato)} ${esc(c)}</button>`).join('')}</div>`).join('')}</div>
            <label class="sa-full">Note (facoltative)<textarea id="saNote" rows="2"></textarea></label>
            <div class="sa-err" id="saErr"></div>
          </div>
          <footer><button type="button" class="sa-btn2" data-chiudi>Annulla</button><button type="button" class="sa-btn" data-salva>Registra e notifica</button></footer>
        </div>`;
        document.body.appendChild(ov);
        let cons = '';
        const vett = ov.querySelector('#saVett');
        const addV = () => { vett.appendChild(rigaVettura()); };
        addV();
        ov.querySelector('#saNome').focus();
        const chiudi = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = e => { if (e.key === 'Escape' && !ov.querySelector('.sa-dd.open')) chiudi(); };
        document.addEventListener('keydown', onKey);
        ov.addEventListener('click', async e => {
            if (e.target === ov || e.target.closest('[data-chiudi]')) { chiudi(); return; }
            if (e.target.closest('[data-addv]')) { addV(); return; }
            const c = e.target.closest('[data-c]');
            if (c) { cons = cons === c.dataset.c ? '' : c.dataset.c; ov.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x.dataset.c === cons)); return; }
            if (e.target.closest('[data-salva]')) {
                const body = {
                    nome: ov.querySelector('#saNome').value, cognome: ov.querySelector('#saCognome').value, cellulare: ov.querySelector('#saCell').value,
                    note: ov.querySelector('#saNote').value, consulente: cons,
                    vetture: [...vett.querySelectorAll('.sa-vrow')].map(r => ({ marca: r.querySelector('.sa-marca').value, modello: r.querySelector('.sa-modello').value }))
                };
                const err = ov.querySelector('#saErr');
                if (!body.nome.trim() && !body.cognome.trim()) { err.textContent = 'Scrivi almeno il nome o il cognome del cliente.'; return; }
                if (!cons && !confirm('Non hai scelto il consulente: registrare comunque? Potrai assegnarlo dopo dall\'elenco.')) return;
                const sc = cons ? statoDi(cons).stato : 'DISPONIBILE';
                if (sc !== 'DISPONIBILE' && !confirm(`${cons} risulta ${sc ? STATI[sc].t.toLowerCase() : 'non ancora in salone'}. Assegnare comunque?`)) return;
                const b = e.target.closest('[data-salva]'); b.disabled = true; b.textContent = 'Salvataggio…';
                try { await post('/ingressi', body); chiudi(); st.giorno = oggi(); st.mese = oggi().slice(0, 7); caricaGiorno(oggi()); toast(cons ? 'Registrato: notifica inviata a ' + cons : 'Ingresso registrato'); }
                catch (x) { err.textContent = x.message; b.disabled = false; b.textContent = 'Registra e notifica'; }
            }
        });
    }
    /* ================= NUOVO: modifica i dati di un walk-in (clic sulla scheda) ================= */
    function apriModifica(r) {
        const ov = document.createElement('div');
        ov.className = 'sa-ov';
        ov.innerHTML = `<div class="sa-modal" role="dialog" aria-modal="true" aria-label="Modifica ingresso">
          <header><div><small>WALK-IN · ${esc(dataOra(r.ora))}${r.consulente ? ' · ' + esc(r.consulente) : ''}</small><h3>Modifica i dati del cliente</h3></div><button type="button" class="sa-x" data-chiudi aria-label="Chiudi">✕</button></header>
          <div class="sa-mbody">
            <div class="sa-row3">
              <label>Nome<input type="text" id="saNome" autocomplete="off"></label>
              <label>Cognome<input type="text" id="saCognome" autocomplete="off"></label>
              <label>Cellulare<input type="tel" id="saCell" autocomplete="off" inputmode="tel"></label>
            </div>
            <div class="sa-lbl">Vetture di cui chiede informazioni</div>
            <div id="saVett"></div>
            <button type="button" class="sa-btn2" data-addv>＋ Aggiungi vettura</button>
            <label class="sa-full">Note<textarea id="saNote" rows="3" placeholder="Aggiungi una nota sul cliente…"></textarea></label>
            <div class="sa-err" id="saErr"></div>
          </div>
          <footer><button type="button" class="sa-btn2" data-chiudi>Annulla</button><button type="button" class="sa-btn" data-salva>Salva modifiche</button></footer>
        </div>`;
        document.body.appendChild(ov);
        const $ = q => ov.querySelector(q);
        $('#saNome').value = r.nome || ''; $('#saCognome').value = r.cognome || ''; $('#saCell').value = r.cellulare || ''; $('#saNote').value = r.note || '';
        const vett = $('#saVett');
        const addV = (v) => { const row = rigaVettura(); if (v) { row.querySelector('.sa-marca').value = v.marca || ''; row.querySelector('.sa-modello').value = v.modello || ''; } vett.appendChild(row); };
        (r.vetture && r.vetture.length ? r.vetture : [null]).forEach(addV);
        $('#saNome').focus();
        const chiudi = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = e => { if (e.key === 'Escape' && !ov.querySelector('.sa-dd.open')) chiudi(); };
        document.addEventListener('keydown', onKey);
        ov.addEventListener('click', async e => {
            if (e.target === ov || e.target.closest('[data-chiudi]')) { chiudi(); return; }
            if (e.target.closest('[data-addv]')) { addV(); return; }
            const b = e.target.closest('[data-salva]'); if (!b) return;
            const body = {
                data: r.data, nome: $('#saNome').value.trim(), cognome: $('#saCognome').value.trim(), cellulare: $('#saCell').value.trim(), note: $('#saNote').value.trim(),
                vetture: [...vett.querySelectorAll('.sa-vrow')].map(x => ({ marca: x.querySelector('.sa-marca').value, modello: x.querySelector('.sa-modello').value }))
            };
            if (!body.nome && !body.cognome) { $('#saErr').textContent = 'Scrivi almeno il nome o il cognome del cliente.'; return; }
            b.disabled = true; b.textContent = 'Salvataggio…';
            try { await post('/ingressi/' + encodeURIComponent(r.id), body); chiudi(); caricaGiorno(st.giorno); toast('Dati del cliente aggiornati'); }
            catch (x) { $('#saErr').textContent = x.message; b.disabled = false; b.textContent = 'Salva modifiche'; }
        });
    }
    const ordStato = s => ({ DISPONIBILE: 0, IN_PIAZZALE: 1, OCCUPATO: 2, TEST_DRIVE: 3, NON_DISPONIBILE: 4 }[s] ?? 5);
    // marchio: il solito menu a tendina con ricerca (elenco marchi del CRM)
    function rigaVettura() {
        const r = document.createElement('div');
        r.className = 'sa-vrow';
        r.innerHTML = `<div class="sa-dd"><input type="text" class="sa-marca" placeholder="Clicca o cerca marchio..." autocomplete="off"><div class="sa-dd-l"></div></div>
          <input type="text" class="sa-modello" placeholder="Modello (es. 208 1.2 PureTech)" autocomplete="off">
          <button type="button" class="sa-x" title="Togli questa vettura">✕</button>`;
        const inp = r.querySelector('.sa-marca'), dd = r.querySelector('.sa-dd'), list = r.querySelector('.sa-dd-l');
        const draw = () => {
            const q = inp.value.trim().toLowerCase();
            const L = marche().filter(m => !q || m.toLowerCase().includes(q));
            list.innerHTML = L.map(m => `<button type="button" data-m="${esc(m)}">${esc(m)}</button>`).join('') || '<div class="sa-hint" style="padding:8px 10px">Nessun marchio</div>';
        };
        inp.addEventListener('focus', () => { dd.classList.add('open'); draw(); });
        inp.addEventListener('input', () => { dd.classList.add('open'); draw(); });
        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); const f = list.querySelector('[data-m]'); if (f) { inp.value = f.dataset.m; dd.classList.remove('open'); r.querySelector('.sa-modello').focus(); } }
            if (e.key === 'Escape') dd.classList.remove('open');
        });
        list.addEventListener('mousedown', e => { const b = e.target.closest('[data-m]'); if (!b) return; e.preventDefault(); inp.value = b.dataset.m; dd.classList.remove('open'); r.querySelector('.sa-modello').focus(); });
        inp.addEventListener('blur', () => setTimeout(() => dd.classList.remove('open'), 120));
        r.querySelector('.sa-x').addEventListener('click', () => { const c = r.parentElement; if (c.children.length > 1) r.remove(); else { inp.value = ''; r.querySelector('.sa-modello').value = ''; } });
        return r;
    }

    /* ================= CONTROLLO DEI 15 MINUTI (solo ruolo Consulenza) =================
       15 minuti dopo la presa in carico di un walk-in, se il consulente e' ancora Occupato e nel frattempo
       non ha cambiato stato (nessun movimento: test drive, piazzale...), compare al centro:
       "Sono passati 15 minuti dall'inizio della consulenza, sei nuovamente disponibile?"
         No (rosso)        -> resta Occupato, la domanda torna tra 10 minuti
         Si' + 60 secondi  -> Disponibile; se non risponde nessuno, allo scadere diventa Disponibile da solo
       L'ora del controllo la tiene il server (controlloAt), quindi vale anche dopo un F5. */
    const Controllo = (function () {
        let aperto = null, visto = null;
        const consulenza = () => typeof currentUser !== 'undefined' && currentUser && ['CONSULENZA', 'NOLEGGIO'].includes(currentUser.role);
        function verifica() {
            const m = st.mio ? statoDi(st.mio) : null;
            const dovuto = consulenza() && m && m.stato === 'OCCUPATO' && m.controlloAt && Date.now() >= new Date(m.controlloAt).getTime();
            if (!dovuto) { if (aperto) chiudi(); return; }
            if (aperto || visto === m.controlloAt) return;
            visto = m.controlloAt;
            mostra(m);
        }
        function chiudi() { if (aperto) { clearInterval(aperto.t); aperto.ov.remove(); aperto = null; } }
        function mostra(m) {
            const ov = document.createElement('div');
            ov.className = 'sa-ov sa-ov-c sa-ctl-ov';
            const giaRinviato = m.rinvii > 0;
            ov.innerHTML = `<div class="sa-modal sa-ctl" role="alertdialog" aria-modal="true" aria-label="Sei nuovamente disponibile?">
                <div class="sa-ctl-i">⏱️</div>
                <h3>Sono passati ${giaRinviato ? 'altri 10 minuti' : '15 minuti dall\'inizio della consulenza'}</h3>
                <p>${m.cliente ? `Cliente: <b>${esc(m.cliente)}</b><br>` : ''}Sei nuovamente disponibile?</p>
                <div class="sa-ctl-b">
                  <button type="button" class="sa-ctl-no" data-no>No, ancora occupato</button>
                  <button type="button" class="sa-ctl-si" data-si>Sì, sono disponibile <span class="sa-ctl-t">60</span></button>
                </div>
                <small>Se non rispondi entro 60 secondi risulterai disponibile.</small>
              </div>`;
            document.body.appendChild(ov);
            beep();
            let resta = 60;
            const t = setInterval(() => {
                resta--;
                const el = ov.querySelector('.sa-ctl-t'); if (el) el.textContent = resta;
                ov.querySelector('.sa-ctl').style.setProperty('--p', (resta / 60 * 100) + '%');
                if (resta <= 0) rispondi('auto');
            }, 1000);
            aperto = { ov, t };
            ov.querySelector('[data-no]').addEventListener('click', () => rispondi('no'));
            ov.querySelector('[data-si]').addEventListener('click', () => rispondi('si'));
        }
        async function rispondi(c) {
            if (!aperto) return;
            chiudi();
            try {
                if (c === 'no') { const d = await post('/stati/rinvio'); st.stati = d.stati || st.stati; toast('Resti occupato: te lo richiedo tra 10 minuti'); }
                else { const d = await post('/stati', { stato: 'DISPONIBILE', controllo: c }); st.stati = d.stati || st.stati; toast(c === 'auto' ? 'Nessuna risposta: ora risulti disponibile' : 'Ora risulti disponibile'); }
                disegnaStati();
            } catch (e) { alert(e.message); }
        }
        return { verifica };
    })();

    /* ================= notifica al consulente ================= */
    let notifT = null;
    const visti = new Set();
    function avviaNotifiche() {
        if (notifT) return;
        const giro = async () => {
            if (!can()) return;
            try {
                const d = await api('/notifiche');
                const L = d.notifiche || [];
                Scheda.badge(L.length);                   // sulla scheda in alto: clienti che ti aspettano
                L.forEach(r => { const k = r.id + '|' + r.assegnatoAt; if (!visti.has(k)) { visti.add(k); mostraNotifica(r); } });
                // affidato a un altro consulente o arrivo annullato: la notifica sparisce
                document.querySelectorAll('#saNotif .sa-notif[data-id]').forEach(n => { if (!L.some(r => r.id === n.dataset.id)) { n.classList.add('via'); setTimeout(() => n.remove(), 300); } });
            } catch (e) { /* rete: si riprova */ }
        };
        giro(); notifT = setInterval(giro, 6000);
    }
    function beep() {
        try {
            const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
            const c = new C(), o = c.createOscillator(), g = c.createGain();
            o.type = 'sine'; o.frequency.value = 880; o.connect(g); g.connect(c.destination);
            g.gain.setValueAtTime(.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(.25, c.currentTime + .02); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + .6);
            o.start(); o.stop(c.currentTime + .62);
        } catch (e) { /* */ }
    }
    function mostraNotifica(r) {
        let box = document.getElementById('saNotif');
        if (!box) { box = document.createElement('div'); box.id = 'saNotif'; box.className = 'sa-notif-box'; document.body.appendChild(box); }
        const v = vettTxt(r);
        const n = document.createElement('div');
        n.className = 'sa-notif';
        n.dataset.id = r.id;
        const app = !!r.daApp, altro = app && r.consulentePrevisto && r.consulentePrevisto !== r.consulente;
        n.innerHTML = `<div class="sa-notif-h"><span class="sa-pulse"></span><small>${app ? (altro ? 'APPUNTAMENTO AFFIDATO A TE' : 'IL TUO APPUNTAMENTO È IN SEDE') : 'CLIENTE IN ARRIVO PER TE'} · ${ora(r.assegnatoAt)}</small></div>
          <b class="sa-notif-n">${esc(nomeCliente(r))}</b>
          ${app ? `<div class="sa-notif-app">📅 Appuntamento${r.appOra ? ' delle ' + esc(r.appOra) : ''}${altro ? ` di ${esc(r.consulentePrevisto)}` : ''} · <b>sta venendo alla tua scrivania</b></div>` : ''}
          ${r.cellulare ? `<div class="sa-notif-t">📞 ${esc(r.cellulare)}</div>` : ''}
          <div class="sa-notif-v">${v.length ? v.map(x => `<span>🚗 ${esc(x)}</span>`).join('') : '<span>Nessuna vettura indicata</span>'}</div>
          ${r.note && !app ? `<div class="sa-notif-note">📝 ${esc(r.note)}</div>` : ''}
          <div class="sa-notif-f">Ti è stato assegnato da ${esc(r.assegnatoDa || '')} · prendendolo in carico risulterai <b>Occupato</b></div>
          <button type="button" class="sa-btn">Prendo in carico ✓</button>`;
        n.querySelector('button').addEventListener('click', async ev => {
            const b = ev.currentTarget; b.disabled = true;
            try { await post('/ingressi/' + encodeURIComponent(r.id) + '/presa'); }
            catch (e) { b.disabled = false; alert(e.message); return; }
            n.classList.add('via'); setTimeout(() => n.remove(), 300);
            toast('Cliente preso in carico: ora risulti occupato');
            if (aperta) { caricaGiorno(st.giorno, true); caricaStati(); }
        });
        box.prepend(n);
        beep();
        try { if (window.Notification && Notification.permission === 'granted') new Notification('Cliente in arrivo: ' + nomeCliente(r), { body: v.join(', ') }); } catch (e) { /* */ }
    }

    /* =====================================================================
       APPUNTAMENTI
       ===================================================================== */
    async function caricaApp(g) {
        const A = st.app;
        A.giorno = g;
        try {
            const [d, m] = await Promise.all([api('/appuntamenti?data=' + g), api('/appuntamenti/giorni?mese=' + A.mese)]);
            A.lista = d.appuntamenti || []; A.info = d; A.puoGestire = !!d.puoGestire; A.io = d.mioConsulente || null; if (d.reparti) st.reparti = d.reparti; A.giorni = m.giorni || {}; A.daAss = m.daAssegnare || {};
            st.vedeTutti = !!d.vedeTutti; st.vedeReport = !!d.vedeReport; st.puoImportare = !!d.puoImportare; A.err = ''; A.caricato = true;
        } catch (e) { A.err = e.message; }
        if (st.tab === 'app') render();
    }
    const cliApp = r => [String(r.nome || '').replace(/^\.+$/, ''), r.cognome].filter(Boolean).join(' ') || r.ragioneSociale || 'Cliente';
    const vettApp = r => [r.marca && !/^marca generica$/i.test(r.marca) ? r.marca : '', r.modello && !/^[\s\/x.\-]*$/i.test(r.modello) ? r.modello : ''].filter(Boolean).join(' ');
    function renderApp(body) {
        const A = st.app;
        let L = A.lista.slice();
        if (A.filtro === '__da') L = L.filter(r => !r.consulente);
        else if (A.filtro === '__V') L = L.filter(r => r.reparto !== 'NOLEGGIO');
        else if (A.filtro === '__N') L = L.filter(r => r.reparto === 'NOLEGGIO');
        else if (A.filtro) L = L.filter(r => r.consulente === A.filtro);
        L.sort((a, b) => String(a.appOra || '99').localeCompare(String(b.appOra || '99')) * (A.verso === 'desc' ? -1 : 1));
        const perCons = {}; let da = 0;
        A.lista.forEach(r => { if (r.consulente) perCons[r.consulente] = (perCons[r.consulente] || 0) + 1; else da++; });
        const info = A.info || {};
        body.innerHTML = `
          ${A.err ? `<div class="sa-msg err">${esc(A.err)}</div>` : ''}
          ${!st.vedeTutti && A.io && A.giorno === oggi() && A.lista.some(r => !r.consulente && !r.arrivatoAt) ? (n => `<div class="sa-msg ok">📌 Oggi ${n === 1 ? 'c’è <b>1</b> appuntamento' : `ci sono <b>${n}</b> appuntamenti`} senza consulente: puoi prenotarl${n === 1 ? 'o' : 'i'} alla tua scrivania con <b>📌 Prenota alla mia scrivania</b>.</div>`)(A.lista.filter(r => !r.consulente && !r.arrivatoAt).length) : ''}
          ${st.vedeTutti && info.daAssegnareProssimi ? `<div class="sa-msg warn">⚠️ ${info.daAssegnareProssimi} appuntament${info.daAssegnareProssimi === 1 ? 'o' : 'i'} da oggi in poi ${info.daAssegnareProssimi === 1 ? 'è' : 'sono'} ancora <b>da assegnare</b> (il venditore nel CSV non è un consulente di Agnano). Puoi assegnarli tu con <b>👤 Assegna consulente</b> (anche nei giorni prima), oppure si aggiornano al prossimo import se il CSV indica un consulente di Agnano.</div>` : ''}
          <div class="sa-grid">
            <aside class="sa-side">
              <div class="sa-card">${calendario(A.mese, A.giorno, A.giorni, A.daAss, true)}
                <p class="sa-hint" style="margin:10px 0 0"><b class="sa-day-r sa-inl"></b> giorno con appuntamenti ${st.vedeTutti ? 'da assegnare' : 'senza consulente (solo oggi)'}</p></div>
              <div class="sa-card sa-sum">
                <h3>${st.vedeTutti ? 'Appuntamenti del giorno' : 'I tuoi appuntamenti del giorno'}</h3>
                <div class="sa-kpis"><div><b>${A.lista.length}</b><span>appuntamenti</span></div><div><b>${A.lista.length - da}</b><span>assegnati</span></div><div><b class="${da ? 'sa-red' : ''}">${da}</b><span>da assegnare</span></div></div>
                ${st.vedeTutti ? perReparto(st.consulenti).map(([k, l]) => `<div class="sa-rep-h sm">${REP[k].i} ${REP[k].t} <em>${A.lista.filter(r => (r.reparto || 'VENDITA') === k).length}</em></div>` + l.map(c => `<div class="sa-cons-row"><span>${esc(c)}</span><b>${perCons[c] || 0}</b></div>`).join('')).join('') : ''}
              </div>
              ${info.ultimoImport ? `<div class="sa-card sa-hint">Ultimo import: <b>${esc(info.ultimoImport.atIt)}</b> da ${esc(info.ultimoImport.chi)}${info.ultimoImport.file ? '<br>' + esc(info.ultimoImport.file) : ''}</div>` : ''}
            </aside>
            <section class="sa-main">
              <div class="sa-card">
                <div class="sa-list-h">
                  <div><h2>${esc(up1(giornoLungo(A.giorno)))}</h2><p>${L.length} appuntament${L.length === 1 ? 'o' : 'i'}${A.giorno === oggi() ? ' · oggi' : ''}${st.vedeTutti ? '' : A.giorno === oggi() ? ' · i tuoi e quelli di oggi senza consulente' : ' · solo i tuoi'}</p></div>
                  <div class="sa-list-a">
                    ${st.vedeTutti ? `<select class="sa-sel sa-sel-a" data-filtro><option value="">Tutti i consulenti</option><option value="__da" ${A.filtro === '__da' ? 'selected' : ''}>Solo da assegnare</option><option value="__V" ${A.filtro === '__V' ? 'selected' : ''}>🚗 Solo vendita</option><option value="__N" ${A.filtro === '__N' ? 'selected' : ''}>🔑 Solo noleggio</option>${perReparto(st.consulenti).map(([k, l]) => `<optgroup label="${REP[k].t}">` + l.map(c => `<option ${A.filtro === c ? 'selected' : ''}>${esc(c)}</option>`).join('') + '</optgroup>').join('')}</select>` : ''}
                    <button type="button" class="sa-btn2" data-aact="verso">${A.verso === 'asc' ? '⬆️ Dal primo orario' : '⬇️ Dall\'ultimo orario'}</button>
                    ${A.giorno !== oggi() ? '<button type="button" class="sa-btn2" data-aact="oggi">Oggi</button>' : ''}
                    ${st.puoImportare ? `<button type="button" class="sa-btn2" data-aact="storico">🕘 Storico import</button>
                      <label class="sa-btn sa-file">⬆ Importa CSV<input type="file" accept=".csv,text/csv" data-import hidden></label>` : ''}
                  </div>
                </div>
                <div class="sa-list">${L.length ? L.map(cardApp).join('') : `<div class="sa-none">${A.caricato ? 'Nessun appuntamento in questo giorno.' + (st.puoImportare && !info.ultimoImport ? ' Importa il CSV dei lead con “⬆ Importa CSV”.' : '') : 'Caricamento…'}</div>`}</div>
              </div>
            </section>
          </div>`;
    }
    function cardApp(r) {
        const v = vettApp(r);
        const dett = [r.origine, r.canale !== r.origine ? r.canale : '', r.tipoVeicolo, r.tipoRichiesta, Number(r.importo) > 0 ? '€ ' + Number(r.importo).toLocaleString('it-IT') : ''].filter(Boolean);
        const posseduta = [r.marcaPosseduta, r.modelloPosseduto, r.annoPosseduto, Number(r.kmPosseduto) > 0 ? Number(r.kmPosseduto).toLocaleString('it-IT') + ' km' : ''].filter(Boolean).join(' ');
        const arr = r.arrivo || null, preso = arr && arr.presoAt, accolto = r.accoltoDa || (arr && arr.consulente) || null;
        const oggiApp = r.appData === oggi(), gest = st.app.puoGestire;
        // orario gia' passato (giorni prima, o oggi a un'ora gia' passata): si puo' segnare "Cliente passato"
        const oraOra = F_ORA.format(new Date());
        const giaPassato = r.appData < oggi() || (oggiApp && !!r.appOra && r.appOra < oraOra);
        const mioArr = r.arrivatoAt && !preso && st.mio && accolto === st.mio && r.ingressoId;
        const blocco = r.passato ? `<div class="sa-arr ok">
              <span>✓ <b>Cliente passato</b>${r.appOra ? ' all’appuntamento delle ' + esc(r.appOra) : ''} · seguito da <b>${esc(accolto || '—')}</b></span>
              <small>Segnato dopo da ${esc(r.arrivatoDa || '')}${r.segnatoIt ? ' il ' + esc(r.segnatoIt.slice(0, 16)) : ''}</small></div>`
            : r.arrivatoAt ? `<div class="sa-arr ${preso ? 'ok' : 'wait'}">
              <span>${preso ? `✓ In sede dalle ${esc(ora(r.arrivatoAt))} · <b>preso in carico da ${esc(accolto)}</b> alle ${esc(ora(arr.presoAt))}${arr.liberoAt ? ` · seguito per ${esc(durata(arr.minutiCliente))}` : ''}`
                : `🏁 <b>Cliente in sede</b> dalle ${esc(ora(r.arrivatoAt))} · avvisato <b>${esc(accolto || '')}</b>: sta andando alla sua scrivania`}</span>
              ${accolto && r.consulente && accolto !== r.consulente ? `<small>Accolto da ${esc(accolto)} al posto di ${esc(r.consulente)}</small>` : ''}
              <small>Segnato da ${esc(r.arrivatoDa || '')}</small></div>` : '';
        const io = st.app.io, mioApp = io && (r.consulente === io || !r.consulente);
        const azioni = [
            !gest && io && !r.consulente && oggiApp && !r.arrivatoAt ? `<button type="button" class="sa-btn sa-pren-b" data-prenota="${esc(r.id)}">📌 Prenota alla mia scrivania</button>` : '',
            !gest && mioApp && giaPassato && !r.arrivatoAt ? `<button type="button" class="sa-btn sa-pass-b" data-pass-io="${esc(r.id)}" title="Il cliente è venuto ma non era stato segnato">✓ Cliente passato</button>` : '',
            !gest && io && r.passato && r.accoltoDa === io ? `<button type="button" class="sa-btn2 sa-x2" data-arr-annulla="${esc(r.id)}" title="Segnato per sbaglio">Annulla “passato”</button>` : '',
            gest && oggiApp && !r.arrivatoAt ? `<button type="button" class="sa-btn sa-arr-b" data-arr="${esc(r.id)}">🏁 Cliente in sede</button>` : '',
            gest && giaPassato && !r.arrivatoAt ? `<button type="button" class="sa-btn sa-pass-b" data-pass="${esc(r.id)}" title="Il cliente è venuto ma non era stato segnato">✓ Cliente passato</button>` : '',
            gest && !r.arrivatoAt ? (r.consulente ? `<button type="button" class="sa-link" data-assegna-app="${esc(r.id)}">✎ Cambia consulente</button>`
                : `<button type="button" class="sa-btn sa-ass-b" data-assegna-app="${esc(r.id)}">👤 Assegna consulente</button>`) : '',
            gest && r.passato ? `<button type="button" class="sa-btn2 sa-x2" data-arr-annulla="${esc(r.id)}" title="Segnato per sbaglio">Annulla “passato”</button>` : '',
            gest && r.arrivatoAt && !r.passato && !preso ? `<button type="button" class="sa-btn2" data-arr="${esc(r.id)}">↪ Affida a un altro</button><button type="button" class="sa-btn2 sa-x2" data-arr-annulla="${esc(r.id)}" title="Segnato per sbaglio: togli l'arrivo">Annulla arrivo</button>` : '',
            mioArr ? `<button type="button" class="sa-btn" data-presa-app="${esc(r.ingressoId)}">Prendo in carico ✓</button>` : ''
        ].join('');
        const evid = r.passato ? 'passato' : preso ? 'arrivato preso' : r.arrivatoAt ? 'arrivato' : '';
        // evidenziati (colore) solo quando il cliente e' in sede, seguito o passato; gli altri restano neutri
        return `<article class="sa-in sa-app ${preso || r.passato ? 'preso' : r.arrivatoAt ? 'att' : r.consulente ? 'neutro' : 'nuovo da'} ${evid}">
            <div class="sa-in-t"><b>${esc(r.appOra || '—')}</b>${r.passato ? '<i class="sa-badge pas">PASSATO</i>' : r.arrivatoAt ? `<i class="sa-badge ${preso ? 'pre' : 'sed'}">${preso ? 'SEGUITO' : 'IN SEDE'}</i>` : ''}${r.fonteData === 'Note' ? '<small title="Orario letto dalle note del lead">dalle note</small>' : ''}</div>
            <div class="sa-in-c">
              <div class="sa-in-n">${esc(cliApp(r))}${r.telefono ? ` <a href="tel:${esc(r.telefono.replace(/\s/g, ''))}" class="sa-tel">📞 ${esc(r.telefono)}</a>` : ''}</div>
              <div class="sa-in-v">${tagNol(r.reparto)}${v ? `<span class="sa-car">🚗 ${esc(v)}</span>` : ''}${posseduta ? `<span class="sa-car perm">🔁 Permuta: ${esc(posseduta)}</span>` : ''}${dett.map(x => `<span class="sa-tag">${esc(x)}</span>`).join('')}${st.puoImportare && (r.controllo === 'modificato' || r.controllo === 'forzato') ? `<span class="sa-tag sa-tag-w" title="${esc(r.avviso || '')}">${r.controllo === 'modificato' ? '✎ data modificata all’import' : '⚠ inserito senza i campi allineati'}</span>` : ''}</div>
              ${r.note ? `<details class="sa-in-note"><summary>📝 Note del lead</summary><div>${esc(r.note)}</div></details>` : ''}
              <div class="sa-in-f">Lead ${esc(r.id)} · inserito ${esc(r.dataInserimento || '')}${r.inseritoDa ? ' da ' + esc(r.inseritoDa) : ''}${r.caller ? ' · caller ' + esc(r.caller.replace(/\s*\(ID \d+\)/, '')) : ''}</div>
              ${blocco}
            </div>
            <div class="sa-in-a">
              ${r.consulente ? `<b class="sa-cons">${bollinoVivo(r.consulente)} ${esc(r.consulente)}</b>${r.consulenteMano ? `<span class="sa-hint" title="${r.prenotato ? 'Prenotato' : 'Assegnato'} da ${esc(r.assegnatoManoDa || '')} il ${esc(r.assegnatoManoIt || '')}">${r.prenotato ? '📌 prenotato alle ' + esc(String(r.assegnatoManoIt || '').slice(11, 16)) : '✎ scelto a mano'}${r.venditore ? ' · nel CSV: ' + esc(r.venditore) : ''}</span>` : ''}${oggiApp && !r.arrivatoAt ? `<span class="sa-hint" data-sd="${esc(r.consulente)}"><small class="sa-sd-t">${esc(testoStato(statoDi(r.consulente)))}</small></span>` : ''}` : `<span class="sa-st no">Da assegnare</span>${r.venditore ? `<span class="sa-hint">Nel CSV: ${esc(r.venditore)}</span>` : ''}`}
              ${azioni}
            </div>
          </article>`;
    }
    async function onClickApp(e) {
        const A = st.app;
        const g = e.target.closest('[data-giorno]'); if (g) { caricaApp(g.dataset.giorno); return true; }
        const m = e.target.closest('[data-mese]'); if (m) { A.mese = spostaMese(A.mese, Number(m.dataset.mese)); caricaApp(A.giorno); return true; }
        const ar = e.target.closest('[data-arr]');
        if (ar) { const r = A.lista.find(x => String(x.id) === ar.dataset.arr); if (r) apriArrivo(r, 'sede'); return true; }
        const ps = e.target.closest('[data-pass]');
        if (ps) { const r = A.lista.find(x => String(x.id) === ps.dataset.pass); if (r) apriArrivo(r, 'passato'); return true; }
        const pr = e.target.closest('[data-prenota]');
        if (pr) {
            const r = A.lista.find(x => String(x.id) === pr.dataset.prenota);
            if (!r || !confirm(`Prenotare ${cliApp(r)}${r.appOra ? ' (ore ' + r.appOra + ')' : ''} alla tua scrivania?\nDiventa un tuo appuntamento: quando arriva riceverai la notifica.`)) return true;
            try { await post('/appuntamenti/' + encodeURIComponent(r.id) + '/consulente', { consulente: A.io }); toast('Prenotato: ora è un tuo appuntamento'); }
            catch (x) { alert(x.message); }
            caricaApp(A.giorno); return true;
        }
        const pi = e.target.closest('[data-pass-io]');
        if (pi) {
            const r = A.lista.find(x => String(x.id) === pi.dataset.passIo);
            if (!r || !confirm(`Segnare ${cliApp(r)} come cliente passato, seguito da te?\nNon parte nessuna notifica.`)) return true;
            try { await post('/appuntamenti/' + encodeURIComponent(r.id) + '/arrivato', { passato: true, consulente: A.io }); toast('Segnato come passato'); }
            catch (x) { alert(x.message); }
            caricaApp(A.giorno); return true;
        }
        const as = e.target.closest('[data-assegna-app]');
        if (as) { const r = A.lista.find(x => String(x.id) === as.dataset.assegnaApp); if (r) apriArrivo(r, 'assegna'); return true; }
        const an = e.target.closest('[data-arr-annulla]');
        if (an) {
            const r = A.lista.find(x => String(x.id) === an.dataset.arrAnnulla);
            if (!r || !confirm(r.passato ? `Togliere “cliente passato” da ${cliApp(r)}?` : `Togliere l'arrivo di ${cliApp(r)}?\n${r.accoltoDa ? r.accoltoDa + ' non vedrà più la notifica.' : ''}`)) return true;
            try { await post('/appuntamenti/' + encodeURIComponent(r.id) + '/arrivato', { annulla: true }); toast('Arrivo tolto'); caricaApp(A.giorno); } catch (x) { alert(x.message); }
            return true;
        }
        const pa = e.target.closest('[data-presa-app]');
        if (pa) {
            try { await post('/ingressi/' + encodeURIComponent(pa.dataset.presaApp) + '/presa');
                document.querySelectorAll('#saNotif .sa-notif').forEach(n => { if (n.dataset.id === pa.dataset.presaApp) n.remove(); });
                toast('Cliente preso in carico: ora risulti occupato'); caricaApp(A.giorno); caricaStati(); }
            catch (x) { alert(x.message); }
            return true;
        }
        const a = e.target.closest('[data-aact]');
        if (a) {
            if (a.dataset.aact === 'verso') { A.verso = A.verso === 'asc' ? 'desc' : 'asc'; render(); }
            if (a.dataset.aact === 'oggi') { A.mese = oggi().slice(0, 7); caricaApp(oggi()); }
            if (a.dataset.aact === 'storico') apriStorico();
            return true;
        }
        return false;
    }
    function onChangeApp(e) {
        const f = e.target.closest('[data-filtro]'); if (f) { st.app.filtro = f.value; render(); return; }
        const i = e.target.closest('[data-import]');
        if (i && i.files && i.files[0]) { const f = i.files[0]; i.value = ''; importaCsv(f); }   // value = '': si puo' riscegliere lo stesso file
    }

    /* ---------- CLIENTE DELL'APPUNTAMENTO IN SEDE ----------
       Si apre con "🏁 Cliente in sede" (o "↪ Affida a un altro"). In alto lo stato del consulente
       dell'appuntamento in tempo reale: se e' disponibile basta avvisarlo; se e' occupato / non disponibile /
       non in salone la finestra lo dice e propone chi e' disponibile in questo momento.
       Il consulente scelto riceve la notifica "sta venendo alla tua scrivania" (come i walk-in). */
    /* modo:  'sede'     cliente arrivato adesso -> notifica al consulente scelto
              'passato'  appuntamento gia' passato, nessuno l'aveva segnato -> solo registrato, nessuna notifica
              'assegna'  scegliere (anche in anticipo) il consulente di un appuntamento */
    async function apriArrivo(r, modo) {
        modo = modo || 'sede';
        await caricaStati();
        const live = modo === 'sede' || (modo === 'assegna' && r.appData === oggi());   // gli stati contano solo oggi
        const previsto = r.accoltoDa || r.consulente || null;
        const giaArrivato = modo === 'sede' && !!r.arrivatoAt;
        const disp = c => statoDi(c).stato === 'DISPONIBILE';
        const repApp = r.reparto || 'VENDITA', stessoRep = n => repDi(n) === repApp ? 0 : 1;
        const elenco = st.consulenti.slice().sort((a, b) => stessoRep(a) - stessoRep(b) || live
            ? ordStato(statoDi(a).stato) - ordStato(statoDi(b).stato) || a.localeCompare(b)
            : (b === r.consulente) - (a === r.consulente) || a.localeCompare(b));
        let scelto;
        if (modo === 'sede') { const liberi = elenco.filter(c => disp(c) && c !== previsto && repDi(c) === repApp); scelto = !giaArrivato && previsto && disp(previsto) ? previsto : (liberi[0] || (giaArrivato ? '' : previsto) || ''); }
        else if (modo === 'passato') scelto = r.consulente || '';
        else scelto = '';
        const titolo = { sede: giaArrivato ? 'AFFIDA A UN ALTRO CONSULENTE' : 'CLIENTE IN SEDE', passato: 'CLIENTE PASSATO', assegna: r.consulente ? 'CAMBIA CONSULENTE' : 'ASSEGNA IL CONSULENTE' }[modo];
        const ov = document.createElement('div'); ov.className = 'sa-ov';
        ov.innerHTML = `<div class="sa-modal sa-arr-m" role="dialog" aria-modal="true" aria-label="${esc(titolo)}">
            <header><div><small>APPUNTAMENTO ${r.appData !== oggi() ? 'DEL ' + esc(gm({ data: r.appData }).toUpperCase()) + ' ' : ''}${r.appOra ? 'DELLE ' + esc(r.appOra) : ''} · ${titolo}</small><h3>${esc(cliApp(r))}</h3></div>
              <button type="button" class="sa-x" data-chiudi aria-label="Chiudi">✕</button></header>
            <div class="sa-mbody" data-z="corpo"></div>
            <footer data-z="piede"></footer></div>`;
        document.body.appendChild(ov);
        const chiudi = () => { ov.remove(); document.removeEventListener('keydown', onKey); clearInterval(t); };
        const onKey = e => { if (e.key === 'Escape') chiudi(); };
        document.addEventListener('keydown', onKey);
        function avvisoSede() {
            const sp = previsto ? statoDi(previsto) : null, ok = previsto && disp(previsto);
            const libNow = elenco.filter(c => disp(c) && c !== previsto && repDi(c) === repApp);
            return !previsto
                ? `<div class="sa-msg warn">Questo appuntamento non ha ancora un consulente: scegli chi accoglie il cliente.</div>`
                : giaArrivato ? `<div class="sa-msg">Ora è affidato a <b>${esc(previsto)}</b> (${esc(min1(testoStato(sp)))}). Scegli a chi passarlo: riceverà subito la notifica.</div>`
                : ok ? `<div class="sa-msg ok">✓ <b>${esc(previsto)}</b> è disponibile: riceverà la notifica che il cliente sta andando alla sua scrivania.</div>`
                : `<div class="sa-msg warn">⚠ <b>${esc(previsto)}</b> risulta <b>${esc(min1(testoStato(sp)))}</b>. Vuoi farlo accomodare da un altro consulente?
                    ${libNow.length ? `<br>Disponibil${libNow.length === 1 ? 'e' : 'i'} in questo momento: <b>${libNow.map(esc).join(', ')}</b>` : '<br>In questo momento nessun consulente risulta disponibile.'}</div>`;
        }
        function disegna() {
            const sp = previsto ? statoDi(previsto) : null;
            const avviso = modo === 'sede' ? avvisoSede()
                : modo === 'passato' ? `<div class="sa-msg">Segna che il cliente <b>è venuto all’appuntamento</b> anche se non era stato segnato sul momento. Non parte nessuna notifica: scegli solo chi l’ha seguito.</div>`
                : `<div class="sa-msg">Scegli chi seguirà questo appuntamento${r.consulente ? ` (ora: <b>${esc(r.consulente)}</b>${r.consulenteMano ? ', scelto a mano' : ', dal CSV'})` : ''}. La scelta resta anche dopo i prossimi import, a meno che il file non indichi un altro consulente di Agnano.</div>`;
            const testo = c => live ? testoStato(statoDi(c)) : (c === r.consulente ? (r.consulenteMano ? 'scelto a mano' : 'dal CSV') : '');
            ov.querySelector('[data-z="corpo"]').innerHTML = `${avviso}
              ${modo === 'sede' && previsto ? `<div class="sa-arr-prev ${sp.stato && STATI[sp.stato] ? STATI[sp.stato].c : 'vuoto'}">${bollino(sp.stato, true)}<div><small>${giaArrivato ? 'ORA AFFIDATO A' : 'CONSULENTE DELL’APPUNTAMENTO'}</small><b>${esc(previsto)}</b><span>${esc(testoStato(sp))}</span></div></div>` : ''}
              <div class="sa-lbl">${modo === 'passato' ? 'Chi ha seguito il cliente' : modo === 'assegna' ? 'Consulente' + (live ? ' · prima i disponibili' : '') : 'Chi accoglie il cliente · prima i disponibili'}</div>
              <div class="sa-arr-l">${elenco.map(c => { const s2 = statoDi(c); return `<button type="button" class="sa-arr-c ${c === scelto ? 'on' : ''} ${!live || disp(c) ? 'libero' : ''}" data-scegli="${esc(c)}" aria-pressed="${c === scelto}">
                  ${live ? bollino(s2.stato) : '<span class="sa-arr-i">👤</span>'}<span><b>${esc(c)}${c === r.consulente ? ' <em>· appuntamento</em>' : ''}${repDi(c) !== repApp ? ` <em class="sa-altro">· ${REP[repDi(c)].t.toLowerCase()}</em>` : ''}</b>${testo(c) ? `<small>${esc(testo(c))}</small>` : ''}</span></button>`; }).join('')}</div>`;
            let lab;
            if (!scelto) lab = 'Scegli il consulente';
            else if (modo === 'passato') lab = 'Segna passato · seguito da ' + esc(scelto);
            else if (modo === 'assegna') lab = (live && !disp(scelto) ? 'Assegna comunque a ' : 'Assegna a ') + esc(scelto);
            else lab = (scelto === r.consulente && !giaArrivato ? (disp(scelto) ? 'Avvisa ' : 'Avvisa comunque ') : (disp(scelto) ? 'Affida a ' : 'Affida comunque a ')) + esc(scelto)
                + (!disp(scelto) ? ` <small>(${esc(STATI[statoDi(scelto).stato] ? STATI[statoDi(scelto).stato].t.toLowerCase() : 'non in salone')})</small>` : '');
            const stesso = scelto && ((modo === 'sede' && giaArrivato && scelto === previsto) || (modo === 'assegna' && scelto === r.consulente));
            ov.querySelector('[data-z="piede"]').innerHTML = `${modo === 'assegna' && r.consulenteMano ? '<button type="button" class="sa-btn2 sa-arr-csv" data-csv>↺ Torna a quello del CSV</button>' : ''}
              <button type="button" class="sa-btn2" data-chiudi>Annulla</button>
              <button type="button" class="sa-btn" data-invia ${scelto && !stesso ? '' : 'disabled'}>${lab}</button>`;
        }
        disegna();
        const t = setInterval(() => { if (document.body.contains(ov) && live) disegna(); }, 5000);   // stati sempre aggiornati
        ov.addEventListener('click', async e => {
            if (e.target === ov || e.target.closest('[data-chiudi]')) { chiudi(); return; }
            const c = e.target.closest('[data-scegli]'); if (c) { scelto = c.dataset.scegli; disegna(); return; }
            const csv = e.target.closest('[data-csv]');
            const b = csv || e.target.closest('[data-invia]'); if (!b || (!scelto && !csv)) return;
            b.disabled = true; b.textContent = 'Salvataggio…';
            try {
                const base = '/appuntamenti/' + encodeURIComponent(r.id);
                if (modo === 'assegna') await post(base + '/consulente', { consulente: csv ? '' : scelto });
                else await post(base + '/arrivato', modo === 'passato' ? { consulente: scelto, passato: true } : { consulente: scelto });
                chiudi();
                toast(modo === 'sede' ? `${cliApp(r)}: notifica inviata a ${scelto}` : modo === 'passato' ? `${cliApp(r)}: segnato come passato` : csv ? 'Tornato al consulente del CSV' : `${cliApp(r)}: assegnato a ${scelto}`);
                caricaApp(st.app.giorno);
            } catch (x) { alert(x.message); disegna(); }
        });
    }

    /* ---------- import CSV (solo admin) ---------- */
    // intestazioni del CSV dei lead -> nomi dei campi che manda al server
    const COLONNE = {
        'ID': 'id', 'Tipo': 'tipo', 'Origine': 'origine', 'Canale': 'canale', 'Cognome': 'cognome', 'Nome': 'nome', 'Ragione sociale': 'ragioneSociale',
        'E-mail 1': 'email', 'Telefono 1': 'telefono', 'Telefono 2': 'telefono2', 'Venditore': 'venditore', 'Caller': 'caller', 'Marca': 'marca', 'Modello': 'modello',
        'Importo': 'importo', 'Tipo richiesta': 'tipoRichiesta', 'Tipo veicolo richiesto': 'tipoVeicolo', 'Data inserimento': 'dataInserimento', 'Inserito da': 'inseritoDa',
        'Data lead': 'dataLead', 'Esito alert': 'esitoAlert', 'Esito ultima attività': 'esitoAttivita', 'Data ricontatto': 'dataRicontatto', 'Status': 'status', 'Note': 'note',
        'Città': 'citta', 'Provincia': 'provincia', 'Sede': 'sede', 'Team': 'team', 'Etichette Lead': 'etichetteLead', 'Marca Posseduta': 'marcaPosseduta',
        'Modello Posseduto': 'modelloPosseduto', 'Km': 'kmPosseduto', 'Anno Immatricolazione': 'annoPosseduto', 'Formula di Acquisto': 'formulaAcquisto'
    };
    function leggiTesto(buf) {
        try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
        catch (e) { return new TextDecoder('windows-1252').decode(buf); }
    }
    /* CSV con ; (o ,) e virgolette, anche con a capo dentro le note */
    function parseCsv(txt) {
        txt = txt.replace(/^﻿/, '');
        const primaRiga = (txt.split(/\r?\n/).find(l => /\bID\b/.test(l) && /Venditore/i.test(l)) || '');
        const sep = (primaRiga.match(/;/g) || []).length >= (primaRiga.match(/,/g) || []).length ? ';' : ',';
        const rows = []; let row = [], f = '', q = false;
        for (let i = 0; i < txt.length; i++) {
            const ch = txt[i];
            if (q) {
                if (ch === '"') { if (txt[i + 1] === '"') { f += '"'; i++; } else q = false; }
                else f += ch;
            } else if (ch === '"') q = true;
            else if (ch === sep) { row.push(f); f = ''; }
            else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
            else f += ch;
        }
        if (f || row.length) { row.push(f); rows.push(row); }
        const h = rows.findIndex(r => r.some(c => c.trim().replace(/^﻿/, '') === 'ID') && r.some(c => c.trim() === 'Venditore'));
        if (h < 0) throw new Error('Non trovo le colonne "ID" e "Venditore": è il CSV dei lead?');
        const head = rows[h].map(c => c.trim().replace(/^﻿/, ''));
        const out = [];
        for (const r of rows.slice(h + 1)) {
            if (r.length < 3 || !r.some(c => c.trim())) continue;
            const o = {};
            head.forEach((k, i) => { if (COLONNE[k]) o[COLONNE[k]] = (r[i] || '').trim(); });
            if (o.id) out.push(o);
        }
        return out;
    }
    async function importaCsv(file) {
        let righe;
        try { righe = parseCsv(leggiTesto(await file.arrayBuffer())); }
        catch (e) { alert('File non letto: ' + e.message); return; }
        if (!righe.length) { alert('Il file non contiene lead.'); return; }
        const lab = root.querySelector('.sa-file'); if (lab) lab.classList.add('busy');
        // periodo del file (dal primo all'ultimo appuntamento): serve per trovare quelli SPARITI dal file
        const date = righe.filter(r => !fuoriSede(r)).map(r => { const c = controlla(r); return c.prop && c.prop.data; }).filter(Boolean).sort();
        let ant = {};
        try {
            ant = await post('/appuntamenti/anteprima', { ids: righe.map(r => r.id), venditori: [...new Set(righe.map(r => r.venditore || ''))],
                da: date[0] || '', a: date[date.length - 1] || '' });
        } catch (e) { ant = { errore: e.message }; }
        if (lab) lab.classList.remove('busy');
        apriControllo(file.name, righe, ant || {});
    }

    /* ---------- controllo prima dell'import ----------
       Un lead e' un appuntamento ALLINEATO quando:
         Esito alert            = "Pianifica: Appuntamento gg/mm/aaaa hh:mm"
         Esito ultima attivita' = APPUNTAMENTO
         Data ricontatto        = stessa data e stessa ora dell'alert
       Gli altri si controllano a mano: Salta, Modifica (data e ora) o Inserisci comunque.
       Prima si scelgono i giorni (o il periodo) da importare. */
    const RE_ALERT = /pianifica\s*:\s*appuntamento\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2})[:.](\d{2}))?/i;
    const RE_NOTE = /\bapp(?:untamento)?\.?\s*(?:il\s+)?(?:del\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s*(?:alle\s+)?(?:ore\s+)?(?:h\s*)?\(?\s*(\d{1,2})[:.](\d{2}))?/gi;
    const RE_NOTE_SEDE = /\bapp(?:untamento)?\.?[^.\n]{0,40}?\b(salerno|nola)\b/i;
    function isoDi(g, m, a, base) {
        let y = a ? Number(a) : base; if (y < 100) y += 2000;
        const d = new Date(Date.UTC(y, Number(m) - 1, Number(g)));
        return d.getUTCDate() === Number(g) && d.getUTCMonth() === Number(m) - 1 ? d.toISOString().slice(0, 10) : null;
    }
    const oraDi = (h, m) => h == null || h === '' ? null : (Number(h) < 24 && Number(m) < 60 ? pad(Number(h)) + ':' + m : null);
    function dataDelCsv(s) {               // "15/10/26 11:30" -> { data: '2026-10-15', ora: '11:30' }
        const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
        const data = m && isoDi(m[1], m[2], m[3]);
        return data ? { data, ora: oraDi(m[4], m[5]) } : null;
    }
    const gm = x => x ? x.data.slice(8, 10) + '/' + x.data.slice(5, 7) + (x.ora ? ' ' + x.ora : '') : '—';
    const corto = (s, n) => (s = String(s || '')).length > n ? s.slice(0, n - 1) + '…' : s;
    const senzaAccenti = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    /* stesso controllo del server: la riga NON e' di Agnano (null = va bene) */
    function fuoriSede(r) {
        const sede = senzaAccenti(String(r.sede || '').replace(/\./g, ' ')).trim();
        if (sede.includes('nola')) return 'Sede Nola';
        if (sede.includes('salerno')) return 'Sede Salerno';
        if (!sede.replace(/\s/g, '').includes('autoscala')) return sede ? 'Sede diversa: ' + r.sede : 'Sede vuota';
        const m = String(r.note || '').match(RE_NOTE_SEDE);
        return m ? 'Appuntamento a ' + (/^n/i.test(m[1]) ? 'Nola' : 'Salerno') + ' (scritto nelle note)' : null;
    }
    function controlla(r) {
        const ins = dataDelCsv(r.dataInserimento);
        const base = Number((ins ? ins.data : oggi()).slice(0, 4));
        const alertTxt = String(r.esitoAlert || '').trim(), att = String(r.esitoAttivita || '').trim().toUpperCase();
        const ric = dataDelCsv(r.dataRicontatto);
        const ma = alertTxt.match(RE_ALERT);
        const al = ma && isoDi(ma[1], ma[2], ma[3], base) ? { data: isoDi(ma[1], ma[2], ma[3], base), ora: oraDi(ma[4], ma[5]) } : null;
        const pb = [], bad = {};
        if (!alertTxt) { pb.push('Esito alert vuoto'); bad.alert = 1; }
        else if (!al) { pb.push('L’Esito alert non è “Pianifica: Appuntamento”'); bad.alert = 1; }
        else if (!al.ora) { pb.push('Nell’Esito alert manca l’orario'); bad.alert = 1; }
        if (att !== 'APPUNTAMENTO') { pb.push(att ? `Esito ultima attività: ${att} (non APPUNTAMENTO)` : 'Esito ultima attività vuoto'); bad.att = 1; }
        if (!ric) { pb.push('Data ricontatto vuota'); bad.ric = 1; }
        else if (al && (ric.data !== al.data || (ric.ora || '') !== (al.ora || ''))) {
            pb.push(`Data ricontatto ${gm(ric)} diversa dall’alert ${gm(al)}`); bad.ric = 1; bad.alert = 1;
        }
        // data proposta: Data ricontatto, poi Esito alert, poi le note ("app. 15/10 16:30")
        let prop = null;
        if (ric) prop = { data: ric.data, ora: ric.ora === '00:00' ? null : ric.ora, fonte: 'Data ricontatto' };
        else if (al) prop = { data: al.data, ora: al.ora, fonte: 'Esito alert' };
        else {
            const re = new RegExp(RE_NOTE.source, 'gi'); let n;
            while ((n = re.exec(String(r.note || '')))) {
                let d = isoDi(n[1], n[2], n[3], base); if (!d) continue;
                if (!n[3] && ins) { const lim = new Date(ins.data + 'T12:00:00Z'); lim.setUTCDate(lim.getUTCDate() - 60); if (d < lim.toISOString().slice(0, 10)) d = (Number(d.slice(0, 4)) + 1) + d.slice(4); }
                prop = { data: d, ora: oraDi(n[4], n[5]), fonte: 'Note' };   // vale l'ultimo scritto
            }
        }
        return { ok: !pb.length, problemi: pb, bad, prop, al, ric };
    }

    /* La finestra "Controlla l'import". Sezioni:
         1 Giorni da importare
         2 Da controllare   -> righe non allineate: Salta / Modifica / Inserisci comunque (+ Togli dal calendario se era gia' in archivio)
         3 Cambiati         -> gia' in archivio e nel file qualcosa e' diverso: Aggiorna / Tieni com'era / Togli dal calendario
         4 Spariti          -> erano in archivio in quei giorni ma nel file non ci sono piu' (o ora sono di Nola/Salerno): Tieni / Togli
       Le scelte restano nella pagina finche' non premi "Importa". */
    const AZ_CTRL = [['salta', '⏭ Salta'], ['modifica', '✎ Modifica'], ['forza', '➕ Inserisci comunque'], ['togli', '✕ Togli dal calendario']];
    const AZ_AGG = [['aggiorna', '✓ Aggiorna'], ['tieni', '↺ Tieni com’era'], ['togli', '✕ Togli dal calendario']];
    const AZ_SPAR = [['tieni', '↺ Tieni nel calendario'], ['togli', '✕ Togli dal calendario']];
    const dueOra = (d, o) => d ? gm({ data: d, ora: o || null }) : '';
    function apriControllo(nomeFile, righe, ant) {
        const esistenti = ant.esistenti || {}, consulenti = ant.consulenti || {};
        const visti = new Set(), V = [], spariti = [];
        righe.forEach(r => {
            if (visti.has(r.id)) return; visti.add(r.id);
            const sede = fuoriSede(r), pr = esistenti[r.id] || null;
            if (sede) {
                // era un appuntamento di Agnano e ora il file lo da' a un'altra sede: e' come se fosse sparito
                if (pr) spariti.push({ id: r.id, cliente: cliApp(r), pr, motivo: 'Ora nel file risulta: ' + sede, azione: 'tieni', giorno: pr.appData || '' });
                V.push({ r, sede }); return;
            }
            const c = controlla(r);
            const v = { r, c, pr, azione: 'salta', agg: 'aggiorna', data: c.prop ? c.prop.data : '', ora: (c.prop && c.prop.ora) || '' };
            if (!c.ok && pr && (pr.controllo === 'modificato' || pr.controllo === 'forzato') && pr.esitoAlert === String(r.esitoAlert || '')
                && pr.esitoAttivita === String(r.esitoAttivita || '') && pr.dataRicontatto === String(r.dataRicontatto || '')) {
                v.azione = pr.controllo === 'modificato' ? 'modifica' : 'forza'; v.ricordo = true;
                if (pr.controllo === 'modificato') { v.data = pr.appData || ''; v.ora = pr.appOra || ''; }
            }
            v.giorno = v.data;
            V.push(v);
        });
        (ant.nelPeriodo || []).forEach(x => spariti.push({ id: x.id, cliente: x.cliente, pr: x, motivo: 'Nel nuovo file non c’è più', azione: 'tieni', giorno: x.appData || '' }));
        const agn = V.filter(v => !v.sede), scart = V.filter(v => v.sede);

        // giorni: quelli del file + quelli in cui qualcosa e' sparito
        const giorni = {};
        const G = g => giorni[g] || (giorni[g] = { n: 0, w: 0, s: 0 });
        agn.forEach(v => { const g = G(v.giorno); g.n++; if (!v.c.ok) g.w++; });
        spariti.forEach(s => { G(s.giorno).s++; });
        const chiavi = Object.keys(giorni).sort((a, b) => (a || '9999').localeCompare(b || '9999'));
        const sel = new Set(chiavi);
        const date = chiavi.filter(Boolean);
        // un lead gia' in archivio conta se e' scelto il giorno NUOVO oppure quello VECCHIO (appuntamento spostato)
        const inSel = v => !v.sede && (sel.has(v.giorno) || !!(v.pr && v.pr.appData && sel.has(v.pr.appData)));
        const spSel = s => sel.has(s.giorno);

        /* cosa cambia rispetto all'archivio: stesse voci dello storico degli import */
        function nuovoApp(v) {
            if (v.c.ok) return { data: v.data, ora: v.ora };
            if (v.azione === 'modifica') return v.data ? { data: v.data, ora: v.ora } : null;
            return v.c.prop;      // inserisci comunque (o la data che userebbe)
        }
        function cambi(v) {
            const p = v.pr, r = v.r; if (!p) return [];
            const out = [], add = (campo, prima, dopo) => { if (String(prima || '') !== String(dopo || '')) out.push({ campo, prima: prima || '', dopo: dopo || '' }); };
            const a = nuovoApp(v);
            add('Appuntamento', dueOra(p.appData, p.appOra), a ? dueOra(a.data, a.ora) : '');
            const dalFile = Object.prototype.hasOwnProperty.call(consulenti, r.venditore || '') ? consulenti[r.venditore || ''] : p.consulente;
            // scelto a mano nel CRM: resta, a meno che il file non indichi un ALTRO consulente di Agnano (come fa il server)
            const cons = p.consulenteMano && (!dalFile || dalFile === p.consulenteMano) ? p.consulenteMano : dalFile;
            add('Consulente', p.consulente || 'Da assegnare', cons || 'Da assegnare');
            add('Venditore nel CSV', p.venditore, r.venditore);
            add('Status', p.status, r.status);
            add('Esito alert', p.esitoAlert, r.esitoAlert);
            add('Esito ultima attività', p.esitoAttivita, r.esitoAttivita);
            add('Data ricontatto', p.dataRicontatto, r.dataRicontatto);
            add('Telefono', p.telefono, r.telefono);
            add('Vettura', p.vettura, [r.marca, r.modello].filter(Boolean).join(' ').trim());
            if (String(p.note || '') !== String(r.note || '')) out.push({ campo: 'Note', prima: '', dopo: 'aggiunte o cambiate', nota: true });
            return out;
        }
        const tabCambi = L => L.length ? `<div class="sa-ck-diff">${L.map(x => `<div><small>${esc(x.campo)}</small>${x.nota ? `<span>📝 ${esc(x.dopo)}</span>`
            : `<span><s>${esc(x.prima || '—')}</s> → <b>${esc(x.dopo || '—')}</b></span>`}</div>`).join('')}</div>` : '';
        const seg = (opz, scelta, attr) => `<div class="sa-ck-seg" role="radiogroup">${opz.map(([k, t]) => `<button type="button" role="radio" aria-checked="${scelta === k}" class="${scelta === k ? 'on' : ''}" ${attr}="${k}">${t}</button>`).join('')}</div>`;

        const nOk = agn.filter(v => v.c.ok).length;
        const ov = modale('Controlla l’import', 'APPUNTAMENTI · ' + nomeFile, `<div class="sa-ck">
            ${ant.errore ? `<div class="sa-msg err">Non riesco a confrontare il file con l’archivio (${esc(ant.errore)}): cambi e appuntamenti spariti non vengono mostrati.</div>` : ''}
            <div class="sa-kpis sa-kpis5">
              <div><b>${V.length}</b><span>lead nel file</span></div>
              <div><b>${agn.length}</b><span>di Agnano</span></div>
              <div><b class="sa-ck-g">${nOk}</b><span>✓ allineati</span></div>
              <div><b class="${agn.length - nOk ? 'sa-ck-w' : ''}">${agn.length - nOk}</b><span>⚠ da controllare</span></div>
              <div><b>${scart.length}</b><span>scartati (Nola, Salerno…)</span></div></div>
            <section class="sa-ck-sec">
              <h4><span>1</span> Quali giorni importare</h4>
              <p class="sa-hint">Clicca sui giorni per sceglierli (verde = si importa). Il numero è quanti appuntamenti ci sono nel file, <b class="sa-ck-w">⚠</b> quanti vanno controllati, <b class="sa-ck-r">✕</b> quanti sono spariti rispetto all’archivio.</p>
              <div class="sa-ck-quick">
                <button type="button" class="sa-btn2" data-ck="tutti">Tutti</button>
                <button type="button" class="sa-btn2" data-ck="futuri">Da oggi in poi</button>
                <button type="button" class="sa-btn2" data-ck="oggi">Solo oggi</button>
                <button type="button" class="sa-btn2" data-ck="nessuno">Nessuno</button>
                <span class="sa-ck-range">dal <input type="date" data-ck-da value="${date[0] || ''}"> al <input type="date" data-ck-a value="${date[date.length - 1] || ''}">
                  <button type="button" class="sa-btn2" data-ck="periodo">Scegli questo periodo</button></span>
              </div>
              <div class="sa-ck-days" data-ck-zona="giorni"></div>
            </section>
            <section class="sa-ck-sec" data-ck-zona="lista"></section>
            <section class="sa-ck-sec" data-ck-zona="senza"></section>
            <section class="sa-ck-sec" data-ck-zona="cambi"></section>
            <section class="sa-ck-sec" data-ck-zona="spariti"></section>
            <details class="sa-ck-sec sa-ck-det" data-ck-zona="ok"></details>
            ${scart.length ? `<details class="sa-ck-sec sa-ck-det"><summary>Scartati perché non di Agnano (${scart.length})</summary>
              <table class="sa-tbl"><thead><tr><th>Lead</th><th>Cliente</th><th>Motivo</th></tr></thead><tbody>
              ${scart.map(v => `<tr><td>${esc(v.r.id)}</td><td>${esc(cliApp(v.r))}</td><td>${esc(v.sede)}</td></tr>`).join('')}</tbody></table></details>` : ''}
            <div class="sa-ck-foot" data-ck-zona="foot"></div></div>`, { fisso: true });
        const zona = k => ov.querySelector(`[data-ck-zona="${k}"]`);
        const nomeG = g => g ? up1(giornoCorto(g)) : 'Senza data';
        const archivio = p => `<span class="sa-tag">${p ? 'già in archivio' + (p.appData ? ' · ' + esc(dueOra(p.appData, p.appOra)) : '') : 'nuovo'}</span>`;

        function esito(v) {
            if (v.azione === 'togli') return '<span class="sa-ck-es red">Verrà tolto dal calendario</span>';
            if (v.azione === 'salta') return v.pr ? '<span class="sa-ck-es no">Resta com’era in archivio (il file non viene salvato per questo lead)</span>'
                : `<span class="sa-ck-es no">Non verrà importato${v.c.prop ? ` <small>· data trovata: ${esc(gm(v.c.prop))} (${esc(v.c.prop.fonte)})</small>` : ' <small>· nessuna data trovata nel lead</small>'}</span>`;
            const d = v.azione === 'modifica' ? (v.data ? { data: v.data, ora: v.ora } : null) : v.c.prop;
            if (!d) return `<span class="sa-ck-es warn">${v.azione === 'modifica' ? 'Scegli la data' : '⚠ Senza data: non comparirà in nessun giorno del calendario'}</span>`;
            return `<span class="sa-ck-es">→ ${esc(up1(giornoLungo(d.data)))}${d.ora ? ' alle ' + esc(d.ora) : ' (senza orario)'}${v.azione === 'forza' && v.c.prop ? ` <small>da ${esc(v.c.prop.fonte)}</small>` : ''}</span>`;
        }
        function riga(v) {
            const r = v.r, c = v.c, i = V.indexOf(v);
            const campo = (k, t, val) => `<div class="${c.bad[k] ? 'bad' : ''}"><small>${t}</small><span>${val ? esc(corto(val, 90)) : '<i>vuoto</i>'}</span></div>`;
            const opz = v.pr ? AZ_CTRL.map(([k, t]) => k === 'salta' ? [k, '↺ Lascia com’era'] : [k, t]) : AZ_CTRL.filter(([k]) => k !== 'togli');
            const ch = cambi(v);
            return `<div class="sa-ck-row az-${v.azione}" data-ck-i="${i}">
              <div class="sa-ck-top"><b>${esc(cliApp(r))}</b><span class="sa-hint">Lead ${esc(r.id)}${r.venditore ? ' · ' + esc(r.venditore) : ''}</span>${archivio(v.pr)}</div>
              <div class="sa-ck-campi">${campo('alert', 'Esito alert', r.esitoAlert)}${campo('att', 'Esito ultima attività', r.esitoAttivita)}${campo('ric', 'Data ricontatto', r.dataRicontatto)}</div>
              <ul class="sa-ck-pb">${c.problemi.map(p => `<li>${esc(p)}</li>`).join('')}${haDati && !consDopo(v) ? `<li>Venditore nel CSV: <b>${esc(r.venditore || 'vuoto')}</b> · non è un consulente del salone: se lo importi, scegli il consulente o resterà da assegnare</li>` : ''}</ul>
              ${ch.length ? `<p class="sa-ck-lab">Rispetto all’archivio cambierebbe:</p>${tabCambi(ch)}` : ''}
              <div class="sa-ck-az">${seg(opz, v.azione, 'data-az')}
                ${v.azione === 'modifica' ? `<span class="sa-ck-edit"><input type="date" data-ck-data value="${esc(v.data)}" aria-label="Data appuntamento"><input type="time" data-ck-ora value="${esc(v.ora)}" step="300" aria-label="Ora appuntamento"></span>` : ''}
                ${haDati && !consDopo(v) && (v.azione === 'modifica' || v.azione === 'forza') ? selCons(v, 'data-ck-sc2').replace('— scegli il consulente —', '— da assegnare —') : ''}
                ${esito(v)}</div>
              ${v.ricordo ? '<p class="sa-hint sa-ck-ric">↺ Scelta ripresa dall’import precedente (nel file non è cambiato niente)</p>' : ''}
            </div>`;
        }
        function rigaAgg(v) {
            const i = V.indexOf(v);
            return `<div class="sa-ck-row agg-${v.agg}" data-ck-i="${i}">
              <div class="sa-ck-top"><b>${esc(cliApp(v.r))}</b><span class="sa-hint">Lead ${esc(v.r.id)}${v.r.venditore ? ' · ' + esc(v.r.venditore) : ''}</span>${archivio(v.pr)}</div>
              ${tabCambi(cambi(v))}
              <div class="sa-ck-az">${seg(AZ_AGG, v.agg, 'data-agg')}
                <span class="sa-ck-es ${v.agg === 'togli' ? 'red' : v.agg === 'tieni' ? 'no' : ''}">${v.agg === 'aggiorna' ? '→ Si salvano i dati nuovi del file' : v.agg === 'tieni' ? 'Resta com’era: le novità del file non vengono salvate' : 'Verrà tolto dal calendario'}</span></div>
            </div>`;
        }
        function rigaSpar(s) {
            const p = s.pr, i = spariti.indexOf(s);
            return `<div class="sa-ck-row sp-${s.azione}" data-ck-s="${i}">
              <div class="sa-ck-top"><b>${esc(s.cliente || 'Cliente')}</b><span class="sa-hint">Lead ${esc(s.id)}${p.consulente ? ' · ' + esc(p.consulente) : ' · da assegnare'}${p.status ? ' · ' + esc(p.status) : ''}</span>
                <span class="sa-tag">in archivio · ${esc(p.appData ? dueOra(p.appData, p.appOra) : 'senza data')}</span></div>
              <ul class="sa-ck-pb red"><li>${esc(s.motivo)}</li></ul>
              <div class="sa-ck-az">${seg(AZ_SPAR, s.azione, 'data-sp')}
                <span class="sa-ck-es ${s.azione === 'togli' ? 'red' : 'no'}">${s.azione === 'togli' ? 'Verrà tolto dal calendario' : 'Resta nel calendario com’era'}</span></div>
            </div>`;
        }
        function disegnaGiorni() {
            zona('giorni').innerHTML = chiavi.map(g => { const x = giorni[g], pass = g && g < oggi(); return `<button type="button" class="sa-ck-day ${sel.has(g) ? 'on' : ''} ${pass ? 'past' : ''}" data-ck-g="${g}" aria-pressed="${sel.has(g)}"
                title="${pass ? 'Giorno già passato · ' : ''}${x.n} nel file${x.w ? ', ' + x.w + ' da controllare' : ''}${x.s ? ', ' + x.s + ' spariti' : ''}">
                <span>${esc(nomeG(g))}</span><b>${x.n}</b>${x.w ? `<i>⚠ ${x.w}</i>` : ''}${x.s ? `<i class="r">✕ ${x.s}</i>` : ''}</button>`; }).join('') || '<p class="sa-hint">Nessun lead di Agnano nel file.</p>';
        }
        const daControllare = () => agn.filter(v => inSel(v) && !v.c.ok);
        /* SENZA CONSULENTE: il venditore del CSV non e' un consulente del salone (e nessuno l'ha scelto a mano):
           invece di importarli e basta si decide: Assegna a un consulente, Importa da assegnare, Salta o Togli */
        const haDati = !!ant.consulenti;
        const consDopo = v => {
            const f = Object.prototype.hasOwnProperty.call(consulenti, v.r.venditore || '') ? consulenti[v.r.venditore || ''] : null;
            return f || (v.pr && v.pr.consulenteMano) || null;
        };
        const senzaCons = v => haDati && !v.sede && inSel(v) && v.c.ok && !consDopo(v);
        const senzaL = () => agn.filter(senzaCons);
        const cambiati = () => agn.filter(v => inSel(v) && v.c.ok && v.pr && cambi(v).length && !senzaCons(v));
        const AZ_SC = v => [['assegna', '👤 Assegna a…'], ['importa', '📥 Importa da assegnare'], ['salta', '⏭ Salta']].concat(v.pr ? [['togli', '✕ Togli dal calendario']] : []);
        const selCons = (v, attr) => `<select class="sa-sel sa-ck-sc" ${attr} aria-label="Consulente"><option value="">— scegli il consulente —</option>${perReparto(st.consulenti).map(([k, l]) => `<optgroup label="${REP[k].t}">` + l.map(c => `<option ${v.sc === c ? 'selected' : ''}>${esc(c)}</option>`).join('') + '</optgroup>').join('')}</select>`;
        function rigaSenza(v) {
            const i = V.indexOf(v), az = v.nc || 'importa';
            return `<div class="sa-ck-row sc-${az}" data-ck-i="${i}">
              <div class="sa-ck-top"><b>${esc(cliApp(v.r))}</b><span class="sa-hint">Lead ${esc(v.r.id)} · ${esc(gm({ data: v.data, ora: v.ora }))}</span>${archivio(v.pr)}</div>
              <ul class="sa-ck-pb"><li>Venditore nel CSV: <b>${esc(v.r.venditore || 'vuoto')}</b> · non è un consulente del salone</li></ul>
              ${v.pr ? tabCambi(cambi(v)) : ''}
              <div class="sa-ck-az">${seg(AZ_SC(v), az, 'data-sc')}
                ${az === 'assegna' ? selCons(v, 'data-ck-sc') : ''}
                <span class="sa-ck-es ${az === 'togli' ? 'red' : az === 'salta' ? 'no' : az === 'assegna' && !v.sc ? 'warn' : ''}">${az === 'assegna' ? (v.sc ? '→ Si importa assegnato a ' + esc(v.sc) + ' (resta anche ai prossimi import)' : 'Scegli il consulente')
                    : az === 'importa' ? '→ Si importa “Da assegnare”' : az === 'salta' ? (v.pr ? 'Resta com’era in archivio' : 'Non verrà importato') : 'Verrà tolto dal calendario'}</span></div>
            </div>`;
        }
        function disegnaSenza() {
            const L = senzaL();
            zona('senza').hidden = !haDati;
            zona('senza').innerHTML = `<h4><span>3</span> Senza consulente del salone <b class="${L.length ? 'sa-ck-w' : 'sa-ck-g'}">${L.length}</b></h4>
              ${L.length ? `<p class="sa-hint">Nel CSV il venditore di questi appuntamenti non è un consulente del salone, quindi resterebbero <b>da assegnare</b>. Decidi tu: <b>assegnali</b> a un consulente, <b>importali da assegnare</b>, <b>saltali</b> o, se erano già in archivio, <b>toglili dal calendario</b>.</p>
                <div class="sa-ck-bulk"><span class="sa-hint">Per tutti:</span><button type="button" class="sa-btn2" data-ck-sc-tutti="importa">📥 Importa tutti da assegnare</button><button type="button" class="sa-btn2" data-ck-sc-tutti="salta">⏭ Salta tutti</button></div>
                <div class="sa-ck-list">${L.map(rigaSenza).join('')}</div>`
                : '<p class="sa-hint">Nei giorni scelti tutti gli appuntamenti hanno un consulente del salone. 👍</p>'}`;
        }
        function disegnaLista() {
            const L = daControllare();
            zona('lista').innerHTML = `<h4><span>2</span> Da controllare <b class="${L.length ? 'sa-ck-w' : 'sa-ck-g'}">${L.length}</b></h4>
              ${L.length ? `<p class="sa-hint">In questi lead Esito alert, Esito ultima attività e Data ricontatto non sono allineati. Scegli per ognuno: <b>Salta</b> (non si importa), <b>Modifica</b> (scegli tu data e ora), <b>Inserisci comunque</b> (con la data proposta). Per quelli già in archivio puoi anche <b>lasciarli com’erano</b> o <b>toglierli dal calendario</b>.</p>
                <div class="sa-ck-bulk"><span class="sa-hint">Per tutti quelli qui sotto:</span><button type="button" class="sa-btn2" data-ck-tutti="salta">⏭ Salta tutti</button><button type="button" class="sa-btn2" data-ck-tutti="forza">➕ Inserisci tutti</button></div>
                <div class="sa-ck-list">${L.map(riga).join('')}</div>`
                : '<p class="sa-hint">Nei giorni scelti tutti gli appuntamenti sono allineati. 👍</p>'}`;
        }
        function disegnaCambi() {
            const L = cambiati();
            zona('cambi').innerHTML = `<h4><span>4</span> Cambiati dall’import precedente <b class="${L.length ? 'sa-ck-b' : 'sa-ck-g'}">${L.length}</b></h4>
              ${L.length ? `<p class="sa-hint">Questi appuntamenti erano già in archivio e nel nuovo file qualcosa è diverso (barrato = com’è adesso, in grassetto = come sarà). Scegli se <b>aggiornarli</b>, <b>tenerli com’erano</b> o <b>toglierli dal calendario</b>.</p>
                <div class="sa-ck-bulk"><span class="sa-hint">Per tutti:</span><button type="button" class="sa-btn2" data-ck-agg-tutti="aggiorna">✓ Aggiorna tutti</button><button type="button" class="sa-btn2" data-ck-agg-tutti="tieni">↺ Tieni tutti com’erano</button></div>
                <div class="sa-ck-list">${L.map(rigaAgg).join('')}</div>`
                : '<p class="sa-hint">Nei giorni scelti nessun appuntamento già in archivio è cambiato.</p>'}`;
        }
        function disegnaSpariti() {
            const L = spariti.filter(spSel);
            zona('spariti').innerHTML = `<h4><span>5</span> Spariti dal file <b class="${L.length ? 'sa-ck-r' : 'sa-ck-g'}">${L.length}</b></h4>
              ${L.length ? `<p class="sa-hint">Questi appuntamenti sono in archivio nei giorni scelti, ma nel nuovo file non ci sono più (o ora sono di un’altra sede). Possono essere stati annullati o spostati fuori dal file: scegli se <b>tenerli</b> o <b>toglierli dal calendario</b>.</p>
                <div class="sa-ck-bulk"><span class="sa-hint">Per tutti:</span><button type="button" class="sa-btn2" data-ck-sp-tutti="tieni">↺ Tieni tutti</button><button type="button" class="sa-btn2" data-ck-sp-tutti="togli">✕ Togli tutti</button></div>
                <div class="sa-ck-list">${L.map(rigaSpar).join('')}</div>`
                : '<p class="sa-hint">Nei giorni scelti non è sparito nessun appuntamento.</p>'}`;
        }
        function disegnaOk() {
            const L = agn.filter(v => inSel(v) && v.c.ok).sort((a, b) => (a.data + a.ora).localeCompare(b.data + b.ora));
            zona('ok').innerHTML = `<summary>✓ Allineati nei giorni scelti (${L.length})</summary>${L.length ? `<table class="sa-tbl"><thead><tr><th>Lead</th><th>Cliente</th><th>Appuntamento</th><th>Venditore</th><th></th></tr></thead><tbody>
              ${L.map(v => `<tr><td>${esc(v.r.id)}</td><td>${esc(cliApp(v.r))}</td><td>${esc(gm({ data: v.data, ora: v.ora }))}</td><td>${esc(v.r.venditore || '—')}</td><td class="sa-hint">${senzaCons(v) ? 'senza consulente (sezione 3)' : v.pr ? (cambi(v).length ? 'cambiato' : 'già in archivio, uguale') : 'nuovo'}</td></tr>`).join('')}</tbody></table>` : '<p class="sa-hint">Nessuno.</p>'}`;
        }
        /* cosa succede premendo Importa */
        function piano() {
            const avviso = v => v.c.problemi.join(' · ');
            const out = [], rimuovi = [], tenuti = [], saltati = [];
            let ok = 0, mod = 0, forza = 0, agg = 0, ass = 0, senza = 0;
            agn.filter(inSel).forEach(v => {
                if (v.c.ok && senzaCons(v)) {
                    const az = v.nc || 'importa';
                    if (az === 'togli') { rimuovi.push({ id: v.r.id, motivo: 'Senza consulente del salone (nel CSV: ' + (v.r.venditore || 'vuoto') + '), tolto a mano' }); return; }
                    if (az === 'salta') { saltati.push({ id: v.r.id, cliente: cliApp(v.r), avviso: 'Senza consulente del salone (nel CSV: ' + (v.r.venditore || 'vuoto') + ')' }); return; }
                    if (az === 'assegna' && v.sc) ass++; else senza++;
                    ok++; out.push(Object.assign({}, v.r, { appData: v.data, appOra: v.ora, fonteData: 'Data ricontatto', controllo: 'ok', consulenteScelto: az === 'assegna' ? v.sc : '' }));
                } else if (v.c.ok) {
                    const ch = v.pr ? cambi(v) : [];
                    if (ch.length && v.agg === 'togli') { rimuovi.push({ id: v.r.id, motivo: 'Cambiato nel file, tolto a mano' }); return; }
                    if (ch.length && v.agg === 'tieni') { tenuti.push({ id: v.r.id, cliente: cliApp(v.r), avviso: ch.map(x => x.campo).join(', ') }); return; }
                    if (ch.length) agg++;
                    ok++; out.push(Object.assign({}, v.r, { appData: v.data, appOra: v.ora, fonteData: 'Data ricontatto', controllo: 'ok' }));
                } else if (v.azione === 'togli') rimuovi.push({ id: v.r.id, motivo: 'Non allineato: ' + avviso(v) });
                else if (v.azione === 'modifica') { mod++; if (v.sc) ass++; out.push(Object.assign({}, v.r, { appData: v.data, appOra: v.ora, fonteData: 'Modificato a mano', controllo: 'modificato', avviso: avviso(v), consulenteScelto: v.sc || '' })); }
                else if (v.azione === 'forza') { forza++; if (v.sc) ass++; out.push(Object.assign({}, v.r, { appData: v.c.prop ? v.c.prop.data : '', appOra: v.c.prop && v.c.prop.ora || '', fonteData: v.c.prop ? v.c.prop.fonte : '', controllo: 'forzato', avviso: avviso(v), consulenteScelto: v.sc || '' })); }
                else saltati.push({ id: v.r.id, cliente: cliApp(v.r), avviso: (v.pr ? 'Lasciato com’era · ' : '') + avviso(v) });
            });
            spariti.filter(spSel).forEach(s => { if (s.azione === 'togli') rimuovi.push({ id: s.id, motivo: s.motivo }); });
            const tenutiSp = spariti.filter(s => spSel(s) && s.azione === 'tieni').length;
            return { out, rimuovi, tenuti, saltati, ok, mod, forza, agg, ass, senza, tenutiSp, fuori: agn.filter(v => !inSel(v)).length };
        }
        function disegnaFoot() {
            const k = piano(), tot = k.ok + k.mod + k.forza, fare = tot + k.rimuovi.length;
            const pz = [`✓ ${k.ok} allineati${k.agg ? ` (di cui ${k.agg} aggiornati)` : ''}`];
            if (k.ass) pz.push(`👤 ${k.ass} assegnati ora`); if (k.senza) pz.push(`${k.senza} da assegnare`);
            if (k.mod) pz.push(`✎ ${k.mod} modificati`); if (k.forza) pz.push(`➕ ${k.forza} inseriti comunque`);
            if (k.rimuovi.length) pz.push(`<b class="sa-ck-r">✕ ${k.rimuovi.length} tolti dal calendario</b>`);
            if (k.tenuti.length) pz.push(`↺ ${k.tenuti.length} cambiati ma tenuti com’erano`); if (k.tenutiSp) pz.push(`↺ ${k.tenutiSp} spariti ma tenuti`);
            if (k.saltati.length) pz.push(`⏭ ${k.saltati.length} saltati`); if (k.fuori) pz.push(`${k.fuori} in giorni non scelti`);
            zona('foot').innerHTML = `<div class="sa-hint">Si importano <b>${tot}</b>: ${pz.join(' · ')}</div>
              <button type="button" class="sa-btn2" data-chiudi>Annulla</button>
              <button type="button" class="sa-btn" data-ck="importa" ${fare ? '' : 'disabled'}>Importa ${tot} appuntament${tot === 1 ? 'o' : 'i'}${k.rimuovi.length ? ` e togli ${k.rimuovi.length}` : ''}</button>`;
        }
        const tutto = () => { disegnaGiorni(); disegnaLista(); disegnaSenza(); disegnaCambi(); disegnaSpariti(); disegnaOk(); disegnaFoot(); };
        tutto();

        function descriviPeriodo() {
            if (sel.size === chiavi.length) return 'Tutti i giorni del file';
            const g = chiavi.filter(x => sel.has(x));
            const t = g.slice(0, 12).map(x => x ? gm({ data: x }) : 'senza data').join(', ');
            return 'Giorni scelti: ' + t + (g.length > 12 ? ` e altri ${g.length - 12}` : '');
        }
        async function importa(btn) {
            const senzaScelta = senzaL().find(v => v.nc === 'assegna' && !v.sc);
            if (senzaScelta) {
                const el = ov.querySelector(`[data-ck-i="${V.indexOf(senzaScelta)}"]`);
                if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1500); }
                alert('Per “' + cliApp(senzaScelta.r) + '” hai scelto Assegna: scegli il consulente.'); return;
            }
            const manca = agn.find(v => inSel(v) && !v.c.ok && v.azione === 'modifica' && !v.data);
            if (manca) {
                const el = ov.querySelector(`[data-ck-i="${V.indexOf(manca)}"]`);
                if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1500); }
                alert('Per “' + cliApp(manca.r) + '” hai scelto Modifica: inserisci almeno la data.'); return;
            }
            const k = piano();
            if (k.rimuovi.length && !confirm(`Vuoi togliere ${k.rimuovi.length} appuntament${k.rimuovi.length === 1 ? 'o' : 'i'} dal calendario?\nResteranno scritti nello storico dell’import.`)) return;
            const righeOut = k.out.concat(scart.map(v => v.r));     // gli scartati: il server li riconosce e li conta, come prima
            btn.disabled = true; btn.textContent = 'Importo…';
            try {
                const d = await post('/appuntamenti/import', { file: nomeFile, righe: righeOut, righeFile: V.length, periodo: descriviPeriodo(),
                    fuoriPeriodo: k.fuori, nSaltati: k.saltati.length, saltati: k.saltati.slice(0, 300),
                    rimuovi: k.rimuovi, tenuti: k.tenuti.slice(0, 300), tenutiSpariti: k.tenutiSp });
                ov.remove();
                mostraEsito(d.import);
                st.app.caricato = false; caricaApp(st.app.giorno);
            } catch (e) { alert('Import non riuscito: ' + e.message); btn.disabled = false; disegnaFoot(); }
        }
        const rifai = (el, html) => { el.outerHTML = html; };
        ov.addEventListener('click', e => {
            const g = e.target.closest('[data-ck-g]');
            if (g) { const k = g.dataset.ckG; if (sel.has(k)) sel.delete(k); else sel.add(k); tutto(); return; }
            const q = e.target.closest('[data-ck]');
            if (q) {
                const a = q.dataset.ck;
                if (a === 'importa') { importa(q); return; }
                const da = ov.querySelector('[data-ck-da]').value, al = ov.querySelector('[data-ck-a]').value;
                sel.clear();
                chiavi.forEach(k => {
                    if (a === 'tutti' || (a === 'futuri' && k && k >= oggi()) || (a === 'oggi' && k === oggi())
                        || (a === 'periodo' && k && (!da || k >= da) && (!al || k <= al))) sel.add(k);
                });
                tutto(); return;
            }
            const t = e.target.closest('[data-ck-tutti]');
            if (t) { daControllare().forEach(v => { v.azione = t.dataset.ckTutti; v.ricordo = false; }); disegnaLista(); disegnaFoot(); return; }
            const tsc = e.target.closest('[data-ck-sc-tutti]');
            if (tsc) { senzaL().forEach(v => { v.nc = tsc.dataset.ckScTutti; }); disegnaSenza(); disegnaFoot(); return; }
            const scb = e.target.closest('[data-sc]');
            if (scb) { const row = scb.closest('[data-ck-i]'), v = V[Number(row.dataset.ckI)]; v.nc = scb.dataset.sc; rifai(row, rigaSenza(v)); disegnaFoot(); return; }
            const ta = e.target.closest('[data-ck-agg-tutti]');
            if (ta) { cambiati().forEach(v => { v.agg = ta.dataset.ckAggTutti; }); disegnaCambi(); disegnaFoot(); return; }
            const ts = e.target.closest('[data-ck-sp-tutti]');
            if (ts) { spariti.filter(spSel).forEach(s => { s.azione = ts.dataset.ckSpTutti; }); disegnaSpariti(); disegnaFoot(); return; }
            const b = e.target.closest('[data-az]');
            if (b) {
                const row = b.closest('[data-ck-i]'), v = V[Number(row.dataset.ckI)];
                v.azione = b.dataset.az; v.ricordo = false;
                if (v.azione === 'modifica' && !v.data && v.c.prop) { v.data = v.c.prop.data; v.ora = v.c.prop.ora || ''; }
                rifai(row, riga(v));
                if (v.azione === 'modifica') { const inp = ov.querySelector(`[data-ck-i="${V.indexOf(v)}"] [data-ck-data]`); if (inp) inp.focus(); }
                disegnaFoot(); return;
            }
            const ag = e.target.closest('[data-agg]');
            if (ag) { const row = ag.closest('[data-ck-i]'), v = V[Number(row.dataset.ckI)]; v.agg = ag.dataset.agg; rifai(row, rigaAgg(v)); disegnaFoot(); return; }
            const sp = e.target.closest('[data-sp]');
            if (sp) { const row = sp.closest('[data-ck-s]'), s = spariti[Number(row.dataset.ckS)]; s.azione = sp.dataset.sp; rifai(row, rigaSpar(s)); disegnaFoot(); }
        });
        ov.addEventListener('change', e => {
            const sel = e.target.closest('[data-ck-sc], [data-ck-sc2]'); if (!sel) return;
            const row = sel.closest('[data-ck-i]'), v = V[Number(row.dataset.ckI)];
            v.sc = sel.value; rifai(row, sel.matches('[data-ck-sc]') ? rigaSenza(v) : riga(v)); disegnaFoot();
        });
        ov.addEventListener('input', e => {
            const inp = e.target.closest('[data-ck-data], [data-ck-ora]'); if (!inp) return;
            const row = inp.closest('[data-ck-i]'), v = V[Number(row.dataset.ckI)];
            if (inp.matches('[data-ck-data]')) v.data = inp.value; else v.ora = inp.value;
            const es = row.querySelector('.sa-ck-es'); if (es) es.outerHTML = esito(v);
            disegnaFoot();
        });
    }
    function riepilogoImport(x) {
        return `<div class="sa-kpis sa-kpis5">
            <div><b>${x.righeFile}</b><span>righe nel file</span></div>
            <div><b>${x.nuovi}</b><span>nuovi</span></div>
            <div><b>${x.aggiornati}</b><span>aggiornati</span></div>
            <div><b>${x.invariati}</b><span>invariati</span></div>
            <div><b>${x.esclusi}</b><span>scartati (non Agnano)</span></div></div>
          <p class="sa-hint">${x.daAssegnare ? `<b class="sa-red">${x.daAssegnare} da assegnare</b> (venditore non di Agnano) · ` : ''}${x.assegnatiDaImport ? `${x.assegnatiDaImport} assegnati in automatico da questo import · ` : ''}${x.senzaData ? `${x.senzaData} senza data di appuntamento leggibile · ` : ''}import di ${esc(x.chi)} il ${esc(x.atIt)}</p>
          ${x.periodo != null ? `<p class="sa-hint sa-ck-riep">📅 ${esc(x.periodo)} · ✓ ${x.allineati} allineati${x.modificati ? ` · ✎ <b>${x.modificati}</b> modificati a mano` : ''}${x.forzati ? ` · ➕ <b>${x.forzati}</b> inseriti comunque` : ''}${x.saltati ? ` · ⏭ <b>${x.saltati}</b> saltati` : ''}${x.rimossi ? ` · <b class="sa-ck-r">✕ ${x.rimossi} tolti dal calendario</b>` : ''}${x.tenuti ? ` · ↺ ${x.tenuti} cambiati ma tenuti com’erano` : ''}${x.tenutiSpariti ? ` · ↺ ${x.tenutiSpariti} spariti dal file ma tenuti` : ''}${x.fuoriPeriodo ? ` · ${x.fuoriPeriodo} in giorni non scelti` : ''}</p>` : ''}`;
    }
    function tabControllo(titolo, L, conData) {
        return L && L.length ? `<h4>${titolo} (${L.length})</h4><table class="sa-tbl"><thead><tr><th>Lead</th><th>Cliente</th>${conData ? '<th>Appuntamento</th>' : ''}<th>Motivo</th></tr></thead><tbody>
            ${L.map(n => `<tr><td>${esc(n.id)}</td><td>${esc(n.cliente)}</td>${conData ? `<td>${esc(fmtApp(n.appuntamento))}</td>` : ''}<td class="sa-hint">${esc(n.avviso || '—')}</td></tr>`).join('')}</tbody></table>` : '';
    }
    function dettaglioImport(x) {
        const motivi = Object.entries(x.esclusiPerMotivo || {});
        return `${tabControllo('✕ Tolti dal calendario', x.rimossiElenco, true)}${tabControllo('✎ Modificati a mano', x.modificatiElenco, true)}${tabControllo('➕ Inseriti comunque', x.forzatiElenco, true)}${tabControllo('⏭ Saltati', x.saltatiElenco, false)}${tabControllo('↺ Cambiati nel file ma tenuti com’erano', x.tenutiElenco, false)}
          ${(x.nuoviElenco || []).length ? `<h4>Nuovi (${x.nuovi})</h4><table class="sa-tbl"><thead><tr><th>Lead</th><th>Cliente</th><th>Appuntamento</th><th>Consulente</th></tr></thead><tbody>
              ${x.nuoviElenco.map(n => `<tr><td>${esc(n.id)}</td><td>${esc(n.cliente)}</td><td>${esc(fmtApp(n.appuntamento))}</td><td class="${n.consulente === 'Da assegnare' ? 'sa-red' : ''}">${esc(n.consulente)}</td></tr>`).join('')}</tbody></table>` : ''}
          ${(x.cambi || []).length ? `<h4>Cosa è cambiato (${x.aggiornati} lead)</h4><table class="sa-tbl"><thead><tr><th>Lead</th><th>Cliente</th><th>Campo</th><th>Prima</th><th>Dopo</th></tr></thead><tbody>
              ${x.cambi.map(c => `<tr><td>${esc(c.id)}</td><td>${esc(c.cliente)}</td><td><b>${esc(c.campo)}</b></td><td class="sa-old">${esc(c.campo === 'Appuntamento' ? fmtApp(c.prima) : c.prima || '—')}</td><td>${esc(c.campo === 'Appuntamento' ? fmtApp(c.dopo) : c.dopo || '—')}</td></tr>`).join('')}</tbody></table>` : ''}
          ${motivi.length ? `<h4>Scartati (${x.esclusi})</h4><p class="sa-hint">${motivi.map(([m, n]) => `${esc(m)}: <b>${n}</b>`).join(' · ')}</p>
              ${(x.esclusiElenco || []).length ? `<table class="sa-tbl"><thead><tr><th>Lead</th><th>Cliente</th><th>Motivo</th></tr></thead><tbody>${x.esclusiElenco.map(c => `<tr><td>${esc(c.id)}</td><td>${esc(c.cliente)}</td><td>${esc(c.motivo)}</td></tr>`).join('')}</tbody></table>` : ''}` : ''}
          ${!(x.nuoviElenco || []).length && !(x.cambi || []).length && !motivi.length ? '<p class="sa-hint">Nessuna novità: tutti i lead erano già aggiornati.</p>' : ''}`;
    }
    const fmtApp = s => { if (!s) return '—'; const [g, o] = String(s).split(' '); return g ? giornoCorto(g) + (o ? ' ' + o : '') : s; };
    /* opt.fisso: non si chiude cliccando fuori e chiede conferma (finestra con delle scelte da non perdere) */
    function modale(titolo, sotto, html, opt) {
        const fisso = !!(opt && opt.fisso);
        const ov = document.createElement('div'); ov.className = 'sa-ov';
        ov.innerHTML = `<div class="sa-modal sa-wide" role="dialog" aria-modal="true" aria-label="${esc(titolo)}">
            <header><div><small>${esc(sotto)}</small><h3>${esc(titolo)}</h3></div><button type="button" class="sa-x" data-chiudi aria-label="Chiudi">✕</button></header>
            <div class="sa-mbody">${html}</div></div>`;
        document.body.appendChild(ov);
        const chiudi = () => {
            if (fisso && !confirm('Chiudere senza importare? Le scelte fatte qui si perdono.')) return;
            ov.remove(); document.removeEventListener('keydown', onKey);
        };
        const onKey = e => { if (e.key === 'Escape' && document.body.contains(ov)) chiudi(); else if (!document.body.contains(ov)) document.removeEventListener('keydown', onKey); };
        document.addEventListener('keydown', onKey);
        ov.addEventListener('click', e => { if ((e.target === ov && !fisso) || e.target.closest('[data-chiudi]')) chiudi(); });
        return ov;
    }
    function mostraEsito(x) { modale('Import completato', 'APPUNTAMENTI · ' + (x.file || ''), riepilogoImport(x) + dettaglioImport(x)); }
    async function apriStorico() {
        let L;
        try { L = (await api('/appuntamenti/storico')).storico || []; } catch (e) { alert(e.message); return; }
        modale('Storico import', 'APPUNTAMENTI · ' + L.length + ' import', L.length ? L.map((x, i) => `<details class="sa-imp" ${i === 0 ? 'open' : ''}>
            <summary><b>${esc(x.atIt)}</b><span>${esc(x.file || 'file')}</span><em>+${x.nuovi} nuovi · ${x.aggiornati} aggiornati${x.rimossi ? ' · ' + x.rimossi + ' tolti' : ''} · ${x.esclusi} scartati</em></summary>
            ${riepilogoImport(x)}${dettaglioImport(x)}</details>`).join('') : '<p class="sa-hint">Nessun import ancora.</p>');
    }

    /* =====================================================================
       REPORT (solo admin)
       ===================================================================== */
    const grafici = [];
    function periodo(preset) {
        const a = oggi(), d = new Date(a + 'T12:00:00Z');
        const meno = n => { const x = new Date(d); x.setUTCDate(x.getUTCDate() - n); return x.toISOString().slice(0, 10); };
        if (preset === 'oggi') return [a, a];
        if (preset === '7') return [meno(6), a];
        if (preset === 'mese') return [a.slice(0, 8) + '01', a];
        return [meno(29), a];
    }
    async function caricaReport() {
        const R = st.rep;
        if (!R.da) [R.da, R.a] = periodo(R.preset);
        R.err = ''; R.carica = true; if (st.tab === 'report') render();
        try {
            R.dati = await api(`/report?da=${R.da}&a=${R.a}`);
            // i clienti arrivati per un appuntamento passano dagli ingressi (notifica e presa in carico) ma non sono walk-in
            const tutti = R.dati.ingressi || [];
            R.dati.appArrivati = tutti.filter(r => r.daApp).length;
            R.dati.ingressi = tutti.filter(r => !r.daApp);
        } catch (e) { R.err = e.message; }
        R.carica = false;
        if (st.tab === 'report') render();
    }
    function calcola(D) {
        const cons = D.consulenti || [];
        const I = D.ingressi || [];
        const tot = I.length, ass = I.filter(r => r.consulente), presi = I.filter(r => r.presoAt);
        const media = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
        const risp = r => (new Date(r.presoAt) - new Date(r.assegnatoAt)) / 60000;
        const per = {};
        cons.forEach(c => { per[c] = { n: 0, presi: 0, risp: [], cliente: [] }; });
        ass.forEach(r => {
            const p = per[r.consulente] || (per[r.consulente] = { n: 0, presi: 0, risp: [], cliente: [] });
            p.n++;
            if (r.presoAt) { p.presi++; if (r.assegnatoAt) p.risp.push(risp(r)); }
            if (r.minutiCliente != null && r.liberoAt) p.cliente.push(Number(r.minutiCliente));
        });
        // marchi: quanti walk-in chiedono quel marchio (un cliente con due Peugeot conta 1)
        const marchi = {};
        I.forEach(r => {
            const visti = new Set();
            (r.vetture || []).forEach(v => {
                const m = (v.marca || 'Non indicato').trim() || 'Non indicato';
                const k = marchi[m] || (marchi[m] = { walkin: 0, vetture: 0, modelli: {}, presi: 0 });
                k.vetture++;
                if (v.modello) k.modelli[v.modello] = (k.modelli[v.modello] || 0) + 1;
                if (!visti.has(m)) { visti.add(m); k.walkin++; if (r.presoAt) k.presi++; }
            });
        });
        // tempo negli stati: cambi chiusi + stati ancora aperti oggi
        const T = {};
        cons.forEach(c => { T[c] = Object.assign(zeri(), { giorni: new Set(), periodi: zeri(), cambi: 0 }); });
        const add = (nome, s, min, giorno) => {
            if (!s || !T[nome] || !(s in STATI)) return;
            T[nome][s] += min; T[nome].periodi[s]++; T[nome].giorni.add(giorno);
        };
        (D.cambi || []).forEach(e => {
            if (T[e.nome]) T[e.nome].cambi++;
            if (e.da && e.inizio) add(e.nome, e.da, Number(e.minuti) || 0, isoRoma(new Date(e.inizio)));
        });
        const oggiIn = oggi() >= D.da && oggi() <= D.a;
        if (oggiIn) (D.stati || []).forEach(s => { if (s.stato && s.dal) add(s.nome, s.stato, minDa(s.dal), oggi()); });
        // serie nel tempo (per i grafici a linee): giorno per giorno, o mese per mese se il periodo e' lungo
        const B = periodiAsse(D.da, D.a), bk = g => B.mensile ? String(g).slice(0, 7) : String(g).slice(0, 10);
        const vuota = () => Object.fromEntries(B.chiavi.map(k => [k, 0]));
        const tCons = {}, tMarchi = {}, tStati = Object.fromEntries(Object.keys(STATI).map(k => [k, vuota()])), tPres = {};
        ass.forEach(r => { const k = bk(r.data); (tCons[r.consulente] = tCons[r.consulente] || vuota())[k] = (tCons[r.consulente][k] || 0) + 1; });
        I.forEach(r => [...new Set((r.vetture || []).map(v => (v.marca || 'Non indicato').trim() || 'Non indicato'))].forEach(m => {
            const k = bk(r.data); (tMarchi[m] = tMarchi[m] || vuota())[k] = (tMarchi[m][k] || 0) + 1; }));
        const addT = (nome, s, min, giorno) => { if (!s || !tStati[s]) return; const k = bk(giorno); tStati[s][k] = (tStati[s][k] || 0) + min; (tPres[k] = tPres[k] || new Set()).add(nome + '|' + giorno); };
        (D.cambi || []).forEach(e => { if (e.da && e.inizio) addT(e.nome, e.da, Number(e.minuti) || 0, isoRoma(new Date(e.inizio))); });
        if (oggiIn) (D.stati || []).forEach(s => { if (s.stato && s.dal) addT(s.nome, s.stato, minDa(s.dal), oggi()); });
        return { B, tCons, tMarchi, tStati, tPres, tot, ass: ass.length, presi: presi.length, rispMedia: media(ass.filter(r => r.presoAt && r.assegnatoAt).map(risp)),
            clienteMedia: media(I.filter(r => r.liberoAt && r.minutiCliente != null).map(r => Number(r.minutiCliente))), per, marchi, T, media };
    }
    const pct = (n, t) => t ? Math.round(n / t * 1000) / 10 + '%' : '—';
    /* asse del tempo: giorno per giorno fino a 62 giorni, poi mese per mese */
    function periodiAsse(da, a) {
        const g0 = new Date(da + 'T12:00:00Z'), g1 = new Date(a + 'T12:00:00Z');
        const giorni = Math.round((g1 - g0) / 864e5) + 1, mensile = giorni > 62;
        const chiavi = [], etichette = [];
        if (mensile) {
            for (let d = new Date(Date.UTC(g0.getUTCFullYear(), g0.getUTCMonth(), 1)); d <= g1; d.setUTCMonth(d.getUTCMonth() + 1)) {
                chiavi.push(d.toISOString().slice(0, 7)); etichette.push(d.toLocaleDateString('it-IT', { timeZone: 'UTC', month: 'short', year: '2-digit' }));
            }
        } else for (let d = new Date(g0); d <= g1; d.setUTCDate(d.getUTCDate() + 1)) {
            chiavi.push(d.toISOString().slice(0, 10)); etichette.push(d.toLocaleDateString('it-IT', { timeZone: 'UTC', day: 'numeric', month: 'short' }));
        }
        return { chiavi, etichette, mensile };
    }
    /* tre formati per ogni grafico, come nelle altre sezioni: ciambella / colonne / linee nel tempo (scelta ricordata) */
    const ICO_T = {
        doughnut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 4v4.5"/></svg>',
        bar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h10M4 12h16M4 18h7"/></svg>',
        line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-6 4 3 5-7 4 4"/></svg>'
    };
    const NOMI_T = { doughnut: 'Ciambella', bar: 'Barre', line: 'Linee nel tempo' };
    const LS_T = 'saloneTipiGrafico';
    let tipiG = {}; try { tipiG = JSON.parse(localStorage.getItem(LS_T) || '{}') || {}; } catch (e) { tipiG = {}; }
    const tipoG = (id, def) => (NOMI_T[tipiG[id]] ? tipiG[id] : def);
    const bottoniTipo = (id, def) => `<div class="sa-types" role="group" aria-label="Formato del grafico">${Object.keys(NOMI_T).map(t => `<button type="button" title="${NOMI_T[t]}" aria-label="${NOMI_T[t]}" class="${tipoG(id, def) === t ? 'on' : ''}" data-ct="${id}|${t}">${ICO_T[t]}</button>`).join('')}</div>`;
    /* colori per serie (consulenti, marchi): sempre nello stesso ordine, il colore segue il nome */
    const SERIE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
    const ALTRI = '#7b8494';
    function renderReport(body) {
        grafici.splice(0).forEach(g => { try { g.destroy(); } catch (e) { /* */ } });
        const R = st.rep, D = R.dati;
        const barraPeriodo = `<div class="sa-card sa-rep-h">
            <div><h2>Report walk-in e consulenti</h2><p>${D ? `Dal ${esc(giornoCorto(D.da))} al ${esc(giornoCorto(D.a))} · ora italiana` : ''}</p></div>
            <div class="sa-list-a">
              ${[['oggi', 'Oggi'], ['7', '7 giorni'], ['30', '30 giorni'], ['mese', 'Questo mese']].map(([k, n]) => `<button type="button" class="sa-btn2 ${R.preset === k ? 'on' : ''}" data-preset="${k}">${n}</button>`).join('')}
              <label class="sa-dt">Dal <input type="date" data-rda value="${esc(R.da || '')}"></label>
              <label class="sa-dt">al <input type="date" data-ra value="${esc(R.a || '')}"></label>
            </div></div>`;
        if (R.err) { body.innerHTML = barraPeriodo + `<div class="sa-msg err">${esc(R.err)}</div>`; return; }
        if (!D) { body.innerHTML = barraPeriodo + '<div class="sa-card sa-none">Caricamento del report…</div>'; return; }
        const C = calcola(D), cons = D.consulenti || [];
        const righeCons = Object.keys(C.per).filter(c => cons.includes(c) || C.per[c].n);
        const marchi = Object.entries(C.marchi).sort((a, b) => b[1].walkin - a[1].walkin);
        const conVetture = (D.ingressi || []).filter(r => (r.vetture || []).length).length;
        const filtro = R.filtroCons || '';
        const cambi = (D.cambi || []).filter(e => !filtro || e.nome === filtro).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
        const lab = s => s ? `${bollino(s)} ${STATI[s].t}` : '<span class="sa-hint">non in salone</span>';
        body.innerHTML = barraPeriodo + `
          ${R.carica ? '<div class="sa-msg">Aggiornamento…</div>' : ''}
          <div class="sa-tiles">
            <div class="sa-card sa-tile"><span>Walk-in</span><b>${C.tot}</b><em>${(D.ingressi || []).length ? 'nel periodo' : 'nessuno nel periodo'}${D.appArrivati ? ` · in più ${D.appArrivati} client${D.appArrivati === 1 ? 'e' : 'i'} da appuntamento` : ''}</em></div>
            <div class="sa-card sa-tile"><span>Assegnati</span><b>${C.ass}</b><em>${pct(C.ass, C.tot)} dei walk-in</em></div>
            <div class="sa-card sa-tile"><span>Presi in carico</span><b>${C.presi}</b><em>${pct(C.presi, C.ass)} degli assegnati</em></div>
            <div class="sa-card sa-tile"><span>Tempo medio di risposta</span><b>${durata(C.rispMedia)}</b><em>da assegnato a preso in carico</em></div>
            <div class="sa-card sa-tile"><span>Tempo medio con il cliente</span><b>${durata(C.clienteMedia)}</b><em>da preso in carico a di nuovo disponibile</em></div>
          </div>

          <div class="sa-rep-2">
            <div class="sa-card"><div class="sa-card-h"><div><h3>Walk-in assegnati per consulente</h3><p class="sa-hint">Quanti clienti ha ricevuto ciascuno e che percentuale del totale assegnato.</p></div>${bottoniTipo('cons', 'bar')}</div>
              <div class="sa-chart" style="height:${altezza(tipoG('cons', 'bar'), righeCons.length)}px"><canvas id="saChCons" role="img" aria-label="Walk-in assegnati per consulente"></canvas></div>
              <table class="sa-tbl"><thead><tr><th>Consulente</th><th>Assegnati</th><th>% sul totale</th><th>Presi in carico</th><th>Risposta media</th><th>Con il cliente (media)</th></tr></thead><tbody>
                ${righeCons.map(c => { const p = C.per[c]; return `<tr><td>${esc(c)}</td><td><b>${p.n}</b></td><td>${pct(p.n, C.ass)}</td><td>${p.presi}</td><td>${durata(C.media(p.risp))}</td><td>${durata(C.media(p.cliente))}</td></tr>`; }).join('')}
              </tbody></table></div>
            <div class="sa-card"><div class="sa-card-h"><div><h3>Marchi richiesti nei walk-in</h3><p class="sa-hint">Su ${conVetture} walk-in con almeno una vettura indicata. Un cliente che chiede due modelli dello stesso marchio conta una volta.</p></div>${bottoniTipo('marchi', 'bar')}</div>
              <div class="sa-chart" style="height:${altezza(tipoG('marchi', 'bar'), Math.min(marchi.length, 12))}px"><canvas id="saChMarchi" role="img" aria-label="Marchi richiesti nei walk-in"></canvas></div>
              <table class="sa-tbl"><thead><tr><th>Marchio</th><th>Walk-in</th><th>% walk-in</th><th>Vetture chieste</th><th>Presi in carico</th><th>Modelli più chiesti</th></tr></thead><tbody>
                ${marchi.map(([m, k]) => `<tr><td>${esc(m)}</td><td><b>${k.walkin}</b></td><td>${pct(k.walkin, conVetture)}</td><td>${k.vetture}</td><td>${pct(k.presi, k.walkin)}</td><td class="sa-hint">${esc(Object.entries(k.modelli).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, q]) => n + (q > 1 ? ' ×' + q : '')).join(', '))}</td></tr>`).join('') || '<tr><td colspan="6" class="sa-hint">Nessuna vettura indicata nel periodo.</td></tr>'}
              </tbody></table></div>
          </div>

          <div class="sa-card"><div class="sa-card-h"><div><h3>Minuti medi al giorno in ogni stato</h3><p class="sa-hint">${{ bar: 'Media sui giorni in cui il consulente è stato in salone.', doughnut: 'Come si divide il tempo di tutto il salone nel periodo.', line: 'Minuti medi per consulente presente, ' + (C.B.mensile ? 'mese per mese.' : 'giorno per giorno.') }[tipoG('stati', 'bar')]} A ogni chiusura del salone gli stati rimasti accesi si chiudono da soli.</p></div>${bottoniTipo('stati', 'bar')}</div>
            ${tipoG('stati', 'bar') === 'bar' ? `<div class="sa-legend">${Object.keys(STATI).map(k => `<span>${bollino(k)} ${STATI[k].t}</span>`).join('')}</div>` : ''}
            <div class="sa-chart" style="height:${tipoG('stati', 'bar') === 'bar' ? cons.length * 34 + 60 : 280}px"><canvas id="saChStati" role="img" aria-label="Minuti in ogni stato"></canvas></div>
            <table class="sa-tbl"><thead><tr><th>Consulente</th><th>Giorni</th>${Object.keys(STATI).map(k => `<th>${bollino(k)} ${STATI[k].t} / giorno</th>`).join('')}<th>Durata media di uno stato</th><th>Cambi di stato</th></tr></thead><tbody>
              ${cons.map(c => { const t = C.T[c], g = t.giorni.size || 0, tot = Object.keys(STATI).reduce((a, k) => a + t[k], 0), np = Object.keys(STATI).reduce((a, k) => a + t.periodi[k], 0);
                  return `<tr><td>${esc(c)}</td><td>${g}</td>${Object.keys(STATI).map(k => `<td>${g ? durata(t[k] / g) : '—'}<small class="sa-hint"> ${tot ? pct(t[k], tot) : ''}</small></td>`).join('')}<td>${np ? durata(tot / np) : '—'}</td><td>${t.cambi}</td></tr>`; }).join('')}
            </tbody></table></div>

          <div class="sa-card"><div class="sa-list-h"><div><h3>Storico dei cambi di stato</h3><p class="sa-hint">Ogni cambio con la durata dello stato precedente. ${cambi.length > 400 ? 'Mostro gli ultimi 400.' : ''}</p></div>
              <select class="sa-sel sa-sel-a" data-fcons><option value="">Tutti i consulenti</option>${cons.map(c => `<option ${filtro === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
            <div class="sa-scroll"><table class="sa-tbl"><thead><tr><th>Quando</th><th>Consulente</th><th>Da</th><th>A</th><th>Durata stato precedente</th><th>Motivo</th><th>Cliente</th></tr></thead><tbody>
              ${cambi.slice(0, 400).map(e => `<tr><td>${esc(e.atIt || dataOra(e.at))}</td><td>${esc(e.nome)}</td><td>${lab(e.da)}</td><td>${lab(e.a)}</td><td>${e.da ? durata(e.minuti) : '—'}</td><td class="sa-hint">${esc(e.motivo || '')}${e.chi && !/consulente|sistema/i.test(e.motivo || '') && !String(e.motivo || '').includes(e.chi) ? ' · ' + esc(e.chi) : ''}</td><td>${esc(e.clientePrec || '')}</td></tr>`).join('') || '<tr><td colspan="7" class="sa-hint">Nessun cambio di stato nel periodo.</td></tr>'}
            </tbody></table></div></div>`;
        disegnaGrafici(C, righeCons, marchi, cons);
    }
    const altezza = (tipo, n) => tipo === 'bar' ? Math.max(160, n * 32 + 40) : 280;
    function disegnaGrafici(C, righeCons, marchi, cons) {
        if (typeof Chart === 'undefined') return;
        const css = getComputedStyle(document.getElementById('salonePage'));
        const ink = css.getPropertyValue('--sa-ink').trim() || '#eef1f6', ink2 = css.getPropertyValue('--sa-ink2').trim() || '#9aa3b2';
        const line = css.getPropertyValue('--sa-line').trim() || '#2a2e3b', card = css.getPropertyValue('--sa-card').trim() || '#171a23';
        const nuovo = (id, cfg) => { const el = document.getElementById(id); if (el) grafici.push(new Chart(el, cfg)); };
        const tip = { backgroundColor: '#0b0e14', borderColor: line, borderWidth: 1, titleColor: ink, bodyColor: ink, padding: 10 };
        const legenda = { display: true, position: 'bottom', labels: { color: ink2, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', padding: 14 } };
        // barre ORIZZONTALI: i nomi si leggono dritti a sinistra, mai storti
        const barre = (labels, data, colori, fmt) => ({ type: 'bar', data: { labels, datasets: [{ data, backgroundColor: colori, borderRadius: 4, maxBarThickness: 22 }] },
            options: { responsive: true, maintainAspectRatio: false, animation: false, indexAxis: 'y',
                plugins: { legend: { display: false }, tooltip: Object.assign({ callbacks: { label: x => ' ' + fmt(x.raw) } }, tip) },
                scales: { x: { beginAtZero: true, ticks: { color: ink2, precision: 0 }, grid: { color: line }, border: { display: false } },
                          y: { grid: { display: false }, ticks: { color: ink, autoSkip: false, font: { size: 12.5 } }, border: { display: false } } } } });
        const ciambella = (labels, data, colori, fmt) => ({ type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: colori, borderColor: card, borderWidth: 2 }] },
            options: { responsive: true, maintainAspectRatio: false, animation: false, cutout: '62%',
                plugins: { legend: Object.assign({}, legenda, { position: 'right' }), tooltip: Object.assign({ callbacks: { label: x => ` ${x.label}: ${fmt(x.raw)}` } }, tip) } } });
        const linee = (series, fmt, asseY) => ({ type: 'line', data: { labels: C.B.etichette, datasets: series.map(s => ({ label: s.nome, data: s.dati, borderColor: s.col, backgroundColor: s.col,
                borderWidth: 2, pointRadius: C.B.chiavi.length > 40 ? 0 : 3, pointHoverRadius: 5, tension: .25, spanGaps: true })) },
            options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
                plugins: { legend: legenda, tooltip: Object.assign({ callbacks: { label: x => ` ${x.dataset.label}: ${fmt(x.raw)}` } }, tip) },
                scales: { x: { grid: { display: false }, ticks: { color: ink2, maxRotation: 0, autoSkip: true, autoSkipPadding: 14 }, border: { display: false } },
                          y: { beginAtZero: true, ticks: { color: ink2, precision: 0 }, grid: { color: line }, border: { display: false }, title: asseY ? { display: true, text: asseY, color: ink2 } : undefined } } } });
        const fWalk = v => `${v} walk-in`;
        // 1) walk-in per consulente: ogni consulente ha sempre il suo colore
        const colCons = n => SERIE[cons.indexOf(n) % SERIE.length] || ALTRI;
        const t1 = tipoG('cons', 'bar');
        if (t1 === 'bar') nuovo('saChCons', barre(righeCons, righeCons.map(c => C.per[c].n), '#22c3a6', v => `${v} walk-in · ${pct(v, C.ass)} del totale`));
        else if (t1 === 'doughnut') { const L = righeCons.filter(c => C.per[c].n); nuovo('saChCons', ciambella(L, L.map(c => C.per[c].n), L.map(colCons), v => `${v} walk-in · ${pct(v, C.ass)}`)); }
        else nuovo('saChCons', linee(righeCons.map(c => ({ nome: c, col: colCons(c), dati: C.B.chiavi.map(k => (C.tCons[c] || {})[k] || 0) })), fWalk, 'walk-in'));
        // 2) marchi: i primi 7 col loro colore, il resto in "Altri marchi"
        const t2 = tipoG('marchi', 'bar');
        const top7 = marchi.slice(0, 7), resto = marchi.slice(7);
        if (t2 === 'bar') { const top = marchi.slice(0, 12); nuovo('saChMarchi', barre(top.map(x => x[0]), top.map(x => x[1].walkin), '#3987e5', fWalk)); }
        else if (t2 === 'doughnut') {
            const L = top7.map(x => x[0]).concat(resto.length ? ['Altri marchi'] : []), V = top7.map(x => x[1].walkin).concat(resto.length ? [resto.reduce((a, x) => a + x[1].walkin, 0)] : []);
            nuovo('saChMarchi', ciambella(L, V, L.map((n, i) => n === 'Altri marchi' ? ALTRI : SERIE[i]), fWalk));
        } else {
            const S = top7.map((x, i) => ({ nome: x[0], col: SERIE[i], dati: C.B.chiavi.map(k => (C.tMarchi[x[0]] || {})[k] || 0) }));
            if (resto.length) S.push({ nome: 'Altri marchi', col: ALTRI, dati: C.B.chiavi.map(k => resto.reduce((a, x) => a + ((C.tMarchi[x[0]] || {})[k] || 0), 0)) });
            nuovo('saChMarchi', linee(S, fWalk, 'walk-in'));
        }
        // 3) tempo negli stati: verde / giallo / rosso fissi (sono stati, non serie)
        const t3 = tipoG('stati', 'bar');
        if (t3 === 'bar') nuovo('saChStati', { type: 'bar', data: { labels: cons, datasets: Object.keys(STATI).map(k => ({
                label: STATI[k].t, data: cons.map(c => { const t = C.T[c], g = t.giorni.size; return g ? Math.round(t[k] / g) : 0; }),
                backgroundColor: COL[k], borderColor: card, borderWidth: { right: 2 }, borderSkipped: false, maxBarThickness: 22 })) },
            options: { responsive: true, maintainAspectRatio: false, animation: false, indexAxis: 'y',
                plugins: { legend: { display: false }, tooltip: Object.assign({ mode: 'index', intersect: false, callbacks: { label: x => ` ${x.dataset.label}: ${durata(x.raw)} al giorno` } }, tip) },
                scales: { x: { stacked: true, beginAtZero: true, title: { display: true, text: 'minuti medi al giorno', color: ink2 }, ticks: { color: ink2 }, grid: { color: line }, border: { display: false } },
                          y: { stacked: true, grid: { display: false }, ticks: { color: ink, autoSkip: false, font: { size: 12.5 } }, border: { display: false } } } } });
        else if (t3 === 'doughnut') {
            const K = Object.keys(STATI), V = K.map(k => Math.round(cons.reduce((a, c) => a + C.T[c][k], 0))), tot = V.reduce((a, b) => a + b, 0);
            nuovo('saChStati', ciambella(K.map(k => STATI[k].t), V, K.map(k => COL[k]), v => `${durata(v)} · ${pct(v, tot)}`));
        } else nuovo('saChStati', linee(Object.keys(STATI).map(k => ({ nome: STATI[k].t, col: COL[k],
                dati: C.B.chiavi.map(b => { const n = C.tPres[b] ? C.tPres[b].size : 0; return n ? Math.round(C.tStati[k][b] / n) : null; }) })), v => durata(v), 'minuti per consulente'));
    }
    function onClickReport(e) {
        const ct = e.target.closest('[data-ct]');
        if (ct) { const [id, t] = ct.dataset.ct.split('|'); tipiG[id] = t; try { localStorage.setItem(LS_T, JSON.stringify(tipiG)); } catch (x) { /* */ } render(); return true; }
        const p = e.target.closest('[data-preset]');
        if (p) { st.rep.preset = p.dataset.preset; [st.rep.da, st.rep.a] = periodo(p.dataset.preset); caricaReport(); return true; }
        return false;
    }
    function onChangeReport(e) {
        const R = st.rep;
        if (e.target.matches('[data-rda],[data-ra]')) {
            const da = root.querySelector('[data-rda]').value, a = root.querySelector('[data-ra]').value;
            if (da && a) { R.da = da <= a ? da : a; R.a = da <= a ? a : da; R.preset = ''; caricaReport(); }
            return;
        }
        if (e.target.matches('[data-fcons]')) { R.filtroCons = e.target.value; render(); }
    }

    /* ================= CHAT ================= */
    /* ---------- AVVISI DEI MESSAGGI DELLA CHAT ----------
       suono (diverso da quello dei clienti), notifica del browser (se permessa, clic = apre la chat),
       numero dei non letti nel titolo della scheda e sul bollino della chat. */
    const Avviso = (function () {
        let base = null, chiesto = false;
        // il permesso per le notifiche del browser si chiede al primo clic sulla pagina (i browser lo vogliono cosi')
        document.addEventListener('click', () => {
            if (chiesto || !window.Notification || Notification.permission !== 'default' || !can()) return;
            chiesto = true; try { Notification.requestPermission(); } catch (e) { /* */ }
        }, true);
        function suono() {
            try {
                const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
                const c = new C();
                [[660, 0], [990, .14]].forEach(([f, d]) => {
                    const o = c.createOscillator(), g = c.createGain();
                    o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(c.destination);
                    g.gain.setValueAtTime(.0001, c.currentTime + d); g.gain.exponentialRampToValueAtTime(.2, c.currentTime + d + .02); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + d + .28);
                    o.start(c.currentTime + d); o.stop(c.currentTime + d + .3);
                });
            } catch (e) { /* */ }
        }
        // niente banner in alto (basta il bollino della chat): suono + notifica del browser
        function messaggio(lista, apri) {
            const [k, m] = lista[lista.length - 1];
            const chi = m.nome || 'Un collega';
            suono();
            try {
                if (window.Notification && Notification.permission === 'granted') {
                    const n = new Notification('💬 ' + chi + (k === 'GRUPPO' ? ' · Gruppo salone' : ''), { body: String(m.testo || ''), tag: 'sa-chat-' + k, renotify: true });
                    n.onclick = () => { window.focus(); apri(k); n.close(); };
                }
            } catch (e) { /* */ }
        }
        function titolo(n) {
            if (base === null) base = document.title.replace(/^\(\d+\+?\) 💬 /, '');
            document.title = n ? `(${n > 99 ? '99+' : n}) 💬 ${base}` : base;
        }
        return { messaggio, titolo };
    })();

    const EMOJI = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '🙂', '😉', '😍', '😘', '😎', '🤩', '🥳', '😏', '🤔', '🤨', '😐', '🙄', '😬', '😴', '😮', '😯', '😲', '😳', '🥺', '😢', '😭', '😤', '😡', '🤯', '😱', '🤗', '🤫', '🤐', '😇',
        '👍', '👎', '👌', '✌️', '🤞', '👏', '🙌', '🙏', '💪', '👋', '🤝', '👀', '❤️', '🧡', '💛', '💚', '💙', '💜', '🔥', '⭐', '✨', '🎉', '✅', '❌', '⚠️', '❗', '❓', '💯', '⏰', '📞', '📅', '📝', '💶', '🚗', '🚙', '🔑', '🏁', '☕', '🍕'];
    const RAPIDE = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
    const Chat = (function () {
        let el = null, aperto = false, conv = null, dopo = 0, timer = null, io = null, utenti = [], risposta = null, caricata = false, vietata = false;
        const msgs = {}, nonLetti = {};
        const nomeConv = k => k === 'GRUPPO' ? '👥 Gruppo salone' : (() => { const [, a, b] = k.split('_').map(Number); const altro = io && a === io.id ? b : a; const u = utenti.find(x => x.id === altro); return u ? u.nome : 'Chat privata'; })();
        const convCon = id => 'P_' + Math.min(io.id, id) + '_' + Math.max(io.id, id);
        function crea() {
            if (el) return;
            el = document.createElement('div');
            el.className = 'sa-chat';
            el.innerHTML = `<button type="button" class="sa-chat-fab" aria-label="Apri la chat">💬 <span>Chat</span><i class="sa-badge" hidden></i></button>
              <div class="sa-chat-p" hidden>
                <header><button type="button" class="sa-chat-back" hidden aria-label="Torna alle chat">‹</button><b class="sa-chat-tit">Chat</b><button type="button" class="sa-chat-min" aria-label="Riduci">—</button></header>
                <div class="sa-chat-list"></div>
                <div class="sa-chat-conv" hidden><div class="sa-chat-msgs"></div>
                  <div class="sa-chat-reply" hidden></div>
                  <div class="sa-chat-in"><button type="button" class="sa-emo-b" title="Emoji">😊</button><textarea rows="1" placeholder="Scrivi un messaggio…"></textarea><button type="button" class="sa-send" title="Invia">➤</button></div>
                  <div class="sa-emo" hidden>${EMOJI.map(x => `<button type="button" data-emo="${x}">${x}</button>`).join('')}</div>
                </div>
              </div>`;
            document.body.appendChild(el);
            el.querySelector('.sa-chat-fab').addEventListener('click', () => apri(true));
            el.querySelector('.sa-chat-min').addEventListener('click', () => apri(false));
            el.querySelector('.sa-chat-back').addEventListener('click', () => { conv = null; vista(); });
            el.querySelector('.sa-chat-list').addEventListener('click', e => { const b = e.target.closest('[data-conv]'); if (b) entra(b.dataset.conv); });
            const ta = el.querySelector('textarea');
            ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); invia(); } });
            ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(110, ta.scrollHeight) + 'px'; });
            el.querySelector('.sa-send').addEventListener('click', invia);
            el.querySelector('.sa-emo-b').addEventListener('click', () => { const p = el.querySelector('.sa-emo'); p.hidden = !p.hidden; });
            el.querySelector('.sa-emo').addEventListener('click', e => { const b = e.target.closest('[data-emo]'); if (!b) return; ta.value += b.dataset.emo; ta.focus(); });
            el.querySelector('.sa-chat-reply').addEventListener('click', e => { if (e.target.closest('[data-annulla]')) { risposta = null; barraRisposta(); } });
            el.querySelector('.sa-chat-msgs').addEventListener('click', onMsgClick);
        }
        function mostra(on) {
            if (on && !can()) return;
            crea(); el.style.display = on && !vietata ? '' : 'none';
            if (on) avvia();
        }
        // fuori dal salone il pulsante non si vede, ma i messaggi continuano ad arrivare (suono, notifica, titolo)
        function ascolta() { if (!can()) return; crea(); if (!aperta) el.style.display = 'none'; avvia(); }
        function apri(on) {
            aperto = on;
            el.querySelector('.sa-chat-fab').hidden = on;
            el.querySelector('.sa-chat-p').hidden = !on;
            if (on) { vista(); if (conv) segnaLetto(conv); }
        }
        async function avvia() {
            if (timer || vietata) return;
            try { const d = await api('/chat/utenti'); utenti = d.utenti || []; io = d.io; }
            catch (e) { if (/chat/i.test(e.message)) { vietata = true; el.style.display = 'none'; return; } }
            await giro();
            timer = setInterval(giro, 3000);
        }
        let azzerata = null;
        async function giro() {
            try {
                let d = await api('/chat/aggiornamenti?dopo=' + dopo);
                // un Admin ha eliminato le chat: si svuota tutto e si ricarica da capo
                if (azzerata !== null && d.azzerata && d.azzerata !== azzerata) {
                    Object.keys(msgs).forEach(k => delete msgs[k]); dopo = 0;
                    d = await api('/chat/aggiornamenti?dopo=0');
                    if (aperto && conv) disegnaMsgs();
                }
                azzerata = d.azzerata || 0;
                let cambiato = false;
                const nuovi = [];
                Object.entries(d.conv || {}).forEach(([k, v]) => {
                    const L = msgs[k] = msgs[k] || [];
                    (v.messaggi || []).forEach(m => {
                        const i = L.findIndex(x => x.id === m.id);
                        if (i >= 0) L[i] = m; else { L.push(m); if (caricata && io && m.da !== io.id) nuovi.push([k, m]); }
                        cambiato = true;
                    });
                    L.sort((a, b) => a.ts - b.ts);
                    nonLetti[k] = (aperto && conv === k) ? 0 : v.nonLetti || 0;
                });
                dopo = Math.max(dopo, d.ora || 0);
                // messaggio nuovo di un altro: suono, avviso in alto, notifica del browser (non se sto gia' leggendo quella chat)
                const leggo = k => aperto && conv === k && document.visibilityState === 'visible';
                const daAvvisare = nuovi.filter(([k]) => !leggo(k));
                if (daAvvisare.length) Avviso.messaggio(daAvvisare, k => { if (!aperta) open(); apri(true); entra(k); });   // clic sulla notifica: si va nel salone con la chat aperta
                caricata = true;
                badge();
                if (aperto) { if (conv) { if (cambiato) disegnaMsgs(); if (nonLetti[conv] === 0 && cambiato) segnaLetto(conv); } else vista(); }
            } catch (e) { /* rete: si riprova */ }
        }
        function badge() {
            const n = Object.values(nonLetti).reduce((a, b) => a + b, 0), b = el.querySelector('.sa-badge');
            b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
            Avviso.titolo(n);                    // "(2) 💬 ..." nel titolo della scheda del browser
        }
        function vista() {
            const lista = el.querySelector('.sa-chat-list'), cv = el.querySelector('.sa-chat-conv');
            el.querySelector('.sa-chat-back').hidden = !conv;
            el.querySelector('.sa-chat-tit').textContent = conv ? nomeConv(conv) : 'Chat del salone';
            lista.hidden = !!conv; cv.hidden = !conv;
            if (conv) { disegnaMsgs(); return; }
            const ultimo = k => { const L = msgs[k] || []; return L[L.length - 1]; };
            const righe = [{ k: 'GRUPPO', nome: '👥 Gruppo salone', sub: 'Tutti' }].concat(utenti.map(u => ({ k: convCon(u.id), nome: u.nome, sub: ruolo(u.role) })));
            righe.sort((a, b) => ((ultimo(b.k) || {}).ts || (b.k === 'GRUPPO' ? 1 : 0)) - ((ultimo(a.k) || {}).ts || (a.k === 'GRUPPO' ? 1 : 0)));
            lista.innerHTML = righe.map(r => { const u = ultimo(r.k), n = nonLetti[r.k] || 0; return `<button type="button" class="sa-cl ${n ? 'nl' : ''}" data-conv="${r.k}">
                <span class="sa-av">${r.k === 'GRUPPO' ? '👥' : esc(iniziali(r.nome))}</span>
                <span class="sa-cl-t"><b>${esc(r.nome.replace('👥 ', ''))}</b><em>${u ? esc((u.da === io.id ? 'Tu: ' : r.k === 'GRUPPO' ? u.nome.split(' ')[0] + ': ' : '') + u.testo.slice(0, 60)) : esc(r.sub)}</em></span>
                ${u ? `<small>${ora(u.ts)}</small>` : ''}${n ? `<i class="sa-badge">${n}</i>` : ''}</button>`; }).join('')
                + (utenti.length ? '' : '<p class="sa-hint" style="padding:10px 14px">Nessun altro utente con accesso al salone, per ora.</p>');
        }
        const ruolo = r => ({ FRONT_OFFICE: 'Front Office', CONSULENZA: 'Consulenza', ADMIN: 'Admin' }[r] || r || '');
        const iniziali = n => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
        function entra(k) { conv = k; risposta = null; barraRisposta(); vista(); segnaLetto(k); el.querySelector('textarea').focus(); }
        async function segnaLetto(k) { nonLetti[k] = 0; badge(); try { await post('/chat/letto', { conv: k }); } catch (e) { /* */ } }
        function disegnaMsgs() {
            const box = el.querySelector('.sa-chat-msgs'), L = msgs[conv] || [];
            const inFondo = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
            let giornoPrec = '';
            box.innerHTML = L.length ? L.map(m => {
                const mio = io && m.da === io.id, g = isoRoma(new Date(m.ts));
                const sep = g !== giornoPrec ? `<div class="sa-sep"><span>${g === oggi() ? 'Oggi' : giornoLungo(g)}</span></div>` : ''; giornoPrec = g;
                const rif = m.rispostaA ? L.find(x => x.id === m.rispostaA) : null;
                const rz = Object.entries(m.reazioni || {});
                return sep + `<div class="sa-m ${mio ? 'mio' : ''}" data-id="${m.id}">
                  <div class="sa-bub">
                    ${!mio && conv === 'GRUPPO' ? `<b class="sa-m-n">${esc(m.nome)}</b>` : ''}
                    ${rif ? `<button type="button" class="sa-quote" data-vai="${rif.id}"><b>${esc(rif.da === (io && io.id) ? 'Tu' : rif.nome)}</b><span>${esc(rif.testo.slice(0, 90))}</span></button>` : ''}
                    <div class="sa-m-t">${esc(m.testo).replace(/\n/g, '<br>')}</div>
                    <small>${ora(m.ts)}</small>
                    <div class="sa-m-a"><button type="button" data-rispondi="${m.id}" title="Rispondi">↩</button><button type="button" data-reagisci="${m.id}" title="Reagisci">😊</button></div>
                  </div>
                  ${rz.length ? `<div class="sa-rz">${rz.map(([e, chi]) => `<button type="button" class="${io && chi.includes(io.nome) ? 'mia' : ''}" data-rz="${m.id}" data-e="${e}" title="${esc(chi.join(', '))}">${e} ${chi.length}</button>`).join('')}</div>` : ''}
                </div>`;
            }).join('') : '<p class="sa-hint" style="text-align:center;padding:24px">Nessun messaggio: scrivi il primo.</p>';
            if (inFondo || !box.dataset.v) box.scrollTop = box.scrollHeight;
            box.dataset.v = '1';
        }
        async function onMsgClick(e) {
            const r = e.target.closest('[data-rispondi]');
            if (r) { risposta = (msgs[conv] || []).find(x => x.id === r.dataset.rispondi) || null; barraRisposta(); el.querySelector('textarea').focus(); return; }
            const re = e.target.closest('[data-reagisci]');
            if (re) {
                document.querySelectorAll('.sa-rapide').forEach(x => x.remove());
                const p = document.createElement('div'); p.className = 'sa-rapide';
                p.innerHTML = RAPIDE.map(x => `<button type="button" data-e="${x}">${x}</button>`).join('');
                re.closest('.sa-bub').appendChild(p);
                p.addEventListener('click', ev => { const b = ev.target.closest('[data-e]'); if (!b) return; ev.stopPropagation(); p.remove(); reagisci(re.dataset.reagisci, b.dataset.e); });
                setTimeout(() => document.addEventListener('click', function via(ev) { if (!p.contains(ev.target)) { p.remove(); document.removeEventListener('click', via); } }), 0);
                return;
            }
            const z = e.target.closest('[data-rz]'); if (z) { reagisci(z.dataset.rz, z.dataset.e); return; }
            const v = e.target.closest('[data-vai]');
            if (v) { const t = el.querySelector(`.sa-m[data-id="${v.dataset.vai}"]`); if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('lampo'); setTimeout(() => t.classList.remove('lampo'), 1200); } }
        }
        async function reagisci(id, emoji) {
            try { const d = await post('/chat/reazione', { conv, id, emoji }); const L = msgs[conv] || [], i = L.findIndex(x => x.id === id); if (i >= 0 && d.messaggio) L[i] = d.messaggio; disegnaMsgs(); }
            catch (e) { alert(e.message); }
        }
        function barraRisposta() {
            const b = el.querySelector('.sa-chat-reply');
            b.hidden = !risposta;
            if (risposta) b.innerHTML = `<div><b>Rispondi a ${esc(risposta.da === (io && io.id) ? 'te stesso' : risposta.nome)}</b><span>${esc(risposta.testo.slice(0, 100))}</span></div><button type="button" data-annulla aria-label="Annulla risposta">✕</button>`;
        }
        async function invia() {
            const ta = el.querySelector('textarea'), testo = ta.value.trim();
            if (!testo || !conv) return;
            ta.value = ''; ta.style.height = 'auto'; el.querySelector('.sa-emo').hidden = true;
            const rid = risposta && risposta.id; risposta = null; barraRisposta();
            try { const d = await post('/chat/messaggi', { conv, testo, rispostaA: rid }); (msgs[conv] = msgs[conv] || []).push(d.messaggio); disegnaMsgs(); el.querySelector('.sa-chat-msgs').scrollTop = 1e9; }
            catch (e) { ta.value = testo; alert('Messaggio non inviato: ' + e.message); }
        }
        return { mostra, ascolta };
    })();

    window.Salone = { can, canFull, entraDiretto, refreshNav, open, hide };
})();
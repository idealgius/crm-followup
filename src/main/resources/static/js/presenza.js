/* =====================================================================
   PRESENZA IN TEMPO REALE + AGGIORNAMENTO AUTOMATICO (tutte le pagine del CRM)
   - FLUSSO sempre aperto con il server (/api/presenza/flusso): l'Admin riceve ogni cambio di presenza
     nel momento in cui succede (evento "presenze" -> Gestione utenti), e la "versione" del server
   - un "battito" ogni 10 s (/api/presenza/battito): se internet cade o il PC va in standby, dopo 35 s
     l'utente risulta disconnesso
   - dopo un nuovo deploy la versione cambia: la pagina si ricarica da sola. Prima compare un avviso
     con il conto alla rovescia; se si sta scrivendo aspetta.
   ===================================================================== */
(function () {
    const API = '/api/presenza';
    let versione = null, t = null, avviso = null, ultimoTasto = 0, fermo = false, es = null;

    async function battito() {
        let d = null;
        try {
            const r = await fetch(API + '/battito', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
            d = await r.json().catch(() => null);
            if (r.ok && (!es || es.readyState === 2)) apriFlusso();     // es. appena fatto l'accesso
        } catch (e) { /* rete: si riprova */ }
        controlla(d && d.versione);
    }
    /* flusso in tempo reale: si ricollega da solo (anche dopo un deploy) */
    function apriFlusso() {
        if (!window.EventSource) return;
        try { if (es) es.close(); } catch (e) { /* */ }
        es = new EventSource(API + '/flusso');
        es.addEventListener('versione', e => controlla(String(e.data || '').replace(/"/g, '')));
        es.addEventListener('presenze', e => {
            try { window.dispatchEvent(new CustomEvent('crm:presenze', { detail: JSON.parse(e.data) })); } catch (x) { /* */ }
        });
    }
    function controlla(v) {
        if (!v) return;
        if (versione === null) { versione = v; return; }
        if (v !== versione && !avviso) mostraAvviso();
    }

    /* ---- nuovo deploy: avviso e ricarica ---- */
    // si sta scrivendo (tasto premuto negli ultimi 20 secondi in un campo): si aspetta
    const scrive = () => Date.now() - ultimoTasto < 20000;
    document.addEventListener('input', () => { ultimoTasto = Date.now(); }, true);
    document.addEventListener('keydown', () => { ultimoTasto = Date.now(); }, true);
    function mostraAvviso() {
        avviso = document.createElement('div');
        avviso.setAttribute('role', 'status');
        avviso.setAttribute('style', 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:10200;display:flex;align-items:center;gap:12px;'
            + 'padding:12px 14px 12px 18px;border-radius:14px;background:#14162a;color:#eef1f6;border:1.5px solid #f0c040;box-shadow:0 20px 50px -18px rgba(0,0,0,.8);'
            + 'font:600 13.5px Inter,system-ui,sans-serif;max-width:calc(100vw - 32px)');
        avviso.innerHTML = '<span style="font-size:18px">🔄</span><span data-t>Il CRM è stato aggiornato.</span>'
            + '<button type="button" data-ora style="border:0;border-radius:10px;padding:8px 14px;background:#f0c040;color:#1b1503;font:800 12.5px inherit;cursor:pointer">Ricarica ora</button>'
            + '<button type="button" data-dopo style="border:1px solid #3a3f55;border-radius:10px;padding:7px 12px;background:transparent;color:#cfd5e2;font:700 12px inherit;cursor:pointer">Tra poco</button>';
        document.body.appendChild(avviso);
        avviso.querySelector('[data-ora]').addEventListener('click', ricarica);
        avviso.querySelector('[data-dopo]').addEventListener('click', () => { fermo = true; testo('Ricarico tra 2 minuti (o premi “Ricarica ora”).'); setTimeout(() => { fermo = false; }, 120000); });
        let resta = 15;
        const giro = setInterval(() => {
            if (fermo) return;
            if (scrive()) { testo('Il CRM è stato aggiornato: ricarico appena finisci di scrivere.'); resta = 10; return; }
            testo('Il CRM è stato aggiornato: la pagina si ricarica tra ' + resta + ' s.');
            if (--resta < 0) { clearInterval(giro); ricarica(); }
        }, 1000);
    }
    const testo = s => { const e = avviso && avviso.querySelector('[data-t]'); if (e) e.textContent = s; };
    function ricarica() { try { sessionStorage.setItem('crmRicaricato', '1'); } catch (e) { /* */ } location.reload(); }

    /* ---- "Esci": disconnesso subito; finestra chiusa: dopo 20 s (un F5 non conta) ---- */
    window.addEventListener('pagehide', () => {
        try { navigator.sendBeacon(API + '/uscita', new Blob(['{}'], { type: 'application/json' })); } catch (e) { /* */ }
        try { if (es) es.close(); } catch (e) { /* */ }
    });
    function agganciaEsci() {
        if (typeof window.logout !== 'function' || window.logout.__pres) return;
        const orig = window.logout;
        const w = function () {
            const self = this, args = arguments;
            try { if (es) { es.close(); es = null; } } catch (e) { /* */ }
            fetch(API + '/uscita', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: '{"esci":true}' })
                .catch(() => { /* */ }).finally(() => orig.apply(self, args));
        };
        w.__pres = true; window.logout = w;
    }

    function avvia() {
        if (t) return;
        battito();
        apriFlusso();
        t = setInterval(battito, 10000);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') battito(); });
        setTimeout(agganciaEsci, 3000);   // dopo gli altri script (anche salone.js "aggancia" Esci)
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})();
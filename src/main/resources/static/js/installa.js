/* =====================================================================
   "INSTALLA IL CRM" (app sul computer / sul telefono)
   Il CRM resta il sito di sempre, ma installato ha la sua icona (desktop, barra di Windows, schermata
   Home del telefono) e si apre in una finestra sua, senza schede ne' barra degli indirizzi.
   - Chrome / Edge / Android: la voce "📥 Installa il CRM" nel menu utente apre la richiesta del browser
   - iPhone / iPad, Firefox o browser che non lo propone: la voce spiega come fare a mano
   - dentro l'app installata la voce non compare
   Nessun dato salvato sul computer: e' sempre il CRM online (manifest.json + icone in /img/app/).
   ===================================================================== */
(function () {
    let richiesta = null;      // evento del browser "si puo' installare"
    const inApp = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;
    const ua = navigator.userAgent;
    const iOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const edge = /Edg\//.test(ua), firefox = /Firefox\//.test(ua), android = /Android/i.test(ua);

    function voce() { return document.getElementById('navInstalla'); }
    function aggiorna() {
        const v = voce(); if (!v) return;
        if (inApp()) { v.style.display = 'none'; document.documentElement.classList.add('crm-app'); return; }
        v.style.display = 'flex';
    }

    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); richiesta = e; aggiorna(); });
    window.addEventListener('appinstalled', () => { richiesta = null; aggiorna(); finestra('installato'); });

    async function installa() {
        const m = document.getElementById('userDropdownMenu'); if (m) m.style.display = 'none';
        if (richiesta) {
            const r = richiesta; richiesta = null;
            try { r.prompt(); const scelta = await r.userChoice; if (scelta && scelta.outcome === 'accepted') return; }
            catch (e) { /* si mostra la spiegazione */ }
        }
        finestra(iOS ? 'ios' : firefox ? 'firefox' : 'manuale');
    }
    window.installaCRM = installa;

    function finestra(tipo) {
        const avvio = edge
            ? 'apri <b>edge://apps</b>, sul CRM premi <b>⋯</b> e attiva <b>“Avvio automatico all’accesso”</b>.'
            : 'apri <b>chrome://apps</b>, fai clic destro sull’icona <b>CRM Autoscala</b> e scegli <b>“Avvia l’app all’accesso”</b>.';
        const testi = {
            installato: ['✅ CRM installato', `<p>Ora trovi l’icona <b>CRM Autoscala</b> sul desktop e nel menu Start: si apre in una finestra sua.</p>
                ${android || iOS ? '' : `<p><b>Vuoi che si apra da solo quando accendi il PC?</b><br>${avvio.charAt(0).toUpperCase() + avvio.slice(1)}</p>`}`],
            ios: ['📥 Installa il CRM su iPhone / iPad', `<ol><li>Apri il CRM con <b>Safari</b></li><li>Tocca <b>Condividi</b> (il quadrato con la freccia in su)</li><li>Scegli <b>“Aggiungi alla schermata Home”</b> e poi <b>Aggiungi</b></li></ol>`],
            firefox: ['📥 Installa il CRM', `<p>Firefox non permette di installare i siti come app.</p><p>Apri il CRM con <b>Chrome</b> o <b>Edge</b> e usa di nuovo questa voce.</p>`],
            manuale: ['📥 Installa il CRM', android
                ? `<ol><li>Tocca il menu <b>⋮</b> di Chrome in alto a destra</li><li>Scegli <b>“Aggiungi a schermata Home”</b> oppure <b>“Installa app”</b></li></ol>`
                : `<p>Se il CRM è già installato lo trovi sul desktop o nel menu Start come <b>CRM Autoscala</b>.</p>
                   <p>Altrimenti: ${edge ? 'menu <b>⋯</b> di Edge → <b>App</b> → <b>“Installa questo sito come app”</b>' : 'nella barra degli indirizzi clicca l’icona <b>⊕ / 🖥️ “Installa”</b> a destra, oppure menu <b>⋮</b> → <b>“Trasmetti, salva e condividi”</b> → <b>“Installa pagina come app”</b>'}.</p>
                   <p><b>Per farlo aprire all’accensione del PC:</b> ${avvio}</p>`]
        };
        const [tit, corpo] = testi[tipo];
        const ov = document.createElement('div');
        ov.setAttribute('style', 'position:fixed;inset:0;z-index:10300;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px');
        ov.innerHTML = `<div role="dialog" aria-modal="true" style="background:var(--bg-card,#14162a);color:var(--text-primary,#eef1f6);border:1.5px solid var(--border,#2a2d3e);border-radius:16px;max-width:460px;width:100%;padding:22px 24px;box-shadow:0 24px 60px -20px rgba(0,0,0,.7);font:500 14px/1.5 Inter,system-ui,sans-serif">
            <h3 style="margin:0 0 10px;font-size:17px;font-weight:800">${tit}</h3>
            <div style="color:var(--text-secondary,#b9bfcc)">${corpo}</div>
            <div style="text-align:right;margin-top:14px"><button type="button" data-ok style="border:0;border-radius:10px;padding:9px 18px;background:#f0c040;color:#1b1503;font:800 13px inherit;cursor:pointer">Ho capito</button></div></div>`;
        ov.querySelectorAll('ol').forEach(o => { o.style.margin = '6px 0'; o.style.paddingLeft = '20px'; });
        document.body.appendChild(ov);
        const chiudi = () => { ov.remove(); document.removeEventListener('keydown', esc); };
        const esc = e => { if (e.key === 'Escape') chiudi(); };
        document.addEventListener('keydown', esc);
        ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-ok]')) chiudi(); });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aggiorna); else aggiorna();
    matchMedia('(display-mode: standalone)').addEventListener?.('change', aggiorna);
})();
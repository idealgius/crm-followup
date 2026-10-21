/* =====================================================================
   TELEFONO — piccoli aggiustamenti che il solo CSS non puo' fare.
   Vale solo su schermo stretto (sotto i 760px): su computer non fa niente.
   ===================================================================== */
(function () {
    'use strict';
    const stretto = () => window.matchMedia('(max-width:760px)').matches;

    // Grafici: su telefono le etichette dell'asse orizzontale possono
    // inclinarsi invece di accavallarsi, e i testi sono un filo piu' piccoli.
    function grafici() {
        if (!window.Chart || !Chart.register || grafici.fatto) return;
        grafici.fatto = true;
        Chart.register({
            id: 'crmTelefono',
            beforeInit(chart) {
                if (!stretto()) return;
                const o = chart.config && chart.config.options;
                if (!o) return;
                const sc = o.scales || {};
                Object.keys(sc).forEach(k => {
                    const s = sc[k];
                    if (!s || (k !== 'x' && s.axis !== 'x')) return;
                    if (o.indexAxis === 'y') return;            // barre orizzontali: l'asse x sono numeri
                    s.ticks = s.ticks || {};
                    if (!s.ticks.maxRotation) s.ticks.maxRotation = 55;
                });
                // legenda: sotto il grafico (a lato schiaccia la torta e taglia le scritte) e piu' compatta
                const lg = o.plugins && o.plugins.legend;
                if (lg && (lg.position === 'right' || lg.position === 'left')) lg.position = 'bottom';
                if (lg && lg.labels && !lg.labels.boxWidth) { lg.labels.boxWidth = 10; lg.labels.padding = 8; }
            }
        });
        if (stretto() && Chart.defaults && Chart.defaults.font) Chart.defaults.font.size = 11;
    }

    // Tabelle che sul telefono diventano schede (vedi mobile.css): ogni cella
    // riceve come etichetta il titolo della sua colonna. Le tabelle vengono
    // ridisegnate spesso, quindi si ricontrolla dopo ogni cambiamento.
    const TABELLE = 'table.contact-table';
    function etichette() {
        document.querySelectorAll(TABELLE).forEach(t => {
            const tit = [...t.querySelectorAll(':scope > thead th')].map(th => th.textContent.trim());
            if (!tit.length) return;
            t.querySelectorAll(':scope > tbody > tr').forEach(tr => {
                let i = 0;
                [...tr.children].forEach(td => {
                    const n = td.colSpan || 1;
                    if (n === 1 && tit[i] && !/^azion/i.test(tit[i]) && !td.hasAttribute('data-label')) td.setAttribute('data-label', tit[i]);
                    i += n;
                });
            });
        });
    }
    let giro = 0;
    function osserva() {
        if (osserva.fatto || !document.body) return;
        osserva.fatto = true;
        new MutationObserver(() => {
            if (!stretto() || giro) return;
            giro = requestAnimationFrame(() => { giro = 0; etichette(); });
        }).observe(document.body, { childList: true, subtree: true });
        if (stretto()) etichette();
    }

    function avvia() { grafici(); osserva(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
    window.addEventListener('load', grafici);
})();
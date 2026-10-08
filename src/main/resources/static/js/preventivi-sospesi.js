/* =====================================================================
   PREVENTIVI TELEFONICI IN SOSPESO — allert
   ---------------------------------------------------------------------
   Un preventivo e' "in sospeso" quando dal GIORNO DOPO il caricamento e'
   ancora nello stato iniziale "Preventivo telefonico generato" (weekend
   compreso: caricato venerdi', sabato e' gia' in sospeso). Dati da
   GET /api/preventivi-sospesi (solo per chi vede i Preventivi telefonici).

   Dove compare:
    - in basso a sinistra, su tutte le pagine: "⚠️ N preventivi in sospeso"
      (chiudibile: ricompare se il numero cambia);
    - in cima alla pagina Preventivi telefonici: avviso con "Vedi elenco";
    - l'elenco: cliente, telefono, vettura, consulente, caricato il / da chi,
      da quanti giorni (rosso dal 3° giorno), e "Apri" che porta al giorno
      del preventivo nella pagina.
   Si aggiorna ogni 5 minuti e ogni volta che si ricarica la pagina Preventivi.
   ===================================================================== */
// ===== Contenitore comune degli avvisi in basso a sinistra =====
// Visibile SOLO nella macro-area "In bound" (dashboard, follow-up, registro
// contatti, preventivi, ...): nascosto nella Home di selezione area e nelle
// pagine BI (Consegne, Stock).
window.InboundAvvisi = window.InboundAvvisi || (function () {
    const INBOUND = ['dashboardPage', 'followupsPage', 'waitingPage', 'contactsPage', 'promoPage',
        'adminPage', 'rentPage', 'servicePage', 'veicoliPage', 'preventiviPage', 'allChartsPage'];
    let el = null;
    function inInbound() {
        if (document.body.classList.contains('mh-home-on')) return false;
        return INBOUND.some(id => { const p = document.getElementById(id); return p && p.style.display !== 'none' && p.offsetParent !== null; });
    }
    function box() {
        if (!el) { el = document.createElement('div'); el.id = 'inbAvvisi'; document.body.appendChild(el); aggiorna(); }
        return el;
    }
    function aggiorna() { if (el) el.classList.toggle('off', !inInbound()); }
    setInterval(aggiorna, 700);
    return { box, aggiorna, inInbound };
})();

(function () {
    let dati = { count: 0, items: [] }, timer = null;
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const dataIt = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
    const giorniTxt = g => g === 1 ? 'da 1 giorno' : `da ${g} giorni`;

    async function aggiorna() {
        if (typeof currentUser === 'undefined' || !currentUser) return;
        try {
            const res = await fetch('/api/preventivi-sospesi');
            if (!res.ok) return;
            const d = await res.json();
            dati = d.visibile === false ? { count: 0, items: [] } : d;
            disegna();
        } catch (e) { /* riprova al prossimo giro */ }
    }

    function disegna() {
        injectCss();
        // --- avviso fisso in basso a sinistra ---
        let chip = document.getElementById('pvsChip');
        const chiuso = sessionStorage.getItem('pvs_chiuso') === String(dati.count);
        if (dati.count && !chiuso) {
            if (!chip) {
                chip = document.createElement('div'); chip.id = 'pvsChip'; chip.className = 'inb-avviso';
                window.InboundAvvisi.box().appendChild(chip);
                chip.addEventListener('click', e => {
                    if (e.target.closest('[data-x]')) { sessionStorage.setItem('pvs_chiuso', String(dati.count)); chip.remove(); return; }
                    apriElenco();
                });
            }
            chip.innerHTML = `<span class="pvs-ico">⚠️</span><span><b>${dati.count} ${dati.count === 1 ? 'preventivo telefonico' : 'preventivi telefonici'} in sospeso</b><em>ancora in "Preventivo generato" · clicca per l'elenco</em></span><button type="button" data-x title="Nascondi">✕</button>`;
        } else if (chip) chip.remove();
        // --- avviso in cima alla pagina Preventivi telefonici ---
        const page = document.getElementById('preventiviPage');
        if (page) {
            let ban = document.getElementById('pvsBanner');
            if (dati.count) {
                if (!ban) {
                    ban = document.createElement('div'); ban.id = 'pvsBanner';
                    const head = page.querySelector('.page-header');
                    if (head) head.parentNode.insertBefore(ban, head.nextSibling); else page.prepend(ban);
                    ban.addEventListener('click', e => { if (e.target.closest('[data-elenco]')) apriElenco(); });
                }
                const vecchio = Math.max(...dati.items.map(i => i.giorni || 0));
                ban.innerHTML = `<span class="pvs-ico">⚠️</span><div><b>${dati.count} ${dati.count === 1 ? 'preventivo è' : 'preventivi sono'} in sospeso</b>
                    <span>Nessun cambio di stato dal giorno dopo il caricamento · il più vecchio è fermo ${giorniTxt(vecchio)}</span></div>
                    <button type="button" class="btn-gold" data-elenco>Vedi elenco</button>`;
            } else if (ban) ban.remove();
        }
    }

    function apriElenco() {
        let ov = document.getElementById('pvsModal');
        if (!ov) {
            ov = document.createElement('div'); ov.id = 'pvsModal';
            document.body.appendChild(ov);
            ov.addEventListener('click', e => {
                if (e.target === ov || e.target.closest('[data-chiudi]')) { ov.style.display = 'none'; return; }
                const a = e.target.closest('[data-apri]');
                if (a) { ov.style.display = 'none'; vaiAlPreventivo(a.dataset.apri); }
            });
            document.addEventListener('keydown', e => { if (e.key === 'Escape') ov.style.display = 'none'; });
        }
        const items = dati.items || [];
        ov.innerHTML = `<div class="pvs-box" role="dialog" aria-modal="true">
            <header><div><h3>⚠️ Preventivi telefonici in sospeso (${items.length})</h3>
              <p>Ancora in "Preventivo telefonico generato" dal giorno dopo il caricamento · i più vecchi per primi</p></div>
              <button type="button" data-chiudi aria-label="Chiudi">✕</button></header>
            <div class="pvs-list">${items.length ? `<table><thead><tr><th>Da</th><th>Cliente</th><th>Vettura</th><th>Consulente</th><th>Tipo</th><th>Caricato</th><th></th></tr></thead><tbody>
              ${items.map(i => `<tr>
                <td><span class="pvs-badge ${i.giorni >= 3 ? 'alto' : ''}">${giorniTxt(i.giorni)}</span></td>
                <td><b>${esc(i.cliente)}</b><em>${esc(i.telefono || '')}</em></td>
                <td>${esc(i.marca || '')}<em>${esc(i.modello || '')}</em></td>
                <td>${esc(i.consulente || '')}</td>
                <td>${i.tipo === 'NOLEGGIO' ? 'Noleggio' : 'Vendita'}</td>
                <td>${dataIt(i.caricatoIl)}<em>${esc(i.caricatoDa || '')}</em></td>
                <td>${i.linkLead ? `<a href="${esc(i.linkLead)}" target="_blank" rel="noopener" title="Apri il lead">🔗</a>` : ''}<button type="button" class="btn-small" data-apri="${(i.caricatoIl || '').slice(0, 10)}">Apri</button></td>
              </tr>`).join('')}</tbody></table>` : '<p class="pvs-vuoto">Nessun preventivo in sospeso 👍</p>'}</div></div>`;
        ov.style.display = 'flex';
    }

    // porta alla pagina Preventivi, sul giorno di caricamento del preventivo
    function vaiAlPreventivo(giorno) {
        if (typeof showPage === 'function') showPage('preventivi');
        const f = document.getElementById('pvFrom'), t = document.getElementById('pvTo');
        if (f && t && giorno) { f.value = giorno; t.value = giorno; }
        if (typeof loadPreventivi === 'function') loadPreventivi();
    }

    // ogni volta che la pagina Preventivi si ricarica (es. dopo un cambio di stato) aggiorno anche l'allert
    function agganciaLoad() {
        if (typeof window.loadPreventivi !== 'function' || window.loadPreventivi.__pvs) return;
        const orig = window.loadPreventivi;
        window.loadPreventivi = function () { const r = orig.apply(this, arguments); setTimeout(aggiorna, 800); return r; };
        window.loadPreventivi.__pvs = true;
    }

    function avvia() {
        agganciaLoad();
        aggiorna();
        clearInterval(timer);
        timer = setInterval(() => { agganciaLoad(); aggiorna(); }, 5 * 60 * 1000);
    }
    // parte appena l'utente e' collegato
    const attesa = setInterval(() => { if (typeof currentUser !== 'undefined' && currentUser) { clearInterval(attesa); avvia(); } }, 1500);

    function injectCss() {
        if (document.getElementById('pvsStyle')) return;
        const st = document.createElement('style'); st.id = 'pvsStyle';
        st.textContent = `
#inbAvvisi { position:fixed; left:18px; bottom:18px; z-index:9000; display:flex; flex-direction:column; gap:10px; max-width:370px; }
#inbAvvisi.off { display:none; }
.inb-avviso { display:flex; align-items:center; gap:10px; padding:12px 12px 12px 14px; border-radius:14px; cursor:pointer;
  background:var(--bg-card,#141822); color:var(--text-primary,#eef2f7); border:1.5px solid #f0a030; box-shadow:0 14px 34px -12px rgba(0,0,0,.6); animation:pvsIn .35s ease-out; }
.inb-avviso:hover { border-color:#ffc35a; }
.inb-avviso b { display:block; font-size:13px; }
.inb-avviso em { display:block; font-style:normal; font-size:11.5px; color:var(--text-secondary,#98a2b3); margin-top:2px; }
.inb-avviso button { border:0; background:transparent; color:var(--text-secondary,#98a2b3); cursor:pointer; font-size:14px; padding:4px 6px; border-radius:8px; align-self:flex-start; }
.inb-avviso button:hover { background:rgba(140,150,170,.15); }
.pvs-ico { font-size:20px; }
@keyframes pvsIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
#pvsBanner { display:flex; align-items:center; gap:14px; margin:4px 0 16px; padding:12px 16px; border-radius:14px; border:1.5px solid rgba(240,160,48,.55); background:rgba(240,160,48,.1); }
#pvsBanner > div { flex:1; }
#pvsBanner b { display:block; font-size:14px; }
#pvsBanner span:not(.pvs-ico) { font-size:12.5px; color:var(--text-secondary,#98a2b3); }
#pvsModal { position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,.6); display:none; align-items:center; justify-content:center; padding:20px; }
.pvs-box { width:min(1080px,100%); max-height:88vh; display:flex; flex-direction:column; background:var(--bg-card,#141822); color:var(--text-primary,#eef2f7); border:1px solid var(--border,#2a3242); border-radius:16px; box-shadow:0 24px 60px rgba(0,0,0,.55); }
.pvs-box header { display:flex; justify-content:space-between; gap:12px; padding:18px 22px; border-bottom:1px solid var(--border,#2a3242); }
.pvs-box h3 { margin:0; font-size:17px; }
.pvs-box header p { margin:4px 0 0; font-size:12.5px; color:var(--text-secondary,#98a2b3); }
.pvs-box header button { border:0; background:rgba(140,150,170,.12); color:inherit; border-radius:10px; width:34px; height:34px; cursor:pointer; }
.pvs-list { overflow:auto; padding:6px 22px 18px; }
.pvs-list table { width:100%; border-collapse:collapse; font-size:13px; }
.pvs-list th { position:sticky; top:0; background:var(--bg-card,#141822); text-align:left; font-size:10.5px; letter-spacing:.6px; text-transform:uppercase; color:var(--text-secondary,#98a2b3); padding:10px 8px; border-bottom:1.5px solid var(--border,#2a3242); }
.pvs-list td { padding:9px 8px; border-bottom:1px solid var(--border,#2a3242); vertical-align:top; }
.pvs-list td em { display:block; font-style:normal; font-size:11.5px; color:var(--text-secondary,#98a2b3); margin-top:2px; }
.pvs-list td:last-child { white-space:nowrap; text-align:right; }
.pvs-list td a { text-decoration:none; margin-right:8px; }
.pvs-badge { display:inline-block; white-space:nowrap; padding:3px 9px; border-radius:999px; font-size:11.5px; font-weight:800; background:rgba(240,160,48,.18); color:#f0a030; }
.pvs-badge.alto { background:rgba(229,72,77,.18); color:#ff5a5f; }
.pvs-vuoto { padding:30px; text-align:center; color:var(--text-secondary,#98a2b3); }
.preventivo-card.pvs-sospeso { box-shadow:inset 4px 0 0 #f0a030; }
.preventivo-card.pvs-sospeso.alto { box-shadow:inset 4px 0 0 #ff5a5f; }
@media (max-width:700px) { #inbAvvisi { right:18px; max-width:none; } .pvs-list th:nth-child(5), .pvs-list td:nth-child(5) { display:none; } }`;
        document.head.appendChild(st);
    }

    injectCss();
    window.PreventiviSospesi = { aggiorna, apriElenco };
})();
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

    // NUOVO: ordine (piu' vecchi / piu' recenti), filtri per consulente e operatore,
    // Excel professionale (PreventiviExportController) di tutto o dei filtri scelti
    const F = { ord: 'asc', cons: '', op: '', tipo: '' };
    const nomeOp = i => (i.caricatoDa || '').trim() || 'Non indicato';
    const nomeCons = i => (i.consulente || '').trim() || 'Non indicato';
    const nomeTipo = i => i.tipo === 'NOLEGGIO' ? 'Noleggio' : 'Vendita';
    function filtrati() {
        const L = (dati.items || []).filter(i => (!F.cons || nomeCons(i) === F.cons) && (!F.op || nomeOp(i) === F.op) && (!F.tipo || nomeTipo(i) === F.tipo));
        const k = i => (i.caricatoIl || '') + '|' + String(1e6 - (i.giorni || 0)).padStart(7, '0');
        return L.sort((x, y) => F.ord === 'asc' ? k(x).localeCompare(k(y)) : k(y).localeCompare(k(x)));
    }
    const conFiltri = () => !!(F.cons || F.op || F.tipo);
    // intestazione con freccetta: apre il menu dei filtri di quella colonna
    const th = (lab, pop, on) => `<th><button type="button" class="pvs-th ${on ? 'on' : ''}" data-pop="${pop}" title="Filtra / ordina">${lab}<i>▾</i></button></th>`;
    function disegnaLista(ov) {
        const tutti = dati.items || [], items = filtrati(), filtri = conFiltri();
        ov.querySelector('[data-n]').textContent = filtri ? `${items.length} di ${tutti.length}` : `${tutti.length}`;
        ov.querySelector('[data-sub]').textContent = 'Ancora in "Preventivo telefonico generato" dal giorno dopo il caricamento · ' + (F.ord === 'asc' ? 'i più vecchi per primi' : 'i più recenti per primi');
        ov.querySelector('[data-reset]').hidden = !filtri;
        const xb = ov.querySelector('[data-xls]'); xb.disabled = !items.length;
        xb.innerHTML = `⬇ Excel${filtri ? ' (' + items.length + ')' : ''}`;
        xb.title = filtri ? 'Scarica in Excel i preventivi filtrati' : 'Scarica in Excel tutti i preventivi in sospeso';
        const head = `<thead><tr>${th('Da', 'ord', F.ord !== 'asc')}<th>Cliente</th><th>Vettura</th>${th('Consulente', 'cons', !!F.cons)}${th('Tipo', 'tipo', !!F.tipo)}${th('Caricato', 'op', !!F.op)}<th></th></tr></thead>`;
        ov.querySelector('.pvs-list').innerHTML = `<table>${head}<tbody>${items.length ? items.map(i => `<tr>
                <td><span class="pvs-badge ${i.giorni >= 3 ? 'alto' : ''}">${giorniTxt(i.giorni)}</span></td>
                <td><b>${esc(i.cliente)}</b><em>${esc(i.telefono || '')}</em></td>
                <td>${esc(i.marca || '')}<em>${esc(i.modello || '')}</em></td>
                <td>${esc(i.consulente || '')}</td>
                <td>${nomeTipo(i)}</td>
                <td>${dataIt(i.caricatoIl)}<em>${esc(i.caricatoDa || '')}</em></td>
                <td>${i.linkLead ? `<a href="${esc(i.linkLead)}" target="_blank" rel="noopener" title="Apri il lead">🔗</a>` : ''}<button type="button" class="btn-small" data-apri="${(i.caricatoIl || '').slice(0, 10)}">Apri</button></td>
              </tr>`).join('') : `<tr><td colspan="7"><p class="pvs-vuoto">${tutti.length ? 'Nessun preventivo con questi filtri' : 'Nessun preventivo in sospeso 👍'}</p></td></tr>`}</tbody></table>`;
    }
    // menu sotto la freccetta
    function chiudiPop(ov) { const p = ov && ov.querySelector('.pvs-pop'); if (p) p.remove(); }
    function apriPop(ov, btn) {
        const tipo = btn.dataset.pop, gia = ov.querySelector('.pvs-pop');
        chiudiPop(ov); if (gia && gia.dataset.tipo === tipo) return;
        const conta = fn => { const m = new Map(); (dati.items || []).forEach(i => m.set(fn(i), (m.get(fn(i)) || 0) + 1)); return [...m].sort((a, b) => a[0].localeCompare(b[0], 'it', { sensitivity: 'base' })); };
        const voce = (k, v, lab, n, on) => `<button type="button" class="pvs-po ${on ? 'on' : ''}" data-k="${k}" data-v="${esc(v)}"><span>${esc(lab)}</span>${n != null ? `<b>${n}</b>` : ''}</button>`;
        const lista = (k, fn) => voce(k, '', 'Tutti', (dati.items || []).length, !F[k]) + conta(fn).map(([n, c]) => voce(k, n, n, c, F[k] === n)).join('');
        const ord = `<small>Ordina</small>${voce('ord', 'asc', '↑ Più vecchi per primi', null, F.ord === 'asc')}${voce('ord', 'desc', '↓ Più recenti per primi', null, F.ord === 'desc')}`;
        const html = tipo === 'ord' ? ord
            : tipo === 'cons' ? `<small>Consulente</small><div class="pvs-pl">${lista('cons', nomeCons)}</div>`
            : tipo === 'tipo' ? `<small>Tipo</small>${lista('tipo', nomeTipo)}`
            : `${ord}<small>Caricato da</small><div class="pvs-pl">${lista('op', nomeOp)}</div>`;
        const pop = document.createElement('div'); pop.className = 'pvs-pop'; pop.dataset.tipo = tipo; pop.innerHTML = html;
        const box = ov.querySelector('.pvs-box'); box.appendChild(pop);
        const r = btn.getBoundingClientRect(), b = box.getBoundingClientRect();
        pop.style.top = (r.bottom - b.top + 6) + 'px';
        pop.style.left = Math.max(8, Math.min(r.left - b.left, b.width - pop.offsetWidth - 8)) + 'px';
    }

    async function esportaExcel(btn) {
        const items = filtrati(); if (!items.length) return;
        const lab = btn.innerHTML; btn.disabled = true; btn.innerHTML = '⏳ Preparazione…';
        try {
            const riep = fn => {
                const m = new Map();
                items.forEach(i => { const k = fn(i), r = m.get(k) || { n: 0, alti: 0, max: 0, somma: 0 }; r.n++; if (i.giorni >= 3) r.alti++; r.max = Math.max(r.max, i.giorni || 0); r.somma += i.giorni || 0; m.set(k, r); });
                return [...m].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0], 'it')).map(([k, r]) => [k, r.n, r.alti, r.max, Math.round(r.somma / r.n)]);
            };
            const colR = t => [{ t, tipo: 'text', w: 26 }, { t: 'In sospeso', tipo: 'int', w: 11 }, { t: 'Da 3 giorni o più', tipo: 'int', w: 12 }, { t: 'Il più vecchio (giorni)', tipo: 'int', w: 13 }, { t: 'Media giorni', tipo: 'int', w: 11 }];
            const tot = ['Totale', items.length, items.filter(i => i.giorni >= 3).length, Math.max(...items.map(i => i.giorni || 0)), Math.round(items.reduce((a, i) => a + (i.giorni || 0), 0) / items.length)];
            const filtri = [F.cons ? 'Consulente: ' + F.cons : '', F.tipo ? 'Tipo: ' + F.tipo : '', F.op ? 'Caricati da: ' + F.op : ''].filter(Boolean);
            const sotto = [(filtri.length ? 'Filtri: ' + filtri.join(' · ') : 'Tutti i preventivi in sospeso'), items.length + (items.length === 1 ? ' preventivo' : ' preventivi'),
                'ordine: ' + (F.ord === 'asc' ? 'più vecchi per primi' : 'più recenti per primi')].join(' · ');
            const oggi = new Date(), ymd = oggi.getFullYear() + '-' + String(oggi.getMonth() + 1).padStart(2, '0') + '-' + String(oggi.getDate()).padStart(2, '0');
            const body = {
                colore: 'blu', titolo: 'Preventivi telefonici in sospeso', sottotitolo: sotto,
                file: 'Preventivi_telefonici_in_sospeso' + (F.cons ? '_' + F.cons : '') + (F.tipo ? '_' + F.tipo : '') + (F.op ? '_' + F.op : '') + '_' + ymd + '.xlsx',
                fogli: [
                    { nome: 'In sospeso', tabelle: [{ titolo: '', nota: 'In sospeso = ancora in "Preventivo telefonico generato" dal giorno dopo il caricamento', colonne: [
                        { t: 'Giorni in sospeso', tipo: 'int', w: 11 }, { t: 'Cliente', tipo: 'text', w: 24 }, { t: 'Telefono', tipo: 'text', w: 16 },
                        { t: 'Marca', tipo: 'text', w: 14 }, { t: 'Modello', tipo: 'text', w: 30 }, { t: 'Consulente', tipo: 'text', w: 20 },
                        { t: 'Tipo', tipo: 'text', w: 10 }, { t: 'Caricato il', tipo: 'data', w: 12 }, { t: 'Caricato da', tipo: 'text', w: 20 }, { t: 'Link lead', tipo: 'text', w: 30 }],
                        righe: items.map(i => [i.giorni || 0, i.cliente || '', i.telefono || '', i.marca || '', i.modello || '', i.consulente || '',
                            i.tipo === 'NOLEGGIO' ? 'Noleggio' : 'Vendita', dataIt(i.caricatoIl), i.caricatoDa || '', i.linkLead || '']) }] },
                    { nome: 'Per consulente', tabelle: [{ titolo: 'Per consulente', colonne: colR('Consulente'), righe: riep(nomeCons), totale: tot }] },
                    { nome: 'Per operatore', tabelle: [{ titolo: 'Per operatore che ha caricato', colonne: colR('Operatore'), righe: riep(nomeOp), totale: tot }] }
                ]
            };
            body.file = body.file.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_');
            const res = await fetch('/api/preventivi-export/excel', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) { let m = 'Errore ' + res.status; try { m = (await res.json()).error || m; } catch (e) { /* */ } throw new Error(m); }
            const blob = await res.blob(), a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = body.file;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        } catch (e) { alert('Excel non creato: ' + e.message); }
        finally { btn.innerHTML = lab; btn.disabled = false; disegnaLista(document.getElementById('pvsModal')); }
    }

    function apriElenco() {
        let ov = document.getElementById('pvsModal');
        if (!ov) {
            ov = document.createElement('div'); ov.id = 'pvsModal';
            document.body.appendChild(ov);
            ov.addEventListener('click', e => {
                const po = e.target.closest('.pvs-po');
                if (po) { F[po.dataset.k] = po.dataset.v; chiudiPop(ov); disegnaLista(ov); return; }
                const pb = e.target.closest('[data-pop]');
                if (pb) { apriPop(ov, pb); return; }
                if (!e.target.closest('.pvs-pop')) chiudiPop(ov);
                if (e.target === ov || e.target.closest('[data-chiudi]')) { ov.style.display = 'none'; return; }
                const a = e.target.closest('[data-apri]');
                if (a) { ov.style.display = 'none'; vaiAlPreventivo(a.dataset.apri); return; }
                if (e.target.closest('[data-reset]')) { F.cons = ''; F.op = ''; F.tipo = ''; disegnaLista(ov); return; }
                const x = e.target.closest('[data-xls]');
                if (x && !x.disabled) esportaExcel(x);
            });
            ov.addEventListener('scroll', e => { if (!(e.target.closest && e.target.closest('.pvs-pop'))) chiudiPop(ov); }, true);   // non quando si scorre il menu stesso
            document.addEventListener('keydown', e => {
                if (e.key !== 'Escape' || ov.style.display === 'none') return;
                if (ov.querySelector('.pvs-pop')) chiudiPop(ov); else ov.style.display = 'none';
            });
        }
        ov.innerHTML = `<div class="pvs-box" role="dialog" aria-modal="true">
            <header><div><h3>⚠️ Preventivi telefonici in sospeso (<span data-n></span>)</h3>
              <p><span data-sub></span> <button type="button" class="pvs-lnk" data-reset hidden>✕ Azzera filtri</button></p></div>
              <div class="pvs-hb"><button type="button" class="pvs-xls" data-xls>⬇ Excel</button><button type="button" data-chiudi aria-label="Chiudi">✕</button></div></header>
            <div class="pvs-list"></div></div>`;
        disegnaLista(ov);
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
.pvs-box { position:relative; }
.pvs-hb { display:flex; gap:8px; align-items:flex-start; flex:none; }
.pvs-box header .pvs-xls { width:auto; padding:0 12px; font-size:12px; font-weight:800; color:var(--text-primary,#eef2f7); border:1px solid rgba(46,158,107,.6); background:rgba(46,158,107,.14); }
.pvs-box header .pvs-xls:hover { background:rgba(46,158,107,.26); }
.pvs-box header .pvs-xls:disabled { opacity:.5; cursor:default; }
.pvs-lnk { border:0; background:none; padding:0 0 0 6px; color:#f0a030; font:inherit; font-size:12px; font-weight:700; cursor:pointer; }
.pvs-lnk:hover { text-decoration:underline; }
.pvs-box header .pvs-lnk { width:auto; height:auto; border-radius:0; background:none; }
.pvs-th { border:0; background:none; padding:0; color:inherit; font:inherit; letter-spacing:inherit; text-transform:inherit; cursor:pointer; display:inline-flex; align-items:center; gap:4px; }
.pvs-th i { font-style:normal; font-size:10px; opacity:.55; transition:opacity .15s; }
.pvs-th:hover, .pvs-th:hover i { color:var(--text-primary,#eef2f7); opacity:1; }
.pvs-th.on { color:#f0a030; }
.pvs-th.on i { opacity:1; }
.pvs-pop { position:absolute; z-index:5; min-width:220px; max-width:300px; padding:8px; border-radius:12px; background:var(--bg-card2,#1a2030); border:1px solid var(--border,#2a3242); box-shadow:0 16px 40px rgba(0,0,0,.5); animation:pvsIn .15s ease-out; }
.pvs-pop small { display:block; padding:6px 8px 4px; font-size:10px; font-weight:800; letter-spacing:.6px; text-transform:uppercase; color:var(--text-secondary,#98a2b3); }
.pvs-pl { max-height:260px; overflow:auto; }
.pvs-po { display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; padding:7px 8px; border:0; border-radius:8px; background:none; color:var(--text-primary,#eef2f7); font:inherit; font-size:13px; text-align:left; cursor:pointer; }
.pvs-po:hover { background:rgba(140,150,170,.14); }
.pvs-po.on { background:rgba(240,160,48,.16); color:#f0a030; font-weight:700; }
.pvs-po b { font-size:11px; font-weight:700; color:var(--text-secondary,#98a2b3); }
.preventivo-card.pvs-sospeso { box-shadow:inset 4px 0 0 #f0a030; }
.preventivo-card.pvs-sospeso.alto { box-shadow:inset 4px 0 0 #ff5a5f; }
@media (max-width:700px) { #inbAvvisi { right:18px; max-width:none; } .pvs-list th:nth-child(5), .pvs-list td:nth-child(5) { display:none; } }`;
        document.head.appendChild(st);
    }

    injectCss();
    window.PreventiviSospesi = { aggiorna, apriElenco };
})();
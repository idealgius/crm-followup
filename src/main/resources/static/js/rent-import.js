/* =====================================================================
   RENT — IMPORT DAL GESTIONALE (file trattative + file lead)
   ---------------------------------------------------------------------
   Pulsante "📥 GESTIONALE" accanto a EXCEL nella pagina Rent. Si caricano
   i due export (uno o tutti e due), il server confronta per numero di
   telefono e mostra cosa cambierebbe: si sceglie cosa aggiornare e quali
   persone nuove creare, poi si applica. Regole in RentImportService.java.
   Aggiunge anche, nella scheda di una trattativa, la sezione "Note dal
   gestionale" quando la trattativa aveva gia' delle note sue.
   ===================================================================== */
(function () {
    'use strict';
    const LAB = s => (typeof RENT_STATO_LABELS !== 'undefined' && RENT_STATO_LABELS[s]) || s || '—';
    const COL = s => (typeof RENT_STATO_COLORS !== 'undefined' && RENT_STATO_COLORS[s]) || '#8a8faa';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const gIt = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
    let files = [], dati = null, filtroNuove = '';

    // ---------------- stili ----------------
    function stili() {
        if (document.getElementById('riStili')) return;
        const st = document.createElement('style'); st.id = 'riStili';
        st.textContent = `
.ri-ov { position:fixed; inset:0; z-index:10060; background:rgba(0,0,0,.62); display:flex; align-items:flex-start; justify-content:center; padding:4vh 14px; overflow:auto; }
.ri-box { width:min(1100px,100%); background:var(--bg-card,#141822); color:var(--text-primary,#eef2f7); border:1px solid var(--border,#2a3242); border-radius:18px; box-shadow:0 30px 80px -20px rgba(0,0,0,.6); }
.ri-box.ri-small { width:min(620px,100%); }
.ri-h { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:16px 20px; border-bottom:1px solid var(--border,#2a3242); }
.ri-h h3 { margin:0; font-size:16px; letter-spacing:.5px; }
.ri-x { border:1px solid var(--border,#2a3242); background:none; color:inherit; border-radius:10px; width:34px; height:34px; cursor:pointer; font-size:15px; }
.ri-b { padding:16px 20px 20px; }
.ri-hint { font-size:12.5px; color:var(--text-secondary,#98a2b3); line-height:1.45; margin:0 0 12px; }
.ri-drop { border:2px dashed rgba(0,200,83,.5); border-radius:16px; padding:26px 16px; text-align:center; cursor:pointer; background:rgba(0,200,83,.05); }
.ri-drop.on { background:rgba(0,200,83,.14); }
.ri-drop b { display:block; font-size:15px; color:#00c853; }
.ri-drop span { font-size:12.5px; color:var(--text-secondary,#98a2b3); }
.ri-files { margin:12px 0 0; padding:0; list-style:none; font-size:13px; }
.ri-files li { padding:6px 10px; border:1px solid var(--border,#2a3242); border-radius:10px; margin-top:6px; display:flex; justify-content:space-between; gap:10px; }
.ri-act { display:flex; gap:10px; justify-content:flex-end; align-items:center; flex-wrap:wrap; margin-top:16px; }
.ri-btn { height:40px; padding:0 16px; border-radius:11px; border:1px solid var(--border,#2a3242); background:transparent; color:inherit; font:inherit; font-weight:800; font-size:13px; cursor:pointer; }
.ri-btn.go { background:#00c853; border-color:#00c853; color:#05250f; }
.ri-btn:disabled { opacity:.55; cursor:default; }
.ri-err { margin-top:12px; padding:10px 12px; border-radius:10px; background:rgba(255,61,61,.12); border:1px solid rgba(255,61,61,.45); font-size:13px; }
.ri-kpi { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
.ri-kpi div { flex:1 1 110px; min-width:0; padding:9px 11px; border-radius:12px; background:rgba(140,150,170,.1); }
.ri-kpi b { display:block; font-size:19px; }
.ri-kpi span { font-size:11px; color:var(--text-secondary,#98a2b3); line-height:1.3; display:block; }
.ri-sec { border:1px solid var(--border,#2a3242); border-radius:14px; margin-bottom:12px; }
.ri-sec > summary { cursor:pointer; padding:12px 14px; font-weight:800; font-size:13.5px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; list-style:none; }
.ri-sec > summary::-webkit-details-marker { display:none; }
.ri-sec > summary::before { content:'▸'; transition:transform .15s; }
.ri-sec[open] > summary::before { transform:rotate(90deg); }
.ri-sec > summary em { font-style:normal; font-weight:600; font-size:12px; color:var(--text-secondary,#98a2b3); }
.ri-sec-b { padding:0 14px 12px; }
.ri-tools { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:8px; font-size:12px; }
.ri-tools a { color:#4a90d9; cursor:pointer; }
.ri-tools button { border:1px solid var(--border,#2a3242); background:transparent; color:inherit; border-radius:999px; padding:4px 10px; font:inherit; font-size:12px; font-weight:700; cursor:pointer; }
.ri-tools button.on { background:#00c853; border-color:#00c853; color:#05250f; }
.ri-list { max-height:52vh; overflow:auto; }
.ri-row { display:flex; gap:10px; align-items:flex-start; padding:9px 2px; border-top:1px solid var(--border,#2a3242); cursor:pointer; }
.ri-row input { margin-top:3px; width:16px; height:16px; flex:none; }
.ri-row > div { min-width:0; flex:1; }
.ri-row b { font-size:13.5px; }
.ri-row small { display:block; font-size:12px; color:var(--text-secondary,#98a2b3); margin-top:2px; line-height:1.4; overflow-wrap:anywhere; }
.ri-st { display:inline-block; font-size:10.5px; font-weight:800; padding:2px 8px; border-radius:999px; white-space:nowrap; }
.ri-arrow { color:var(--text-secondary,#98a2b3); margin:0 4px; }
.ri-tag { display:inline-block; font-size:10.5px; font-weight:700; padding:1px 7px; border-radius:6px; background:rgba(140,150,170,.15); margin-left:4px; }
.ri-ges, .ri-ges-all { height:30px; border-radius:8px; border:1px solid var(--border,#2a3242); background:var(--bg-primary,#0f1117); color:inherit; font:inherit; font-size:12px; padding:0 6px; max-width:100%; }
.ri-gesw { display:flex !important; flex-wrap:wrap; align-items:center; gap:4px 6px; }
.ri-nota { margin-top:10px; padding:10px 12px; border-radius:12px; border:1px dashed rgba(0,200,83,.45); background:rgba(0,200,83,.06); }
.ri-nota small { display:block; font-size:10.5px; font-weight:800; letter-spacing:.6px; text-transform:uppercase; color:#00c853; margin-bottom:4px; }
.ri-nota div { font-size:13px; white-space:pre-wrap; line-height:1.45; }
@media (max-width:640px) { .ri-ov { padding:0; } .ri-box { border-radius:0; min-height:100%; } .ri-list { max-height:none; } }`;
        document.head.appendChild(st);
    }

    const st = s => `<span class="ri-st" style="background:${COL(s)}22;color:${COL(s)}">${esc(LAB(s))}</span>`;

    function finestra(html, small) {
        chiudi();
        stili();
        const ov = document.createElement('div'); ov.className = 'ri-ov'; ov.id = 'riOv';
        ov.innerHTML = `<div class="ri-box ${small ? 'ri-small' : ''}" role="dialog" aria-modal="true">${html}</div>`;
        ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-ri-x]')) chiudi(); });
        document.body.appendChild(ov);
        return ov;
    }
    function chiudi() { const o = document.getElementById('riOv'); if (o) o.remove(); }
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('riOv')) chiudi(); });

    // ---------------- 1. scelta dei file ----------------
    function apri() {
        files = [];
        const ov = finestra(`<div class="ri-h"><h3>📥 Import dal gestionale</h3><button class="ri-x" data-ri-x>✕</button></div>
          <div class="ri-b">
            <p class="ri-hint">Carica gli export del gestionale: il file delle <b>trattative</b> e quello dei <b>lead</b> (anche uno solo va bene).
            Il CRM cerca ogni trattativa Rent per <b>numero di telefono</b> e ti mostra prima cosa cambierebbe: nulla viene salvato finché non confermi.</p>
            <div class="ri-drop" id="riDrop"><b>Trascina qui i file CSV</b><span>oppure tocca per sceglierli</span></div>
            <input type="file" id="riFile" accept=".csv,text/csv" multiple hidden>
            <ul class="ri-files" id="riFiles"></ul>
            <div id="riMsg"></div>
            <div class="ri-act"><button class="ri-btn" data-ri-x>Annulla</button><button class="ri-btn go" id="riGo" disabled>Analizza</button></div>
          </div>`, true);
        const inp = ov.querySelector('#riFile'), drop = ov.querySelector('#riDrop');
        const mostra = () => {
            ov.querySelector('#riFiles').innerHTML = files.map((f, i) => `<li><span>📄 ${esc(f.name)}</span><a data-del="${i}" style="cursor:pointer;color:#ff6b6b">togli</a></li>`).join('');
            ov.querySelector('#riGo').disabled = !files.length;
        };
        const aggiungi = list => { [...list].forEach(f => { if (/\.csv$/i.test(f.name) && files.length < 2 && !files.some(x => x.name === f.name && x.size === f.size)) files.push(f); }); mostra(); };
        drop.addEventListener('click', () => inp.click());
        inp.addEventListener('change', () => { aggiungi(inp.files); inp.value = ''; });
        drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('on'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('on'));
        drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('on'); aggiungi(e.dataTransfer.files); });
        ov.querySelector('#riFiles').addEventListener('click', e => { const d = e.target.closest('[data-del]'); if (d) { files.splice(+d.dataset.del, 1); mostra(); } });
        ov.querySelector('#riGo').addEventListener('click', analizza);
    }

    function formData() {
        const fd = new FormData();
        files.forEach((f, i) => fd.append('file' + (i + 1), f));
        return fd;
    }

    async function analizza() {
        const btn = document.getElementById('riGo'), msg = document.getElementById('riMsg');
        if (btn) { btn.disabled = true; btn.textContent = 'Analizzo…'; }
        try {
            const res = await fetch('/api/noleggio/import/anteprima', { method: 'POST', body: formData() });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || 'Errore nella lettura dei file');
            dati = d; filtroNuove = '';
            anteprima();
        } catch (e) {
            if (msg) msg.innerHTML = `<div class="ri-err">${esc(e.message)}</div>`;
            if (btn) { btn.disabled = false; btn.textContent = 'Analizza'; }
        }
    }

    // ---------------- 2. anteprima ----------------
    function fonteTxt(f) {
        if (!f) return '';
        return `${f.tipo === 'T' ? 'Trattativa' : 'Lead'} ${esc(f.id)} · ${esc(f.statoGest || '')}${f.data ? ' · ' + gIt(f.data) : ''}${f.venditore ? ' · ' + esc(f.venditore) : ''}${f.etichetta ? `<span class="ri-tag">${esc(f.etichetta)}</span>` : ''}${f.motivo ? ' · ' + esc(f.motivo) : ''}`;
    }

    // NUOVO: tendina "Gestita da" (si puo' tenere la proposta o cambiarla)
    const gestCrea = new Map();
    function selGestore(key, sel, attualeId, venditoreId) {
        const ut = dati.utenti || [];
        const opt = ut.map(u => `<option value="${u.id}" ${String(u.id) === String(sel) ? 'selected' : ''}>${esc(u.fullName)}${String(u.id) === String(attualeId) ? ' · attuale' : ''}${String(u.id) === String(venditoreId) ? ' · venditore' : ''}</option>`).join('');
        const extra = sel != null && !ut.some(u => String(u.id) === String(sel)) ? `<option value="" selected>${esc(key.startsWith('A:') ? 'attuale' : '—')}</option>` : '';
        return `<select class="ri-ges" data-k="${esc(key)}" data-orig="${attualeId ?? ''}" onclick="event.stopPropagation()">${extra}${opt}</select>`;
    }
    function rigaAgg(m, spuntata) {
        const sel = m.gestitaPrimaId ?? m.gestitaDopoId;
        return `<label class="ri-row"><input type="checkbox" class="ri-agg" value="${m.id}" ${spuntata ? 'checked' : ''}><div>
                <b>${esc(m.cliente || (m.fonte && m.fonte.cliente) || '—')}</b> <small style="display:inline">${esc(m.cellulare || '')}${m.veicolo ? ' · ' + esc(m.veicolo) : ''}</small>
                <small>${spuntata ? `${st(m.statoPrima)}${m.statoPrima === 'DA_RICHIAMARE' && m.dataPrima ? ' ' + gIt(m.dataPrima) : ''}<span class="ri-arrow">→</span>${st(m.statoDopo)}${m.statoDopo === 'DA_RICHIAMARE' && m.dataDopo ? ' ' + gIt(m.dataDopo) : ''}` : `${st(m.statoPrima)} · già allineata`}
                  ${m.nota === 'NOTA' ? ' · 📝 riceve la nota del gestionale' : m.nota === 'SEZIONE' ? ' · 📋 nota del gestionale a parte' : ''}</small>
                <small class="ri-gesw">${m.gestitaPrima ? `Ora gestita da <b style="font-size:12px">${esc(m.gestitaPrima)}</b> →` : 'Non ancora gestita →'} gestita da ${selGestore('A:' + m.id, sel, m.gestitaPrimaId, m.venditoreId)}</small>
                <small>Dal gestionale: ${fonteTxt(m.fonte)}</small></div></label>`;
    }
    const tuttiGestori = (sec) => `<label style="display:inline-flex;gap:6px;align-items:center;margin-left:auto">Gestita da, per tutte: <select class="ri-ges-all" data-sec="${sec}"><option value="">— scegli —</option><option value="def">quella proposta</option>${(dati.utenti || []).map(u => `<option value="${u.id}">${esc(u.fullName)}</option>`).join('')}</select></label>`;

    function anteprima() {
        const r = dati.riepilogo || {}, agg = dati.aggiorna || [], nuove = dati.nonInRent || [], fuori = dati.rentNonNeiFile || [];
        const k = (n, l) => `<div><b>${n ?? 0}</b><span>${l}</span></div>`;
        const ov = finestra(`<div class="ri-h"><h3>📥 Import dal gestionale · controllo</h3><button class="ri-x" data-ri-x>✕</button></div>
          <div class="ri-b">
            <div class="ri-kpi">${k(r.righeTrattative, 'righe trattative')}${k(r.righeLead, 'righe lead')}${k(r.inRent, 'trattative in Rent')}${k(r.abbinate, 'trovate nei file')}
              ${k(r.daAggiornare, 'da aggiornare')}${k(r.giaAllineate, 'già allineate')}${k(r.nonInRent, 'nei file ma non in Rent')}${k(r.rentNonNeiFile, 'in Rent ma non nei file')}</div>

            <details class="ri-sec" open><summary>🔄 Da aggiornare <em>(${agg.length})</em></summary><div class="ri-sec-b">
              ${agg.length ? `<div class="ri-tools"><a data-tutti="agg">Seleziona tutte</a> · <a data-nessuno="agg">Nessuna</a>${tuttiGestori('agg')}</div>
              <div class="ri-list" data-lista="agg">${agg.map(m => rigaAgg(m, true)).join('')}</div>`
                : '<p class="ri-hint" style="margin:0">Niente da aggiornare: le trattative trovate sono già allineate.</p>'}
            </div></details>

            ${(dati.giaAllineate || []).length ? `<details class="ri-sec"><summary>✔️ Già allineate <em>(${dati.giaAllineate.length}) · qui puoi cambiare solo da chi sono gestite</em></summary><div class="ri-sec-b">
              <div class="ri-tools">${tuttiGestori('ok')}</div>
              <div class="ri-list" data-lista="ok">${dati.giaAllineate.map(m => rigaAgg(m, false)).join('')}</div></div></details>` : ''}

            <details class="ri-sec"><summary>➕ Nei file ma non in Rent <em>(${nuove.length}) · spunta quelle da creare</em></summary><div class="ri-sec-b">
              <div class="ri-tools" id="riFiltri"></div>
              <div class="ri-tools">${tuttiGestori('nuove')}</div>
              <div class="ri-list" id="riNuove"></div>
            </div></details>

            <details class="ri-sec"><summary>🔎 In Rent ma non nei file <em>(${fuori.length}) · restano come sono</em></summary><div class="ri-sec-b"><div class="ri-list">
              ${fuori.map(m => `<div class="ri-row" style="cursor:default"><div><b>${esc(m.cliente)}</b> <small style="display:inline">${esc(m.cellulare || '')}</small><small>${st(m.stato)}${m.fonte ? ' · ' + esc(m.fonte) : ''}</small></div></div>`).join('') || '<p class="ri-hint" style="margin:0">Nessuna.</p>'}
            </div></div></details>

            <div id="riMsg"></div>
            <div class="ri-act"><span class="ri-hint" id="riConta" style="margin:0 auto 0 0"></span>
              <button class="ri-btn" data-ri-x>Annulla</button><button class="ri-btn go" id="riApplica">Applica</button></div>
          </div>`);
        disegnaNuove();
        conta();
        ov.addEventListener('change', e => {
            const g = e.target.closest('.ri-ges'), all = e.target.closest('.ri-ges-all');
            if (g) {   // cambiare "gestita da" spunta la riga
                const cb = g.closest('.ri-row').querySelector('input[type=checkbox]'); if (cb) cb.checked = true;
                if (g.dataset.k.startsWith('C:')) gestCrea.set(g.dataset.k.slice(2), g.value);
            }
            if (all && all.value) {
                const cont = all.dataset.sec === 'nuove' ? ov.querySelector('#riNuove') : ov.querySelector(`[data-lista="${all.dataset.sec}"]`);
                cont.querySelectorAll('.ri-ges').forEach(sl => {
                    const def = sl.dataset.k.startsWith('C:') ? (dati.nonInRent.find(x => 'C:' + x.chiave === sl.dataset.k) || {}).gestoreId
                        : (() => { const m = [...(dati.aggiorna || []), ...(dati.giaAllineate || [])].find(x => 'A:' + x.id === sl.dataset.k) || {}; return m.gestitaPrimaId ?? m.gestitaDopoId; })();
                    sl.value = all.value === 'def' ? String(def ?? '') : all.value;
                    if (sl.dataset.k.startsWith('C:')) gestCrea.set(sl.dataset.k.slice(2), sl.value);
                    if (all.dataset.sec === 'ok' && all.value !== 'def') sl.closest('.ri-row').querySelector('input[type=checkbox]').checked = true;
                });
                if (all.dataset.sec === 'nuove') { /* vale solo per le visibili */ }
                all.value = '';
            }
            conta();
        });
        ov.addEventListener('click', e => {
            const t = e.target.closest('[data-tutti]'), n = e.target.closest('[data-nessuno]'), f = e.target.closest('[data-filtro]');
            if (t || n) {
                e.preventDefault();
                const cls = (t || n).dataset.tutti || (t || n).dataset.nessuno;
                ov.querySelectorAll(cls === 'agg' ? '[data-lista="agg"] .ri-agg' : '#riNuove .ri-crea').forEach(c => { c.checked = !!t; });
                conta();
            }
            if (f) { filtroNuove = f.dataset.filtro; disegnaNuove(); conta(); }
        });
        ov.querySelector('#riApplica').addEventListener('click', applica);
    }

    const scelteCrea = new Set();
    function disegnaNuove() {
        const ov = document.getElementById('riOv'); if (!ov) return;
        const nuove = dati.nonInRent || [];
        // ricorda le spunte quando si cambia filtro
        ov.querySelectorAll('#riNuove .ri-crea').forEach(c => { if (c.checked) scelteCrea.add(c.value); else scelteCrea.delete(c.value); });
        const per = {}; nuove.forEach(m => { per[m.statoRent] = (per[m.statoRent] || 0) + 1; });
        ov.querySelector('#riFiltri').innerHTML = `<button data-filtro="" class="${!filtroNuove ? 'on' : ''}">Tutte ${nuove.length}</button>` +
            ['DA_RICHIAMARE', 'TRATTATIVA_IN_CORSO', 'CONCLUSA', 'FALLITO'].filter(s => per[s]).map(s => `<button data-filtro="${s}" class="${filtroNuove === s ? 'on' : ''}">${esc(LAB(s))} ${per[s]}</button>`).join('') +
            ` <a data-tutti="nuove">Spunta quelle visibili</a> · <a data-nessuno="nuove">Nessuna</a>`;
        const vis = nuove.filter(m => !filtroNuove || m.statoRent === filtroNuove);
        ov.querySelector('#riNuove').innerHTML = vis.map(m => `<label class="ri-row"><input type="checkbox" class="ri-crea" value="${esc(m.chiave)}" ${scelteCrea.has(m.chiave) ? 'checked' : ''}><div>
            <b>${esc(m.cliente || '—')}</b> <small style="display:inline">${esc(m.telefono || '')}${m.veicolo ? ' · ' + esc(m.veicolo) : ''}</small>
            <small>Diventerebbe ${st(m.statoRent)}${m.statoRent === 'DA_RICHIAMARE' && m.dataRichiamo ? ' ' + gIt(m.dataRichiamo) : ''} · gestita da ${selGestore('C:' + m.chiave, gestCrea.has(m.chiave) ? gestCrea.get(m.chiave) : m.gestoreId, null, m.venditoreId)}</small>
            <small>Dal gestionale: ${fonteTxt(m)}</small>
            ${m.nota ? `<small style="font-style:italic">“${esc(m.nota)}”</small>` : ''}</div></label>`).join('') || '<p class="ri-hint" style="margin:0">Nessuna.</p>';
    }

    function scelte() {
        const ov = document.getElementById('riOv');
        ov.querySelectorAll('#riNuove .ri-crea').forEach(c => { if (c.checked) scelteCrea.add(c.value); else scelteCrea.delete(c.value); });
        const agg = [...ov.querySelectorAll('.ri-agg:checked')].map(c => Number(c.value));
        const gestori = {};
        agg.forEach(id => { const sl = ov.querySelector(`.ri-ges[data-k="A:${id}"]`); if (sl && sl.value && sl.value !== sl.dataset.orig) gestori['A:' + id] = Number(sl.value); });
        [...scelteCrea].forEach(k => { const v = gestCrea.get(k); if (v) gestori['C:' + k] = Number(v); });
        return { agg, crea: [...scelteCrea], gestori };
    }
    function conta() {
        const el = document.getElementById('riConta'); if (!el) return;
        const s = scelte();
        el.textContent = `${s.agg.length} da aggiornare · ${s.crea.length} da creare`;
        document.getElementById('riApplica').disabled = !s.agg.length && !s.crea.length;
    }

    // ---------------- 3. applicazione ----------------
    async function applica() {
        const s = scelte(), btn = document.getElementById('riApplica'), msg = document.getElementById('riMsg');
        if (!confirm(`Aggiorno ${s.agg.length} trattative${s.crea.length ? ` e ne creo ${s.crea.length} nuove` : ''} in Rent. Continuare?`)) return;
        btn.disabled = true; btn.textContent = 'Applico…';
        const fd = formData();
        fd.append('aggiorna', JSON.stringify(s.agg));
        fd.append('crea', JSON.stringify(s.crea));
        fd.append('gestori', JSON.stringify(s.gestori));
        try {
            const res = await fetch('/api/noleggio/import/applica', { method: 'POST', body: fd });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || 'Errore durante l\'import');
            scelteCrea.clear(); gestCrea.clear(); noteCache = null;
            finestra(`<div class="ri-h"><h3>✅ Import dal gestionale completato</h3><button class="ri-x" data-ri-x>✕</button></div>
              <div class="ri-b"><div class="ri-kpi"><div><b>${d.aggiornate || 0}</b><span>trattative aggiornate</span></div><div><b>${d.create || 0}</b><span>trattative create</span></div><div><b>${d.noteASezione || 0}</b><span>note messe in "Note dal gestionale"</span></div></div>
              ${(d.errori || []).length ? `<div class="ri-err">${d.errori.map(esc).join('<br>')}</div>` : ''}
              <div class="ri-act"><button class="ri-btn go" data-ri-x>Chiudi</button></div></div>`, true);
            if (typeof loadRentTrattative === 'function') loadRentTrattative();
        } catch (e) {
            msg.innerHTML = `<div class="ri-err">${esc(e.message)}</div>`;
            btn.disabled = false; btn.textContent = 'Applica';
        }
    }

    // ---------------- pulsante nella pagina Rent ----------------
    function pulsante() {
        if (document.getElementById('rentImportGestBtn')) return;
        const excel = document.querySelector('#rentPage button[onclick^="exportRentExcel"]');
        if (!excel) return;
        if (typeof isReadOnlySection === 'function' && isReadOnlySection('RENT')) return;
        const b = document.createElement('button');
        b.id = 'rentImportGestBtn'; b.type = 'button'; b.className = 'btn-secondary';
        b.style.cssText = 'padding:10px 16px'; b.title = 'Aggiorna le trattative Rent con gli export del gestionale (trattative e lead)';
        b.textContent = '📥 GESTIONALE';
        b.addEventListener('click', apri);
        excel.insertAdjacentElement('afterend', b);
    }

    // ---------------- "Note dal gestionale" nella scheda ----------------
    let noteCache = null, noteAt = 0;
    async function note() {
        if (noteCache && Date.now() - noteAt < 60000) return noteCache;
        try { const r = await fetch('/api/noleggio/import/note'); noteCache = r.ok ? await r.json() : {}; } catch (e) { noteCache = {}; }
        noteAt = Date.now();
        return noteCache;
    }
    async function sezioneNote(id) {
        const area = document.getElementById('rtdNote'); if (!area) return;
        let box = document.getElementById('rtdNoteGestionale');
        if (box) box.remove();
        const n = (await note())[String(id)];
        if (!n || !n.testo || document.getElementById('rtdNoteGestionale')) return;
        stili();
        box = document.createElement('div'); box.id = 'rtdNoteGestionale'; box.className = 'ri-nota';
        box.innerHTML = `<small>📋 Note dal gestionale · ${esc(n.fonte || '')}${n.data ? ' · ' + gIt(n.data) : ''}${n.venditore ? ' · ' + esc(n.venditore) : ''}</small><div>${esc(n.testo)}</div>`;
        area.insertAdjacentElement('afterend', box);
    }

    function aggancia() {
        if (typeof window.openRentTrattativaModal === 'function' && !window.openRentTrattativaModal.__ri) {
            const orig = window.openRentTrattativaModal;
            window.openRentTrattativaModal = function (id) { const r = orig.apply(this, arguments); sezioneNote(id); return r; };
            window.openRentTrattativaModal.__ri = true;
        }
        if (typeof window.handleRentWsEvent === 'function' && !window.handleRentWsEvent.__ri) {
            const origWs = window.handleRentWsEvent;
            window.handleRentWsEvent = function (ev) {
                if (ev && ev.type === 'reload') { noteCache = null; if (typeof loadRentTrattative === 'function') loadRentTrattative(); return; }
                return origWs.apply(this, arguments);
            };
            window.handleRentWsEvent.__ri = true;
        }
        pulsante();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aggancia); else aggancia();
    setInterval(aggancia, 1500);   // il pulsante dipende dai permessi, che arrivano dopo il login

    window.RentImport = { apri };
})();
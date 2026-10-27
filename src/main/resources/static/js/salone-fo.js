/* =====================================================================
   FRONT OFFICE — due schede in piu' in Appuntamenti e ingressi (salone.js):
     🔔 Allert         gli allert mandati al Front Office (dal Registro contatti: "Al Front Office")
                       stessa gestione della pagina Allert del Back Office (allert-bo.js), colori del salone
     🔑 Doppie chiavi  registro delle vetture consegnate senza la seconda chiave
                       MANCA -> "Doppia chiave in sede" -> chiamate / messaggi al cliente -> "Chiave consegnata" (archivio)
   Chi le vede lo decidono i permessi (pagina Permessi, per ruolo o per operatore):
     "Allert Front Office" (ALLERT_FO)  e  "Doppie chiavi" (DOPPIE_CHIAVI)
   di partenza: Front Office Completo, dal Moderatore in su Accesso Admin.
   Dati: /api/contacts/allert-pagina?fo=1 e /api/doppie-chiavi (DoppieChiaviController.java).
   ===================================================================== */
(function () {
    const permessiPronti = () => typeof currentUser !== 'undefined' && !!currentUser
        && ((typeof myEffectivePermissions !== 'undefined' && myEffectivePermissions && Object.keys(myEffectivePermissions).length > 0)
            || (typeof permissionMatrix !== 'undefined' && permissionMatrix && Object.keys(permissionMatrix).length > 0));
    const liv = sez => permessiPronti() && typeof getAccess === 'function' ? getAccess(sez) : 'NONE';
    const puoAllert = () => liv('ALLERT_FO') !== 'NONE', puoChiavi = () => liv('DOPPIE_CHIAVI') !== 'NONE';
    const puo = () => puoAllert() || puoChiavi();
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const vis = id => { const e = document.getElementById(id); return !!e && e.offsetParent !== null; };
    const n = { allert: 0, chiavi: 0 };
    let tabCorrente = null;
    function aggiornaSchede() { if (window.Salone && Salone.schede) Salone.schede(); }

    /* ================= Allert del Front Office ================= */
    let allert = null;
    function istanzaAllert() {
        if (allert || !window.AllertPage || !AllertPage.crea) return allert;
        allert = AllertPage.crea({
            root: () => document.getElementById('foAllertRoot'),
            visibile: () => vis('foAllertRoot'),
            fo: true,
            titolo: 'ALLERT DEL FRONT OFFICE',
            sottotitolo: i => i.vedeTutti ? 'Tutti gli allert mandati al Front Office' : 'Gli allert mandati al Front Office e quelli mandati a te',
            sfondo: () => liv('ALLERT_FO') === 'FULL',
            onDati: d => { const k = d.filter(l => !l.acquistoAlertStatus || l.acquistoAlertStatus === 'DA_GESTIRE').length; if (k !== n.allert) { n.allert = k; aggiornaSchede(); } },
            azioniExtra: l => l.category === 'Info Acquisto effettuato' && /seconda chiave/i.test(l.otherNote || '')
                ? '<button type="button" class="ap-btn ap-btn-chiave" data-alregistro>Metti nel registro doppie chiavi</button>' : '',
            clicExtra: (e, l) => { if (!e.target.closest('[data-alregistro]')) return false; Chiavi.daAllert(l); return true; }
        });
        return allert;
    }

    /* ================= Registro doppie chiavi ================= */
    const Chiavi = (function () {
        const API = '/api/doppie-chiavi';
        const STATI = { MANCA: 'Manca la chiave', SEDE: 'In sede · da avvisare', CONSEGNATA: 'Consegnata' };
        let voci = [], info = {}, filtro = 'MANCA', cerca = '', quante = 60, modifica = null, bozza = null, aperto = false, err = '', caricando = null, timer = null;
        const box = () => document.getElementById('foChiaviRoot');
        const visibile = () => vis('foChiaviRoot');
        const ora = ms => { const d = new Date(ms); return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + ' · ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); };
        const giorno = ms => new Date(ms).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const nome = v => [v.nome, v.cognome].filter(Boolean).join(' ') || 'Cliente';
        const marche = () => (window.Salone && Salone.marche ? Salone.marche() : (typeof MARCHE_LIST !== 'undefined' ? MARCHE_LIST : []));
        // senza accenti e maiuscole: "citroen", "CITROËN" e "cit" trovano tutti Citroën
        const piano = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        // nome come nell'elenco dei marchi ("CITROEN" scritto prima -> "CITROËN")
        const nomeM = m => { const k = piano(m); return (k && marche().find(x => piano(x) === k)) || m || ''; };
        // marchi che corrispondono a quello che si scrive: prima chi inizia cosi', poi chi ha una parola che inizia cosi', poi il resto
        function trovaMarche(q) {
            const k = piano(q), M = marche();
            if (!k) return M.slice();
            const a = [], b = [], c = [];
            M.forEach(m => { const p = piano(m); if (p.startsWith(k)) a.push(m); else if (p.split(/[\s-]+/).some(w => w.startsWith(k))) b.push(m); else if (p.includes(k)) c.push(m); });
            return a.concat(b, c);
        }
        const ICO_TEL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>';
        const ICO_MSG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';

        async function api(path, body) {
            const r = await fetch(API + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || 'Errore ' + r.status);
            return d;
        }
        function carica() {
            if (caricando) return caricando;
            caricando = (async () => {
                try { const d = await api(''); voci = d.voci || []; info = d; err = ''; }
                catch (e) { err = e.message; }
                finally { caricando = null; }
                const k = voci.filter(v => v.stato === 'SEDE').length;
                if (k !== n.chiavi) { n.chiavi = k; aggiornaSchede(); }
                if (visibile()) disegna();
            })();
            return caricando;
        }
        function metti(v) { const i = voci.findIndex(x => x.id === v.id); if (i >= 0) voci[i] = v; else voci.unshift(v); n.chiavi = voci.filter(x => x.stato === 'SEDE').length; aggiornaSchede(); }

        function elenco() {
            const q = piano(cerca);
            let L = voci.filter(v => v.stato === filtro);
            if (q) L = L.filter(v => [nome(v), nomeM(v.marca), v.modello, v.targa, v.note, v.registrataDa].some(x => piano(x).includes(q)));
            const t = v => filtro === 'CONSEGNATA' ? (v.consegnataAt || 0) : filtro === 'SEDE' ? (v.inSedeAt || 0) : (v.registrataAt || 0);
            L.sort((a, b) => filtro === 'CONSEGNATA' ? t(b) - t(a) : t(a) - t(b));
            return L;
        }
        function scheda(v) {
            const T = v.tentativi || [], nc = T.filter(x => x.tipo === 'C').length, nm = T.filter(x => x.tipo === 'M').length;
            const ult = T[T.length - 1], mioUlt = ult && currentUser && ult.daId === currentUser.id && Date.now() - ult.at < 10 * 60 * 1000;
            const riga = v.stato === 'MANCA' ? `Registrata il ${giorno(v.registrataAt)} da ${esc(v.registrataDa || '—')}`
                : v.stato === 'SEDE' ? `Chiave in sede dal ${giorno(v.inSedeAt)} · registrata il ${giorno(v.registrataAt)}`
                : `Consegnata il ${giorno(v.consegnataAt)} da ${esc(v.consegnataDa || '—')} · ${T.length} ${T.length === 1 ? 'tentativo' : 'tentativi'}`;
            const scrive = info.puoModificare !== false, capo = !!info.puoEliminare;
            const puoEliminare = scrive && (capo || (v.stato === 'MANCA' && !T.length && currentUser && v.registrataDa === currentUser.fullName));
            return `<article class="fo-k ${v.stato}" data-v="${esc(v.id)}">
              <div class="fo-k-h"><div><b>${esc(nome(v))}</b><span>${esc([nomeM(v.marca), v.modello].filter(Boolean).join(' '))}${v.targa ? ` · <strong>${esc(v.targa)}</strong>` : ''}</span></div>
                <span class="fo-pill ${v.stato}">${STATI[v.stato]}</span></div>
              <em class="fo-k-r">${riga}</em>
              ${v.note ? `<p class="fo-k-n">${esc(v.note).replace(/\n/g, '<br>')}</p>` : ''}
              ${v.allertId ? `<button type="button" class="fo-link" data-apriallert="${v.allertId}">Allert n. ${v.allertId}</button>` : ''}
              ${v.stato === 'MANCA' && scrive ? '<button type="button" class="fo-big" data-az="sede">Doppia chiave in sede</button>' : ''}
              ${v.stato === 'SEDE' && !scrive ? `<p class="fo-mut">${nc} ${nc === 1 ? 'chiamata' : 'chiamate'} · ${nm} ${nm === 1 ? 'messaggio' : 'messaggi'}</p>` : ''}
              ${v.stato === 'SEDE' && scrive ? `<div class="fo-tent">
                  <button type="button" data-az="chiamata" aria-label="Segna una chiamata al cliente">${ICO_TEL}Chiamato <i class="c">${nc}</i></button>
                  <button type="button" data-az="messaggio" aria-label="Segna un messaggio al cliente">${ICO_MSG}Messaggio <i class="m">${nm}</i></button></div>` : ''}
              ${T.length && v.stato !== 'MANCA' ? `<ol class="fo-log">${T.slice().reverse().map(x => `<li><i class="${x.tipo === 'C' ? 'c' : 'm'}"></i><b>${x.tipo === 'C' ? 'Chiamata' : 'Messaggio'}</b> · ${esc(ora(x.at))} · ${esc(x.da || '')}</li>`).join('')}</ol>` : ''}
              ${v.stato === 'SEDE' && scrive && (mioUlt || (capo && T.length)) ? '<button type="button" class="fo-link" data-az="annullaTentativo">Togli l’ultimo tentativo</button>' : ''}
              ${v.stato === 'SEDE' && scrive ? '<button type="button" class="fo-big ok" data-az="consegnata">Chiave consegnata</button>' : ''}
              <div class="fo-k-a">
                ${v.stato !== 'CONSEGNATA' && scrive ? '<button type="button" class="fo-link" data-modifica>Modifica</button>' : ''}
                ${v.stato === 'CONSEGNATA' && capo && scrive ? '<button type="button" class="fo-link" data-az="rimettiInSede">Rimetti in sede</button>' : ''}
                ${puoEliminare ? '<button type="button" class="fo-link rosso" data-az="elimina">Elimina</button>' : ''}
              </div>
            </article>`;
        }
        function modulo() {
            const v = modifica ? voci.find(x => x.id === modifica) : null, b = bozza || v || {};
            const mc = nomeM(b.marca);
            return `<aside class="fo-form" aria-label="${v ? 'Modifica' : 'Registra chiave mancante'}">
              <div class="fo-form-h"><h3>${v ? 'Modifica la vettura' : 'Registra chiave mancante'}</h3><p>${v ? esc(nome(v)) : 'La vettura è stata consegnata senza la seconda chiave'}</p></div>
              <form data-form autocomplete="off">
                <div class="fo-2"><label>Nome<input name="nome" value="${esc(b.nome || '')}" maxlength="80"></label><label>Cognome<input name="cognome" value="${esc(b.cognome || '')}" maxlength="80"></label></div>
                <div class="fo-lab"><label for="foMarca">Marchio</label><div class="fo-dd" data-dd>
                  <input id="foMarca" name="marca" value="${esc(mc)}" maxlength="40" placeholder="Clicca o scrivi il marchio…" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="foMarcaL" data-marca>
                  <svg class="fo-dd-f" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
                  <div class="fo-dd-l" id="foMarcaL" role="listbox" aria-label="Marchi"></div></div></div>
                <div class="fo-2"><label>Modello<input name="modello" value="${esc(b.modello || '')}" maxlength="80"></label><label>Targa<input name="targa" class="fo-targa" value="${esc(b.targa || '')}" maxlength="12" placeholder="AB123CD"></label></div>
                <label>Note (se servono)<textarea name="note" rows="3" maxlength="1000">${esc(b.note || '')}</textarea></label>
                ${b.allertId && !v ? `<p class="fo-mut">Collegata all'allert n. ${b.allertId}</p>` : ''}
                <div class="fo-form-a"><button type="button" class="fo-btn" data-annullaform>Annulla</button><button type="submit" class="fo-big">${v ? 'Salva modifiche' : 'Registra'}</button></div>
              </form>
            </aside>`;
        }
        // il modulo si vede solo dopo "Registra chiave mancante", "Modifica" o "Metti nel registro" da un allert
        const formOn = () => info.puoModificare !== false && !!(aperto || modifica || bozza);
        function chiudiForm() { aperto = false; modifica = null; bozza = null; if (document.activeElement) document.activeElement.blur(); }
        function disegna() {
            const r = box(); if (!r) return;
            const att = document.activeElement, inForm = att && r.contains(att) && att.closest('[data-form]');
            const c = k => voci.filter(v => v.stato === k).length;
            const L = elenco(), vis = L.slice(0, quante);
            const scrive = info.puoModificare !== false;
            const NUOVA = '<button type="button" class="fo-big fo-nuova" data-nuova><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Registra chiave mancante</button>';
            const head = `<div class="fo-top"><div><h2>REGISTRO DOPPIE CHIAVI</h2><p>Vetture consegnate senza la seconda chiave: quando arriva si avvisa il cliente e si segna la consegna${scrive ? '' : ' · <b>solo lettura</b>'}</p></div>
                ${scrive && !formOn() ? NUOVA : ''}</div>
              ${err ? `<p class="fo-err">${esc(err)}</p>` : ''}
              <div class="fo-f" role="tablist" aria-label="Stato della chiave">
                ${[['MANCA', 'Manca la chiave'], ['SEDE', 'In sede · da avvisare'], ['CONSEGNATA', 'Consegnate (archivio)']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${filtro === k}" class="fo-t ${k} ${filtro === k ? 'on' : ''}" data-filtro="${k}"><i></i>${l}<b>${c(k)}</b></button>`).join('')}
                <label class="fo-cerca"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input type="search" placeholder="Cerca nome, targa, modello…" aria-label="Cerca" value="${esc(cerca)}" data-cerca></label>
              </div>`;
            const lista = `<section class="fo-list" aria-label="Vetture">${vis.length ? vis.map(scheda).join('') : `<p class="fo-vuoto">${cerca ? 'Nessuna vettura con questa ricerca' : filtro === 'MANCA' ? 'Nessuna chiave mancante registrata' : filtro === 'SEDE' ? 'Nessuna chiave in sede da consegnare' : 'Nessuna chiave consegnata'}</p>`}
              ${L.length > quante ? `<button type="button" class="fo-btn fo-altre" data-altre>Mostra altre (${L.length - quante})</button>` : ''}</section>`;
            if (!r.querySelector('.fo-wrap')) {
                r.innerHTML = '<div class="fo-wrap"><div class="fo-head"></div><div class="fo-main"><div class="fo-list-box"></div><div class="fo-form-box"></div></div></div>';
                ascolta(r);
            }
            const cercaFoc = att && att.matches && att.matches('[data-cerca]'), pos = cercaFoc ? att.selectionStart : 0;
            r.querySelector('.fo-head').innerHTML = head;
            if (cercaFoc) { const x = r.querySelector('[data-cerca]'); x.focus(); try { x.setSelectionRange(pos, pos); } catch (e) { /* */ } }
            r.querySelector('.fo-list-box').innerHTML = lista;
            r.querySelector('.fo-main').classList.toggle('fo-sola', !formOn());
            // il modulo si ridisegna solo quando cambia (aperto/chiuso, nuova o modifica): l'aggiornamento automatico non cancella quello che si sta scrivendo
            const fb = r.querySelector('.fo-form-box'), kf = formOn() ? (modifica ? 'm:' + modifica : bozza ? 'b:' + (bozza.allertId || '') : 'n') : '';
            if (fb.dataset.k !== kf || (!kf && fb.innerHTML)) { fb.dataset.k = kf; fb.innerHTML = kf ? modulo() : ''; }
        }
        function leggiForm(f) { const d = {}; new FormData(f).forEach((v, k) => { d[k] = String(v).trim(); }); return d; }
        /* tendina del marchio: si apre sempre verso il basso e filtra mentre si scrive */
        let ddSel = 0;
        function ddApri(inp, tutti) {
            const dd = inp.closest('[data-dd]'), l = dd.querySelector('.fo-dd-l');
            const L = tutti ? marche().slice() : trovaMarche(inp.value);
            if (tutti) { const i = L.indexOf(nomeM(inp.value)); ddSel = i >= 0 ? i : 0; } else ddSel = 0;
            l.innerHTML = L.length ? L.map((m, i) => `<button type="button" role="option" tabindex="-1" aria-selected="${i === ddSel}" class="${i === ddSel ? 'on' : ''}" data-m="${esc(m)}">${esc(m)}</button>`).join('')
                : '<div class="fo-dd-v">Nessun marchio con questo nome</div>';
            dd.classList.add('open'); inp.setAttribute('aria-expanded', 'true');
            const on = l.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
            // se la lista esce dallo schermo, la pagina scorre quel tanto che basta per vederla
            requestAnimationFrame(() => { const b = l.getBoundingClientRect(); if (b.bottom > innerHeight - 8) scrollBy({ top: b.bottom - innerHeight + 16, behavior: 'smooth' }); });
        }
        function ddChiudi(inp) { const dd = inp && inp.closest('[data-dd]'); if (!dd) return; dd.classList.remove('open'); inp.setAttribute('aria-expanded', 'false'); }
        function ddScegli(inp, m) { inp.value = m; ddChiudi(inp); const f = inp.form && inp.form.querySelector('[name=modello]'); if (f) f.focus(); }
        function ddMuovi(inp, d) {
            const B = [...inp.closest('[data-dd]').querySelectorAll('[data-m]')]; if (!B.length) return;
            ddSel = (ddSel + d + B.length) % B.length;
            B.forEach((b, i) => { b.classList.toggle('on', i === ddSel); b.setAttribute('aria-selected', i === ddSel); });
            B[ddSel].scrollIntoView({ block: 'nearest' });
        }
        function ascolta(r) {
            r.addEventListener('input', e => {
                if (e.target.matches('[data-marca]')) { ddApri(e.target, false); return; }
                if (e.target.matches('[data-cerca]')) { cerca = e.target.value.trim(); quante = 60; disegna(); }
            });
            r.addEventListener('focusin', e => { if (e.target.matches('[data-marca]')) ddApri(e.target, true); });
            r.addEventListener('focusout', e => {
                const t = e.target; if (!t.matches('[data-marca]')) return;
                ddChiudi(t);
                // scritto a mano: se corrisponde a un marchio prende il nome giusto ("citroen" -> "CITROËN")
                const L = trovaMarche(t.value), k = piano(t.value);
                if (k) t.value = L.find(m => piano(m) === k) || (L.length === 1 ? L[0] : t.value.trim().toUpperCase());
            });
            r.addEventListener('mousedown', e => { const b = e.target.closest('.fo-dd-l [data-m]'); if (!b) return; e.preventDefault(); ddScegli(b.closest('[data-dd]').querySelector('[data-marca]'), b.dataset.m); });
            r.addEventListener('mousedown', e => { if (e.target.closest('.fo-dd-f')) { e.preventDefault(); const i = e.target.closest('[data-dd]').querySelector('[data-marca]'); if (document.activeElement === i && i.closest('.open')) ddChiudi(i); else { i.focus(); ddApri(i, true); } } });
            r.addEventListener('keydown', e => {
                const t = e.target; if (!t.matches || !t.matches('[data-marca]')) return;
                const aperta = !!t.closest('.fo-dd.open');
                if (e.key === 'ArrowDown') { e.preventDefault(); if (aperta) ddMuovi(t, 1); else ddApri(t, true); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); if (aperta) ddMuovi(t, -1); }
                else if (e.key === 'Enter' && aperta) { e.preventDefault(); const b = t.closest('[data-dd]').querySelectorAll('[data-m]')[ddSel]; if (b) ddScegli(t, b.dataset.m); else ddChiudi(t); }
                else if (e.key === 'Escape' && aperta) { e.preventDefault(); ddChiudi(t); }
                else if (e.key === 'Tab' && aperta && t.value.trim()) { const b = t.closest('[data-dd]').querySelectorAll('[data-m]')[ddSel]; if (b) t.value = b.dataset.m; }
            });
            r.addEventListener('submit', async e => {
                const f = e.target.closest('[data-form]'); if (!f) return;
                e.preventDefault();
                const d = leggiForm(f);
                if (!d.nome && !d.cognome) { alert('Scrivi nome o cognome del cliente'); return; }
                if (!d.targa && !d.modello) { alert('Scrivi almeno la targa o il modello'); return; }
                const btn = f.querySelector('[type=submit]'); btn.disabled = true;
                try {
                    if (modifica) { const x = await api('/' + encodeURIComponent(modifica), Object.assign({ azione: 'modifica' }, d)); metti(x.voce); modifica = null; messaggio('Modifiche salvate'); }
                    else { if (bozza && bozza.allertId) d.allertId = bozza.allertId; const x = await api('', d); metti(x.voce); filtro = 'MANCA'; messaggio('Chiave mancante registrata'); }
                    chiudiForm();
                    disegna();
                } catch (x) { alert(x.message); btn.disabled = false; }
            });
            r.addEventListener('click', async e => {
                const t = e.target;
                const fl = t.closest('[data-filtro]'); if (fl) { filtro = fl.dataset.filtro; quante = 60; disegna(); return; }
                if (t.closest('[data-altre]')) { quante += 60; disegna(); return; }
                if (t.closest('[data-nuova]')) {
                    aperto = true; modifica = null; bozza = null; disegna();
                    const f = box().querySelector('.fo-form');
                    if (f) { f.scrollIntoView({ block: 'start', behavior: 'smooth' }); const n = f.querySelector('[name=nome]'); if (n) setTimeout(() => n.focus({ preventScroll: true }), 250); }
                    return;
                }
                if (t.closest('[data-annullaform]')) { chiudiForm(); disegna(); return; }
                const aa = t.closest('[data-apriallert]'); if (aa) { vai('allert', +aa.dataset.apriallert); return; }
                const k = t.closest('[data-v]'); if (!k) return;
                const v = voci.find(x => x.id === k.dataset.v); if (!v) return;
                if (t.closest('[data-modifica]')) { modifica = v.id; bozza = null; if (document.activeElement) document.activeElement.blur(); disegna(); const f = box().querySelector('.fo-form'); if (f) f.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
                const az = t.closest('[data-az]'); if (!az) return;
                const a = az.dataset.az;
                if (a === 'consegnata' && !confirm(`Chiave consegnata a ${nome(v)}? La vettura passa nell'archivio.`)) return;
                if (a === 'elimina' && !confirm(`Eliminare ${nome(v)} dal registro?`)) return;
                if (a === 'rimettiInSede' && !confirm('Rimettere la chiave tra quelle in sede?')) return;
                az.disabled = true;
                try {
                    const x = await api('/' + encodeURIComponent(v.id), { azione: a });
                    if (x.eliminata) { voci = voci.filter(y => y.id !== v.id); n.chiavi = voci.filter(y => y.stato === 'SEDE').length; aggiornaSchede(); }
                    else metti(x.voce);
                    if (a === 'sede') { filtro = 'SEDE'; messaggio('Chiave in sede: ora avvisa il cliente'); }
                    else if (a === 'consegnata') messaggio('Chiave consegnata ✓');
                    else if (a === 'chiamata') messaggio('Chiamata segnata');
                    else if (a === 'messaggio') messaggio('Messaggio segnato');
                    disegna();
                } catch (y) { alert(y.message); az.disabled = false; }
            });
        }
        function daAllert(l) {
            modifica = null;
            bozza = { nome: l.clienteNome || '', cognome: l.clienteCognome || '', marca: nomeM(l.marca), modello: l.modello || '', targa: l.serviceTarga || '', note: [l.acquistoNote, l.notaAggiuntiva].filter(Boolean).join(' · '), allertId: l.id };
            vai('chiavi');
            setTimeout(() => { const f = box() && box().querySelector('.fo-form'); if (f) f.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 80);
        }
        function apri() { carica(); if (!timer) timer = setInterval(() => { if (visibile() || liv('DOPPIE_CHIAVI') === 'FULL') carica(); }, 30 * 1000); }
        return { disegna, carica, apri, daAllert };
    })();

    function messaggio(t) {
        let el = document.getElementById('apToast');
        if (!el) { el = document.createElement('div'); el.id = 'apToast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
        el.textContent = t; el.classList.add('on'); clearTimeout(messaggio._t); messaggio._t = setTimeout(() => el.classList.remove('on'), 2200);
    }
    function vai(tab, idAllert) {
        if (window.Salone && Salone.vai) Salone.vai(tab);
        if (tab === 'allert' && idAllert && istanzaAllert()) setTimeout(() => allert.seleziona(idAllert), 50);
    }

    /* ================= agganci per salone.js ================= */
    const badge = k => n[k] ? `<i class="fo-n">${n[k] > 99 ? '99+' : n[k]}</i>` : '';
    window.SaloneFO = {
        schede: puo,
        voci: () => [].concat(puoAllert() ? [['allert', '🔔 Allert' + badge('allert')]] : [], puoChiavi() ? [['chiavi', '🔑 Doppie chiavi' + badge('chiavi')]] : []),
        mia: tab => tab === 'allert' || tab === 'chiavi',
        numeri: () => (puoAllert() ? n.allert : 0) + (puoChiavi() ? n.chiavi : 0),   // sulla voce FRONT OFFICE in alto
        render(tab, body) {
            tabCorrente = tab;
            if (tab === 'allert') {
                if (!body.querySelector('#foAllertRoot')) body.innerHTML = '<div id="foAllertRoot"></div>';
                const a = istanzaAllert();
                if (a) a.apri(); else body.innerHTML = '<p class="fo-err">Pagina allert non disponibile</p>';
            } else {
                if (!body.querySelector('#foChiaviRoot')) body.innerHTML = '<div id="foChiaviRoot"></div>';
                Chiavi.disegna(); Chiavi.apri();
            }
        }
    };
    // il Front Office vede subito i numeri sulle schede e riceve gli avvisi dei nuovi allert
    // (chi ha "Completo": di partenza il Front Office)
    const attesa = setInterval(() => {
        if (!permessiPronti()) return;
        clearInterval(attesa);
        if (liv('DOPPIE_CHIAVI') === 'FULL') Chiavi.apri();
        if (liv('ALLERT_FO') === 'FULL') { const a = istanzaAllert(); if (a) { a.collega(); a.carica(); a.avviaGiro(); } }
        aggiornaSchede();
    }, 1500);
})();
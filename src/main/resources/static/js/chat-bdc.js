/* =====================================================================
   CHAT (BDC, Back Office, Admin) — /api/chat (ChatController.java)
   ---------------------------------------------------------------------
   Pulsante rosso "Chat" in basso a sinistra, solo nel Registro contatti (e nella pagina
   Allert, che per il Back Office prende il posto del Registro). Si apre un pannello con:
     - a sinistra l'elenco: Tutti (gruppo con tutti), gruppi creati dall'Admin,
       chat singole; filtri Tutte / Gruppi / Singole e ricerca;
     - a destra la conversazione: messaggi, risposte, reazioni, allert allegati.
   "+" = nuova chat con un collega (tutti) o nuovo gruppo (solo Admin).
   Niente sticker. Si aggiorna ogni 4 secondi (15 se la scheda del browser e' nascosta).
   ===================================================================== */
(function () {
    const RUOLI = ['UTENTE', 'BACK_OFFICE', 'ADMIN'];
    const RUOLO_LBL = { UTENTE: 'BDC', BACK_OFFICE: 'Back Office', ADMIN: 'Admin' };
    const RAPIDE = ['👍', '❤️', '😂', '😮', '🙏', '✅'];
    const EMOJI = ['😀', '😂', '😊', '😉', '😍', '🤔', '😅', '😮', '😢', '😡', '👍', '👎', '👏', '🙏', '💪', '🔥', '✅', '❌', '⚠️', '📞', '🚗', '🔑', '📄', '⏰'];
    let compatta = false; try { compatta = localStorage.getItem('cbCompatta') === '1'; } catch (e) { /* */ }
    let el = null, aperto = false, conv = null, dopo = 0, timer = null, stato = null, filtro = 'tutte', cerca = '', risposta = null, primo = true;
    const msgs = {}, nonLetti = {};
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const iniziali = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
    const ora = ts => new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const giorno = ts => { const d = new Date(ts), o = new Date(); const g = x => x.toDateString();
        if (g(d) === g(o)) return 'Oggi'; const ie = new Date(o); ie.setDate(o.getDate() - 1); if (g(d) === g(ie)) return 'Ieri';
        return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }); };
    const quando = ts => { if (!ts) return ''; const d = new Date(ts), o = new Date(); return d.toDateString() === o.toDateString() ? ora(ts) : d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }); };
    const ICO = {
        chat: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
        cerca: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
        invia: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
        emo: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/></svg>',
        riduci: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>',
        allarga: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>',
        campana: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>'
    };

    const io = () => stato && stato.io;
    const utente = id => (stato && stato.utenti || []).find(u => u.id === id);
    const gruppo = k => (stato && stato.gruppi || []).find(g => g.id === k);
    const convCon = id => 'P_' + Math.min(io().id, id) + '_' + Math.max(io().id, id);
    const altroDi = k => { const [, a, b] = k.split('_').map(Number); return a === io().id ? b : a; };
    function nomeConv(k) {
        if (k === 'TUTTI') return 'Tutti';
        if (k.startsWith('G_')) { const g = gruppo(k); return g ? g.nome : 'Gruppo'; }
        const u = utente(altroDi(k)); return u ? u.nome : 'Chat';
    }
    function sottoConv(k) {
        if (k === 'TUTTI') return 'Gruppo · ' + ((stato.utenti || []).length + 1) + ' persone';
        if (k.startsWith('G_')) { const g = gruppo(k); return 'Gruppo · ' + (g ? g.membri.length : 0) + ' persone'; }
        const u = utente(altroDi(k)); return u ? RUOLO_LBL[u.role] || u.role : '';
    }
    const avatar = k => k === 'TUTTI' ? 'TUTTI' : iniziali(nomeConv(k));
    const tipoConv = k => k.startsWith('P_') ? 'singole' : 'gruppi';

    async function api(path, body) {
        const r = await fetch('/api/chat' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
        let d = null; try { d = await r.json(); } catch (e) { /* */ }
        if (!r.ok) throw new Error((d && d.error) || 'Errore ' + r.status);
        return d;
    }

    /* ---------- visibilita': solo pagine In bound, solo ruoli della chat ---------- */
    function puo() { return typeof currentUser !== 'undefined' && currentUser && RUOLI.includes(currentUser.role); }
    const PAGINE = ['contactsPage', 'allertPage'];
    function inPagina() {
        if (document.body.classList.contains('mh-home-on')) return false;
        return PAGINE.some(id => { const p = document.getElementById(id); return p && p.style.display !== 'none' && p.offsetParent !== null; });
    }
    function aggiornaVisibile() {
        const on = puo() && inPagina();
        if (!on && !el) return;
        crea();
        el.style.display = on ? '' : 'none';
        document.body.classList.toggle('cb-on', on);
    }

    /* ---------- struttura ---------- */
    function crea() {
        if (el) return;
        el = document.createElement('div');
        el.className = 'cb';
        el.innerHTML = `<button type="button" class="cb-fab" aria-label="Apri la chat">${ICO.chat}<span>Chat</span><i class="cb-badge" hidden></i></button>
          <section class="cb-p" hidden aria-label="Chat">
            <div class="cb-side">
              <div class="cb-side-h"><b>Chat</b><button type="button" class="cb-plus" aria-label="Nuovo gruppo" title="Nuovo gruppo">+</button></div>
              <div class="cb-tabs" role="tablist"><button type="button" data-f="tutte" class="on">Tutte</button><button type="button" data-f="gruppi">Gruppi</button><button type="button" data-f="singole">Singole</button></div>
              <label class="cb-cerca">${ICO.cerca}<input type="search" placeholder="Cerca…" aria-label="Cerca chat"></label>
              <div class="cb-list"></div>
            </div>
            <div class="cb-main">
              <div class="cb-vuoto"><span>${ICO.chat}</span><b>Scegli una chat</b><em>Gruppo con tutti, gruppi e chat singole con i colleghi</em></div>
              <div class="cb-conv" hidden>
                <header class="cb-h"><button type="button" class="cb-back" aria-label="Torna alle chat">‹</button><span class="cb-av cb-h-av"></span><span class="cb-h-t"><b></b><em></em></span>
                  <button type="button" class="cb-gest" hidden>Modifica</button><button type="button" class="cb-min" aria-label="Riduci la chat">–</button></header>
                <div class="cb-msgs" aria-live="polite"></div>
                <div class="cb-reply" hidden></div>
                <div class="cb-in"><button type="button" class="cb-emo-b" aria-label="Emoji">${ICO.emo}</button><textarea rows="1" placeholder="Scrivi un messaggio…" aria-label="Scrivi un messaggio"></textarea><button type="button" class="cb-send" aria-label="Invia">${ICO.invia}</button></div>
                <div class="cb-emo" hidden>${EMOJI.map(e => `<button type="button" data-emo="${e}">${e}</button>`).join('')}</div>
              </div>
            </div>
            <button type="button" class="cb-comp" aria-label="Riduci la chat" title="Riduci: solo la chat">${ICO.riduci}</button>
            <button type="button" class="cb-x" aria-label="Chiudi la chat">×</button>
          </section>
          <div class="cb-dlg" hidden></div>`;
        document.body.appendChild(el);
        el.querySelector('.cb-fab').addEventListener('click', () => apri(true));
        el.querySelector('.cb-x').addEventListener('click', () => apri(false));
        el.querySelector('.cb-comp').addEventListener('click', () => { compatta = !compatta; try { localStorage.setItem('cbCompatta', compatta ? '1' : '0'); } catch (e) { /* */ } comp(); });
        comp();
        el.querySelector('.cb-min').addEventListener('click', () => apri(false));
        el.querySelector('.cb-back').addEventListener('click', () => { conv = null; vista(); });
        el.querySelector('.cb-tabs').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; filtro = b.dataset.f; el.querySelectorAll('.cb-tabs button').forEach(x => x.classList.toggle('on', x === b)); lista(); });
        el.querySelector('.cb-cerca input').addEventListener('input', e => { cerca = e.target.value.trim().toLowerCase(); lista(); });
        el.querySelector('.cb-list').addEventListener('click', e => { const b = e.target.closest('[data-conv]'); if (b) entra(b.dataset.conv); });
        el.querySelector('.cb-plus').addEventListener('click', nuova);
        el.querySelector('.cb-gest').addEventListener('click', () => conv && conv.startsWith('G_') && dialogoGruppo(gruppo(conv)));
        const ta = el.querySelector('textarea');
        ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); invia(); } if (e.key === 'Escape') apri(false); });
        ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; });
        el.querySelector('.cb-send').addEventListener('click', invia);
        el.querySelector('.cb-emo-b').addEventListener('click', () => { const p = el.querySelector('.cb-emo'); p.hidden = !p.hidden; });
        el.querySelector('.cb-emo').addEventListener('click', e => { const b = e.target.closest('[data-emo]'); if (!b) return; ta.value += b.dataset.emo; ta.focus(); el.querySelector('.cb-emo').hidden = true; });
        el.querySelector('.cb-msgs').addEventListener('click', clicMessaggio);
        el.querySelector('.cb-reply').addEventListener('click', e => { if (e.target.closest('[data-x]')) { risposta = null; disegnaRisposta(); } });
        el.querySelector('.cb-dlg').addEventListener('click', e => { if (e.target === e.currentTarget || e.target.closest('[data-chiudi]')) chiudiDialogo(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && el && !el.querySelector('.cb-dlg').hidden) chiudiDialogo(); });
    }

    // ridotta: solo una colonna (elenco oppure conversazione), come la chat di prima
    function comp() {
        if (!el) return;
        const b = el.querySelector('.cb-comp');
        el.querySelector('.cb-p').classList.toggle('cb-compatta', compatta);
        b.innerHTML = compatta ? ICO.allarga : ICO.riduci;
        b.title = compatta ? 'Allarga: elenco e chat insieme' : 'Riduci: solo la chat';
        b.setAttribute('aria-label', compatta ? 'Allarga la chat' : 'Riduci la chat');
    }
    function apri(on) {
        crea();
        aperto = on;
        el.querySelector('.cb-fab').hidden = on;
        el.querySelector('.cb-p').hidden = !on;
        el.classList.toggle('cb-aperta', on);
        if (on) { vista(); if (conv) segnaLetto(conv); setTimeout(() => { const t = el.querySelector(conv ? 'textarea' : '.cb-cerca input'); if (t) t.focus(); }, 50); }
    }

    /* ---------- elenco ---------- */
    function conversazioni() {
        const ks = new Set(['TUTTI']);
        (stato.gruppi || []).forEach(g => ks.add(g.id));
        Object.keys(msgs).forEach(k => ks.add(k));
        (stato.utenti || []).forEach(u => ks.add(convCon(u.id)));      // ogni collega ha gia' la sua chat singola
        return [...ks].filter(k => k === 'TUTTI' || k.startsWith('G_') ? !k.startsWith('G_') || gruppo(k) : true);
    }
    function ultimo(k) { const l = msgs[k] || []; return l[l.length - 1]; }
    function lista() {
        if (!el || !stato) return;
        el.querySelector('.cb-plus').hidden = !stato.puoCreareGruppi;
        const box = el.querySelector('.cb-list');
        let L = conversazioni().filter(k => filtro === 'tutte' || tipoConv(k) === filtro);
        if (cerca) L = L.filter(k => nomeConv(k).toLowerCase().includes(cerca));
        L.sort((a, b) => (a === 'TUTTI' ? -1 : b === 'TUTTI' ? 1 : 0) || ((ultimo(b) || {}).ts || 0) - ((ultimo(a) || {}).ts || 0) || nomeConv(a).localeCompare(nomeConv(b), 'it'));
        box.innerHTML = L.map(k => {
            const u = ultimo(k), n = nonLetti[k] || 0;
            const prev = u ? (k !== 'TUTTI' && !k.startsWith('G_') ? '' : (u.da === io().id ? 'Tu: ' : String(u.nome || '').split(' ')[0] + ': ')) + (u.allert && !u.testo ? 'Allert · ' + u.allert.cliente : u.testo) : sottoConv(k);
            return `<button type="button" class="cb-cl ${k === conv ? 'on' : ''} ${n ? 'nl' : ''}" data-conv="${esc(k)}">
              <span class="cb-av ${k.startsWith('P_') ? 'p' : 'g'}">${esc(avatar(k))}</span>
              <span class="cb-cl-t"><span class="cb-cl-r"><b>${esc(nomeConv(k))}</b><small>${n ? `<i class="cb-badge">${n}</i>` : esc(quando(u && u.ts))}</small></span><em>${esc(prev)}</em></span></button>`;
        }).join('') || '<p class="cb-nulla">Nessuna chat</p>';
    }
    function totaleNonLetti() { return Object.values(nonLetti).reduce((a, b) => a + b, 0); }
    function badge() {
        if (!el) return;
        const n = totaleNonLetti(), b = el.querySelector('.cb-fab .cb-badge');
        b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
    }

    /* ---------- conversazione ---------- */
    function vista() {
        if (!el || !stato) return;
        lista();
        const cv = el.querySelector('.cb-conv'), vu = el.querySelector('.cb-vuoto');
        cv.hidden = !conv; vu.hidden = !!conv;
        el.querySelector('.cb-p').classList.toggle('cb-dentro', !!conv);
        if (!conv) return;
        el.querySelector('.cb-h-av').textContent = avatar(conv);
        el.querySelector('.cb-h-av').className = 'cb-av cb-h-av ' + (conv.startsWith('P_') ? 'p' : 'g');
        el.querySelector('.cb-h-t b').textContent = nomeConv(conv);
        el.querySelector('.cb-h-t em').textContent = sottoConv(conv);
        el.querySelector('.cb-gest').hidden = !(conv.startsWith('G_') && stato.puoCreareGruppi);
        messaggi(true);
    }
    function entra(k) { conv = k; risposta = null; disegnaRisposta(); vista(); segnaLetto(k); const t = el.querySelector('textarea'); if (t) t.focus(); }
    function testoMsg(m) { return m.testo || (m.allert ? 'Allert · ' + m.allert.cliente : ''); }
    function messaggi(inFondo) {
        const box = el.querySelector('.cb-msgs'), L = msgs[conv] || [];
        const vicino = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        const gr = !conv.startsWith('P_');
        let g0 = '';
        box.innerHTML = L.length ? L.map(m => {
            const g = giorno(m.ts), sep = g !== g0 ? `<div class="cb-sep"><span>${esc(g)}</span></div>` : ''; g0 = g;
            const mio = m.da === io().id, rif = m.rispostaA ? L.find(x => x.id === m.rispostaA) : null;
            const rz = Object.entries(m.reazioni || {}).filter(([, l]) => l && l.length);
            return sep + `<div class="cb-m ${mio ? 'mio' : ''}" data-id="${esc(m.id)}">
              ${gr && !mio ? `<span class="cb-m-n">${esc(m.nome)}</span>` : ''}
              <div class="cb-bub">
                ${rif ? `<button type="button" class="cb-quote" data-vai="${esc(rif.id)}"><b>${esc(rif.nome)}</b><span>${esc(testoMsg(rif).slice(0, 90))}</span></button>` : ''}
                ${m.testo ? `<span class="cb-m-t">${esc(m.testo).replace(/\n/g, '<br>')}</span>` : ''}
                ${m.allert ? `<button type="button" class="cb-all" data-allert="${esc(m.allert.id)}"><span class="cb-all-i">${ICO.campana}</span><span class="cb-all-t"><b>Allert n. ${esc(m.allert.id)} · ${esc(m.allert.cliente)}</b><em>${esc([m.allert.tipo, m.allert.stato].filter(Boolean).join(' · '))}</em></span><span class="cb-all-a">Apri</span></button>` : ''}
                <span class="cb-m-o">${ora(m.ts)}</span>
                <span class="cb-m-a"><button type="button" data-rispondi="${esc(m.id)}" title="Rispondi" aria-label="Rispondi">↩</button><button type="button" data-reagisci="${esc(m.id)}" title="Reazione" aria-label="Reazione">☺</button></span>
              </div>
              ${rz.length ? `<div class="cb-rz">${rz.map(([e, l]) => `<button type="button" data-rz="${esc(m.id)}" data-e="${esc(e)}" class="${l.includes(io().nome) ? 'mia' : ''}" title="${esc(l.join(', '))}">${e} ${l.length}</button>`).join('')}</div>` : ''}
            </div>`;
        }).join('') : `<p class="cb-nulla">Ancora nessun messaggio. Scrivi il primo!</p>`;
        if (inFondo || vicino) box.scrollTop = box.scrollHeight;
    }
    function clicMessaggio(e) {
        const r = e.target.closest('[data-rispondi]');
        if (r) { const m = (msgs[conv] || []).find(x => x.id === r.dataset.rispondi); if (m) { risposta = m; disegnaRisposta(); el.querySelector('textarea').focus(); } return; }
        const q = e.target.closest('[data-reagisci]');
        if (q) { rapide(q); return; }
        const z = e.target.closest('[data-rz]');
        if (z) { reagisci(z.dataset.rz, z.dataset.e); return; }
        const p = e.target.closest('[data-pick]');
        if (p) { reagisci(p.dataset.pick, p.dataset.e); return; }
        const v = e.target.closest('[data-vai]');
        if (v) { const t = el.querySelector(`.cb-m[data-id="${CSS.escape(v.dataset.vai)}"]`); if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('lampo'); setTimeout(() => t.classList.remove('lampo'), 1400); } return; }
        const a = e.target.closest('[data-allert]');
        if (a) { const id = +a.dataset.allert; if (typeof window.apriAllertDaChat === 'function') window.apriAllertDaChat(id); else if (typeof openAcquistoAlertModal === 'function') openAcquistoAlertModal(id); return; }
        el.querySelectorAll('.cb-rapide').forEach(x => x.remove());
    }
    function rapide(btn) {
        el.querySelectorAll('.cb-rapide').forEach(x => x.remove());
        const d = document.createElement('div'); d.className = 'cb-rapide';
        d.innerHTML = RAPIDE.map(x => `<button type="button" data-pick="${esc(btn.dataset.reagisci)}" data-e="${x}">${x}</button>`).join('');
        btn.closest('.cb-bub').appendChild(d);
    }
    async function reagisci(id, emoji) {
        el.querySelectorAll('.cb-rapide').forEach(x => x.remove());
        try { const d = await api('/reazione', { conv, id, emoji }); metti(conv, [d.messaggio]); messaggi(false); } catch (e) { alert(e.message); }
    }
    function disegnaRisposta() {
        if (!el) return;
        const r = el.querySelector('.cb-reply');
        r.hidden = !risposta;
        r.innerHTML = risposta ? `<div><b>Rispondi a ${esc(risposta.nome)}</b><span>${esc(testoMsg(risposta).slice(0, 120))}</span></div><button type="button" data-x aria-label="Annulla la risposta">×</button>` : '';
    }
    async function invia(extra) {
        const ta = el.querySelector('textarea'), testo = ta.value.trim();
        if ((!testo && !(extra && extra.allert)) || !conv) return;
        const body = { conv, testo };
        if (risposta) body.rispostaA = risposta.id;
        if (extra && extra.allert) body.allert = extra.allert;
        ta.disabled = true;
        try {
            const d = await api('/messaggi', body);
            ta.value = ''; ta.style.height = 'auto'; risposta = null; disegnaRisposta();
            metti(conv, [d.messaggio]); nonLetti[conv] = 0; badge(); messaggi(true); lista();
        } catch (e) { alert('Messaggio non inviato: ' + e.message); }
        finally { ta.disabled = false; ta.focus(); }
    }
    function segnaLetto(k) {
        if (!k) return;
        if (nonLetti[k]) { nonLetti[k] = 0; badge(); lista(); }
        api('/letto', { conv: k }).catch(() => { /* */ });
    }

    /* ---------- nuova chat / gruppi ---------- */
    function dialogo(html) { const d = el.querySelector('.cb-dlg'); d.innerHTML = `<div class="cb-dlg-b" role="dialog" aria-modal="true">${html}</div>`; d.hidden = false; return d; }
    function chiudiDialogo() { const d = el.querySelector('.cb-dlg'); d.hidden = true; d.innerHTML = ''; }
    function nuova() {
        if (stato.puoCreareGruppi) { dialogoGruppo(null); return; }
        const U = stato.utenti || [];
        const d = dialogo(`<header><b>Nuova chat</b><button type="button" data-chiudi aria-label="Chiudi">×</button></header>
          ${stato.puoCreareGruppi ? '<button type="button" class="cb-btn cb-btn-p" data-ng>+ Nuovo gruppo</button>' : ''}
          <label class="cb-cerca">${ICO.cerca}<input type="search" placeholder="Cerca un collega…" aria-label="Cerca un collega" data-q></label>
          <div class="cb-pick">${U.map(u => `<button type="button" class="cb-cl" data-u="${u.id}" data-n="${esc(u.nome.toLowerCase())}"><span class="cb-av p">${esc(iniziali(u.nome))}</span><span class="cb-cl-t"><b>${esc(u.nome)}</b><em>${esc(RUOLO_LBL[u.role] || u.role)}</em></span></button>`).join('') || '<p class="cb-nulla">Nessun collega con la chat</p>'}</div>`);
        d.querySelector('[data-q]').addEventListener('input', e => { const q = e.target.value.trim().toLowerCase(); d.querySelectorAll('[data-u]').forEach(b => { b.hidden = !!q && !b.dataset.n.includes(q); }); });
        d.querySelector('.cb-pick').addEventListener('click', e => { const b = e.target.closest('[data-u]'); if (!b) return; chiudiDialogo(); const k = convCon(+b.dataset.u); if (!msgs[k]) msgs[k] = []; entra(k); });
        const ng = d.querySelector('[data-ng]'); if (ng) ng.addEventListener('click', () => dialogoGruppo(null));
        setTimeout(() => d.querySelector('[data-q]').focus(), 30);
    }
    function dialogoGruppo(g) {
        const U = stato.utenti || [], sel = new Set(g ? g.membri : []);
        const d = dialogo(`<header><b>${g ? 'Modifica gruppo' : 'Nuovo gruppo'}</b><button type="button" data-chiudi aria-label="Chiudi">×</button></header>
          <label class="cb-lab">Nome del gruppo<input type="text" maxlength="60" data-nome value="${esc(g ? g.nome : '')}" placeholder="Es. Back Office"></label>
          <div class="cb-lab">Persone</div>
          <div class="cb-pick">${U.map(u => `<label class="cb-cl cb-chk"><input type="checkbox" data-m="${u.id}" ${sel.has(u.id) ? 'checked' : ''}><span class="cb-av p">${esc(iniziali(u.nome))}</span><span class="cb-cl-t"><b>${esc(u.nome)}</b><em>${esc(RUOLO_LBL[u.role] || u.role)}</em></span></label>`).join('')}</div>
          <footer>${g ? '<button type="button" class="cb-btn cb-btn-r" data-del>Elimina gruppo</button>' : '<span></span>'}<span><button type="button" class="cb-btn" data-chiudi>Annulla</button><button type="button" class="cb-btn cb-btn-p" data-ok>${g ? 'Salva' : 'Crea gruppo'}</button></span></footer>`);
        d.querySelector('[data-ok]').addEventListener('click', async () => {
            const nome = d.querySelector('[data-nome]').value.trim(), membri = [...d.querySelectorAll('[data-m]:checked')].map(c => +c.dataset.m);
            if (!nome) { alert('Scrivi il nome del gruppo'); return; }
            if (!membri.length) { alert('Scegli almeno una persona'); return; }
            try {
                const r = await api(g ? '/gruppi/' + encodeURIComponent(g.id) : '/gruppi', { nome, membri });
                chiudiDialogo(); await carica(); entra(r.gruppo.id);
            } catch (e) { alert(e.message); }
        });
        const del = d.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => {
            if (!confirm('Eliminare il gruppo "' + g.nome + '" e i suoi messaggi?')) return;
            try { await api('/gruppi/' + encodeURIComponent(g.id), { elimina: true }); chiudiDialogo(); delete msgs[g.id]; delete nonLetti[g.id]; conv = null; await carica(); vista(); badge(); } catch (e) { alert(e.message); }
        });
    }

    /* ---------- dati ---------- */
    function metti(k, nuovi) {
        const l = msgs[k] || (msgs[k] = []);
        nuovi.forEach(m => { const i = l.findIndex(x => x.id === m.id); if (i >= 0) l[i] = m; else l.push(m); });
        l.sort((a, b) => a.ts - b.ts);
    }
    async function carica() { stato = await api('/stato'); }
    async function aggiorna() {
        if (!puo()) return;
        try {
            if (!stato) await carica();
            const d = await api('/aggiornamenti?dopo=' + dopo);
            let cambio = false, nuoviAltri = false;
            Object.entries(d.conv || {}).forEach(([k, v]) => {
                if (v.messaggi && v.messaggi.length) { metti(k, v.messaggi); cambio = true; if (!primo && v.messaggi.some(m => m.da !== io().id && m.ts === m.agg)) nuoviAltri = true; }
                nonLetti[k] = aperto && conv === k && !document.hidden ? 0 : v.nonLetti;
            });
            // gruppi nuovi o tolti: si ricarica l'elenco delle persone e dei gruppi
            const gk = new Set((stato.gruppi || []).map(g => g.id)), sk = Object.keys(d.conv || {}).filter(k => k.startsWith('G_'));
            if (sk.some(k => !gk.has(k)) || [...gk].some(k => !sk.includes(k))) { await carica(); cambio = true; }
            dopo = d.ora || dopo;
            if (aperto && conv && (nonLetti[conv] === 0) && cambio) segnaLetto(conv);
            badge();
            if (el && aperto && cambio) { if (conv) messaggi(false); lista(); }
            if (nuoviAltri && el && !aperto) { el.querySelector('.cb-fab').classList.remove('cb-pulse'); void el.offsetWidth; el.querySelector('.cb-fab').classList.add('cb-pulse'); }
            primo = false;
        } catch (e) { /* riprova al prossimo giro */ }
    }
    function avvia() {
        aggiornaVisibile();
        if (!puo()) return;
        aggiorna();
        clearInterval(timer);
        timer = setInterval(() => { if (!document.hidden || Date.now() % 15000 < 4000) aggiorna(); }, 4000);
    }
    setInterval(aggiornaVisibile, 800);
    const attesa = setInterval(() => { if (typeof currentUser !== 'undefined' && currentUser) { clearInterval(attesa); avvia(); } }, 1200);

    // per le altre pagine (es. Allert del Back Office): manda un allert in una chat
    window.ChatBdc = {
        apri: () => apri(true),
        condividiAllert(allert) {
            if (!puo() || !stato) return;
            apri(true);
            const d = dialogo(`<header><b>Invia l'allert in chat</b><button type="button" data-chiudi aria-label="Chiudi">×</button></header>
              <p class="cb-dlg-p">Allert n. ${esc(allert.id)} · ${esc(allert.cliente)}${allert.tipo ? ' · ' + esc(allert.tipo) : ''}</p>
              <div class="cb-pick">${conversazioni().map(k => `<button type="button" class="cb-cl" data-k="${esc(k)}"><span class="cb-av ${k.startsWith('P_') ? 'p' : 'g'}">${esc(avatar(k))}</span><span class="cb-cl-t"><b>${esc(nomeConv(k))}</b><em>${esc(sottoConv(k))}</em></span></button>`).join('')}
              </div>`);
            d.querySelector('.cb-pick').addEventListener('click', async e => {
                const b = e.target.closest('[data-k]'); if (!b) return;
                chiudiDialogo(); if (!msgs[b.dataset.k]) msgs[b.dataset.k] = []; entra(b.dataset.k);
                await invia({ allert: { id: allert.id, cliente: allert.cliente, tipo: allert.tipo || '', stato: allert.stato || '' } });
            });
        }
    };
})();
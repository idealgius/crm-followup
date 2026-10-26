/* =====================================================================
   PAGINA ALLERT (Back Office) — #allert
   ---------------------------------------------------------------------
   Per il Back Office sostituisce il Registro contatti (voce ALLERT nel menu): niente report
   e grafici, solo gli allert da gestire, in gestione e gestiti, con la gestione completa.
   Dal Moderatore in su ci si arriva dal Registro: pulsante 🔔 ALLERT -> "Vedi finestra allert",
   e si torna indietro con "← Torna al Registro contatti" (come Quotazioni dal Rent).

   Dati:  GET   /api/contacts/allert-pagina?gestiteGiorni=30   (ContactLogController)
          PATCH /api/contacts/{id}                              (stato e note, come la scheda allert)
   Si aggiorna da sola: canale /topic/contacts (come il Registro) + controllo ogni minuto.
   "Scheda completa" apre la finestra allert di sempre (contact.js: anagrafica, destinatari, mail).
   ===================================================================== */
(function () {
    const ROOT = 'allertRoot';
    const RUOLI_PAGINA = ['BACK_OFFICE', 'MODERATORE', 'GESTORE', 'ADMIN'];
    const VEDONO_TUTTO = ['MODERATORE', 'GESTORE', 'ADMIN'];
    const STATI = { DA_GESTIRE: 'Da gestire', IN_GESTIONE: 'In gestione', GESTITA: 'Gestita' };
    let dati = [], info = {}, tab = 'DA_GESTIRE', cerca = '', tipoF = '', ordine = 'vecchi', selId = null;
    let gestiteGiorni = 30, primo = true, visti = new Set(), stomp = null, timer = null, inCarica = null, rinvio = 0, dettaglioInSospeso = false;
    const bozze = {};          // id -> { g: nota gestione, c: nota chiusura } scritte e non ancora salvate

    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const io = () => (typeof currentUser !== 'undefined' && currentUser) || null;
    const ruolo = () => (io() || {}).role || '';
    const puo = () => RUOLI_PAGINA.includes(ruolo());
    const root = () => document.getElementById(ROOT);
    const pagina = () => document.getElementById('allertPage');
    const visibile = () => { const p = pagina(); return !!p && p.style.display !== 'none'; };
    const stretto = () => window.matchMedia('(max-width: 900px)').matches;

    /* ---------- date: quelle scritte dal server sono in UTC (vedi formatDateTimeIT in contact.js) ---------- */
    const dUtc = iso => { if (!iso) return null; const d = new Date(/Z$|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + 'Z'); return isNaN(d) ? null : d; };
    const dLoc = iso => { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : d; };
    const quandoSegnalato = l => l.acquistoAlertSegnalatoAt ? dUtc(l.acquistoAlertSegnalatoAt) : dLoc(l.contactDate);
    const fmt = d => d ? d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + ' · ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '—';
    const fmtLungo = d => d ? d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
    const giorniDa = d => { if (!d) return 0; const a = new Date(d); a.setHours(0, 0, 0, 0); const o = new Date(); o.setHours(0, 0, 0, 0); return Math.max(0, Math.round((o - a) / 864e5)); };
    const etaTesto = g => g === 0 ? 'oggi' : g === 1 ? 'da 1 giorno' : 'da ' + g + ' giorni';
    const durata = ms => { const m = Math.round(ms / 60000); if (m < 60) return m + ' min'; const h = Math.floor(m / 60); if (h < 24) return h + ' h ' + String(m % 60).padStart(2, '0'); return Math.floor(h / 24) + ' g ' + (h % 24) + ' h'; };

    /* ---------- dati di un allert ---------- */
    const stato = l => l.acquistoAlertStatus === 'GESTITA' ? 'GESTITA' : l.acquistoAlertStatus === 'IN_GESTIONE' ? 'IN_GESTIONE' : 'DA_GESTIRE';
    const nomeU = u => !u ? '' : typeof u === 'string' ? u : (u.fullName || '');
    const cliente = l => (typeof clienteNomeCompleto === 'function' ? clienteNomeCompleto(l) : [l.clienteNome, l.clienteCognome].filter(Boolean).join(' ')) || l.clienteNumero || 'Cliente';
    const tipo = l => l.category === 'Info Acquisto effettuato' ? ((l.otherNote || '').trim() || 'Altro') : l.category;
    const vettura = l => [l.marca, l.modello].filter(Boolean).join(' ');
    const segnalatoDa = l => l.acquistoAlertSegnalatoDaNome || nomeU(l.user) || '—';
    const mioId = () => (io() || {}).id;
    const perMe = l => l.alertNotifyAll === false && Array.isArray(l.alertRecipients) && l.alertRecipients.some(u => u && u.id === mioId());
    const richiesta = l => [l.acquistoNote, l.category !== 'Info Acquisto effettuato' ? l.otherNote : '', l.notaAggiuntiva].map(x => (x || '').trim()).filter(Boolean);

    /* ---------- caricamento ---------- */
    function carica() {
        if (inCarica) return inCarica;
        inCarica = (async () => {
            try {
                const r = await fetch('/api/contacts/allert-pagina?gestiteGiorni=' + gestiteGiorni, { cache: 'no-store' });
                const d = await r.json().catch(() => ({}));
                if (!r.ok) { info = { errore: d.error || 'Errore ' + r.status }; dati = []; disegna(); return; }
                info = d;
                let L = Array.isArray(d.allert) ? d.allert : [];
                // un allert mandato a persone precise lo vedono solo loro (dal Moderatore in su si vede tutto);
                // lo filtra gia' il server, qui e' solo una sicurezza in piu'
                if (!VEDONO_TUTTO.includes(ruolo())) L = L.filter(l => l.alertNotifyAll !== false || perMe(l));
                avvisaNuovi(L);
                dati = L;
                sincronizzaContatti(L);
                disegna();
            } catch (e) { /* rete: si riprova al prossimo giro */ }
            finally { inCarica = null; }
        })();
        return inCarica;
    }
    function caricaPresto() { clearTimeout(rinvio); rinvio = setTimeout(carica, 400); }

    // gli allert aggiornati tornano anche nella memoria del Registro, cosi' la scheda completa li trova
    function sincronizzaContatti(L) {
        if (typeof contactLogs === 'undefined' || !Array.isArray(contactLogs)) return;
        L.forEach(l => { const i = contactLogs.findIndex(x => x.id === l.id); if (i >= 0) contactLogs[i] = l; });
    }
    function avvisaNuovi(L) {
        const da = L.filter(l => stato(l) === 'DA_GESTIRE');
        const nuovi = primo ? [] : da.filter(l => !visti.has(l.id));
        da.forEach(l => visti.add(l.id));
        primo = false;
        if (nuovi.length && typeof notifyNewAcquistoAlert === 'function') { try { notifyNewAcquistoAlert(nuovi[0]); } catch (e) { /* */ } }
        if (nuovi.length) nuovi.forEach(l => { l.__nuovo = true; });
    }

    /* ---------- tempo reale ---------- */
    function collega() {
        if (stomp || !window.StompJs || !window.SockJS) return;
        try {
            stomp = new StompJs.Client({ webSocketFactory: () => new SockJS('/ws'), reconnectDelay: 5000,
                onConnect: () => { stomp.subscribe('/topic/contacts', () => { if (visibile() || ruolo() === 'BACK_OFFICE') caricaPresto(); }); vivo(true); },
                onWebSocketClose: () => vivo(false), onDisconnect: () => vivo(false) });
            stomp.activate();
        } catch (e) { stomp = null; }
    }
    let connesso = false;
    function vivo(on) { connesso = on; const el = root() && root().querySelector('.ap-live'); if (el) el.classList.toggle('off', !on); }

    /* ---------- elenco filtrato ---------- */
    const conteggio = s => dati.filter(l => stato(l) === s).length;
    function filtrati() {
        const q = cerca.toLowerCase();
        let L = dati.filter(l => tab === 'TUTTI' || stato(l) === tab);
        if (tipoF) L = L.filter(l => tipo(l) === tipoF);
        if (q) L = L.filter(l => [cliente(l), l.clienteNumero, l.clienteNumero2, l.serviceTarga, vettura(l), segnalatoDa(l), l.consultantName, tipo(l), String(l.id)]
            .some(x => String(x || '').toLowerCase().includes(q)));
        const t = l => (stato(l) === 'GESTITA' ? dUtc(l.acquistoAlertGestitaAt) : null) || quandoSegnalato(l) || new Date(0);
        L.sort((a, b) => ordine === 'vecchi' && tab !== 'GESTITA' ? t(a) - t(b) : t(b) - t(a));
        return L;
    }
    const sel = () => dati.find(l => l.id === selId) || null;

    /* ---------- disegno ---------- */
    function sottotitolo() {
        return VEDONO_TUTTO.includes(ruolo()) ? 'Tutti gli allert' : 'Gli allert segnalati a tutti e quelli mandati a te';
    }
    function kpi() {
        const da = dati.filter(l => stato(l) === 'DA_GESTIRE'), inG = dati.filter(l => stato(l) === 'IN_GESTIONE');
        const vecchio = da.reduce((m, l) => Math.max(m, giorniDa(quandoSegnalato(l))), 0);
        const miei = inG.filter(l => l.acquistoAlertInGestioneDa && l.acquistoAlertInGestioneDa.id === mioId()).length;
        const oggi = new Date().toDateString();
        const gOggi = dati.filter(l => stato(l) === 'GESTITA' && dUtc(l.acquistoAlertGestitaAt) && dUtc(l.acquistoAlertGestitaAt).toDateString() === oggi).length;
        const lim = Date.now() - 30 * 864e5;
        const tempi = dati.map(l => [dUtc(l.acquistoAlertSegnalatoAt), dUtc(l.acquistoAlertInGestioneAt)]).filter(([a, b]) => a && b && b >= a && a.getTime() >= lim).map(([a, b]) => b - a);
        const medio = tempi.length ? durata(tempi.reduce((x, y) => x + y, 0) / tempi.length) : '—';
        return `<section class="ap-kpi" aria-label="Riepilogo">
          <div class="ap-k da"><span>Da gestire</span><b>${da.length}</b><em>${da.length ? (vecchio ? 'il più vecchio è fermo ' + etaTesto(vecchio) : 'tutti segnalati oggi') : 'nessuno in attesa 👍'}</em></div>
          <div class="ap-k in"><span>In gestione</span><b>${inG.length}</b><em>di cui presi da te: ${miei}</em></div>
          <div class="ap-k ok"><span>Gestite oggi</span><b>${gOggi}</b><em>dalle 00:00 di oggi</em></div>
          <div class="ap-k tm"><span>Presa in carico</span><b>${medio}</b><em>tempo medio, ultimi 30 giorni</em></div></section>`;
    }
    function filtri() {
        const T = [['DA_GESTIRE', 'Da gestire'], ['IN_GESTIONE', 'In gestione'], ['GESTITA', 'Gestite'], ['TUTTI', 'Tutti']];
        const tipi = [...new Set(dati.filter(l => tab === 'TUTTI' || stato(l) === tab).map(tipo))].sort((a, b) => a.localeCompare(b, 'it'));
        if (tipoF && !tipi.includes(tipoF)) tipi.unshift(tipoF);
        return `<section class="ap-f" aria-label="Filtri">
          <div class="ap-tabs" role="tablist" aria-label="Stato">${T.map(([k, n]) => `<button type="button" role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-tab="${k}">${n} <i>${k === 'TUTTI' ? dati.length : conteggio(k)}</i></button>`).join('')}</div>
          <label class="ap-cerca"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input type="search" placeholder="Cerca cliente, numero, targa…" aria-label="Cerca" value="${esc(cerca)}" data-cerca></label>
          <div class="ap-chips" aria-label="Tipo"><button type="button" class="${!tipoF ? 'on' : ''}" data-tipo="">Tutti i tipi</button>${tipi.map(t => `<button type="button" class="${tipoF === t ? 'on' : ''}" data-tipo="${esc(t)}">${esc(t)}</button>`).join('')}</div>
          ${tab !== 'GESTITA' ? `<button type="button" class="ap-btn" data-ordine>${ordine === 'vecchi' ? 'Più vecchi prima' : 'Più recenti prima'}</button>` : ''}
        </section>`;
    }
    function riga(l) {
        const s = stato(l), g = giorniDa(quandoSegnalato(l)), on = l.id === selId;
        const eta = s === 'GESTITA' ? `<span class="ap-eta ok">${esc(fmt(dUtc(l.acquistoAlertGestitaAt)).split(' · ')[0])}</span>` : `<span class="ap-eta ${g >= 2 ? 'alto' : ''}">${etaTesto(g)}</span>`;
        const sub = [l.clienteNumero, vettura(l), l.serviceTarga].filter(Boolean).join(' · ');
        const chi = s === 'IN_GESTIONE' ? nomeU(l.acquistoAlertInGestioneDa) : s === 'GESTITA' ? nomeU(l.acquistoAlertGestitaDa) : '';
        return `<button type="button" class="ap-r ${on ? 'on' : ''} ${l.__nuovo ? 'nuovo' : ''}" data-id="${l.id}" aria-pressed="${on}">
          <span class="ap-c-eta">${eta}</span>
          <span class="ap-c-cl"><b>${esc(cliente(l))}${bozze[l.id] ? ' <small class="ap-bozza" title="Nota scritta e non salvata">✎</small>' : ''}</b><em>${esc(sub || '—')}</em></span>
          <span class="ap-c-tp"><span>${esc(tipo(l))}</span><em>${esc(l.category === 'Info Acquisto effettuato' ? 'Info Acquisto' : '')}${perMe(l) ? '<i class="ap-te">a te</i>' : ''}</em></span>
          <span class="ap-c-da"><span>${esc(segnalatoDa(l))}</span><em>${esc(fmt(quandoSegnalato(l)))}</em></span>
          <span class="ap-c-st"><span class="ap-pill ${s}">${STATI[s]}</span>${chi ? `<em>${esc(chi)}</em>` : ''}</span>
        </button>`;
    }
    function elenco(L) {
        const piu = tab === 'GESTITA' || tab === 'TUTTI';
        return `<section class="ap-list" aria-label="Elenco allert">
          <div class="ap-h"><span>Da</span><span>Cliente</span><span>Tipo</span><span>Segnalato da</span><span>Stato</span></div>
          ${L.length ? L.map(riga).join('') : `<p class="ap-vuoto">${cerca || tipoF ? 'Nessun allert con questi filtri' : tab === 'DA_GESTIRE' ? 'Nessun allert da gestire 👍' : 'Nessun allert in questo stato'}</p>`}
          ${piu && gestiteGiorni > 0 ? `<div class="ap-piu">Gestite degli ultimi ${gestiteGiorni} giorni${info.gestiteNascoste ? ` · ${info.gestiteNascoste} più vecchie` : ''} <button type="button" class="ap-link" data-tuttegestite>Mostra tutte</button></div>` : ''}
          ${piu && gestiteGiorni === 0 ? `<div class="ap-piu">Tutte le gestite <button type="button" class="ap-link" data-pochegestite>Solo ultimi 30 giorni</button></div>` : ''}
        </section>`;
    }
    function cronologia(l) {
        const v = [];
        v.push(['da', 'Segnalato da ' + segnalatoDa(l), quandoSegnalato(l)]);
        if (l.alertEmailInviataAt) v.push(['ml', 'Mail di avviso inviata', dUtc(l.alertEmailInviataAt)]);
        if (l.acquistoAlertInGestioneAt) v.push(['in', 'Preso in gestione da ' + (nomeU(l.acquistoAlertInGestioneDa) || '—'), dUtc(l.acquistoAlertInGestioneAt)]);
        if (l.acquistoAlertNoteGestioneModificataAt) v.push(['nt', 'Nota di gestione ' + (l.acquistoAlertNoteGestioneModificataAt === l.acquistoAlertNoteGestioneInseritaAt ? 'scritta' : 'modificata') + ' da ' + (nomeU(l.acquistoAlertNoteGestioneModificataDa) || '—'), dUtc(l.acquistoAlertNoteGestioneModificataAt)]);
        if (l.acquistoAlertGestitaAt && stato(l) === 'GESTITA') v.push(['ok', 'Gestita da ' + (nomeU(l.acquistoAlertGestitaDa) || '—'), dUtc(l.acquistoAlertGestitaAt)]);
        else if (l.acquistoAlertGestitaAt) v.push(['ri', 'Era stata gestita da ' + (nomeU(l.acquistoAlertGestitaDa) || '—') + ', poi riaperta', dUtc(l.acquistoAlertGestitaAt)]);
        if (l.acquistoAlertNoteGestitaModificataAt) v.push(['nt', 'Nota di chiusura ' + (l.acquistoAlertNoteGestitaModificataAt === l.acquistoAlertNoteGestitaInseritaAt ? 'scritta' : 'modificata') + ' da ' + (nomeU(l.acquistoAlertNoteGestitaModificataDa) || '—'), dUtc(l.acquistoAlertNoteGestitaModificataAt)]);
        v.sort((a, b) => (a[2] || 0) - (b[2] || 0));
        return `<ol class="ap-cr">${v.map(([k, t, d]) => `<li class="${k}"><i></i><span><b>${esc(t)}</b><em>${esc(fmtLungo(d))}</em></span></li>`).join('')}</ol>`;
    }
    function dettaglio() {
        const l = sel();
        if (!l) return `<aside class="ap-d ap-d-vuoto" aria-label="Dettaglio allert"><span>🔔</span><b>Scegli un allert</b><em>Qui vedi la richiesta, la cronologia e lo gestisci</em></aside>`;
        const s = stato(l), gest = !!info.puoGestire, riap = !!info.puoRiaprire;
        const b = bozze[l.id] || {};
        const notaG = b.g != null ? b.g : (l.acquistoAlertNoteGestione || ''), notaC = b.c != null ? b.c : (l.acquistoAlertNoteGestita || '');
        const dest = l.alertNotifyAll === false ? (l.alertRecipients || []).map(nomeU).filter(Boolean).join(', ') || 'persone scelte' : 'A tutti';
        const tel = (l.clienteNumero || '').replace(/[^\d+]/g, '');
        const R = richiesta(l);
        const chiusa = s === 'GESTITA' && !riap;
        return `<aside class="ap-d" aria-label="Dettaglio allert">
          <div class="ap-d-top">
            <button type="button" class="ap-d-back" data-indietro aria-label="Torna all'elenco">‹ Elenco</button>
            <div class="ap-d-r"><span class="ap-pill ${s}">${STATI[s]}</span><small>Allert n. ${l.id}</small></div>
            <h2>${esc(cliente(l))}</h2>
            <div class="ap-d-sub">${esc(l.category)}${l.category === 'Info Acquisto effettuato' ? ' · <b>' + esc(tipo(l)) + '</b>' : ''}</div>
            <div class="ap-d-az">
              ${tel ? `<a class="ap-btn ap-btn-v" href="tel:${esc(tel)}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>Chiama ${esc(l.clienteNumero)}</a>` : ''}
              <button type="button" class="ap-btn" data-storico>Storico cliente</button>
              <button type="button" class="ap-btn" data-scheda title="Anagrafica, destinatari, mail: la finestra allert di sempre">Scheda completa</button>
              ${window.ChatBdc ? '<button type="button" class="ap-btn" data-chat title="Manda questo allert in una chat">Invia in chat</button>' : ''}
            </div>
          </div>
          <dl class="ap-dl">
            <div><dt>Vettura</dt><dd>${esc(vettura(l) || '—')}</dd></div>
            <div><dt>Targa</dt><dd>${esc(l.serviceTarga || '—')}</dd></div>
            <div><dt>Consulente</dt><dd>${esc(l.consultantName || '—')}</dd></div>
            <div><dt>Segnalato a</dt><dd>${esc(dest)}</dd></div>
            <div><dt>Segnalato da</dt><dd>${esc(segnalatoDa(l))}</dd></div>
            <div><dt>Quando</dt><dd>${esc(fmtLungo(quandoSegnalato(l)))}</dd></div>
            ${l.clienteNumero2 || l.clienteEmail ? `<div class="w"><dt>Altri contatti</dt><dd>${esc([l.clienteNumero2, l.clienteEmail].filter(Boolean).join(' · '))}</dd></div>` : ''}
            <div class="w"><dt>Richiesta del cliente</dt><dd>${R.length ? R.map(x => `<p>${esc(x).replace(/\n/g, '<br>')}</p>`).join('') : '<p class="ap-mut">Nessuna nota</p>'}</dd></div>
          </dl>
          <div class="ap-sez"><div class="ap-tit">Cronologia</div>${cronologia(l)}</div>
          <div class="ap-sez ap-g">
            ${!gest ? '<p class="ap-mut">Puoi vedere gli allert ma non gestirli (permesso Allert nella pagina Permessi).</p>' : ''}
            ${chiusa ? `${notaG ? `<div class="ap-tit">Nota di gestione</div><p class="ap-nota">${esc(notaG).replace(/\n/g, '<br>')}</p>` : ''}${notaC ? `<div class="ap-tit">Nota di chiusura</div><p class="ap-nota">${esc(notaC).replace(/\n/g, '<br>')}</p>` : ''}<p class="ap-mut">Allert gestito: può riaprirlo solo un Moderatore o un Admin.</p>` : `
              <label class="ap-tit" for="apNotaG">Nota di gestione</label>
              <textarea id="apNotaG" rows="3" data-nota="g" placeholder="Cosa hai fatto, cosa hai detto al cliente…" ${gest ? '' : 'disabled'}>${esc(notaG)}</textarea>
              ${s !== 'DA_GESTIRE' ? `<label class="ap-tit" for="apNotaC">Nota di chiusura</label>
              <textarea id="apNotaC" rows="2" data-nota="c" placeholder="Come si è risolto" ${gest ? '' : 'disabled'}>${esc(notaC)}</textarea>` : ''}
              ${gest ? `<div class="ap-salva"><span>${bozze[l.id] ? '<b class="ap-bz">Nota non salvata</b> · ' : ''}Ctrl+Invio salva la nota</span><button type="button" class="ap-btn" data-salvanota ${bozze[l.id] ? '' : 'disabled'}>Salva nota</button></div>` : ''}`}
            ${gest ? `<div class="ap-azioni">
              ${s === 'DA_GESTIRE' ? '<button type="button" class="ap-big gi" data-stato="IN_GESTIONE">Prendi in gestione</button>' : ''}
              ${s !== 'GESTITA' ? '<button type="button" class="ap-big ok" data-stato="GESTITA">Segna come gestita</button>' : ''}
              ${s === 'GESTITA' && riap ? '<button type="button" class="ap-big ri" data-stato="IN_GESTIONE">Riapri</button>' : ''}
            </div>${s === 'IN_GESTIONE' ? '<button type="button" class="ap-link ap-rimetti" data-stato="">Rimetti tra i da gestire</button>' : ''}` : ''}
          </div>
        </aside>`;
    }
    function disegna() {
        const r = root(); if (!r) return;
        if (!r.querySelector('.ap-wrap')) costruisci();
        const att = document.activeElement, scrivendo = att && r.querySelector('.ap-d') && r.querySelector('.ap-d').contains(att) && att.matches('textarea');
        r.querySelector('.ap-sub').textContent = info.errore ? info.errore : sottotitolo();
        r.querySelector('.ap-kpi-box').innerHTML = kpi();
        const fBox = r.querySelector('.ap-f-box'), cercaFoc = att && att.matches && att.matches('[data-cerca]'), pos = cercaFoc ? att.selectionStart : 0;
        fBox.innerHTML = filtri();
        if (cercaFoc) { const c = fBox.querySelector('[data-cerca]'); c.focus(); try { c.setSelectionRange(pos, pos); } catch (e) { /* */ } }
        const L = filtrati();
        if (!stretto() && (!selId || !sel()) && L.length) selId = L[0].id;
        const lb = r.querySelector('.ap-list-box'), sc = lb.querySelector('.ap-list') ? lb.querySelector('.ap-list').scrollTop : 0;
        lb.innerHTML = elenco(L);
        if (lb.querySelector('.ap-list')) lb.querySelector('.ap-list').scrollTop = sc;
        if (scrivendo) dettaglioInSospeso = true; else disegnaDettaglio();
        r.querySelector('.ap-main').classList.toggle('ap-aperto', stretto() && !!sel());
        document.body.classList.toggle('ap-dett-on', visibile() && stretto() && !!sel());
    }
    function disegnaDettaglio() {
        const r = root(); if (!r) return;
        dettaglioInSospeso = false;
        r.querySelector('.ap-d-box').innerHTML = dettaglio();
    }
    function costruisci() {
        const r = root();
        r.innerHTML = `<div class="ap-wrap">
          <div class="ap-top"><div>${ruolo() !== 'BACK_OFFICE' ? '<button type="button" class="ap-torna" data-torna>← Torna al Registro contatti</button>' : ''}<h1>GESTIONE ALLERT</h1><p class="ap-sub"></p></div>
            <div class="ap-top-a"><span class="ap-live ${connesso ? '' : 'off'}" title="Si aggiorna da solo quando arriva o cambia un allert"><i></i>In tempo reale</span>
              <button type="button" class="ap-btn" data-excel><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>Excel</button></div></div>
          <div class="ap-kpi-box"></div>
          <div class="ap-f-box"></div>
          <div class="ap-main"><div class="ap-list-box"></div><div class="ap-d-box"></div></div>
        </div>`;
        r.addEventListener('click', clic);
        r.addEventListener('input', e => {
            if (e.target.matches('[data-cerca]')) { cerca = e.target.value.trim(); disegna(); return; }
            const n = e.target.closest('[data-nota]'); if (!n || !selId) return;
            const l = sel(); if (!l) return;
            const b = bozze[selId] || (bozze[selId] = {});
            b[n.dataset.nota] = n.value;
            const orig = { g: l.acquistoAlertNoteGestione || '', c: l.acquistoAlertNoteGestita || '' };
            if ((b.g == null || b.g === orig.g) && (b.c == null || b.c === orig.c)) delete bozze[selId];
            const sv = r.querySelector('[data-salvanota]'); if (sv) sv.disabled = !bozze[selId];
            const bz = r.querySelector('.ap-salva span'); if (bz) bz.innerHTML = (bozze[selId] ? '<b class="ap-bz">Nota non salvata</b> · ' : '') + 'Ctrl+Invio salva la nota';
        });
        r.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.closest('[data-nota]')) { e.preventDefault(); salvaNota(); } });
        r.addEventListener('focusout', () => setTimeout(() => { if (dettaglioInSospeso && !(document.activeElement && document.activeElement.matches && document.activeElement.matches('.ap-d textarea'))) disegnaDettaglio(); }, 0));
    }

    /* ---------- azioni ---------- */
    function clic(e) {
        const t = e.target;
        const tb = t.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; tipoF = ''; selId = null; disegna(); return; }
        const tp = t.closest('[data-tipo]'); if (tp) { tipoF = tp.dataset.tipo; disegna(); return; }
        if (t.closest('[data-ordine]')) { ordine = ordine === 'vecchi' ? 'recenti' : 'vecchi'; disegna(); return; }
        if (t.closest('[data-tuttegestite]')) { gestiteGiorni = 0; carica(); return; }
        if (t.closest('[data-pochegestite]')) { gestiteGiorni = 30; carica(); return; }
        if (t.closest('[data-excel]')) { excel(); return; }
        if (t.closest('[data-torna]')) { if (typeof showPage === 'function') showPage('contacts'); return; }
        const r = t.closest('.ap-r[data-id]'); if (r) { scegli(+r.dataset.id); return; }
        if (t.closest('[data-indietro]')) { selId = null; disegna(); return; }
        const l = sel(); if (!l) return;
        if (t.closest('[data-storico]')) { storico(l); return; }
        if (t.closest('[data-scheda]')) { schedaCompleta(l); return; }
        if (t.closest('[data-chat]')) { window.ChatBdc && ChatBdc.condividiAllert({ id: l.id, cliente: cliente(l), tipo: tipo(l), stato: STATI[stato(l)] }); return; }
        if (t.closest('[data-salvanota]')) { salvaNota(); return; }
        const st = t.closest('[data-stato]'); if (st) { cambiaStato(st.dataset.stato || null); return; }
    }
    function scegli(id) {
        const l = dati.find(x => x.id === id); if (l) l.__nuovo = false;
        selId = id; disegna();
        if (stretto()) { const d = root().querySelector('.ap-d'); if (d) d.scrollTop = 0; }
    }
    async function patch(id, body) {
        const r = await fetch('/api/contacts/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Errore ' + r.status);
        return d;
    }
    function metti(log) {
        const i = dati.findIndex(x => x.id === log.id);
        if (i >= 0) dati[i] = log; else dati.push(log);
        sincronizzaContatti([log]);
        if (typeof acquistoAlertModalId !== 'undefined' && acquistoAlertModalId === log.id && typeof refreshAcquistoAlertModalDisplay === 'function') { try { refreshAcquistoAlertModalDisplay(log); } catch (e) { /* */ } }
    }
    function notePerSalvare(l) {
        const b = bozze[l.id] || {}, out = {};
        if (b.g != null && b.g !== (l.acquistoAlertNoteGestione || '')) out.acquistoAlertNoteGestione = b.g;
        if (b.c != null && b.c !== (l.acquistoAlertNoteGestita || '')) out.acquistoAlertNoteGestita = b.c;
        return out;
    }
    let occupato = false;
    async function salvaNota() {
        const l = sel(); if (!l || occupato) return;
        const body = notePerSalvare(l); if (!Object.keys(body).length) return;
        occupato = true;
        try { const d = await patch(l.id, body); delete bozze[l.id]; metti(d); disegna(); disegnaDettaglio(); messaggio('Nota salvata'); }
        catch (e) { alert('Nota non salvata: ' + e.message); }
        finally { occupato = false; }
    }
    async function cambiaStato(nuovo) {
        const l = sel(); if (!l || occupato) return;
        const body = Object.assign({ acquistoAlertStatus: nuovo }, notePerSalvare(l));
        if (nuovo === 'GESTITA') {
            const g = body.acquistoAlertNoteGestione != null ? body.acquistoAlertNoteGestione : l.acquistoAlertNoteGestione;
            const c = body.acquistoAlertNoteGestita != null ? body.acquistoAlertNoteGestita : l.acquistoAlertNoteGestita;
            if (!String(g || '').trim() && !String(c || '').trim() && !confirm('Segnare l\'allert come gestito senza scrivere nessuna nota?')) return;
        }
        if (nuovo === null && !confirm('Rimettere l\'allert tra quelli da gestire? Si toglie chi l\'ha preso in gestione.')) return;
        occupato = true;
        try {
            const d = await patch(l.id, body);
            delete bozze[l.id]; metti(d);
            messaggio(nuovo === 'IN_GESTIONE' ? (stato(l) === 'GESTITA' ? 'Allert riaperto' : 'Preso in gestione da te') : nuovo === 'GESTITA' ? 'Allert gestito ✓' : 'Rimesso tra i da gestire');
            // preso in gestione (o riaperto): si resta sull'allert, si passa all'elenco "In gestione";
            // gestito o rimesso tra i da gestire: si passa al prossimo dello stesso elenco
            if (nuovo === 'IN_GESTIONE') { if (tab !== 'TUTTI') tab = 'IN_GESTIONE'; tipoF = ''; selId = l.id; }
            else if (tab !== 'TUTTI' && stato(d) !== tab) { const L = filtrati(); selId = stretto() ? null : (L[0] ? L[0].id : null); }
            disegna(); disegnaDettaglio();
        } catch (e) { alert(e.message); }
        finally { occupato = false; }
    }
    function messaggio(t) {
        let el = document.getElementById('apToast');
        if (!el) { el = document.createElement('div'); el.id = 'apToast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
        el.textContent = t; el.classList.add('on'); clearTimeout(messaggio._t); messaggio._t = setTimeout(() => el.classList.remove('on'), 2200);
    }
    // finestre del Registro (storico, modifica contatto) usabili anche fuori dal Registro
    function portaFuori() {
        ['customerHistoryModal', 'editContactModal'].forEach(id => { const m = document.getElementById(id); if (m && m.closest('#contactsPage')) document.body.appendChild(m); });
    }
    function storico(l) {
        if (typeof openCustomerHistoryModal !== 'function') return;
        portaFuori();
        openCustomerHistoryModal(l.clienteNome || '', l.clienteCognome || '', l.clienteNumero || '');
    }
    function schedaCompleta(l) {
        if (typeof openAcquistoAlertModal !== 'function') return;
        portaFuori();
        if (typeof contactLogs !== 'undefined' && Array.isArray(contactLogs) && !contactLogs.some(x => x.id === l.id)) contactLogs.unshift(l);
        openAcquistoAlertModal(l.id);
    }
    function excel() {
        const L = filtrati();
        if (!window.XLSX) { alert('Excel non disponibile in questo momento'); return; }
        const righe = L.map(l => ({
            'N.': l.id, 'Stato': STATI[stato(l)], 'Cliente': cliente(l), 'Telefono': l.clienteNumero || '', 'Categoria': l.category, 'Tipo': tipo(l),
            'Vettura': vettura(l), 'Targa': l.serviceTarga || '', 'Consulente': l.consultantName || '', 'Segnalato da': segnalatoDa(l), 'Segnalato il': fmtLungo(quandoSegnalato(l)),
            'Segnalato a': l.alertNotifyAll === false ? (l.alertRecipients || []).map(nomeU).join(', ') : 'A tutti',
            'In gestione da': nomeU(l.acquistoAlertInGestioneDa), 'In gestione il': fmtLungo(dUtc(l.acquistoAlertInGestioneAt)),
            'Gestita da': stato(l) === 'GESTITA' ? nomeU(l.acquistoAlertGestitaDa) : '', 'Gestita il': stato(l) === 'GESTITA' ? fmtLungo(dUtc(l.acquistoAlertGestitaAt)) : '',
            'Richiesta': richiesta(l).join(' / '), 'Nota di gestione': l.acquistoAlertNoteGestione || '', 'Nota di chiusura': l.acquistoAlertNoteGestita || ''
        }));
        const ws = XLSX.utils.json_to_sheet(righe.length ? righe : [{ 'N.': '', 'Stato': 'Nessun allert' }]);
        ws['!cols'] = [6, 12, 24, 15, 22, 18, 20, 10, 18, 18, 18, 18, 18, 18, 18, 18, 40, 40, 40].map(w => ({ wch: w }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Allert');
        const nome = { DA_GESTIRE: 'da-gestire', IN_GESTIONE: 'in-gestione', GESTITA: 'gestite', TUTTI: 'tutti' }[tab];
        XLSX.writeFile(wb, 'allert-' + nome + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    }

    /* ---------- apertura dalla chat / dal link nella mail ---------- */
    async function seleziona(id) {
        await (inCarica || Promise.resolve());
        let l = dati.find(x => x.id === id);
        if (!l) {
            try { const r = await fetch('/api/contacts/' + id); if (r.ok) { l = await r.json(); if (l && l.acquistoAlert) dati.push(l); else l = null; } } catch (e) { /* */ }
        }
        if (!l) { messaggio('Allert non trovato'); return; }
        if (tab !== 'TUTTI' && stato(l) !== tab) tab = stato(l);
        tipoF = ''; cerca = '';
        selId = id; disegna();
        const r = root().querySelector(`.ap-r[data-id="${id}"]`); if (r) r.scrollIntoView({ block: 'center' });
    }
    window.apriAllertDaChat = function (id) {
        if (visibile()) { seleziona(id); return; }
        if (puo() && typeof showPage === 'function') { showPage('allert').then(() => seleziona(id)); return; }
        if (typeof openAlertFromLink === 'function') openAlertFromLink(id);
    };
    // il link "apri allert" della mail: sulla pagina Allert si apre qui
    if (typeof window.openAlertFromLink === 'function') {
        const orig = window.openAlertFromLink;
        window.openAlertFromLink = function (id) { if (visibile()) return seleziona(+id); return orig.apply(this, arguments); };
    }
    // modifiche fatte dalla scheda completa (contact.js): la pagina si aggiorna subito
    if (typeof window.applyUpdatedLogEverywhere === 'function') {
        const orig = window.applyUpdatedLogEverywhere;
        window.applyUpdatedLogEverywhere = function (log) {
            try { return orig.apply(this, arguments); }
            finally { if (log && log.id && dati.some(x => x.id === log.id)) { const i = dati.findIndex(x => x.id === log.id); dati[i] = log; if (visibile()) disegna(); } }
        };
    }

    /* ---------- pagina ---------- */
    async function apri() {
        if (!puo()) return;
        document.body.classList.add('ap-on');
        collega();
        if (!root().querySelector('.ap-wrap')) costruisci();
        await carica();
        avviaGiro();
    }
    function avviaGiro() {
        if (timer) return;
        timer = setInterval(() => { if (visibile() || ruolo() === 'BACK_OFFICE') carica(); }, 60 * 1000);
    }
    // il Back Office riceve gli avvisi dei nuovi allert anche se e' su un'altra pagina
    const attesa = setInterval(() => { if (!io()) return; clearInterval(attesa); if (ruolo() === 'BACK_OFFICE') { collega(); carica(); avviaGiro(); } }, 1500);
    // fuori dalla pagina: via le classi
    setInterval(() => { if (!visibile()) document.body.classList.remove('ap-on', 'ap-dett-on'); else document.body.classList.add('ap-on'); }, 700);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && visibile() && stretto() && selId && !document.querySelector('.modal-overlay[style*="flex"]')) { selId = null; disegna(); } });
    window.addEventListener('resize', () => { if (visibile()) disegna(); });

    /* ---------- dal Registro: pulsante "Vedi finestra allert" nella finestra 🔔 ALLERT ---------- */
    function pulsanteRegistro(mostra) {
        const h = document.querySelector('#sedeDetailModal .modal-header'); if (!h) return;
        let b = document.getElementById('apVediBtn');
        if (!b && mostra) {
            b = document.createElement('button'); b.type = 'button'; b.id = 'apVediBtn'; b.className = 'ap-vedi'; b.textContent = 'Vedi finestra allert';
            b.title = 'Apre la pagina di gestione degli allert (da gestire, in gestione, gestite)';
            b.addEventListener('click', () => { if (typeof closeSedeDetail === 'function') closeSedeDetail(); else document.getElementById('sedeDetailModal').style.display = 'none'; if (typeof showPage === 'function') showPage('allert'); });
            const x = h.querySelector('.modal-close'); h.insertBefore(b, x || null);
        }
        if (b) b.hidden = !mostra;
    }
    if (typeof window.showGenericContactDetail === 'function') {
        const orig = window.showGenericContactDetail;
        window.showGenericContactDetail = function () { pulsanteRegistro(false); return orig.apply(this, arguments); };
    }
    if (typeof window.openAllAlertsModal === 'function') {
        const orig = window.openAllAlertsModal;
        window.openAllAlertsModal = async function () { const r = await orig.apply(this, arguments); pulsanteRegistro(puo()); return r; };
    }

    window.AllertPage = { puo, apri, carica, seleziona };
})();
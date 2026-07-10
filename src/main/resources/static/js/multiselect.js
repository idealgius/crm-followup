// ============================================================
// MULTI-SELECT FILTRI — motore generico riutilizzabile
// Ogni filtro multi-select è identificato da un "key" (es. 'contactCategoryFilterMulti')
// e si aspetta questi elementi nel DOM, con id basati sul key:
//   {key}-label      -> span con l'etichetta riassuntiva mostrata nel trigger
//   {key}-count      -> badge numerico con quante opzioni sono selezionate
//   {key}-dropdown   -> contenitore del dropdown (classe multi-select-dropdown)
//   {key}-options    -> contenitore delle checkbox (classe multi-select-option)
// ============================================================

const multiSelectState = {};

function getMultiSelectValues(key) {
    return multiSelectState[key] || [];
}

function setMultiSelectValues(key, values) {
    multiSelectState[key] = values;
}

function toggleMultiDropdown(key) {
    const dropdown = document.getElementById(`${key}-dropdown`);
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('open');
    closeAllMultiDropdowns();
    if (!isOpen) dropdown.classList.add('open');
}

function closeAllMultiDropdowns() {
    document.querySelectorAll('.multi-select-dropdown.open').forEach(d => d.classList.remove('open'));
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.multi-select-wrapper')) closeAllMultiDropdowns();
});

function onMultiSelectChange(key) {
    const optionsContainer = document.getElementById(`${key}-options`);
    if (!optionsContainer) return;
    const checked = [...optionsContainer.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.value);
    setMultiSelectValues(key, checked);
    updateMultiSelectLabel(key);
}

function updateMultiSelectLabel(key) {
    const values = getMultiSelectValues(key);
    const labelEl = document.getElementById(`${key}-label`);
    const countEl = document.getElementById(`${key}-count`);
    const defaultLabels = {
        'consultantFilterMulti': 'Tutti i consulenti',
        'contactOperatorFilterMulti': 'Tutti gli operatori',
        'contactCategoryFilterMulti': 'Tutte le categorie',
        'rentStatoFilterMulti': 'Tutti gli stati',
        'rentMarchioFilterMulti': 'Tutti i marchi',
        'rentFonteFilterMulti': 'Tutte le fonti',
        'rentOperatoreFilterMulti': 'Tutti gli operatori'
    };
    if (!labelEl) return;
    if (values.length === 0) {
        labelEl.textContent = defaultLabels[key] || 'Tutti';
    } else if (values.length === 1) {
        labelEl.textContent = values[0];
    } else {
        labelEl.textContent = `${values.length} selezionati`;
    }
    if (countEl) {
        countEl.textContent = values.length;
        countEl.classList.toggle('active', values.length > 0);
    }
}

function multiSelectClear(key) {
    const optionsContainer = document.getElementById(`${key}-options`);
    if (optionsContainer) {
        optionsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    }
    setMultiSelectValues(key, []);
    updateMultiSelectLabel(key);
}

// Popola dinamicamente le opzioni di un multi-select con checkbox (usato per liste che
// dipendono dai dati caricati: operatori, marchi, fonti). Mantiene selezionati i valori
// già scelti in precedenza, se ancora presenti tra le nuove opzioni.
function populateMultiSelectOptions(key, values) {
    const container = document.getElementById(`${key}-options`);
    if (!container) return;
    const previousSelected = getMultiSelectValues(key);
    container.innerHTML = values.map(v => `
        <label class="multi-select-option">
            <input type="checkbox" value="${v}" onchange="onMultiSelectChange('${key}')" ${previousSelected.includes(v) ? 'checked' : ''}>
            ${v}
        </label>
    `).join('');
    // Ricalcola i selezionati effettivi (nel caso alcuni valori precedenti non esistano più)
    onMultiSelectChange(key);
}

// ============================================================
// MODAL MODIFICA CONTATTO ESTESO — apertura/compilazione/salvataggio
// Sostituisce le versioni semplificate di openEditContactModal/saveEditContactLog
// definite in contact.js, gestendo tutti i campi aggiunti al modal.
// ============================================================

const EDIT_CATEGORY_ROWS = {
    'Info Vendita': ['editContactFonteRow', 'editContactMarcaModelloRow', 'editContactLinkAutoRow'],
    'Info + Appuntamento': ['editContactFonteRow', 'editContactMarcaModelloRow', 'editContactLinkAutoRow', 'editContactAppuntamentoRow'],
    'Info Vendita in Promo': ['editContactFonteRow', 'editContactMarcaModelloRow', 'editContactLinkAutoRow', 'editContactPromoRow'],
    'Info Noleggio': ['editContactNoleggioRow'],
    'Service': ['editContactServiceRow'],
    'Info Acquisto effettuato': ['editContactAcquistoRow'],
    'Altro': ['editContactOtherRow']
};

function onEditCategoryChange() {
    const cat = document.getElementById('editContactCategory')?.value || '';
    const allRows = [
        'editContactFonteRow', 'editContactMarcaModelloRow', 'editContactLinkAutoRow',
        'editContactNoleggioRow', 'editContactServiceRow', 'editContactAppuntamentoRow',
        'editContactAcquistoRow', 'editContactPromoRow', 'editContactOtherRow'
    ];
    allRows.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const rowsToShow = EDIT_CATEGORY_ROWS[cat] || [];
    rowsToShow.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'block';
    });
}

// Sovrascrive la versione base di contact.js con quella estesa: tutti i campi popolati.
function openEditContactModal(id) {
    const log = contactLogs.find(l => l.id === id);
    if (!log) return;
    editingContactId = id;

    const categorySelect = document.getElementById('editContactCategory');
    if (categorySelect) {
        categorySelect.innerHTML = ALL_CATEGORIES.map(c => `<option value="${c}" ${c===log.category?'selected':''}>${c}</option>`).join('');
    }

    const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };

    // Dati cliente
    setVal('editContactNome', log.clienteNome);
    setVal('editContactCognome', log.clienteCognome);
    setVal('editContactNumero', log.clienteNumero || (clienteNumeroDisplay(log) !== '—' ? clienteNumeroDisplay(log) : ''));

    // Fonte (Info Vendita / Appuntamento / Promo)
    setVal('editContactFonte', log.otherNote && FONTE_LIST.includes(log.otherNote) ? log.otherNote : '');

    // Marca/Modello generico + Lead — ora tendina: popolo sia l'hidden che l'input visibile
    setVal('editContactMarca', log.marca);
    const marcaInputEl = document.getElementById('editContactMarcaInput');
    if (marcaInputEl) marcaInputEl.value = log.marca || '';
    setVal('editContactModello', log.modello);
    setVal('editContactLinkAuto', log.linkAuto);

    // Info Noleggio
    setVal('editContactNoleggioRichiesta', log.noleggioRichiesta);
    setVal('editContactNoleggioTipo', log.noleggioTipo);
    setVal('editContactNoleggioMarca', log.marca);
    const noleggioMarcaInputEl = document.getElementById('editContactNoleggioMarcaInput');
    if (noleggioMarcaInputEl) noleggioMarcaInputEl.value = log.marca || '';
    setVal('editContactNoleggioModello', log.modello);
    setVal('editContactNoleggioLink', log.noleggioLink);

    // Service
    setVal('editContactServiceSede', log.serviceSede);
    setVal('editContactServiceTipo', log.serviceTipo);
    setVal('editContactServiceNote', log.serviceNote);
    setVal('editContactServiceTipoCliente', log.serviceTipoCliente);
    setVal('editContactTarga', log.serviceTarga);

    // Appuntamento
    setVal('editContactAppuntamentoSede', log.category === 'Info + Appuntamento' ? log.otherNote : '');
    setVal('editContactAppuntamentoLink', log.linkAppuntamento);

    // Acquisto
    setVal('editContactAcquistoTipo', log.category === 'Info Acquisto effettuato' ? log.otherNote : '');
    setVal('editContactAcquistoNote', log.acquistoNote);

    // Promo
    setVal('editContactPromoModello', log.modello);

    // Altro
    setVal('editContactOtherNote', log.category === 'Altro' ? log.otherNote : '');

    onEditCategoryChange();

    const modal = document.getElementById('editContactModal');
    if (modal) modal.style.display = 'flex';
}

// Sovrascrive la versione base di contact.js: salva tutti i campi in base alla categoria.
async function saveEditContactLog() {
    if (!editingContactId) return;
    const category = document.getElementById('editContactCategory')?.value || '';
    const clienteNome = document.getElementById('editContactNome')?.value.trim() || '';
    const clienteCognome = document.getElementById('editContactCognome')?.value.trim() || '';
    const clienteNumero = document.getElementById('editContactNumero')?.value.trim() || '';

    if (!category) { alert('Seleziona una categoria'); return; }
    if (!clienteNumero) { alert('Il numero cliente è obbligatorio'); return; }

    const payload = {
        category,
        clienteNome: clienteNome || null,
        clienteCognome: clienteCognome || null,
        clienteNumero
    };

    const isVenditaLike = category === 'Info Vendita' || category === 'Info + Appuntamento' || category === 'Info Vendita in Promo';
    const isNoleggio = category === 'Info Noleggio';
    const isService = category === 'Service';
    const isAppuntamento = category === 'Info + Appuntamento';
    const isAcquisto = category === 'Info Acquisto effettuato';
    const isPromo = category === 'Info Vendita in Promo';
    const isAltro = category === 'Altro';

    if (isVenditaLike) {
        payload.marca = document.getElementById('editContactMarca')?.value.trim() || null;
        payload.modello = document.getElementById('editContactModello')?.value.trim() || null;
        payload.linkAuto = document.getElementById('editContactLinkAuto')?.value.trim() || null;
        const fonte = document.getElementById('editContactFonte')?.value || '';
        if (!isAppuntamento) payload.otherNote = fonte || null;
    }

    if (isAppuntamento) {
        payload.otherNote = document.getElementById('editContactAppuntamentoSede')?.value || null;
        payload.linkAppuntamento = document.getElementById('editContactAppuntamentoLink')?.value.trim() || null;
        // In + Appuntamento la fonte è salvata su serviceTipo (stessa convenzione di createContactLog)
        payload.serviceTipo = document.getElementById('editContactFonte')?.value || null;
    }

    if (isNoleggio) {
        const richiesta = document.getElementById('editContactNoleggioRichiesta')?.value || '';
        payload.noleggioRichiesta = richiesta || null;
        payload.marca = document.getElementById('editContactNoleggioMarca')?.value.trim() || null;
        payload.modello = document.getElementById('editContactNoleggioModello')?.value.trim() || null;
        if (richiesta === 'RICHIESTA_CLIENTE') {
            payload.noleggioTipo = document.getElementById('editContactNoleggioTipo')?.value || null;
            payload.noleggioLink = document.getElementById('editContactNoleggioLink')?.value.trim() || null;
        } else {
            payload.noleggioTipo = null;
            payload.noleggioLink = null;
        }
    }

    if (isService) {
        payload.serviceSede = document.getElementById('editContactServiceSede')?.value || null;
        payload.serviceTipo = document.getElementById('editContactServiceTipo')?.value || null;
        payload.serviceNote = document.getElementById('editContactServiceNote')?.value.trim() || null;
        payload.serviceTipoCliente = document.getElementById('editContactServiceTipoCliente')?.value || null;
        payload.serviceTarga = document.getElementById('editContactTarga')?.value.trim() || null;
    }

    if (isAcquisto) {
        payload.otherNote = document.getElementById('editContactAcquistoTipo')?.value || null;
        payload.acquistoNote = document.getElementById('editContactAcquistoNote')?.value.trim() || null;
    }

    if (isPromo) {
        payload.modello = document.getElementById('editContactPromoModello')?.value.trim() || null;
    }

    if (isAltro) {
        payload.otherNote = document.getElementById('editContactOtherNote')?.value.trim() || null;
    }

    const savedDayView = currentDayView;
    try {
        const res = await fetch(`/api/contacts/${editingContactId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const data = await res.json().catch(() => null);
            alert(data?.error || 'Errore nel salvataggio');
            return;
        }
        closeEditContactModal();
        const from = document.getElementById('contactFrom')?.value;
        const to = document.getElementById('contactTo')?.value;
        await loadContactLogs(from, to, savedDayView);
    } catch (err) {
        console.error('Errore modifica:', err);
    }
}

// ============================================================
// TENDINA MARCA — MODAL MODIFICA (generica: Info Vendita/Appuntamento/Promo)
// Stessa logica di filterMarche/selectMarca in contact.js, ma puntata sugli
// id del modal di modifica invece che sul form di creazione.
// ============================================================

function showEditMarcheDropdown() { filterEditMarche('', true); }

function filterEditMarche(query, showAll) {
    const dropdown = document.getElementById('editMarcaDropdown');
    if (!dropdown) return;
    const matches = (!query || query.trim() === '' || showAll)
        ? MARCHE_NORMALIZED
        : MARCHE_NORMALIZED.filter(m => m.normalized.includes(normalizeText(query.trim())));
    if (matches.length === 0) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(m => `
        <div onclick="selectEditMarca('${m.original}')"
             style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)"
             onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
            ${m.original}
        </div>`).join('');
    dropdown.style.display = 'block';
}

function selectEditMarca(marca) {
    const input = document.getElementById('editContactMarcaInput');
    const hidden = document.getElementById('editContactMarca');
    if (input) input.value = marca;
    if (hidden) hidden.value = marca;
    const dropdown = document.getElementById('editMarcaDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

// ============================================================
// TENDINA MARCA — MODAL MODIFICA (dedicata Info Noleggio)
// ============================================================

function showEditNoleggioMarcheDropdown() { filterEditNoleggioMarche('', true); }

function filterEditNoleggioMarche(query, showAll) {
    const dropdown = document.getElementById('editNoleggioMarcaDropdown');
    if (!dropdown) return;
    const matches = (!query || query.trim() === '' || showAll)
        ? MARCHE_NORMALIZED
        : MARCHE_NORMALIZED.filter(m => m.normalized.includes(normalizeText(query.trim())));
    if (matches.length === 0) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(m => `
        <div onclick="selectEditNoleggioMarca('${m.original}')"
             style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border)"
             onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
            ${m.original}
        </div>`).join('');
    dropdown.style.display = 'block';
}

function selectEditNoleggioMarca(marca) {
    const input = document.getElementById('editContactNoleggioMarcaInput');
    const hidden = document.getElementById('editContactNoleggioMarca');
    if (input) input.value = marca;
    if (hidden) hidden.value = marca;
    const dropdown = document.getElementById('editNoleggioMarcaDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

// Chiude i due dropdown marca del modal di modifica quando si clicca fuori,
// stessa logica già presente in contact.js per il form di creazione.
document.addEventListener('click', function(e) {
    const editMarcaDropdown = document.getElementById('editMarcaDropdown');
    const editMarcaInput = document.getElementById('editContactMarcaInput');
    if (editMarcaDropdown && editMarcaInput && !editMarcaInput.contains(e.target) && !editMarcaDropdown.contains(e.target)) {
        editMarcaDropdown.style.display = 'none';
    }

    const editNoleggioMarcaDropdown = document.getElementById('editNoleggioMarcaDropdown');
    const editNoleggioMarcaInput = document.getElementById('editContactNoleggioMarcaInput');
    if (editNoleggioMarcaDropdown && editNoleggioMarcaInput && !editNoleggioMarcaInput.contains(e.target) && !editNoleggioMarcaDropdown.contains(e.target)) {
        editNoleggioMarcaDropdown.style.display = 'none';
    }
});
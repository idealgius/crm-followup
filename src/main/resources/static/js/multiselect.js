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
// RIMOSSO: qui c'era una versione duplicata (e ormai superata) di
// onEditCategoryChange(), openEditContactModal() e saveEditContactLog(),
// dichiarate con lo stesso nome di quelle in contact.js. In JavaScript
// quando la stessa funzione viene dichiarata due volte, vince sempre
// l'ultima caricata: siccome multiselect.js viene incluso in index.html
// DOPO contact.js, era SEMPRE questa versione vecchia a girare davvero,
// azzerando in silenzio tutti i fix fatti nel tempo su contact.js (marca/
// modello/targa per "Info Acquisto effettuato", nota aggiuntiva sempre
// editabile, righe Leasing/Finanziamento/Amministrazione, apertura
// scheda per contatti fuori dal periodo filtrato). Le tre funzioni ora
// vivono SOLO in contact.js.
// ============================================================


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
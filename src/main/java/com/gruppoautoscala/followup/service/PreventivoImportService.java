package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.PreventivoImportLog;
import com.gruppoautoscala.followup.model.PreventivoTelefonico;
import com.gruppoautoscala.followup.model.PreventivoTelefonicoStatusHistory;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.PreventivoImportLogRepository;
import com.gruppoautoscala.followup.repository.PreventivoTelefonicoRepository;
import com.gruppoautoscala.followup.repository.PreventivoTelefonicoStatusHistoryRepository;
import com.gruppoautoscala.followup.repository.UserRepository;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

// Import lead da CSV (export del portale lead): un preventivo telefonico
// VENDITA o NOLEGGIO per ogni riga, deduplicato tramite l'identificativo
// lead (colonna "ID" -> sourceLeadId). Nessuna riga viene MAI scartata per
// mancata corrispondenza su marca/consulente — vengono normalizzate se
// possibile, altrimenti importate cosi' come scritte nel file. Vengono
// invece saltate (con motivo riportato all'utente) le righe con dati
// realmente mancanti/non interpretabili: ID assente, nome/cognome vuoti,
// operatore (Caller) non riconosciuto tra gli utenti del sistema, tipo
// richiesta non riconoscibile, data ricontatto non parsabile.
@Service
public class PreventivoImportService {

    private static final DateTimeFormatter DATA_RICONTATTO_FORMAT = DateTimeFormatter.ofPattern("dd/MM/yy HH:mm");

    // Stessa lista di MARCHE_LIST in contact.js — mantenuta allineata a
    // mano. Usata SOLO per normalizzare la scrittura (es. "hyundai" ->
    // "HYUNDAI"), mai per scartare una riga.
    private static final List<String> MARCHE_LIST = List.of(
        "ALFA ROMEO", "AUDI", "BMW", "BYD", "CITROEN", "CUPRA", "DACIA", "DR", "DS", "EVO",
        "FIAT", "FORD", "FERRARI", "HYUNDAI", "ICH-X", "INFINITI", "IVECO", "JAECOO", "JEEP",
        "KIA", "LAMBORGHINI", "LANCIA", "LAND ROVER", "LEAPMOTOR", "MAXUS", "MAZDA",
        "MARCA GENERICA", "MASERATI", "MERCEDES-BENZ", "MG", "MINI", "MITSUBISHI", "NISSAN", "OMODA", "OPEL",
        "PEUGEOT", "PORSCHE", "RENAULT", "SAAB", "SEAT", "SKODA", "SMART", "SPORTEQUIPE",
        "SUZUKI", "SWM", "TIGER", "TOYOTA", "TESLA", "VOLKSWAGEN"
    );

    // Stessa lista consulenti della tendina in index.html — idem, solo
    // normalizzazione, mai scarto. IMPORTANTE: scritta in ordine "Nome
    // Cognome", la stessa convenzione usata in tutto il resto dell'app
    // (dashboard, Follow-up, grafici) — NON "Cognome Nome". Un elenco
    // scritto nell'ordine sbagliato qui era la causa del bug per cui
    // "Castaldo Marco" e "Marco Castaldo" comparivano come due consulenti
    // diversi nel riepilogo: la vecchia lista, in ordine Cognome Nome,
    // "normalizzava" solo l'input che per caso coincideva col suo stesso
    // ordine sbagliato, lasciando l'altro intatto.
    private static final List<String> CONSULENTI_LIST = List.of(
        "Luca Ambrosino", "Silvio Capitelli", "Marco Castaldo", "Roberto Castaldo",
        "Raffaele Crispo", "Claudio Filosa", "Guido Fiore", "Claudio Gerardi", "Luca Giordano",
        "Ciro Imperato", "Francesco Montuori", "Enrico Palumbo", "Rosario Scala",
        "Francesco Sementa", "Davide Zaritto", "Mattia Zuppa"
    );

    // Indice di CONSULENTI_LIST per "chiave nome" (stesso schema di
    // nameKey/usersByName usato per il Caller): permette di riconoscere un
    // consulente qualunque sia l'ordine con cui il file lo scrive
    // ("Castaldo Marco" o "Marco Castaldo" risultano la stessa chiave) e
    // di restituire sempre la forma canonica "Nome Cognome".
    private static final Map<String, String> CONSULENTI_BY_KEY = buildConsulentiByKey();

    private static Map<String, String> buildConsulentiByKey() {
        Map<String, String> m = new HashMap<>();
        for (String c : CONSULENTI_LIST) m.put(staticNameKey(c), c);
        return m;
    }

    // NUOVO: per ora gli unici operatori ammessi per l'inserimento dei
    // preventivi telefonici. Confronto con la stessa "chiave nome" usata per
    // il Caller (ordine nome/cognome, maiuscole e accenti non contano).
    public static final List<String> OPERATORI_AMMESSI = List.of(
        "Emanuele Amendola", "Giuseppe Palladino", "Davide Scognamiglio", "Mattia Zuppa");

    public static boolean operatoreAmmesso(String fullName) {
        if (fullName == null || fullName.isBlank()) return false;
        String k = staticNameKey(fullName);
        for (String n : OPERATORI_AMMESSI) if (staticNameKey(n).equals(k)) return true;
        return false;
    }

    @Autowired private PreventivoTelefonicoRepository preventivoRepository;
    @Autowired private PreventivoTelefonicoStatusHistoryRepository historyRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private PreventivoImportLogRepository importLogRepository;
    @Autowired private PreventivoRentSyncService rentSyncService;

    public static class ImportResult {
        public int created = 0;
        public int updated = 0;
        public int unchanged = 0;
        public List<String> errori = new ArrayList<>();
        // Preventivi dove il consulente nel file differisce da quello gia'
        // salvato A MANO — non sovrascritti in automatico, in attesa di
        // decisione dell'utente nel popup dedicato.
        public List<Map<String, Object>> conflittiConsulente = new ArrayList<>();
        // NUOVO: righe non importate per scelta ("Non importare") e
        // preventivi a cui e' stato cambiato l'operatore.
        public int saltati = 0;
        public int operatoriCorretti = 0;
    }

    public ImportResult importLeadCsv(MultipartFile file, User importer) throws IOException {
        return importLeadCsv(file, importer, Map.of(), Set.of());
    }

    // NUOVO: perLead = operatore scelto a mano per un ID lead (sempre uno dei
    // 4 ammessi); salta = ID lead da non importare.
    public ImportResult importLeadCsv(MultipartFile file, User importer,
                                      Map<String, User> perLead, Set<String> salta) throws IOException {
        ImportResult result = new ImportResult();

        // Mappa operatori per "chiave nome" (parole ordinate alfabeticamente,
        // minuscolo, senza accenti) invece che per fullName esatto — cosi'
        // "Emanuele Amendola" nel CSV combacia con "Amendola Emanuele" nel
        // database, qualunque sia l'ordine con cui e' stato salvato, senza
        // dover indovinare la convenzione esatta usata per ogni utente.
        Map<String, User> usersByName = new HashMap<>();
        for (User u : userRepository.findAll()) {
            if (u.getFullName() != null) usersByName.put(nameKey(u.getFullName()), u);
        }

        int rowNum = 1;
        for (CSVRecord record : leggiRighe(file)) {
            rowNum++;
            try {
                processRow(record, usersByName, importer, result, perLead, salta);
            } catch (Exception e) {
                result.errori.add("Riga " + rowNum + ": errore imprevisto (" + e.getMessage() + ")");
            }
        }

        PreventivoImportLog log = new PreventivoImportLog();
        log.setFileName(file.getOriginalFilename());
        log.setImportedBy(importer);
        log.setImportedAt(LocalDateTime.now());
        log.setCreati(result.created);
        log.setAggiornati(result.updated);
        log.setInvariati(result.unchanged);
        log.setNumErrori(result.errori.size());
        importLogRepository.save(log);

        return result;
    }

    public List<PreventivoImportLog> getImportHistory() {
        return importLogRepository.findAllWithUser();
    }

    private List<CSVRecord> leggiRighe(MultipartFile file) throws IOException {
        String content = new String(file.getBytes(), StandardCharsets.UTF_8);
        if (content.startsWith("\uFEFF")) content = content.substring(1);

        CSVFormat format = CSVFormat.DEFAULT.builder()
            .setDelimiter(';')
            .setHeader()
            .setSkipHeaderRecord(true)
            .setIgnoreEmptyLines(true)
            .setTrim(true)
            .setQuote('"')
            .build();

        try (CSVParser parser = new CSVParser(new StringReader(content), format)) {
            return parser.getRecords();
        }
    }

    private Map<String, User> utentiPerNome() {
        Map<String, User> usersByName = new HashMap<>();
        for (User u : userRepository.findAll()) {
            if (u.getFullName() != null) usersByName.put(nameKey(u.getFullName()), u);
        }
        return usersByName;
    }

    // ===== OPERATORI AMMESSI (NUOVO) =====

    // Gli utenti del CRM che corrispondono ai 4 nomi ammessi (uno per nome,
    // preferendo l'account attivo se ce ne fosse piu' d'uno).
    public List<User> utentiAmmessi() {
        Map<String, User> perNome = new LinkedHashMap<>();
        for (String n : OPERATORI_AMMESSI) perNome.put(staticNameKey(n), null);
        for (User u : userRepository.findAll()) {
            String k = staticNameKey(u.getFullName());
            if (!perNome.containsKey(k)) continue;
            User gia = perNome.get(k);
            boolean disattivo = u.getRole() != null && u.getRole().startsWith("X:");
            boolean giaDisattivo = gia != null && gia.getRole() != null && gia.getRole().startsWith("X:");
            if (gia == null || (!disattivo && giaDisattivo)) perNome.put(k, u);
        }
        List<User> out = new ArrayList<>();
        for (User u : perNome.values()) if (u != null) out.add(u);
        return out;
    }

    // Prima dell'import: legge il file e restituisce le righe con un
    // operatore diverso dai 4 ammessi, cosi' l'utente sceglie a chi vanno.
    // Comprende anche i preventivi gia' caricati (nel file o no) che hanno
    // ancora un operatore non ammesso. Non salva nulla.
    public Map<String, Object> anteprimaOperatori(MultipartFile file) throws IOException {
        Map<String, User> usersByName = utentiPerNome();
        List<PreventivoTelefonico> tutti = preventivoRepository.findAllWithUser();
        Map<String, PreventivoTelefonico> giaCaricati = new HashMap<>();
        for (PreventivoTelefonico p : tutti) {
            if (p.getSourceLeadId() != null) giaCaricati.put(p.getSourceLeadId(), p);
        }

        List<Map<String, Object>> righe = new ArrayList<>();
        Set<String> nelFile = new HashSet<>();
        for (CSVRecord record : leggiRighe(file)) {
            String lead = get(record, "ID");
            if (isBlank(lead) || !nelFile.add(lead)) continue;

            // Stessa logica dell'import: Caller, altrimenti "Inserito da"
            String callerName = extractNameBeforeParenthesis(get(record, "Caller"));
            User caller = callerName != null ? usersByName.get(nameKey(callerName)) : null;
            String nomeNelFile = caller != null ? caller.getFullName() : callerName;
            if (caller == null) {
                String ins = get(record, "Inserito da");
                User u = ins != null ? usersByName.get(nameKey(ins)) : null;
                if (u != null) { caller = u; nomeNelFile = u.getFullName(); }
                else if (nomeNelFile == null && !isBlank(ins)) nomeNelFile = ins;
            }
            if (caller != null && operatoreAmmesso(caller.getFullName())) continue;

            PreventivoTelefonico p = giaCaricati.get(lead);
            // gia' caricato e gia' corretto su uno dei 4: non si richiede piu'
            if (p != null && p.getUser() != null && operatoreAmmesso(p.getUser().getFullName())) continue;

            String nome = get(record, "Nome"), cognome = get(record, "Cognome");
            if (isBlank(nome) && isBlank(cognome)) { nome = get(record, "Ragione sociale"); cognome = ""; }

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("chiave", "L:" + lead);
            m.put("sourceLeadId", lead);
            m.put("esistente", p != null);
            m.put("nelFile", true);
            m.put("clienteNome", nome == null ? "" : nome);
            m.put("clienteCognome", cognome == null ? "" : cognome);
            m.put("marca", normalizeMarca(get(record, "Marca")));
            m.put("modello", get(record, "Modello"));
            m.put("operatore", isBlank(nomeNelFile) ? "—" : nomeNelFile);
            m.put("operatoreRiconosciuto", caller != null);
            m.put("operatoreAttuale", p != null && p.getUser() != null ? p.getUser().getFullName() : null);
            righe.add(m);
        }

        for (PreventivoTelefonico p : tutti) {
            if (p.getSourceLeadId() != null && nelFile.contains(p.getSourceLeadId())) continue;
            String attuale = p.getUser() != null ? p.getUser().getFullName() : null;
            if (operatoreAmmesso(attuale)) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("chiave", "P:" + p.getId());
            m.put("sourceLeadId", p.getSourceLeadId());
            m.put("esistente", true);
            m.put("nelFile", false);
            m.put("clienteNome", p.getClienteNome());
            m.put("clienteCognome", p.getClienteCognome());
            m.put("marca", p.getMarca());
            m.put("modello", p.getModello());
            m.put("operatore", attuale == null ? "—" : attuale);
            m.put("operatoreRiconosciuto", true);
            m.put("operatoreAttuale", attuale);
            righe.add(m);
        }

        List<Map<String, Object>> scelte = new ArrayList<>();
        Set<String> trovati = new HashSet<>();
        for (User u : utentiAmmessi()) {
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("id", u.getId());
            s.put("fullName", u.getFullName());
            scelte.add(s);
            trovati.add(staticNameKey(u.getFullName()));
        }
        List<String> mancanti = new ArrayList<>();
        for (String n : OPERATORI_AMMESSI) if (!trovati.contains(staticNameKey(n))) mancanti.add(n);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("righe", righe);
        out.put("operatoriAmmessi", scelte);
        out.put("operatoriAmmessiMancanti", mancanti);
        return out;
    }

    // Preventivi gia' caricati ma non presenti nel file: operatore scelto a mano.
    public int assegnaOperatorePerId(Map<Long, User> perId, User editor) {
        int n = 0;
        for (Map.Entry<Long, User> e : perId.entrySet()) {
            Optional<PreventivoTelefonico> pOpt = preventivoRepository.findById(e.getKey());
            if (pOpt.isEmpty()) continue;
            PreventivoTelefonico p = pOpt.get();
            if (p.getUser() != null && p.getUser().getId().equals(e.getValue().getId())) continue;
            p.setUser(e.getValue());
            p.setLastModifiedBy(editor);
            p.setLastModifiedAt(LocalDateTime.now());
            preventivoRepository.save(p);
            n++;
        }
        return n;
    }

    private void processRow(CSVRecord record, Map<String, User> usersByName, User importer, ImportResult result,
                            Map<String, User> perLead, Set<String> salta) {
        String sourceLeadId = get(record, "ID");
        if (isBlank(sourceLeadId)) {
            result.errori.add("Riga senza ID lead, saltata");
            return;
        }
        if (salta.contains(sourceLeadId)) {
            result.saltati++;
            return;
        }

        String clienteNome = get(record, "Nome");
        String clienteCognome = get(record, "Cognome");
        boolean nomeMancante = isBlank(clienteNome);
        boolean cognomeMancante = isBlank(clienteCognome);

        if (nomeMancante && cognomeMancante) {
            // SALVA VITA 4: entrambi mancanti -> probabile lead aziendale,
            // si usa la Ragione Sociale al posto del nominativo persona
            // fisica invece di scartare la riga.
            String ragioneSociale = get(record, "Ragione sociale");
            if (!isBlank(ragioneSociale)) {
                clienteNome = ragioneSociale;
                clienteCognome = "—";
            }
        } else if (nomeMancante) {
            // Manca solo il nome: si tiene comunque il cognome gia'
            // presente, invece di scartare la riga per un solo campo.
            clienteNome = "—";
        } else if (cognomeMancante) {
            clienteCognome = "—";
        }

        if (isBlank(clienteNome) || isBlank(clienteCognome)) {
            result.errori.add("Lead " + sourceLeadId + ": nome o cognome mancante");
            return;
        }

        String callerRaw = get(record, "Caller");
        String callerName = extractNameBeforeParenthesis(callerRaw);
        User caller = callerName != null ? usersByName.get(nameKey(callerName)) : null;

        // SALVA VITA 1: se il Caller manca (lead mai presa in carico), usa
        // "Inserito da" come riferimento operatore al suo posto — sappiamo
        // comunque chi l'ha caricata a sistema.
        String insertedByRaw = null;
        if (caller == null) {
            insertedByRaw = get(record, "Inserito da");
            if (insertedByRaw != null) caller = usersByName.get(nameKey(insertedByRaw));
        }
        // NUOVO: operatore scelto a mano nella finestra prima dell'import
        User operatoreScelto = perLead.get(sourceLeadId);
        if (operatoreScelto != null) caller = operatoreScelto;
        // Lead gia' caricata con operatore del file non riconosciuto: non e'
        // piu' un errore, si aggiorna il resto e si tiene l'operatore salvato.
        if (caller == null && preventivoRepository.findBySourceLeadId(sourceLeadId).isEmpty()) {
            result.errori.add("Lead " + sourceLeadId + ": operatore non riconosciuto (Caller: \"" + callerRaw + "\", Inserito da: \"" + insertedByRaw + "\")");
            return;
        }

        String tipoRichiesta = get(record, "Tipo richiesta");
        String tipo = mapTipo(tipoRichiesta);
        String venditoreRaw = get(record, "Venditore");
        if (tipo == null) {
            // SALVA VITA 2: tipo richiesta non specificato/non riconosciuto
            // ("Varie", vuoto, ecc.) -> dedotto dal consulente. Sementa,
            // Crispo e Imperato sono i tre consulenti dedicati al Noleggio,
            // tutti gli altri di default Vendita.
            String venditoreKey = nameKey(venditoreRaw);
            boolean isNoleggioConsulente = venditoreKey.equals(nameKey("Sementa Francesco"))
                    || venditoreKey.equals(nameKey("Crispo Raffaele"))
                    || venditoreKey.equals(nameKey("Imperato Ciro"));
            tipo = isNoleggioConsulente ? "NOLEGGIO" : "VENDITA";
        }

        String telefono = get(record, "Telefono 1");
        if (isBlank(telefono)) telefono = get(record, "Telefono 2");

        String marca = normalizeMarca(get(record, "Marca"));
        String modello = get(record, "Modello");
        if (isBlank(marca) || isBlank(modello)) {
            result.errori.add("Lead " + sourceLeadId + ": marca o modello mancante");
            return;
        }

        String consultantName = normalizeConsulente(venditoreRaw);
        if (isBlank(consultantName)) {
            result.errori.add("Lead " + sourceLeadId + ": venditore mancante");
            return;
        }

        String dataRicontatto = get(record, "Data ricontatto");
        LocalDateTime ricontattoAt = null;
        try {
            ricontattoAt = LocalDateTime.parse(dataRicontatto, DATA_RICONTATTO_FORMAT);
        } catch (Exception e) {
            // SALVA VITA 3: se manca/non e' valida la data di ricontatto
            // (lead mai richiamata), usa la data di inserimento al suo
            // posto — stesso formato, sempre valorizzata.
        }
        if (ricontattoAt == null) {
            String dataInserimento = get(record, "Data inserimento");
            try {
                ricontattoAt = LocalDateTime.parse(dataInserimento, DATA_RICONTATTO_FORMAT);
            } catch (Exception e2) {
                result.errori.add("Lead " + sourceLeadId + ": nessuna data valida (ricontatto: \"" + dataRicontatto + "\", inserimento: \"" + dataInserimento + "\")");
                return;
            }
        }

        String statusRaw = get(record, "Status");
        String status = mapStatus(statusRaw);
        if (status == null) {
            result.errori.add("Lead " + sourceLeadId + ": status non riconosciuto (\"" + statusRaw + "\")");
            return;
        }

        Optional<PreventivoTelefonico> existingOpt = preventivoRepository.findBySourceLeadId(sourceLeadId);

        if (existingOpt.isEmpty()) {
            PreventivoTelefonico p = new PreventivoTelefonico();
            p.setTipo(tipo);
            p.setClienteNome(clienteNome);
            p.setClienteCognome(clienteCognome);
            p.setMarca(marca);
            p.setModello(modello);
            p.setTelefono(telefono);
            p.setConsultantName(consultantName);
            p.setSourceLeadId(sourceLeadId);
            p.setUser(caller);
            p.setStatus(status);
            p.setCreatedAt(ricontattoAt);
            preventivoRepository.save(p);

            PreventivoTelefonicoStatusHistory h = new PreventivoTelefonicoStatusHistory();
            h.setPreventivo(p);
            h.setStatus(status);
            h.setChangedBy(importer);
            h.setChangedAt(ricontattoAt);
            historyRepository.save(h);

            rentSyncService.sync(p);

            result.created++;
            return;
        }

        // Lead gia' importata in precedenza: risincronizza i campi
        // anagrafici/veicolo se diversi da quelli attuali, e aggiorna lo
        // stato (con storico) se e' cambiato rispetto all'ultima volta.
        PreventivoTelefonico p = existingOpt.get();
        boolean changed = false;

        if (!Objects.equals(p.getClienteNome(), clienteNome)) { p.setClienteNome(clienteNome); changed = true; }
        if (!Objects.equals(p.getClienteCognome(), clienteCognome)) { p.setClienteCognome(clienteCognome); changed = true; }
        if (!Objects.equals(p.getMarca(), marca)) { p.setMarca(marca); changed = true; }
        if (!Objects.equals(p.getModello(), modello)) { p.setModello(modello); changed = true; }
        if (!Objects.equals(p.getTelefono(), telefono)) { p.setTelefono(telefono); changed = true; }

        // NUOVO: operatore. Vale la scelta fatta a mano; altrimenti, se il
        // file indica uno dei 4 ammessi diverso da quello salvato, vale il
        // file (cosi' un nuovo import corregge anche quelli gia' caricati).
        // Se il file indica un operatore NON ammesso, quello salvato resta.
        User attuale = p.getUser();
        if (caller != null && (operatoreScelto != null || operatoreAmmesso(caller.getFullName()))
                && (attuale == null || !caller.getId().equals(attuale.getId()))) {
            p.setUser(caller);
            changed = true;
            result.operatoriCorretti++;
        }

        if (!Objects.equals(p.getConsultantName(), consultantName)) {
            if (Boolean.TRUE.equals(p.getConsultantManuallyEdited())) {
                // Consulente modificato a mano in precedenza: non si
                // sovrascrive in automatico, si chiede conferma nel popup
                // dedicato dopo l'import.
                Map<String, Object> conflict = new LinkedHashMap<>();
                conflict.put("id", p.getId());
                conflict.put("sourceLeadId", sourceLeadId);
                conflict.put("clienteNome", p.getClienteNome());
                conflict.put("clienteCognome", p.getClienteCognome());
                conflict.put("marca", p.getMarca());
                conflict.put("modello", p.getModello());
                conflict.put("consulenteAttuale", p.getConsultantName());
                conflict.put("consulenteNuovo", consultantName);
                result.conflittiConsulente.add(conflict);
            } else {
                p.setConsultantName(consultantName);
                changed = true;
            }
        }

        boolean statusChanged = !Objects.equals(p.getStatus(), status);
        if (statusChanged) {
            p.setStatus(status);
            changed = true;

            PreventivoTelefonicoStatusHistory h = new PreventivoTelefonicoStatusHistory();
            h.setPreventivo(p);
            h.setStatus(status);
            h.setChangedBy(importer);
            h.setChangedAt(ricontattoAt);
            historyRepository.save(h);
            rentSyncService.sync(p);
        }

        if (changed) {
            p.setLastModifiedBy(importer);
            p.setLastModifiedAt(LocalDateTime.now());
            preventivoRepository.save(p);
            result.updated++;
        } else {
            result.unchanged++;
        }
    }

    private String get(CSVRecord record, String column) {
        try {
            if (!record.isMapped(column) || !record.isSet(column)) return null;
            String v = record.get(column);
            return v == null ? null : v.trim();
        } catch (Exception e) {
            return null;
        }
    }

    private boolean isBlank(String s) { return s == null || s.isBlank(); }

    private static String normalize(String s) {
        if (s == null) return "";
        return s.trim().toLowerCase()
            .replace('à', 'a').replace('á', 'a')
            .replace('è', 'e').replace('é', 'e')
            .replace('ì', 'i').replace('í', 'i')
            .replace('ò', 'o').replace('ó', 'o')
            .replace('ù', 'u').replace('ú', 'u');
    }

    // Chiave di confronto per i nomi persona: minuscolo, senza accenti,
    // parole riordinate alfabeticamente e spazi multipli collassati. Cosi'
    // "Emanuele Amendola" e "Amendola Emanuele" (o anche "Emanuele  Amendola"
    // con doppio spazio) producono la stessa chiave e vengono riconosciuti
    // come lo stesso nome, indipendentemente da come e' stato salvato.
    private String nameKey(String s) {
        return staticNameKey(s);
    }

    // Versione static di nameKey, richiamabile dall'inizializzazione
    // statica di CONSULENTI_BY_KEY (prima che esista un'istanza).
    private static String staticNameKey(String s) {
        if (s == null) return "";
        String norm = normalize(s).replaceAll("[^a-z\\s]", " ").trim();
        if (norm.isEmpty()) return "";
        String[] words = norm.split("\\s+");
        Arrays.sort(words);
        return String.join(" ", words);
    }

    private String extractNameBeforeParenthesis(String raw) {
        if (raw == null) return null;
        int idx = raw.indexOf('(');
        String name = idx > 0 ? raw.substring(0, idx) : raw;
        name = name.trim();
        return name.isEmpty() ? null : name;
    }

    private String mapTipo(String raw) {
        if (raw == null) return null;
        String r = raw.toLowerCase();
        if (r.contains("noleggio")) return "NOLEGGIO";
        if (r.contains("preventivo")) return "VENDITA";
        return null;
    }

    // Mappatura Status (colonna del file) -> nostro stato interno:
    //   "In corso"                          -> GENERATO
    //   "Fallito" (isolato, contattato ma non interessato) -> NON_INTERESSATO
    //   "Generata Trattativa (In Corso)"     -> TRATTATIVA_GENERATA
    //   "Generata Trattativa (Chiusa)"       -> CHIUSA
    //   "Generata Trattativa (Fallito)"      -> FALLITA
    // Tollerante a maiuscole/minuscole, spazio prima della parentesi
    // presente o assente, e genere ("fallito"/"fallita", "chiuso"/"chiusa").
    private String mapStatus(String raw) {
        if (raw == null) return null;
        String norm = raw.trim().toLowerCase().replaceAll("\\s*\\(", " (");

        if (norm.startsWith("generata trattativa")) {
            int start = norm.indexOf('(');
            int end = norm.indexOf(')');
            String esito = (start >= 0 && end > start) ? norm.substring(start + 1, end).trim() : "";
            if (esito.contains("chius")) return "CHIUSA";
            if (esito.contains("in corso")) return "TRATTATIVA_GENERATA";
            if (esito.contains("fallit")) return "FALLITA";
            return null;
        }
        if (norm.contains("fallit")) return "NON_INTERESSATO";
        if (norm.contains("in corso")) return "GENERATO";
        return null;
    }

    private String normalizeMarca(String raw) {
        if (raw == null) return null;
        String trimmed = raw.trim();
        for (String m : MARCHE_LIST) if (m.equalsIgnoreCase(trimmed)) return m;
        return trimmed.isEmpty() ? null : trimmed.toUpperCase();
    }

    // Riconosce il consulente indipendentemente dall'ordine in cui il file
    // scrive nome e cognome (stesso principio di nameKey/usersByName usato
    // per il Caller poco sopra): se la chiave-parole del testo del file
    // combacia con quella di un consulente noto, restituisce SEMPRE la
    // forma canonica "Nome Cognome" di CONSULENTI_LIST, qualunque sia
    // l'ordine con cui era scritto nel file (evita che "Castaldo Marco" e
    // "Marco Castaldo" finiscano come due consulenti diversi a schermo).
    // Solo se il testo non corrisponde a nessun consulente noto viene
    // tenuto cosi' com'e' nel file (mai scartata la riga per questo).
    private String normalizeConsulente(String raw) {
        if (raw == null) return null;
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) return null;
        String canonical = CONSULENTI_BY_KEY.get(nameKey(trimmed));
        return canonical != null ? canonical : trimmed;
    }
}
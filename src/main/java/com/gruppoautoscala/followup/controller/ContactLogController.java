package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.ContactLog;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.ContactLogService;
import com.gruppoautoscala.followup.service.ExcelExportService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/contacts")
public class ContactLogController {

    @Autowired
    private ContactLogService contactLogService;

    @Autowired
    private UserRepository userRepository;

    private final ExcelExportService excelExportService = new ExcelExportService();

    // Whitelist categorie valide — impedisce categorie "fantasma" scritte a mano
    private static final List<String> VALID_CATEGORIES = List.of(
        "Info Vendita", "Info Noleggio", "Service", "Info Acquisto effettuato",
        "Pratica Leasing", "Pratica Finanziamento", "Amministrazione",
        "Info + Appuntamento", "Info Vendita in Promo", "Altro"
    );

    // Stati validi per la gestione dell'Allert (Info Acquisto effettuato)
    private static final List<String> VALID_ALERT_STATUSES = List.of("IN_GESTIONE", "GESTITA");

    @GetMapping
    public ResponseEntity<?> getAll(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        List<ContactLog> logs;
        if (from != null && to != null) {
            LocalDateTime fromDt = LocalDateTime.parse(from + "T00:00:00");
            LocalDateTime toDt = LocalDateTime.parse(to + "T23:59:59");
            logs = contactLogService.getByDateRange(fromDt, toDt);
        } else {
            logs = contactLogService.getAll();
        }

        List<Map<String, Object>> result = logs.stream().map(this::toMap).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/export-excel")
    public ResponseEntity<?> exportExcel(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String operator,
            @RequestParam(required = false) String category,
            HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        List<ContactLog> logs;
        if (from != null && to != null) {
            LocalDateTime fromDt = LocalDateTime.parse(from + "T00:00:00");
            LocalDateTime toDt = LocalDateTime.parse(to + "T23:59:59");
            logs = contactLogService.getByDateRange(fromDt, toDt);
        } else {
            logs = contactLogService.getAll();
        }

        if (operator != null && !operator.isBlank()) {
            logs = logs.stream()
                .filter(l -> operator.equalsIgnoreCase(l.getUser().getFullName()))
                .collect(Collectors.toList());
        }

        if (category != null && !category.isBlank()) {
            logs = logs.stream()
                .filter(l -> category.equals(l.getCategory()))
                .collect(Collectors.toList());
        }

        try {
            byte[] excelBytes = excelExportService.export(logs);
            String filename = "registro_contatti_" + (from != null ? from : "tutti") + "_" + (to != null ? to : "") + ".xlsx";
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(excelBytes);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Errore generazione Excel: " + e.getMessage()));
        }
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));

        String category = (String) body.get("category");
        if (category == null || !VALID_CATEGORIES.contains(category)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Categoria non valida"));
        }

        String clienteNome = (String) body.get("clienteNome");
        String clienteCognome = (String) body.get("clienteCognome");
        String clienteNumero = (String) body.get("clienteNumero");
        Boolean nonComunicaNominativo = (Boolean) body.get("nonComunicaNominativo");
        String otherNote = (String) body.get("otherNote");
        String nominativoAppuntamento = (String) body.get("nominativoAppuntamento");
        String linkAppuntamento = (String) body.get("linkAppuntamento");
        String marca = (String) body.get("marca");
        String modello = (String) body.get("modello");
        String linkAuto = (String) body.get("linkAuto");
        String serviceTipo = (String) body.get("serviceTipo");
        String serviceNote = (String) body.get("serviceNote");
        String serviceSede = (String) body.get("serviceSede");
        String acquistoNote = (String) body.get("acquistoNote");
        Boolean acquistoAlert = (Boolean) body.get("acquistoAlert");
        String noleggioTipo = (String) body.get("noleggioTipo");
        String noleggioLink = (String) body.get("noleggioLink");
        String serviceNomeCliente = (String) body.get("serviceNomeCliente");
        String serviceCognomeCliente = (String) body.get("serviceCognomeCliente");
        String serviceTarga = (String) body.get("serviceTarga");
        String serviceTipoCliente = (String) body.get("serviceTipoCliente");
        String serviceNumeroTelefono = (String) body.get("serviceNumeroTelefono");
        String noleggioRichiesta = (String) body.get("noleggioRichiesta");
        String noleggioNomeCliente = (String) body.get("noleggioNomeCliente");
        String noleggioCognomeCliente = (String) body.get("noleggioCognomeCliente");
        String noleggioCellulare = (String) body.get("noleggioCellulare");
        LocalDateTime contactDate = body.get("contactDate") != null
            ? LocalDateTime.parse((String) body.get("contactDate"))
            : LocalDateTime.now();

        boolean skipNominativo = Boolean.TRUE.equals(nonComunicaNominativo);

        if (!skipNominativo) {
            if (clienteNome == null || clienteNome.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Nome cliente obbligatorio"));
            }
            if (clienteCognome == null || clienteCognome.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Cognome cliente obbligatorio"));
            }
        }
        if (clienteNumero == null || clienteNumero.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Numero cliente obbligatorio"));
        }

        if ("Info Noleggio".equals(category)) {
            if (noleggioRichiesta == null || noleggioRichiesta.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Seleziona Solo Info o Richiesta cliente"));
            }
        }

        if ("Service".equals(category)) {
            if (serviceSede == null || serviceSede.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Seleziona la sede Service"));
            }
            if ("Altro".equals(serviceTipo) && (serviceNote == null || serviceNote.isBlank())) {
                return ResponseEntity.badRequest().body(Map.of("error", "Inserisci la nota per Service Altro"));
            }
        }

        ContactLog log = contactLogService.create(userOpt.get(), category,
                clienteNome, clienteCognome, clienteNumero, nonComunicaNominativo,
                otherNote,
                nominativoAppuntamento, linkAppuntamento,
                marca, modello, linkAuto,
                serviceTipo, serviceNote, serviceSede,
                acquistoNote,
                noleggioTipo, noleggioLink,
                serviceNomeCliente, serviceCognomeCliente, serviceTarga,
                serviceTipoCliente, serviceNumeroTelefono,
                noleggioRichiesta, noleggioNomeCliente, noleggioCognomeCliente, noleggioCellulare,
                contactDate);

        // ===== ALLERT — Info Acquisto effettuato =====
        // Il metodo create() del service non conosce ancora questo campo (per non
        // dover modificare la sua firma / il file ContactLogService.java), quindi
        // lo impostiamo qui sull'oggetto appena salvato e lo persistiamo di nuovo
        // con update(), che già esiste e gestisce il salvataggio.
        if ("Info Acquisto effettuato".equals(category) && Boolean.TRUE.equals(acquistoAlert)) {
            log.setAcquistoAlert(true);
            log.setAcquistoAlertStatus(null);
            log = contactLogService.update(log);
        }

        return ResponseEntity.ok(toMap(log));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id,
                                    @RequestBody Map<String, Object> body,
                                    HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        String role = (String) session.getAttribute("userRole");

        Optional<ContactLog> logOpt = contactLogService.getById(id);
        if (logOpt.isEmpty()) return ResponseEntity.notFound().build();

        ContactLog log = logOpt.get();

        // ===== ALLERT — permessi dedicati =====
        // La gestione dell'Allert (stato + note) è riservata a MODERATORE, GESTORE, ADMIN,
        // separatamente dal normale controllo di modifica/proprietà del contatto qui sotto.
        boolean isTouchingAlertManagement = body.containsKey("acquistoAlertStatus")
                || body.containsKey("acquistoAlertNoteGestione")
                || body.containsKey("acquistoAlertNoteGestita");
        if (isTouchingAlertManagement) {
            boolean canManageAlert = "ADMIN".equals(role) || "GESTORE".equals(role) || "MODERATORE".equals(role);
            if (!canManageAlert) {
                return ResponseEntity.status(403).body(Map.of("error", "Solo Moderatore, Gestore o Admin possono gestire l'Allert"));
            }
        } else {
            if (!"ADMIN".equals(role) && !"GESTORE".equals(role) && !log.getUser().getId().equals(userId)) {
                return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
            }
        }

        if (body.containsKey("category")) {
            String newCategory = (String) body.get("category");
            if (newCategory == null || !VALID_CATEGORIES.contains(newCategory)) {
                return ResponseEntity.badRequest().body(Map.of("error", "Categoria non valida"));
            }
            log.setCategory(newCategory);
        }
        if (body.containsKey("clienteNome")) log.setClienteNome((String) body.get("clienteNome"));
        if (body.containsKey("clienteCognome")) log.setClienteCognome((String) body.get("clienteCognome"));
        if (body.containsKey("clienteNumero")) log.setClienteNumero((String) body.get("clienteNumero"));
        if (body.containsKey("nonComunicaNominativo")) log.setNonComunicaNominativo((Boolean) body.get("nonComunicaNominativo"));
        if (body.containsKey("otherNote")) log.setOtherNote((String) body.get("otherNote"));
        if (body.containsKey("nominativoAppuntamento")) log.setNominativoAppuntamento((String) body.get("nominativoAppuntamento"));
        if (body.containsKey("linkAppuntamento")) log.setLinkAppuntamento((String) body.get("linkAppuntamento"));
        if (body.containsKey("marca")) log.setMarca((String) body.get("marca"));
        if (body.containsKey("modello")) log.setModello((String) body.get("modello"));
        if (body.containsKey("linkAuto")) log.setLinkAuto((String) body.get("linkAuto"));
        if (body.containsKey("serviceTipo")) log.setServiceTipo((String) body.get("serviceTipo"));
        if (body.containsKey("serviceNote")) log.setServiceNote((String) body.get("serviceNote"));
        if (body.containsKey("serviceSede")) log.setServiceSede((String) body.get("serviceSede"));
        if (body.containsKey("acquistoNote")) log.setAcquistoNote((String) body.get("acquistoNote"));
        if (body.containsKey("acquistoAlert")) log.setAcquistoAlert((Boolean) body.get("acquistoAlert"));

        // ===== ALLERT — cambio stato: valorizza automaticamente "chi" e "quando" =====
        // Quando lo stato passa a IN_GESTIONE o GESTITA, registriamo l'utente corrente
        // e il timestamp SOLO se non era già presente, così riaprire/toccare lo stesso
        // stato più volte non sovrascrive la prima presa in carico. Quando lo stato
        // viene rimosso (status == null, "Rimuovi Gestione"), azzeriamo entrambe le
        // coppie chi/quando così la scheda torna pulita per una nuova gestione.
        if (body.containsKey("acquistoAlertStatus")) {
            Object statusVal = body.get("acquistoAlertStatus");
            String status = statusVal == null ? null : (String) statusVal;
            if (status != null && !VALID_ALERT_STATUSES.contains(status)) {
                return ResponseEntity.badRequest().body(Map.of("error", "Stato allert non valido"));
            }
            log.setAcquistoAlertStatus(status);

            if ("IN_GESTIONE".equals(status)) {
                if (log.getAcquistoAlertInGestioneDa() == null) {
                    Optional<User> currentUserOpt = userRepository.findById(userId);
                    currentUserOpt.ifPresent(log::setAcquistoAlertInGestioneDa);
                    log.setAcquistoAlertInGestioneAt(LocalDateTime.now());
                }
            } else if ("GESTITA".equals(status)) {
                if (log.getAcquistoAlertGestitaDa() == null) {
                    Optional<User> currentUserOpt = userRepository.findById(userId);
                    currentUserOpt.ifPresent(log::setAcquistoAlertGestitaDa);
                    log.setAcquistoAlertGestitaAt(LocalDateTime.now());
                }
            } else if (status == null) {
                log.setAcquistoAlertInGestioneDa(null);
                log.setAcquistoAlertInGestioneAt(null);
                log.setAcquistoAlertGestitaDa(null);
                log.setAcquistoAlertGestitaAt(null);
            }
        }

        // FIX: ogni modifica alla nota (inserita, riscritta o cancellata del
        // tutto) aggiorna chi/quando — a differenza del cambio stato, qui NON
        // controlliamo se era già valorizzato: ogni salvataggio conta come
        // una modifica, comprese le cancellazioni (valore vuoto/null).
        if (body.containsKey("acquistoAlertNoteGestione")) {
            log.setAcquistoAlertNoteGestione((String) body.get("acquistoAlertNoteGestione"));
            userRepository.findById(userId).ifPresent(log::setAcquistoAlertNoteGestioneModificataDa);
            log.setAcquistoAlertNoteGestioneModificataAt(LocalDateTime.now());
        }
        if (body.containsKey("acquistoAlertNoteGestita")) {
            log.setAcquistoAlertNoteGestita((String) body.get("acquistoAlertNoteGestita"));
            userRepository.findById(userId).ifPresent(log::setAcquistoAlertNoteGestitaModificataDa);
            log.setAcquistoAlertNoteGestitaModificataAt(LocalDateTime.now());
        }
        if (body.containsKey("noleggioTipo")) log.setNoleggioTipo((String) body.get("noleggioTipo"));
        if (body.containsKey("noleggioLink")) log.setNoleggioLink((String) body.get("noleggioLink"));
        if (body.containsKey("serviceNomeCliente")) log.setServiceNomeCliente((String) body.get("serviceNomeCliente"));
        if (body.containsKey("serviceCognomeCliente")) log.setServiceCognomeCliente((String) body.get("serviceCognomeCliente"));
        if (body.containsKey("serviceTarga")) log.setServiceTarga((String) body.get("serviceTarga"));
        if (body.containsKey("serviceTipoCliente")) log.setServiceTipoCliente((String) body.get("serviceTipoCliente"));
        if (body.containsKey("serviceNumeroTelefono")) log.setServiceNumeroTelefono((String) body.get("serviceNumeroTelefono"));
        if (body.containsKey("noleggioRichiesta")) log.setNoleggioRichiesta((String) body.get("noleggioRichiesta"));
        if (body.containsKey("noleggioNomeCliente")) log.setNoleggioNomeCliente((String) body.get("noleggioNomeCliente"));
        if (body.containsKey("noleggioCognomeCliente")) log.setNoleggioCognomeCliente((String) body.get("noleggioCognomeCliente"));
        if (body.containsKey("noleggioCellulare")) log.setNoleggioCellulare((String) body.get("noleggioCellulare"));
        if (body.containsKey("contactDate")) {
            log.setContactDate(LocalDateTime.parse((String) body.get("contactDate")));
        }

        return ResponseEntity.ok(toMap(contactLogService.update(log)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        String role = (String) session.getAttribute("userRole");

        Optional<ContactLog> logOpt = contactLogService.getById(id);
        if (logOpt.isEmpty()) return ResponseEntity.notFound().build();

        ContactLog log = logOpt.get();
        if (!"ADMIN".equals(role) && !"GESTORE".equals(role) && !log.getUser().getId().equals(userId)) {
            return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        }

        contactLogService.delete(id);
        return ResponseEntity.ok(Map.of("message", "Eliminato"));
    }

    @GetMapping("/stats")
    public ResponseEntity<?> getStats(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        LocalDateTime fromDt = from != null ? LocalDateTime.parse(from + "T00:00:00") : null;
        LocalDateTime toDt = to != null ? LocalDateTime.parse(to + "T23:59:59") : null;

        return ResponseEntity.ok(contactLogService.getStats(fromDt, toDt));
    }

    private Map<String, Object> toMap(ContactLog log) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", log.getId());
        m.put("category", log.getCategory());
        m.put("clienteNome", log.getClienteNome());
        m.put("clienteCognome", log.getClienteCognome());
        m.put("clienteNumero", log.getClienteNumero());
        m.put("nonComunicaNominativo", log.getNonComunicaNominativo());
        m.put("otherNote", log.getOtherNote());
        m.put("nominativoAppuntamento", log.getNominativoAppuntamento());
        m.put("linkAppuntamento", log.getLinkAppuntamento());
        m.put("marca", log.getMarca());
        m.put("modello", log.getModello());
        m.put("linkAuto", log.getLinkAuto());
        m.put("serviceTipo", log.getServiceTipo());
        m.put("serviceNote", log.getServiceNote());
        m.put("serviceSede", log.getServiceSede());
        m.put("acquistoNote", log.getAcquistoNote());
        m.put("acquistoAlert", log.getAcquistoAlert());
        m.put("acquistoAlertStatus", log.getAcquistoAlertStatus());
        m.put("acquistoAlertNoteGestione", log.getAcquistoAlertNoteGestione());
        m.put("acquistoAlertNoteGestita", log.getAcquistoAlertNoteGestita());

        // ===== chi + quando per "In gestione" e "Gestita" =====
        // Serializzati come oggetto {id, fullName, role}, coerente con il campo
        // "user" già presente in questa toMap() e con "gestitoDa" in Rent — cosi'
        // extractUserName() nel frontend li legge senza bisogno di adattamenti.
        m.put("acquistoAlertInGestioneDa", userToMap(log.getAcquistoAlertInGestioneDa()));
        m.put("acquistoAlertInGestioneAt", log.getAcquistoAlertInGestioneAt() != null
                ? log.getAcquistoAlertInGestioneAt().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss"))
                : null);
        m.put("acquistoAlertGestitaDa", userToMap(log.getAcquistoAlertGestitaDa()));
        m.put("acquistoAlertGestitaAt", log.getAcquistoAlertGestitaAt() != null
                ? log.getAcquistoAlertGestitaAt().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss"))
                : null);

        // ===== NUOVO: chi + quando per l'ultima modifica alle note =====
        m.put("acquistoAlertNoteGestioneModificataDa", userToMap(log.getAcquistoAlertNoteGestioneModificataDa()));
        m.put("acquistoAlertNoteGestioneModificataAt", log.getAcquistoAlertNoteGestioneModificataAt() != null
                ? log.getAcquistoAlertNoteGestioneModificataAt().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss"))
                : null);
        m.put("acquistoAlertNoteGestitaModificataDa", userToMap(log.getAcquistoAlertNoteGestitaModificataDa()));
        m.put("acquistoAlertNoteGestitaModificataAt", log.getAcquistoAlertNoteGestitaModificataAt() != null
                ? log.getAcquistoAlertNoteGestitaModificataAt().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss"))
                : null);

        m.put("noleggioTipo", log.getNoleggioTipo());
        m.put("noleggioLink", log.getNoleggioLink());
        m.put("serviceNomeCliente", log.getServiceNomeCliente());
        m.put("serviceCognomeCliente", log.getServiceCognomeCliente());
        m.put("serviceTarga", log.getServiceTarga());
        m.put("serviceTipoCliente", log.getServiceTipoCliente());
        m.put("serviceNumeroTelefono", log.getServiceNumeroTelefono());
        m.put("noleggioRichiesta", log.getNoleggioRichiesta());
        m.put("noleggioNomeCliente", log.getNoleggioNomeCliente());
        m.put("noleggioCognomeCliente", log.getNoleggioCognomeCliente());
        m.put("noleggioCellulare", log.getNoleggioCellulare());
        m.put("contactDate", log.getContactDate().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")));
        m.put("createdAt", log.getCreatedAt().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")));
        Map<String, Object> userMap = new HashMap<>();
        userMap.put("id", log.getUser().getId());
        userMap.put("fullName", log.getUser().getFullName());
        userMap.put("role", log.getUser().getRole());
        m.put("user", userMap);
        return m;
    }

    // Helper: converte un User (o null) nella stessa struttura {id, fullName, role}
    // usata per "user" — evita duplicazione di codice tra i punti che serializzano utenti.
    private Map<String, Object> userToMap(User user) {
        if (user == null) return null;
        Map<String, Object> m = new HashMap<>();
        m.put("id", user.getId());
        m.put("fullName", user.getFullName());
        m.put("role", user.getRole());
        return m;
    }
}
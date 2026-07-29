package com.gruppoautoscala.followup.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.gruppoautoscala.followup.model.ContactLog;
import com.gruppoautoscala.followup.model.ServicePratica;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.ServicePraticaRepository;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.ContactLogService;
import jakarta.servlet.http.HttpSession;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.io.ByteArrayOutputStream;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Gestione pratiche Service (tagliandi, ordini ricambi/accessori, appuntamenti
 * officina). Ricalca lo stesso pattern del controller Rent: una tabella
 * dedicata editabile (ServicePratica) + un endpoint di sola lettura che pesca
 * i contatti categoria "Service" dal Registro Contatti generale.
 *
 * FASE 4: automazione dei due popup —
 * 1) "È arrivato il ricambio?" a 7 giorni LAVORATIVI dall'ordine (o riproposto
 *    al giorno lavorativo successivo se l'operatore clicca "Rimanda").
 * 2) Ciclo appuntamento — promemoria il giorno prima, poi (a orario passato)
 *    "Si è presentato?" con Venuto/Disdetto/Non presentato; da Disdetto/Non
 *    presentato si può richiamare per un nuovo appuntamento (si accumula in
 *    storicoAppuntamenti) oppure segnare la pratica come Fallita.
 */
@RestController
@RequestMapping("/api/service")
public class ServicePraticaController {

    @Autowired
    private ServicePraticaRepository servicePraticaRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ContactLogService contactLogService;

    // Stesso meccanismo già collaudato su Contatti e Rent — canale dedicato
    // /topic/service, indipendente dagli altri.
    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    private void broadcastServiceEvent(String type, Object data) {
        Map<String, Object> event = new HashMap<>();
        event.put("type", type);
        event.put("data", data);
        messagingTemplate.convertAndSend("/topic/service", event);
    }

    private final ObjectMapper mapper = new ObjectMapper();

    private static final List<String> VALID_STATI = List.of(
        "SOLO_INFO", "IN_CONTATTO", "ORDINE_RICAMBIO", "APPUNTAMENTO", "PROBLEMATICA", "FALLITA", "CONCLUSA"
    );
    private static final int GIORNI_LAVORATIVI_RICAMBIO = 7;

    // Chi può APRIRE la sezione Service (vedere le pratiche)
    private static final List<String> ACCESS_ROLES = List.of("SERVICE", "MODERATORE", "GESTORE", "ADMIN");
    // Chi può "gestire" un cliente (presa in carico) — stessa whitelist di Rent
    private static final List<String> GESTIONE_ROLES = List.of("SERVICE", "MODERATORE", "GESTORE", "ADMIN");

    private boolean hasAccess(String role) { return role != null && ACCESS_ROLES.contains(role); }
    private boolean canManageGestione(String role) { return role != null && GESTIONE_ROLES.contains(role); }

    // ============================================================
    // PRATICHE — CRUD
    // ============================================================

    @GetMapping("/pratiche")
    public ResponseEntity<?> getAll(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!hasAccess(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        List<ServicePratica> pratiche = servicePraticaRepository.findAllByOrderByCreatedAtDesc();
        return ResponseEntity.ok(pratiche.stream().map(this::toMap).collect(Collectors.toList()));
    }

    @PostMapping("/pratiche")
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!hasAccess(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));

        String nome = (String) body.get("nome");
        String cognome = (String) body.get("cognome");
        String cellulare = (String) body.get("cellulare");
        String marca = (String) body.get("marca");

        if (nome == null || nome.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "Il nome è obbligatorio"));
        if (cognome == null || cognome.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "Il cognome è obbligatorio"));
        if (cellulare == null || cellulare.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "Il cellulare è obbligatorio"));
        if (marca == null || marca.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "Seleziona la marca dal menù a tendina"));

        ServicePratica p = new ServicePratica();
        p.setUser(userOpt.get());
        p.setNome(nome);
        p.setCognome(cognome);
        p.setCellulare(cellulare);
        p.setEmail((String) body.get("email"));
        p.setMarca(marca);
        p.setModello((String) body.get("modello"));
        p.setTarga((String) body.get("targa"));
        p.setSede((String) body.get("sede"));
        p.setTipologiaService((String) body.get("tipologiaService"));
        p.setNote((String) body.get("note"));

        String stato = body.get("stato") != null ? (String) body.get("stato") : "SOLO_INFO";
        if (!VALID_STATI.contains(stato)) return ResponseEntity.badRequest().body(Map.of("error", "Stato non valido"));
        p.setStato(stato);

        applyStatoSideEffects(p, stato, body);

        Map<String, Object> createdMap = toMap(servicePraticaRepository.save(p));
        broadcastServiceEvent("created", createdMap);
        return ResponseEntity.ok(createdMap);
    }

    @PatchMapping("/pratiche/{id}")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!hasAccess(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        Optional<ServicePratica> opt = servicePraticaRepository.findById(id);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();
        ServicePratica p = opt.get();

        if (body.containsKey("nome")) p.setNome((String) body.get("nome"));
        if (body.containsKey("cognome")) p.setCognome((String) body.get("cognome"));
        if (body.containsKey("cellulare")) p.setCellulare((String) body.get("cellulare"));
        if (body.containsKey("email")) p.setEmail((String) body.get("email"));
        if (body.containsKey("marca")) p.setMarca((String) body.get("marca"));
        if (body.containsKey("modello")) p.setModello((String) body.get("modello"));
        if (body.containsKey("targa")) p.setTarga((String) body.get("targa"));
        if (body.containsKey("sede")) p.setSede((String) body.get("sede"));
        if (body.containsKey("tipologiaService")) p.setTipologiaService((String) body.get("tipologiaService"));
        if (body.containsKey("note")) p.setNote((String) body.get("note"));

        if (body.containsKey("stato")) {
            String stato = (String) body.get("stato");
            if (stato == null || !VALID_STATI.contains(stato)) {
                return ResponseEntity.badRequest().body(Map.of("error", "Stato non valido"));
            }
            p.setStato(stato);
            applyStatoSideEffects(p, stato, body);
        }

        if (body.containsKey("noteFallimento")) p.setNoteFallimento((String) body.get("noteFallimento"));
        if (body.containsKey("noteConclusa")) p.setNoteConclusa((String) body.get("noteConclusa"));
        if (body.containsKey("noteProblematica")) p.setNoteProblematica((String) body.get("noteProblematica"));

        Map<String, Object> updatedMap = toMap(servicePraticaRepository.save(p));
        broadcastServiceEvent("updated", updatedMap);
        return ResponseEntity.ok(updatedMap);
    }

    @DeleteMapping("/pratiche/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!hasAccess(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        if (servicePraticaRepository.findById(id).isEmpty()) return ResponseEntity.notFound().build();
        servicePraticaRepository.deleteById(id);
        Map<String, Object> deletedPayload = new HashMap<>();
        deletedPayload.put("id", id);
        broadcastServiceEvent("deleted", deletedPayload);
        return ResponseEntity.ok(Map.of("message", "Eliminata"));
    }

    private void applyStatoSideEffects(ServicePratica p, String stato, Map<String, Object> body) {
        if ("ORDINE_RICAMBIO".equals(stato)) {
            if (body.get("dataOrdineRicambio") != null) {
                p.setDataOrdineRicambio(LocalDate.parse((String) body.get("dataOrdineRicambio")));
            } else if (p.getDataOrdineRicambio() == null) {
                p.setDataOrdineRicambio(LocalDate.now());
            }
            p.setRicambioArrivato(null);
            p.setRicambioAlertRimandatoAl(null);
        }
        if ("APPUNTAMENTO".equals(stato) && body.get("dataAppuntamento") != null) {
            p.setDataAppuntamento(LocalDateTime.parse((String) body.get("dataAppuntamento")));
            p.setEsitoAppuntamento(null);
        }
    }

    // ============================================================
    // GESTIONE — presa in carico (stesso pattern di Rent)
    // ============================================================

    @PatchMapping("/pratiche/{id}/gestisci")
    public ResponseEntity<?> gestisci(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canManageGestione(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato a gestire"));

        Optional<ServicePratica> opt = servicePraticaRepository.findById(id);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();
        ServicePratica p = opt.get();

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));
        p.setGestitoDa(userOpt.get());
        p.setGestitoAt(LocalDateTime.now());

        Map<String, Object> gestitaMap = toMap(servicePraticaRepository.save(p));
        broadcastServiceEvent("updated", gestitaMap);
        return ResponseEntity.ok(gestitaMap);
    }

    @PatchMapping("/pratiche/{id}/annulla-gestione")
    public ResponseEntity<?> annullaGestione(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canManageGestione(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        Optional<ServicePratica> opt = servicePraticaRepository.findById(id);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();
        ServicePratica p = opt.get();
        p.setGestitoDa(null);
        p.setGestitoAt(null);

        Map<String, Object> annullataMap = toMap(servicePraticaRepository.save(p));
        broadcastServiceEvent("updated", annullataMap);
        return ResponseEntity.ok(annullataMap);
    }

    // ============================================================
    // FASE 4 — POPUP AUTOMATICI
    // ============================================================

    // Aggiunge N giorni LAVORATIVI (esclude sabato e domenica) a una data.
    private static LocalDate addBusinessDays(LocalDate start, int days) {
        LocalDate date = start;
        int added = 0;
        while (added < days) {
            date = date.plusDays(1);
            if (date.getDayOfWeek() != DayOfWeek.SATURDAY && date.getDayOfWeek() != DayOfWeek.SUNDAY) {
                added++;
            }
        }
        return date;
    }

    // Popup 1: ricambi ordinati per cui è ora di chiedere "è arrivato?"
    // (7 giorni lavorativi dall'ordine, oppure il giorno di rimando se
    // l'operatore aveva cliccato "Rimanda" in precedenza).
    @GetMapping("/pratiche/ricambio-da-gestire")
    public ResponseEntity<?> getRicambioDaGestire(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!hasAccess(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        LocalDate today = LocalDate.now();
        List<ServicePratica> items = servicePraticaRepository.findAllByOrderByCreatedAtDesc().stream()
            .filter(p -> "ORDINE_RICAMBIO".equals(p.getStato()))
            .filter(p -> p.getRicambioArrivato() == null)
            .filter(p -> p.getDataOrdineRicambio() != null)
            .filter(p -> {
                if (p.getRicambioAlertRimandatoAl() != null) {
                    return !p.getRicambioAlertRimandatoAl().isAfter(today);
                }
                LocalDate soglia = addBusinessDays(p.getDataOrdineRicambio(), GIORNI_LAVORATIVI_RICAMBIO);
                return !soglia.isAfter(today);
            })
            .collect(Collectors.toList());

        return ResponseEntity.ok(items.stream().map(this::toMap).collect(Collectors.toList()));
    }

    // Risposta al popup 1: arrivato=true (chiude l'alert, l'operatore fisserà
    // l'appuntamento a parte cambiando stato) oppure arrivato=false ("Rimanda",
    // si ripropone il giorno lavorativo successivo).
    @PatchMapping("/pratiche/{id}/ricambio-risposta")
    public ResponseEntity<?> rispondiRicambio(@PathVariable Long id, @RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!hasAccess(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        Optional<ServicePratica> opt = servicePraticaRepository.findById(id);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();
        ServicePratica p = opt.get();

        Boolean arrivato = (Boolean) body.get("arrivato");
        if (Boolean.TRUE.equals(arrivato)) {
            p.setRicambioArrivato(true);
            p.setRicambioAlertRimandatoAl(null);
        } else {
            // "Rimanda": si ripropone il prossimo giorno lavorativo
            p.setRicambioAlertRimandatoAl(addBusinessDays(LocalDate.now(), 1));
        }

        Map<String, Object> ricambioMap = toMap(servicePraticaRepository.save(p));
        broadcastServiceEvent("updated", ricambioMap);
        return ResponseEntity.ok(ricambioMap);
    }

    // Popup 2a: appuntamenti di domani (promemoria informativo)
    @GetMapping("/pratiche/appuntamenti-domani")
    public ResponseEntity<?> getAppuntamentiDomani(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!hasAccess(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        LocalDate domani = LocalDate.now().plusDays(1);
        List<ServicePratica> items = servicePraticaRepository.findAllByOrderByCreatedAtDesc().stream()
            .filter(p -> "APPUNTAMENTO".equals(p.getStato()))
            .filter(p -> p.getDataAppuntamento() != null)
            .filter(p -> p.getDataAppuntamento().toLocalDate().isEqual(domani))
            .filter(p -> p.getEsitoAppuntamento() == null)
            .collect(Collectors.toList());

        return ResponseEntity.ok(items.stream().map(this::toMap).collect(Collectors.toList()));
    }

    // Popup 2b: appuntamenti con orario ormai passato, in attesa di un esito
    @GetMapping("/pratiche/appuntamenti-da-gestire")
    public ResponseEntity<?> getAppuntamentiDaGestire(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!hasAccess(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        LocalDateTime now = LocalDateTime.now();
        List<ServicePratica> items = servicePraticaRepository.findAllByOrderByCreatedAtDesc().stream()
            .filter(p -> "APPUNTAMENTO".equals(p.getStato()))
            .filter(p -> p.getDataAppuntamento() != null)
            .filter(p -> p.getDataAppuntamento().isBefore(now))
            .filter(p -> p.getEsitoAppuntamento() == null)
            .collect(Collectors.toList());

        return ResponseEntity.ok(items.stream().map(this::toMap).collect(Collectors.toList()));
    }

    // Risposta al popup 2b: esito = VENUTO | DISDETTO | NON_PRESENTATO.
    // VENUTO conclude la pratica (RITIRATO se veniva da un ordine ricambio,
    // altrimenti semplice conclusione); DISDETTO/NON_PRESENTATO lasciano la
    // pratica in attesa della scelta successiva (nuovo appuntamento o fallita).
    @PatchMapping("/pratiche/{id}/appuntamento-esito")
    public ResponseEntity<?> appuntamentoEsito(@PathVariable Long id, @RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!hasAccess(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        Optional<ServicePratica> opt = servicePraticaRepository.findById(id);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();
        ServicePratica p = opt.get();

        String esito = (String) body.get("esito");
        if (esito == null || !List.of("VENUTO", "DISDETTO", "NON_PRESENTATO").contains(esito)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Esito non valido"));
        }
        p.setEsitoAppuntamento(esito);

        if ("VENUTO".equals(esito)) {
            p.setStato("CONCLUSA");
            String note = (String) body.get("noteConclusa");
            if (note != null) p.setNoteConclusa(note);
            if (Boolean.TRUE.equals(p.getRicambioArrivato())
                    && (p.getNoteConclusa() == null || p.getNoteConclusa().isBlank())) {
                p.setNoteConclusa("Ricambio ritirato dal cliente.");
            }
        }
        // Per DISDETTO/NON_PRESENTATO la pratica resta in stato APPUNTAMENTO,
        // in attesa che l'operatore scelga (dal frontend) tra "nuovo appuntamento"
        // e "segna come fallita" tramite gli endpoint dedicati qui sotto.

        Map<String, Object> esitoMap = toMap(servicePraticaRepository.save(p));
        broadcastServiceEvent("updated", esitoMap);
        return ResponseEntity.ok(esitoMap);
    }

    // Richiama per un nuovo appuntamento: la data/ora precedente va nello
    // storico (storicoAppuntamenti, JSON array) e si imposta la nuova.
    @PatchMapping("/pratiche/{id}/nuovo-appuntamento")
    public ResponseEntity<?> nuovoAppuntamento(@PathVariable Long id, @RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!hasAccess(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        String nuovaData = (String) body.get("data");
        String nuovaOra = (String) body.get("ora");
        if (nuovaData == null || nuovaData.isBlank() || nuovaOra == null || nuovaOra.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Data e orario del nuovo appuntamento sono obbligatori"));
        }

        Optional<ServicePratica> opt = servicePraticaRepository.findById(id);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();
        ServicePratica p = opt.get();

        try {
            ArrayNode storico = (p.getStoricoAppuntamenti() != null && !p.getStoricoAppuntamenti().isBlank())
                ? (ArrayNode) mapper.readTree(p.getStoricoAppuntamenti())
                : mapper.createArrayNode();
            if (p.getDataAppuntamento() != null) {
                ObjectNode entry = mapper.createObjectNode();
                entry.put("data", p.getDataAppuntamento().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")));
                entry.put("esito", p.getEsitoAppuntamento());
                storico.add(entry);
            }
            p.setStoricoAppuntamenti(mapper.writeValueAsString(storico));
        } catch (Exception e) {
            System.err.println("Errore aggiornamento storico appuntamenti: " + e.getMessage());
        }

        p.setDataAppuntamento(LocalDateTime.parse(nuovaData + "T" + nuovaOra + ":00"));
        p.setEsitoAppuntamento(null);
        p.setStato("APPUNTAMENTO");

        Map<String, Object> nuovoAppMap = toMap(servicePraticaRepository.save(p));
        broadcastServiceEvent("updated", nuovoAppMap);
        return ResponseEntity.ok(nuovoAppMap);
    }

    // Segna la pratica come Fallita direttamente dal flusso post-appuntamento
    @PatchMapping("/pratiche/{id}/fallisci-da-appuntamento")
    public ResponseEntity<?> fallisciDaAppuntamento(@PathVariable Long id, @RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!hasAccess(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        Optional<ServicePratica> opt = servicePraticaRepository.findById(id);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();
        ServicePratica p = opt.get();

        p.setStato("FALLITA");
        p.setNoteFallimento((String) body.get("noteFallimento"));

        Map<String, Object> fallitaMap = toMap(servicePraticaRepository.save(p));
        broadcastServiceEvent("updated", fallitaMap);
        return ResponseEntity.ok(fallitaMap);
    }

    @GetMapping("/pratiche/export-excel")
    public ResponseEntity<?> exportExcel(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String stato,
            @RequestParam(required = false) String marca,
            @RequestParam(required = false) String operatore,
            @RequestParam(required = false) String sede,
            HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!hasAccess(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        List<ServicePratica> pratiche = servicePraticaRepository.findAllByOrderByCreatedAtDesc();

        if (from != null && !from.isBlank()) {
            pratiche = pratiche.stream().filter(p -> {
                String d = p.getCreatedAt().toLocalDate().toString();
                return d.compareTo(from) >= 0;
            }).collect(Collectors.toList());
        }
        if (to != null && !to.isBlank()) {
            pratiche = pratiche.stream().filter(p -> {
                String d = p.getCreatedAt().toLocalDate().toString();
                return d.compareTo(to) <= 0;
            }).collect(Collectors.toList());
        }
        if (stato != null && !stato.isBlank()) {
            List<String> statiSel = List.of(stato.split(","));
            pratiche = pratiche.stream().filter(p -> statiSel.contains(p.getStato())).collect(Collectors.toList());
        }
        if (marca != null && !marca.isBlank()) {
            List<String> marcheSel = List.of(marca.split(","));
            pratiche = pratiche.stream().filter(p -> marcheSel.contains(p.getMarca())).collect(Collectors.toList());
        }
        if (operatore != null && !operatore.isBlank()) {
            pratiche = pratiche.stream().filter(p -> operatore.equalsIgnoreCase(p.getUser().getFullName())).collect(Collectors.toList());
        }
        if (sede != null && !sede.isBlank()) {
            pratiche = pratiche.stream().filter(p -> sede.equals(p.getSede())).collect(Collectors.toList());
        }

        try {
            byte[] excelBytes = buildServicePraticheExcel(pratiche);
            String filename = "service_pratiche_" + (from != null ? from : "tutti") + "_" + (to != null ? to : "") + ".xlsx";
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(excelBytes);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Errore generazione Excel: " + e.getMessage()));
        }
    }

    // Export autonomo con Apache POI (stessa libreria già usata dal resto del
    // progetto per Registro Contatti/Rent) — non dipende da ExcelExportService
    // per non doverne modificare la firma condivisa con altri controller.
    private byte[] buildServicePraticheExcel(List<ServicePratica> pratiche) throws Exception {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("Pratiche Service");

            CellStyle headerStyle = workbook.createCellStyle();
            Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerFont.setColor(IndexedColors.WHITE.getIndex());
            headerStyle.setFont(headerFont);
            headerStyle.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            String[] headers = {
                "Data Creazione", "Nome", "Cognome", "Cellulare", "Email", "Marca", "Modello",
                "Targa", "Sede", "Tipologia", "Stato", "Note", "Data Ordine Ricambio",
                "Ricambio Arrivato", "Data Appuntamento", "Esito Appuntamento",
                "Note Fallimento", "Note Conclusa", "Note Problematica", "Gestito Da", "Operatore"
            };
            Row headerRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(headerStyle);
            }

            DateTimeFormatter dtf = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
            int rowNum = 1;
            for (ServicePratica p : pratiche) {
                Row row = sheet.createRow(rowNum++);
                int c = 0;
                row.createCell(c++).setCellValue(p.getCreatedAt() != null ? p.getCreatedAt().format(dtf) : "");
                row.createCell(c++).setCellValue(p.getNome() != null ? p.getNome() : "");
                row.createCell(c++).setCellValue(p.getCognome() != null ? p.getCognome() : "");
                row.createCell(c++).setCellValue(p.getCellulare() != null ? p.getCellulare() : "");
                row.createCell(c++).setCellValue(p.getEmail() != null ? p.getEmail() : "");
                row.createCell(c++).setCellValue(p.getMarca() != null ? p.getMarca() : "");
                row.createCell(c++).setCellValue(p.getModello() != null ? p.getModello() : "");
                row.createCell(c++).setCellValue(p.getTarga() != null ? p.getTarga() : "");
                row.createCell(c++).setCellValue(p.getSede() != null ? p.getSede() : "");
                row.createCell(c++).setCellValue(p.getTipologiaService() != null ? p.getTipologiaService() : "");
                row.createCell(c++).setCellValue(p.getStato() != null ? p.getStato() : "");
                row.createCell(c++).setCellValue(p.getNote() != null ? p.getNote() : "");
                row.createCell(c++).setCellValue(p.getDataOrdineRicambio() != null ? p.getDataOrdineRicambio().toString() : "");
                row.createCell(c++).setCellValue(p.getRicambioArrivato() == null ? "" : (p.getRicambioArrivato() ? "Sì" : "No"));
                row.createCell(c++).setCellValue(p.getDataAppuntamento() != null ? p.getDataAppuntamento().format(dtf) : "");
                row.createCell(c++).setCellValue(p.getEsitoAppuntamento() != null ? p.getEsitoAppuntamento() : "");
                row.createCell(c++).setCellValue(p.getNoteFallimento() != null ? p.getNoteFallimento() : "");
                row.createCell(c++).setCellValue(p.getNoteConclusa() != null ? p.getNoteConclusa() : "");
                row.createCell(c++).setCellValue(p.getNoteProblematica() != null ? p.getNoteProblematica() : "");
                row.createCell(c++).setCellValue(p.getGestitoDa() != null ? p.getGestitoDa().getFullName() : "");
                row.createCell(c++).setCellValue(p.getUser() != null ? p.getUser().getFullName() : "");
            }

            for (int i = 0; i < headers.length; i++) {
                sheet.autoSizeColumn(i);
            }

            try (ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
                workbook.write(bos);
                return bos.toByteArray();
            }
        }
    }

    // ============================================================
    // CONTATTI — sola lettura, pesca dal Registro Contatti generale
    // (categoria "Service"), stesso pattern di /api/noleggio/contatti
    // ============================================================

    @GetMapping("/contatti")
    public ResponseEntity<?> getContattiService(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!hasAccess(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        List<ContactLog> logs;
        if (from != null && to != null) {
            LocalDateTime fromDt = LocalDateTime.parse(from + "T00:00:00");
            LocalDateTime toDt = LocalDateTime.parse(to + "T23:59:59");
            logs = contactLogService.getByDateRange(fromDt, toDt);
        } else {
            logs = contactLogService.getAll();
        }

        List<Map<String, Object>> result = logs.stream()
            .filter(l -> "Service".equals(l.getCategory()))
            .map(this::contactLogToMap)
            .collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    private Map<String, Object> contactLogToMap(ContactLog log) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", log.getId());
        m.put("contactDate", log.getContactDate().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")));
        m.put("serviceSede", log.getServiceSede());
        m.put("serviceTipo", log.getServiceTipo());
        m.put("serviceNote", log.getServiceNote());
        m.put("serviceTarga", log.getServiceTarga());
        m.put("serviceTipoCliente", log.getServiceTipoCliente());
        m.put("marca", log.getMarca());
        m.put("modello", log.getModello());
        m.put("clienteNome", log.getClienteNome());
        m.put("clienteCognome", log.getClienteCognome());
        m.put("clienteNumero", log.getClienteNumero());
        Map<String, Object> userMap = new HashMap<>();
        userMap.put("id", log.getUser().getId());
        userMap.put("fullName", log.getUser().getFullName());
        userMap.put("role", log.getUser().getRole());
        m.put("user", userMap);
        return m;
    }

    // ============================================================
    // Serializzazione
    // ============================================================

    private Map<String, Object> toMap(ServicePratica p) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", p.getId());
        m.put("nome", p.getNome());
        m.put("cognome", p.getCognome());
        m.put("cellulare", p.getCellulare());
        m.put("email", p.getEmail());
        m.put("marca", p.getMarca());
        m.put("modello", p.getModello());
        m.put("targa", p.getTarga());
        m.put("sede", p.getSede());
        m.put("tipologiaService", p.getTipologiaService());
        m.put("note", p.getNote());
        m.put("stato", p.getStato());
        m.put("noteFallimento", p.getNoteFallimento());
        m.put("noteConclusa", p.getNoteConclusa());
        m.put("noteProblematica", p.getNoteProblematica());
        m.put("dataOrdineRicambio", p.getDataOrdineRicambio() != null ? p.getDataOrdineRicambio().toString() : null);
        m.put("ricambioArrivato", p.getRicambioArrivato());
        m.put("ricambioAlertRimandatoAl", p.getRicambioAlertRimandatoAl() != null ? p.getRicambioAlertRimandatoAl().toString() : null);
        m.put("dataAppuntamento", p.getDataAppuntamento() != null
                ? p.getDataAppuntamento().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss"))
                : null);
        m.put("esitoAppuntamento", p.getEsitoAppuntamento());
        m.put("storicoAppuntamenti", p.getStoricoAppuntamenti());

        Map<String, Object> gestitoDaMap = null;
        if (p.getGestitoDa() != null) {
            gestitoDaMap = new HashMap<>();
            gestitoDaMap.put("id", p.getGestitoDa().getId());
            gestitoDaMap.put("fullName", p.getGestitoDa().getFullName());
            gestitoDaMap.put("role", p.getGestitoDa().getRole());
        }
        m.put("gestitoDa", gestitoDaMap);
        m.put("gestitoAt", p.getGestitoAt() != null
                ? p.getGestitoAt().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss"))
                : null);

        m.put("createdAt", p.getCreatedAt().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")));

        Map<String, Object> userMap = new HashMap<>();
        userMap.put("id", p.getUser().getId());
        userMap.put("fullName", p.getUser().getFullName());
        userMap.put("role", p.getUser().getRole());
        m.put("user", userMap);

        return m;
    }
}
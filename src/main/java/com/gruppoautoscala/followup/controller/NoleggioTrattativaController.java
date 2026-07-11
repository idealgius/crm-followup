package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.ContactLog;
import com.gruppoautoscala.followup.model.NoleggioTrattativa;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.ContactLogService;
import com.gruppoautoscala.followup.service.NoleggioTrattativaService;
import com.gruppoautoscala.followup.service.NoleggioExcelExportService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/noleggio")
public class NoleggioTrattativaController {

    // Fuso orario fisso — garantisce l'orario locale italiano indipendentemente
    // da dove è ospitato il server (es. server cloud in UTC).
    private static final ZoneId ZONA_ITALIA = ZoneId.of("Europe/Rome");

    @Autowired
    private NoleggioTrattativaService noleggioService;

    @Autowired
    private ContactLogService contactLogService;

    @Autowired
    private UserRepository userRepository;

    private final NoleggioExcelExportService excelExportService = new NoleggioExcelExportService();

    private static final List<String> RENT_ROLES = List.of("NOLEGGIO", "MODERATORE", "GESTORE", "ADMIN");

    private boolean canAccessRent(String role) {
        return role != null && RENT_ROLES.contains(role);
    }

    // Chi può "prendere in carico" una trattativa (Gestisci): stessa whitelist
    // di canAccessRent, ma tenuta separata perché in futuro potrebbero divergere
    // (es. se un domani si volesse permettere a un ruolo di vedere ma non gestire).
    private boolean canManageTrattativa(String role) {
        return canAccessRent(role);
    }

    @GetMapping("/trattative")
    public ResponseEntity<?> getAll(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canAccessRent(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        List<NoleggioTrattativa> list = noleggioService.getAll();
        return ResponseEntity.ok(list.stream().map(this::toMap).collect(Collectors.toList()));
    }

    @GetMapping("/trattative/export-excel")
    public ResponseEntity<?> exportExcel(
            @RequestParam(required = false) String stato,
            @RequestParam(required = false) String marchio,
            @RequestParam(required = false) String fonte,
            @RequestParam(required = false) String ruolo,
            @RequestParam(required = false) String operatore,
            HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canAccessRent(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        List<NoleggioTrattativa> list = noleggioService.getAll();

        if (stato != null && !stato.isBlank()) {
            list = list.stream().filter(t -> stato.equals(t.getStato())).collect(Collectors.toList());
        }
        if (marchio != null && !marchio.isBlank()) {
            list = list.stream().filter(t -> marchio.equals(t.getMarchio())).collect(Collectors.toList());
        }
        if (fonte != null && !fonte.isBlank()) {
            list = list.stream().filter(t -> fonte.equals(t.getFonte())).collect(Collectors.toList());
        }
        if ("NOLEGGIO".equals(ruolo)) {
            list = list.stream().filter(t -> t.getUser() != null && "NOLEGGIO".equals(t.getUser().getRole())).collect(Collectors.toList());
        } else if ("BDC".equals(ruolo)) {
            list = list.stream().filter(t -> t.getUser() == null || !"NOLEGGIO".equals(t.getUser().getRole())).collect(Collectors.toList());
        }
        if (operatore != null && !operatore.isBlank()) {
            list = list.stream().filter(t ->
                (t.getUser() != null && operatore.equals(t.getUser().getFullName()))
                || (t.getGestitoDa() != null && operatore.equals(t.getGestitoDa().getFullName()))
            ).collect(Collectors.toList());
        }

        try {
            byte[] excelBytes = excelExportService.export(list);
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"registro_trattative_noleggio.xlsx\"")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(excelBytes);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Errore generazione Excel: " + e.getMessage()));
        }
    }

    @PostMapping("/trattative")
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canAccessRent(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));

        String nome = (String) body.get("nome");
        String cognome = (String) body.get("cognome");
        String cellulare = (String) body.get("cellulare");
        String marchio = (String) body.get("marchio");
        String stato = (String) body.getOrDefault("stato", "SOLO_INFO");
        String noteFallimento = (String) body.get("noteFallimento");
        String tipoCliente = (String) body.get("tipoCliente");

        if (nome == null || nome.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "Nome obbligatorio"));
        if (cognome == null || cognome.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "Cognome obbligatorio"));
        if (cellulare == null || cellulare.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "Cellulare obbligatorio"));
        if (marchio == null || marchio.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "Marchio obbligatorio"));

        LocalDate dataRichiamo = null;
        if ("DA_RICHIAMARE".equals(stato)) {
            Object dr = body.get("dataRichiamo");
            if (dr == null || dr.toString().isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Data richiamo obbligatoria per stato Da Richiamare"));
            }
            dataRichiamo = LocalDate.parse(dr.toString());
        } else if (body.get("dataRichiamo") != null && !body.get("dataRichiamo").toString().isBlank()) {
            dataRichiamo = LocalDate.parse(body.get("dataRichiamo").toString());
        }

        // NOTA: createdAt viene impostato automaticamente dal valore di default
        // dell'entità NoleggioTrattativa (LocalDateTime.now(ZONA_ITALIA)), quindi
        // qui non serve fare nulla in più per l'orario locale — è già corretto
        // fin dal momento in cui l'oggetto viene istanziato dal service.
        NoleggioTrattativa t = noleggioService.create(
            userOpt.get(), nome, cognome, cellulare,
            (String) body.get("email"), marchio, (String) body.get("modello"),
            (String) body.get("note"), (String) body.get("fonte"), stato, dataRichiamo,
            "FALLITO".equals(stato) ? noteFallimento : null, tipoCliente,
            (String) body.get("linkLeadspark"), (String) body.get("linkAutoRichiesta")
        );
        return ResponseEntity.ok(toMap(t));
    }

    @PatchMapping("/trattative/{id}")
    public ResponseEntity<?> update(@PathVariable Long id,
                                    @RequestBody Map<String, Object> body,
                                    HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canAccessRent(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        Optional<NoleggioTrattativa> tOpt = noleggioService.getById(id);
        if (tOpt.isEmpty()) return ResponseEntity.notFound().build();
        NoleggioTrattativa t = tOpt.get();

        if (body.containsKey("nome")) t.setNome((String) body.get("nome"));
        if (body.containsKey("cognome")) t.setCognome((String) body.get("cognome"));
        if (body.containsKey("cellulare")) {
            String cell = (String) body.get("cellulare");
            if (cell == null || cell.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Cellulare obbligatorio"));
            }
            t.setCellulare(cell);
        }
        if (body.containsKey("email")) t.setEmail((String) body.get("email"));
        if (body.containsKey("marchio")) t.setMarchio((String) body.get("marchio"));
        if (body.containsKey("modello")) t.setModello((String) body.get("modello"));
        if (body.containsKey("note")) t.setNote((String) body.get("note"));
        if (body.containsKey("fonte")) t.setFonte((String) body.get("fonte"));
        if (body.containsKey("tipoCliente")) t.setTipoCliente((String) body.get("tipoCliente"));
        if (body.containsKey("linkLeadspark")) t.setLinkLeadspark((String) body.get("linkLeadspark"));
        if (body.containsKey("linkAutoRichiesta")) t.setLinkAutoRichiesta((String) body.get("linkAutoRichiesta"));

        if (body.containsKey("stato")) {
            String nuovoStato = (String) body.get("stato");
            t.setStato(nuovoStato);
            if ("DA_RICHIAMARE".equals(nuovoStato)) {
                Object dr = body.get("dataRichiamo");
                String drStr = dr != null ? dr.toString() : (t.getDataRichiamo() != null ? t.getDataRichiamo().toString() : null);
                if (drStr == null || drStr.isBlank()) {
                    return ResponseEntity.badRequest().body(Map.of("error", "Data richiamo obbligatoria per stato Da Richiamare"));
                }
                t.setDataRichiamo(LocalDate.parse(drStr));
            }
            if ("FALLITO".equals(nuovoStato)) {
                Object nf = body.get("noteFallimento");
                t.setNoteFallimento(nf != null ? nf.toString() : null);
            } else {
                t.setNoteFallimento(null);
            }
        } else if (body.containsKey("noteFallimento") && "FALLITO".equals(t.getStato())) {
            Object nf = body.get("noteFallimento");
            t.setNoteFallimento(nf != null ? nf.toString() : null);
        }

        if (body.containsKey("dataRichiamo") && !"DA_RICHIAMARE".equals(t.getStato())) {
            Object dr = body.get("dataRichiamo");
            t.setDataRichiamo(dr != null && !dr.toString().isBlank() ? LocalDate.parse(dr.toString()) : null);
        } else if (body.containsKey("dataRichiamo") && "DA_RICHIAMARE".equals(t.getStato()) && !body.containsKey("stato")) {
            Object dr = body.get("dataRichiamo");
            if (dr != null && !dr.toString().isBlank()) t.setDataRichiamo(LocalDate.parse(dr.toString()));
        }

        t.setUpdatedAt(LocalDateTime.now(ZONA_ITALIA));
        return ResponseEntity.ok(toMap(noleggioService.update(t)));
    }

    // ===== GESTISCI — presa in carico dell'allert "Da Gestire" =====
    // Solo utenti con ruolo NOLEGGIO, o MODERATORE/GESTORE/ADMIN, possono
    // cliccare "Gestisci". Da quel momento gestitoDa viene valorizzato con
    // l'utente corrente, l'allert "Da Gestire" sparisce (il calcolo è nel
    // campo derivato "daGestire" dentro toMap), e la trattativa risulta
    // filtrabile anche per l'operatore che l'ha presa in carico.
    @PatchMapping("/trattative/{id}/gestisci")
    public ResponseEntity<?> gestisci(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canManageTrattativa(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato a gestire questa trattativa"));

        Optional<NoleggioTrattativa> tOpt = noleggioService.getById(id);
        if (tOpt.isEmpty()) return ResponseEntity.notFound().build();
        NoleggioTrattativa t = tOpt.get();

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));

        t.setGestitoDa(userOpt.get());
        t.setUpdatedAt(LocalDateTime.now(ZONA_ITALIA));
        return ResponseEntity.ok(toMap(noleggioService.update(t)));
    }

    // ===== ANNULLA GESTIONE — rimuove la presa in carico, per correggere
    // un errore (es. click sbagliato). Simmetrico a "Rimuovi Gestione" già
    // usato per gli Allert di Info Acquisto effettuato. =====
    @PatchMapping("/trattative/{id}/annulla-gestione")
    public ResponseEntity<?> annullaGestione(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canManageTrattativa(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        Optional<NoleggioTrattativa> tOpt = noleggioService.getById(id);
        if (tOpt.isEmpty()) return ResponseEntity.notFound().build();
        NoleggioTrattativa t = tOpt.get();

        t.setGestitoDa(null);
        t.setUpdatedAt(LocalDateTime.now(ZONA_ITALIA));
        return ResponseEntity.ok(toMap(noleggioService.update(t)));
    }

    @DeleteMapping("/trattative/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canAccessRent(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        noleggioService.delete(id);
        return ResponseEntity.ok(Map.of("message", "Eliminato"));
    }

    @GetMapping("/trattative/recall-oggi")
    public ResponseEntity<?> recallOggi(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canAccessRent(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        LocalDate oggi = LocalDate.now(ZONA_ITALIA);
        List<NoleggioTrattativa> list = noleggioService.getAll().stream()
            .filter(t -> "DA_RICHIAMARE".equals(t.getStato()) && t.getDataRichiamo() != null && !t.getDataRichiamo().isAfter(oggi))
            .collect(Collectors.toList());
        return ResponseEntity.ok(list.stream().map(this::toMap).collect(Collectors.toList()));
    }

    @GetMapping("/contatti")
    public ResponseEntity<?> getContattiNoleggio(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canAccessRent(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        List<ContactLog> logs;
        if (from != null && to != null) {
            LocalDateTime fromDt = LocalDateTime.parse(from + "T00:00:00");
            LocalDateTime toDt = LocalDateTime.parse(to + "T23:59:59");
            logs = contactLogService.getByDateRange(fromDt, toDt);
        } else {
            logs = contactLogService.getAll();
        }

        List<Map<String, Object>> result = logs.stream()
            .filter(l -> "Info Noleggio".equals(l.getCategory()))
            .map(log -> {
                Map<String, Object> m = new HashMap<>();
                m.put("id", log.getId());
                m.put("noleggioTipo", log.getNoleggioTipo());
                m.put("noleggioLink", log.getNoleggioLink());
                m.put("marca", log.getMarca());
                m.put("modello", log.getModello());
                m.put("linkAuto", log.getLinkAuto());
                m.put("noleggioRichiesta", log.getNoleggioRichiesta());
                m.put("noleggioNomeCliente", log.getNoleggioNomeCliente());
                m.put("noleggioCognomeCliente", log.getNoleggioCognomeCliente());
                m.put("noleggioCellulare", log.getNoleggioCellulare());
                m.put("clienteNome", log.getClienteNome());
                m.put("clienteCognome", log.getClienteCognome());
                m.put("clienteNumero", log.getClienteNumero());
                m.put("contactDate", log.getContactDate().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")));
                Map<String, Object> userMap = new HashMap<>();
                userMap.put("id", log.getUser().getId());
                userMap.put("fullName", log.getUser().getFullName());
                userMap.put("role", log.getUser().getRole());
                m.put("user", userMap);
                return m;
            }).collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    private Map<String, Object> toMap(NoleggioTrattativa t) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", t.getId());
        m.put("nome", t.getNome());
        m.put("cognome", t.getCognome());
        m.put("cellulare", t.getCellulare());
        m.put("email", t.getEmail());
        m.put("marchio", t.getMarchio());
        m.put("modello", t.getModello());
        m.put("note", t.getNote());
        m.put("fonte", t.getFonte());
        m.put("stato", t.getStato());
        m.put("dataRichiamo", t.getDataRichiamo() != null ? t.getDataRichiamo().toString() : null);
        m.put("noteFallimento", t.getNoteFallimento());
        m.put("tipoCliente", t.getTipoCliente());
        m.put("linkLeadspark", t.getLinkLeadspark());
        m.put("linkAutoRichiesta", t.getLinkAutoRichiesta());
        m.put("createdAt", t.getCreatedAt().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")));

        Map<String, Object> userMap = new HashMap<>();
        userMap.put("id", t.getUser().getId());
        userMap.put("fullName", t.getUser().getFullName());
        userMap.put("role", t.getUser().getRole());
        m.put("user", userMap);

        // ===== ALLERT "DA GESTIRE" =====
        // Vera SOLO se: chi ha creato la trattativa NON ha ruolo NOLEGGIO,
        // e nessuno l'ha ancora presa in carico (gestitoDa è null).
        boolean creatoDaNonNoleggio = t.getUser() == null || !"NOLEGGIO".equals(t.getUser().getRole());
        boolean daGestire = creatoDaNonNoleggio && t.getGestitoDa() == null;
        m.put("daGestire", daGestire);

        if (t.getGestitoDa() != null) {
            Map<String, Object> gestitoDaMap = new HashMap<>();
            gestitoDaMap.put("id", t.getGestitoDa().getId());
            gestitoDaMap.put("fullName", t.getGestitoDa().getFullName());
            gestitoDaMap.put("role", t.getGestitoDa().getRole());
            m.put("gestitoDa", gestitoDaMap);
        } else {
            m.put("gestitoDa", null);
        }

        return m;
    }
}
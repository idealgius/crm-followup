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
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/noleggio")
public class NoleggioTrattativaController {

    @Autowired
    private NoleggioTrattativaService noleggioService;

    @Autowired
    private ContactLogService contactLogService;

    @Autowired
    private UserRepository userRepository;

    private final NoleggioExcelExportService excelExportService = new NoleggioExcelExportService();

    // Ruoli che possono vedere/gestire la dashboard Rent
    private static final List<String> RENT_ROLES = List.of("NOLEGGIO", "MODERATORE", "GESTORE", "ADMIN");

    private boolean canAccessRent(String role) {
        return role != null && RENT_ROLES.contains(role);
    }

    // ===== TRATTATIVE (nuova entità) =====

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
    public ResponseEntity<?> exportExcel(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canAccessRent(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        List<NoleggioTrattativa> list = noleggioService.getAll();
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

        NoleggioTrattativa t = noleggioService.create(
            userOpt.get(),
            nome,
            cognome,
            cellulare,
            (String) body.get("email"),
            marchio,
            (String) body.get("modello"),
            (String) body.get("note"),
            (String) body.get("fonte"),
            stato,
            dataRichiamo,
            (String) body.get("linkLeadspark"),
            (String) body.get("linkAutoRichiesta")
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
        }
        if (body.containsKey("dataRichiamo") && !"DA_RICHIAMARE".equals(t.getStato())) {
            Object dr = body.get("dataRichiamo");
            t.setDataRichiamo(dr != null && !dr.toString().isBlank() ? LocalDate.parse(dr.toString()) : null);
        } else if (body.containsKey("dataRichiamo") && "DA_RICHIAMARE".equals(t.getStato()) && !body.containsKey("stato")) {
            // aggiornamento diretto della data mentre resta in stato DA_RICHIAMARE
            Object dr = body.get("dataRichiamo");
            if (dr != null && !dr.toString().isBlank()) t.setDataRichiamo(LocalDate.parse(dr.toString()));
        }

        t.setUpdatedAt(LocalDateTime.now());
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

    // Recall di oggi/scaduti per il popup all'apertura della dashboard Rent
    @GetMapping("/trattative/recall-oggi")
    public ResponseEntity<?> recallOggi(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canAccessRent(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        LocalDate oggi = LocalDate.now();
        List<NoleggioTrattativa> list = noleggioService.getAll().stream()
            .filter(t -> "DA_RICHIAMARE".equals(t.getStato()) && t.getDataRichiamo() != null && !t.getDataRichiamo().isAfter(oggi))
            .collect(Collectors.toList());
        return ResponseEntity.ok(list.stream().map(this::toMap).collect(Collectors.toList()));
    }

    // ===== INFO NOLEGGIO da Registro Contatti (sola lettura, di tutti gli operatori) =====

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
        m.put("linkLeadspark", t.getLinkLeadspark());
        m.put("linkAutoRichiesta", t.getLinkAutoRichiesta());
        m.put("createdAt", t.getCreatedAt().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")));
        Map<String, Object> userMap = new HashMap<>();
        userMap.put("id", t.getUser().getId());
        userMap.put("fullName", t.getUser().getFullName());
        userMap.put("role", t.getUser().getRole());
        m.put("user", userMap);
        return m;
    }
}
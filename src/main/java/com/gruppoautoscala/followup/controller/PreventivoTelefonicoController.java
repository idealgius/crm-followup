package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.PreventivoTelefonico;
import com.gruppoautoscala.followup.model.PreventivoTelefonicoStatusHistory;
import com.gruppoautoscala.followup.model.NoleggioTrattativa;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.PreventivoTelefonicoService;
import com.gruppoautoscala.followup.service.PreventivoImportService;
import com.gruppoautoscala.followup.service.PreventivoRentSyncService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/preventivi-telefonici")
public class PreventivoTelefonicoController {

    private static final ZoneId ITALY_ZONE = ZoneId.of("Europe/Rome");
    private static final Set<String> TIPI_AMMESSI = Set.of("VENDITA", "NOLEGGIO");

    @Autowired private PreventivoTelefonicoService preventivoService;
    @Autowired private PreventivoRentSyncService rentSyncService;
    @Autowired private PreventivoImportService preventivoImportService;
    @Autowired private UserRepository userRepository;

    @GetMapping
    public ResponseEntity<?> list(@RequestParam(required = false) String from,
                                   @RequestParam(required = false) String to,
                                   @RequestParam(required = false) String tipo,
                                   HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        List<PreventivoTelefonico> preventivi;
        if (from != null && to != null) {
            LocalDateTime fromDt = LocalDate.parse(from).atStartOfDay();
            LocalDateTime toDt = LocalDate.parse(to).plusDays(1).atStartOfDay();
            preventivi = preventivoService.getByPeriod(fromDt, toDt);
        } else {
            // Nessun periodo specificato: storico completo (usato per i
            // grafici "totale storico").
            preventivi = preventivoService.getAll();
        }

        if (tipo != null && !tipo.isBlank()) {
            preventivi = preventivi.stream().filter(p -> tipo.equalsIgnoreCase(p.getTipo())).collect(Collectors.toList());
        }

        return ResponseEntity.ok(buildListResponse(preventivi));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<PreventivoTelefonico> p = preventivoService.getById(id);
        if (p.isEmpty()) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(buildListResponse(List.of(p.get())).get(0));
    }

    @PostMapping("/import-lead")
    public ResponseEntity<?> importLead(@RequestParam("file") MultipartFile file, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (file.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "File vuoto"));

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));

        try {
            PreventivoImportService.ImportResult result = preventivoImportService.importLeadCsv(file, userOpt.get());
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("creati", result.created);
            response.put("aggiornati", result.updated);
            response.put("invariati", result.unchanged);
            response.put("errori", result.errori);
            response.put("conflittiConsulente", result.conflittiConsulente);
            return ResponseEntity.ok(response);
        } catch (IOException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Errore nella lettura del file: " + e.getMessage()));
        }
    }

    @GetMapping("/import-log")
    public ResponseEntity<?> getImportLog(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        List<Map<String, Object>> result = preventivoImportService.getImportHistory().stream().map(log -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", log.getId());
            m.put("fileName", log.getFileName());
            m.put("importedAt", log.getImportedAt().toString());
            m.put("creati", log.getCreati());
            m.put("aggiornati", log.getAggiornati());
            m.put("invariati", log.getInvariati());
            m.put("numErrori", log.getNumErrori());
            Map<String, Object> user = new LinkedHashMap<>();
            user.put("id", log.getImportedBy().getId());
            user.put("fullName", log.getImportedBy().getFullName());
            m.put("importedBy", user);
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    // ===== RISOLUZIONE CONFLITTI CONSULENTE (post-import) =====
    // Il popup di conflitto (non il confirm() del browser) mostra all'utente
    // ogni preventivo dove il consulente nel file differisce da quello gia'
    // salvato A MANO (consultantManuallyEdited=true). Questo endpoint riceve
    // le decisioni prese riga per riga: "replace" applica il consulente del
    // file e toglie la protezione manuale (torna in sync con l'import);
    // "keep" non tocca nulla e lascia il preventivo protetto come prima.
    @PostMapping("/resolve-consultant-conflicts")
    public ResponseEntity<?> resolveConsultantConflicts(@RequestBody List<Map<String, Object>> decisions, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));

        int applicati = 0;
        for (Map<String, Object> d : decisions) {
            if (!"replace".equals(d.get("action"))) continue;
            Long id = Long.valueOf(String.valueOf(d.get("id")));
            String nuovoConsulente = (String) d.get("consultantName");
            Optional<PreventivoTelefonico> pOpt = preventivoService.getById(id);
            if (pOpt.isEmpty() || nuovoConsulente == null || nuovoConsulente.isBlank()) continue;
            PreventivoTelefonico p = pOpt.get();
            p.setConsultantName(nuovoConsulente);
            p.setConsultantManuallyEdited(false);
            preventivoService.update(p, userOpt.get());
            applicati++;
        }
        return ResponseEntity.ok(Map.of("applicati", applicati));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));

        String tipo = trimOrNull(body.get("tipo"));
        if (tipo == null || !TIPI_AMMESSI.contains(tipo.toUpperCase())) {
            return ResponseEntity.badRequest().body(Map.of("error", "Tipo obbligatorio: VENDITA o NOLEGGIO"));
        }

        String clienteNome = trimOrNull(body.get("clienteNome"));
        String clienteCognome = trimOrNull(body.get("clienteCognome"));
        String marca = trimOrNull(body.get("marca"));
        String modello = trimOrNull(body.get("modello"));
        String linkLead = trimOrNull(body.get("linkLead"));
        String consultantName = trimOrNull(body.get("consultantName"));

        List<String> mancanti = new ArrayList<>();
        if (clienteNome == null) mancanti.add("Nome");
        if (clienteCognome == null) mancanti.add("Cognome");
        if (marca == null) mancanti.add("Marchio");
        if (modello == null) mancanti.add("Modello");
        if (linkLead == null) mancanti.add("Link lead");
        if (consultantName == null) mancanti.add("Consulente");
        if (!mancanti.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Campi obbligatori mancanti: " + String.join(", ", mancanti)));
        }

        PreventivoTelefonico p = new PreventivoTelefonico();
        p.setTipo(tipo.toUpperCase());
        p.setClienteNome(clienteNome);
        p.setClienteCognome(clienteCognome);
        p.setMarca(marca);
        p.setModello(modello);
        p.setTargaTelaio(trimOrNull(body.get("targaTelaio")));
        p.setTelefono(trimOrNull(body.get("telefono")));
        p.setLinkLead(linkLead);
        p.setConsultantName(consultantName);

        PreventivoTelefonico saved = preventivoService.create(p, userOpt.get());
        return ResponseEntity.ok(buildListResponse(List.of(saved)).get(0));
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<?> changeStatus(@PathVariable Long id,
                                          @RequestBody Map<String, Object> body,
                                          HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        Optional<PreventivoTelefonico> pOpt = preventivoService.getById(id);
        if (pOpt.isEmpty()) return ResponseEntity.notFound().build();

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));

        String newStatus = trimOrNull(body.get("status"));
        if (newStatus == null) return ResponseEntity.badRequest().body(Map.of("error", "Status obbligatorio"));

        try {
            PreventivoTelefonico saved = preventivoService.changeStatus(pOpt.get(), newStatus.toUpperCase(), userOpt.get());
            return ResponseEntity.ok(buildListResponse(List.of(saved)).get(0));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id,
                                    @RequestBody Map<String, Object> body,
                                    HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        Optional<PreventivoTelefonico> pOpt = preventivoService.getById(id);
        if (pOpt.isEmpty()) return ResponseEntity.notFound().build();
        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));

        PreventivoTelefonico p = pOpt.get();
        if (body.containsKey("clienteNome")) {
            String v = trimOrNull(body.get("clienteNome"));
            if (v == null) return ResponseEntity.badRequest().body(Map.of("error", "Nome obbligatorio"));
            p.setClienteNome(v);
        }
        if (body.containsKey("clienteCognome")) {
            String v = trimOrNull(body.get("clienteCognome"));
            if (v == null) return ResponseEntity.badRequest().body(Map.of("error", "Cognome obbligatorio"));
            p.setClienteCognome(v);
        }
        if (body.containsKey("marca")) {
            String v = trimOrNull(body.get("marca"));
            if (v == null) return ResponseEntity.badRequest().body(Map.of("error", "Marchio obbligatorio"));
            p.setMarca(v);
        }
        if (body.containsKey("modello")) {
            String v = trimOrNull(body.get("modello"));
            if (v == null) return ResponseEntity.badRequest().body(Map.of("error", "Modello obbligatorio"));
            p.setModello(v);
        }
        if (body.containsKey("targaTelaio")) p.setTargaTelaio(trimOrNull(body.get("targaTelaio")));
        if (body.containsKey("telefono")) p.setTelefono(trimOrNull(body.get("telefono")));
        if (body.containsKey("linkLead")) p.setLinkLead(trimOrNull(body.get("linkLead")));
        if (body.containsKey("consultantName")) {
            String v = trimOrNull(body.get("consultantName"));
            if (v == null) return ResponseEntity.badRequest().body(Map.of("error", "Consulente obbligatorio"));
            p.setConsultantName(v);
            // Modifica manuale: da questo momento l'import non lo
            // sovrascrivera' piu' in automatico se il file porta un
            // consulente diverso — chiedera' conferma.
            p.setConsultantManuallyEdited(true);
        }

        PreventivoTelefonico saved = preventivoService.update(p, userOpt.get());
        return ResponseEntity.ok(buildListResponse(List.of(saved)).get(0));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<PreventivoTelefonico> pOpt = preventivoService.getById(id);
        if (pOpt.isEmpty()) return ResponseEntity.notFound().build();
        preventivoService.delete(pOpt.get());
        return ResponseEntity.ok(Map.of("message", "Preventivo telefonico eliminato"));
    }

    // Costruisce la risposta JSON per una lista di preventivi, con lo
    // storico dei cambi di stato embeddato (una sola query batch, stesso
    // pattern di /with-steps in FollowUpController — niente N+1).
    private List<Map<String, Object>> buildListResponse(List<PreventivoTelefonico> preventivi) {
        if (preventivi.isEmpty()) return List.of();

        List<PreventivoTelefonicoStatusHistory> allHistory = preventivoService.getHistoryFor(preventivi);
        Map<Long, List<PreventivoTelefonicoStatusHistory>> historyByPreventivo = allHistory.stream()
            .collect(Collectors.groupingBy(h -> h.getPreventivo().getId()));

        return preventivi.stream().map(p -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", p.getId());
            m.put("tipo", p.getTipo());
            m.put("clienteNome", p.getClienteNome());
            m.put("clienteCognome", p.getClienteCognome());
            m.put("marca", p.getMarca());
            m.put("modello", p.getModello());
            m.put("targaTelaio", p.getTargaTelaio());
            m.put("telefono", p.getTelefono());

            // NUOVO: collegamento con la trattativa Rent generata
            // automaticamente (solo per preventivi Noleggio).
            Optional<NoleggioTrattativa> linked = rentSyncService.findLinked(p.getId());
            if (linked.isPresent()) {
                NoleggioTrattativa t = linked.get();
                m.put("rentTrattativaId", t.getId());
                boolean modificataInRent = t.getUpdatedAt() != null && t.getLastAutoSyncAt() != null
                        && t.getUpdatedAt().isAfter(t.getLastAutoSyncAt());
                m.put("rentModificataDopoSync", modificataInRent);
            } else {
                m.put("rentTrattativaId", null);
                m.put("rentModificataDopoSync", false);
            }
            m.put("linkLead", p.getLinkLead());
            m.put("sourceLeadId", p.getSourceLeadId());
            m.put("consultantName", p.getConsultantName());
            m.put("consultantManuallyEdited", p.getConsultantManuallyEdited());
            m.put("status", p.getStatus());
            m.put("createdAt", p.getCreatedAt() != null ? p.getCreatedAt().toString() : null);

            Map<String, Object> user = new LinkedHashMap<>();
            user.put("id", p.getUser().getId());
            user.put("fullName", p.getUser().getFullName());
            m.put("user", user);

            if (p.getLastModifiedBy() != null) {
                Map<String, Object> lastMod = new LinkedHashMap<>();
                lastMod.put("id", p.getLastModifiedBy().getId());
                lastMod.put("fullName", p.getLastModifiedBy().getFullName());
                m.put("lastModifiedBy", lastMod);
            }
            m.put("lastModifiedAt", p.getLastModifiedAt() != null ? p.getLastModifiedAt().toString() : null);

            List<Map<String, Object>> history = historyByPreventivo
                .getOrDefault(p.getId(), List.of())
                .stream()
                .sorted(Comparator.comparing(PreventivoTelefonicoStatusHistory::getChangedAt))
                .map(h -> {
                    Map<String, Object> hm = new LinkedHashMap<>();
                    hm.put("status", h.getStatus());
                    hm.put("changedAt", h.getChangedAt() != null ? h.getChangedAt().toString() : null);
                    Map<String, Object> changedBy = new LinkedHashMap<>();
                    changedBy.put("id", h.getChangedBy().getId());
                    changedBy.put("fullName", h.getChangedBy().getFullName());
                    hm.put("changedBy", changedBy);
                    return hm;
                }).collect(Collectors.toList());
            m.put("statusHistory", history);

            return m;
        }).collect(Collectors.toList());
    }

    private String trimOrNull(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o).trim();
        return s.isEmpty() ? null : s;
    }
}
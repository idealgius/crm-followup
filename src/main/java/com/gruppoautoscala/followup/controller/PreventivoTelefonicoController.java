package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.PreventivoTelefonico;
import com.gruppoautoscala.followup.model.PreventivoTelefonicoStatusHistory;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.PreventivoTelefonicoService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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
            m.put("linkLead", p.getLinkLead());
            m.put("consultantName", p.getConsultantName());
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
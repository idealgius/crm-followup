package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.*;
import com.gruppoautoscala.followup.repository.RecallFollowUpStepRepository;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.RecallFollowUpService;
import com.gruppoautoscala.followup.service.RolePermissionService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/recall-followups")
public class RecallFollowUpController {

    @Autowired private RecallFollowUpService recallFollowUpService;
    @Autowired private RecallFollowUpStepRepository recallFollowUpStepRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private RolePermissionService rolePermissionService;

    // Il modulo Recall Follow-up è un derivato dei Follow-up: stesso
    // permesso (FOLLOWUPS), niente sezione a parte.
    private static final String SECTION = "FOLLOWUPS";

    private boolean canRead(Long userId, String role) {
        return !"NONE".equals(rolePermissionService.getEffectiveAccess(userId, role, SECTION));
    }
    private boolean canWrite(Long userId, String role) {
        return rolePermissionService.hasAtLeast(rolePermissionService.getEffectiveAccess(userId, role, SECTION), "FULL");
    }

    // ===== CALENDARIO: conteggio per giorno in un mese =====
    @GetMapping("/calendar")
    public ResponseEntity<?> getCalendar(@RequestParam int year, @RequestParam int month, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canRead(userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        YearMonth ym = YearMonth.of(year, month);
        List<RecallFollowUpStep> steps = recallFollowUpService.getByDateRange(ym.atDay(1), ym.atEndOfMonth());

        // Un cliente conta UNA volta per giorno (non due, anche se ha 2
        // tentativi quel giorno) — raggruppo per RecallFollowUp.
        Map<String, Set<Long>> byDay = new HashMap<>();
        for (RecallFollowUpStep s : steps) {
            if (!"IN_CORSO".equals(s.getRecallFollowUp().getStatus())) continue;
            String d = s.getScheduledDate().toString();
            byDay.computeIfAbsent(d, k -> new HashSet<>()).add(s.getRecallFollowUp().getId());
        }
        Map<String, Integer> days = new LinkedHashMap<>();
        byDay.forEach((d, ids) -> days.put(d, ids.size()));
        return ResponseEntity.ok(Map.of("days", days));
    }

    // ===== LISTA CLIENTI DI UN GIORNO =====
    @GetMapping("/by-date")
    public ResponseEntity<?> getByDate(@RequestParam String date, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canRead(userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        List<RecallFollowUpStep> steps = recallFollowUpService.getByDate(LocalDate.parse(date));
        Map<Long, List<RecallFollowUpStep>> byRfu = steps.stream()
            .collect(Collectors.groupingBy(s -> s.getRecallFollowUp().getId()));

        List<Map<String, Object>> result = byRfu.values().stream()
            .map(group -> rfuToMap(group.get(0).getRecallFollowUp(), group))
            .collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canRead(userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        Optional<RecallFollowUp> rfuOpt = recallFollowUpService.getById(id);
        if (rfuOpt.isEmpty()) return ResponseEntity.notFound().build();
        List<RecallFollowUpStep> currentAttempts = recallFollowUpStepRepository
            .findByRecallFollowUpAndStepNumber(rfuOpt.get(), rfuOpt.get().getCurrentStep());
        return ResponseEntity.ok(rfuToMap(rfuOpt.get(), currentAttempts));
    }

    // ===== ESITO DI UN TENTATIVO (fa scattare l'avanzamento allo step
    // successivo o la chiusura, tutto gestito dal service) =====
    @PatchMapping("/steps/{stepId}")
    public ResponseEntity<?> updateAttempt(@PathVariable Long stepId, @RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canWrite(userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        Optional<RecallFollowUpStep> stepOpt = recallFollowUpStepRepository.findById(stepId);
        if (stepOpt.isEmpty()) return ResponseEntity.notFound().build();

        String outcome = (String) body.get("outcome");
        if (!List.of("PENDING", "ANSWERED", "NO_ANSWER").contains(outcome))
            return ResponseEntity.badRequest().body(Map.of("error", "Esito non valido"));

        User actor = userRepository.findById(userId).orElse(null);
        RecallFollowUpStep updated = recallFollowUpService.setAttemptOutcome(stepOpt.get(), outcome, actor);

        RecallFollowUp rfu = updated.getRecallFollowUp();
        List<RecallFollowUpStep> currentAttempts = recallFollowUpStepRepository
            .findByRecallFollowUpAndStepNumber(rfu, rfu.getCurrentStep());
        return ResponseEntity.ok(rfuToMap(rfu, currentAttempts));
    }

    // ===== NOTE / FLAG "HA RISPOSTO" MANUALE =====
    @PatchMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canWrite(userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        Optional<RecallFollowUp> rfuOpt = recallFollowUpService.getById(id);
        if (rfuOpt.isEmpty()) return ResponseEntity.notFound().build();
        RecallFollowUp rfu = rfuOpt.get();
        if (body.containsKey("notes")) rfu.setNotes((String) body.get("notes"));
        if (body.containsKey("responded")) {
            boolean responded = Boolean.TRUE.equals(body.get("responded"));
            rfu.setResponded(responded);
            if (responded && "IN_CORSO".equals(rfu.getStatus())) {
                rfu.setStatus("RISPOSTO");
                rfu.setClosedAt(java.time.LocalDateTime.now());
            }
        }
        recallFollowUpService.save(rfu);
        List<RecallFollowUpStep> currentAttempts = recallFollowUpStepRepository
            .findByRecallFollowUpAndStepNumber(rfu, rfu.getCurrentStep());
        return ResponseEntity.ok(rfuToMap(rfu, currentAttempts));
    }

    // ===== SERIALIZZAZIONE =====
    private Map<String, Object> rfuToMap(RecallFollowUp rfu, List<RecallFollowUpStep> attempts) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", rfu.getId());
        m.put("status", rfu.getStatus());
        m.put("responded", rfu.isResponded());
        m.put("notes", rfu.getNotes());
        m.put("currentStep", rfu.getCurrentStep());

        FollowUp fu = rfu.getOriginalFollowUp();
        m.put("originalFollowUpId", fu.getId());
        m.put("consultantName", fu.getConsultantName());
        m.put("trattativaLink", fu.getTrattativaLink());

        Customer customer = fu.getCustomer();
        Map<String, Object> customerMap = new LinkedHashMap<>();
        customerMap.put("fullName", customer.getFullName());
        customerMap.put("email", customer.getEmail());
        customerMap.put("phone", customer.getPhone());
        customerMap.put("emailOnly", customer.getEmailOnly());
        m.put("customer", customerMap);

        m.put("attempts", attempts.stream()
            .sorted(Comparator.comparingInt(RecallFollowUpStep::getAttemptNumber))
            .map(a -> {
                Map<String, Object> am = new LinkedHashMap<>();
                am.put("id", a.getId());
                am.put("stepNumber", a.getStepNumber());
                am.put("attemptNumber", a.getAttemptNumber());
                am.put("channel", a.getChannel());
                am.put("scheduledSlot", a.getScheduledSlot());
                am.put("scheduledDate", a.getScheduledDate().toString());
                am.put("outcome", a.getOutcome());
                am.put("executedAt", a.getExecutedAt() != null ? a.getExecutedAt().toString() : null);
                if (a.getExecutedBy() != null) am.put("executedByName", a.getExecutedBy().getFullName());
                return am;
            }).collect(Collectors.toList()));

        return m;
    }
}
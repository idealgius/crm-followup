package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.Customer;
import com.gruppoautoscala.followup.model.FollowUp;
import com.gruppoautoscala.followup.model.FollowUpStep;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.CustomerRepository;
import com.gruppoautoscala.followup.repository.FollowUpRepository;
import com.gruppoautoscala.followup.repository.FollowUpStepRepository;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.FollowUpService;
import com.gruppoautoscala.followup.service.RecallFollowUpService;
import com.gruppoautoscala.followup.service.FollowUpExcelService;
import com.gruppoautoscala.followup.service.RolePermissionService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
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
@RequestMapping("/api/followups")
public class FollowUpController {

    private static final ZoneId ITALY_ZONE = ZoneId.of("Europe/Rome");

    @Autowired private FollowUpService followUpService;
    @Autowired private CustomerRepository customerRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private FollowUpStepRepository followUpStepRepository;
    @Autowired private FollowUpRepository followUpRepository;
    @Autowired private RecallFollowUpService recallFollowUpService;
    @Autowired private FollowUpExcelService followUpExcelService;
    @Autowired private RolePermissionService rolePermissionService;

    // NUOVO: export Excel dei follow-up di un giorno o di un periodo
    // (Riepilogo + un foglio per consulente + "Tutti").
    // GET /api/followups/export?from=2026-10-01&to=2026-10-05&consultants=Scala Rosario,Fiore Guido
    @GetMapping("/export")
    public ResponseEntity<?> exportExcel(@RequestParam String from, @RequestParam(required = false) String to,
                                         @RequestParam(required = false) String consultants,
                                         @RequestParam(required = false, defaultValue = "giorno") String modo, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!rolePermissionService.hasAtLeast(rolePermissionService.getEffectiveAccess(userId, role, "FOLLOWUPS"), "READ_ONLY"))
            return ResponseEntity.status(403).body(Map.of("error", "Non hai il permesso per i Follow-up"));
        try {
            LocalDate dal = LocalDate.parse(from), al = (to == null || to.isBlank()) ? dal : LocalDate.parse(to);
            if (al.isBefore(dal)) { LocalDate t = dal; dal = al; al = t; }
            if (dal.plusDays(366).isBefore(al)) return ResponseEntity.badRequest().body(Map.of("error", "Periodo troppo lungo (massimo un anno)"));
            Set<String> cons = new LinkedHashSet<>();
            if (consultants != null) for (String c : consultants.split(",")) if (!c.isBlank()) cons.add(c.trim());
            String chi = userRepository.findById(userId).map(User::getFullName).orElse(null);
            boolean caricati = "caricati".equals(modo);   // solo quelli inseriti/importati nelle date scelte
            byte[] xlsx = followUpExcelService.export(dal, al, cons, chi, caricati);
            String nome = "followup_" + (caricati ? "caricati_" : "") + dal + (al.equals(dal) ? "" : "_" + al) + ".xlsx";
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + nome + "\"")
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(xlsx);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Export non riuscito: " + e.getMessage()));
        }
    }

    @GetMapping
    public ResponseEntity<?> getByDate(@RequestParam String date, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        LocalDate localDate = LocalDate.parse(date);
        List<FollowUp> followUps = followUpService.getByDate(localDate);
        return ResponseEntity.ok(followUps);
    }

    @GetMapping("/with-steps")
    public ResponseEntity<?> getByDateWithSteps(@RequestParam String date, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        LocalDate localDate = LocalDate.parse(date);
        List<FollowUp> followUps = followUpService.getByDate(localDate);

        if (followUps.isEmpty()) return ResponseEntity.ok(List.of());

        // Carica tutti gli step in una sola query
        List<FollowUpStep> allSteps = followUpStepRepository.findByFollowUpIn(followUps);
        Map<Long, List<FollowUpStep>> stepsByFollowUp = allSteps.stream()
            .collect(Collectors.groupingBy(s -> s.getFollowUp().getId()));

        List<Map<String, Object>> result = followUps.stream().map(fu -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", fu.getId());
            m.put("workDate", fu.getWorkDate().toString());
            m.put("status", fu.getStatus());
            m.put("hasAppointment", fu.getHasAppointment());
            m.put("consultantName", fu.getConsultantName());
            // NUOVO: link trattativa (icona 📎 nel form).
            m.put("trattativaLink", fu.getTrattativaLink());
            // NUOVO: vettura e provenienza (import CSV)
            m.put("marca", fu.getMarca());
            m.put("modello", fu.getModello());
            m.put("imported", Boolean.TRUE.equals(fu.getImported()));

            Map<String, Object> customer = new LinkedHashMap<>();
            customer.put("id", fu.getCustomer().getId());
            customer.put("fullName", fu.getCustomer().getFullName());
            customer.put("email", fu.getCustomer().getEmail());
            customer.put("phone", fu.getCustomer().getPhone());
            customer.put("emailOnly", fu.getCustomer().getEmailOnly());
            m.put("customer", customer);

            Map<String, Object> user = new LinkedHashMap<>();
            user.put("id", fu.getUser().getId());
            user.put("fullName", fu.getUser().getFullName());
            m.put("user", user);

            // NUOVO: chi ha modificato l'ultima volta il follow-up e quando.
            if (fu.getLastModifiedBy() != null) {
                Map<String, Object> lastMod = new LinkedHashMap<>();
                lastMod.put("id", fu.getLastModifiedBy().getId());
                lastMod.put("fullName", fu.getLastModifiedBy().getFullName());
                m.put("lastModifiedBy", lastMod);
            }
            m.put("lastModifiedAt", fu.getLastModifiedAt() != null ? fu.getLastModifiedAt().toString() : null);

            List<Map<String, Object>> steps = stepsByFollowUp
                .getOrDefault(fu.getId(), List.of())
                .stream()
                .sorted(Comparator.comparingInt(FollowUpStep::getStepNumber))
                .map(s -> {
                    Map<String, Object> sm = new LinkedHashMap<>();
                    sm.put("id", s.getId());
                    sm.put("stepNumber", s.getStepNumber());
                    sm.put("dayNumber", s.getDayNumber());
                    sm.put("channel", s.getChannel());
                    sm.put("scheduledSlot", s.getScheduledSlot());
                    sm.put("outcome", s.getOutcome());
                    sm.put("notes", s.getNotes());
                    sm.put("executedAt", s.getExecutedAt() != null ? s.getExecutedAt().toString() : null);
                    sm.put("imported", Boolean.TRUE.equals(s.getImported()));
                    // NUOVO: chi ha segnato l'ultima volta questo step.
                    if (s.getExecutedBy() != null) {
                        Map<String, Object> execBy = new LinkedHashMap<>();
                        execBy.put("id", s.getExecutedBy().getId());
                        execBy.put("fullName", s.getExecutedBy().getFullName());
                        sm.put("executedBy", execBy);
                    }
                    return sm;
                }).collect(Collectors.toList());
            m.put("steps", steps);
            return m;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    @GetMapping("/search")
    public ResponseEntity<?> search(@RequestParam String q, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        List<FollowUp> byName = followUpService.searchByCustomerName(q);
        List<FollowUp> byPhone = followUpService.searchByCustomerPhone(q);
        byPhone.stream()
            .filter(f -> byName.stream().noneMatch(n -> n.getId().equals(f.getId())))
            .forEach(byName::add);
        return ResponseEntity.ok(byName);
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        Customer customer = new Customer();
        customer.setFullName((String) body.get("fullName"));
        customer.setEmail((String) body.get("email"));
        customer.setPhone((String) body.get("phone"));
        customer.setEmailOnly(Boolean.TRUE.equals(body.get("emailOnly")));
        customer = customerRepository.save(customer);

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));

        String consultantName = (String) body.get("consultantName");
        if (consultantName == null || consultantName.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Consulente obbligatorio"));
        }

        LocalDate workDate = LocalDate.parse((String) body.get("workDate"));
        FollowUp followUp = followUpService.createFollowUp(customer, userOpt.get(), workDate, consultantName.trim());

        // NUOVO: link trattativa opzionale, salvato subito dopo la
        // creazione (createFollowUp non lo conosce, resta invariata).
        String trattativaLink = (String) body.get("trattativaLink");
        if (trattativaLink != null && !trattativaLink.isBlank()) {
            followUp.setTrattativaLink(trattativaLink.trim());
        }
        // NUOVO: marca e modello (facoltativi)
        String marca = (String) body.get("marca"), modello = (String) body.get("modello");
        if (marca != null && !marca.isBlank()) followUp.setMarca(marca.trim());
        if (modello != null && !modello.isBlank()) followUp.setModello(modello.trim());
        followUp = followUpService.save(followUp);

        return ResponseEntity.ok(followUp);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        return followUpService.getById(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/steps")
    public ResponseEntity<?> getSteps(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<FollowUp> followUp = followUpService.getById(id);
        if (followUp.isEmpty()) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(followUpStepRepository.findByFollowUpOrderByStepNumber(followUp.get()));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id,
                                    @RequestBody Map<String, Object> body,
                                    HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<FollowUp> followUpOpt = followUpService.getById(id);
        if (followUpOpt.isEmpty()) return ResponseEntity.notFound().build();
        FollowUp followUp = followUpOpt.get();

        String previousStatus = followUp.getStatus();

        if (body.containsKey("status")) followUp.setStatus((String) body.get("status"));
        if (body.containsKey("hasAppointment"))
            followUp.setHasAppointment(Boolean.TRUE.equals(body.get("hasAppointment")));
        if (body.containsKey("customerName")) {
            followUp.getCustomer().setFullName((String) body.get("customerName"));
            customerRepository.save(followUp.getCustomer());
        }
        if (body.containsKey("consultantName"))
            followUp.setConsultantName((String) body.get("consultantName"));
        if (body.containsKey("trattativaLink"))
            followUp.setTrattativaLink((String) body.get("trattativaLink"));
        if (body.containsKey("marca")) followUp.setMarca((String) body.get("marca"));
        if (body.containsKey("modello")) followUp.setModello((String) body.get("modello"));

        // NUOVO: traccia chi ha fatto l'ultima modifica e quando.
        userRepository.findById(userId).ifPresent(followUp::setLastModifiedBy);
        followUp.setLastModifiedAt(LocalDateTime.now(ITALY_ZONE));

        FollowUp saved = followUpService.save(followUp);

        // NUOVO: se il follow-up è appena diventato ABANDONED (non lo era
        // già prima — evita doppioni se il PATCH viene rimandato con lo
        // stesso stato), avvia il ciclo Recall Follow-up.
        if ("ABANDONED".equals(saved.getStatus()) && !"ABANDONED".equals(previousStatus)) {
            recallFollowUpService.maybeCreateRecallFollowUp(saved);
        }

        return ResponseEntity.ok(saved);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<FollowUp> followUpOpt = followUpService.getById(id);
        if (followUpOpt.isEmpty()) return ResponseEntity.notFound().build();
        followUpStepRepository.deleteAll(followUpStepRepository.findByFollowUp(followUpOpt.get()));
        followUpRepository.deleteById(id);
        return ResponseEntity.ok(Map.of("message", "Follow-up eliminato"));
    }

    @PatchMapping("/steps/{stepId}")
    public ResponseEntity<?> updateStep(@PathVariable Long stepId,
                                        @RequestBody Map<String, Object> body,
                                        HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<FollowUpStep> stepOpt = followUpStepRepository.findById(stepId);
        if (stepOpt.isEmpty()) return ResponseEntity.notFound().build();
        FollowUpStep step = stepOpt.get();
        if (body.containsKey("outcome")) step.setOutcome((String) body.get("outcome"));
        if (body.containsKey("notes")) step.setNotes((String) body.get("notes"));
        if (body.containsKey("executedAt")) {
            step.setExecutedAt(LocalDateTime.now(ITALY_ZONE));
            userRepository.findById(userId).ifPresent(step::setExecutedBy);
        }
        // modificato a mano: non e' piu' "dall'import"
        step.setImported(false);
        return ResponseEntity.ok(followUpStepRepository.save(step));
    }
}
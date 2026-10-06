package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.FollowUp;
import com.gruppoautoscala.followup.model.FollowUpStep;
import com.gruppoautoscala.followup.model.RecallFollowUp;
import com.gruppoautoscala.followup.model.RecallFollowUpStep;
import com.gruppoautoscala.followup.repository.FollowUpRepository;
import com.gruppoautoscala.followup.repository.FollowUpStepRepository;
import com.gruppoautoscala.followup.repository.RecallFollowUpRepository;
import com.gruppoautoscala.followup.repository.RecallFollowUpStepRepository;
import com.gruppoautoscala.followup.service.RolePermissionService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * DASHBOARD FOLLOW-UP (analisi).
 *
 * GET /api/stats/followups/analysis?from=2026-10-01&to=2026-10-31[&consultant=Scala Rosario]
 *
 * Restituisce, in UNA richiesta, una riga compatta per ogni follow-up del
 * periodo (cliente, consulente, marca, esito, appuntamento, gli step con
 * esito e data, e il ciclo Recall Follow-up se c'e'). Tutti i conteggi
 * (chi risponde alla 1a / 2a chiamata, dopo WhatsApp o mail, per consulente,
 * per marchio, andamento...) li fa la pagina (dashboard-fu.js): cosi' i
 * clic sui grafici aprono l'elenco esatto dei clienti senza altre richieste.
 */
@RestController
@RequestMapping("/api/stats/followups/analysis")
public class FollowUpAnalyticsController {

    @Autowired private FollowUpRepository followUpRepository;
    @Autowired private FollowUpStepRepository followUpStepRepository;
    @Autowired private RecallFollowUpRepository recallFollowUpRepository;
    @Autowired private RecallFollowUpStepRepository recallFollowUpStepRepository;
    @Autowired private RolePermissionService rolePermissionService;

    @GetMapping
    public ResponseEntity<?> analysis(@RequestParam String from, @RequestParam String to,
                                      @RequestParam(required = false) String consultant, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!rolePermissionService.hasAtLeast(rolePermissionService.getEffectiveAccess(userId, role, "DASHBOARD"), "READ_ONLY")
                && !rolePermissionService.hasAtLeast(rolePermissionService.getEffectiveAccess(userId, role, "FOLLOWUPS"), "READ_ONLY"))
            return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        LocalDate dal = LocalDate.parse(from), al = LocalDate.parse(to);
        if (al.isBefore(dal)) { LocalDate t = dal; dal = al; al = t; }
        List<FollowUp> fus = followUpRepository.findByWorkDateBetween(dal, al).stream()
                .filter(f -> consultant == null || consultant.isBlank() || consultant.equals(f.getConsultantName()))
                .collect(Collectors.toList());
        if (fus.isEmpty()) return ResponseEntity.ok(Map.of("rows", List.of()));

        Map<Long, List<FollowUpStep>> steps = followUpStepRepository.findByFollowUpIn(fus).stream()
                .collect(Collectors.groupingBy(s -> s.getFollowUp().getId()));
        List<RecallFollowUp> rfus = recallFollowUpRepository.findByOriginalFollowUpIn(fus);
        Map<Long, RecallFollowUp> rfuByFu = rfus.stream().collect(Collectors.toMap(r -> r.getOriginalFollowUp().getId(), r -> r, (a, b) -> a));
        Map<Long, List<RecallFollowUpStep>> rSteps = rfus.isEmpty() ? Map.of()
                : recallFollowUpStepRepository.findByRecallFollowUpIn(rfus).stream().collect(Collectors.groupingBy(s -> s.getRecallFollowUp().getId()));

        List<Map<String, Object>> rows = new ArrayList<>();
        for (FollowUp f : fus) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", f.getId());
            m.put("workDate", f.getWorkDate().toString());
            m.put("consultant", f.getConsultantName());
            m.put("customer", f.getCustomer().getFullName());
            m.put("phone", f.getCustomer().getPhone());
            m.put("emailOnly", Boolean.TRUE.equals(f.getCustomer().getEmailOnly()));
            m.put("status", f.getStatus());
            m.put("appointment", Boolean.TRUE.equals(f.getHasAppointment()));
            m.put("marca", f.getMarca());
            m.put("modello", f.getModello());
            m.put("imported", Boolean.TRUE.equals(f.getImported()));
            m.put("steps", steps.getOrDefault(f.getId(), List.of()).stream()
                    .sorted(Comparator.comparingInt(FollowUpStep::getStepNumber))
                    .map(s -> {
                        Map<String, Object> sm = new LinkedHashMap<>();
                        sm.put("n", s.getStepNumber());
                        sm.put("channel", s.getChannel());
                        sm.put("outcome", s.getOutcome());
                        sm.put("at", s.getExecutedAt() != null ? s.getExecutedAt().toString() : null);
                        sm.put("by", s.getExecutedBy() != null ? s.getExecutedBy().getFullName() : null);
                        return sm;
                    }).collect(Collectors.toList()));
            RecallFollowUp r = rfuByFu.get(f.getId());
            if (r != null) {
                Map<String, Object> rm = new LinkedHashMap<>();
                rm.put("status", r.getStatus());
                rm.put("currentStep", r.getCurrentStep());
                // a quale step del Recall ha risposto (primo tentativo ANSWERED)
                rSteps.getOrDefault(r.getId(), List.of()).stream()
                        .filter(s -> "ANSWERED".equals(s.getOutcome()))
                        .min(Comparator.comparingInt(RecallFollowUpStep::getStepNumber))
                        .ifPresent(s -> rm.put("answeredStep", s.getStepNumber()));
                m.put("recall", rm);
            }
            rows.add(m);
        }
        return ResponseEntity.ok(Map.of("rows", rows));
    }
}
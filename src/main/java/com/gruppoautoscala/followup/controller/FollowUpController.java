package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.Customer;
import com.gruppoautoscala.followup.model.FollowUp;
import com.gruppoautoscala.followup.model.FollowUpStep;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.CustomerRepository;
import com.gruppoautoscala.followup.repository.FollowUpStepRepository;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.FollowUpService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/followups")
public class FollowUpController {

    @Autowired
    private FollowUpService followUpService;

    @Autowired
    private CustomerRepository customerRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FollowUpStepRepository followUpStepRepository;

    @GetMapping
    public ResponseEntity<?> getByDate(@RequestParam String date, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        LocalDate localDate = LocalDate.parse(date);
        List<FollowUp> followUps = followUpService.getByDate(localDate);
        return ResponseEntity.ok(followUps);
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        // Crea o recupera cliente
        Customer customer = new Customer();
        customer.setFullName((String) body.get("fullName"));
        customer.setEmail((String) body.get("email"));
        customer.setPhone((String) body.get("phone"));
        customer.setEmailOnly(Boolean.TRUE.equals(body.get("emailOnly")));
        customer = customerRepository.save(customer);

        // Recupera utente dalla sessione o dal body
        Long targetUserId = body.get("userId") != null ?
            Long.valueOf(body.get("userId").toString()) : userId;
        Optional<User> userOpt = userRepository.findById(targetUserId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));

        LocalDate workDate = LocalDate.parse((String) body.get("workDate"));
        FollowUp followUp = followUpService.createFollowUp(customer, userOpt.get(), workDate);
        return ResponseEntity.ok(followUp);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<FollowUp> followUp = followUpService.getById(id);
        return followUp.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/steps")
    public ResponseEntity<?> getSteps(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<FollowUp> followUp = followUpService.getById(id);
        if (followUp.isEmpty()) return ResponseEntity.notFound().build();
        List<FollowUpStep> steps = followUpStepRepository
                .findByFollowUpOrderByStepNumber(followUp.get());
        return ResponseEntity.ok(steps);
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
        if (body.containsKey("status")) followUp.setStatus((String) body.get("status"));
        if (body.containsKey("hasAppointment"))
            followUp.setHasAppointment(Boolean.TRUE.equals(body.get("hasAppointment")));
        return ResponseEntity.ok(followUpService.save(followUp));
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
        if (body.containsKey("executedAt"))
            step.setExecutedAt(java.time.LocalDateTime.now());
        return ResponseEntity.ok(followUpStepRepository.save(step));
    }
}
package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.model.WaitingEntry;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.WaitingListService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/waiting")
public class WaitingListController {

    @Autowired
    private WaitingListService waitingListService;

    @Autowired
    private UserRepository userRepository;

    @GetMapping
    public ResponseEntity<?> getAll(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        return ResponseEntity.ok(waitingListService.getAll());
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));
        BigDecimal price = null;
        if (body.get("price") != null && !body.get("price").toString().isEmpty()) {
            price = new BigDecimal(body.get("price").toString());
        }
        LocalDate recallDate = null;
        if (body.get("recallDate") != null && !body.get("recallDate").toString().isEmpty()) {
            recallDate = LocalDate.parse(body.get("recallDate").toString());
        }
        WaitingEntry entry = waitingListService.create(
            userOpt.get(),
            (String) body.get("fullName"),
            (String) body.get("contact"),
            (String) body.get("brand"),
            (String) body.get("model"),
            price,
            (String) body.get("notes"),
            recallDate
        );
        return ResponseEntity.ok(entry);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<WaitingEntry> entry = waitingListService.getById(id);
        return entry.map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id,
                                    @RequestBody Map<String, Object> body,
                                    HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<WaitingEntry> entryOpt = waitingListService.getById(id);
        if (entryOpt.isEmpty()) return ResponseEntity.notFound().build();
        WaitingEntry entry = entryOpt.get();
        if (body.containsKey("fullName")) entry.setFullName((String) body.get("fullName"));
        if (body.containsKey("contact")) entry.setContact((String) body.get("contact"));
        if (body.containsKey("brand")) entry.setBrand((String) body.get("brand"));
        if (body.containsKey("model")) entry.setModel((String) body.get("model"));
        if (body.containsKey("notes")) entry.setNotes((String) body.get("notes"));
        if (body.containsKey("status")) entry.setStatus((String) body.get("status"));
        if (body.containsKey("price") && body.get("price") != null) {
            entry.setPrice(new BigDecimal(body.get("price").toString()));
        }
        if (body.containsKey("recallDate")) {
            String rd = (String) body.get("recallDate");
            entry.setRecallDate(rd != null && !rd.isEmpty() ? LocalDate.parse(rd) : null);
        }
        entry.setUpdatedAt(java.time.LocalDateTime.now());
        return ResponseEntity.ok(waitingListService.update(entry));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        waitingListService.delete(id);
        return ResponseEntity.ok(Map.of("message", "Eliminato con successo"));
    }

    @GetMapping("/search")
    public ResponseEntity<?> search(@RequestParam String name, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        List<WaitingEntry> results = waitingListService.searchByName(name);
        return ResponseEntity.ok(results);
    }
}
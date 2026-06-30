package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.ContactLog;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.ContactLogService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/contacts")
public class ContactLogController {

    @Autowired
    private ContactLogService contactLogService;

    @Autowired
    private UserRepository userRepository;

    @GetMapping
    public ResponseEntity<?> getAll(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        List<ContactLog> logs;
        if (from != null && to != null) {
            LocalDateTime fromDt = LocalDateTime.parse(from + "T00:00:00");
            LocalDateTime toDt = LocalDateTime.parse(to + "T23:59:59");
            logs = contactLogService.getByDateRange(fromDt, toDt);
        } else {
            logs = contactLogService.getAll();
        }

        List<Map<String, Object>> result = logs.stream().map(log -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", log.getId());
            m.put("category", log.getCategory());
            m.put("otherNote", log.getOtherNote());
            m.put("nominativoAppuntamento", log.getNominativoAppuntamento());
            m.put("linkAppuntamento", log.getLinkAppuntamento());
            m.put("contactDate", log.getContactDate().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")));
            m.put("createdAt", log.getCreatedAt().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")));
            Map<String, Object> userMap = new HashMap<>();
            userMap.put("id", log.getUser().getId());
            userMap.put("fullName", log.getUser().getFullName());
            m.put("user", userMap);
            return m;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));

        String category = (String) body.get("category");
        String otherNote = (String) body.get("otherNote");
        String nominativoAppuntamento = (String) body.get("nominativoAppuntamento");
        String linkAppuntamento = (String) body.get("linkAppuntamento");
        LocalDateTime contactDate = body.get("contactDate") != null
            ? LocalDateTime.parse((String) body.get("contactDate"))
            : LocalDateTime.now();

        ContactLog log = contactLogService.create(userOpt.get(), category, otherNote,
                nominativoAppuntamento, linkAppuntamento, contactDate);

        Map<String, Object> result = new HashMap<>();
        result.put("id", log.getId());
        result.put("category", log.getCategory());
        result.put("otherNote", log.getOtherNote());
        result.put("nominativoAppuntamento", log.getNominativoAppuntamento());
        result.put("linkAppuntamento", log.getLinkAppuntamento());
        result.put("contactDate", log.getContactDate().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")));
        Map<String, Object> userMap = new HashMap<>();
        userMap.put("id", log.getUser().getId());
        userMap.put("fullName", log.getUser().getFullName());
        result.put("user", userMap);
        return ResponseEntity.ok(result);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id,
                                    @RequestBody Map<String, Object> body,
                                    HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        String role = (String) session.getAttribute("userRole");

        Optional<ContactLog> logOpt = contactLogService.getById(id);
        if (logOpt.isEmpty()) return ResponseEntity.notFound().build();

        ContactLog log = logOpt.get();
        if (!"ADMIN".equals(role) && !log.getUser().getId().equals(userId)) {
            return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        }

        if (body.containsKey("category")) log.setCategory((String) body.get("category"));
        if (body.containsKey("otherNote")) log.setOtherNote((String) body.get("otherNote"));
        if (body.containsKey("nominativoAppuntamento")) log.setNominativoAppuntamento((String) body.get("nominativoAppuntamento"));
        if (body.containsKey("linkAppuntamento")) log.setLinkAppuntamento((String) body.get("linkAppuntamento"));
        if (body.containsKey("contactDate")) {
            log.setContactDate(LocalDateTime.parse((String) body.get("contactDate")));
        }

        return ResponseEntity.ok(contactLogService.update(log));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        String role = (String) session.getAttribute("userRole");

        Optional<ContactLog> logOpt = contactLogService.getById(id);
        if (logOpt.isEmpty()) return ResponseEntity.notFound().build();

        ContactLog log = logOpt.get();
        if (!"ADMIN".equals(role) && !log.getUser().getId().equals(userId)) {
            return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        }

        contactLogService.delete(id);
        return ResponseEntity.ok(Map.of("message", "Eliminato"));
    }

    @GetMapping("/stats")
    public ResponseEntity<?> getStats(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        LocalDateTime fromDt = from != null ? LocalDateTime.parse(from + "T00:00:00") : null;
        LocalDateTime toDt = to != null ? LocalDateTime.parse(to + "T23:59:59") : null;

        return ResponseEntity.ok(contactLogService.getStats(fromDt, toDt));
    }
}
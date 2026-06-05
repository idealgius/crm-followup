package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.StatsService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/stats")
public class StatsController {

    @Autowired
    private StatsService statsService;

    @Autowired
    private UserRepository userRepository;

    @GetMapping("/followups")
    public ResponseEntity<?> getFollowUpStats(
            @RequestParam String from,
            @RequestParam String to,
            @RequestParam(required = false) Long userId,
            HttpSession session) {
        Long sessionUserId = (Long) session.getAttribute("userId");
        if (sessionUserId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        LocalDate fromDate = LocalDate.parse(from);
        LocalDate toDate = LocalDate.parse(to);
        User filterUser = null;
        if (userId != null) {
            Optional<User> userOpt = userRepository.findById(userId);
            filterUser = userOpt.orElse(null);
        }
        return ResponseEntity.ok(statsService.getFollowUpStats(fromDate, toDate, filterUser));
    }

    @GetMapping("/waiting")
    public ResponseEntity<?> getWaitingStats(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        return ResponseEntity.ok(statsService.getWaitingListStats());
    }
}
package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.service.StatsService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/stats")
public class StatsController {

    @Autowired
    private StatsService statsService;

    @GetMapping("/followups")
    public ResponseEntity<?> getFollowUpStats(
            @RequestParam String from,
            @RequestParam String to,
            @RequestParam(required = false) String consultant,
            HttpSession session) {
        Long sessionUserId = (Long) session.getAttribute("userId");
        if (sessionUserId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        LocalDate fromDate = LocalDate.parse(from);
        LocalDate toDate = LocalDate.parse(to);
        return ResponseEntity.ok(statsService.getFollowUpStats(fromDate, toDate, consultant));
    }

    @GetMapping("/followups/list")
    public ResponseEntity<?> getFollowUpList(
            @RequestParam String from,
            @RequestParam String to,
            @RequestParam(required = false) String consultant,
            @RequestParam(defaultValue = "all") String type,
            HttpSession session) {
        Long sessionUserId = (Long) session.getAttribute("userId");
        if (sessionUserId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        LocalDate fromDate = LocalDate.parse(from);
        LocalDate toDate = LocalDate.parse(to);
        return ResponseEntity.ok(statsService.getFollowUpList(fromDate, toDate, consultant, type));
    }

    @GetMapping("/calendar")
    public ResponseEntity<?> getCalendar(
            @RequestParam int year,
            @RequestParam int month,
            @RequestParam(required = false) String consultant,
            HttpSession session) {
        Long sessionUserId = (Long) session.getAttribute("userId");
        if (sessionUserId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        return ResponseEntity.ok(statsService.getCalendarData(year, month, consultant));
    }

    @GetMapping("/waiting")
    public ResponseEntity<?> getWaitingStats(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        return ResponseEntity.ok(statsService.getWaitingListStats());
    }
}

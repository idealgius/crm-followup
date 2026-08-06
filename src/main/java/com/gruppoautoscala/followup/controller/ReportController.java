package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.*;
import com.gruppoautoscala.followup.repository.FollowUpStepRepository;
import com.gruppoautoscala.followup.repository.RecallFollowUpStepRepository;
import com.gruppoautoscala.followup.repository.WaitingEntryRepository;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

// ===== REPORT GIORNALIERO =====
// Combina tre fonti in un'unica lista di "operazioni" ordinata per orario:
//  - FollowUpStep (esiti Follow-up: risponde/non risponde/inviato)
//  - WaitingEntry (Recall: richiamato)
//  - RecallFollowUpStep (Recall Follow-up: esiti dei tentativi)
// Filtrato sull'orario dell'AZIONE (executedAt/updatedAt), non sulla data
// di caricamento — un'azione fatta oggi conta oggi, anche se il record
// risale a qualche giorno fa.
@RestController
@RequestMapping("/api/report")
public class ReportController {

    @Autowired private FollowUpStepRepository followUpStepRepository;
    @Autowired private WaitingEntryRepository waitingEntryRepository;
    @Autowired private RecallFollowUpStepRepository recallFollowUpStepRepository;

    @GetMapping("/daily")
    public ResponseEntity<?> getDaily(@RequestParam(required = false) String from,
                                      @RequestParam(required = false) String to,
                                      HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        LocalDate today = LocalDate.now();
        LocalDate fromDate = (from != null && !from.isBlank()) ? LocalDate.parse(from) : today;
        LocalDate toDate = (to != null && !to.isBlank()) ? LocalDate.parse(to) : today;
        LocalDateTime start = fromDate.atStartOfDay();
        LocalDateTime end = toDate.atTime(23, 59, 59);

        List<Map<String, Object>> rows = new ArrayList<>();

        // NUOVO: query mirate sulla data (fatte fare al database, non più
        // findAll() + filtro in Java) — prima scaricavano l'INTERA tabella
        // ad ogni richiesta, il vero motivo del rallentamento notato.
        for (FollowUpStep s : followUpStepRepository.findByExecutedAtBetween(start, end)) {
            FollowUp fu = s.getFollowUp();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("tipo", "FOLLOW_UP");
            row.put("cliente", fu.getCustomer().getFullName());
            row.put("consulente", fu.getConsultantName());
            row.put("orario", s.getExecutedAt().toString());
            row.put("esito", formatEsito(s.getOutcome()));
            row.put("operatore", s.getExecutedBy() != null ? s.getExecutedBy().getFullName() : "—");
            rows.add(row);
        }

        // ===== RECALL (Waiting List) =====
        for (WaitingEntry e : waitingEntryRepository.findByUpdatedAtBetween(start, end)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("tipo", "RECALL");
            row.put("cliente", e.getFullName());
            // Il Recall non ha un campo consulente proprio: si usa
            // l'operatore che ha fatto l'ultima modifica.
            row.put("consulente", e.getLastModifiedBy() != null ? e.getLastModifiedBy().getFullName() : "—");
            row.put("orario", e.getUpdatedAt().toString());
            row.put("esito", e.isRichiamato() ? "Richiamato" : formatWaitingStatus(e.getStatus()));
            row.put("operatore", e.getLastModifiedBy() != null ? e.getLastModifiedBy().getFullName() : "—");
            rows.add(row);
        }

        // ===== RECALL FOLLOW-UP =====
        for (RecallFollowUpStep s : recallFollowUpStepRepository.findByExecutedAtBetween(start, end)) {
            FollowUp fu = s.getRecallFollowUp().getOriginalFollowUp();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("tipo", "RECALL_FOLLOW_UP");
            row.put("cliente", fu.getCustomer().getFullName());
            row.put("consulente", fu.getConsultantName());
            row.put("orario", s.getExecutedAt().toString());
            row.put("esito", formatEsito(s.getOutcome()));
            row.put("operatore", s.getExecutedBy() != null ? s.getExecutedBy().getFullName() : "—");
            rows.add(row);
        }

        rows.sort((a, b) -> ((String) b.get("orario")).compareTo((String) a.get("orario")));

        // Riepilogo per tipo, utile per il totale in alto.
        Map<String, Long> byType = rows.stream()
            .collect(Collectors.groupingBy(r -> (String) r.get("tipo"), Collectors.counting()));

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("rows", rows);
        response.put("total", rows.size());
        response.put("byType", byType);
        return ResponseEntity.ok(response);
    }

    private String formatEsito(String outcome) {
        if (outcome == null) return "—";
        return switch (outcome) {
            case "ANSWERED" -> "Risponde";
            case "NO_ANSWER" -> "Non risponde";
            case "SENT" -> "Inviato";
            case "SENT_WHATSAPP" -> "Inviato Whatsapp";
            case "SENT_MAIL" -> "Inviata mail";
            case "PENDING" -> "In attesa";
            default -> outcome;
        };
    }

    private String formatWaitingStatus(String status) {
        if (status == null) return "—";
        return switch (status) {
            case "WAITING" -> "In Attesa";
            case "CALLED" -> "Richiamati";
            case "APPOINTMENT" -> "Appuntamento";
            case "INTERESTED" -> "Interessati";
            case "CLOSED" -> "Chiusi";
            case "FAILED" -> "Falliti";
            default -> status;
        };
    }
}
package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

// ===== TENTATIVO DI RICONTATTO =====
// Una riga per ogni tentativo di uno step. Canali per step (fissi, come
// richiesto):
//   Step 1: tentativo 1 = CALL mattina, tentativo 2 = CALL pomeriggio
//   Step 2: tentativo 1 = CALL mattina, tentativo 2 = WHATSAPP pomeriggio
//   Step 3: tentativo 1 = CALL mattina, tentativo 2 = CALL pomeriggio
// Cliente "Solo Email": UN solo tentativo per step, canale EMAIL.
//
// outcome: PENDING | ANSWERED | NO_ANSWER
@Data
@Entity
@Table(name = "recall_followup_steps")
public class RecallFollowUpStep {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "recall_follow_up_id", nullable = false)
    private RecallFollowUp recallFollowUp;

    @Column(name = "step_number", nullable = false)
    private Integer stepNumber;

    @Column(name = "attempt_number", nullable = false)
    private Integer attemptNumber;

    @Column(nullable = false, length = 20)
    private String channel;

    @Column(name = "scheduled_slot", length = 10)
    private String scheduledSlot;

    // Data in cui questo step va lavorato — stessa per entrambi i
    // tentativi dello stesso step. Calcolata da RecallFollowUpService.
    @Column(name = "scheduled_date", nullable = false)
    private LocalDate scheduledDate;

    @Column(length = 20)
    private String outcome = "PENDING";

    @Column(name = "executed_at")
    private LocalDateTime executedAt;

    @ManyToOne
    @JoinColumn(name = "executed_by_id")
    private User executedBy;
}
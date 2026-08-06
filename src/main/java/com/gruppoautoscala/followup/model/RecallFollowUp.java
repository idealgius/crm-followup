package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

// ===== RECALL FOLLOW-UP =====
// Creato automaticamente quando un FollowUp diventa ABANDONED (solo se
// FollowUp.workDate >= 24/08/2026 — non retroattivo). Rappresenta il ciclo
// di ricontatto: parte dallo Step 1, avanza a Step 2 poi Step 3 (ognuno a
// 7 giorni dal precedente) se nessuno dei tentativi dello step corrente
// risponde, e si chiude come RISPOSTO (appena un tentativo qualsiasi
// risponde) o FALLITO (se anche lo Step 3 non risponde).
//
// status: IN_CORSO | RISPOSTO | FALLITO
@Data
@Entity
@Table(name = "recall_followups")
public class RecallFollowUp {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "original_follow_up_id", nullable = false)
    private FollowUp originalFollowUp;

    @Column(name = "current_step", nullable = false)
    private Integer currentStep = 1;

    @Column(nullable = false, length = 20)
    private String status = "IN_CORSO";

    // Flag "ha risposto" — si accende automaticamente appena un tentativo
    // viene segnato ANSWERED, ma resta anche modificabile a mano (es. il
    // cliente richiama direttamente, fuori dai tentativi programmati).
    @Column(nullable = false)
    private boolean responded = false;

    @Column(length = 1000)
    private String notes;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "closed_at")
    private LocalDateTime closedAt;
}
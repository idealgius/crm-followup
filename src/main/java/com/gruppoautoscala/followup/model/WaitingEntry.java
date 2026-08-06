package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@Entity
@Table(name = "waiting_list")
public class WaitingEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "full_name", nullable = false, length = 150)
    private String fullName;

    @Column(nullable = false, length = 255)
    private String contact;

    @Column(nullable = false, length = 100)
    private String brand;

    @Column(nullable = false, length = 100)
    private String model;

    @Column(precision = 12, scale = 2)
    private BigDecimal price;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(nullable = false, length = 20)
    private String status = "WAITING";

    @Column(name = "recall_date")
    private LocalDate recallDate;

    @Column(name = "richiamato", nullable = false)
    private boolean richiamato = false;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    private LocalDateTime updatedAt = LocalDateTime.now();

    // NUOVO: chi ha fatto l'ultima modifica (usato dal report giornaliero
    // come "operatore/consulente" per le righe Recall — questo modulo non
    // ha un campo consulente proprio come i Follow-up).
    @ManyToOne
    @JoinColumn(name = "last_modified_by_id")
    private User lastModifiedBy;

    // NUOVO: storico dei cicli di recall precedenti, popolato da
    // WaitingListService.registraNuovoRecall(). Ordine di visualizzazione
    // (più recente prima) gestito lato frontend.
    @OneToMany(mappedBy = "waitingEntry", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<WaitingRecallHistory> recallHistory = new ArrayList<>();
}
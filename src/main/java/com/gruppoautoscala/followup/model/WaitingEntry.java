package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

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

    // NUOVO: flag che indica se il recall corrente è stato effettuato.
    // Deve avere un valore di default esplicito (false) e non essere
    // nullable, altrimenti righe già esistenti nel database avrebbero
    // NULL e alcuni controlli booleani lato frontend (!e.richiamato)
    // si comporterebbero in modo incoerente tra record vecchi e nuovi.
    @Column(name = "richiamato", nullable = false)
    private boolean richiamato = false;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    private LocalDateTime updatedAt = LocalDateTime.now();
}
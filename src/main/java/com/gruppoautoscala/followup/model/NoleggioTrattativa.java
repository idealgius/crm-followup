package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "noleggio_trattative")
public class NoleggioTrattativa {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 100)
    private String nome;

    @Column(nullable = false, length = 100)
    private String cognome;

    @Column(length = 50)
    private String cellulare;

    @Column(length = 255)
    private String email;

    @Column(nullable = false, length = 100)
    private String marchio;

    @Column(length = 200)
    private String modello;

    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(length = 50)
    private String fonte;

    // SOLO_INFO | TRATTATIVA_IN_CORSO | DA_RICHIAMARE | CONCLUSA
    @Column(nullable = false, length = 30)
    private String stato = "SOLO_INFO";

    @Column(name = "data_richiamo")
    private LocalDate dataRichiamo;

    @Column(name = "link_leadspark", length = 500)
    private String linkLeadspark;

    @Column(name = "link_auto_richiesta", length = 500)
    private String linkAutoRichiesta;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();
}
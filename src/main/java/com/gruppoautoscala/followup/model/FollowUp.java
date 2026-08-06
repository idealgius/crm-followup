package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "follow_ups")
public class FollowUp {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "customer_id", nullable = false)
    private Customer customer;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "consultant_name", length = 150)
    private String consultantName;

    @Column(name = "work_date", nullable = false)
    private LocalDate workDate;

    @Column(nullable = false, length = 20)
    private String status = "IN_PROGRESS";

    @Column(name = "has_appointment", nullable = false)
    private Boolean hasAppointment = false;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    // NUOVO: chi ha modificato l'ultima volta il follow-up (stato,
    // consulente, nome cliente, appuntamento) e quando — "user" sopra resta
    // il CREATORE (non cambia mai dopo la creazione), questi due campi
    // invece si aggiornano ad ogni PATCH. Valorizzati dal controller.
    @ManyToOne
    @JoinColumn(name = "last_modified_by_id")
    private User lastModifiedBy;

    @Column(name = "last_modified_at")
    private LocalDateTime lastModifiedAt;

    // NUOVO: link alla trattativa (icona 📎 nel form di creazione),
    // riportato anche nelle schede Recall Follow-up derivate da questo
    // follow-up.
    @Column(name = "trattativa_link", length = 500)
    private String trattativaLink;
}
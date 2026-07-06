package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "promo_contacts")
public class PromoContact {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "contact_log_id")
    private ContactLog contactLog;

    @ManyToOne
    @JoinColumn(name = "promo_id")
    private Promo promo;

    @Column(name = "modello_richiesto", length = 200)
    private String modelloRichiesto;

    @Column(name = "richiesta_promo")
    private Boolean richiestaPromo;

    @Column(name = "proposta_promo")
    private Boolean propostaPromo;

    @Column(name = "test_drive")
    private Boolean testDrive;

    @Column(name = "appuntamento")
    private Boolean appuntamento;

    @Column(name = "sede_appuntamento", length = 100)
    private String sedeAppuntamento;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
}
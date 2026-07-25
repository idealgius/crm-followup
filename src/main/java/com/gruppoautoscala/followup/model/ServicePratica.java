package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "service_pratiche")
public class ServicePratica {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Operatore che ha creato la pratica (come "user" in NoleggioTrattativa)
    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 100)
    private String nome;

    @Column(nullable = false, length = 100)
    private String cognome;

    @Column(nullable = false, length = 50)
    private String cellulare;

    @Column(length = 255)
    private String email;

    @Column(nullable = false, length = 100)
    private String marca;

    @Column(length = 200)
    private String modello;

    @Column(length = 20)
    private String targa;

    // Agnano | Salerno
    @Column(length = 50)
    private String sede;

    // Tagliando | Dispositivo satellitare | Prenotazione | Lavorazione in corso |
    // Doctor Glass | Cambio Gomme | Altro — riportato dal contatto di origine, se presente
    @Column(name = "tipologia_service", length = 100)
    private String tipologiaService;

    @Column(length = 1000)
    private String note;

    // SOLO_INFO | IN_CONTATTO | ORDINE_RICAMBIO | APPUNTAMENTO | PROBLEMATICA | FALLITA | CONCLUSA
    @Column(nullable = false, length = 30)
    private String stato = "SOLO_INFO";

    @Column(name = "note_fallimento", length = 1000)
    private String noteFallimento;

    @Column(name = "note_conclusa", length = 1000)
    private String noteConclusa;

    @Column(name = "note_problematica", length = 1000)
    private String noteProblematica;

    // ===== Flusso ORDINE RICAMBIO =====
    // Data in cui è stato ordinato il ricambio/accessorio — usata per calcolare
    // il popup "è arrivato?" a 7 giorni lavorativi di distanza.
    @Column(name = "data_ordine_ricambio")
    private LocalDate dataOrdineRicambio;

    // null = non ancora risposto | true = arrivato | false = "rimanda" (si richiede di nuovo)
    @Column(name = "ricambio_arrivato")
    private Boolean ricambioArrivato;

    // Se true, il popup "è arrivato?" è stato rimandato e va riproposto al giorno
    // lavorativo successivo invece che scomparire.
    @Column(name = "ricambio_alert_rimandato_al")
    private LocalDate ricambioAlertRimandatoAl;

    // ===== Flusso APPUNTAMENTO =====
    @Column(name = "data_appuntamento")
    private LocalDateTime dataAppuntamento;

    // null (in attesa) | RITIRATO | DISDETTO | NON_PRESENTATO | RICHIAMATO_NUOVO_APPUNTAMENTO
    @Column(name = "esito_appuntamento", length = 40)
    private String esitoAppuntamento;

    // Storico appuntamenti precedenti (se il cliente viene richiamato più volte
    // per una nuova data), salvato come JSON semplice — stesso pattern usato per
    // recallHistory in Waiting/Recall. Es: [{"data":"2026-08-01T10:00:00","esito":"DISDETTO"}]
    @Column(name = "storico_appuntamenti", columnDefinition = "TEXT")
    private String storicoAppuntamenti;

    // ===== Gestione (chi ha preso in carico) — stesso pattern di gestitoDa in Rent =====
    @ManyToOne
    @JoinColumn(name = "gestito_da_id")
    private User gestitoDa;

    @Column(name = "gestito_at")
    private LocalDateTime gestitoAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
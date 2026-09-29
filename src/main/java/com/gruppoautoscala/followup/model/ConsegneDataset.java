package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * AREA CONSEGNE — ultimo dato caricato per ciascuna fonte.
 * Una riga per fonte (chiave "tipo"):
 *  - TRATTATIVE: ultimo CSV trattative importato dal gestionale, gia' ridotto
 *    nel browser alle sole colonne necessarie (niente telefoni, email, CF),
 *    salvato come JSON.
 *  - DATABASE:   ultima lettura della scheda DATABASE del foglio Google
 *    "AVANZAMENTO 2026" (via Apps Script), salvata come CSV.
 * Ogni nuovo import/lettura sostituisce il precedente: tutti gli utenti
 * vedono sempre l'ultimo.
 */
@Data
@Entity
@Table(name = "consegne_dataset")
public class ConsegneDataset {

    @Id
    @Column(length = 30)
    private String tipo;

    @Column(columnDefinition = "TEXT")
    private String contenuto;

    @Column(name = "righe")
    private Integer righe;

    @Column(name = "aggiornato_at")
    private LocalDateTime aggiornatoAt;

    @Column(name = "aggiornato_da", length = 150)
    private String aggiornatoDa;
}
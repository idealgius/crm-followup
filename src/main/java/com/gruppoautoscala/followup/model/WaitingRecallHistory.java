package com.gruppoautoscala.followup.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDate;

// ===== STORICO RECALL PRECEDENTI =====
// Una riga per ogni ciclo di recall archiviato: quando si "Registra Nuovo
// Recall", il recall ATTUALE (data + stato + nota) viene salvato qui prima
// di essere sovrascritto con la nuova data.
@Data
@Entity
@Table(name = "waiting_recall_history")
public class WaitingRecallHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // @JsonIgnore: senza questo, serializzare WaitingEntry.recallHistory
    // andrebbe in loop infinito (questa riga -> waitingEntry -> di nuovo
    // la sua recallHistory -> ...).
    @ManyToOne
    @JoinColumn(name = "waiting_entry_id", nullable = false)
    @JsonIgnore
    private WaitingEntry waitingEntry;

    @Column(nullable = false)
    private LocalDate data;

    @Column(length = 20)
    private String esito;

    @Column(length = 1000)
    private String note;
}
package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

// Storico dei cambi di stato di un PreventivoTelefonico: una riga per ogni
// transizione (GENERATO -> TRATTATIVA_GENERATA -> CHIUSA, ecc.), con chi
// ha fatto il cambio e quando. Stesso schema gia' usato per
// WaitingRecallHistory. Serve a rispondere a "data e orario anche di ogni
// modifica", non solo dell'ultima.
@Data
@Entity
@Table(name = "preventivo_telefonico_status_history")
public class PreventivoTelefonicoStatusHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "preventivo_id", nullable = false)
    private PreventivoTelefonico preventivo;

    @Column(nullable = false, length = 30)
    private String status;

    @ManyToOne
    @JoinColumn(name = "changed_by_id", nullable = false)
    private User changedBy;

    @Column(name = "changed_at")
    private LocalDateTime changedAt = LocalDateTime.now();
}
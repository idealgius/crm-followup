package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

// Una riga per ogni import CSV lead eseguito — non i dettagli riga per
// riga (quelli restano solo nella risposta del momento, non persistiti),
// solo il riepilogo aggregato: chi ha importato, quando, e i 4 contatori
// mostrati nel popup "Risultato Import Lead".
@Data
@Entity
@Table(name = "preventivo_import_log")
public class PreventivoImportLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "file_name", length = 255)
    private String fileName;

    @ManyToOne
    @JoinColumn(name = "imported_by_id", nullable = false)
    private User importedBy;

    @Column(name = "imported_at", nullable = false)
    private LocalDateTime importedAt = LocalDateTime.now();

    @Column(nullable = false)
    private Integer creati = 0;

    @Column(nullable = false)
    private Integer aggiornati = 0;

    @Column(nullable = false)
    private Integer invariati = 0;

    @Column(name = "num_errori", nullable = false)
    private Integer numErrori = 0;
}
package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDate;

// ===== LAVORAZIONE TECNICA SCELTA PER UNA SCHEDA =====
// Una riga per ogni voce selezionata in "Lavorazioni da effettuare".
//
// tipo (validato nel controller): TAGLIANDO, LOJACK, BLOCKSHAFT,
//   POLIZZA_FIR, IMMATRICOLAZIONE, IMMATRICOLAZIONE_ESTERA, PASSAGGIO,
//   SOSTITUZIONE_PNEUMATICI, BULLONI_ANTIFURTO, METASYSTEM,
//   RETROCAMERA_POSTERIORE, LAVORAZIONE_CARROZZERIA, LAVAGGIO,
//   ALTRA_LAVORAZIONE
//
// dettaglio: usato solo da alcuni tipi —
//   PASSAGGIO -> "24" | "36" | "48" | "60" (mesi)
//   BULLONI_ANTIFURTO -> "OMAGGIO" | "PAGATI"
//   altrimenti null
//
// note: testo libero, usato solo da LAVORAZIONE_CARROZZERIA e
//   ALTRA_LAVORAZIONE (come richiesto)
@Data
@Entity
@Table(name = "veicoli_lavorazioni")
public class VeicoloLavorazione {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "veicolo_consegna_id", nullable = false)
    private VeicoloConsegna veicoloConsegna;

    @Column(nullable = false, length = 40)
    private String tipo;

    @Column(length = 20)
    private String dettaglio;

    @Column(length = 1000)
    private String note;

    @Column(nullable = false)
    private boolean completata = false;

    @Column(name = "data_completamento")
    private LocalDate dataCompletamento;
}
package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

// ===== STATO BUROCRATICO ATTIVATO PER UNA SCHEDA =====
// Una riga per ogni stato selezionato — a differenza di un singolo campo
// "stato attuale", qui più stati possono coesistere e restare TUTTI
// visibili con la loro data (come richiesto: "diverse voci in corso
// d'opera che dovranno essere mostrate tutte con le varie date").
//
// tipo (validato nel controller, e nel frontend filtrato in base a
// metodoPagamento della scheda — es. niente "Richiesta pratica leasing"
// se il pagamento è in unica soluzione):
//   RICHIESTA_PRATICA_FINANZIAMENTO, RICHIESTA_PRATICA_LEASING,
//   ATTESA_SALDO, PRATICA_FINANZIAMENTO_AVVIATA, PRATICA_LEASING_AVVIATA,
//   IN_ATTESA_LAVORAZIONE, IN_LAVORAZIONE, PERMESSINO_PRONTO,
//   LIBRETTO_PRONTO, LIBRETTO_IN_SEDE, TARGHE_IN_SEDE,
//   PRONTA_PER_CONSEGNA, APPUNTAMENTO_CONSEGNA_FISSATO
@Data
@Entity
@Table(name = "veicoli_stati_log")
public class VeicoloStatoLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "veicolo_consegna_id", nullable = false)
    private VeicoloConsegna veicoloConsegna;

    @Column(nullable = false, length = 40)
    private String tipo;

    @Column(nullable = false)
    private LocalDate data;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
}
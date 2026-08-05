package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

// ===== SCHEDA VEICOLO IN CONSEGNA =====
// Sostituisce il tracciamento manuale su Excel (PRATICHE IN CORSO /
// CONSEGNATE / ANNULLATE / CALENDARIO CONSEGNE). Il ciclo di vita è
// governato da statoPratica: IN_CORSO -> CONSEGNATA oppure ANNULLATA.
//
// Costanti valide (validate nel controller, stesso approccio già usato per
// ACQUISTO_TIPI in contact.js / ExcelExportService):
//
// sedeConsegna / ubicazioneIniziale: AGNANO, CASAMARCIANO, SALERNO,
//   + per sedeConsegna: CONSEGNA_CLIENTE
//   + per ubicazioneIniziale: ALTRO (con ubicazioneAltroNote)
//
// metodoPagamento: UNICA_SOLUZIONE, FINANZIAMENTO_ANTICIPO,
//   FINANZIAMENTO_MAXIRATA, FINANZIAMENTO_ANTICIPO_MAXIRATA, LEASING
//
// finanziaria (solo se metodoPagamento è uno dei FINANZIAMENTO_*):
//   COMPASS, DEUTSCHE_BANK, CA_BANK, SANTANDER, AGOS, STELLANTIS,
//   MOBILIZE_RENAULT, MOBILIZE_DACIA, FIN_FIAT
// finanziaria (solo se metodoPagamento è LEASING):
//   SANTANDER_LEASING, CA_BANK_LEASING
//
// tipoPermutaRottamazione: NESSUNA, PERMUTA, ROTTAMAZIONE
//
// statoPratica: IN_CORSO, CONSEGNATA, ANNULLATA
@Data
@Entity
@Table(name = "veicoli_consegna")
public class VeicoloConsegna {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Chi ha creato la scheda — usato anche dal sistema permessi per
    // distinguere "record di un ADMIN" (richiede ADMIN_FULL per essere
    // toccato), stesso criterio di tutte le altre sezioni.
    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 20)
    private String targa;

    @Column(nullable = false, length = 100)
    private String marchio;

    @Column(nullable = false, length = 150)
    private String modello;

    @Column(nullable = false, length = 150)
    private String intestatario;

    @Column(name = "numero_cliente", length = 50)
    private String numeroCliente;

    @Column(name = "consulente_riferimento", length = 150)
    private String consulenteRiferimento;

    // ===== PERMUTA / ROTTAMAZIONE =====
    @Column(name = "tipo_permuta_rottamazione", length = 20)
    private String tipoPermutaRottamazione = "NESSUNA";

    @Column(name = "marchio_permuta", length = 100)
    private String marchioPermuta;

    @Column(name = "modello_permuta", length = 150)
    private String modelloPermuta;

    @Column(name = "valore_permuta", precision = 12, scale = 2)
    private BigDecimal valorePermuta;

    // ===== SEDI =====
    @Column(name = "sede_consegna", nullable = false, length = 30)
    private String sedeConsegna;

    @Column(name = "ubicazione_iniziale", nullable = false, length = 30)
    private String ubicazioneIniziale;

    @Column(name = "ubicazione_altro_note", length = 255)
    private String ubicazioneAltroNote;

    // ===== PAGAMENTO =====
    @Column(name = "metodo_pagamento", nullable = false, length = 40)
    private String metodoPagamento;

    // Solo per UNICA_SOLUZIONE
    @Column(name = "anticipo_presente")
    private Boolean anticipoPresente;

    @Column(name = "importo_anticipo", precision = 12, scale = 2)
    private BigDecimal importoAnticipo;

    // Solo per i metodi FINANZIAMENTO_* / LEASING
    @Column(length = 40)
    private String finanziaria;

    // ===== CICLO DI VITA =====
    @Column(name = "stato_pratica", nullable = false, length = 20)
    private String statoPratica = "IN_CORSO";

    @Column(name = "data_appuntamento_consegna")
    private LocalDate dataAppuntamentoConsegna;

    @Column(name = "ora_appuntamento_consegna", length = 5)
    private String oraAppuntamentoConsegna;

    @Column(name = "data_consegna_effettiva")
    private LocalDateTime dataConsegnaEffettiva;

    @Column(name = "data_annullamento")
    private LocalDateTime dataAnnullamento;

    @Column(name = "motivo_annullamento", length = 500)
    private String motivoAnnullamento;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();

    // ===== CHECKLIST FIGLIE =====
    @OneToMany(mappedBy = "veicoloConsegna", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<VeicoloLavorazione> lavorazioni = new ArrayList<>();

    @OneToMany(mappedBy = "veicoloConsegna", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<VeicoloStatoLog> statiLog = new ArrayList<>();
}
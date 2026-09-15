package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

// Rappresenta sia i preventivi telefonici di VENDITA che quelli di
// NOLEGGIO: un'unica tabella con il campo "tipo" a distinguerli, cosi'
// i grafici aggregati (per operatore, per consulente, per marca) non
// devono unire due tabelle diverse. Le due sezioni Vendita/Noleggio a
// schermo sono solo un filtro visivo sul campo "tipo".
//
// Valori ammessi per tipo: "VENDITA", "NOLEGGIO"
// Valori ammessi per status:
//   GENERATO             -> stato iniziale, appena creato
//   NON_RISPONDE         -> cliente non risponde (fallito, terminale)
//   TRATTATIVA_GENERATA  -> passato in trattativa
//   CHIUSA               -> trattativa chiusa (terminale)
//   FALLITA               -> trattativa fallita (terminale)
@Data
@Entity
@Table(name = "preventivi_telefonici")
public class PreventivoTelefonico {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String tipo;

    @Column(name = "cliente_nome", nullable = false, length = 150)
    private String clienteNome;

    @Column(name = "cliente_cognome", nullable = false, length = 150)
    private String clienteCognome;

    @Column(nullable = false, length = 100)
    private String marca;

    @Column(nullable = false, length = 150)
    private String modello;

    // Opzionale: targa o telaio, campo libero unico (l'utente inserisce
    // l'uno o l'altro).
    @Column(name = "targa_telaio", length = 50)
    private String targaTelaio;

    // Obbligatorio: link alla lead di origine.
    @Column(name = "link_lead", nullable = false, length = 500)
    private String linkLead;

    // Come consultantName in FollowUp: stringa semplice, non FK, valorizzata
    // dalla stessa tendina consulenti usata nei Follow-up.
    @Column(name = "consultant_name", nullable = false, length = 150)
    private String consultantName;

    @Column(nullable = false, length = 30)
    private String status = "GENERATO";

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();

    @ManyToOne
    @JoinColumn(name = "last_modified_by_id")
    private User lastModifiedBy;

    @Column(name = "last_modified_at")
    private LocalDateTime lastModifiedAt;
}
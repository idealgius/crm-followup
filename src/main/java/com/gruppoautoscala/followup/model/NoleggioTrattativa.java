package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

@Data
@Entity
@Table(name = "noleggio_trattative")
public class NoleggioTrattativa {

    // Fuso orario fisso per garantire l'orario locale italiano indipendentemente
    // da dove è ospitato il server (es. server in UTC su cloud estero).
    private static final ZoneId ZONA_ITALIA = ZoneId.of("Europe/Rome");

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // ===== GESTIONE ALLERT "DA GESTIRE" =====
    // Popolato SOLO quando qualcuno (ruolo NOLEGGIO, o MODERATORE/GESTORE/ADMIN)
    // clicca "Gestisci" su una trattativa creata da un operatore che NON ha
    // ruolo NOLEGGIO. Finché è null e il creatore (user) non ha ruolo NOLEGGIO,
    // la trattativa mostra l'allert "Da Gestire" in lista. Una volta valorizzato,
    // l'allert sparisce e la trattativa risulta filtrabile anche per questo
    // operatore. Non serve un campo di stato separato: la condizione si calcola
    // sempre a partire da user.getRole() e gestitoDa.
    @ManyToOne
    @JoinColumn(name = "gestito_da_id")
    private User gestitoDa;

    @Column(nullable = false, length = 100)
    private String nome;

    @Column(nullable = false, length = 100)
    private String cognome;

    @Column(length = 50)
    private String cellulare;

    @Column(length = 255)
    private String email;

    @Column(nullable = false, length = 100)
    private String marchio;

    @Column(length = 200)
    private String modello;

    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(length = 50)
    private String fonte;

    // SOLO_INFO | TRATTATIVA_IN_CORSO | DA_RICHIAMARE | CONCLUSA | FALLITO
    @Column(nullable = false, length = 30)
    private String stato = "SOLO_INFO";

    @Column(name = "data_richiamo")
    private LocalDate dataRichiamo;

    // Popolato solo quando stato = FALLITO, opzionale
    @Column(name = "note_fallimento", columnDefinition = "TEXT")
    private String noteFallimento;

    // Privato | Partita IVA | Noleggio per aziende
    @Column(name = "tipo_cliente", length = 30)
    private String tipoCliente;

    @Column(name = "link_leadspark", length = 500)
    private String linkLeadspark;

    @Column(name = "link_auto_richiesta", length = 500)
    private String linkAutoRichiesta;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now(ZONA_ITALIA);

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now(ZONA_ITALIA);

    // ===== NUOVO: collegamento con Preventivi Telefonici =====
    // Valorizzato SOLO quando la trattativa e' stata generata automaticamente
    // da un Preventivo Telefonico di tipo NOLEGGIO (mai per le trattative
    // create a mano da questa sezione). Chiave usata per trovare/aggiornare
    // la stessa trattativa ad ogni sync, invece di duplicarla.
    @Column(name = "source_preventivo_id", unique = true)
    private Long sourcePreventivoId;

    // Timestamp dell'ULTIMA sincronizzazione automatica scritta da un
    // Preventivo Telefonico (creazione, import, o cambio stato manuale sul
    // preventivo). Confrontato con updatedAt per capire se qualcuno ha
    // modificato la trattativa DENTRO Rent dopo quel momento — in tal caso
    // il Preventivo Telefonico mostra l'avviso "Modificato in Rent".
    @Column(name = "last_auto_sync_at")
    private LocalDateTime lastAutoSyncAt;
}
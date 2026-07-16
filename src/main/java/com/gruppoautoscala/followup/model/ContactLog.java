package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "contact_logs")
public class ContactLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 50)
    private String category;

    @Column(name = "cliente_nome", length = 100)
    private String clienteNome;

    @Column(name = "cliente_cognome", length = 100)
    private String clienteCognome;

    @Column(name = "cliente_numero", length = 50)
    private String clienteNumero;

    @Column(name = "non_comunica_nominativo")
    private Boolean nonComunicaNominativo = false;

    @Column(name = "other_note", length = 500)
    private String otherNote;

    @Column(name = "nominativo_appuntamento", length = 200)
    private String nominativoAppuntamento;

    @Column(name = "link_appuntamento", length = 500)
    private String linkAppuntamento;

    @Column(name = "marca", length = 100)
    private String marca;

    @Column(name = "modello", length = 200)
    private String modello;

    @Column(name = "link_auto", length = 500)
    private String linkAuto;

    @Column(name = "service_tipo", length = 100)
    private String serviceTipo;

    @Column(name = "service_note", length = 500)
    private String serviceNote;

    @Column(name = "service_sede", length = 50)
    private String serviceSede;

    @Column(name = "acquisto_note", length = 500)
    private String acquistoNote;

    // ===== ALLERT — Info Acquisto effettuato =====
    // acquistoAlert: true se l'operatore ha segnalato una problematica in fase di inserimento
    @Column(name = "acquisto_alert")
    private Boolean acquistoAlert = false;

    // acquistoAlertStatus: null (non gestita) | "IN_GESTIONE" | "GESTITA"
    @Column(name = "acquisto_alert_status", length = 20)
    private String acquistoAlertStatus;

    @Column(name = "acquisto_alert_note_gestione", length = 1000)
    private String acquistoAlertNoteGestione;

    @Column(name = "acquisto_alert_note_gestita", length = 1000)
    private String acquistoAlertNoteGestita;

    // ===== NUOVO: chi ha messo "in gestione" e quando =====
    // Relazione verso User (non stringa libera) cosi il frontend riceve un
    // oggetto {id, fullName, role} coerente con com'e' gia' fatto per
    // gestitoDa in NoleggioTrattativa. Valorizzati automaticamente dal
    // controller quando arriva il cambio di stato via PATCH.
    @ManyToOne
    @JoinColumn(name = "acquisto_alert_in_gestione_da_id")
    private User acquistoAlertInGestioneDa;

    @Column(name = "acquisto_alert_in_gestione_at")
    private LocalDateTime acquistoAlertInGestioneAt;

    // ===== NUOVO: chi ha messo "gestita" e quando =====
    @ManyToOne
    @JoinColumn(name = "acquisto_alert_gestita_da_id")
    private User acquistoAlertGestitaDa;

    @Column(name = "acquisto_alert_gestita_at")
    private LocalDateTime acquistoAlertGestitaAt;

    @Column(name = "noleggio_tipo", length = 50)
    private String noleggioTipo;

    @Column(name = "noleggio_link", length = 500)
    private String noleggioLink;

    @Column(name = "service_nome_cliente", length = 100)
    private String serviceNomeCliente;

    @Column(name = "service_cognome_cliente", length = 100)
    private String serviceCognomeCliente;

    @Column(name = "service_targa", length = 20)
    private String serviceTarga;

    @Column(name = "service_tipo_cliente", length = 20)
    private String serviceTipoCliente;

    @Column(name = "service_numero_telefono", length = 50)
    private String serviceNumeroTelefono;

    @Column(name = "noleggio_richiesta", length = 30)
    private String noleggioRichiesta;

    @Column(name = "noleggio_nome_cliente", length = 100)
    private String noleggioNomeCliente;

    @Column(name = "noleggio_cognome_cliente", length = 100)
    private String noleggioCognomeCliente;

    @Column(name = "noleggio_cellulare", length = 50)
    private String noleggioCellulare;

    @Column(name = "contact_date", nullable = false)
    private LocalDateTime contactDate;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
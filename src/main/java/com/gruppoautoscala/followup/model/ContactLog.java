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

    @Column(name = "acquisto_note", length = 500)
    private String acquistoNote;

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

    @Column(name = "contact_date", nullable = false)
    private LocalDateTime contactDate;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
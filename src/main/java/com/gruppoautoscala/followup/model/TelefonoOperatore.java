package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;

// ===== MAPPATURA INTERNO TELEFONICO -> OPERATORE =====
// Una riga per ogni telefono Yealink fisico: a quale interno risponde e a
// quale utente del CRM appartiene. Usata da TelefoniaController per sapere
// a CHI mandare l'avviso "chiamata in arrivo" quando il telefono chiama
// l'Action URL.
@Data
@Entity
@Table(name = "telefoni_operatore", uniqueConstraints = @UniqueConstraint(columnNames = "interno"))
public class TelefonoOperatore {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String interno;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
}
package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;

// ===== GESTIONE PERMESSI PER OPERATORE =====
// Override individuale, impostato dall'admin sul singolo utente, che si
// aggiunge sopra il permesso del suo ruolo (RolePermission). Se per un
// utente esiste una riga qui per una data sezione, questa VINCE SEMPRE sul
// permesso del ruolo per quella sezione (override totale, non un'eccezione
// parziale in un senso o nell'altro). Se non esiste nessuna riga per la
// coppia utente/sezione, si applica normalmente il permesso di ruolo.
//
// Stessi 4 valori di access di RolePermission: NONE, READ_ONLY, FULL,
// ADMIN_FULL — vedi i commenti su RolePermission per il significato.
@Data
@Entity
@Table(name = "user_permissions", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "section"}))
public class UserPermission {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 30)
    private String section;

    @Column(nullable = false, length = 20)
    private String access;
}
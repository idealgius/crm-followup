package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;

// ===== GESTIONE PERMESSI PER RUOLO =====
// Ogni riga rappresenta la personalizzazione, fatta dall'admin, dell'accesso
// di UN ruolo a UNA sezione del CRM. Se per una coppia ruolo/sezione non
// esiste nessuna riga qui, si applica il comportamento di default storico
// dell'app (vedi RolePermissionService.DEFAULT_ACCESS) — quindi finché
// nessun admin tocca nulla in questa nuova pagina, il comportamento resta
// identico a quello di sempre per tutti.
//
// access può essere:
//  - "NONE"      -> il ruolo non vede la sezione per niente (nascosta da
//                    navbar e bloccata anche a livello di navigazione)
//  - "READ_ONLY" -> il ruolo vede la sezione e i suoi dati, ma i pulsanti di
//                    creazione/modifica/eliminazione risultano bloccati
//  - "FULL"      -> accesso pieno, esattamente come oggi
@Data
@Entity
@Table(name = "role_permissions", uniqueConstraints = @UniqueConstraint(columnNames = {"role", "section"}))
public class RolePermission {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 30)
    private String role;

    @Column(nullable = false, length = 30)
    private String section;

    @Column(nullable = false, length = 20)
    private String access;
}
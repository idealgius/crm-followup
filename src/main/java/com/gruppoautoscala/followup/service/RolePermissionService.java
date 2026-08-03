package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.RolePermission;
import com.gruppoautoscala.followup.repository.RolePermissionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.*;

@Service
public class RolePermissionService {

    @Autowired
    private RolePermissionRepository rolePermissionRepository;

    // Tutti i ruoli e tutte le sezioni gestibili — usati sia per validare gli
    // input sia per costruire la matrice completa (ogni ruolo × ogni sezione,
    // anche quelle senza nessuna riga salvata nel database).
    public static final List<String> ROLES = List.of(
        "UTENTE", "BACK_OFFICE", "MODERATORE", "GESTORE", "ADMIN", "NOLEGGIO", "SERVICE"
    );
    public static final List<String> SECTIONS = List.of(
        "DASHBOARD", "FOLLOWUPS", "WAITING", "CONTACTS", "PROMO", "ADMIN", "RENT", "SERVICE", "GRAFICI"
    );
    public static final List<String> ACCESS_LEVELS = List.of("NONE", "READ_ONLY", "FULL");

    // ===== DEFAULT STORICI =====
    // Riproducono ESATTAMENTE il comportamento hardcoded che c'era in app.js
    // prima di questa funzionalità (RENT_ROLES, SERVICE_ROLES, canSeeAll,
    // ecc.) — finché l'admin non personalizza nulla nella nuova pagina
    // Permessi, il comportamento per ogni ruolo resta identico a quello di
    // sempre. Qualunque combinazione non elencata qui sotto è "NONE".
    private static final Map<String, Map<String, String>> DEFAULTS = new HashMap<>();
    static {
        DEFAULTS.put("UTENTE", Map.of("CONTACTS", "FULL"));
        DEFAULTS.put("BACK_OFFICE", Map.of("CONTACTS", "FULL"));
        DEFAULTS.put("MODERATORE", Map.of(
            "DASHBOARD", "FULL", "FOLLOWUPS", "FULL", "WAITING", "FULL",
            "CONTACTS", "FULL", "PROMO", "FULL", "RENT", "FULL", "SERVICE", "FULL",
            "GRAFICI", "FULL"
        ));
        DEFAULTS.put("GESTORE", Map.of(
            "DASHBOARD", "FULL", "FOLLOWUPS", "FULL", "WAITING", "FULL",
            "CONTACTS", "FULL", "PROMO", "FULL", "RENT", "FULL", "SERVICE", "FULL",
            "ADMIN", "FULL", "GRAFICI", "FULL"
        ));
        DEFAULTS.put("ADMIN", Map.of(
            "DASHBOARD", "FULL", "FOLLOWUPS", "FULL", "WAITING", "FULL",
            "CONTACTS", "FULL", "PROMO", "FULL", "RENT", "FULL", "SERVICE", "FULL",
            "ADMIN", "FULL", "GRAFICI", "FULL"
        ));
        DEFAULTS.put("NOLEGGIO", Map.of("RENT", "FULL"));
        DEFAULTS.put("SERVICE", Map.of("SERVICE", "FULL"));
    }

    private String defaultAccess(String role, String section) {
        return DEFAULTS.getOrDefault(role, Map.of()).getOrDefault(section, "NONE");
    }

    // Matrice completa ruolo × sezione: parte dai default storici sopra, poi
    // sovrascrive con qualunque riga effettivamente salvata dall'admin nel
    // database. Restituita al frontend sia per la pagina Permessi (mostra
    // tutto), sia per applyRolePermissions/showPage (che ne usano solo la
    // riga del ruolo dell'utente loggato).
    public Map<String, Map<String, String>> getEffectiveMatrix() {
        Map<String, Map<String, String>> matrix = new LinkedHashMap<>();
        for (String role : ROLES) {
            Map<String, String> row = new LinkedHashMap<>();
            for (String section : SECTIONS) {
                row.put(section, defaultAccess(role, section));
            }
            matrix.put(role, row);
        }
        for (RolePermission rp : rolePermissionRepository.findAll()) {
            if (matrix.containsKey(rp.getRole()) && matrix.get(rp.getRole()).containsKey(rp.getSection())) {
                matrix.get(rp.getRole()).put(rp.getSection(), rp.getAccess());
            }
        }
        return matrix;
    }

    // Upsert: crea o aggiorna la riga per quella coppia ruolo/sezione. Se il
    // nuovo valore coincide col default storico, la riga viene comunque
    // salvata (più semplice e trasparente che "eliminare per tornare al
    // default" — l'admin vede sempre esplicitamente cosa ha impostato).
    public void setAccess(String role, String section, String access) {
        if (!ROLES.contains(role)) throw new IllegalArgumentException("Ruolo non valido");
        if (!SECTIONS.contains(section)) throw new IllegalArgumentException("Sezione non valida");
        if (!ACCESS_LEVELS.contains(access)) throw new IllegalArgumentException("Livello di accesso non valido");

        RolePermission rp = rolePermissionRepository.findByRoleAndSection(role, section)
            .orElseGet(RolePermission::new);
        rp.setRole(role);
        rp.setSection(section);
        rp.setAccess(access);
        rolePermissionRepository.save(rp);
    }
}
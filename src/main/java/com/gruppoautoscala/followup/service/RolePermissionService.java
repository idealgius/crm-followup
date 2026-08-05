package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.RolePermission;
import com.gruppoautoscala.followup.model.UserPermission;
import com.gruppoautoscala.followup.repository.RolePermissionRepository;
import com.gruppoautoscala.followup.repository.UserPermissionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.*;

@Service
public class RolePermissionService {

    @Autowired
    private RolePermissionRepository rolePermissionRepository;

    @Autowired
    private UserPermissionRepository userPermissionRepository;

    // Tutti i ruoli e tutte le sezioni gestibili — usati sia per validare gli
    // input sia per costruire la matrice completa (ogni ruolo × ogni sezione,
    // anche quelle senza nessuna riga salvata nel database).
    public static final List<String> ROLES = List.of(
        "UTENTE", "BACK_OFFICE", "MODERATORE", "GESTORE", "ADMIN", "NOLEGGIO", "SERVICE"
    );
    public static final List<String> SECTIONS = List.of(
        "DASHBOARD", "FOLLOWUPS", "WAITING", "CONTACTS", "PROMO", "ADMIN", "RENT", "SERVICE", "GRAFICI", "VEICOLI"
    );
    // 4° livello "ADMIN_FULL" — come FULL ma può toccare anche i record
    // creati da un utente ADMIN. L'ordine della lista è anche l'ordine di
    // "forza" del permesso, usato da hasAtLeast() sotto.
    public static final List<String> ACCESS_LEVELS = List.of("NONE", "READ_ONLY", "FULL", "ADMIN_FULL");

    // ===== DEFAULT STORICI =====
    // Riproducono ESATTAMENTE il comportamento hardcoded che c'era in app.js
    // prima di questa funzionalità (RENT_ROLES, SERVICE_ROLES, canSeeAll,
    // ecc.) — finché l'admin non personalizza nulla nella nuova pagina
    // Permessi, il comportamento per ogni ruolo resta identico a quello di
    // sempre. Qualunque combinazione non elencata qui sotto è "NONE".
    //
    // ADMIN e GESTORE partono da "ADMIN_FULL" (non "FULL") per preservare
    // il potere totale che avevano tramite i controlli hardcoded nei
    // controller (potevano sempre toccare tutto, contenuti di altri admin
    // inclusi) — l'admin può comunque abbassarlo da qui se vuole.
    //
    // VEICOLI (modulo "Vetture in Consegna") NON è incluso nel default di
    // GESTORE — resta visibile SOLO ad ADMIN finché non lo si sblocca a
    // mano dalla pagina Permessi.
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
            "DASHBOARD", "ADMIN_FULL", "FOLLOWUPS", "ADMIN_FULL", "WAITING", "ADMIN_FULL",
            "CONTACTS", "ADMIN_FULL", "PROMO", "ADMIN_FULL", "RENT", "ADMIN_FULL", "SERVICE", "ADMIN_FULL",
            "ADMIN", "ADMIN_FULL", "GRAFICI", "ADMIN_FULL"
        ));
        Map<String, String> adminDefaults = new HashMap<>();
        adminDefaults.put("DASHBOARD", "ADMIN_FULL");
        adminDefaults.put("FOLLOWUPS", "ADMIN_FULL");
        adminDefaults.put("WAITING", "ADMIN_FULL");
        adminDefaults.put("CONTACTS", "ADMIN_FULL");
        adminDefaults.put("PROMO", "ADMIN_FULL");
        adminDefaults.put("RENT", "ADMIN_FULL");
        adminDefaults.put("SERVICE", "ADMIN_FULL");
        adminDefaults.put("ADMIN", "ADMIN_FULL");
        adminDefaults.put("GRAFICI", "ADMIN_FULL");
        adminDefaults.put("VEICOLI", "ADMIN_FULL");
        DEFAULTS.put("ADMIN", adminDefaults);
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

    // ===== PERMESSO EFFETTIVO (ruolo + override personale) =====
    // Se esiste un override personale per quell'utente su quella sezione,
    // VINCE SEMPRE (override totale); altrimenti si applica il permesso di
    // ruolo, calcolato come sopra.
    public String getEffectiveAccess(Long userId, String role, String section) {
        Optional<UserPermission> override = userPermissionRepository.findByUserIdAndSection(userId, section);
        if (override.isPresent()) return override.get().getAccess();
        Map<String, String> row = getEffectiveMatrix().getOrDefault(role, Map.of());
        return row.getOrDefault(section, "NONE");
    }

    // Confronta due livelli di accesso secondo l'ordine "di forza" definito
    // in ACCESS_LEVELS (NONE < READ_ONLY < FULL < ADMIN_FULL).
    public boolean hasAtLeast(String access, String required) {
        int have = ACCESS_LEVELS.indexOf(access);
        int need = ACCESS_LEVELS.indexOf(required);
        return have >= 0 && need >= 0 && have >= need;
    }

    // ===== PERMESSI PER OPERATORE =====
    public Map<Long, Map<String, String>> getAllUserOverrides() {
        Map<Long, Map<String, String>> result = new LinkedHashMap<>();
        for (UserPermission up : userPermissionRepository.findAll()) {
            result.computeIfAbsent(up.getUserId(), k -> new LinkedHashMap<>()).put(up.getSection(), up.getAccess());
        }
        return result;
    }

    // Imposta l'override personale di UN utente per UNA sezione. Se access è
    // null, l'override viene RIMOSSO (l'utente torna a ereditare il
    // permesso del suo ruolo).
    public void setUserAccess(Long userId, String section, String access) {
        if (!SECTIONS.contains(section)) throw new IllegalArgumentException("Sezione non valida");
        if (access != null && !ACCESS_LEVELS.contains(access)) throw new IllegalArgumentException("Livello di accesso non valido");

        if (access == null) {
            userPermissionRepository.findByUserIdAndSection(userId, section)
                .ifPresent(userPermissionRepository::delete);
            return;
        }

        UserPermission up = userPermissionRepository.findByUserIdAndSection(userId, section)
            .orElseGet(UserPermission::new);
        up.setUserId(userId);
        up.setSection(section);
        up.setAccess(access);
        userPermissionRepository.save(up);
    }
}
package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.RolePermission;
import com.gruppoautoscala.followup.model.UserPermission;
import com.gruppoautoscala.followup.repository.RolePermissionRepository;
import com.gruppoautoscala.followup.repository.UserPermissionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RolePermissionService {

    @Autowired
    private RolePermissionRepository rolePermissionRepository;

    @Autowired
    private UserPermissionRepository userPermissionRepository;

    // ===== CACHE IN MEMORIA =====
    // Ogni richiesta al CRM controlla i permessi dell'utente, e prima ogni
    // controllo faceva 2 query al database (override personale + tabella
    // permessi di ruolo per intero). Con il database lontano dal server,
    // ogni query costa 150-250 ms: la sola risposta di /api/permissions
    // (11 sezioni x 2 query, piu' la matrice finale) arrivava a ~5 secondi.
    // I permessi cambiano di rado (solo dalla pagina Permessi), quindi si
    // tengono in memoria per 60 secondi, e si svuotano subito quando
    // l'admin li modifica da qui (setAccess / setUserAccess). Il TTL di 60s
    // copre il caso di una modifica fatta direttamente sul database.
    private static final long CACHE_TTL_MS = 60_000;
    private volatile Map<String, Map<String, String>> matrixCache;
    private volatile long matrixCacheAt = 0;
    private final Map<Long, UserOverridesCache> userOverridesCache = new ConcurrentHashMap<>();

    private static class UserOverridesCache {
        final Map<String, String> overrides;
        final long at;
        UserOverridesCache(Map<String, String> overrides, long at) { this.overrides = overrides; this.at = at; }
    }

    private void invalidateCaches() {
        matrixCache = null;
        userOverridesCache.clear();
    }

    // Tutti i ruoli e tutte le sezioni gestibili — usati sia per validare gli
    // input sia per costruire la matrice completa (ogni ruolo × ogni sezione,
    // anche quelle senza nessuna riga salvata nel database).
    public static final List<String> ROLES = List.of(
        "UTENTE", "BACK_OFFICE", "MODERATORE", "GESTORE", "ADMIN", "NOLEGGIO", "SERVICE"
    );
    public static final List<String> SECTIONS = List.of(
        "DASHBOARD", "FOLLOWUPS", "WAITING", "CONTACTS", "PROMO", "ADMIN", "RENT", "SERVICE", "GRAFICI", "VEICOLI", "PREVENTIVI",
        // NUOVO: area Consegne + selezione area dopo il login
        "CONSEGNE",
        // NUOVO: area Stock (capitolo 02 della BI)
        "STOCK"
    );
    // ===== NUOVO: PERMESSI DEI GRAFICI =====
    // Un grafico e' una "sezione" come le altre, salvata nella stessa tabella
    // role_permissions / user_permissions, ma con solo due valori usati:
    // NONE = nascosto, READ_ONLY = visibile. Tenuti in una lista separata
    // perche' la pagina Permessi li mostra in una tabella a parte, divisa per
    // sezione del CRM. Le chiavi sono le stesse usate nel frontend (app.js,
    // CHART_PERMISSIONS).
    public static final List<String> CHARTS = List.of(
        "G_DASH_FOLLOWUP", "G_DASH_RECALL",
        "G_CT_CATEGORIE", "G_CT_OPERATORE", "G_CT_SEDE", "G_CT_ACQUISTO", "G_CT_FONTE", "G_CT_SERVICE_SEDE",
        "G_CT_MARCHE", "G_CT_NOL_TIPO", "G_CT_NOL_LEAD", "G_CT_PROMO_MODELLI", "G_CT_PROMO_APP", "G_CT_PROMO_RICH",
        "G_PV_MARCHE", "G_PV_OPERATORE", "G_PV_CONSULENTE", "G_PV_TRATTATIVE", "G_PV_ESITO",
        "G_RENT_STATO", "G_RENT_FONTE", "G_RENT_MARCHI", "G_RENT_INFO",
        "G_SRV_STATO", "G_SRV_CHIAMATE", "G_SRV_ESITO",
        "G_CG_TEMPI", "G_CG_MOTIVI",
        // Stock
        "G_ST_TIPO", "G_ST_STATO", "G_ST_MOTORE", "G_ST_MARCHI"
    );

    private static boolean isValidKey(String key) {
        return SECTIONS.contains(key) || CHARTS.contains(key);
    }

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
        // NUOVO: CONSEGNE di default solo a Moderatore, Gestore e Admin (modificabile
        // dalla pagina Permessi). HashMap invece di Map.of perche' Map.of accetta
        // al massimo 10 coppie e GESTORE ne ha 11.
        Map<String, String> moderatoreDefaults = new HashMap<>(Map.of(
            "DASHBOARD", "FULL", "FOLLOWUPS", "FULL", "WAITING", "FULL",
            "CONTACTS", "FULL", "PROMO", "FULL", "RENT", "FULL", "SERVICE", "FULL",
            "GRAFICI", "FULL", "PREVENTIVI", "FULL"
        ));
        moderatoreDefaults.put("CONSEGNE", "FULL");
        moderatoreDefaults.put("STOCK", "FULL");
        DEFAULTS.put("MODERATORE", moderatoreDefaults);
        Map<String, String> gestoreDefaults = new HashMap<>(Map.of(
            "DASHBOARD", "ADMIN_FULL", "FOLLOWUPS", "ADMIN_FULL", "WAITING", "ADMIN_FULL",
            "CONTACTS", "ADMIN_FULL", "PROMO", "ADMIN_FULL", "RENT", "ADMIN_FULL", "SERVICE", "ADMIN_FULL",
            "ADMIN", "ADMIN_FULL", "GRAFICI", "ADMIN_FULL", "PREVENTIVI", "ADMIN_FULL"
        ));
        gestoreDefaults.put("CONSEGNE", "ADMIN_FULL");
        gestoreDefaults.put("STOCK", "ADMIN_FULL");
        DEFAULTS.put("GESTORE", gestoreDefaults);
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
        adminDefaults.put("PREVENTIVI", "ADMIN_FULL");
        adminDefaults.put("CONSEGNE", "ADMIN_FULL");
        adminDefaults.put("STOCK", "ADMIN_FULL");
        DEFAULTS.put("ADMIN", adminDefaults);
        DEFAULTS.put("NOLEGGIO", Map.of("RENT", "FULL"));
        DEFAULTS.put("SERVICE", Map.of("SERVICE", "FULL"));
    }

    private String defaultAccess(String role, String section) {
        // Grafici: di default come prima di questa funzione — tutti visibili,
        // tranne "Chiamate per operatore" per i BDC (ruolo UTENTE), che prima
        // era nascosto fisso nel codice (app.js).
        if (CHARTS.contains(section)) {
            return ("UTENTE".equals(role) && "G_CT_OPERATORE".equals(section)) ? "NONE" : "READ_ONLY";
        }
        return DEFAULTS.getOrDefault(role, Map.of()).getOrDefault(section, "NONE");
    }

    // Matrice completa ruolo × sezione: parte dai default storici sopra, poi
    // sovrascrive con qualunque riga effettivamente salvata dall'admin nel
    // database. Restituita al frontend sia per la pagina Permessi (mostra
    // tutto), sia per applyRolePermissions/showPage (che ne usano solo la
    // riga del ruolo dell'utente loggato).
    public Map<String, Map<String, String>> getEffectiveMatrix() {
        // Copia difensiva: chi la riceve non puo' sporcare la cache.
        Map<String, Map<String, String>> copy = new LinkedHashMap<>();
        for (Map.Entry<String, Map<String, String>> e : matrixSnapshot().entrySet()) {
            copy.put(e.getKey(), new LinkedHashMap<>(e.getValue()));
        }
        return copy;
    }

    // Matrice dalla cache (interna, in sola lettura) — se scaduta o svuotata
    // la ricostruisce dal database.
    private Map<String, Map<String, String>> matrixSnapshot() {
        long now = System.currentTimeMillis();
        Map<String, Map<String, String>> cached = matrixCache;
        if (cached != null && now - matrixCacheAt < CACHE_TTL_MS) return cached;
        Map<String, Map<String, String>> built = buildMatrixFromDb();
        matrixCache = built;
        matrixCacheAt = now;
        return built;
    }

    private Map<String, Map<String, String>> buildMatrixFromDb() {
        Map<String, Map<String, String>> matrix = new LinkedHashMap<>();
        for (String role : ROLES) {
            Map<String, String> row = new LinkedHashMap<>();
            for (String section : SECTIONS) {
                row.put(section, defaultAccess(role, section));
            }
            for (String chart : CHARTS) {
                row.put(chart, defaultAccess(role, chart));
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
        if (!isValidKey(section)) throw new IllegalArgumentException("Sezione non valida");
        if (!ACCESS_LEVELS.contains(access)) throw new IllegalArgumentException("Livello di accesso non valido");

        RolePermission rp = rolePermissionRepository.findByRoleAndSection(role, section)
            .orElseGet(RolePermission::new);
        rp.setRole(role);
        rp.setSection(section);
        rp.setAccess(access);
        rolePermissionRepository.save(rp);
        invalidateCaches();
    }

    // ===== PERMESSO EFFETTIVO (ruolo + override personale) =====
    // Se esiste un override personale per quell'utente su quella sezione,
    // VINCE SEMPRE (override totale); altrimenti si applica il permesso di
    // ruolo, calcolato come sopra.
    public String getEffectiveAccess(Long userId, String role, String section) {
        String override = getUserOverrides(userId).get(section);
        if (override != null) return override;
        Map<String, String> row = matrixSnapshot().getOrDefault(role, Map.of());
        return row.getOrDefault(section, "NONE");
    }

    // Override personali di UN utente (sezione -> accesso), dalla cache o,
    // se scaduta/assente, con UNA sola query per tutte le sezioni (prima
    // era una query per ogni sezione).
    private Map<String, String> getUserOverrides(Long userId) {
        long now = System.currentTimeMillis();
        UserOverridesCache c = userOverridesCache.get(userId);
        if (c != null && now - c.at < CACHE_TTL_MS) return c.overrides;
        Map<String, String> overrides = new HashMap<>();
        for (UserPermission up : userPermissionRepository.findByUserId(userId)) {
            overrides.put(up.getSection(), up.getAccess());
        }
        userOverridesCache.put(userId, new UserOverridesCache(overrides, now));
        return overrides;
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
        if (!isValidKey(section)) throw new IllegalArgumentException("Sezione non valida");
        if (access != null && !ACCESS_LEVELS.contains(access)) throw new IllegalArgumentException("Livello di accesso non valido");

        if (access == null) {
            userPermissionRepository.findByUserIdAndSection(userId, section)
                .ifPresent(userPermissionRepository::delete);
            invalidateCaches();
            return;
        }

        UserPermission up = userPermissionRepository.findByUserIdAndSection(userId, section)
            .orElseGet(UserPermission::new);
        up.setUserId(userId);
        up.setSection(section);
        up.setAccess(access);
        userPermissionRepository.save(up);
        invalidateCaches();
    }
}
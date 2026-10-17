package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.service.RolePermissionService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

/**
 * NUOVO: per quanto tempo vale un'eccezione personale nei permessi
 * (solo oggi, questa settimana, questo mese, un periodo, sempre).
 *  GET  /api/permessi-tempo  -> { durate: { "idUtente|SEZIONE": { tipo, da, a, impostataDa, impostataIt } } }
 *  POST /api/permessi-tempo  { userId, section, tipo, da?, a? }   (tipo "sempre" = nessun limite)
 * Le regole (quando l'eccezione vale, la pulizia di quelle scadute) sono in RolePermissionService.
 */
@RestController
@RequestMapping("/api/permessi-tempo")
public class PermessiTempoController {

    @Autowired
    private RolePermissionService rolePermissionService;

    private static final DateTimeFormatter IT = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    /** chi puo' gestire i permessi: Admin, oppure chi ha la sezione Utenti/Permessi almeno in scrittura */
    private boolean puo(HttpSession s) {
        Long id = (Long) s.getAttribute("userId");
        String role = (String) s.getAttribute("userRole");
        if (id == null || role == null) return false;
        if ("ADMIN".equals(role)) return true;
        return rolePermissionService.hasAtLeast(rolePermissionService.getEffectiveAccess(id, role, "ADMIN"), "FULL");
    }

    @GetMapping
    public ResponseEntity<?> elenco(HttpSession s) {
        if (!puo(s)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        return ResponseEntity.ok(Map.of("durate", rolePermissionService.getDurate()));
    }

    @PostMapping
    public ResponseEntity<?> imposta(@RequestBody Map<String, Object> b, HttpSession s) {
        if (!puo(s)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        Long userId;
        try { userId = Long.valueOf(String.valueOf(b.get("userId"))); }
        catch (Exception e) { return ResponseEntity.badRequest().body(Map.of("error", "Operatore non valido")); }
        String section = String.valueOf(b.getOrDefault("section", "")), tipo = String.valueOf(b.getOrDefault("tipo", "sempre"));
        String da = b.get("da") == null ? null : String.valueOf(b.get("da")), a = b.get("a") == null ? null : String.valueOf(b.get("a"));
        String chi = (String) s.getAttribute("userFullName");
        try {
            Map<String, String> v = rolePermissionService.setDurata(userId, section, tipo, da, a, chi,
                ZonedDateTime.now(ZoneId.of("Europe/Rome")).format(IT));
            Map<String, Object> out = new HashMap<>();
            out.put("durata", v);
            return ResponseEntity.ok(out);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }
}
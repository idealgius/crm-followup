package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.service.RolePermissionService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * RIPRISTINO DEI PERMESSI INIZIALI (pagina Permessi, admin.js)
 *
 *  POST /api/permissions/reset/role   {"role":"MODERATORE"}  -> quel ruolo torna ai permessi di partenza
 *  POST /api/permissions/reset/role   {"role":"TUTTI"}       -> tutti i ruoli tornano ai permessi di partenza
 *  POST /api/permissions/reset/user   {"userId":12}          -> l'operatore perde tutte le eccezioni
 *                                                               personali e segue in tutto il suo ruolo
 *
 * Differenza con "Eredita da ruolo": quello toglie l'eccezione di UNA sezione e
 * l'operatore segue il ruolo COM'E' ADESSO; il ripristino del ruolo riporta il RUOLO
 * stesso ai valori scritti nel programma (RolePermissionService, DEFAULT STORICI).
 *
 * Solo per utenti con ruolo ADMIN (controllo sul ruolo vero, non sul permesso).
 */
@RestController
@RequestMapping("/api/permissions/reset")
public class PermissionResetController {

    @Autowired private RolePermissionService rolePermissionService;

    private ResponseEntity<?> soloAdmin(HttpSession session) {
        if (session.getAttribute("userId") == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!"ADMIN".equals(session.getAttribute("userRole")))
            return ResponseEntity.status(403).body(Map.of("error", "Solo un Admin puo' ripristinare i permessi iniziali"));
        return null;
    }

    @PostMapping("/role")
    public ResponseEntity<?> resetRole(@RequestBody Map<String, Object> body, HttpSession session) {
        ResponseEntity<?> no = soloAdmin(session);
        if (no != null) return no;
        String role = String.valueOf(body.getOrDefault("role", ""));
        try {
            int tolte = rolePermissionService.resetRole("TUTTI".equals(role) ? null : role);
            return ResponseEntity.ok(Map.of("tolte", tolte, "matrix", rolePermissionService.getEffectiveMatrix()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/user")
    public ResponseEntity<?> resetUser(@RequestBody Map<String, Object> body, HttpSession session) {
        ResponseEntity<?> no = soloAdmin(session);
        if (no != null) return no;
        Object id = body.get("userId");
        if (!(id instanceof Number n)) return ResponseEntity.badRequest().body(Map.of("error", "Operatore non valido"));
        int tolte = rolePermissionService.resetUser(n.longValue());
        return ResponseEntity.ok(Map.of("tolte", tolte));
    }
}
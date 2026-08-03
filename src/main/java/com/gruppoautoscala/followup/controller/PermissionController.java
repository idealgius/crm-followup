package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.service.RolePermissionService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/permissions")
public class PermissionController {

    @Autowired
    private RolePermissionService rolePermissionService;

    // Lettura accessibile a QUALSIASI utente autenticato: serve al login di
    // ognuno per sapere quali sezioni può vedere e in che modalità — non
    // solo agli admin che la personalizzano dalla pagina Permessi.
    @GetMapping
    public ResponseEntity<?> getPermissions(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        return ResponseEntity.ok(Map.of(
            "matrix", rolePermissionService.getEffectiveMatrix(),
            "roles", RolePermissionService.ROLES,
            "sections", RolePermissionService.SECTIONS,
            "accessLevels", RolePermissionService.ACCESS_LEVELS
        ));
    }

    // Scrittura riservata ad ADMIN/GESTORE — stessa soglia già usata per la
    // gestione utenti (AuthController), coerente col resto dell'app.
    @PutMapping
    public ResponseEntity<?> setPermission(@RequestBody Map<String, String> body, HttpSession session) {
        String sessionRole = (String) session.getAttribute("userRole");
        if (sessionRole == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!"ADMIN".equals(sessionRole) && !"GESTORE".equals(sessionRole))
            return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        String role = body.get("role");
        String section = body.get("section");
        String access = body.get("access");

        try {
            rolePermissionService.setAccess(role, section, access);
            return ResponseEntity.ok(Map.of(
                "matrix", rolePermissionService.getEffectiveMatrix()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.RolePermissionService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/permissions")
public class PermissionController {

    @Autowired
    private RolePermissionService rolePermissionService;

    @Autowired
    private UserRepository userRepository;

    // Lettura accessibile a QUALSIASI utente autenticato: serve al login di
    // ognuno per sapere quali sezioni può vedere e in che modalità — non
    // solo agli admin che la personalizzano dalla pagina Permessi.
    @GetMapping
    public ResponseEntity<?> getPermissions(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        // Permesso EFFETTIVO per l'utente loggato (ruolo + eventuale
        // override personale), sezione per sezione — è quello che il
        // frontend deve usare per abilitare/nascondere azioni per SÉ
        // STESSO. "matrix" resta la tabella per-ruolo intera, usata solo
        // dalla pagina "Permessi per Ruolo".
        Map<String, String> myEffective = new LinkedHashMap<>();
        for (String section : RolePermissionService.SECTIONS) {
            myEffective.put(section, rolePermissionService.getEffectiveAccess(userId, role, section));
        }

        return ResponseEntity.ok(Map.of(
            "matrix", rolePermissionService.getEffectiveMatrix(),
            "myEffective", myEffective,
            "roles", RolePermissionService.ROLES,
            "sections", RolePermissionService.SECTIONS,
            "accessLevels", RolePermissionService.ACCESS_LEVELS
        ));
    }

    // Scrittura riservata ad ADMIN/GESTORE — stessa soglia già usata per la
    // gestione utenti (AuthController), coerente col resto dell'app.
    // ===== PERMESSI PER RUOLO =====
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

    // ===== PERMESSI PER OPERATORE =====
    // Lista utenti + eventuali override personali già impostati — per la
    // finestra "Permessi per Operatore". Stessa soglia di /users in
    // AuthController (ADMIN/GESTORE).
    @GetMapping("/operators")
    public ResponseEntity<?> getOperatorPermissions(HttpSession session) {
        String sessionRole = (String) session.getAttribute("userRole");
        if (sessionRole == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!"ADMIN".equals(sessionRole) && !"GESTORE".equals(sessionRole))
            return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        Map<Long, Map<String, String>> overridesByUser = rolePermissionService.getAllUserOverrides();

        List<Map<String, Object>> users = userRepository.findAll().stream().map(u -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", u.getId());
            m.put("fullName", u.getFullName());
            m.put("email", u.getEmail());
            m.put("role", u.getRole());
            m.put("overrides", overridesByUser.getOrDefault(u.getId(), Map.of()));
            return m;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(Map.of(
            "users", users,
            "sections", RolePermissionService.SECTIONS,
            "accessLevels", RolePermissionService.ACCESS_LEVELS
        ));
    }

    // Imposta (o rimuove, se access è null/"INHERIT") l'override personale
    // di UN utente per UNA sezione. Override TOTALE: se impostato, vince
    // sempre sul permesso del ruolo per quella sezione.
    @PutMapping("/operators")
    public ResponseEntity<?> setOperatorPermission(@RequestBody Map<String, Object> body, HttpSession session) {
        String sessionRole = (String) session.getAttribute("userRole");
        if (sessionRole == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!"ADMIN".equals(sessionRole) && !"GESTORE".equals(sessionRole))
            return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        Object userIdRaw = body.get("userId");
        if (userIdRaw == null) return ResponseEntity.badRequest().body(Map.of("error", "Utente obbligatorio"));
        Long targetUserId = Long.valueOf(String.valueOf(userIdRaw));

        String section = (String) body.get("section");
        String access = (String) body.get("access");
        if ("INHERIT".equals(access)) access = null;

        try {
            rolePermissionService.setUserAccess(targetUserId, section, access);
            return ResponseEntity.ok(Map.of("message", "Permesso aggiornato"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
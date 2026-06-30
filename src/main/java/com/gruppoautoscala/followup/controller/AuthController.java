package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.AuthService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository userRepository;

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> body) {
        try {
            User user = authService.register(
                body.get("fullName"),
                body.get("email"),
                body.get("password")
            );
            String role = body.getOrDefault("role", "UTENTE");
            user.setRole(role);
            userRepository.save(user);
            Map<String, Object> response = new HashMap<>();
            response.put("id", user.getId());
            response.put("fullName", user.getFullName());
            response.put("email", user.getEmail());
            response.put("role", user.getRole());
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body, HttpSession session) {
        Optional<User> userOpt = authService.findByEmail(body.get("email"));
        if (userOpt.isEmpty() || !authService.checkPassword(userOpt.get(), body.get("password"))) {
            return ResponseEntity.status(401).body(Map.of("error", "Credenziali non valide"));
        }
        User user = userOpt.get();
        session.setAttribute("userId", user.getId());
        session.setAttribute("userEmail", user.getEmail());
        session.setAttribute("userRole", user.getRole());
        session.setAttribute("userFullName", user.getFullName());
        Map<String, Object> response = new HashMap<>();
        response.put("id", user.getId());
        response.put("fullName", user.getFullName());
        response.put("email", user.getEmail());
        response.put("role", user.getRole());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpSession session) {
        session.invalidate();
        return ResponseEntity.ok(Map.of("message", "Logout effettuato"));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Map<String, Object> response = new HashMap<>();
        response.put("id", userId);
        response.put("email", session.getAttribute("userEmail"));
        response.put("role", session.getAttribute("userRole"));
        response.put("fullName", session.getAttribute("userFullName"));
        return ResponseEntity.ok(response);
    }

    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(@RequestBody Map<String, String> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        String currentPassword = body.get("currentPassword");
        String newPassword = body.get("newPassword");
        String confirmPassword = body.get("confirmPassword");

        if (currentPassword == null || newPassword == null || confirmPassword == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Tutti i campi sono obbligatori"));
        }
        if (!newPassword.equals(confirmPassword)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Le password non coincidono"));
        }

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));

        try {
            authService.changePassword(userOpt.get(), currentPassword, newPassword);
            return ResponseEntity.ok(Map.of("message", "Password aggiornata con successo"));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/users")
    public ResponseEntity<?> getUsers(HttpSession session) {
        String role = (String) session.getAttribute("userRole");
        if (role == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!"ADMIN".equals(role) && !"GESTORE".equals(role))
            return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        List<Map<String, Object>> users = userRepository.findAll().stream().map(u -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", u.getId());
            m.put("fullName", u.getFullName());
            m.put("email", u.getEmail());
            m.put("role", u.getRole());
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(users);
    }

    @PatchMapping("/users/{id}/role")
    public ResponseEntity<?> changeRole(@PathVariable Long id,
                                        @RequestBody Map<String, String> body,
                                        HttpSession session) {
        String sessionRole = (String) session.getAttribute("userRole");
        Long sessionUserId = (Long) session.getAttribute("userId");
        if (sessionRole == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!"ADMIN".equals(sessionRole) && !"GESTORE".equals(sessionRole))
            return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        Optional<User> userOpt = userRepository.findById(id);
        if (userOpt.isEmpty()) return ResponseEntity.notFound().build();

        User target = userOpt.get();

        // Gestore non può modificare Admin
        if ("GESTORE".equals(sessionRole) && "ADMIN".equals(target.getRole()))
            return ResponseEntity.status(403).body(Map.of("error", "Non puoi modificare un Admin"));

        // Nessuno può modificare se stesso
        if (sessionUserId.equals(id))
            return ResponseEntity.badRequest().body(Map.of("error", "Non puoi modificare il tuo ruolo"));

        String newRole = body.get("role");
        List<String> validRoles = List.of("UTENTE", "MODERATORE", "GESTORE", "ADMIN");
        if (!validRoles.contains(newRole))
            return ResponseEntity.badRequest().body(Map.of("error", "Ruolo non valido"));

        // Gestore non può assegnare ADMIN
        if ("GESTORE".equals(sessionRole) && "ADMIN".equals(newRole))
            return ResponseEntity.status(403).body(Map.of("error", "Non puoi assegnare il ruolo Admin"));

        target.setRole(newRole);
        userRepository.save(target);
        return ResponseEntity.ok(Map.of("message", "Ruolo aggiornato", "role", newRole));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<?> deleteUser(@PathVariable Long id, HttpSession session) {
        String role = (String) session.getAttribute("userRole");
        Long sessionUserId = (Long) session.getAttribute("userId");
        if (role == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!"ADMIN".equals(role) && !"GESTORE".equals(role))
            return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        if (sessionUserId.equals(id))
            return ResponseEntity.badRequest().body(Map.of("error", "Non puoi eliminare te stesso"));

        Optional<User> userOpt = userRepository.findById(id);
        if (userOpt.isEmpty()) return ResponseEntity.notFound().build();

        // Gestore non può eliminare Admin
        if ("GESTORE".equals(role) && "ADMIN".equals(userOpt.get().getRole()))
            return ResponseEntity.status(403).body(Map.of("error", "Non puoi eliminare un Admin"));

        userRepository.deleteById(id);
        return ResponseEntity.ok(Map.of("message", "Utente eliminato"));
    }

    @PostMapping("/setup")
    public ResponseEntity<?> setup(@RequestBody Map<String, String> body) {
        try {
            User user = authService.register(
                body.get("fullName"),
                body.get("email"),
                body.get("password")
            );
            user.setRole("ADMIN");
            userRepository.save(user);
            return ResponseEntity.ok(Map.of("message", "Admin creato!", "id", user.getId()));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
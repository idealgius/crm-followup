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
        if (userId == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        }
        Map<String, Object> response = new HashMap<>();
        response.put("id", userId);
        response.put("email", session.getAttribute("userEmail"));
        response.put("role", session.getAttribute("userRole"));
        response.put("fullName", session.getAttribute("userFullName"));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/users")
    public ResponseEntity<?> getUsers(HttpSession session) {
        String role = (String) session.getAttribute("userRole");
        if (role == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!"ADMIN".equals(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
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

    @DeleteMapping("/users/{id}")
    public ResponseEntity<?> deleteUser(@PathVariable Long id, HttpSession session) {
        String role = (String) session.getAttribute("userRole");
        if (role == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!"ADMIN".equals(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        Long sessionUserId = (Long) session.getAttribute("userId");
        if (sessionUserId.equals(id)) return ResponseEntity.badRequest().body(Map.of("error", "Non puoi eliminare te stesso"));
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
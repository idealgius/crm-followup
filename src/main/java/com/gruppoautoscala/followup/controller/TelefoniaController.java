package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.TelefonoOperatore;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.TelefonoOperatoreRepository;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.RolePermissionService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/telefonia")
public class TelefoniaController {

    @Autowired private TelefonoOperatoreRepository telefonoOperatoreRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private SimpMessagingTemplate messagingTemplate;
    @Autowired private RolePermissionService rolePermissionService;

    // Token condiviso semplice nella query string — il telefono non può fare
    // login, quindi non c'è vera autenticazione qui: questo alza solo la
    // soglia perché non basti indovinare l'URL. Configurabile in
    // application.properties con "telefonia.webhook.token=..."; se non
    // impostato usa un default (da CAMBIARE prima di andare in produzione).
    @Value("${telefonia.webhook.token:cambia-questo-token}")
    private String webhookToken;

    // ===== CHIAMATA IN ARRIVO — chiamato DAL TELEFONO YEALINK (Action URL) =====
    // Config sul telefono: Features -> Action URL -> Incoming Call ->
    //   http://TUOSERVER/api/telefonia/chiamata-in-arrivo?interno=101&numero=$remote&token=IL_TUO_TOKEN
    // $remote viene sostituito dal telefono stesso col numero chiamante.
    @GetMapping("/chiamata-in-arrivo")
    public ResponseEntity<?> chiamataInArrivo(@RequestParam String interno,
                                               @RequestParam String numero,
                                               @RequestParam(required = false) String token) {
        if (!webhookToken.equals(token)) {
            return ResponseEntity.status(403).body(Map.of("error", "Token non valido"));
        }

        Optional<TelefonoOperatore> mapping = telefonoOperatoreRepository.findByInterno(interno);
        if (mapping.isEmpty()) {
            // Non un errore per il telefono — l'interno semplicemente non è
            // (ancora) mappato a nessun operatore nel CRM.
            return ResponseEntity.ok(Map.of("message", "Interno non mappato, nessun avviso inviato"));
        }

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("userId", mapping.get().getUser().getId());
        event.put("numero", numero);
        event.put("interno", interno);
        messagingTemplate.convertAndSend("/topic/calls", event);

        return ResponseEntity.ok(Map.of("message", "Avviso inviato"));
    }

    // ===== GESTIONE MAPPATURE (pannello admin) =====
    private boolean canManage(Long userId, String role) {
        return rolePermissionService.hasAtLeast(rolePermissionService.getEffectiveAccess(userId, role, "ADMIN"), "FULL");
    }

    @GetMapping("/mappature")
    public ResponseEntity<?> getMappature(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canManage(userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        List<Map<String, Object>> result = telefonoOperatoreRepository.findAllConOperatore().stream().map(t -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", t.getId());
            m.put("interno", t.getInterno());
            m.put("userId", t.getUser().getId());
            m.put("userFullName", t.getUser().getFullName());
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @PostMapping("/mappature")
    public ResponseEntity<?> createMappatura(@RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canManage(userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        String interno = (String) body.get("interno");
        Object targetUserIdRaw = body.get("userId");
        if (interno == null || interno.isBlank() || targetUserIdRaw == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Interno e operatore sono obbligatori"));
        }
        if (telefonoOperatoreRepository.findByInterno(interno.trim()).isPresent()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Questo interno è già mappato"));
        }

        Optional<User> targetUser = userRepository.findById(Long.valueOf(String.valueOf(targetUserIdRaw)));
        if (targetUser.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Operatore non trovato"));

        TelefonoOperatore t = new TelefonoOperatore();
        t.setInterno(interno.trim());
        t.setUser(targetUser.get());
        telefonoOperatoreRepository.save(t);
        return ResponseEntity.ok(Map.of("message", "Mappatura creata"));
    }

    @DeleteMapping("/mappature/{id}")
    public ResponseEntity<?> deleteMappatura(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canManage(userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        telefonoOperatoreRepository.deleteById(id);
        return ResponseEntity.ok(Map.of("message", "Mappatura eliminata"));
    }
}
package com.gruppoautoscala.followup.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.RentImportService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.*;

// NUOVO: import dal gestionale in Rent (file trattative + file lead).
// Vedi RentImportService per le regole. Stessi ruoli che vedono Rent.
//   POST /api/noleggio/import/anteprima   file (uno o due)  -> cosa cambierebbe (non salva nulla)
//   POST /api/noleggio/import/applica     file + aggiorna (JSON id) + crea (JSON chiavi)
//   GET  /api/noleggio/import/note        note dal gestionale tenute a parte, per trattativa
@RestController
@RequestMapping("/api/noleggio/import")
public class RentImportController {

    private static final List<String> RENT_ROLES = List.of("NOLEGGIO", "MODERATORE", "GESTORE", "ADMIN");

    @Autowired private RentImportService importService;
    @Autowired private UserRepository userRepository;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private SimpMessagingTemplate messagingTemplate;

    private ResponseEntity<?> controlla(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (role == null || !RENT_ROLES.contains(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        return null;
    }

    private static List<MultipartFile> files(MultipartFile a, MultipartFile b) {
        List<MultipartFile> l = new ArrayList<>();
        if (a != null && !a.isEmpty()) l.add(a);
        if (b != null && !b.isEmpty()) l.add(b);
        return l;
    }

    @PostMapping("/anteprima")
    public ResponseEntity<?> anteprima(@RequestParam(value = "file1", required = false) MultipartFile f1,
                                       @RequestParam(value = "file2", required = false) MultipartFile f2,
                                       HttpSession session) {
        ResponseEntity<?> no = controlla(session); if (no != null) return no;
        List<MultipartFile> fl = files(f1, f2);
        if (fl.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Nessun file"));
        User me = userRepository.findById((Long) session.getAttribute("userId")).orElse(null);
        try {
            return ResponseEntity.ok(importService.anteprima(fl, me));
        } catch (IOException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/applica")
    public ResponseEntity<?> applica(@RequestParam(value = "file1", required = false) MultipartFile f1,
                                     @RequestParam(value = "file2", required = false) MultipartFile f2,
                                     @RequestParam(value = "aggiorna", required = false) String aggiornaJson,
                                     @RequestParam(value = "crea", required = false) String creaJson,
                                     @RequestParam(value = "gestori", required = false) String gestoriJson,
                                     HttpSession session) {
        ResponseEntity<?> no = controlla(session); if (no != null) return no;
        List<MultipartFile> fl = files(f1, f2);
        if (fl.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Nessun file"));
        User me = userRepository.findById((Long) session.getAttribute("userId")).orElse(null);
        if (me == null) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));
        Set<Long> aggiorna = new HashSet<>();
        Set<String> crea = new LinkedHashSet<>();
        // NUOVO: "gestita da" scelto a mano: { "A:<id trattativa>": idUtente, "C:<chiave nuova>": idUtente }
        Map<Long, Long> gestAgg = new HashMap<>();
        Map<String, Long> gestCrea = new HashMap<>();
        try {
            if (aggiornaJson != null && !aggiornaJson.isBlank())
                for (Object o : objectMapper.readValue(aggiornaJson, new TypeReference<List<Object>>() {}))
                    try { aggiorna.add(Long.valueOf(String.valueOf(o))); } catch (NumberFormatException ignored) {}
            if (creaJson != null && !creaJson.isBlank())
                for (Object o : objectMapper.readValue(creaJson, new TypeReference<List<Object>>() {})) crea.add(String.valueOf(o));
            if (gestoriJson != null && !gestoriJson.isBlank())
                for (Map.Entry<String, Object> e : objectMapper.readValue(gestoriJson, new TypeReference<Map<String, Object>>() {}).entrySet()) {
                    Long uid;
                    try { uid = Long.valueOf(String.valueOf(e.getValue())); } catch (NumberFormatException ex) { continue; }
                    String k = e.getKey();
                    if (k.startsWith("A:")) { try { gestAgg.put(Long.valueOf(k.substring(2)), uid); } catch (NumberFormatException ignored) {} }
                    else if (k.startsWith("C:")) gestCrea.put(k.substring(2), uid);
                }
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Scelte non valide"));
        }
        try {
            Map<String, Object> r = importService.applica(fl, me, aggiorna, crea, gestAgg, gestCrea);
            // Rent aperto sugli altri computer: ricarica l'elenco
            Map<String, Object> ev = new HashMap<>();
            ev.put("type", "reload");
            ev.put("data", Map.of("motivo", "import"));
            try { messagingTemplate.convertAndSend("/topic/rent", ev); } catch (Exception ignored) {}
            return ResponseEntity.ok(r);
        } catch (IOException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/note")
    public ResponseEntity<?> note(HttpSession session) {
        ResponseEntity<?> no = controlla(session); if (no != null) return no;
        return ResponseEntity.ok(importService.noteGestionale());
    }
}
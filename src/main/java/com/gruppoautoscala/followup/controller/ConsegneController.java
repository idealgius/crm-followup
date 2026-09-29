package com.gruppoautoscala.followup.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruppoautoscala.followup.model.ConsegneDataset;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.ConsegneService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * AREA CONSEGNE — API usate da /js/consegne.js
 *
 *  GET  /api/consegne/data                -> ultimo import trattative + ultima lettura foglio DATABASE
 *  POST /api/consegne/trattative          -> salva un nuovo import trattative (sostituisce il precedente)
 *  POST /api/consegne/database/aggiorna   -> rilegge SUBITO il foglio Google
 *
 * Tutti gli endpoint richiedono login. L'import trattative e' riservato a
 * ADMIN, GESTORE e MODERATORE (cambia IMPORT_ROLES per allargarlo).
 */
@RestController
@RequestMapping("/api/consegne")
public class ConsegneController {

    private static final List<String> IMPORT_ROLES = List.of("ADMIN", "GESTORE", "MODERATORE");

    @Autowired
    private ConsegneService consegneService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @GetMapping("/data")
    public ResponseEntity<?> getData(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        String role = (String) session.getAttribute("userRole");
        try {
            return ResponseEntity.ok(buildData(role));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Errore lettura dati Consegne: " + e.getMessage()));
        }
    }

    @PostMapping("/trattative")
    public ResponseEntity<?> importaTrattative(@RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        String role = (String) session.getAttribute("userRole");
        if (!IMPORT_ROLES.contains(role)) {
            return ResponseEntity.status(403).body(Map.of("error", "Solo Admin, Gestore o Moderatore possono importare le trattative"));
        }
        Object rows = body.get("rows");
        if (!(rows instanceof List<?> lista) || lista.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Il file non contiene trattative valide"));
        }
        try {
            String json = objectMapper.writeValueAsString(lista);
            consegneService.salvaTrattative(json, lista.size(), nomeUtente(userId));
            return ResponseEntity.ok(buildData(role));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Salvataggio import non riuscito: " + e.getMessage()));
        }
    }

    @PostMapping("/database/aggiorna")
    public ResponseEntity<?> aggiornaFoglio(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        String role = (String) session.getAttribute("userRole");
        try {
            consegneService.aggiornaDaFoglio(nomeUtente(userId));
            return ResponseEntity.ok(buildData(role));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(503).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(502).body(Map.of("error", "Lettura del foglio Google non riuscita: " + e.getMessage()));
        }
    }

    private Map<String, Object> buildData(String role) throws Exception {
        Map<String, Object> out = new HashMap<>();

        Optional<ConsegneDataset> tr = consegneService.get(ConsegneService.TRATTATIVE);
        if (tr.isPresent() && tr.get().getContenuto() != null) {
            Map<String, Object> t = meta(tr.get());
            t.put("rows", objectMapper.readTree(tr.get().getContenuto()));
            out.put("trattative", t);
        } else {
            out.put("trattative", null);
        }

        Optional<ConsegneDataset> db = consegneService.get(ConsegneService.DATABASE);
        if (db.isPresent() && db.get().getContenuto() != null) {
            Map<String, Object> d = meta(db.get());
            d.put("csv", db.get().getContenuto());
            out.put("database", d);
        } else {
            out.put("database", null);
        }

        out.put("foglioCollegato", consegneService.isFoglioConfigurato());
        out.put("foglioControllatoAt", consegneService.getUltimoControllo());
        out.put("foglioErrore", consegneService.getUltimoErrore());
        out.put("puoImportare", IMPORT_ROLES.contains(role));
        return out;
    }

    private Map<String, Object> meta(ConsegneDataset d) {
        Map<String, Object> m = new HashMap<>();
        m.put("righe", d.getRighe());
        m.put("aggiornatoAt", d.getAggiornatoAt());
        m.put("aggiornatoDa", d.getAggiornatoDa());
        return m;
    }

    private String nomeUtente(Long userId) {
        return userRepository.findById(userId)
                .map(User::getFullName)
                .filter(n -> n != null && !n.isBlank())
                .orElse("Utente " + userId);
    }
}
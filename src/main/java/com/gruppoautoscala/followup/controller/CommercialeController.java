package com.gruppoautoscala.followup.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruppoautoscala.followup.model.ConsegneDataset;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.ConsegneDatasetRepository;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.CommercialeExcelService;
import com.gruppoautoscala.followup.service.RolePermissionService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;

/**
 * BI COMMERCIALE — API usate da /js/commerciale.js
 *
 *  GET  /api/commerciale/data            -> trattative del Commerciale (ultimo import) + storico import
 *  POST /api/commerciale/trattative      -> nuovo import del CSV con TUTTE le trattative (sostituisce il
 *                                           precedente e aggiunge una riga allo storico)
 *  GET  /api/commerciale/storico-import  -> storico degli import del CSV trattative
 *  POST /api/commerciale/storico-import  -> aggiunge una riga allo storico (dopo un import
 *                                           fatto da Commerciale o da Consegne)
 *  POST /api/commerciale/export/excel    -> file Excel professionale con le tabelle
 *                                           calcolate dalla pagina (vedi CommercialeExcelService)
 *
 * I dati del Commerciale sono SEPARATI da quelli delle Consegne: le Consegne hanno il
 * loro import (solo le chiuse, POST /api/consegne/trattative), il Commerciale il suo
 * (tutte le trattative), salvato nella tabella consegne_dataset con la chiave
 * "COMMERCIALE_TRATTATIVE". Lo storico usa la chiave "TRATTATIVE_STORICO" (ultimi 60 import).
 * Il foglio AVANZAMENTO e' unico e lo leggono entrambe.
 * Permessi: sezione COMMERCIALE della pagina Permessi (ruolo + operatore; finche' non e'
 * impostata segue CONSEGNE).
 *  - vedere: almeno "Solo lettura"
 *  - importare le trattative: "Completo" o superiore (prima: solo Admin, Gestore, Moderatore,
 *    che sono proprio i ruoli con "Completo" di default)
 *  - lo storico import si aggiorna anche dopo un import fatto dalle Consegne: basta
 *    "Completo" su COMMERCIALE oppure su CONSEGNE
 */
@RestController
@RequestMapping("/api/commerciale")
public class CommercialeController {

    private static final String CHIAVE_STORICO = "TRATTATIVE_STORICO";
    private static final String CHIAVE_TRATTATIVE = "COMMERCIALE_TRATTATIVE";
    private static final int MAX_STORICO = 60;
    private static final ZoneId ITALY = ZoneId.of("Europe/Rome");

    @Autowired private ConsegneDatasetRepository repository;
    @Autowired private UserRepository userRepository;
    @Autowired private RolePermissionService rolePermissionService;
    @Autowired private CommercialeExcelService excelService;
    @Autowired private ObjectMapper objectMapper;

    private ResponseEntity<?> controlla(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!rolePermissionService.hasAtLeast(rolePermissionService.getEffectiveAccess(userId, role, "COMMERCIALE"), "READ_ONLY"))
            return ResponseEntity.status(403).body(Map.of("error", "Non hai il permesso per il Commerciale"));
        return null;
    }

    /** "Completo" (o superiore) su una sezione */
    private boolean completo(HttpSession session, String sezione) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        return userId != null && rolePermissionService.hasAtLeast(rolePermissionService.getEffectiveAccess(userId, role, sezione), "FULL");
    }
    private boolean puoImportare(HttpSession session) { return completo(session, "COMMERCIALE"); }

    private String nome(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        return userId == null ? null : userRepository.findById(userId).map(User::getFullName).orElse(null);
    }

    private List<Map<String, Object>> leggiStorico() {
        return repository.findById(CHIAVE_STORICO).map(d -> {
            try { return objectMapper.readValue(d.getContenuto(), new TypeReference<List<Map<String, Object>>>() {}); }
            catch (Exception e) { return new ArrayList<Map<String, Object>>(); }
        }).orElseGet(ArrayList::new);
    }

    @GetMapping("/data")
    public ResponseEntity<?> data(HttpSession session) {
        ResponseEntity<?> no = controlla(session);
        if (no != null) return no;
        String role = (String) session.getAttribute("userRole");
        Map<String, Object> out = new LinkedHashMap<>();
        Optional<ConsegneDataset> d = repository.findById(CHIAVE_TRATTATIVE);
        if (d.isPresent()) {
            Map<String, Object> t = new LinkedHashMap<>();
            try { t.put("rows", objectMapper.readTree(d.get().getContenuto())); }
            catch (Exception e) { t.put("rows", List.of()); }
            t.put("righe", d.get().getRighe());
            t.put("aggiornatoAt", d.get().getAggiornatoAt() != null ? d.get().getAggiornatoAt().toString() : null);
            t.put("aggiornatoDa", d.get().getAggiornatoDa());
            out.put("trattative", t);
        } else out.put("trattative", null);
        out.put("storico", leggiStorico());
        out.put("puoImportare", puoImportare(session));
        return ResponseEntity.ok(out);
    }

    @PostMapping("/trattative")
    public synchronized ResponseEntity<?> importa(@RequestBody Map<String, Object> body, HttpSession session) {
        ResponseEntity<?> no = controlla(session);
        if (no != null) return no;
        String role = (String) session.getAttribute("userRole");
        if (!puoImportare(session)) return ResponseEntity.status(403).body(Map.of("error", "Per importare le trattative serve il permesso Completo sul Commerciale"));
        Object rows = body.get("rows");
        if (!(rows instanceof List<?> lista) || lista.isEmpty())
            return ResponseEntity.badRequest().body(Map.of("error", "Il file non contiene trattative valide"));
        try {
            String chi = nome(session);
            ConsegneDataset d = repository.findById(CHIAVE_TRATTATIVE).orElseGet(() -> { ConsegneDataset n = new ConsegneDataset(); n.setTipo(CHIAVE_TRATTATIVE); return n; });
            d.setContenuto(objectMapper.writeValueAsString(lista));
            d.setRighe(lista.size());
            d.setAggiornatoAt(LocalDateTime.now(ITALY));   // ora italiana (il server e' in UTC)
            d.setAggiornatoDa(chi);
            repository.save(d);
            Map<String, Object> st = new LinkedHashMap<>(body);
            st.remove("rows");
            st.put("righe", lista.size());
            st.put("da", "Commerciale");
            aggiungiStorico(st, session);
            return data(session);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Salvataggio import non riuscito: " + e.getMessage()));
        }
    }

    @GetMapping("/storico-import")
    public ResponseEntity<?> storico(HttpSession session) {
        ResponseEntity<?> no = controlla(session);
        if (no != null) return no;
        String role = (String) session.getAttribute("userRole");
        return ResponseEntity.ok(Map.of("storico", leggiStorico(), "puoImportare", puoImportare(session)));
    }

    @PostMapping("/storico-import")
    public synchronized ResponseEntity<?> aggiungiStorico(@RequestBody Map<String, Object> body, HttpSession session) {
        ResponseEntity<?> no = controlla(session);
        if (no != null) return no;
        String role = (String) session.getAttribute("userRole");
        if (!puoImportare(session) && !completo(session, "CONSEGNE")) return ResponseEntity.status(403).body(Map.of("error", "Per importare serve il permesso Completo"));
        try {
            List<Map<String, Object>> lista = leggiStorico();
            Map<String, Object> riga = new LinkedHashMap<>();
            riga.put("quando", LocalDateTime.now(ITALY).toString());
            riga.put("chi", nome(session));
            riga.put("da", String.valueOf(body.getOrDefault("da", "Commerciale")));
            riga.put("file", String.valueOf(body.getOrDefault("file", "")));
            for (String k : List.of("righe", "chiuse", "vendita", "noleggio", "dal", "al", "nuove", "tolte"))
                if (body.get(k) != null) riga.put(k, body.get(k));
            lista.add(0, riga);
            while (lista.size() > MAX_STORICO) lista.remove(lista.size() - 1);
            ConsegneDataset d = repository.findById(CHIAVE_STORICO).orElseGet(() -> { ConsegneDataset n = new ConsegneDataset(); n.setTipo(CHIAVE_STORICO); return n; });
            d.setContenuto(objectMapper.writeValueAsString(lista));
            d.setRighe(lista.size());
            d.setAggiornatoAt(LocalDateTime.now(ITALY));   // ora italiana (il server e' in UTC)
            d.setAggiornatoDa(nome(session));
            repository.save(d);
            return ResponseEntity.ok(Map.of("storico", lista));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Storico non salvato: " + e.getMessage()));
        }
    }

    @PostMapping("/export/excel")
    public ResponseEntity<?> exportExcel(@RequestBody Map<String, Object> body, HttpSession session) {
        ResponseEntity<?> no = controlla(session);
        if (no != null) return no;
        try {
            byte[] xlsx = excelService.export(body, nome(session));
            String file = String.valueOf(body.getOrDefault("file", "commerciale.xlsx")).replaceAll("[^A-Za-z0-9._-]", "_");
            if (!file.endsWith(".xlsx")) file += ".xlsx";
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + file + "\"")
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(xlsx);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Export non riuscito: " + e.getMessage()));
        }
    }
}
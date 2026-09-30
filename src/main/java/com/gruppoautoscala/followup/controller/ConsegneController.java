package com.gruppoautoscala.followup.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruppoautoscala.followup.model.ConsegneDataset;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.ConsegneExcelService;
import com.gruppoautoscala.followup.service.ConsegneService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import com.gruppoautoscala.followup.service.RolePermissionService;
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
 *  POST /api/consegne/database/import     -> carica la scheda DATABASE da CSV (mette in pausa l'automatico)
 *  POST /api/consegne/export-excel        -> Excel dell'Analisi avanzamento (piu' fogli, grafici nativi)
 *  POST /api/consegne/verifiche           -> segna / toglie la verifica manuale di una pratica ("i")
 *
 * Permessi: sezione CONSEGNE della pagina Permessi (ruolo + operatore).
 *  - vedere i dati e aggiornare il foglio: almeno "Solo lettura"
 *  - importare trattative e segnare/togliere verifiche: "Completo" o superiore
 */
@RestController
@RequestMapping("/api/consegne")
public class ConsegneController {

    private static final String SECTION = "CONSEGNE";

    @Autowired
    private ConsegneService consegneService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RolePermissionService rolePermissionService;

    @Autowired
    private ConsegneExcelService consegneExcelService;

    private String access(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return null;
        return rolePermissionService.getEffectiveAccess(userId, role, SECTION);
    }
    private boolean puoVedere(String access) { return access != null && rolePermissionService.hasAtLeast(access, "READ_ONLY"); }
    private boolean puoModificare(String access) { return access != null && rolePermissionService.hasAtLeast(access, "FULL"); }
    private ResponseEntity<?> negato(String access) {
        return access == null ? ResponseEntity.status(401).body(Map.of("error", "Non autenticato"))
                              : ResponseEntity.status(403).body(Map.of("error", "Non hai il permesso per l'area Consegne"));
    }

    @GetMapping("/data")
    public ResponseEntity<?> getData(HttpSession session) {
        String acc = access(session);
        if (!puoVedere(acc)) return negato(acc);
        try {
            return ResponseEntity.ok(buildData(acc));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Errore lettura dati Consegne: " + e.getMessage()));
        }
    }

    @PostMapping("/trattative")
    public ResponseEntity<?> importaTrattative(@RequestBody Map<String, Object> body, HttpSession session) {
        String acc = access(session);
        if (!puoModificare(acc)) return negato(acc);
        Long userId = (Long) session.getAttribute("userId");
        Object rows = body.get("rows");
        if (!(rows instanceof List<?> lista) || lista.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Il file non contiene trattative valide"));
        }
        try {
            String json = objectMapper.writeValueAsString(lista);
            consegneService.salvaTrattative(json, lista.size(), nomeUtente(userId));
            return ResponseEntity.ok(buildData(acc));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Salvataggio import non riuscito: " + e.getMessage()));
        }
    }

    @PostMapping("/database/aggiorna")
    public ResponseEntity<?> aggiornaFoglio(HttpSession session) {
        String acc = access(session);
        if (!puoVedere(acc)) return negato(acc);
        Long userId = (Long) session.getAttribute("userId");
        try {
            consegneService.aggiornaDaFoglio(nomeUtente(userId));
            return ResponseEntity.ok(buildData(acc));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(503).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(502).body(Map.of("error", "Lettura del foglio Google non riuscita: " + e.getMessage()));
        }
    }

    @PostMapping("/database/import")
    public ResponseEntity<?> importaFoglioCsv(@RequestBody Map<String, Object> body, HttpSession session) {
        String acc = access(session);
        if (!puoModificare(acc)) return negato(acc);
        Long userId = (Long) session.getAttribute("userId");
        Object csv = body.get("csv");
        if (!(csv instanceof String testo) || testo.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "File CSV vuoto"));
        }
        try {
            consegneService.importaDatabaseCsv(testo, nomeUtente(userId));
            return ResponseEntity.ok(buildData(acc));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/export-excel")
    public ResponseEntity<?> exportExcel(@RequestBody Map<String, Object> body, HttpSession session) {
        String acc = access(session);
        if (!puoVedere(acc)) return negato(acc);
        try {
            byte[] xlsx = consegneExcelService.crea(body);
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"consegne-analisi.xlsx\"")
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(xlsx);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Export Excel non riuscito: " + e.getMessage()));
        }
    }

    @PostMapping("/verifiche")
    public ResponseEntity<?> verifica(@RequestBody Map<String, Object> body, HttpSession session) {
        String acc = access(session);
        if (!puoModificare(acc)) return negato(acc);
        Long userId = (Long) session.getAttribute("userId");
        Object key = body.get("key");
        if (!(key instanceof String chiave) || chiave.isBlank() || chiave.length() > 500) {
            return ResponseEntity.badRequest().body(Map.of("error", "Pratica non valida"));
        }
        boolean verificata = Boolean.TRUE.equals(body.get("verificata"));
        Object az = body.get("azione");
        String azione = (az instanceof String a && !a.isBlank()) ? a : null;
        if (azione != null && !azione.equals("contratto") && !azione.equals("elimina") && !azione.equals("abbina")) {
            return ResponseEntity.badRequest().body(Map.of("error", "Azione non valida"));
        }
        // "abbina": riga del foglio scelta dall'operatore (chiave cliente|targa|mese)
        Object rg = body.get("riga");
        String riga = (rg instanceof String r && !r.isBlank() && r.length() <= 500) ? r : null;
        if ("abbina".equals(azione) && riga == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Riga del foglio mancante"));
        }
        try {
            Map<String, Object> out = new HashMap<>();
            out.put("verifiche", consegneService.setVerifica(chiave, verificata, nomeUtente(userId), azione, riga));
            return ResponseEntity.ok(out);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Salvataggio verifica non riuscito: " + e.getMessage()));
        }
    }

    private Map<String, Object> buildData(String acc) throws Exception {
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
        out.put("puoImportare", puoModificare(acc));
        out.put("puoModificare", puoModificare(acc));
        out.put("verifiche", consegneService.getVerifiche());
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
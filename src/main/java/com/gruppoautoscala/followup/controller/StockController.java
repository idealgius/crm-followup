package com.gruppoautoscala.followup.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruppoautoscala.followup.model.ConsegneDataset;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.ConsegneDatasetRepository;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.RolePermissionService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;

/**
 * AREA STOCK (capitolo 02 della BI).
 *
 * Stesso schema di Consegne: il file Excel dello stock viene letto e
 * normalizzato NEL BROWSER (stock-home.js) e arriva qui gia' come JSON
 * (solo le colonne che servono). Ogni import sostituisce il precedente,
 * perche' il file e' una fotografia completa dello stock: tutti vedono
 * sempre l'ultimo caricamento.
 *
 * Salvataggio: tabella consegne_dataset, riga con chiave "STOCK"
 * (nessuna tabella nuova).
 *
 *  GET  /api/stock/data    -> ultimo stock + permessi dell'utente
 *  POST /api/stock/import  -> { rows: [...] } sostituisce lo stock
 *
 * Permessi: sezione STOCK (pagina Permessi). "Solo lettura" = vede,
 * "Completo" = importa.
 */
@RestController
@RequestMapping("/api/stock")
public class StockController {

    private static final String SECTION = "STOCK";
    private static final String CHIAVE = "STOCK";
    private static final int MAX_RIGHE = 20000;

    @Autowired
    private ConsegneDatasetRepository repository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RolePermissionService rolePermissionService;

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
                              : ResponseEntity.status(403).body(Map.of("error", "Non hai il permesso per l'area Stock"));
    }

    @GetMapping("/data")
    public ResponseEntity<?> getData(HttpSession session) {
        String acc = access(session);
        if (!puoVedere(acc)) return negato(acc);
        try {
            return ResponseEntity.ok(buildData(acc));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Lettura dello stock non riuscita: " + e.getMessage()));
        }
    }

    @PostMapping("/import")
    public ResponseEntity<?> importa(@RequestBody Map<String, Object> body, HttpSession session) {
        String acc = access(session);
        if (!puoModificare(acc)) return negato(acc);
        Long userId = (Long) session.getAttribute("userId");

        Object raw = body.get("rows");
        if (!(raw instanceof List<?> lista) || lista.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Il file non contiene vetture"));
        }
        if (lista.size() > MAX_RIGHE) {
            return ResponseEntity.badRequest().body(Map.of("error", "Troppe righe nel file (" + lista.size() + ")"));
        }
        // Ogni riga deve essere un oggetto con almeno marca e modello
        for (Object o : lista) {
            if (!(o instanceof Map<?, ?> m) || m.get("marca") == null || m.get("modello") == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Formato dello stock non valido (manca marca o modello)"));
            }
        }
        try {
            ConsegneDataset d = repository.findById(CHIAVE).orElseGet(() -> {
                ConsegneDataset n = new ConsegneDataset();
                n.setTipo(CHIAVE);
                return n;
            });
            d.setContenuto(objectMapper.writeValueAsString(lista));
            d.setRighe(lista.size());
            d.setAggiornatoAt(LocalDateTime.now(ZoneId.of("Europe/Rome")));
            d.setAggiornatoDa(nomeUtente(userId));
            repository.save(d);
            return ResponseEntity.ok(buildData(acc));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Salvataggio dello stock non riuscito: " + e.getMessage()));
        }
    }

    private Map<String, Object> buildData(String acc) throws Exception {
        Map<String, Object> out = new HashMap<>();
        Optional<ConsegneDataset> d = repository.findById(CHIAVE);
        if (d.isPresent() && d.get().getContenuto() != null) {
            ConsegneDataset ds = d.get();
            Map<String, Object> s = new HashMap<>();
            s.put("rows", objectMapper.readValue(ds.getContenuto(), new TypeReference<List<Map<String, Object>>>() {}));
            s.put("righe", ds.getRighe());
            // stessa forma usata da Consegne: data/ora in ISO con il fuso di Roma
            s.put("aggiornatoAt", ds.getAggiornatoAt() == null ? null
                    : ds.getAggiornatoAt().atZone(ZoneId.of("Europe/Rome")).toOffsetDateTime().toString());
            s.put("aggiornatoDa", ds.getAggiornatoDa());
            out.put("stock", s);
        } else {
            out.put("stock", null);
        }
        out.put("puoImportare", puoModificare(acc));
        out.put("puoModificare", puoModificare(acc));
        return out;
    }

    private String nomeUtente(Long userId) {
        return userRepository.findById(userId)
                .map(User::getFullName)
                .filter(n -> n != null && !n.isBlank())
                .orElse("Utente " + userId);
    }
}
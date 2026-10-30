package com.gruppoautoscala.followup.controller;

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
 * CONTRATTI RADAR — export "RadaR_Contratti_aaaammgg.xlsx" del gestionale.
 *
 * Il file Excel si legge NEL BROWSER (/js/import-fonti.js, libreria XLSX gia' caricata)
 * e arriva qui gia' ridotto alle colonne che servono. Serve a due cose:
 *  1) "Importa trattative" di Commerciale e Consegne: si puo' caricare da Leadspark,
 *     da RadaR o da tutti e due (la scelta la fa la pagina, qui si salva solo RadaR);
 *  2) la sezione "Giacenza alla vendita" del Commerciale: RadaR ha la data di ingresso
 *     in stock e i giorni di giacenza di ogni vettura venduta.
 *
 *  GET  /api/radar/contratti   -> ultimo file RadaR caricato (righe + chi/quando)
 *  POST /api/radar/contratti   -> { rows: [...], file: "nome.xlsx" } sostituisce il precedente
 *
 * Salvataggio: tabella consegne_dataset (nessuna tabella nuova), chiave "RADAR_CONTRATTI".
 * Permessi (pagina Permessi): vedere = almeno "Solo lettura" su COMMERCIALE o CONSEGNE;
 * caricare = "Completo" su COMMERCIALE o CONSEGNE (gli stessi che importano le trattative).
 */
@RestController
@RequestMapping("/api/radar")
public class RadarController {

    private static final String CHIAVE = "RADAR_CONTRATTI";
    private static final ZoneId ITALY = ZoneId.of("Europe/Rome");

    @Autowired private ConsegneDatasetRepository repository;
    @Autowired private UserRepository userRepository;
    @Autowired private RolePermissionService rolePermissionService;
    @Autowired private ObjectMapper objectMapper;

    private boolean almeno(HttpSession session, String livello) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return false;
        for (String sez : List.of("COMMERCIALE", "CONSEGNE"))
            if (rolePermissionService.hasAtLeast(rolePermissionService.getEffectiveAccess(userId, role, sez), livello)) return true;
        return false;
    }

    private String nome(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        return userId == null ? null : userRepository.findById(userId).map(User::getFullName).orElse(null);
    }

    @GetMapping("/contratti")
    public ResponseEntity<?> leggi(HttpSession session) {
        if (session.getAttribute("userId") == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!almeno(session, "READ_ONLY")) return ResponseEntity.status(403).body(Map.of("error", "Non hai il permesso per i contratti RadaR"));
        Map<String, Object> out = new LinkedHashMap<>();
        Optional<ConsegneDataset> d = repository.findById(CHIAVE);
        if (d.isPresent()) {
            try {
                Map<?, ?> c = objectMapper.readValue(d.get().getContenuto(), Map.class);
                out.put("rows", c.get("rows"));
                out.put("file", c.get("file"));
            } catch (Exception e) { out.put("rows", List.of()); }
            out.put("righe", d.get().getRighe());
            out.put("aggiornatoAt", d.get().getAggiornatoAt() != null ? d.get().getAggiornatoAt().toString() : null);
            out.put("aggiornatoDa", d.get().getAggiornatoDa());
        } else {
            out.put("rows", List.of());
            out.put("righe", 0);
        }
        out.put("puoImportare", almeno(session, "FULL"));
        return ResponseEntity.ok(out);
    }

    @PostMapping("/contratti")
    public synchronized ResponseEntity<?> salva(@RequestBody Map<String, Object> body, HttpSession session) {
        if (session.getAttribute("userId") == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!almeno(session, "FULL")) return ResponseEntity.status(403).body(Map.of("error", "Per caricare il file RadaR serve il permesso Completo sul Commerciale o sulle Consegne"));
        Object rows = body.get("rows");
        if (!(rows instanceof List<?> lista) || lista.isEmpty())
            return ResponseEntity.badRequest().body(Map.of("error", "Il file RadaR non contiene contratti"));
        try {
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("rows", lista);
            c.put("file", String.valueOf(body.getOrDefault("file", "")));
            ConsegneDataset d = repository.findById(CHIAVE).orElseGet(() -> { ConsegneDataset n = new ConsegneDataset(); n.setTipo(CHIAVE); return n; });
            d.setContenuto(objectMapper.writeValueAsString(c));
            d.setRighe(lista.size());
            d.setAggiornatoAt(LocalDateTime.now(ITALY));   // ora italiana (il server e' in UTC)
            d.setAggiornatoDa(nome(session));
            repository.save(d);
            return leggi(session);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "File RadaR non salvato: " + e.getMessage()));
        }
    }
}
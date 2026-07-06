package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.Promo;
import com.gruppoautoscala.followup.model.PromoContact;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.PromoContactRepository;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.PromoService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/promos")
public class PromoController {

    @Autowired
    private PromoService promoService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PromoContactRepository promoContactRepository;

    private boolean canManage(HttpSession session) {
        String role = (String) session.getAttribute("userRole");
        return "ADMIN".equals(role) || "GESTORE".equals(role) || "MODERATORE".equals(role);
    }

    private Map<String, Object> promoToMap(Promo p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", p.getId());
        m.put("nome", p.getNome());
        m.put("marchi", p.getMarchi());
        m.put("modelli", p.getModelli());
        m.put("consentiInserimentoManuale", p.getConsentiInserimentoManuale());
        m.put("dataInizio", p.getDataInizio().toString());
        m.put("dataScadenza", p.getDataScadenza().toString());
        m.put("stato", p.getStato());
        m.put("createdAt", p.getCreatedAt().toString());
        if (p.getCreatedBy() != null) m.put("createdBy", p.getCreatedBy().getFullName());
        return m;
    }

    // ===== GET PROMO ATTIVE (tutti gli utenti autenticati) =====
    @GetMapping("/attive")
    public ResponseEntity<?> getAttive(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        List<Map<String, Object>> result = promoService.getAttive().stream().map(this::promoToMap).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    // ===== GET ARCHIVIO (solo gestori+) =====
    @GetMapping("/archivio")
    public ResponseEntity<?> getArchivio(HttpSession session) {
        if (!canManage(session)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        List<Map<String, Object>> result = promoService.getArchiviate().stream().map(this::promoToMap).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    // ===== CREA PROMO =====
    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body, HttpSession session) {
        if (!canManage(session)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        Long userId = (Long) session.getAttribute("userId");
        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));

        String nome = (String) body.get("nome");
        String marchi = (String) body.get("marchi");
        String modelli = (String) body.get("modelli");
        Boolean consenti = body.get("consentiInserimentoManuale") == null ? true : (Boolean) body.get("consentiInserimentoManuale");
        LocalDate dataInizio = LocalDate.parse((String) body.get("dataInizio"));
        LocalDate dataScadenza = LocalDate.parse((String) body.get("dataScadenza"));

        if (nome == null || nome.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "Nome obbligatorio"));
        if (marchi == null || marchi.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "Almeno un marchio obbligatorio"));

        Promo promo = promoService.create(nome, marchi, modelli, consenti, dataInizio, dataScadenza, userOpt.get());
        return ResponseEntity.ok(promoToMap(promo));
    }

    // ===== MODIFICA PROMO =====
    @PatchMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody Map<String, Object> body, HttpSession session) {
        if (!canManage(session)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        Optional<Promo> promoOpt = promoService.getById(id);
        if (promoOpt.isEmpty()) return ResponseEntity.notFound().build();
        Promo promo = promoOpt.get();
        if (body.containsKey("nome")) promo.setNome((String) body.get("nome"));
        if (body.containsKey("marchi")) promo.setMarchi((String) body.get("marchi"));
        if (body.containsKey("modelli")) promo.setModelli((String) body.get("modelli"));
        if (body.containsKey("consentiInserimentoManuale")) promo.setConsentiInserimentoManuale((Boolean) body.get("consentiInserimentoManuale"));
        if (body.containsKey("dataInizio")) promo.setDataInizio(LocalDate.parse((String) body.get("dataInizio")));
        if (body.containsKey("dataScadenza")) promo.setDataScadenza(LocalDate.parse((String) body.get("dataScadenza")));
        return ResponseEntity.ok(promoToMap(promoService.update(promo)));
    }

    // ===== ANNULLA PROMO =====
    @PostMapping("/{id}/annulla")
    public ResponseEntity<?> annulla(@PathVariable Long id, HttpSession session) {
        if (!canManage(session)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        promoService.annulla(id);
        return ResponseEntity.ok(Map.of("message", "Promo annullata"));
    }

    // ===== ELIMINA PROMO =====
    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id, HttpSession session) {
        String role = (String) session.getAttribute("userRole");
        if (!"ADMIN".equals(role) && !"GESTORE".equals(role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        promoService.delete(id);
        return ResponseEntity.ok(Map.of("message", "Promo eliminata"));
    }

    // ===== STATISTICHE PROMO =====
    @GetMapping("/{id}/stats")
    public ResponseEntity<?> getStats(@PathVariable Long id, HttpSession session) {
        if (!canManage(session)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        Optional<Promo> promoOpt = promoService.getById(id);
        if (promoOpt.isEmpty()) return ResponseEntity.notFound().build();

        List<PromoContact> contacts = promoService.getContactsByPromo(id);
        int total = contacts.size();

        // Conteggio per modello
        Map<String, Integer> perModello = new LinkedHashMap<>();
        contacts.forEach(c -> { if (c.getModelloRichiesto() != null) perModello.merge(c.getModelloRichiesto(), 1, Integer::sum); });

        // Appuntamenti
        long appuntamenti = contacts.stream().filter(c -> Boolean.TRUE.equals(c.getAppuntamento())).count();
        Map<String, Integer> appPerSede = new LinkedHashMap<>();
        contacts.stream().filter(c -> Boolean.TRUE.equals(c.getAppuntamento()) && c.getSedeAppuntamento() != null)
                .forEach(c -> appPerSede.merge(c.getSedeAppuntamento(), 1, Integer::sum));

        // Richiesta promo
        long richiestaPromoSi = contacts.stream().filter(c -> Boolean.TRUE.equals(c.getRichiestaPromo())).count();
        long testDriveSi = contacts.stream().filter(c -> Boolean.TRUE.equals(c.getTestDrive())).count();

        // Elenco contatti
        List<Map<String, Object>> elenco = contacts.stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("modelloRichiesto", c.getModelloRichiesto());
            m.put("richiestaPromo", c.getRichiestaPromo());
            m.put("propostaPromo", c.getPropostaPromo());
            m.put("testDrive", c.getTestDrive());
            m.put("appuntamento", c.getAppuntamento());
            m.put("sedeAppuntamento", c.getSedeAppuntamento());
            m.put("createdAt", c.getCreatedAt().toString());
            return m;
        }).collect(Collectors.toList());

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", total);
        stats.put("perModello", perModello);
        stats.put("appuntamenti", appuntamenti);
        stats.put("appPerSede", appPerSede);
        stats.put("richiestaPromoSi", richiestaPromoSi);
        stats.put("richiestaPromoNo", total - richiestaPromoSi);
        stats.put("testDriveSi", testDriveSi);
        stats.put("elenco", elenco);
        return ResponseEntity.ok(stats);
    }

    // ===== SALVA CONTATTO PROMO =====
    @PostMapping("/{id}/contacts")
    public ResponseEntity<?> createContact(@PathVariable Long id, @RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<Promo> promoOpt = promoService.getById(id);
        if (promoOpt.isEmpty()) return ResponseEntity.notFound().build();

        PromoContact pc = new PromoContact();
        pc.setPromo(promoOpt.get());
        pc.setModelloRichiesto((String) body.get("modelloRichiesto"));
        pc.setRichiestaPromo(Boolean.TRUE.equals(body.get("richiestaPromo")));
        pc.setPropostaPromo(Boolean.TRUE.equals(body.get("propostaPromo")));
        pc.setTestDrive(Boolean.TRUE.equals(body.get("testDrive")));
        pc.setAppuntamento(Boolean.TRUE.equals(body.get("appuntamento")));
        pc.setSedeAppuntamento((String) body.get("sedeAppuntamento"));

        PromoContact saved = promoService.createContact(pc);
        return ResponseEntity.ok(Map.of("id", saved.getId(), "message", "Contatto promo salvato"));
    }
}
package com.gruppoautoscala.followup.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruppoautoscala.followup.model.ConsegneDataset;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.ConsegneDatasetRepository;
import com.gruppoautoscala.followup.repository.UserRepository;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;

/**
 * REGISTRO DOPPIE CHIAVI del Front Office — scheda "Doppie chiavi" di Appuntamenti e ingressi (/js/salone-fo.js)
 *
 * Una vettura consegnata senza la seconda chiave si registra (nome, cognome, marchio, modello, targa, note):
 *   MANCA       la seconda chiave manca
 *   SEDE        la chiave e' arrivata in sede: si avvisa il cliente (ogni chiamata / messaggio resta segnato)
 *   CONSEGNATA  la chiave e' stata data al cliente: archivio
 *
 * Chi lo usa: Front Office e dal Moderatore in su.
 *   GET  /api/doppie-chiavi                 -> {voci, io, puoEliminare}
 *   POST /api/doppie-chiavi                 -> {nome, cognome, marca, modello, targa, note, allertId?}
 *   POST /api/doppie-chiavi/{id}            -> {azione: "sede" | "chiamata" | "messaggio" | "consegnata"
 *                                                | "annullaTentativo" | "rimettiInSede" | "modifica" | "elimina", ...campi}
 *
 * Dati nella tabella consegne_dataset, chiave DOPPIE_CHIAVI (nessuna tabella nuova). Orari in millisecondi.
 */
@RestController
@RequestMapping("/api/doppie-chiavi")
public class DoppieChiaviController {

    private static final String CHIAVE = "DOPPIE_CHIAVI";
    private static final ZoneId ITALY = ZoneId.of("Europe/Rome");
    public static final Set<String> RUOLI = Set.of("FRONT_OFFICE", "MODERATORE", "GESTORE", "ADMIN");
    private static final Set<String> CAPI = Set.of("MODERATORE", "GESTORE", "ADMIN");
    private static final Object LOCK = new Object();

    @Autowired private ConsegneDatasetRepository repository;
    @Autowired private UserRepository userRepository;
    @Autowired private ObjectMapper objectMapper;

    private volatile List<Map<String, Object>> cache = null;

    private record Chi(Long id, String role, String nome) { }
    private Chi chi(HttpSession s) {
        Long id = (Long) s.getAttribute("userId");
        String role = (String) s.getAttribute("userRole");
        if (id == null || role == null || !RUOLI.contains(role)) return null;
        return new Chi(id, role, userRepository.findById(id).map(User::getFullName).orElse(""));
    }
    private static ResponseEntity<?> no(HttpSession s) {
        return s.getAttribute("userId") == null ? ResponseEntity.status(401).body(Map.of("error", "Non autenticato"))
                : ResponseEntity.status(403).body(Map.of("error", "Il registro doppie chiavi e' del Front Office"));
    }
    private static String str(Object o) { return o == null ? "" : String.valueOf(o).trim(); }
    private static String corto(Object o, int max) { String t = str(o); return t.length() > max ? t.substring(0, max) : t; }

    /* ---------- archivio ---------- */
    private List<Map<String, Object>> voci() {
        List<Map<String, Object>> c = cache;
        if (c != null) return c;
        List<Map<String, Object>> letto = new ArrayList<>();
        repository.findById(CHIAVE).ifPresent(d -> {
            try {
                List<Map<String, Object>> l = objectMapper.readValue(d.getContenuto(), new TypeReference<List<Map<String, Object>>>() {});
                if (l != null) letto.addAll(l);
            } catch (Exception ignored) { }
        });
        cache = letto;
        return letto;
    }
    private void salva(List<Map<String, Object>> l, String chi) throws Exception {
        ConsegneDataset d = repository.findById(CHIAVE).orElseGet(() -> { ConsegneDataset n = new ConsegneDataset(); n.setTipo(CHIAVE); return n; });
        d.setContenuto(objectMapper.writeValueAsString(l));
        d.setRighe(l.size());
        d.setAggiornatoAt(LocalDateTime.now(ITALY));
        d.setAggiornatoDa(chi);
        repository.save(d);
        cache = l;
    }
    private static Map<String, Object> copia(Map<String, Object> v) {
        Map<String, Object> m = new LinkedHashMap<>(v);
        if (v.get("tentativi") instanceof List<?> t) m.put("tentativi", new ArrayList<>(t));
        return m;
    }

    @GetMapping
    public ResponseEntity<?> elenco(HttpSession s) {
        Chi c = chi(s); if (c == null) return no(s);
        Map<String, Object> out = new LinkedHashMap<>();
        synchronized (LOCK) { out.put("voci", new ArrayList<>(voci())); }
        out.put("io", Map.of("id", c.id(), "nome", c.nome(), "role", c.role()));
        out.put("puoEliminare", CAPI.contains(c.role()));
        return ResponseEntity.ok(out);
    }

    @PostMapping
    public ResponseEntity<?> registra(@RequestBody Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (c == null) return no(s);
        String nome = corto(b.get("nome"), 80), cognome = corto(b.get("cognome"), 80), targa = corto(b.get("targa"), 12).toUpperCase().replaceAll("\\s+", "");
        if (nome.isEmpty() && cognome.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Scrivi nome o cognome del cliente"));
        if (targa.isEmpty() && str(b.get("modello")).isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Scrivi almeno la targa o il modello"));
        long now = System.currentTimeMillis();
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("id", Long.toString(now, 36) + UUID.randomUUID().toString().substring(0, 4));
        v.put("nome", nome); v.put("cognome", cognome);
        v.put("marca", corto(b.get("marca"), 60)); v.put("modello", corto(b.get("modello"), 80)); v.put("targa", targa);
        v.put("note", corto(b.get("note"), 1000));
        v.put("stato", "MANCA");
        v.put("registrataAt", now); v.put("registrataDa", c.nome());
        if (!str(b.get("allertId")).isEmpty()) { try { v.put("allertId", Long.valueOf(str(b.get("allertId")))); } catch (NumberFormatException ignored) { } }
        v.put("tentativi", new ArrayList<>());
        synchronized (LOCK) {
            List<Map<String, Object>> l = new ArrayList<>(voci());
            l.add(0, v);
            try { salva(l, c.nome()); } catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", "Non salvato: " + e.getMessage())); }
        }
        return ResponseEntity.ok(Map.of("voce", v));
    }

    @PostMapping("/{id}")
    public ResponseEntity<?> azione(@PathVariable String id, @RequestBody Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (c == null) return no(s);
        String azione = str(b.get("azione"));
        long now = System.currentTimeMillis();
        synchronized (LOCK) {
            List<Map<String, Object>> l = new ArrayList<>(voci());
            int i = -1;
            for (int k = 0; k < l.size(); k++) if (id.equals(str(l.get(k).get("id")))) { i = k; break; }
            if (i < 0) return ResponseEntity.status(404).body(Map.of("error", "Vettura non trovata nel registro"));
            Map<String, Object> v = copia(l.get(i));
            String stato = str(v.get("stato"));
            @SuppressWarnings("unchecked")
            List<Object> t = v.get("tentativi") instanceof List<?> x ? (List<Object>) x : new ArrayList<>();
            switch (azione) {
                case "sede" -> {
                    if (!"MANCA".equals(stato)) return ResponseEntity.badRequest().body(Map.of("error", "La chiave risulta gia' in sede"));
                    v.put("stato", "SEDE"); v.put("inSedeAt", now); v.put("inSedeDa", c.nome());
                }
                case "chiamata", "messaggio" -> {
                    if (!"SEDE".equals(stato)) return ResponseEntity.badRequest().body(Map.of("error", "Prima segna che la chiave e' in sede"));
                    Map<String, Object> x = new LinkedHashMap<>();
                    x.put("tipo", "chiamata".equals(azione) ? "C" : "M"); x.put("at", now); x.put("da", c.nome()); x.put("daId", c.id());
                    String nota = corto(b.get("nota"), 300); if (!nota.isEmpty()) x.put("nota", nota);
                    t.add(x); v.put("tentativi", t);
                }
                case "annullaTentativo" -> {
                    // solo l'ultimo, e solo se e' suo e di meno di 10 minuti fa (un clic per sbaglio); dal Moderatore in su sempre
                    if (t.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Nessun tentativo da togliere"));
                    @SuppressWarnings("unchecked") Map<String, Object> ult = (Map<String, Object>) t.get(t.size() - 1);
                    boolean mio = c.id().equals(ult.get("daId") instanceof Number n ? n.longValue() : -1L);
                    long quando = ult.get("at") instanceof Number n ? n.longValue() : 0L;
                    if (!CAPI.contains(c.role()) && !(mio && now - quando < 10 * 60 * 1000L))
                        return ResponseEntity.status(403).body(Map.of("error", "Puoi togliere solo il tuo ultimo tentativo, entro 10 minuti"));
                    t.remove(t.size() - 1); v.put("tentativi", t);
                }
                case "consegnata" -> {
                    if ("CONSEGNATA".equals(stato)) return ResponseEntity.badRequest().body(Map.of("error", "Chiave gia' consegnata"));
                    if ("MANCA".equals(stato)) { v.put("inSedeAt", now); v.put("inSedeDa", c.nome()); }
                    v.put("stato", "CONSEGNATA"); v.put("consegnataAt", now); v.put("consegnataDa", c.nome());
                }
                case "rimettiInSede" -> {
                    if (!"CONSEGNATA".equals(stato)) return ResponseEntity.badRequest().body(Map.of("error", "La chiave non risulta consegnata"));
                    v.put("stato", "SEDE"); v.remove("consegnataAt"); v.remove("consegnataDa");
                }
                case "modifica" -> {
                    for (String k : List.of("nome", "cognome", "marca", "modello", "note"))
                        if (b.containsKey(k)) v.put(k, corto(b.get(k), "note".equals(k) ? 1000 : 80));
                    if (b.containsKey("targa")) v.put("targa", corto(b.get("targa"), 12).toUpperCase().replaceAll("\\s+", ""));
                    v.put("modificataAt", now); v.put("modificataDa", c.nome());
                }
                case "elimina" -> {
                    boolean suaRecente = c.nome().equals(str(v.get("registrataDa"))) && "MANCA".equals(stato) && t.isEmpty();
                    if (!CAPI.contains(c.role()) && !suaRecente)
                        return ResponseEntity.status(403).body(Map.of("error", "Puo' eliminarla solo un Moderatore o chi l'ha registrata (finche' la chiave manca)"));
                    l.remove(i);
                    try { salva(l, c.nome()); } catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", e.getMessage())); }
                    return ResponseEntity.ok(Map.of("eliminata", true));
                }
                default -> { return ResponseEntity.badRequest().body(Map.of("error", "Azione non valida")); }
            }
            l.set(i, v);
            try { salva(l, c.nome()); } catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", "Non salvato: " + e.getMessage())); }
            return ResponseEntity.ok(Map.of("voce", v));
        }
    }
}
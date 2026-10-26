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
 * CHAT del BDC (sezione In bound) — usata da /js/chat-bdc.js
 *
 * Chi la usa: ruoli BDC (UTENTE), BACK_OFFICE e ADMIN (account attivi).
 * Conversazioni:
 *   TUTTI      gruppo con tutti
 *   P_a_b      chat singola tra l'utente a e l'utente b (a < b)
 *   G_<id>     gruppi creati dall'ADMIN (nome + membri; l'Admin li vede tutti)
 *
 *  GET  /api/chat/stato                     -> io, colleghi della chat, gruppi miei, se posso creare gruppi
 *  GET  /api/chat/aggiornamenti?dopo=<ms>   -> per ogni mia conversazione: messaggi nuovi/modificati e non letti
 *  POST /api/chat/messaggi                  -> {conv, testo, rispostaA?, allert?:{id, cliente, tipo, stato}}
 *  POST /api/chat/reazione                  -> {conv, id, emoji}
 *  POST /api/chat/letto                     -> {conv}
 *  POST /api/chat/gruppi                    -> {nome, membri:[id]}                     (solo ADMIN)
 *  POST /api/chat/gruppi/{id}               -> {nome?, membri?, elimina?:true}         (solo ADMIN)
 *
 * Dati nella tabella consegne_dataset (nessuna tabella nuova):
 *   CHAT_MSG_<conv>   messaggi (ultimi 1500)     CHAT_INDICE   chat singole create
 *   CHAT_GRUPPI       gruppi                     CHAT_LETTI    fin dove ognuno ha letto
 * Tutto resta anche in memoria (CACHE): le pagine chiedono aggiornamenti ogni pochi secondi.
 */
@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private static final ZoneId ITALY = ZoneId.of("Europe/Rome");
    /** ruoli che hanno la chat */
    public static final Set<String> RUOLI = Set.of("UTENTE", "BACK_OFFICE", "ADMIN");
    private static final int MAX_MSG = 1500, PRIMA_VOLTA = 200;
    private static final Object LOCK = new Object();

    @Autowired private ConsegneDatasetRepository repository;
    @Autowired private UserRepository userRepository;
    @Autowired private ObjectMapper objectMapper;

    /* ================= chi sono ================= */
    private record Chi(Long id, String role, String nome) { }
    private Chi chi(HttpSession s) {
        Long id = (Long) s.getAttribute("userId");
        String role = (String) s.getAttribute("userRole");
        if (id == null || role == null || !RUOLI.contains(role)) return null;
        return new Chi(id, role, userRepository.findById(id).map(User::getFullName).orElse(""));
    }
    private static ResponseEntity<?> no(HttpSession s) {
        return s.getAttribute("userId") == null ? ResponseEntity.status(401).body(Map.of("error", "Non autenticato"))
                : ResponseEntity.status(403).body(Map.of("error", "La chat non e' attiva per il tuo ruolo"));
    }
    private static boolean attivo(User u) { return u != null && u.getRole() != null && RUOLI.contains(u.getRole()); }
    private static String str(Object o) { return o == null ? "" : String.valueOf(o).trim(); }
    private static long num(Object o) { return o instanceof Number n ? n.longValue() : 0; }

    /* ================= archivio (consegne_dataset + memoria) ================= */
    private record Voce(String json, ConsegneDataset ent) { }
    private static final Map<String, Optional<Voce>> CACHE = new java.util.concurrent.ConcurrentHashMap<>();
    private Optional<Voce> voce(String key) {
        Optional<Voce> v = CACHE.get(key);
        if (v != null) return v;
        v = repository.findById(key).map(d -> new Voce(d.getContenuto(), d));
        CACHE.put(key, v);
        return v;
    }
    private <T> T leggi(String key, TypeReference<T> tipo, T vuoto) {
        return voce(key).map(v -> { try { T t = objectMapper.readValue(v.json(), tipo); return t == null ? vuoto : t; } catch (Exception e) { return vuoto; } }).orElse(vuoto);
    }
    private List<Map<String, Object>> messaggi(String conv) { return leggi("CHAT_MSG_" + conv, new TypeReference<List<Map<String, Object>>>() {}, new ArrayList<>()); }
    private List<String> indice() { return leggi("CHAT_INDICE", new TypeReference<List<String>>() {}, new ArrayList<>()); }
    private List<Map<String, Object>> gruppi() { return leggi("CHAT_GRUPPI", new TypeReference<List<Map<String, Object>>>() {}, new ArrayList<>()); }
    private Map<String, Map<String, Object>> letti() { return leggi("CHAT_LETTI", new TypeReference<Map<String, Map<String, Object>>>() {}, new HashMap<>()); }
    private void scrivi(String key, Object dato, int righe, String chi) throws Exception {
        String json = objectMapper.writeValueAsString(dato);
        Optional<Voce> prima = voce(key);
        if (prima.isPresent() && json.equals(prima.get().json())) return;
        ConsegneDataset d = prima.map(Voce::ent).orElseGet(() -> { ConsegneDataset n = new ConsegneDataset(); n.setTipo(key); return n; });
        d.setContenuto(json);
        d.setRighe(righe);
        d.setAggiornatoAt(LocalDateTime.now(ITALY));
        d.setAggiornatoDa(chi);
        ConsegneDataset salvato = repository.save(d);
        CACHE.put(key, Optional.of(new Voce(json, salvato)));
    }

    /* ================= conversazioni ================= */
    private static List<Long> membri(Map<String, Object> g) {
        List<Long> out = new ArrayList<>();
        if (g.get("membri") instanceof List<?> l) for (Object o : l) { try { out.add(Long.valueOf(String.valueOf(o))); } catch (NumberFormatException ignored) { } }
        return out;
    }
    private Map<String, Object> gruppo(String id) { return gruppi().stream().filter(g -> id.equals(str(g.get("id")))).findFirst().orElse(null); }
    /** la conversazione se l'utente ne fa parte, altrimenti null */
    private String convValida(String conv, Chi c) {
        if ("TUTTI".equals(conv)) return conv;
        if (conv == null) return null;
        if (conv.matches("P_\\d+_\\d+")) {
            String[] p = conv.split("_");
            long a = Long.parseLong(p[1]), b = Long.parseLong(p[2]);
            return a < b && (a == c.id() || b == c.id()) ? conv : null;
        }
        if (conv.matches("G_[a-z0-9]{4,20}")) {
            Map<String, Object> g = gruppo(conv.substring(2));
            return g != null && ("ADMIN".equals(c.role()) || membri(g).contains(c.id())) ? conv : null;
        }
        return null;
    }
    private List<String> mieConv(Chi c) {
        List<String> out = new ArrayList<>(List.of("TUTTI"));
        for (Map<String, Object> g : gruppi()) if ("ADMIN".equals(c.role()) || membri(g).contains(c.id())) out.add("G_" + str(g.get("id")));
        for (String k : indice()) if (convValida(k, c) != null) out.add(k);
        return out;
    }

    @GetMapping("/stato")
    public ResponseEntity<?> stato(HttpSession s) {
        Chi c = chi(s); if (c == null) return no(s);
        List<Map<String, Object>> ut = new ArrayList<>();
        for (User u : userRepository.findAll())
            if (attivo(u) && !c.id().equals(u.getId())) ut.add(Map.of("id", u.getId(), "nome", str(u.getFullName()), "role", u.getRole()));
        ut.sort(Comparator.comparing(m -> String.valueOf(m.get("nome")), String.CASE_INSENSITIVE_ORDER));
        List<Map<String, Object>> gr = new ArrayList<>();
        for (Map<String, Object> g : gruppi()) if ("ADMIN".equals(c.role()) || membri(g).contains(c.id()))
            gr.add(Map.of("id", "G_" + str(g.get("id")), "nome", str(g.get("nome")), "membri", membri(g)));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("io", Map.of("id", c.id(), "nome", c.nome(), "role", c.role()));
        out.put("utenti", ut);
        out.put("gruppi", gr);
        out.put("puoCreareGruppi", "ADMIN".equals(c.role()));
        return ResponseEntity.ok(out);
    }

    @GetMapping("/aggiornamenti")
    public ResponseEntity<?> aggiornamenti(@RequestParam(required = false, defaultValue = "0") long dopo, HttpSession s) {
        Chi c = chi(s); if (c == null) return no(s);
        Map<String, Object> mieiLetti = letti().getOrDefault(String.valueOf(c.id()), Map.of());
        Map<String, Object> conv = new LinkedHashMap<>();
        long max = dopo;
        for (String k : mieConv(c)) {
            List<Map<String, Object>> l = messaggi(k), nuovi = new ArrayList<>();
            long letto = num(mieiLetti.get(k));
            int nonLetti = 0;
            for (Map<String, Object> m : l) {
                long agg = num(m.get("agg")), ts = num(m.get("ts"));
                if (agg > dopo) nuovi.add(m);
                if (ts > letto && num(m.get("da")) != c.id()) nonLetti++;
                max = Math.max(max, agg);
            }
            if (dopo == 0 && nuovi.size() > PRIMA_VOLTA) nuovi = new ArrayList<>(nuovi.subList(nuovi.size() - PRIMA_VOLTA, nuovi.size()));
            conv.put(k, Map.of("messaggi", nuovi, "nonLetti", nonLetti, "letto", letto));
        }
        return ResponseEntity.ok(Map.of("conv", conv, "ora", max));
    }

    @PostMapping("/messaggi")
    public ResponseEntity<?> invia(@RequestBody Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (c == null) return no(s);
        String conv = convValida(str(b.get("conv")), c);
        if (conv == null) return ResponseEntity.badRequest().body(Map.of("error", "Conversazione non valida"));
        if (conv.startsWith("P_")) {
            String[] p = conv.split("_");
            long altro = Long.parseLong(p[1]) == c.id() ? Long.parseLong(p[2]) : Long.parseLong(p[1]);
            if (!attivo(userRepository.findById(altro).orElse(null)))
                return ResponseEntity.status(403).body(Map.of("error", "Questa persona non ha la chat"));
        }
        String testo = str(b.get("testo"));
        Map<String, Object> allert = null;
        if (b.get("allert") instanceof Map<?, ?> a) {
            allert = new LinkedHashMap<>();
            try { allert.put("id", Long.valueOf(str(a.get("id")))); } catch (NumberFormatException e) { return ResponseEntity.badRequest().body(Map.of("error", "Allert non valido")); }
            for (String f : List.of("cliente", "tipo", "stato")) { String v = str(a.get(f)); allert.put(f, v.length() > 80 ? v.substring(0, 80) : v); }
        }
        if (testo.isEmpty() && allert == null) return ResponseEntity.badRequest().body(Map.of("error", "Messaggio vuoto"));
        if (testo.length() > 4000) testo = testo.substring(0, 4000);
        long now = System.currentTimeMillis();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", Long.toString(now, 36) + UUID.randomUUID().toString().substring(0, 4));
        m.put("da", c.id()); m.put("nome", c.nome());
        m.put("testo", testo); m.put("ts", now); m.put("agg", now);
        if (allert != null) m.put("allert", allert);
        String risp = str(b.get("rispostaA"));
        if (!risp.isEmpty() && risp.length() <= 40) m.put("rispostaA", risp);
        m.put("reazioni", new LinkedHashMap<String, List<String>>());
        synchronized (LOCK) {
            List<Map<String, Object>> l = messaggi(conv);
            l.add(m);
            while (l.size() > MAX_MSG) l.remove(0);
            try {
                if (conv.startsWith("P_")) { List<String> ind = indice(); if (!ind.contains(conv)) { ind.add(conv); scrivi("CHAT_INDICE", ind, ind.size(), c.nome()); } }
                scrivi("CHAT_MSG_" + conv, l, l.size(), c.nome());
                segnaLetto(c.id(), conv, now);
            } catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", "Messaggio non inviato: " + e.getMessage())); }
        }
        return ResponseEntity.ok(Map.of("messaggio", m));
    }

    @SuppressWarnings("unchecked")
    @PostMapping("/reazione")
    public ResponseEntity<?> reazione(@RequestBody Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (c == null) return no(s);
        String conv = convValida(str(b.get("conv")), c), id = str(b.get("id")), emoji = str(b.get("emoji"));
        if (conv == null || emoji.isEmpty() || emoji.length() > 16) return ResponseEntity.badRequest().body(Map.of("error", "Reazione non valida"));
        synchronized (LOCK) {
            List<Map<String, Object>> l = messaggi(conv);
            Map<String, Object> m = l.stream().filter(x -> id.equals(x.get("id"))).findFirst().orElse(null);
            if (m == null) return ResponseEntity.status(404).body(Map.of("error", "Messaggio non trovato"));
            Map<String, Object> rz = m.get("reazioni") instanceof Map ? (Map<String, Object>) m.get("reazioni") : new LinkedHashMap<>();
            List<Object> chi = rz.get(emoji) instanceof List ? new ArrayList<>((List<Object>) rz.get(emoji)) : new ArrayList<>();
            if (chi.contains(c.nome())) chi.remove(c.nome()); else chi.add(c.nome());
            if (chi.isEmpty()) rz.remove(emoji); else rz.put(emoji, chi);
            m.put("reazioni", rz);
            m.put("agg", System.currentTimeMillis());
            try { scrivi("CHAT_MSG_" + conv, l, l.size(), c.nome()); }
            catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", e.getMessage())); }
            return ResponseEntity.ok(Map.of("messaggio", m));
        }
    }

    @PostMapping("/letto")
    public ResponseEntity<?> letto(@RequestBody Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (c == null) return no(s);
        String conv = convValida(str(b.get("conv")), c);
        if (conv == null) return ResponseEntity.badRequest().body(Map.of("error", "Conversazione non valida"));
        synchronized (LOCK) {
            try { segnaLetto(c.id(), conv, System.currentTimeMillis()); }
            catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", e.getMessage())); }
        }
        return ResponseEntity.ok(Map.of("ok", true));
    }
    private void segnaLetto(Long io, String conv, long ts) throws Exception {
        Map<String, Map<String, Object>> l = letti();
        l.computeIfAbsent(String.valueOf(io), k -> new HashMap<>()).put(conv, ts);
        scrivi("CHAT_LETTI", l, l.size(), null);
    }

    /* ================= gruppi (solo ADMIN) ================= */
    private List<Long> membriValidi(Object o, Long admin) {
        Set<Long> out = new LinkedHashSet<>();
        if (o instanceof List<?> l) for (Object x : l) {
            try { Long id = Long.valueOf(String.valueOf(x)); if (attivo(userRepository.findById(id).orElse(null))) out.add(id); } catch (NumberFormatException ignored) { }
        }
        out.add(admin);   // chi crea il gruppo ne fa parte
        return new ArrayList<>(out);
    }

    @PostMapping("/gruppi")
    public ResponseEntity<?> creaGruppo(@RequestBody Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (c == null) return no(s);
        if (!"ADMIN".equals(c.role())) return ResponseEntity.status(403).body(Map.of("error", "Solo l'Admin crea i gruppi"));
        String nome = str(b.get("nome"));
        if (nome.isEmpty() || nome.length() > 60) return ResponseEntity.badRequest().body(Map.of("error", "Scrivi il nome del gruppo (massimo 60 caratteri)"));
        List<Long> m = membriValidi(b.get("membri"), c.id());
        if (m.size() < 2) return ResponseEntity.badRequest().body(Map.of("error", "Scegli almeno una persona"));
        Map<String, Object> g = new LinkedHashMap<>();
        g.put("id", Long.toString(System.currentTimeMillis(), 36));
        g.put("nome", nome); g.put("membri", m); g.put("creatoDa", c.nome()); g.put("at", System.currentTimeMillis());
        synchronized (LOCK) {
            List<Map<String, Object>> l = gruppi(); l.add(g);
            try { scrivi("CHAT_GRUPPI", l, l.size(), c.nome()); }
            catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", e.getMessage())); }
        }
        return ResponseEntity.ok(Map.of("gruppo", Map.of("id", "G_" + g.get("id"), "nome", nome, "membri", m)));
    }

    @PostMapping("/gruppi/{id}")
    public ResponseEntity<?> modificaGruppo(@PathVariable String id, @RequestBody Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (c == null) return no(s);
        if (!"ADMIN".equals(c.role())) return ResponseEntity.status(403).body(Map.of("error", "Solo l'Admin modifica i gruppi"));
        String gid = id.startsWith("G_") ? id.substring(2) : id;
        synchronized (LOCK) {
            List<Map<String, Object>> l = gruppi();
            Map<String, Object> g = l.stream().filter(x -> gid.equals(str(x.get("id")))).findFirst().orElse(null);
            if (g == null) return ResponseEntity.status(404).body(Map.of("error", "Gruppo non trovato"));
            try {
                if (Boolean.TRUE.equals(b.get("elimina"))) {
                    l.remove(g);
                    scrivi("CHAT_GRUPPI", l, l.size(), c.nome());
                    scrivi("CHAT_MSG_G_" + gid, new ArrayList<>(), 0, c.nome());
                    return ResponseEntity.ok(Map.of("eliminato", true));
                }
                String nome = str(b.get("nome"));
                if (!nome.isEmpty()) g.put("nome", nome.length() > 60 ? nome.substring(0, 60) : nome);
                if (b.containsKey("membri")) { List<Long> m = membriValidi(b.get("membri"), c.id()); if (m.size() < 2) return ResponseEntity.badRequest().body(Map.of("error", "Scegli almeno una persona")); g.put("membri", m); }
                scrivi("CHAT_GRUPPI", l, l.size(), c.nome());
            } catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", e.getMessage())); }
            return ResponseEntity.ok(Map.of("gruppo", Map.of("id", "G_" + gid, "nome", str(g.get("nome")), "membri", membri(g))));
        }
    }
}
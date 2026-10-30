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
 * AVANZAMENTO — capitolo 04 della BI (pagina /avanzamento.html).
 *
 * Lavorazioni mensili, Dashboard, Cruscotto, Forecast, Database, Plafond Compass e Registro
 * attivita'. Tutti i calcoli li fa la pagina; qui si SALVANO i dati, si tiene il REGISTRO con
 * giorno, ora (orologio del server, la pagina la mostra in ora italiana) e persona di ogni
 * azione, e si controllano i permessi.
 *
 *  GET  /api/avanzamento/data       -> tutto: righe (contratti), altri fogli, registro, versione, utente
 *  GET  /api/avanzamento/versione   -> { v }  (la pagina controlla ogni 15 secondi se qualcuno ha cambiato qualcosa)
 *  GET  /api/avanzamento/delta?da=N -> solo quello che e' cambiato dopo la versione N
 *  POST /api/avanzamento/salva      -> { base, righe:[righe cambiate], tolte:[id], altro:{campo:valore},
 *                                        reg:[voci del registro], regTolte:[id], riepilogo:{...} }
 *  POST /api/avanzamento/iniziale   -> primo caricamento dei dati (file dati-avanzamento.json, dalla pagina)
 *  GET  /api/avanzamento/riepilogo  -> numeri per la plancia della pagina BI (plafond, liquidato mese per mese)
 *
 * PERMESSI (pagina Permessi, sezione AVANZAMENTO, gruppo BI):
 *  - Solo lettura : vede ed esporta
 *  - Completo     : inserisce, modifica, spunta (anche LIQUIDATA)
 *  - Accesso Admin: in piu' toglie la spunta LIQUIDATA, svuota il plafond / annulla lo svuotamento,
 *                   elimina contratti gia' LIQUIDATI, vede il Registro attivita'
 *  Default: Moderatore, Gestore e Admin = Accesso Admin; gli altri niente (si da' dalla pagina Permessi).
 *
 * SALVATAGGIO: tabella consegne_dataset (nessuna tabella nuova), tre chiavi:
 *  AVANZAMENTO_RIGHE (contratti, ognuno con la versione in cui e' cambiato), AVANZAMENTO_ALTRO
 *  (plafond, svuotamenti, forecast, liste dei menu, eliminati...), AVANZAMENTO_REGISTRO (registro).
 *  Ogni salvataggio manda SOLO le righe cambiate: due persone che lavorano su contratti diversi
 *  non si sovrascrivono. Sulla stessa riga vale l'ultimo salvataggio (e il registro tiene tutti e due).
 *  Il registro non si modifica e non si cancella: si puo' solo aggiungere (una voce si aggiorna
 *  solo se e' della stessa persona e degli ultimi 2 minuti: e' la stessa modifica che continua).
 */
@RestController
@RequestMapping("/api/avanzamento")
public class AvanzamentoController {

    private static final String K_RIGHE = "AVANZAMENTO_RIGHE", K_ALTRO = "AVANZAMENTO_ALTRO", K_REG = "AVANZAMENTO_REGISTRO";
    private static final String SEZIONE = "AVANZAMENTO";
    private static final ZoneId ITALY = ZoneId.of("Europe/Rome");
    // campi degli "altri fogli" che la pagina puo' salvare
    private static final Set<String> CAMPI = Set.of("lista", "storico", "prev", "fc", "liste", "eliminati", "svu", "vecchio");
    private static final int REG_MAX_DATA = 30000;   // voci del registro mandate alla pagina (le piu' recenti)

    @Autowired private ConsegneDatasetRepository repository;
    @Autowired private UserRepository userRepository;
    @Autowired private RolePermissionService rolePermissionService;
    @Autowired private ObjectMapper objectMapper;

    /* ---------------- stato in memoria (letto una volta dal database) ---------------- */
    private static class Stato {
        long versione = 0;
        boolean presente = false;
        LinkedHashMap<String, Map<String, Object>> righe = new LinkedHashMap<>();
        Map<String, Long> rv = new HashMap<>();        // id riga -> versione dell'ultima modifica
        Map<String, Long> tolte = new HashMap<>();     // id riga eliminata -> versione
        Map<String, Object> altro = new LinkedHashMap<>();
        Map<String, Long> av = new HashMap<>();        // campo -> versione
        List<Map<String, Object>> reg = new ArrayList<>();   // registro, la voce piu' nuova per prima
    }
    private Stato st;

    @SuppressWarnings("unchecked")
    private synchronized Stato stato() throws Exception {
        if (st != null) return st;
        Stato s = new Stato();
        Optional<ConsegneDataset> r = repository.findById(K_RIGHE);
        if (r.isPresent() && r.get().getContenuto() != null && !r.get().getContenuto().isBlank()) {
            Map<String, Object> c = objectMapper.readValue(r.get().getContenuto(), Map.class);
            s.presente = true;
            s.versione = num(c.get("versione"));
            for (Object o : lista(c.get("righe"))) if (o instanceof Map<?, ?> m) s.righe.put(String.valueOf(m.get("id")), (Map<String, Object>) m);
            mappaNum(c.get("rv"), s.rv);
            mappaNum(c.get("tolte"), s.tolte);
        }
        Optional<ConsegneDataset> a = repository.findById(K_ALTRO);
        if (a.isPresent() && a.get().getContenuto() != null && !a.get().getContenuto().isBlank()) {
            Map<String, Object> c = objectMapper.readValue(a.get().getContenuto(), Map.class);
            if (c.get("campi") instanceof Map<?, ?> m) s.altro.putAll((Map<String, Object>) m);
            mappaNum(c.get("av"), s.av);
        }
        Optional<ConsegneDataset> g = repository.findById(K_REG);
        if (g.isPresent() && g.get().getContenuto() != null && !g.get().getContenuto().isBlank()) {
            Map<String, Object> c = objectMapper.readValue(g.get().getContenuto(), Map.class);
            for (Object o : lista(c.get("voci"))) if (o instanceof Map<?, ?> m) s.reg.add((Map<String, Object>) m);
        }
        st = s;
        return s;
    }
    private static long num(Object o) { return o instanceof Number n ? n.longValue() : 0L; }
    private static List<?> lista(Object o) { return o instanceof List<?> l ? l : List.of(); }
    private static void mappaNum(Object o, Map<String, Long> dest) {
        if (o instanceof Map<?, ?> m) m.forEach((k, v) -> dest.put(String.valueOf(k), num(v)));
    }

    private void scrivi(String chiave, Object contenuto, int righe, String chi) throws Exception {
        ConsegneDataset d = repository.findById(chiave).orElseGet(() -> { ConsegneDataset n = new ConsegneDataset(); n.setTipo(chiave); return n; });
        d.setContenuto(objectMapper.writeValueAsString(contenuto));
        d.setRighe(righe);
        d.setAggiornatoAt(LocalDateTime.now(ITALY));   // ora italiana (il server e' in UTC)
        d.setAggiornatoDa(chi);
        repository.save(d);
    }
    private void salvaRighe(Stato s, String chi) throws Exception {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("versione", s.versione);
        c.put("righe", new ArrayList<>(s.righe.values()));
        c.put("rv", s.rv);
        c.put("tolte", s.tolte);
        scrivi(K_RIGHE, c, s.righe.size(), chi);
    }
    private void salvaAltro(Stato s, String chi) throws Exception {
        scrivi(K_ALTRO, Map.of("campi", s.altro, "av", s.av), s.altro.size(), chi);
    }
    private void salvaReg(Stato s, String chi) throws Exception {
        scrivi(K_REG, Map.of("voci", s.reg), s.reg.size(), chi);
    }

    /* ---------------- permessi ---------------- */
    private String accesso(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return null;
        return rolePermissionService.getEffectiveAccess(userId, role, SEZIONE);
    }
    private boolean almeno(String acc, String liv) { return acc != null && rolePermissionService.hasAtLeast(acc, liv); }
    // livello per la pagina: 0 solo lettura, 1 completo, 3 accesso admin
    private int livello(String acc) { return almeno(acc, "ADMIN_FULL") ? 3 : almeno(acc, "FULL") ? 1 : 0; }
    private String nome(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        return userId == null ? null : userRepository.findById(userId).map(User::getFullName).orElse("Utente " + userId);
    }
    private ResponseEntity<?> no(String acc) {
        if (acc == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        return ResponseEntity.status(403).body(Map.of("error", "Non hai il permesso per l'Avanzamento (pagina Permessi, sezione Avanzamento)"));
    }

    /* ---------------- lettura ---------------- */
    @GetMapping("/data")
    public ResponseEntity<?> data(HttpSession session) {
        String acc = accesso(session);
        if (!almeno(acc, "READ_ONLY")) return no(acc);
        try {
            Stato s = stato();
            Map<String, Object> out = new LinkedHashMap<>();
            synchronized (this) {
                out.put("versione", s.versione);
                out.put("presente", s.presente);
                if (s.presente) {
                    out.put("righe", new ArrayList<>(s.righe.values()));
                    Map<String, Object> altro = new LinkedHashMap<>(s.altro);
                    altro.remove("riepilogo");
                    out.put("altro", altro);
                }
                out.put("registro", livello(acc) >= 3 ? new ArrayList<>(s.reg.subList(0, Math.min(s.reg.size(), REG_MAX_DATA))) : List.of());
            }
            out.put("utente", utente(session, acc));
            out.put("ora", System.currentTimeMillis());
            return ResponseEntity.ok(out);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Dati Avanzamento non letti: " + e.getMessage()));
        }
    }
    private Map<String, Object> utente(HttpSession session, String acc) {
        int l = livello(acc);
        Map<String, Object> u = new LinkedHashMap<>();
        u.put("nome", nome(session));
        u.put("livello", l);
        u.put("accesso", acc);
        u.put("ruolo", l >= 3 ? "Accesso Admin" : l >= 1 ? "Completo" : "Solo lettura");
        u.put("admin", "ADMIN".equals(session.getAttribute("userRole")));
        return u;
    }

    @GetMapping("/versione")
    public ResponseEntity<?> versione(HttpSession session) {
        String acc = accesso(session);
        if (!almeno(acc, "READ_ONLY")) return no(acc);
        try { return ResponseEntity.ok(Map.of("v", stato().versione)); }
        catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", e.getMessage())); }
    }

    @GetMapping("/delta")
    public ResponseEntity<?> delta(@RequestParam(name = "da", defaultValue = "0") long da, HttpSession session) {
        String acc = accesso(session);
        if (!almeno(acc, "READ_ONLY")) return no(acc);
        try { return ResponseEntity.ok(deltaDa(stato(), da, livello(acc) >= 3)); }
        catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", e.getMessage())); }
    }
    private synchronized Map<String, Object> deltaDa(Stato s, long da, boolean conReg) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("versione", s.versione);
        List<Object> righe = new ArrayList<>();
        s.righe.forEach((id, r) -> { if (s.rv.getOrDefault(id, 0L) > da) righe.add(r); });
        out.put("righe", righe);
        List<String> tolte = new ArrayList<>();
        s.tolte.forEach((id, v) -> { if (v > da) tolte.add(id); });
        out.put("tolte", tolte);
        Map<String, Object> altro = new LinkedHashMap<>();
        s.av.forEach((k, v) -> { if (v > da && s.altro.containsKey(k) && !"riepilogo".equals(k)) altro.put(k, s.altro.get(k)); });
        out.put("altro", altro);
        List<Object> reg = new ArrayList<>();
        if (conReg) for (Map<String, Object> v : s.reg) { if (num(v.get("v")) > da) reg.add(v); else break; }
        out.put("registro", reg);
        return out;
    }

    @GetMapping("/riepilogo")
    public ResponseEntity<?> riepilogo(HttpSession session) {
        String acc = accesso(session);
        if (!almeno(acc, "READ_ONLY")) return no(acc);
        try {
            Object r = stato().altro.get("riepilogo");
            return ResponseEntity.ok(r instanceof Map<?, ?> ? r : Map.of());
        } catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", e.getMessage())); }
    }

    /* ---------------- salvataggio ---------------- */
    @PostMapping("/salva")
    @SuppressWarnings("unchecked")
    public synchronized ResponseEntity<?> salva(@RequestBody Map<String, Object> body, HttpSession session) {
        String acc = accesso(session);
        if (!almeno(acc, "FULL")) return no(acc);
        final boolean admin = livello(acc) >= 3;
        final String chi = nome(session);
        try {
            Stato s = stato();
            if (!s.presente) return ResponseEntity.status(409).body(Map.of("error", "I dati dell'Avanzamento non sono ancora stati caricati"));
            long base = num(body.get("base"));
            List<Map<String, Object>> righe = new ArrayList<>();
            for (Object o : lista(body.get("righe"))) if (o instanceof Map<?, ?> m && m.get("id") != null) righe.add((Map<String, Object>) m);
            List<String> tolte = new ArrayList<>();
            for (Object o : lista(body.get("tolte"))) if (o != null) tolte.add(String.valueOf(o));
            Map<String, Object> altro = new LinkedHashMap<>();
            if (body.get("altro") instanceof Map<?, ?> m) m.forEach((k, v) -> { if (CAMPI.contains(String.valueOf(k))) altro.put(String.valueOf(k), v); });

            // controlli: LIQUIDATA si toglie solo con Accesso Admin, come svuotare il plafond
            if (!admin) {
                for (Map<String, Object> r : righe) {
                    Map<String, Object> prima = s.righe.get(String.valueOf(r.get("id")));
                    if (prima != null && Boolean.TRUE.equals(prima.get("liquidata")) && !Boolean.TRUE.equals(r.get("liquidata")))
                        return ResponseEntity.status(403).body(Map.of("error", "Solo chi ha l'Accesso Admin sull'Avanzamento può togliere la spunta LIQUIDATA"));
                }
                for (String id : tolte) {
                    Map<String, Object> prima = s.righe.get(id);
                    if (prima != null && Boolean.TRUE.equals(prima.get("liquidata")))
                        return ResponseEntity.status(403).body(Map.of("error", "Un contratto LIQUIDATO lo elimina solo chi ha l'Accesso Admin sull'Avanzamento"));
                }
                if (altro.containsKey("svu"))
                    return ResponseEntity.status(403).body(Map.of("error", "Solo chi ha l'Accesso Admin sull'Avanzamento può svuotare il plafond"));
            }

            boolean cambRighe = !righe.isEmpty() || !tolte.isEmpty(), cambAltro = !altro.isEmpty();
            List<?> reg = lista(body.get("reg")), regTolte = lista(body.get("regTolte"));
            boolean cambReg = !reg.isEmpty() || !regTolte.isEmpty();
            boolean riep = body.get("riepilogo") instanceof Map<?, ?>;
            long v = (cambRighe || cambAltro || cambReg) ? ++s.versione : s.versione;

            for (Map<String, Object> r : righe) {
                String id = String.valueOf(r.get("id"));
                s.righe.put(id, r);
                s.rv.put(id, v);
                s.tolte.remove(id);
            }
            for (String id : tolte) {
                if (s.righe.remove(id) != null) { s.rv.remove(id); s.tolte.put(id, v); }
            }
            altro.forEach((k, val) -> { s.altro.put(k, val); s.av.put(k, v); });
            if (riep) {
                Map<String, Object> rp = new LinkedHashMap<>((Map<String, Object>) body.get("riepilogo"));
                rp.put("aggiornatoAt", LocalDateTime.now(ITALY).toString());
                s.altro.put("riepilogo", rp);
            }

            // registro: giorno, ora (del server) e persona li mette il server
            long ora = System.currentTimeMillis();
            Set<String> visti = new HashSet<>();
            for (Object o : regTolte) {
                String id = String.valueOf(o);
                for (int i = 0; i < Math.min(200, s.reg.size()); i++) {
                    Map<String, Object> x = s.reg.get(i);
                    if (id.equals(String.valueOf(x.get("id"))) && Objects.equals(chi, x.get("u")) && ora - num(x.get("t")) < 120_000) { s.reg.remove(i); break; }
                }
            }
            for (Object o : reg) {
                if (!(o instanceof Map<?, ?> m) || m.get("id") == null) continue;
                Map<String, Object> voce = new LinkedHashMap<>((Map<String, Object>) m);
                String id = String.valueOf(voce.get("id"));
                if (!visti.add(id)) continue;
                voce.put("t", ora); voce.put("u", chi); voce.put("v", v);
                boolean agg = false;
                for (int i = 0; i < Math.min(200, s.reg.size()); i++) {
                    Map<String, Object> x = s.reg.get(i);
                    if (id.equals(String.valueOf(x.get("id")))) {
                        // la stessa modifica che continua (stessa persona, ultimi 2 minuti): si aggiorna e torna in cima
                        if (Objects.equals(chi, x.get("u")) && ora - num(x.get("t")) < 120_000) { s.reg.remove(i); s.reg.add(0, voce); }
                        agg = true; break;
                    }
                }
                if (!agg) s.reg.add(0, voce);
            }

            if (cambRighe) salvaRighe(s, chi);
            if (cambAltro || riep) salvaAltro(s, chi);
            if (cambReg) salvaReg(s, chi);
            Map<String, Object> out = deltaDa(s, base, admin);
            out.put("ora", ora);
            return ResponseEntity.ok(out);
        } catch (Exception e) {
            st = null;   // alla prossima lettura si riparte da quello che c'e' nel database
            return ResponseEntity.status(500).body(Map.of("error", "Salvataggio non riuscito: " + e.getMessage()));
        }
    }

    /* ---------------- primo caricamento ---------------- */
    // La pagina legge il file dati-avanzamento.json (preparato dal foglio Google AVANZAMENTO 2026),
    // lo trasforma e lo manda qui. Solo Accesso Admin; se i dati ci sono gia' serve "sostituisci"
    // e il ruolo Admin del CRM (si perde tutto quello che e' stato fatto nella pagina).
    @PostMapping("/iniziale")
    @SuppressWarnings("unchecked")
    public synchronized ResponseEntity<?> iniziale(@RequestBody Map<String, Object> body, HttpSession session) {
        String acc = accesso(session);
        if (livello(acc) < 3) return acc == null ? no(acc) : ResponseEntity.status(403).body(Map.of("error", "Il primo caricamento lo fa chi ha l'Accesso Admin sull'Avanzamento"));
        try {
            Stato s = stato();
            boolean sost = Boolean.TRUE.equals(body.get("sostituisci"));
            if (s.presente && !(sost && "ADMIN".equals(session.getAttribute("userRole"))))
                return ResponseEntity.status(409).body(Map.of("error", "I dati ci sono già: per sostituirli serve il ruolo Admin e la conferma"));
            List<?> righe = lista(body.get("righe"));
            if (righe.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Il file non contiene contratti"));
            String chi = nome(session);
            Stato n = new Stato();
            n.presente = true;
            n.versione = s.versione + 1;
            for (Object o : righe) if (o instanceof Map<?, ?> m && m.get("id") != null) {
                String id = String.valueOf(m.get("id"));
                n.righe.put(id, (Map<String, Object>) m); n.rv.put(id, n.versione);
            }
            if (body.get("altro") instanceof Map<?, ?> m) m.forEach((k, v) -> { if (CAMPI.contains(String.valueOf(k))) { n.altro.put(String.valueOf(k), v); n.av.put(String.valueOf(k), n.versione); } });
            // il registro precedente non si perde mai: le voci nuove si aggiungono sopra
            n.reg.addAll(s.reg);
            for (Object o : lista(body.get("registro"))) if (o instanceof Map<?, ?> m) {
                Map<String, Object> v = new LinkedHashMap<>((Map<String, Object>) m); v.put("v", n.versione); n.reg.add(0, v);
            }
            Map<String, Object> voce = new LinkedHashMap<>();
            voce.put("id", "srv-" + System.currentTimeMillis());
            voce.put("t", System.currentTimeMillis()); voce.put("u", chi); voce.put("v", n.versione); voce.put("az", "imp");
            voce.put("dove", "Avanzamento"); voce.put("testo", (s.presente ? "Dati sostituiti: " : "Primo caricamento: ") + n.righe.size() + " contratti dal file " + String.valueOf(body.getOrDefault("file", "")));
            n.reg.add(0, voce);
            salvaRighe(n, chi); salvaAltro(n, chi); salvaReg(n, chi);
            st = n;
            return data(session);
        } catch (Exception e) {
            st = null;
            return ResponseEntity.status(500).body(Map.of("error", "Caricamento non riuscito: " + e.getMessage()));
        }
    }
}
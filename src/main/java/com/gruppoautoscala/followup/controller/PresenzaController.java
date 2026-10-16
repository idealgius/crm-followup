package com.gruppoautoscala.followup.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruppoautoscala.followup.model.ConsegneDataset;
import com.gruppoautoscala.followup.repository.ConsegneDatasetRepository;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * NUOVO: PRESENZA DI TUTTI GLI UTENTI + AGGIORNAMENTO AUTOMATICO DOPO UN DEPLOY
 *
 * Ogni pagina del CRM aperta manda un "battito" ogni 30 secondi (/js/presenza.js).
 *  - Solo l'ADMIN, in Gestione utenti, vede accanto a ogni nome:
 *      verde  = online (CRM aperto) e da che ora
 *      rosso  = oggi e' entrato ma ora e' disconnesso, e da che ora
 *      vuoto  = oggi non e' ancora entrato (con l'ultimo accesso)
 *  - Ogni risposta porta la "versione" del server (l'ora in cui e' partito). Dopo un nuovo deploy
 *    la versione cambia e la pagina si ricarica da sola (avvisando prima, e non mentre si scrive).
 *
 * In memoria: l'ultimo battito di ognuno (nessuna lettura del database per i battiti).
 * Nel database (consegne_dataset, tipo PRESENZA_UTENTI) solo il primo accesso del giorno e
 * l'ultimo visto, salvati al massimo ogni 5 minuti: serve per "ultimo accesso" anche dopo un deploy.
 */
@RestController
@RequestMapping("/api/presenza")
public class PresenzaController {

    private static final ZoneId ITALY = ZoneId.of("Europe/Rome");
    private static final String KEY = "PRESENZA_UTENTI";
    /** versione del server: cambia a ogni avvio (nuovo deploy) */
    public static final String VERSIONE = Long.toString(System.currentTimeMillis(), 36);
    private static final long TIMEOUT_MS = 150_000;        // 2 min e 30 senza battito = disconnesso
    private static final long USCITA_RITARDO_MS = 20_000;  // finestra chiusa/ricaricata: 20 s per capire se e' solo un F5
    private static final long SALVA_OGNI_MS = 300_000;     // al database al massimo ogni 5 minuti

    @Autowired private ConsegneDatasetRepository repository;
    @Autowired private ObjectMapper objectMapper;

    private static final Map<Long, Long> ULTIMO = new ConcurrentHashMap<>();      // ultimo battito (ms)
    private static final Map<Long, Long> ONLINE_DA = new ConcurrentHashMap<>();   // inizio della connessione in corso
    private static final Map<Long, Long> FUORI_DA = new ConcurrentHashMap<>();    // "Esci" o finestra chiusa (ms)
    /** archivio: id -> { primoOggi, ultimoVisto } (istanti ISO) */
    private Map<Long, Map<String, String>> archivio = null;
    private long salvatoAt = 0;
    private boolean sporco = false;

    private static Long utente(HttpSession s) { return s == null ? null : (Long) s.getAttribute("userId"); }
    private static String ruolo(HttpSession s) { return s == null ? null : (String) s.getAttribute("userRole"); }

    @GetMapping("/versione")
    public Map<String, Object> versione() { return Map.of("versione", VERSIONE); }

    @PostMapping("/battito")
    public ResponseEntity<?> battito(HttpSession s) {
        Long id = utente(s);
        if (id == null) return ResponseEntity.status(401).body(Map.of("versione", VERSIONE, "error", "Non connesso"));
        long now = System.currentTimeMillis();
        Long prima = ULTIMO.get(id);
        boolean eraOnline = prima != null && now - prima < TIMEOUT_MS;
        ULTIMO.put(id, now);
        boolean usci = FUORI_DA.remove(id) != null;      // aveva fatto "Esci": e' un nuovo accesso
        synchronized (this) {
            Map<Long, Map<String, String>> a = archivio();
            Map<String, String> r = a.computeIfAbsent(id, k -> new HashMap<>());
            Instant ist = Instant.ofEpochMilli(now);
            if (!eraOnline) {
                // appena ricollegato. Se era online fino a pochi minuti fa (es. dopo un deploy) vale l'ora di prima
                Instant visto = parse(r.get("ultimoVisto")), da = parse(r.get("onlineDa"));
                boolean continua = visto != null && da != null && now - visto.toEpochMilli() < 5 * 60_000 && !usci;
                long inizio = continua ? da.toEpochMilli() : now;
                ONLINE_DA.put(id, inizio);
                r.put("onlineDa", Instant.ofEpochMilli(inizio).toString());
            }
            String oggi = LocalDate.now(ITALY).toString();
            Instant p = parse(r.get("primoOggi"));
            boolean primoDelGiorno = p == null || !p.atZone(ITALY).toLocalDate().toString().equals(oggi);
            if (primoDelGiorno) r.put("primoOggi", ist.toString());
            r.put("ultimoVisto", ist.toString());
            sporco = true;
            if (primoDelGiorno || now - salvatoAt > SALVA_OGNI_MS) salva();
        }
        return ResponseEntity.ok(Map.of("versione", VERSIONE));
    }

    /** la finestra si chiude (o si ricarica). esci=true: ha premuto "Esci" -> disconnesso subito */
    @PostMapping("/uscita")
    public Map<String, Object> uscita(@RequestBody(required = false) Map<String, Object> b, HttpSession s) {
        Long id = utente(s);
        if (id != null) {
            long now = System.currentTimeMillis();
            if (b != null && Boolean.TRUE.equals(b.get("esci"))) { ULTIMO.put(id, now - TIMEOUT_MS); FUORI_DA.put(id, now); }
            else ULTIMO.put(id, now - TIMEOUT_MS + USCITA_RITARDO_MS);
        }
        return Map.of("ok", true);
    }

    /** solo ADMIN: stato di tutti gli utenti per la pagina Gestione utenti */
    @GetMapping("/utenti")
    public ResponseEntity<?> utenti(HttpSession s) {
        if (utente(s) == null || !"ADMIN".equalsIgnoreCase(ruolo(s))) return ResponseEntity.status(403).body(Map.of("error", "Solo per l'Admin"));
        long now = System.currentTimeMillis();
        String oggi = LocalDate.now(ITALY).toString();
        Map<String, Object> out = new LinkedHashMap<>();
        synchronized (this) {
            for (Map.Entry<Long, Map<String, String>> e : archivio().entrySet()) {
                Long id = e.getKey();
                Map<String, String> r = e.getValue();
                Long ult = ULTIMO.get(id);
                Instant visto = parse(r.get("ultimoVisto")), primo = parse(r.get("primoOggi"));
                boolean oggiEntrato = primo != null && primo.atZone(ITALY).toLocalDate().toString().equals(oggi);
                Map<String, Object> x = new LinkedHashMap<>();
                if (ult != null && now - ult < TIMEOUT_MS) {
                    x.put("stato", "ONLINE");
                    x.put("da", Instant.ofEpochMilli(ONLINE_DA.getOrDefault(id, ult)).toString());
                } else if (oggiEntrato) {
                    x.put("stato", "OFFLINE");
                    Long fuori = FUORI_DA.get(id);
                    // da quando e' disconnesso: "Esci" / finestra chiusa, altrimenti l'ultimo battito ricevuto
                    x.put("da", fuori != null ? Instant.ofEpochMilli(fuori).toString() : String.valueOf(visto));
                } else {
                    x.put("stato", "MAI_OGGI");
                }
                if (oggiEntrato) x.put("primoOggi", primo.toString());
                if (visto != null) x.put("ultimoVisto", visto.toString());
                out.put(String.valueOf(id), x);
            }
        }
        return ResponseEntity.ok(Map.of("utenti", out, "ora", Instant.now().toString()));
    }

    /* ---------- archivio nel database ---------- */
    private Map<Long, Map<String, String>> archivio() {
        if (archivio != null) return archivio;
        archivio = new ConcurrentHashMap<>();
        try {
            repository.findById(KEY).ifPresent(d -> {
                try {
                    List<Map<String, String>> l = objectMapper.readValue(d.getContenuto(), new TypeReference<List<Map<String, String>>>() {});
                    for (Map<String, String> r : l) {
                        try { archivio.put(Long.valueOf(r.get("id")), new HashMap<>(r)); } catch (Exception e) { /* riga rovinata */ }
                    }
                } catch (Exception e) { /* contenuto rovinato: si riparte da vuoto */ }
            });
        } catch (Exception e) { /* database non raggiungibile: solo memoria */ }
        return archivio;
    }
    private void salva() {
        if (!sporco) return;
        try {
            List<Map<String, String>> l = new ArrayList<>();
            for (Map.Entry<Long, Map<String, String>> e : archivio.entrySet()) {
                Map<String, String> r = new LinkedHashMap<>(e.getValue());
                r.put("id", String.valueOf(e.getKey()));
                l.add(r);
            }
            ConsegneDataset d = repository.findById(KEY).orElseGet(() -> { ConsegneDataset n = new ConsegneDataset(); n.setTipo(KEY); return n; });
            d.setContenuto(objectMapper.writeValueAsString(l));
            d.setRighe(l.size());
            d.setAggiornatoAt(LocalDateTime.now(ITALY));
            d.setAggiornatoDa("presenza");
            repository.save(d);
            salvatoAt = System.currentTimeMillis();
            sporco = false;
        } catch (Exception e) { /* si riprova al prossimo battito */ }
    }
    private static Instant parse(String s) { try { return s == null ? null : Instant.parse(s); } catch (Exception e) { return null; } }
}
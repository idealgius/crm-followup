package com.gruppoautoscala.followup.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruppoautoscala.followup.model.ConsegneDataset;
import com.gruppoautoscala.followup.repository.ConsegneDatasetRepository;
import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;

/**
 * NUOVO: PRESENZA DI TUTTI GLI UTENTI (IN TEMPO REALE) + AGGIORNAMENTO AUTOMATICO DOPO UN DEPLOY
 *
 * Ogni pagina del CRM aperta (/js/presenza.js):
 *  - tiene aperto un FLUSSO con il server (/api/presenza/flusso, Server-Sent Events): il server
 *    manda subito la sua versione e, all'Admin, ogni cambio di presenza nel momento in cui succede;
 *  - manda un "battito" ogni 10 secondi (/api/presenza/battito).
 * Online / disconnesso:
 *  - entra             -> verde subito (apertura del flusso o primo battito)
 *  - Esci              -> rosso subito
 *  - chiude la finestra / F5 -> segnale di uscita: rosso dopo 5 secondi se nel frattempo non rientra
 *    (un F5 riapre la pagina in 1-2 secondi e resta verde)
 *  - internet cade / PC in standby -> nessun battito: rosso dopo 35 secondi
 * Solo l'ADMIN, in Gestione utenti, vede accanto a ogni nome:
 *      verde = online e da che ora · rosso = oggi e' entrato ma ora e' disconnesso, e da che ora
 *      vuoto = oggi non e' ancora entrato (con l'ultimo accesso)
 * Versione: cambia a ogni avvio del server. Dopo un nuovo deploy il flusso si ricollega da solo,
 * la pagina vede la versione nuova e si ricarica (avvisando prima, e non mentre si scrive).
 *
 * Tutto in memoria. Nel database (consegne_dataset, tipo PRESENZA_UTENTI) solo il primo accesso del
 * giorno e l'ultimo visto, al massimo ogni 5 minuti: serve per "ultimo accesso" anche dopo un deploy.
 */
@RestController
@RequestMapping("/api/presenza")
public class PresenzaController {

    private static final ZoneId ITALY = ZoneId.of("Europe/Rome");
    private static final String KEY = "PRESENZA_UTENTI";
    /** versione del server: cambia a ogni avvio (nuovo deploy) */
    public static final String VERSIONE = Long.toString(System.currentTimeMillis(), 36);
    private static final long TIMEOUT_MS = 35_000;         // nessun battito da 35 s = disconnesso (internet caduto, standby)
    private static final long GRAZIA_MS = 5_000;           // finestra chiusa: 5 s per capire se e' solo un F5
    private static final long SALVA_OGNI_MS = 300_000;     // al database al massimo ogni 5 minuti

    @Autowired private ConsegneDatasetRepository repository;
    @Autowired private ObjectMapper objectMapper;

    private static final Map<Long, Long> ULTIMO = new ConcurrentHashMap<>();      // ultimo segnale vero (ms)
    private static final Map<Long, Long> ONLINE_DA = new ConcurrentHashMap<>();   // inizio della connessione in corso
    private static final Map<Long, Long> USCITA = new ConcurrentHashMap<>();      // finestra chiusa / flusso chiuso (ms)
    private static final Map<Long, Long> FUORI_DA = new ConcurrentHashMap<>();    // ha premuto "Esci" (ms)
    /** flussi aperti: utente -> pagine collegate; e quelli degli Admin (ricevono i cambi) */
    private static final Map<Long, Set<SseEmitter>> FLUSSI = new ConcurrentHashMap<>();
    private static final Set<SseEmitter> ADMIN = ConcurrentHashMap.newKeySet();
    private static final ScheduledExecutorService TIMER = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "presenza"); t.setDaemon(true); return t;
    });
    /** archivio: id -> { primoOggi, ultimoVisto, onlineDa } (istanti ISO) */
    private Map<Long, Map<String, String>> archivio = null;
    private long salvatoAt = 0;
    private boolean sporco = false;
    private String ultimaFirma = "";

    private static Long utente(HttpSession s) { return s == null ? null : (Long) s.getAttribute("userId"); }
    private static String ruolo(HttpSession s) { return s == null ? null : (String) s.getAttribute("userRole"); }

    @PostConstruct
    void avvia() {
        // ogni 2 s: chi e' passato da online a disconnesso (o viceversa) -> subito all'Admin
        TIMER.scheduleWithFixedDelay(() -> { try { scansiona(); } catch (Exception e) { /* */ } }, 2, 2, TimeUnit.SECONDS);
        // ogni 15 s un "ping" sui flussi: li tiene vivi e scopre quelli caduti
        TIMER.scheduleWithFixedDelay(PresenzaController::ping, 15, 15, TimeUnit.SECONDS);
    }

    /* ================= stato ================= */
    private static boolean online(Long id, long now) {
        if (FUORI_DA.containsKey(id)) return false;           // ha fatto "Esci"
        Long u = ULTIMO.get(id);
        if (u == null || now - u > TIMEOUT_MS) return false;
        Long x = USCITA.get(id);
        return x == null || u > x || now - x < GRAZIA_MS;
    }

    /** ogni segnale vero (battito, apertura del flusso) */
    private void segna(Long id) {
        long now = System.currentTimeMillis();
        boolean eraOnline = online(id, now);
        ULTIMO.put(id, now);
        USCITA.remove(id);
        boolean usci = FUORI_DA.remove(id) != null;      // aveva fatto "Esci": e' un nuovo accesso
        synchronized (this) {
            Map<String, String> r = archivio().computeIfAbsent(id, k -> new HashMap<>());
            Instant ist = Instant.ofEpochMilli(now);
            if (!eraOnline) {
                // appena ricollegato. Se era online fino a pochi minuti fa (es. dopo un deploy) vale l'ora di prima
                Instant visto = parse(r.get("ultimoVisto")), da = parse(r.get("onlineDa"));
                boolean continua = !usci && visto != null && da != null && now - visto.toEpochMilli() < 5 * 60_000
                    && da.atZone(ITALY).toLocalDate().equals(LocalDate.now(ITALY));
                long inizio = continua ? da.toEpochMilli() : now;
                ONLINE_DA.put(id, inizio);
                r.put("onlineDa", Instant.ofEpochMilli(inizio).toString());
            }
            Instant p = parse(r.get("primoOggi"));
            boolean primoDelGiorno = p == null || !p.atZone(ITALY).toLocalDate().equals(LocalDate.now(ITALY));
            if (primoDelGiorno) r.put("primoOggi", ist.toString());
            r.put("ultimoVisto", ist.toString());
            sporco = true;
            if (primoDelGiorno || now - salvatoAt > SALVA_OGNI_MS) salva();
        }
        if (!eraOnline) TIMER.execute(this::scansiona);   // l'Admin lo vede verde subito
    }

    /* ================= endpoint ================= */
    @GetMapping("/versione")
    public Map<String, Object> versione() { return Map.of("versione", VERSIONE); }

    @PostMapping("/battito")
    public ResponseEntity<?> battito(HttpSession s) {
        Long id = utente(s);
        if (id == null) return ResponseEntity.status(401).body(Map.of("versione", VERSIONE, "error", "Non connesso"));
        segna(id);
        return ResponseEntity.ok(Map.of("versione", VERSIONE));
    }

    /** flusso sempre aperto (Server-Sent Events). Senza accesso: 204 (il browser non riprova; ci pensa presenza.js dopo il login) */
    @GetMapping(value = "/flusso", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<?> flusso(HttpSession s, HttpServletResponse resp) {
        Long id = utente(s);
        if (id == null) return ResponseEntity.noContent().build();
        resp.setHeader("Cache-Control", "no-cache");
        resp.setHeader("X-Accel-Buffering", "no");          // proxy: niente buffer, gli eventi arrivano subito
        SseEmitter em = new SseEmitter(0L);                 // nessuna scadenza: resta aperto finche' c'e' la pagina
        FLUSSI.computeIfAbsent(id, k -> ConcurrentHashMap.newKeySet()).add(em);
        boolean admin = "ADMIN".equalsIgnoreCase(ruolo(s));
        if (admin) ADMIN.add(em);
        Runnable via = () -> chiuso(id, em);
        em.onCompletion(via);
        em.onTimeout(via);
        em.onError(e -> via.run());
        segna(id);
        invia(em, "versione", VERSIONE);
        if (admin) invia(em, "presenze", stati());
        return ResponseEntity.ok(em);
    }
    private void chiuso(Long id, SseEmitter em) {
        Set<SseEmitter> set = FLUSSI.get(id);
        if (set != null) set.remove(em);
        ADMIN.remove(em);
        if (set == null || set.isEmpty()) {                 // nessuna altra pagina aperta: come una finestra chiusa
            USCITA.putIfAbsent(id, System.currentTimeMillis());
            TIMER.schedule(this::scansiona, GRAZIA_MS + 200, TimeUnit.MILLISECONDS);
        }
    }

    /** la finestra si chiude (o si ricarica). esci=true: ha premuto "Esci" -> disconnesso subito */
    @PostMapping("/uscita")
    public Map<String, Object> uscita(@RequestBody(required = false) Map<String, Object> b, HttpSession s) {
        Long id = utente(s);
        if (id != null) {
            long now = System.currentTimeMillis();
            if (b != null && Boolean.TRUE.equals(b.get("esci"))) {
                FUORI_DA.put(id, now);
                TIMER.execute(this::scansiona);
            } else {
                USCITA.put(id, now);
                TIMER.schedule(this::scansiona, GRAZIA_MS + 200, TimeUnit.MILLISECONDS);
            }
        }
        return Map.of("ok", true);
    }

    /** solo ADMIN: stato di tutti gli utenti per la pagina Gestione utenti */
    @GetMapping("/utenti")
    public ResponseEntity<?> utenti(HttpSession s) {
        if (utente(s) == null || !"ADMIN".equalsIgnoreCase(ruolo(s))) return ResponseEntity.status(403).body(Map.of("error", "Solo per l'Admin"));
        return ResponseEntity.ok(stati());
    }

    private Map<String, Object> stati() {
        long now = System.currentTimeMillis();
        LocalDate oggi = LocalDate.now(ITALY);
        Map<String, Object> out = new LinkedHashMap<>();
        synchronized (this) {
            for (Map.Entry<Long, Map<String, String>> e : archivio().entrySet()) {
                Long id = e.getKey();
                Map<String, String> r = e.getValue();
                Instant visto = parse(r.get("ultimoVisto")), primo = parse(r.get("primoOggi"));
                boolean oggiEntrato = primo != null && primo.atZone(ITALY).toLocalDate().equals(oggi);
                Map<String, Object> x = new LinkedHashMap<>();
                if (online(id, now)) {
                    x.put("stato", "ONLINE");
                    x.put("da", Instant.ofEpochMilli(ONLINE_DA.getOrDefault(id, ULTIMO.get(id))).toString());
                } else if (oggiEntrato) {
                    x.put("stato", "OFFLINE");
                    // da quando: "Esci", finestra chiusa, altrimenti l'ultimo segnale ricevuto
                    Long fuori = FUORI_DA.get(id), usc = USCITA.get(id);
                    x.put("da", fuori != null ? Instant.ofEpochMilli(fuori).toString() : usc != null ? Instant.ofEpochMilli(usc).toString() : String.valueOf(visto));
                } else {
                    x.put("stato", "MAI_OGGI");
                }
                if (oggiEntrato) x.put("primoOggi", primo.toString());
                if (visto != null) x.put("ultimoVisto", visto.toString());
                out.put(String.valueOf(id), x);
            }
        }
        return Map.of("utenti", out, "ora", Instant.now().toString());
    }

    /* ================= tempo reale verso l'Admin ================= */
    /** se qualcuno e' entrato o uscito, lo stato nuovo va subito agli Admin collegati */
    private void scansiona() {
        long now = System.currentTimeMillis();
        StringBuilder f = new StringBuilder();
        List<Long> ids = new ArrayList<>(archivio().keySet());
        Collections.sort(ids);
        for (Long id : ids) if (online(id, now)) f.append(id).append(',');
        String firma = f.toString();
        if (firma.equals(ultimaFirma)) return;
        ultimaFirma = firma;
        if (ADMIN.isEmpty()) return;
        Map<String, Object> st = stati();
        for (SseEmitter em : ADMIN) invia(em, "presenze", st);
    }
    private static void ping() {
        for (Set<SseEmitter> set : FLUSSI.values())
            for (SseEmitter em : set) {
                try { synchronized (em) { em.send(SseEmitter.event().comment("ping")); } }
                catch (Exception e) { try { em.completeWithError(e); } catch (Exception x) { /* */ } }
            }
    }
    private static void invia(SseEmitter em, String nome, Object dati) {
        try { synchronized (em) { em.send(SseEmitter.event().name(nome).data(dati, MediaType.APPLICATION_JSON)); } }
        catch (Exception e) { try { em.completeWithError(e); } catch (Exception x) { /* */ } }
    }

    /* ================= archivio nel database ================= */
    private synchronized Map<Long, Map<String, String>> archivio() {
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
        } catch (Exception e) { /* si riprova al prossimo segnale */ }
    }
    private static Instant parse(String s) { try { return s == null ? null : Instant.parse(s); } catch (Exception e) { return null; } }
}
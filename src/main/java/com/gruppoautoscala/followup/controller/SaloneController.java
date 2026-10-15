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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * APPUNTAMENTI E INGRESSI (salone) — API usate da /js/salone.js
 * Tutti gli orari sono salvati come istante (UTC) e in piu' come testo in ora italiana
 * (Europe/Rome, ora legale compresa): campi "...It" es. "14/10/2026 16:46:12".
 *
 * CHI VEDE COSA (voce "Appuntamenti e ingressi" della pagina Permessi, a livelli)
 *  PROFILI (vedi profilo() piu' sotto): Consulenza · Solo visione · Front office · Visione + report · Completo
 *  Iniziali: Admin Completo · Front Office Front office · Consulenza Consulenza · altri Nessuno
 *  CHAT: Consulenza, Front office, Completo. Gli altri non la vedono e non possono ricevere messaggi.
 *
 * WALK-IN
 *  GET   /api/salone/ingressi?data=2026-10-14   -> ingressi del giorno + consulenti + permessi
 *  GET   /api/salone/giorni?mese=2026-10        -> numero di ingressi per giorno (calendario)
 *  POST  /api/salone/ingressi                   -> nuovo ingresso {nome, cognome, cellulare, vetture:[{marca,modello}], consulente, note}
 *  POST  /api/salone/ingressi/{id}              -> modifica / elimina
 *  POST  /api/salone/ingressi/{id}/presa        -> il consulente prende in carico il cliente: diventa OCCUPATO
 *  GET   /api/salone/notifiche                  -> clienti assegnati a me e non ancora presi in carico
 *
 * STATO DEI CONSULENTI (bollini)  DISPONIBILE (verde) · OCCUPATO (giallo) · NON_DISPONIBILE (rosso)
 *  GET   /api/salone/stati                      -> stato attuale di ogni consulente (da quando)
 *  POST  /api/salone/stati                      -> {stato, nome?}  nome (stato di un altro) dal livello 2
 *  Altri due bollini: TEST_DRIVE (grigio) e IN_PIAZZALE (azzurro). Senza CRM aperto: bollino vuoto.
 *  POST  /api/salone/stati/rinvio               -> il consulente risponde "No" al controllo: occupato altri 10 minuti
 *  Controllo dei 15 minuti: quando un consulente prende in carico un walk-in, "controlloAt" = +15 minuti.
 *  Se a quell'ora e' ancora Occupato senza aver cambiato stato, alla Consulenza compare "sei nuovamente
 *  disponibile?" (salone.js): No = +10 minuti, Si' o nessuna risposta in 60 secondi = Disponibile.
 *  Ogni cambio finisce nello storico SALONE_STATI_LOG_<aaaa-mm> con la durata dello stato precedente.
 *  Orari del salone (ORARI): lun-ven 8:30-20:00, sab 8:30-13:30 e 15:00-18:00, dom 10:30-13:00.
 *  A ogni chiusura gli stati rimasti accesi si chiudono da soli; fuori orario nessuno diventa disponibile da solo.
 *
 * APPUNTAMENTI (da import CSV, solo sede Gruppo Auto Scala srl = Agnano)
 *  GET   /api/salone/appuntamenti?data=          -> appuntamenti del giorno
 *  GET   /api/salone/appuntamenti/giorni?mese=   -> numero di appuntamenti per giorno
 *  POST  /api/salone/appuntamenti/import         -> {file, righe:[...]}   (livello 2)
 *  GET   /api/salone/appuntamenti/storico        -> import fatti e cosa e' cambiato (livello 2)
 *
 * REPORT (livello 3)
 *  GET   /api/salone/report?da=2026-10-01&a=2026-10-14 -> ingressi del periodo + cambi di stato
 *
 * ELIMINA STORICO (solo ruolo Admin, con password)
 *  POST  /api/salone/storico/elimina  -> {walkin, appuntamenti, storicoImport, stati, chat, tutto, da, a, password}
 *  Si sceglie cosa cancellare: walk-in, appuntamenti importati, storico degli import,
 *  stati dei consulenti con lo storico dei cambi di stato, messaggi della chat.
 *  Report e grafici si calcolano da walk-in e cambi di stato: cancellando quelli si azzerano.
 *  Periodo: dal / al, oppure "tutto" (con "tutto" + stati si azzera anche lo stato attuale).
 *  Password: variabile SALONE_PASSWORD_ELIMINA di Railway, se non c'e' vale RITA.
 *
 * CHAT (gruppo con tutti + chat private) — solo livello 4 e ruoli Front Office / Consulenza / Back Office: /chat/utenti, /chat/aggiornamenti, /chat/messaggi, /chat/reazione, /chat/letto
 *
 * I dati stanno nella tabella consegne_dataset (nessuna tabella nuova da creare):
 *   SALONE_<aaaa-mm-gg>        ingressi del giorno         SALONE_STATI            stato attuale consulenti
 *   SALONE_STATI_LOG_<aaaa-mm> cambi di stato del mese     SALONE_APP              appuntamenti importati
 *   SALONE_APP_STORICO         storico degli import        SALONE_CHAT_*           chat
 */
@RestController
@RequestMapping("/api/salone")
public class SaloneController {

    private static final String SEZ = "SALONE";
    private static final ZoneId ITALY = ZoneId.of("Europe/Rome");
    private static final DateTimeFormatter IT_FMT = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss");
    /** ora oltre la quale uno stato dimenticato aperto viene chiuso in automatico */
    /** ORARI DEL SALONE (ora italiana). Fuori orario nessuno diventa Disponibile da solo; alla fine di ogni
     *  fascia gli stati rimasti accesi si chiudono (sabato anche alle 13:30, poi alle 15:00 si riparte). */
    private static final Map<DayOfWeek, List<LocalTime[]>> ORARI = new EnumMap<>(DayOfWeek.class);
    static {
        List<LocalTime[]> feriale = List.<LocalTime[]>of(new LocalTime[]{ LocalTime.of(8, 30), LocalTime.of(20, 0) });
        for (DayOfWeek d : List.of(DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY)) ORARI.put(d, feriale);
        ORARI.put(DayOfWeek.SATURDAY, List.of(new LocalTime[]{ LocalTime.of(8, 30), LocalTime.of(13, 30) }, new LocalTime[]{ LocalTime.of(15, 0), LocalTime.of(18, 0) }));
        ORARI.put(DayOfWeek.SUNDAY, List.<LocalTime[]>of(new LocalTime[]{ LocalTime.of(10, 30), LocalTime.of(13, 0) }));
    }
    /** ora dell'ultima chiusura di quel giorno (null = salone chiuso tutto il giorno) */
    private static Instant fineGiorno(LocalDate g) {
        List<LocalTime[]> l = ORARI.getOrDefault(g.getDayOfWeek(), List.of());
        return l.isEmpty() ? null : g.atTime(l.get(l.size() - 1)[1]).atZone(ITALY).toInstant();
    }
    /** la fascia di apertura in cui cade quel momento, oppure null se il salone e' chiuso */
    private static LocalTime[] fascia(ZonedDateTime t) {
        LocalTime h = t.toLocalTime();
        for (LocalTime[] f : ORARI.getOrDefault(t.getDayOfWeek(), List.of())) if (!h.isBefore(f[0]) && h.isBefore(f[1])) return f;
        return null;
    }
    private static final int MAX_MSG = 1500;
    private static final int MAX_STORICO = 150;
    private static final Object LOCK = new Object();
    /** bollini: verde, giallo, rosso, grigio (test drive), azzurro (in piazzale) */
    public static final List<String> STATI = List.of("DISPONIBILE", "OCCUPATO", "NON_DISPONIBILE", "TEST_DRIVE", "IN_PIAZZALE");
    /** controllo dopo la presa in carico di un walk-in: 15 minuti, "No" = altri 10 */
    private static final long CONTROLLO_MIN = 15, RINVIO_MIN = 10;
    /** consulenti del salone di Agnano (per ora: in seguito si potranno gestire dalla pagina) */
    public static final List<String> CONSULENTI_AGNANO = List.of(
        "Luca Ambrosino", "Marco Castaldo", "Roberto Castaldo", "Guido Fiore",
        "Enrico Palumbo", "Rosario Scala", "Davide Zaritto", "Mattia Zuppa");

    @Autowired private ConsegneDatasetRepository repository;
    @Autowired private UserRepository userRepository;
    @Autowired private RolePermissionService rolePermissionService;
    @Autowired private ObjectMapper objectMapper;

    /* ================= permessi e utente ================= */
    private record Chi(Long id, String role, String nome, String acc) { }
    private Chi chi(HttpSession s) {
        Long id = (Long) s.getAttribute("userId");
        if (id == null) return null;
        String role = (String) s.getAttribute("userRole");
        return new Chi(id, role, nomeUtente(id), rolePermissionService.getEffectiveAccess(id, role, SEZ));
    }
    /** nome dell'utente tenuto in memoria 10 minuti: le pagine del salone chiamano il server ogni pochi secondi */
    private static final Map<Long, Object[]> NOMI = new java.util.concurrent.ConcurrentHashMap<>();
    private String nomeUtente(Long id) {
        Object[] v = NOMI.get(id);
        if (v != null && System.currentTimeMillis() - (long) v[1] < 600_000) return (String) v[0];
        String nome = userRepository.findById(id).map(User::getFullName).orElse("");
        NOMI.put(id, new Object[]{ nome, System.currentTimeMillis() });
        return nome;
    }
    /* PROFILI di "Appuntamenti e ingressi" (pagina Permessi; i nomi uguali in admin.js):
     *  S_CONS Consulenza       solo i propri walk-in e appuntamenti + chat
     *  S_VIS  Solo visione      tutti i walk-in e appuntamenti, senza chat
     *  S_FO   Front office      tutti i walk-in e appuntamenti + chat, registra e assegna i walk-in, importa (NON cambia lo stato degli altri)
     *  S_REP  Visione + report  tutto in visione + scheda Report, senza chat
     *  S_ALL  Completo          tutto (registra, importa, report) + chat
     * Il proprio stato e la presa in carico dei propri clienti valgono per chiunque sia uno degli 8 consulenti.
     * Elimina storico: solo il ruolo Admin. Domanda dei 15 minuti: solo il ruolo Consulenza.
     * I vecchi livelli gia' salvati si traducono: READ_ONLY -> Consulenza (ruolo Consulenza) o Solo visione,
     * FULL -> Front office, ADMIN_FULL -> Visione + report, LIVELLO_4 -> Completo. */
    static String profilo(String acc, String role) {
        if (acc == null) return "NONE";
        switch (acc) {
            case "S_CONS": case "S_VIS": case "S_FO": case "S_REP": case "S_ALL": return acc;
            case "S_BO": return "S_FO";                     // profilo provato e tolto: vale come Front office
            case "READ_ONLY": return "CONSULENZA".equalsIgnoreCase(role) ? "S_CONS" : "S_VIS";
            case "FULL": return "S_FO";
            case "ADMIN_FULL": return "S_REP";
            case "LIVELLO_4": return "S_ALL";
            default: return "NONE";
        }
    }
    private static String prof(Chi c) { return c == null ? "NONE" : profilo(c.acc(), c.role()); }
    private boolean vede(Chi c) { return !"NONE".equals(prof(c)); }
    /** registra e assegna i walk-in, importa gli appuntamenti */
    private boolean gestisce(Chi c) { String p = prof(c); return p.equals("S_FO") || p.equals("S_ALL"); }
    /** vede i walk-in e gli appuntamenti di tutti (la Consulenza solo i propri) */
    private boolean vedeTutti(Chi c) { return vede(c) && !"S_CONS".equals(prof(c)); }
    private boolean report(Chi c) { String p = prof(c); return p.equals("S_REP") || p.equals("S_ALL"); }
    /** cambia lo stato degli altri consulenti (anche "Segna preso in carico" per loro): solo il profilo Completo */
    private boolean cambiaAltri(Chi c) { return "S_ALL".equals(prof(c)); }
    private static String livello(String p) {
        return switch (p) { case "S_CONS" -> "Consulenza"; case "S_VIS" -> "Solo visione";
            case "S_FO" -> "Front office"; case "S_REP" -> "Visione + report"; case "S_ALL" -> "Completo"; default -> "Nessuno"; };
    }
    private static final Set<String> PROFILI_CHAT = Set.of("S_CONS", "S_FO", "S_ALL");
    private boolean chatOk(String acc, String role) { return PROFILI_CHAT.contains(profilo(acc, role)); }
    private boolean chat(Chi c) { return c != null && chatOk(c.acc(), c.role()); }
    private ResponseEntity<?> noChat(Chi c) {
        return c == null ? no(null) : ResponseEntity.status(403).body(Map.of("error", "La chat del salone non e' attiva per il tuo livello"));
    }
    private ResponseEntity<?> no(Chi c) {
        return c == null ? ResponseEntity.status(401).body(Map.of("error", "Non autenticato"))
                         : ResponseEntity.status(403).body(Map.of("error", "Non hai il permesso per Appuntamenti e ingressi"));
    }
    private static ResponseEntity<?> soloLivello(int n) {
        return ResponseEntity.status(403).body(Map.of("error", n >= 3 ? "Serve il profilo \"Visione + report\" o \"Completo\" su Appuntamenti e ingressi"
            : "Serve il profilo \"Front office\" o \"Completo\" su Appuntamenti e ingressi"));
    }
    private static String norm(String s) { return s == null ? "" : s.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " "); }
    private static String str(Object o) { return o == null ? "" : String.valueOf(o).trim(); }
    /** stesso nome anche se scritto "Cognome Nome" o con maiuscole diverse */
    private static boolean stessoNome(String a, String b) {
        if (norm(a).isEmpty() || norm(b).isEmpty()) return false;
        if (norm(a).equals(norm(b))) return true;
        List<String> x = new ArrayList<>(List.of(norm(a).split(" "))), y = new ArrayList<>(List.of(norm(b).split(" ")));
        Collections.sort(x); Collections.sort(y);
        return x.equals(y);
    }
    private static String consulenteDi(String nome) {
        for (String n : CONSULENTI_AGNANO) if (stessoNome(n, nome)) return n;
        return null;
    }
    private static boolean mio(Chi c, Object cons) { return stessoNome(c.nome(), cons == null ? null : String.valueOf(cons)); }

    /* ================= tempo (sempre ora italiana) ================= */
    private static String oraIt(Instant i) { return i == null ? null : IT_FMT.format(i.atZone(ITALY)); }
    private static Instant inst(Object o) { try { return o == null ? null : Instant.parse(String.valueOf(o)); } catch (Exception e) { return null; } }
    private static double minuti(Instant a, Instant b) { return a == null || b == null ? 0 : Math.max(0, Math.round((b.toEpochMilli() - a.toEpochMilli()) / 6000.0) / 10.0); }
    private static String oggi() { return LocalDate.now(ITALY).toString(); }
    private static String giornoValido(String g) {
        try { return LocalDate.parse(g).toString(); } catch (Exception e) { return oggi(); }
    }

    /* ================= archivio (consegne_dataset) =================
     * NUOVO: tutto quello che il salone legge sta anche IN MEMORIA nel server (CACHE). Il database si legge
     * una sola volta per chiave e si riscrive solo quando qualcosa cambia: le pagine aperte chiedono
     * aggiornamenti ogni pochi secondi e prima ogni richiesta rileggeva il database (traffico Supabase).
     * Vale con un solo server (Railway con 1 istanza, come adesso). */
    private record Voce(String json, Integer righe, ConsegneDataset ent) { }
    private static final Map<String, Optional<Voce>> CACHE = new java.util.concurrent.ConcurrentHashMap<>();
    private Optional<Voce> voce(String key) {
        Optional<Voce> v = CACHE.get(key);
        if (v != null) return v;
        v = repository.findById(key).map(d -> new Voce(d.getContenuto(), d.getRighe(), d));
        CACHE.put(key, v);
        return v;
    }
    private static boolean pieno(Optional<Voce> v) { return v.isPresent() && v.get().righe() != null && v.get().righe() > 0; }
    private List<Map<String, Object>> leggi(String key) {
        return voce(key).map(v -> {
            try { return objectMapper.readValue(v.json(), new TypeReference<List<Map<String, Object>>>() {}); }
            catch (Exception e) { return new ArrayList<Map<String, Object>>(); }
        }).orElseGet(ArrayList::new);
    }
    private void scrivi(String key, Object lista, int righe, String chi) throws Exception {
        String json = objectMapper.writeValueAsString(lista);
        Optional<Voce> prima = voce(key);
        if (prima.isPresent() && json.equals(prima.get().json())) return;      // niente di nuovo: non si scrive
        ConsegneDataset d = prima.map(Voce::ent).orElseGet(() -> { ConsegneDataset n = new ConsegneDataset(); n.setTipo(key); return n; });
        d.setContenuto(json);
        d.setRighe(righe);
        d.setAggiornatoAt(LocalDateTime.now(ITALY));
        d.setAggiornatoDa(chi);
        ConsegneDataset salvato = repository.save(d);
        CACHE.put(key, Optional.of(new Voce(json, righe, salvato)));
    }

    /* ================= WALK-IN ================= */
    @GetMapping("/ingressi")
    public ResponseEntity<?> ingressi(@RequestParam(required = false) String data, HttpSession s) {
        Chi c = chi(s); if (!vede(c)) return no(c);
        String g = giornoValido(data == null ? oggi() : data);
        List<Map<String, Object>> l = leggi("SALONE_" + g);
        if (!vedeTutti(c)) l.removeIf(r -> !mio(c, r.get("consulente")));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", g);
        out.put("oggi", oggi());
        out.put("ingressi", l);
        out.put("consulenti", CONSULENTI_AGNANO);
        out.put("puoGestire", gestisce(c));
        out.put("vedeTutti", vedeTutti(c));
        out.put("puoImportare", gestisce(c));
        out.put("vedeReport", report(c));
        out.put("livello", livello(prof(c)));
        out.put("chat", chat(c));
        Map<String, Object> io = new LinkedHashMap<>();
        io.put("id", c.id()); io.put("nome", c.nome()); io.put("role", String.valueOf(c.role()));
        io.put("consulente", consulenteDi(c.nome()));
        out.put("io", io);
        return ResponseEntity.ok(out);
    }

    @GetMapping("/giorni")
    public ResponseEntity<?> giorni(@RequestParam(required = false) String mese, HttpSession s) {
        Chi c = chi(s); if (!vede(c)) return no(c);
        YearMonth ym;
        try { ym = YearMonth.parse(mese); } catch (Exception e) { ym = YearMonth.now(ITALY); }
        Map<String, Integer> out = new LinkedHashMap<>();
        boolean tutti = vedeTutti(c);
        for (int d = 1; d <= ym.lengthOfMonth(); d++) {
            String g = ym.atDay(d).toString();
            Optional<Voce> ds = voce("SALONE_" + g);
            if (!pieno(ds)) continue;
            int n = tutti ? ds.get().righe() : (int) leggi("SALONE_" + g).stream().filter(r -> mio(c, r.get("consulente"))).count();
            if (n > 0) out.put(g, n);
        }
        return ResponseEntity.ok(Map.of("mese", ym.toString(), "giorni", out));
    }

    private Map<String, Object> pulisci(Map<String, Object> b, Map<String, Object> base) {
        Map<String, Object> r = base == null ? new LinkedHashMap<>() : base;
        for (String k : List.of("nome", "cognome", "cellulare", "note"))
            if (b.containsKey(k)) r.put(k, str(b.get(k)));
        if (b.get("vetture") instanceof List<?> l) {
            List<Map<String, String>> v = new ArrayList<>();
            for (Object o : l) if (o instanceof Map<?, ?> m) {
                String marca = str(m.get("marca")), modello = str(m.get("modello"));
                if (!marca.isEmpty() || !modello.isEmpty()) v.add(Map.of("marca", marca, "modello", modello));
            }
            r.put("vetture", v);
        }
        return r;
    }

    @PostMapping("/ingressi")
    public ResponseEntity<?> nuovo(@RequestBody Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (!gestisce(c)) return no(c);
        Map<String, Object> r = pulisci(b, null);
        if (str(r.get("nome")).isEmpty() && str(r.get("cognome")).isEmpty())
            return ResponseEntity.badRequest().body(Map.of("error", "Scrivi almeno nome o cognome del cliente"));
        String cons = str(b.get("consulente"));
        if (!cons.isEmpty() && !CONSULENTI_AGNANO.contains(cons)) return ResponseEntity.badRequest().body(Map.of("error", "Consulente non valido"));
        Instant now = Instant.now();
        String g = now.atZone(ITALY).toLocalDate().toString();
        r.put("id", g + "-" + UUID.randomUUID().toString().substring(0, 8));
        r.put("data", g);
        r.put("ora", now.toString());
        r.put("oraIt", oraIt(now));            // data e ora di inserimento in ora italiana
        r.put("registratoDa", c.nome());
        assegna(r, cons, c.nome(), now);
        synchronized (LOCK) {
            List<Map<String, Object>> l = leggi("SALONE_" + g);
            l.add(r);
            try { scrivi("SALONE_" + g, l, l.size(), c.nome()); }
            catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", "Ingresso non salvato: " + e.getMessage())); }
        }
        return ResponseEntity.ok(Map.of("ingresso", r));
    }

    private static void assegna(Map<String, Object> r, String cons, String da, Instant now) {
        if (Objects.equals(cons, r.get("consulente"))) return;
        r.put("consulente", cons.isEmpty() ? null : cons);
        r.put("assegnatoAt", cons.isEmpty() ? null : now.toString());
        r.put("assegnatoIt", cons.isEmpty() ? null : oraIt(now));
        r.put("assegnatoDa", cons.isEmpty() ? null : da);
        r.put("presoAt", null);           // nuovo consulente: nuova notifica
        r.put("presoIt", null);
        r.put("liberoAt", null); r.put("liberoIt", null); r.put("minutiCliente", null);
    }

    @PostMapping("/ingressi/{id}")
    public ResponseEntity<?> modifica(@PathVariable String id, @RequestBody Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (!gestisce(c)) return no(c);
        String g = giornoValido(String.valueOf(b.getOrDefault("data", id.length() >= 10 ? id.substring(0, 10) : oggi())));
        synchronized (LOCK) {
            List<Map<String, Object>> l = leggi("SALONE_" + g);
            Map<String, Object> r = l.stream().filter(x -> id.equals(x.get("id"))).findFirst().orElse(null);
            if (r == null) return ResponseEntity.status(404).body(Map.of("error", "Ingresso non trovato"));
            pulisci(b, r);
            if (b.containsKey("consulente")) {
                String cons = str(b.get("consulente"));
                if (!cons.isEmpty() && !CONSULENTI_AGNANO.contains(cons)) return ResponseEntity.badRequest().body(Map.of("error", "Consulente non valido"));
                assegna(r, cons, c.nome(), Instant.now());
            }
            if (Boolean.TRUE.equals(b.get("elimina"))) l.remove(r);
            try { scrivi("SALONE_" + g, l, l.size(), c.nome()); }
            catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", "Modifica non salvata: " + e.getMessage())); }
            return ResponseEntity.ok(Map.of("ingresso", r));
        }
    }

    /** il consulente prende in carico il cliente: il suo bollino diventa giallo (OCCUPATO) */
    @PostMapping("/ingressi/{id}/presa")
    public ResponseEntity<?> presa(@PathVariable String id, HttpSession s) {
        Chi c = chi(s); if (!vede(c)) return no(c);
        String g = giornoValido(id.length() >= 10 ? id.substring(0, 10) : oggi());
        synchronized (LOCK) {
            List<Map<String, Object>> l = leggi("SALONE_" + g);
            Map<String, Object> r = l.stream().filter(x -> id.equals(x.get("id"))).findFirst().orElse(null);
            if (r == null) return ResponseEntity.status(404).body(Map.of("error", "Ingresso non trovato"));
            if (!mio(c, r.get("consulente")) && !cambiaAltri(c))
                return ResponseEntity.status(403).body(Map.of("error", "Il cliente e' assegnato a un altro consulente"));
            if (r.get("consulente") == null) return ResponseEntity.badRequest().body(Map.of("error", "Il cliente non e' ancora assegnato"));
            boolean prima = r.get("presoAt") == null;
            Instant now = Instant.now();
            if (prima) { r.put("presoAt", now.toString()); r.put("presoIt", oraIt(now)); r.put("presoDa", c.nome()); }
            try {
                scrivi("SALONE_" + g, l, l.size(), c.nome());
                if (prima && online(String.valueOf(r.get("consulente")), now)) {   // non connesso: resta "non in salone"
                    Map<String, Map<String, Object>> m = statiOggi();
                    String cliente = (str(r.get("nome")) + " " + str(r.get("cognome"))).trim();
                    cambiaStato(m, String.valueOf(r.get("consulente")), "OCCUPATO", c.nome(), r.get("daApp") != null ? "Appuntamento preso in carico" : "Walk-in preso in carico", id, cliente, now);
                    salvaStati(m, c.nome());
                }
            } catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", e.getMessage())); }
            return ResponseEntity.ok(Map.of("ingresso", r));
        }
    }

    /** clienti di oggi assegnati a me (per nome) e non ancora presi in carico */
    @GetMapping("/notifiche")
    public ResponseEntity<?> notifiche(HttpSession s) {
        Chi c = chi(s); if (!vede(c)) return no(c);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : leggi("SALONE_" + oggi()))
            if (mio(c, r.get("consulente")) && r.get("presoAt") == null) out.add(r);
        return ResponseEntity.ok(Map.of("notifiche", out));
    }

    /* ================= STATO DEI CONSULENTI ================= */
    /** stato attuale di tutti i consulenti (chi non ha mai scelto: stato null = "non ancora in salone") */
    private Map<String, Map<String, Object>> statiMappa() {
        Map<String, Map<String, Object>> m = new LinkedHashMap<>();
        for (String n : CONSULENTI_AGNANO) { Map<String, Object> r = new LinkedHashMap<>(); r.put("nome", n); r.put("stato", null); m.put(n, r); }
        for (Map<String, Object> r : leggi("SALONE_STATI")) {
            String n = str(r.get("nome"));
            if (m.containsKey(n)) m.get(n).putAll(r);
        }
        return m;
    }
    private void salvaStati(Map<String, Map<String, Object>> m, String chi) throws Exception {
        scrivi("SALONE_STATI", new ArrayList<>(m.values()), m.size(), chi);
    }
    /** stati di oggi:
     *  - uno stato rimasto acceso oltre la chiusura del salone (ORARI) viene chiuso all'ora di chiusura
     *  - PRESENZA: chi e' diventato disponibile con l'accesso al CRM torna "non in salone" quando
     *    il CRM non e' piu' aperto (finestra chiusa, Esci, sessione scaduta o nuovo deploy) */
    private Map<String, Map<String, Object>> statiOggi() throws Exception {
        Map<String, Map<String, Object>> m = statiMappa();
        ZonedDateTime ora = ZonedDateTime.now(ITALY);
        LocalDate oggi = ora.toLocalDate();
        Instant now = ora.toInstant();
        boolean cambiato = false;
        boolean orarioOra = fascia(ora) != null;
        for (Map<String, Object> r : m.values()) {
            Instant dal = inst(r.get("dal"));
            if (r.get("stato") == null || dal == null) {
                // NUOVO: oggi era entrato (ha uno stato chiuso oggi) e ora, in orario, non ha il CRM aperto -> Non disponibile.
                // Es. sabato: alle 13:30 gli stati si chiudono, alle 15:00 chi era venuto la mattina e non e' collegato risulta rosso.
                Instant usc = inst(r.get("uscitoAt"));
                if (orarioOra && usc != null && usc.atZone(ITALY).toLocalDate().equals(oggi) && !online(str(r.get("nome")), now)) {
                    assente(r, now, "Non connesso al CRM (era entrato oggi): non disponibile in automatico");
                    cambiato = true;
                }
                continue;
            }
            ZonedDateTime zd = dal.atZone(ITALY);
            LocalDate g = zd.toLocalDate();
            LocalTime[] f = fascia(zd);
            Instant chiudiA = null; String perche = null;
            if (f != null) {
                // stato acceso in orario e rimasto acceso oltre la chiusura della fascia: si chiude a quell'ora
                Instant ff = g.atTime(f[1]).atZone(ITALY).toInstant();
                if (!now.isBefore(ff)) { chiudiA = ff; perche = "Chiusura del salone alle " + f[1] + ": chiuso in automatico"; }
            } else {
                // stato scelto fuori orario (es. nella pausa del sabato): vale fino all'ultima chiusura del giorno
                Instant fg = fineGiorno(g);
                if (fg != null && dal.isBefore(fg) && !now.isBefore(fg)) { chiudiA = fg; perche = "Chiusura del salone alle " + fg.atZone(ITALY).toLocalTime() + ": chiuso in automatico"; }
                else if (g.isBefore(oggi)) { chiudiA = dal; perche = "Fine giornata (stato scelto a salone chiuso)"; }
            }
            if (chiudiA != null) {
                spegni(r, chiudiA, "sistema", perche);
                cambiato = true;
            } else if (Boolean.TRUE.equals(r.get("assente"))) {
                // gia' "non disponibile" perche' non connesso: resta cosi' fino al rientro o alla chiusura del salone
            } else if (!online(str(r.get("nome")), now)) {
                // REGOLA: senza un accesso al CRM in corso il consulente risulta "non in salone" (bollino vuoto),
                // anche se lo stato era stato messo a mano da un Front Office / Admin.
                // NUOVO: in ORARIO, visto che oggi e' gia' entrato, risulta invece NON DISPONIBILE (rosso);
                // torna disponibile da solo appena riapre il CRM.
                // orario di uscita: l'ultimo segnale ricevuto (o la ripartenza del server dopo un deploy)
                Long ult = ULTIMO.get(str(r.get("nome")));
                Instant fine = Instant.ofEpochMilli(ult != null ? ult : AVVIO_MS);
                if (fine.isBefore(dal)) fine = dal;
                if (fine.isAfter(now)) fine = now;
                String motivo = ult != null ? "Uscito dal CRM (finestra chiusa o disconnesso)"
                    : dal.toEpochMilli() < AVVIO_MS ? "Uscito dal CRM (riavvio del CRM / nuovo deploy)"
                    : "Non connesso al CRM";
                if (orarioOra) assente(r, fine, motivo + ": non disponibile in automatico");
                else spegni(r, fine, "sistema", motivo);
                cambiato = true;
            }
        }
        if (cambiato) salvaStati(m, "sistema");
        return m;
    }
    /** non connesso in orario (ma entrato oggi): NON DISPONIBILE "automatico" (assente=true), chiude il walk-in aperto */
    private void assente(Map<String, Object> r, Instant da, String motivo) throws Exception {
        registraCambio(r, "NON_DISPONIBILE", da, "sistema", motivo);
        if (r.get("walkinAperto") != null) chiudiWalkin(String.valueOf(r.get("walkinAperto")), da, "sistema", motivo);
        r.put("stato", "NON_DISPONIBILE"); r.put("dal", da.toString()); r.put("dalIt", oraIt(da));
        r.put("cliente", null); r.put("walkinId", null); r.put("walkinAperto", null);
        r.put("motivo", motivo); r.put("chi", "sistema"); r.put("presenza", null);
        r.put("controlloAt", null); r.put("rinvii", 0); r.put("assente", true);
        if (r.get("uscitoAt") == null || inst(r.get("uscitoAt")).isBefore(da.minusSeconds(1))) { r.put("uscitoAt", da.toString()); r.put("uscitoIt", oraIt(da)); }
    }
    /** il consulente esce: chiude lo stato, chiude il walk-in eventualmente ancora aperto */
    private void spegni(Map<String, Object> r, Instant fine, String chi, String motivo) throws Exception {
        registraCambio(r, null, fine, chi, motivo);
        if (r.get("walkinAperto") != null) chiudiWalkin(String.valueOf(r.get("walkinAperto")), fine, chi, motivo);
        r.put("stato", null); r.put("dal", null); r.put("dalIt", null); r.put("cliente", null); r.put("walkinId", null);
        r.put("walkinAperto", null); r.put("motivo", motivo); r.put("chi", chi); r.put("presenza", null);
        r.put("controlloAt", null); r.put("rinvii", 0); r.put("assente", null);
        r.put("uscitoAt", fine.toString()); r.put("uscitoIt", oraIt(fine));
    }

    /* ---------- PRESENZA: disponibile in automatico finche' il CRM resta aperto ----------
     * Ogni finestra del CRM aperta da un consulente manda un segnale ogni 25 secondi (/stati/presenza).
     * Le finestre vivono solo in memoria: dopo un nuovo deploy la lista e' vuota, quindi chi non si
     * ricollega entro PRESENZA_TIMEOUT risulta uscito. */
    private static final long PRESENZA_TIMEOUT_MS = 150_000;   // 2 min e 30: tiene conto delle schede in secondo piano
    private static final long USCITA_RITARDO_MS = 20_000;      // chiusura/ricarica della finestra: 20 s per capire se e' solo un F5
    private static final long AVVIO_MS = System.currentTimeMillis();
    private static final Map<String, Map<String, Long>> FINESTRE = new java.util.concurrent.ConcurrentHashMap<>();
    /** ultimo segnale vero di ogni consulente (per segnare l'uscita all'ora giusta) */
    private static final Map<String, Long> ULTIMO = new java.util.concurrent.ConcurrentHashMap<>();
    private static boolean online(String nome, Instant now) {
        if (now.toEpochMilli() - AVVIO_MS < PRESENZA_TIMEOUT_MS) return true;     // server appena ripartito: aspetto che i CRM aperti si rifacciano vivi
        return presente(nome, now);
    }
    /** ha davvero una finestra del CRM aperta (senza l'attesa dopo il riavvio) */
    private static boolean presente(String nome, Instant now) {
        long t = now.toEpochMilli();
        Map<String, Long> f = FINESTRE.get(nome);
        if (f == null) return false;
        f.values().removeIf(v -> t - v > PRESENZA_TIMEOUT_MS);
        return !f.isEmpty();
    }
    /** consulenti con il CRM aperto in questo momento */
    private static List<String> connessi() {
        Instant now = Instant.now();
        List<String> out = new ArrayList<>();
        for (String n : CONSULENTI_AGNANO) if (presente(n, now)) out.add(n);
        return out;
    }
    private static String tab(Map<String, Object> b) {
        String t = str(b.get("tab"));
        return t.isEmpty() || t.length() > 60 ? "x" : t;
    }

    @PostMapping("/stati/presenza")
    public ResponseEntity<?> presenza(@RequestBody(required = false) Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (!vede(c)) return no(c);
        String nome = consulenteDi(c.nome());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("consulente", nome);
        if (nome == null) return ResponseEntity.ok(out);           // non e' un consulente: niente bollino
        FINESTRE.computeIfAbsent(nome, k -> new java.util.concurrent.ConcurrentHashMap<>()).put(tab(b == null ? Map.of() : b), System.currentTimeMillis());
        ULTIMO.put(nome, System.currentTimeMillis());
        synchronized (LOCK) {
            try {
                Map<String, Map<String, Object>> m = statiOggi();
                Map<String, Object> r = m.get(nome);
                boolean orario = fascia(ZonedDateTime.now(ITALY)) != null;
                boolean salva = false;
                boolean rientro = Boolean.TRUE.equals(r.get("assente"));   // era "non disponibile" perche' non connesso
                if ((r.get("stato") == null || rientro) && orario) {
                    cambiaStato(m, nome, "DISPONIBILE", c.nome(), rientro ? "Rientrato nel CRM: disponibile in automatico" : "Accesso al CRM: disponibile in automatico", null, null, Instant.now());
                    salva = true;
                }
                if (salva) salvaStati(m, c.nome());
                out.put("stato", r.get("stato"));
            } catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", e.getMessage())); }
        }
        return ResponseEntity.ok(out);
    }

    /** la finestra si chiude (o si ricarica). esci=true: ha premuto "Esci", esce subito */
    @PostMapping("/stati/uscita")
    public ResponseEntity<?> uscita(@RequestBody(required = false) Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (c == null) return no(c);
        String nome = consulenteDi(c.nome());
        if (nome == null) return ResponseEntity.ok(Map.of("ok", true));
        Map<String, Long> f = FINESTRE.computeIfAbsent(nome, k -> new java.util.concurrent.ConcurrentHashMap<>());
        boolean esci = b != null && Boolean.TRUE.equals(b.get("esci"));
        ULTIMO.put(nome, System.currentTimeMillis());
        if (!esci) f.put(tab(b == null ? Map.of() : b), System.currentTimeMillis() - PRESENZA_TIMEOUT_MS + USCITA_RITARDO_MS);
        else synchronized (LOCK) {
            try {
                Map<String, Map<String, Object>> m = statiOggi();
                f.clear();                                   // dopo statiOggi(): cosi' il motivo resta "Ha fatto Esci"
                Map<String, Object> r = m.get(nome);
                if (r.get("stato") != null) {
                    spegni(r, Instant.now(), c.nome(), "Ha fatto Esci dal CRM");
                    salvaStati(m, c.nome());
                }
            } catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", e.getMessage())); }
        }
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /** scrive nello storico del mese: stato precedente -> nuovo, con durata dello stato precedente */
    private void registraCambio(Map<String, Object> r, String nuovo, Instant at, String chi, String motivo) throws Exception {
        Instant dal = inst(r.get("dal"));
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("nome", r.get("nome"));
        e.put("at", at.toString()); e.put("atIt", oraIt(at));
        e.put("da", r.get("stato"));                     // stato che finisce
        e.put("inizio", dal == null ? null : dal.toString());
        e.put("inizioIt", oraIt(dal));
        e.put("minuti", r.get("stato") == null ? 0 : minuti(dal, at));
        e.put("a", nuovo);                               // stato che inizia (null = fine giornata)
        e.put("chi", chi); e.put("motivo", motivo);
        if (r.get("cliente") != null) e.put("clientePrec", r.get("cliente"));
        String key = "SALONE_STATI_LOG_" + YearMonth.from(at.atZone(ITALY)).toString();
        List<Map<String, Object>> log = leggi(key);
        log.add(e);
        scrivi(key, log, log.size(), chi);
    }
    /** cambia lo stato di un consulente, lo registra nello storico e collega il walk-in in corso */
    private boolean cambiaStato(Map<String, Map<String, Object>> m, String nome, String nuovo, String chi, String motivo,
                                String walkinId, String cliente, Instant now) throws Exception {
        Map<String, Object> r = m.get(nome);
        if (r == null) return false;
        if (Objects.equals(r.get("stato"), nuovo) && walkinId == null) return false;
        registraCambio(r, nuovo, now, chi, motivo);
        String aperto = (String) r.get("walkinAperto");
        if ("OCCUPATO".equals(nuovo) && walkinId != null) {
            if (aperto != null && !aperto.equals(walkinId)) chiudiWalkin(aperto, now, chi, "Ha preso un altro cliente");
            r.put("walkinAperto", walkinId); r.put("walkinId", walkinId); r.put("cliente", cliente);
        } else if ("DISPONIBILE".equals(nuovo)) {
            if (aperto != null) chiudiWalkin(aperto, now, chi, null);
            r.put("walkinAperto", null); r.put("walkinId", null); r.put("cliente", null);
        } else if ("NON_DISPONIBILE".equals(nuovo)) {
            r.put("cliente", null); r.put("walkinId", null);  // il walk-in resta aperto finche' non torna disponibile
        }   // TEST_DRIVE / IN_PIAZZALE: resta il cliente (di solito e' con lui)
        // controllo dei 15 minuti: solo subito dopo la presa in carico; qualsiasi altro cambio lo toglie
        r.put("controlloAt", "OCCUPATO".equals(nuovo) && walkinId != null ? now.plusSeconds(CONTROLLO_MIN * 60).toString() : null);
        r.put("stato", nuovo); r.put("dal", now.toString()); r.put("dalIt", oraIt(now));
        r.put("chi", chi); r.put("motivo", motivo); r.put("rinvii", 0); r.put("assente", null);
        return true;
    }
    /** il consulente torna disponibile: sul walk-in resta quanto tempo e' passato dalla presa in carico */
    private void chiudiWalkin(String id, Instant at, String chi, String nota) throws Exception {
        if (id == null || id.length() < 10) return;
        String key = "SALONE_" + giornoValido(id.substring(0, 10));
        List<Map<String, Object>> l = leggi(key);
        for (Map<String, Object> w : l) if (id.equals(w.get("id")) && w.get("liberoAt") == null) {
            w.put("liberoAt", at.toString()); w.put("liberoIt", oraIt(at));
            w.put("minutiCliente", minuti(inst(w.get("presoAt")), at));
            if (nota != null) w.put("liberoNota", nota);
            scrivi(key, l, l.size(), chi);
            return;
        }
    }

    @GetMapping("/stati")
    public ResponseEntity<?> stati(HttpSession s) {
        Chi c = chi(s); if (!vede(c)) return no(c);
        try {
            Map<String, Map<String, Object>> m;
            synchronized (LOCK) { m = statiOggi(); }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("stati", new ArrayList<>(m.values()));
            out.put("ora", Instant.now().toString());
            out.put("mio", consulenteDi(c.nome()));
            out.put("cambiaTutti", cambiaAltri(c));
            out.put("online", connessi());
            return ResponseEntity.ok(out);
        } catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", e.getMessage())); }
    }

    @PostMapping("/stati")
    public ResponseEntity<?> nuovoStato(@RequestBody Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (!vede(c)) return no(c);
        String stato = str(b.get("stato")).toUpperCase(Locale.ROOT);
        if (!STATI.contains(stato)) return ResponseEntity.badRequest().body(Map.of("error", "Stato non valido"));
        String mio = consulenteDi(c.nome());
        String nome = str(b.get("nome")).isEmpty() ? mio : consulenteDi(str(b.get("nome")));
        if (nome == null) return ResponseEntity.badRequest().body(Map.of("error", "Non risulti tra i consulenti del salone"));
        if (!nome.equals(mio) && !cambiaAltri(c)) return ResponseEntity.status(403).body(Map.of("error", "Puoi cambiare solo il tuo stato"));
        if (nome.equals(mio)) {           // e' lui: e' connesso adesso
            FINESTRE.computeIfAbsent(nome, k -> new java.util.concurrent.ConcurrentHashMap<>()).put("stato", System.currentTimeMillis());
            ULTIMO.put(nome, System.currentTimeMillis());
        } else if (!presente(nome, Instant.now()))
            return ResponseEntity.status(409).body(Map.of("error", nome + " non ha il CRM aperto: risulta fuori dal salone finche' non accede."));
        synchronized (LOCK) {
            try {
                Map<String, Map<String, Object>> m = statiOggi();
                String motivo = !nome.equals(mio) ? "Cambiato da " + c.nome()
                    : "si".equals(str(b.get("controllo"))) ? "Controllo dei 15 minuti: ha confermato di essere disponibile"
                    : "auto".equals(str(b.get("controllo"))) ? "Controllo dei 15 minuti: nessuna risposta in 60 secondi, disponibile in automatico"
                    : "Cambiato dal consulente";
                cambiaStato(m, nome, stato, c.nome(), motivo, null, null, Instant.now());
                salvaStati(m, c.nome());
                return ResponseEntity.ok(Map.of("stati", new ArrayList<>(m.values()), "ora", Instant.now().toString(), "online", connessi()));
            } catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", e.getMessage())); }
        }
    }

    /** "No" al controllo dei 15 minuti: resta occupato, la domanda torna tra 10 minuti */
    @PostMapping("/stati/rinvio")
    public ResponseEntity<?> rinvio(HttpSession s) {
        Chi c = chi(s); if (!vede(c)) return no(c);
        String mio = consulenteDi(c.nome());
        if (mio == null) return ResponseEntity.badRequest().body(Map.of("error", "Non risulti tra i consulenti del salone"));
        synchronized (LOCK) {
            try {
                Map<String, Map<String, Object>> m = statiOggi();
                Map<String, Object> r = m.get(mio);
                if (!"OCCUPATO".equals(r.get("stato"))) return ResponseEntity.ok(Map.of("stati", new ArrayList<>(m.values())));
                Instant now = Instant.now();
                r.put("controlloAt", now.plusSeconds(RINVIO_MIN * 60).toString());
                r.put("rinvii", (r.get("rinvii") instanceof Number n ? n.intValue() : 0) + 1);
                salvaStati(m, c.nome());
                return ResponseEntity.ok(Map.of("stati", new ArrayList<>(m.values()), "ora", now.toString()));
            } catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", e.getMessage())); }
        }
    }

    /* ================= REPORT (solo admin) ================= */
    @GetMapping("/report")
    public ResponseEntity<?> report(@RequestParam(required = false) String da, @RequestParam(required = false) String a, HttpSession s) {
        Chi c = chi(s); if (!vede(c)) return no(c);
        if (!report(c)) return soloLivello(3);
        LocalDate fine = LocalDate.parse(giornoValido(a));
        LocalDate inizio = LocalDate.parse(giornoValido(da == null ? fine.minusDays(29).toString() : da));
        if (inizio.isAfter(fine)) { LocalDate t = inizio; inizio = fine; fine = t; }
        if (inizio.isBefore(fine.minusDays(370))) inizio = fine.minusDays(370);
        List<Map<String, Object>> ingressi = new ArrayList<>();
        for (LocalDate g = inizio; !g.isAfter(fine); g = g.plusDays(1)) {
            if (pieno(voce("SALONE_" + g))) ingressi.addAll(leggi("SALONE_" + g));
        }
        List<Map<String, Object>> cambi = new ArrayList<>();
        String gi = inizio.toString(), gf = fine.toString();
        for (YearMonth ym = YearMonth.from(inizio); !ym.isAfter(YearMonth.from(fine)); ym = ym.plusMonths(1))
            for (Map<String, Object> e : leggi("SALONE_STATI_LOG_" + ym)) {
                Instant at = inst(e.get("at")); if (at == null) continue;
                String g = at.atZone(ITALY).toLocalDate().toString();
                if (g.compareTo(gi) >= 0 && g.compareTo(gf) <= 0) cambi.add(e);
            }
        try {
            Map<String, Map<String, Object>> m;
            synchronized (LOCK) { m = statiOggi(); }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("da", gi); out.put("a", gf);
            out.put("ingressi", ingressi); out.put("cambi", cambi);
            out.put("stati", new ArrayList<>(m.values()));
            out.put("consulenti", CONSULENTI_AGNANO);
            out.put("ora", Instant.now().toString());
            return ResponseEntity.ok(out);
        } catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", e.getMessage())); }
    }

    /* ================= APPUNTAMENTI ================= */
    @GetMapping("/appuntamenti")
    public ResponseEntity<?> appuntamenti(@RequestParam(required = false) String data, HttpSession s) {
        Chi c = chi(s); if (!vede(c)) return no(c);
        String g = giornoValido(data == null ? oggi() : data);
        List<Map<String, Object>> l = new ArrayList<>();
        int daAssegnare = 0;
        Map<String, List<Map<String, Object>>> giorniIngressi = new HashMap<>();
        for (Map<String, Object> r : leggi("SALONE_APP")) {
            // il consulente vede i suoi appuntamenti e quelli che gli sono stati affidati all'arrivo del cliente
            if (!vedeTutti(c) && !mio(c, r.get("consulente")) && !mio(c, r.get("accoltoDa"))) continue;
            if (g.equals(r.get("appData"))) { arricchisci(r, giorniIngressi); l.add(r); }
            if (r.get("consulente") == null && str(r.get("appData")).compareTo(oggi()) >= 0) daAssegnare++;
        }
        l.sort(Comparator.comparing(r -> str(r.get("appOra"))));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", g); out.put("oggi", oggi());
        out.put("appuntamenti", l);
        out.put("puoGestire", gestisce(c));
        out.put("daAssegnareProssimi", daAssegnare);
        out.put("vedeTutti", vedeTutti(c)); out.put("puoImportare", gestisce(c)); out.put("vedeReport", report(c));
        List<Map<String, Object>> st = leggi("SALONE_APP_STORICO");
        if (!st.isEmpty()) {
            Map<String, Object> u = st.get(st.size() - 1);
            out.put("ultimoImport", Map.of("atIt", str(u.get("atIt")), "chi", str(u.get("chi")), "file", str(u.get("file"))));
        }
        return ResponseEntity.ok(out);
    }

    /* ================= CLIENTE DELL'APPUNTAMENTO IN SEDE =================
     * Il front office segna "Cliente in sede": si crea un ingresso di oggi collegato all'appuntamento e
     * assegnato al consulente scelto (quello dell'appuntamento o un altro, se e' occupato). Il consulente
     * riceve la stessa notifica dei walk-in ("sta venendo alla tua scrivania") e prendendolo in carico
     * risulta Occupato. Sull'appuntamento restano: arrivato alle, da chi, accolto da (consulente).
     *   { consulente }          segna l'arrivo / lo affida a un altro consulente (se non e' ancora preso in carico)
     *   { annulla: true }       toglie l'arrivo segnato per sbaglio (solo se non e' ancora preso in carico) */
    private static final List<String> CAMPI_ARRIVO = List.of("arrivatoAt", "arrivatoIt", "arrivatoDa", "ingressoId", "accoltoDa", "passato", "segnatoIt");
    private static final List<String> CAMPI_MANO = List.of("consulenteMano", "assegnatoManoDa", "assegnatoManoIt");
    /** aggiunge all'appuntamento lo stato dell'ingresso collegato (notificato / preso in carico / libero) */
    private void arricchisci(Map<String, Object> r, Map<String, List<Map<String, Object>>> giorni) {
        String iid = str(r.get("ingressoId"));
        if (iid.length() < 10) return;
        List<Map<String, Object>> l = giorni.computeIfAbsent(iid.substring(0, 10), k -> leggi("SALONE_" + k));
        l.stream().filter(x -> iid.equals(x.get("id"))).findFirst().ifPresent(x -> r.put("arrivo", mappa(
            "consulente", x.get("consulente"), "assegnatoAt", x.get("assegnatoAt"), "presoAt", x.get("presoAt"), "presoIt", x.get("presoIt"),
            "liberoAt", x.get("liberoAt"), "minutiCliente", x.get("minutiCliente"))));
    }
    @PostMapping("/appuntamenti/{id}/arrivato")
    public ResponseEntity<?> arrivato(@PathVariable String id, @RequestBody Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (!vede(c)) return no(c);
        if (!gestisce(c)) return soloLivello(2);
        boolean annulla = Boolean.TRUE.equals(b.get("annulla")), passato = Boolean.TRUE.equals(b.get("passato"));
        String cons = str(b.get("consulente"));
        if (!annulla && !CONSULENTI_AGNANO.contains(cons)) return ResponseEntity.badRequest().body(Map.of("error", "Scegli il consulente che accoglie il cliente"));
        Instant now = Instant.now();
        String g = now.atZone(ITALY).toLocalDate().toString();
        synchronized (LOCK) {
            List<Map<String, Object>> apps = leggi("SALONE_APP");
            Map<String, Object> a = apps.stream().filter(x -> id.equals(str(x.get("id")))).findFirst().orElse(null);
            if (a == null) return ResponseEntity.status(404).body(Map.of("error", "Appuntamento non trovato (forse tolto da un import)"));
            String iid = str(a.get("ingressoId"));
            String gi = iid.length() >= 10 ? iid.substring(0, 10) : g;
            List<Map<String, Object>> l = leggi("SALONE_" + gi);
            Map<String, Object> ing = iid.isEmpty() ? null : l.stream().filter(x -> iid.equals(x.get("id"))).findFirst().orElse(null);
            if (ing != null && ing.get("presoAt") != null)
                return ResponseEntity.status(409).body(Map.of("error", "Il cliente e' gia' stato preso in carico da " + str(ing.get("consulente"))));
            if (passato) {
                // CLIENTE PASSATO: l'appuntamento c'e' stato ma nessuno l'ha segnato sul momento. Niente notifica e niente ingresso.
                if (a.get("arrivatoAt") != null) return ResponseEntity.status(409).body(Map.of("error", "Il cliente risulta gia' arrivato"));
                Instant quando = now;
                try {
                    LocalDate d = LocalDate.parse(str(a.get("appData")));
                    String o = str(a.get("appOra"));
                    quando = (o.isEmpty() ? d.atTime(12, 0) : d.atTime(LocalTime.parse(o.length() == 4 ? "0" + o : o))).atZone(ITALY).toInstant();
                    if (quando.isAfter(now)) return ResponseEntity.badRequest().body(Map.of("error", "L'appuntamento non e' ancora passato: usa \"Cliente in sede\""));
                } catch (Exception e) { quando = now; }
                a.put("arrivatoAt", quando.toString()); a.put("arrivatoIt", oraIt(quando)); a.put("arrivatoDa", c.nome());
                a.put("accoltoDa", cons); a.put("passato", true); a.put("segnatoIt", oraIt(now));
                try { scrivi("SALONE_APP", apps, apps.size(), c.nome()); }
                catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", "Non salvato: " + e.getMessage())); }
                return ResponseEntity.ok(mappa("appuntamento", a));
            }
            if (!annulla && Boolean.TRUE.equals(a.get("passato")))
                return ResponseEntity.status(409).body(Map.of("error", "Questo appuntamento e' segnato come passato: annullalo prima"));
            try {
                if (annulla) {
                    if (ing != null) { l.remove(ing); scrivi("SALONE_" + gi, l, l.size(), c.nome()); }
                    for (String k : CAMPI_ARRIVO) a.remove(k);
                } else {
                    if (ing == null) {          // primo arrivo: nuovo ingresso di oggi
                        if (!gi.equals(g)) { gi = g; l = leggi("SALONE_" + g); }
                        ing = new LinkedHashMap<>();
                        String nome = str(a.get("nome")).replace(".", "").trim(), cognome = str(a.get("cognome"));
                        if (nome.isEmpty() && cognome.isEmpty()) nome = str(a.get("ragioneSociale"));
                        ing.put("id", g + "-" + UUID.randomUUID().toString().substring(0, 8));
                        ing.put("data", g); ing.put("ora", now.toString()); ing.put("oraIt", oraIt(now));
                        ing.put("nome", nome); ing.put("cognome", cognome); ing.put("cellulare", str(a.get("telefono")));
                        String marca = str(a.get("marca")), modello = str(a.get("modello"));
                        if (marca.equalsIgnoreCase("marca generica")) marca = "";
                        if (modello.equalsIgnoreCase("x")) modello = "";
                        ing.put("vetture", marca.isEmpty() && modello.isEmpty() ? List.of() : List.of(Map.of("marca", marca, "modello", modello)));
                        ing.put("note", "📅 Appuntamento" + (str(a.get("appOra")).isEmpty() ? "" : " delle " + str(a.get("appOra")))
                            + (a.get("consulente") == null ? "" : " con " + str(a.get("consulente"))) + " · lead " + id);
                        ing.put("registratoDa", c.nome());
                        ing.put("daApp", id); ing.put("appOra", a.get("appOra")); ing.put("consulentePrevisto", a.get("consulente"));
                        l.add(ing);
                        a.put("arrivatoAt", now.toString()); a.put("arrivatoIt", oraIt(now)); a.put("arrivatoDa", c.nome());
                        a.put("ingressoId", ing.get("id"));
                    }
                    assegna(ing, cons, c.nome(), now);      // stesso consulente: niente di nuovo; un altro: nuova notifica
                    a.put("accoltoDa", cons);
                    scrivi("SALONE_" + gi, l, l.size(), c.nome());
                }
                scrivi("SALONE_APP", apps, apps.size(), c.nome());
            } catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", "Non salvato: " + e.getMessage())); }
            arricchisci(a, new HashMap<>());
            return ResponseEntity.ok(mappa("appuntamento", a, "ingresso", ing));
        }
    }

    /* CONSULENTE SCELTO A MANO (anche in anticipo, per gli appuntamenti "Da assegnare" o per cambiarlo).
     * { consulente }  -> assegna;  { consulente: "" } -> torna a quello del CSV.
     * Resta anche dopo gli import, finche' il file non indica un altro consulente di Agnano. */
    @PostMapping("/appuntamenti/{id}/consulente")
    public ResponseEntity<?> consulenteApp(@PathVariable String id, @RequestBody Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (!vede(c)) return no(c);
        if (!gestisce(c)) return soloLivello(2);
        String cons = str(b.get("consulente"));
        if (!cons.isEmpty() && !CONSULENTI_AGNANO.contains(cons)) return ResponseEntity.badRequest().body(Map.of("error", "Consulente non valido"));
        Instant now = Instant.now();
        synchronized (LOCK) {
            List<Map<String, Object>> apps = leggi("SALONE_APP");
            Map<String, Object> a = apps.stream().filter(x -> id.equals(str(x.get("id")))).findFirst().orElse(null);
            if (a == null) return ResponseEntity.status(404).body(Map.of("error", "Appuntamento non trovato"));
            if (a.get("arrivatoAt") != null) return ResponseEntity.status(409).body(Map.of("error", "Il cliente e' gia' arrivato: usa \"Affida a un altro\""));
            if (cons.isEmpty()) {
                for (String k : CAMPI_MANO) a.remove(k);
                a.put("consulente", consulenteDi(str(a.get("venditore"))));
            } else {
                a.put("consulente", cons); a.put("consulenteMano", cons);
                a.put("assegnatoManoDa", c.nome()); a.put("assegnatoManoIt", oraIt(now));
            }
            try { scrivi("SALONE_APP", apps, apps.size(), c.nome()); }
            catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", "Non salvato: " + e.getMessage())); }
            return ResponseEntity.ok(mappa("appuntamento", a));
        }
    }

    @GetMapping("/appuntamenti/giorni")
    public ResponseEntity<?> appGiorni(@RequestParam(required = false) String mese, HttpSession s) {
        Chi c = chi(s); if (!vede(c)) return no(c);
        YearMonth ym;
        try { ym = YearMonth.parse(mese); } catch (Exception e) { ym = YearMonth.now(ITALY); }
        String pre = ym + "-";
        Map<String, Integer> out = new TreeMap<>(), daAss = new TreeMap<>();
        for (Map<String, Object> r : leggi("SALONE_APP")) {
            String g = str(r.get("appData"));
            if (!g.startsWith(pre)) continue;
            if (!vedeTutti(c) && !mio(c, r.get("consulente"))) continue;
            out.merge(g, 1, Integer::sum);
            if (r.get("consulente") == null) daAss.merge(g, 1, Integer::sum);
        }
        return ResponseEntity.ok(Map.of("mese", ym.toString(), "giorni", out, "daAssegnare", daAss));
    }

    @GetMapping("/appuntamenti/storico")
    public ResponseEntity<?> storico(HttpSession s) {
        Chi c = chi(s); if (!vede(c)) return no(c);
        if (!gestisce(c)) return soloLivello(2);
        List<Map<String, Object>> st = leggi("SALONE_APP_STORICO");
        Collections.reverse(st);
        return ResponseEntity.ok(Map.of("storico", st));
    }

    /* --- lettura delle date del CSV --- */
    private static final List<DateTimeFormatter> CSV_DT = List.of(
        DateTimeFormatter.ofPattern("d/M/yy H:mm"), DateTimeFormatter.ofPattern("d/M/yyyy H:mm"),
        DateTimeFormatter.ofPattern("d/M/yy H:mm:ss"), DateTimeFormatter.ofPattern("d/M/yyyy H:mm:ss"));
    private static LocalDateTime dataCsv(String s) {
        s = str(s);
        if (s.isEmpty() || s.startsWith("0000")) return null;
        for (DateTimeFormatter f : CSV_DT) try { return LocalDateTime.parse(s, f); } catch (Exception e) { /* prossimo formato */ }
        try { return LocalDate.parse(s, DateTimeFormatter.ofPattern("d/M/yy")).atStartOfDay(); } catch (Exception e) { return null; }
    }
    private static final Pattern ALERT_APP = Pattern.compile("(?i)appuntamento\\D{0,10}(\\d{1,2})/(\\d{1,2})/(\\d{2,4})(?:\\s+(\\d{1,2})[:.](\\d{2}))?");
    private static final Pattern NOTE_APP = Pattern.compile("(?i)\\bapp(?:untamento)?\\.?\\s*(?:il\\s+)?(?:del\\s+)?(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?(?:\\s*(?:alle\\s+)?(?:ore\\s+)?(?:h\\s*)?\\(?\\s*(\\d{1,2})[:.](\\d{2}))?");
    private static final Pattern NOTE_SEDE = Pattern.compile("(?i)\\bapp(?:untamento)?\\.?[^.\\n]{0,40}?\\b(salerno|nola)\\b");

    private static int anno(String y, int base) {
        if (y == null || y.isEmpty()) return base;
        int n = Integer.parseInt(y);
        return n < 100 ? 2000 + n : n;
    }
    /** data e ora dell'appuntamento: 1) "Data ricontatto"  2) "Esito alert" (Pianifica: Appuntamento ...)  3) le note ("app. 15/10 16:30") */
    private static Object[] dataAppuntamento(Map<String, Object> row) {
        LocalDateTime ins = dataCsv(str(row.get("dataInserimento")));
        int base = ins != null ? ins.getYear() : LocalDate.now(ITALY).getYear();
        LocalDateTime ric = dataCsv(str(row.get("dataRicontatto")));
        if (ric != null) return new Object[]{ ric.toLocalDate(), ric.getHour() == 0 && ric.getMinute() == 0 ? null : ric.toLocalTime(), "Data ricontatto" };
        Matcher m = ALERT_APP.matcher(str(row.get("esitoAlert")));
        if (m.find()) {
            try {
                LocalDate d = LocalDate.of(anno(m.group(3), base), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(1)));
                LocalTime t = m.group(4) == null ? null : LocalTime.of(Integer.parseInt(m.group(4)), Integer.parseInt(m.group(5)));
                return new Object[]{ d, t, "Esito alert" };
            } catch (Exception e) { /* data non valida: provo le note */ }
        }
        Matcher n = NOTE_APP.matcher(str(row.get("note")));
        Object[] ultimo = null;
        while (n.find()) {          // se nelle note ci sono piu' appuntamenti vale l'ultimo scritto
            try {
                LocalDate d = LocalDate.of(anno(n.group(3), base), Integer.parseInt(n.group(2)), Integer.parseInt(n.group(1)));
                if (n.group(3) == null && ins != null && d.isBefore(ins.toLocalDate().minusDays(60))) d = d.plusYears(1);
                LocalTime t = n.group(4) == null ? null : LocalTime.of(Integer.parseInt(n.group(4)), Integer.parseInt(n.group(5)));
                ultimo = new Object[]{ d, t, "Note" };
            } catch (Exception e) { /* */ }
        }
        return ultimo;
    }
    /** motivo per cui la riga NON va in Agnano (null = va bene) */
    private static String esclusa(Map<String, Object> row) {
        String sede = norm(str(row.get("sede")).replace(".", " "));
        if (sede.contains("nola")) return "Sede Nola";
        if (sede.contains("salerno")) return "Sede Salerno";
        if (!sede.replace(" ", "").contains("autoscala")) return sede.isEmpty() ? "Sede vuota" : "Sede diversa: " + str(row.get("sede"));
        Matcher m = NOTE_SEDE.matcher(str(row.get("note")));
        if (m.find()) return "Appuntamento a " + (m.group(1).toLowerCase(Locale.ROOT).startsWith("n") ? "Nola" : "Salerno") + " (scritto nelle note)";
        return null;
    }
    private static String cliente(Map<String, Object> r) {
        String n = (str(r.get("nome")).replace(".", "").trim() + " " + str(r.get("cognome"))).trim();
        return n.isEmpty() ? str(r.get("ragioneSociale")) : n;
    }
    private static final List<String> CAMPI_CSV = List.of("tipo", "origine", "canale", "cognome", "nome", "ragioneSociale", "email", "telefono", "telefono2",
        "venditore", "caller", "marca", "modello", "importo", "tipoRichiesta", "tipoVeicolo", "dataInserimento", "inseritoDa", "dataLead", "esitoAlert",
        "esitoAttivita", "dataRicontatto", "status", "note", "citta", "provincia", "sede", "team", "etichetteLead", "marcaPosseduta", "modelloPosseduto",
        "kmPosseduto", "annoPosseduto", "formulaAcquisto");
    /** i campi di cui teniamo traccia nello storico: etichetta -> valore */
    private static Map<String, String> tracciati(Map<String, Object> r) {
        Map<String, String> t = new LinkedHashMap<>();
        t.put("Appuntamento", (str(r.get("appData")) + " " + str(r.get("appOra"))).trim());
        t.put("Consulente", r.get("consulente") == null ? "Da assegnare" : str(r.get("consulente")));
        t.put("Venditore nel CSV", str(r.get("venditore")));
        t.put("Status", str(r.get("status")));
        t.put("Esito ultima attività", str(r.get("esitoAttivita")));
        t.put("Telefono", str(r.get("telefono")));
        t.put("Vettura", (str(r.get("marca")) + " " + str(r.get("modello"))).trim());
        t.put("Note", str(r.get("note")));
        return t;
    }

    /** esito della finestra di controllo: ok = allineato, modificato = data/ora cambiate a mano, forzato = inserito comunque */
    private static final List<String> CONTROLLI = List.of("ok", "modificato", "forzato");
    /** data e ora scelte nella pagina (appData aaaa-mm-gg, appOra hh:mm): null se non ci sono o non sono valide */
    private static Object[] sceltaPagina(Map<?, ?> raw) {
        String d = str(raw.get("appData")), o = str(raw.get("appOra"));
        if (d.isEmpty()) return null;
        try {
            LocalDate g = LocalDate.parse(d);
            LocalTime t = o.isEmpty() ? null : LocalTime.parse(o.length() == 4 ? "0" + o : o);
            String fonte = str(raw.get("fonteData"));
            return new Object[]{ g, t, fonte.isEmpty() ? "Import" : fonte };
        } catch (Exception e) { return null; }
    }

    /** prima dell'import: quali lead del file sono gia' in archivio e come erano stati salvati */
    @PostMapping("/appuntamenti/anteprima")
    public ResponseEntity<?> anteprimaImport(@RequestBody Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (!vede(c)) return no(c);
        if (!gestisce(c)) return soloLivello(2);
        Set<String> ids = new HashSet<>();
        if (b.get("ids") instanceof List<?> l) for (Object o : l) ids.add(str(o));
        String da = str(b.get("da")), a = str(b.get("a"));
        Map<String, Object> out = new LinkedHashMap<>();
        List<Map<String, Object>> nelPeriodo = new ArrayList<>();
        for (Map<String, Object> r : leggi("SALONE_APP")) {
            String id = str(r.get("id")), g = str(r.get("appData"));
            if (ids.contains(id)) {
                Map<String, String> t = tracciati(r);
                out.put(id, mappa("appData", r.get("appData"), "appOra", r.get("appOra"), "controllo", r.get("controllo"),
                    "esitoAlert", str(r.get("esitoAlert")), "esitoAttivita", str(r.get("esitoAttivita")), "dataRicontatto", str(r.get("dataRicontatto")),
                    "consulente", r.get("consulente"), "consulenteMano", r.get("consulenteMano"), "venditore", str(r.get("venditore")), "status", str(r.get("status")),
                    "telefono", str(r.get("telefono")), "vettura", t.get("Vettura"), "note", str(r.get("note")), "cliente", cliente(r)));
            } else if (!da.isEmpty() && !a.isEmpty() && !g.isEmpty() && g.compareTo(da) >= 0 && g.compareTo(a) <= 0) {
                // in archivio in quei giorni ma non piu' nel file: "spariti"
                nelPeriodo.add(mappa("id", id, "cliente", cliente(r), "appData", g, "appOra", r.get("appOra"), "consulente", r.get("consulente"),
                    "status", str(r.get("status")), "venditore", str(r.get("venditore"))));
            }
        }
        // con quale consulente finirebbe ogni venditore del file (stessa regola dell'import)
        Map<String, Object> consulenti = new LinkedHashMap<>();
        if (b.get("venditori") instanceof List<?> l) for (Object o : l) consulenti.put(str(o), consulenteDi(str(o)));
        return ResponseEntity.ok(mappa("esistenti", out, "nelPeriodo", nelPeriodo, "consulenti", consulenti));
    }

    @PostMapping("/appuntamenti/import")
    public ResponseEntity<?> importa(@RequestBody Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (!vede(c)) return no(c);
        if (!gestisce(c)) return soloLivello(2);
        if (!(b.get("righe") instanceof List<?> righe) || righe.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Il file non contiene righe"));
        Instant now = Instant.now();
        String impId = Long.toString(now.toEpochMilli(), 36);
        synchronized (LOCK) {
            List<Map<String, Object>> tutti = leggi("SALONE_APP");
            Map<String, Map<String, Object>> perId = new LinkedHashMap<>();
            for (Map<String, Object> r : tutti) perId.put(str(r.get("id")), r);
            int nuovi = 0, aggiornati = 0, invariati = 0, senzaData = 0, autoAssegnati = 0, daAssegnare = 0, allineati = 0, modificati = 0, forzati = 0;
            List<Map<String, Object>> esclusi = new ArrayList<>(), nuoviElenco = new ArrayList<>(), cambi = new ArrayList<>(),
                modificatiElenco = new ArrayList<>(), forzatiElenco = new ArrayList<>();
            Map<String, Integer> esclusiPerMotivo = new TreeMap<>();
            Set<String> visti = new HashSet<>();
            for (Object o : righe) {
                if (!(o instanceof Map<?, ?> raw)) continue;
                Map<String, Object> row = new LinkedHashMap<>();
                for (String k : CAMPI_CSV) row.put(k, str(raw.get(k)));
                String id = str(raw.get("id"));
                if (id.isEmpty() || !visti.add(id)) continue;
                String motivo = esclusa(row);
                if (motivo != null) {
                    esclusiPerMotivo.merge(motivo.startsWith("Sede diversa") ? "Sede diversa" : motivo, 1, Integer::sum);
                    if (esclusi.size() < 300) esclusi.add(Map.of("id", id, "cliente", cliente(row), "motivo", motivo));
                    continue;
                }
                Object[] app = sceltaPagina(raw);          // data e ora decise nella finestra di controllo
                String controllo = CONTROLLI.contains(str(raw.get("controllo"))) ? str(raw.get("controllo")) : null;
                if (app == null && controllo == null) app = dataAppuntamento(row);   // pagina vecchia: come prima
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("id", id);
                r.putAll(row);
                r.put("appData", app == null ? null : app[0].toString());
                r.put("appOra", app == null || app[1] == null ? null : app[1].toString());
                r.put("fonteData", app == null ? null : app[2]);
                r.put("consulente", consulenteDi(str(row.get("venditore"))));
                if (controllo != null) {
                    r.put("controllo", controllo);
                    r.put("avviso", "ok".equals(controllo) ? null : taglia(str(raw.get("avviso"))));
                    if ("ok".equals(controllo)) allineati++;
                    else {
                        Map<String, Object> e = mappa("id", id, "cliente", cliente(r), "appuntamento", (str(r.get("appData")) + " " + str(r.get("appOra"))).trim(),
                            "avviso", r.get("avviso"));
                        if ("modificato".equals(controllo)) { modificati++; if (modificatiElenco.size() < 300) modificatiElenco.add(e); }
                        else { forzati++; if (forzatiElenco.size() < 300) forzatiElenco.add(e); }
                    }
                }
                if (app == null) senzaData++;
                Map<String, Object> prima = perId.get(id);
                // consulente scelto a mano nel CRM: resta, a meno che il file non indichi un ALTRO consulente di Agnano
                // (in quel caso il lead compare tra i "Cambiati" e, se lo aggiorni, vale il file)
                if (prima != null && prima.get("consulenteMano") != null) {
                    Object mano = prima.get("consulenteMano"), file = r.get("consulente");
                    if (file == null || file.equals(mano)) { r.put("consulente", mano); for (String k : CAMPI_MANO) r.put(k, prima.get(k)); }
                }
                if (r.get("consulente") == null) daAssegnare++;
                if (prima == null) {
                    r.put("primoImportIt", oraIt(now)); r.put("ultimoImportIt", oraIt(now)); r.put("ultimoImport", impId);
                    perId.put(id, r); nuovi++;
                    if (nuoviElenco.size() < 300) nuoviElenco.add(mappa("id", id, "cliente", cliente(r), "consulente", r.get("consulente") == null ? "Da assegnare" : r.get("consulente"),
                        "appuntamento", (str(r.get("appData")) + " " + str(r.get("appOra"))).trim()));
                    continue;
                }
                Map<String, String> tp = tracciati(prima), tn = tracciati(r);
                boolean cambiato = false;
                for (String campo : tn.keySet()) {
                    if (Objects.equals(tp.get(campo), tn.get(campo))) continue;
                    cambiato = true;
                    if ("Consulente".equals(campo) && prima.get("consulente") == null && r.get("consulente") != null) autoAssegnati++;
                    if (cambi.size() < 1500) cambi.add(mappa("id", id, "cliente", cliente(r), "campo", campo,
                        "prima", "Note".equals(campo) ? taglia(tp.get(campo)) : tp.get(campo),
                        "dopo", "Note".equals(campo) ? taglia(tn.get(campo)) : tn.get(campo)));
                }
                for (String k : CAMPI_ARRIVO) if (prima.containsKey(k)) r.put(k, prima.get(k));   // l'arrivo in sede (o "passato") non si perde
                r.put("primoImportIt", prima.get("primoImportIt"));
                r.put("ultimoImport", impId); r.put("ultimoImportIt", oraIt(now));
                r.put("aggiornatoIt", cambiato ? oraIt(now) : prima.get("aggiornatoIt"));
                perId.put(id, r);
                if (cambiato) aggiornati++; else invariati++;
            }
            // tolti dal calendario a mano nella finestra di controllo (cambiati, non allineati o spariti dal file)
            List<Map<String, Object>> rimossiElenco = new ArrayList<>();
            if (b.get("rimuovi") instanceof List<?> lr) for (Object o : lr) {
                if (!(o instanceof Map<?, ?> m)) continue;
                String id = str(m.get("id"));
                Map<String, Object> prima = perId.remove(id);
                if (prima == null) continue;
                if (rimossiElenco.size() < 300) rimossiElenco.add(mappa("id", id, "cliente", cliente(prima),
                    "appuntamento", (str(prima.get("appData")) + " " + str(prima.get("appOra"))).trim(),
                    "consulente", prima.get("consulente") == null ? "Da assegnare" : prima.get("consulente"), "avviso", taglia(str(m.get("motivo")))));
            }
            int considerati = nuovi + aggiornati + invariati;
            // appuntamenti piu' vecchi di 13 mesi: non servono piu' (tiene leggero l'archivio)
            String limite = LocalDate.now(ITALY).minusMonths(13).toString();
            List<Map<String, Object>> salva = new ArrayList<>();
            for (Map<String, Object> r : perId.values()) if (r.get("appData") == null || str(r.get("appData")).compareTo(limite) >= 0) salva.add(r);
            Map<String, Object> imp = new LinkedHashMap<>();
            imp.put("id", impId); imp.put("at", now.toString()); imp.put("atIt", oraIt(now)); imp.put("chi", c.nome());
            imp.put("file", str(b.get("file")));
            imp.put("righeFile", b.get("righeFile") instanceof Number n ? n.intValue() : righe.size()); imp.put("considerati", considerati);
            imp.put("nuovi", nuovi); imp.put("aggiornati", aggiornati); imp.put("invariati", invariati);
            // finestra di controllo: giorni scelti e righe non allineate (saltate / modificate / inserite comunque)
            List<Map<String, Object>> saltati = new ArrayList<>();
            if (b.get("saltati") instanceof List<?> ls) for (Object o : ls) {
                if (!(o instanceof Map<?, ?> m) || saltati.size() >= 300) continue;
                saltati.add(mappa("id", str(m.get("id")), "cliente", str(m.get("cliente")), "avviso", taglia(str(m.get("avviso")))));
            }
            if (b.containsKey("periodo")) {
                imp.put("periodo", taglia(str(b.get("periodo"))));
                imp.put("fuoriPeriodo", b.get("fuoriPeriodo") instanceof Number n ? n.intValue() : 0);
                imp.put("allineati", allineati); imp.put("modificati", modificati); imp.put("forzati", forzati);
                imp.put("saltati", b.get("nSaltati") instanceof Number n ? n.intValue() : saltati.size());
                imp.put("saltatiElenco", saltati); imp.put("modificatiElenco", modificatiElenco); imp.put("forzatiElenco", forzatiElenco);
                List<Map<String, Object>> tenuti = new ArrayList<>();
                if (b.get("tenuti") instanceof List<?> lt) for (Object o : lt) {
                    if (!(o instanceof Map<?, ?> m) || tenuti.size() >= 300) continue;
                    tenuti.add(mappa("id", str(m.get("id")), "cliente", str(m.get("cliente")), "avviso", "Non aggiornato: " + taglia(str(m.get("avviso")))));
                }
                imp.put("tenutiElenco", tenuti); imp.put("tenuti", tenuti.size());
                imp.put("tenutiSpariti", b.get("tenutiSpariti") instanceof Number n ? n.intValue() : 0);
            }
            imp.put("rimossi", rimossiElenco.size()); imp.put("rimossiElenco", rimossiElenco);
            imp.put("esclusi", esclusiPerMotivo.values().stream().mapToInt(Integer::intValue).sum());
            imp.put("esclusiPerMotivo", esclusiPerMotivo); imp.put("esclusiElenco", esclusi);
            imp.put("senzaData", senzaData); imp.put("daAssegnare", daAssegnare); imp.put("assegnatiDaImport", autoAssegnati);
            imp.put("nuoviElenco", nuoviElenco); imp.put("cambi", cambi);
            List<Map<String, Object>> st = leggi("SALONE_APP_STORICO");
            st.add(imp);
            while (st.size() > MAX_STORICO) st.remove(0);
            try {
                scrivi("SALONE_APP", salva, salva.size(), c.nome());
                scrivi("SALONE_APP_STORICO", st, st.size(), c.nome());
            } catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", "Import non salvato: " + e.getMessage())); }
            return ResponseEntity.ok(Map.of("import", imp));
        }
    }
    private static String taglia(String s) { return s == null ? "" : s.length() > 160 ? "…" + s.substring(s.length() - 160) : s; }
    private static Map<String, Object> mappa(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) m.put(String.valueOf(kv[i]), kv[i + 1]);
        return m;
    }

    /* ================= ELIMINA STORICO (solo Admin) ================= */
    @Value("${SALONE_PASSWORD_ELIMINA:RITA}")
    private String passwordElimina;
    /** primo giorno in cui possono esserci walk-in salvati (la sezione e' nata nel 2026) */
    private static final LocalDate PRIMO_GIORNO = LocalDate.of(2025, 1, 1);

    @PostMapping("/storico/elimina")
    public ResponseEntity<?> eliminaStorico(@RequestBody Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (c == null) return no(null);
        if (!"ADMIN".equalsIgnoreCase(c.role())) return ResponseEntity.status(403).body(Map.of("error", "Solo un Admin puo' eliminare lo storico"));
        if (!str(b.get("password")).equals(str(passwordElimina)))
            return ResponseEntity.status(403).body(Map.of("error", "Password non corretta: non e' stato eliminato niente"));
        boolean walkin = Boolean.TRUE.equals(b.get("walkin")), app = Boolean.TRUE.equals(b.get("appuntamenti")),
                imp = Boolean.TRUE.equals(b.get("storicoImport")), tutto = Boolean.TRUE.equals(b.get("tutto")),
                stati = Boolean.TRUE.equals(b.get("stati")), chat = Boolean.TRUE.equals(b.get("chat"));
        if (!walkin && !app && !imp && !stati && !chat) return ResponseEntity.badRequest().body(Map.of("error", "Scegli cosa eliminare"));
        LocalDate oggi = LocalDate.now(ITALY), da, a;
        if (tutto) { da = PRIMO_GIORNO; a = oggi.plusYears(2); }
        else {
            try { da = LocalDate.parse(str(b.get("da"))); a = LocalDate.parse(str(b.get("a"))); }
            catch (Exception e) { return ResponseEntity.badRequest().body(Map.of("error", "Scegli il periodo (dal / al)")); }
            if (da.isAfter(a)) { LocalDate t = da; da = a; a = t; }
        }
        String gi = da.toString(), gf = a.toString();
        int nWalkin = 0, nGiorni = 0, nApp = 0, nImp = 0, nCambi = 0, nMsg = 0;
        synchronized (LOCK) {
            try {
                if (walkin) {
                    LocalDate fineW = a.isAfter(oggi) ? oggi : a;
                    for (LocalDate g = da.isBefore(PRIMO_GIORNO) ? PRIMO_GIORNO : da; !g.isAfter(fineW); g = g.plusDays(1)) {
                        Optional<Voce> ds = voce("SALONE_" + g);
                        if (!pieno(ds)) continue;
                        nWalkin += ds.get().righe(); nGiorni++;
                        scrivi("SALONE_" + g, new ArrayList<>(), 0, c.nome());
                    }
                }
                if (app) {
                    List<Map<String, Object>> l = leggi("SALONE_APP");
                    int prima = l.size();
                    if (tutto) l.clear();
                    else l.removeIf(r -> { String g = str(r.get("appData")); return !g.isEmpty() && g.compareTo(gi) >= 0 && g.compareTo(gf) <= 0; });
                    nApp = prima - l.size();
                    if (nApp > 0) scrivi("SALONE_APP", l, l.size(), c.nome());
                }
                if (imp) {
                    List<Map<String, Object>> l = leggi("SALONE_APP_STORICO");
                    int prima = l.size();
                    if (tutto) l.clear();
                    else l.removeIf(r -> { Instant at = inst(r.get("at")); if (at == null) return false; String g = at.atZone(ITALY).toLocalDate().toString(); return g.compareTo(gi) >= 0 && g.compareTo(gf) <= 0; });
                    nImp = prima - l.size();
                    if (nImp > 0) scrivi("SALONE_APP_STORICO", l, l.size(), c.nome());
                }
                if (stati) {
                    // storico dei cambi di stato (un elenco per mese): da qui escono tempi e grafici del Report
                    LocalDate fineS = a.isAfter(oggi) ? oggi : a;
                    for (YearMonth ym = YearMonth.from(da.isBefore(PRIMO_GIORNO) ? PRIMO_GIORNO : da); !ym.isAfter(YearMonth.from(fineS)); ym = ym.plusMonths(1)) {
                        String key = "SALONE_STATI_LOG_" + ym;
                        List<Map<String, Object>> l = leggi(key);
                        if (l.isEmpty()) continue;
                        int prima = l.size();
                        if (tutto) l.clear();
                        else l.removeIf(e -> { Instant at = inst(e.get("at")); if (at == null) return false; String g = at.atZone(ITALY).toLocalDate().toString(); return g.compareTo(gi) >= 0 && g.compareTo(gf) <= 0; });
                        if (l.size() != prima) { nCambi += prima - l.size(); scrivi(key, l, l.size(), c.nome()); }
                    }
                    // "tutto": anche lo stato attuale di ogni consulente torna vuoto (bollino grigio)
                    if (tutto) {
                        Map<String, Map<String, Object>> m = statiMappa();
                        for (Map<String, Object> st : m.values()) {
                            st.put("stato", null); st.put("dal", null); st.put("dalIt", null); st.put("cliente", null);
                            st.put("walkinId", null); st.put("walkinAperto", null); st.put("motivo", null); st.put("chi", null);
                            st.put("uscitoAt", null); st.put("uscitoIt", null);
                        }
                        salvaStati(m, c.nome());
                    }
                }
                if (chat) {
                    List<String> conv = new ArrayList<>(List.of("GRUPPO")); conv.addAll(indice());
                    for (String k : conv) {
                        List<Map<String, Object>> l = leggi("SALONE_CHAT_" + k);
                        if (l.isEmpty()) continue;
                        int prima = l.size();
                        if (tutto) l.clear();
                        else l.removeIf(m -> { long ts = m.get("ts") instanceof Number n ? n.longValue() : 0; if (ts == 0) return false; String g = Instant.ofEpochMilli(ts).atZone(ITALY).toLocalDate().toString(); return g.compareTo(gi) >= 0 && g.compareTo(gf) <= 0; });
                        if (l.size() != prima) { nMsg += prima - l.size(); scrivi("SALONE_CHAT_" + k, l, l.size(), c.nome()); }
                    }
                    // le chat aperte in questo momento (di tutti) si svuotano e si ricaricano da sole
                    scrivi("SALONE_CHAT_AZZERATA", List.of(Map.of("at", System.currentTimeMillis())), 1, c.nome());
                }
            } catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", "Eliminazione non completata: " + e.getMessage())); }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("walkin", nWalkin); out.put("giorni", nGiorni); out.put("appuntamenti", nApp); out.put("import", nImp);
        out.put("cambi", nCambi); out.put("messaggi", nMsg);
        out.put("periodo", tutto ? "tutto" : gi + " / " + gf);
        return ResponseEntity.ok(out);
    }

    /* ================= CHAT ================= */
    @GetMapping("/chat/utenti")
    public ResponseEntity<?> utenti(HttpSession s) {
        Chi c = chi(s); if (!chat(c)) return noChat(c);
        List<Map<String, Object>> out = new ArrayList<>();
        for (User u : userRepository.findAll()) {
            if (u.getId() == null || u.getId().equals(c.id())) continue;
            String acc = rolePermissionService.getEffectiveAccess(u.getId(), u.getRole(), SEZ);
            if (chatOk(acc, u.getRole()))
                out.add(Map.of("id", u.getId(), "nome", String.valueOf(u.getFullName()), "role", String.valueOf(u.getRole())));
        }
        out.sort(Comparator.comparing(m -> String.valueOf(m.get("nome"))));
        return ResponseEntity.ok(Map.of("utenti", out, "io", Map.of("id", c.id(), "nome", c.nome())));
    }

    /** "GRUPPO" oppure "P_a_b" con a < b; l'utente deve farne parte */
    private static String convValida(String conv, Long io) {
        if ("GRUPPO".equals(conv)) return conv;
        if (conv == null || !conv.matches("P_\\d+_\\d+")) return null;
        String[] p = conv.split("_");
        long a = Long.parseLong(p[1]), b = Long.parseLong(p[2]);
        if (a >= b || (a != io && b != io)) return null;
        return conv;
    }
    private Map<String, Map<String, Object>> letti() {
        return voce("SALONE_CHAT_LETTI").map(d -> {
            try { return objectMapper.readValue(d.json(), new TypeReference<Map<String, Map<String, Object>>>() {}); }
            catch (Exception e) { return new HashMap<String, Map<String, Object>>(); }
        }).orElseGet(HashMap::new);
    }
    /** elenco delle chat private create (SALONE_CHAT_INDICE) */
    private List<String> indice() {
        return voce("SALONE_CHAT_INDICE").map(d -> {
            try { return objectMapper.readValue(d.json(), new TypeReference<List<String>>() {}); }
            catch (Exception e) { return new ArrayList<String>(); }
        }).orElseGet(ArrayList::new);
    }
    private List<String> mieConv(Long io) {
        List<String> out = new ArrayList<>(List.of("GRUPPO"));
        for (String conv : indice()) if (convValida(conv, io) != null) out.add(conv);
        return out;
    }

    @GetMapping("/chat/aggiornamenti")
    public ResponseEntity<?> aggiornamenti(@RequestParam(required = false, defaultValue = "0") long dopo, HttpSession s) {
        Chi c = chi(s); if (!chat(c)) return noChat(c);
        Map<String, Object> conv = new LinkedHashMap<>();
        Map<String, Object> mieiLetti = letti().getOrDefault(String.valueOf(c.id()), Map.of());
        long max = dopo;
        for (String k : mieConv(c.id())) {
            List<Map<String, Object>> l = leggi("SALONE_CHAT_" + k);
            List<Map<String, Object>> nuovi = new ArrayList<>();
            long letto = mieiLetti.get(k) instanceof Number n ? n.longValue() : 0;
            int nonLetti = 0;
            for (Map<String, Object> m : l) {
                long agg = m.get("agg") instanceof Number n ? n.longValue() : 0;
                long ts = m.get("ts") instanceof Number n ? n.longValue() : 0;
                if (agg > dopo) nuovi.add(m);
                if (ts > letto && !c.id().equals(((Number) m.getOrDefault("da", 0)).longValue())) nonLetti++;
                max = Math.max(max, agg);
            }
            conv.put(k, Map.of("messaggi", nuovi, "nonLetti", nonLetti));
        }
        long azz = leggi("SALONE_CHAT_AZZERATA").stream().map(x -> x.get("at")).filter(x -> x instanceof Number).mapToLong(x -> ((Number) x).longValue()).max().orElse(0);
        return ResponseEntity.ok(Map.of("conv", conv, "ora", max, "azzerata", azz));
    }

    @PostMapping("/chat/messaggi")
    public ResponseEntity<?> invia(@RequestBody Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (!chat(c)) return noChat(c);
        String conv = convValida(String.valueOf(b.get("conv")), c.id());
        if (conv == null) return ResponseEntity.badRequest().body(Map.of("error", "Conversazione non valida"));
        if (!"GRUPPO".equals(conv)) {          // chat privata: anche l'altro deve avere la chat
            String[] p = conv.split("_");
            long altro = Long.parseLong(p[1]) == c.id() ? Long.parseLong(p[2]) : Long.parseLong(p[1]);
            User u = userRepository.findById(altro).orElse(null);
            if (u == null || !chatOk(rolePermissionService.getEffectiveAccess(u.getId(), u.getRole(), SEZ), u.getRole()))
                return ResponseEntity.status(403).body(Map.of("error", "Questa persona non ha la chat del salone"));
        }
        String testo = String.valueOf(b.getOrDefault("testo", "")).trim();
        if (testo.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Messaggio vuoto"));
        if (testo.length() > 4000) testo = testo.substring(0, 4000);
        long now = System.currentTimeMillis();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", Long.toString(now, 36) + UUID.randomUUID().toString().substring(0, 4));
        m.put("da", c.id()); m.put("nome", c.nome());
        m.put("testo", testo); m.put("ts", now); m.put("agg", now);
        if (b.get("rispostaA") != null) m.put("rispostaA", String.valueOf(b.get("rispostaA")));
        m.put("reazioni", new LinkedHashMap<String, List<String>>());
        synchronized (LOCK) {
            List<Map<String, Object>> l = leggi("SALONE_CHAT_" + conv);
            l.add(m);
            while (l.size() > MAX_MSG) l.remove(0);
            if (!"GRUPPO".equals(conv)) {
                List<String> ind = indice();
                if (!ind.contains(conv)) { ind.add(conv); try { scrivi("SALONE_CHAT_INDICE", ind, ind.size(), c.nome()); } catch (Exception e) { /* */ } }
            }
            try { scrivi("SALONE_CHAT_" + conv, l, l.size(), c.nome()); segnaLetto(c.id(), conv, now); }
            catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", "Messaggio non inviato: " + e.getMessage())); }
        }
        return ResponseEntity.ok(Map.of("messaggio", m));
    }

    @SuppressWarnings("unchecked")
    @PostMapping("/chat/reazione")
    public ResponseEntity<?> reazione(@RequestBody Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (!chat(c)) return noChat(c);
        String conv = convValida(String.valueOf(b.get("conv")), c.id());
        String id = String.valueOf(b.get("id")), emoji = String.valueOf(b.getOrDefault("emoji", "")).trim();
        if (conv == null || emoji.isEmpty() || emoji.length() > 16) return ResponseEntity.badRequest().body(Map.of("error", "Reazione non valida"));
        synchronized (LOCK) {
            List<Map<String, Object>> l = leggi("SALONE_CHAT_" + conv);
            Map<String, Object> m = l.stream().filter(x -> id.equals(x.get("id"))).findFirst().orElse(null);
            if (m == null) return ResponseEntity.status(404).body(Map.of("error", "Messaggio non trovato"));
            Map<String, Object> rz = m.get("reazioni") instanceof Map ? (Map<String, Object>) m.get("reazioni") : new LinkedHashMap<>();
            List<Object> chi = rz.get(emoji) instanceof List ? new ArrayList<>((List<Object>) rz.get(emoji)) : new ArrayList<>();
            String io = c.nome();
            if (chi.contains(io)) chi.remove(io); else chi.add(io);
            if (chi.isEmpty()) rz.remove(emoji); else rz.put(emoji, chi);
            m.put("reazioni", rz);
            m.put("agg", System.currentTimeMillis());
            try { scrivi("SALONE_CHAT_" + conv, l, l.size(), c.nome()); }
            catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", e.getMessage())); }
            return ResponseEntity.ok(Map.of("messaggio", m));
        }
    }

    @PostMapping("/chat/letto")
    public ResponseEntity<?> letto(@RequestBody Map<String, Object> b, HttpSession s) {
        Chi c = chi(s); if (!chat(c)) return noChat(c);
        String conv = convValida(String.valueOf(b.get("conv")), c.id());
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
        scrivi("SALONE_CHAT_LETTI", l, l.size(), null);
    }
}
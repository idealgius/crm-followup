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
 *  - Livello 1 (Solo lettura): vede tutti i walk-in e gli appuntamenti, non registra e non importa.
 *    Il ruolo Consulenza a questo livello vede solo i propri clienti e appuntamenti.
 *  - Livello 2 (Completo): registra e assegna i walk-in, importa gli appuntamenti, storico import,
 *    cambia lo stato degli altri consulenti
 *  - Livello 3 (Accesso Admin): come il livello 2 + scheda Report
 *  - Livello 4: come il livello 3 + chat del salone
 *  CHAT: livello 4, oppure ruoli Front Office / Consulenza / Back Office a qualunque livello.
 *        Gli altri (livelli 1-3) non la vedono e non possono ricevere messaggi.
 *  Iniziali: Admin livello 4 · Front Office livello 2 (+ chat) · Consulenza livello 1 (solo i propri, + chat)
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
 *  Ogni cambio finisce nello storico SALONE_STATI_LOG_<aaaa-mm> con la durata dello stato precedente.
 *  A fine giornata lo stato rimasto aperto viene chiuso alle 21:00 (CHIUSURA) e il giorno dopo si riparte da zero.
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
    private static final LocalTime CHIUSURA = LocalTime.of(21, 0);
    private static final int MAX_MSG = 1500;
    private static final int MAX_STORICO = 150;
    private static final Object LOCK = new Object();
    public static final List<String> STATI = List.of("DISPONIBILE", "OCCUPATO", "NON_DISPONIBILE");
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
        String nome = userRepository.findById(id).map(User::getFullName).orElse("");
        return new Chi(id, role, nome, rolePermissionService.getEffectiveAccess(id, role, SEZ));
    }
    private boolean vede(Chi c) { return c != null && rolePermissionService.hasAtLeast(c.acc(), "READ_ONLY"); }
    private boolean gestisce(Chi c) { return c != null && rolePermissionService.hasAtLeast(c.acc(), "FULL"); }
    /** Admin e Front Office vedono tutto; Consulenza solo i propri clienti */
    /** LIVELLI della voce "Appuntamenti e ingressi" (pagina Permessi):
     *  Livello 1 = Solo lettura  -> vede tutto come il Front Office, ma non registra walk-in e non importa
     *                               (ruolo Consulenza a questo livello: solo i propri clienti e appuntamenti)
     *  Livello 2 = Completo      -> registra e assegna walk-in, importa gli appuntamenti, cambia lo stato degli altri
     *  Livello 3 = Accesso Admin -> come il 2 + scheda Report */
    private boolean vedeTutti(Chi c) {
        if (gestisce(c)) return true;
        return vede(c) && !"CONSULENZA".equalsIgnoreCase(c.role());
    }
    private boolean report(Chi c) { return c != null && rolePermissionService.hasAtLeast(c.acc(), "ADMIN_FULL"); }
    private static String livello(String acc) {
        return switch (acc == null ? "" : acc) { case "LIVELLO_4" -> "4"; case "ADMIN_FULL" -> "3"; case "FULL" -> "2"; case "READ_ONLY" -> "1"; default -> "0"; };
    }
    /** CHAT del salone: livello 4, oppure i ruoli del salone (permesso speciale, a qualunque livello).
     *  Livelli 1, 2 e 3 degli altri ruoli: la chat non la vedono e non possono ricevere messaggi. */
    private static final Set<String> RUOLI_CHAT = Set.of("FRONT_OFFICE", "CONSULENZA", "BACK_OFFICE");
    private boolean chatOk(String acc, String role) {
        if (!rolePermissionService.hasAtLeast(acc, "READ_ONLY")) return false;
        return rolePermissionService.hasAtLeast(acc, "LIVELLO_4") || (role != null && RUOLI_CHAT.contains(role.toUpperCase(Locale.ROOT)));
    }
    private boolean chat(Chi c) { return c != null && chatOk(c.acc(), c.role()); }
    private ResponseEntity<?> noChat(Chi c) {
        return c == null ? no(null) : ResponseEntity.status(403).body(Map.of("error", "La chat del salone non e' attiva per il tuo livello"));
    }
    private ResponseEntity<?> no(Chi c) {
        return c == null ? ResponseEntity.status(401).body(Map.of("error", "Non autenticato"))
                         : ResponseEntity.status(403).body(Map.of("error", "Non hai il permesso per Appuntamenti e ingressi"));
    }
    private static ResponseEntity<?> soloLivello(int n) { return ResponseEntity.status(403).body(Map.of("error", "Serve il livello " + n + " su Appuntamenti e ingressi")); }
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

    /* ================= archivio (consegne_dataset) ================= */
    private List<Map<String, Object>> leggi(String key) {
        return repository.findById(key).map(d -> {
            try { return objectMapper.readValue(d.getContenuto(), new TypeReference<List<Map<String, Object>>>() {}); }
            catch (Exception e) { return new ArrayList<Map<String, Object>>(); }
        }).orElseGet(ArrayList::new);
    }
    private void scrivi(String key, Object lista, int righe, String chi) throws Exception {
        ConsegneDataset d = repository.findById(key).orElseGet(() -> { ConsegneDataset n = new ConsegneDataset(); n.setTipo(key); return n; });
        d.setContenuto(objectMapper.writeValueAsString(lista));
        d.setRighe(righe);
        d.setAggiornatoAt(LocalDateTime.now(ITALY));
        d.setAggiornatoDa(chi);
        repository.save(d);
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
        out.put("livello", livello(c.acc()));
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
            Optional<ConsegneDataset> ds = repository.findById("SALONE_" + g);
            if (ds.isEmpty() || ds.get().getRighe() == null || ds.get().getRighe() == 0) continue;
            int n = tutti ? ds.get().getRighe() : (int) leggi("SALONE_" + g).stream().filter(r -> mio(c, r.get("consulente"))).count();
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
            if (!mio(c, r.get("consulente")) && !gestisce(c))
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
                    cambiaStato(m, String.valueOf(r.get("consulente")), "OCCUPATO", c.nome(), "Walk-in preso in carico", id, cliente, now);
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
     *  - uno stato rimasto aperto da un giorno precedente (o oltre le 21:00 di oggi) viene chiuso alle 21:00
     *  - PRESENZA: chi e' diventato disponibile con l'accesso al CRM torna "non in salone" quando
     *    il CRM non e' piu' aperto (finestra chiusa, Esci, sessione scaduta o nuovo deploy) */
    private Map<String, Map<String, Object>> statiOggi() throws Exception {
        Map<String, Map<String, Object>> m = statiMappa();
        ZonedDateTime ora = ZonedDateTime.now(ITALY);
        LocalDate oggi = ora.toLocalDate();
        Instant now = ora.toInstant();
        boolean cambiato = false;
        for (Map<String, Object> r : m.values()) {
            Instant dal = inst(r.get("dal"));
            if (r.get("stato") == null || dal == null) continue;
            LocalDate g = dal.atZone(ITALY).toLocalDate();
            Instant chiusura = g.atTime(CHIUSURA).atZone(ITALY).toInstant();
            if (g.isBefore(oggi) || (now.isAfter(chiusura) && dal.isBefore(chiusura))) {
                spegni(r, dal.isAfter(chiusura) ? dal : chiusura, "sistema", "Fine giornata: chiuso in automatico alle " + CHIUSURA);
                cambiato = true;
            } else if (!online(str(r.get("nome")), now)) {
                // REGOLA: senza un accesso al CRM in corso il consulente risulta "non in salone" (bollino vuoto),
                // anche se lo stato era stato messo a mano da un Front Office / Admin
                // orario di uscita: l'ultimo segnale ricevuto (o la ripartenza del server dopo un deploy)
                Long ult = ULTIMO.get(str(r.get("nome")));
                Instant fine = Instant.ofEpochMilli(ult != null ? ult : AVVIO_MS);
                if (fine.isBefore(dal)) fine = dal;
                if (fine.isAfter(now)) fine = now;
                String motivo = ult != null ? "Uscito dal CRM (finestra chiusa o disconnesso)"
                    : dal.toEpochMilli() < AVVIO_MS ? "Uscito dal CRM (riavvio del CRM / nuovo deploy)"
                    : "Non connesso al CRM";
                spegni(r, fine, "sistema", motivo);
                cambiato = true;
            }
        }
        if (cambiato) salvaStati(m, "sistema");
        return m;
    }
    /** il consulente esce: chiude lo stato, chiude il walk-in eventualmente ancora aperto */
    private void spegni(Map<String, Object> r, Instant fine, String chi, String motivo) throws Exception {
        registraCambio(r, null, fine, chi, motivo);
        if (r.get("walkinAperto") != null) chiudiWalkin(String.valueOf(r.get("walkinAperto")), fine, chi, motivo);
        r.put("stato", null); r.put("dal", null); r.put("dalIt", null); r.put("cliente", null); r.put("walkinId", null);
        r.put("walkinAperto", null); r.put("motivo", motivo); r.put("chi", chi); r.put("presenza", null);
        r.put("uscitoAt", fine.toString()); r.put("uscitoIt", oraIt(fine));
    }

    /* ---------- PRESENZA: disponibile in automatico finche' il CRM resta aperto ----------
     * Ogni finestra del CRM aperta da un consulente manda un segnale ogni 25 secondi (/stati/presenza).
     * Le finestre vivono solo in memoria: dopo un nuovo deploy la lista e' vuota, quindi chi non si
     * ricollega entro PRESENZA_TIMEOUT risulta uscito. */
    private static final long PRESENZA_TIMEOUT_MS = 150_000;   // 2 min e 30: tiene conto delle schede in secondo piano
    private static final long USCITA_RITARDO_MS = 20_000;      // chiusura/ricarica della finestra: 20 s per capire se e' solo un F5
    private static final long AVVIO_MS = System.currentTimeMillis();
    private static final LocalTime APERTURA = LocalTime.of(8, 0);
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
                LocalTime t = LocalTime.now(ITALY);
                boolean orario = !t.isBefore(APERTURA) && t.isBefore(CHIUSURA);
                boolean salva = false;
                if (r.get("stato") == null && orario) {
                    cambiaStato(m, nome, "DISPONIBILE", c.nome(), "Accesso al CRM: disponibile in automatico", null, null, Instant.now());
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
        } else if (!"OCCUPATO".equals(nuovo)) {
            r.put("cliente", null); r.put("walkinId", null);  // il walk-in resta aperto finche' non torna disponibile
        }
        r.put("stato", nuovo); r.put("dal", now.toString()); r.put("dalIt", oraIt(now));
        r.put("chi", chi); r.put("motivo", motivo);
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
            out.put("cambiaTutti", gestisce(c));
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
        if (!nome.equals(mio) && !gestisce(c)) return ResponseEntity.status(403).body(Map.of("error", "Puoi cambiare solo il tuo stato"));
        if (nome.equals(mio)) {           // e' lui: e' connesso adesso
            FINESTRE.computeIfAbsent(nome, k -> new java.util.concurrent.ConcurrentHashMap<>()).put("stato", System.currentTimeMillis());
            ULTIMO.put(nome, System.currentTimeMillis());
        } else if (!presente(nome, Instant.now()))
            return ResponseEntity.status(409).body(Map.of("error", nome + " non ha il CRM aperto: risulta fuori dal salone finche' non accede."));
        synchronized (LOCK) {
            try {
                Map<String, Map<String, Object>> m = statiOggi();
                cambiaStato(m, nome, stato, c.nome(), nome.equals(mio) ? "Cambiato dal consulente" : "Cambiato da " + c.nome(), null, null, Instant.now());
                salvaStati(m, c.nome());
                return ResponseEntity.ok(Map.of("stati", new ArrayList<>(m.values()), "ora", Instant.now().toString(), "online", connessi()));
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
            Optional<ConsegneDataset> ds = repository.findById("SALONE_" + g);
            if (ds.isPresent() && ds.get().getRighe() != null && ds.get().getRighe() > 0) ingressi.addAll(leggi("SALONE_" + g));
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
        for (Map<String, Object> r : leggi("SALONE_APP")) {
            if (!vedeTutti(c) && !mio(c, r.get("consulente"))) continue;
            if (g.equals(r.get("appData"))) l.add(r);
            if (r.get("consulente") == null && str(r.get("appData")).compareTo(oggi()) >= 0) daAssegnare++;
        }
        l.sort(Comparator.comparing(r -> str(r.get("appOra"))));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", g); out.put("oggi", oggi());
        out.put("appuntamenti", l);
        out.put("daAssegnareProssimi", daAssegnare);
        out.put("vedeTutti", vedeTutti(c)); out.put("puoImportare", gestisce(c)); out.put("vedeReport", report(c));
        List<Map<String, Object>> st = leggi("SALONE_APP_STORICO");
        if (!st.isEmpty()) {
            Map<String, Object> u = st.get(st.size() - 1);
            out.put("ultimoImport", Map.of("atIt", str(u.get("atIt")), "chi", str(u.get("chi")), "file", str(u.get("file"))));
        }
        return ResponseEntity.ok(out);
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
            int nuovi = 0, aggiornati = 0, invariati = 0, senzaData = 0, autoAssegnati = 0, daAssegnare = 0;
            List<Map<String, Object>> esclusi = new ArrayList<>(), nuoviElenco = new ArrayList<>(), cambi = new ArrayList<>();
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
                Object[] app = dataAppuntamento(row);
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("id", id);
                r.putAll(row);
                r.put("appData", app == null ? null : app[0].toString());
                r.put("appOra", app == null || app[1] == null ? null : app[1].toString());
                r.put("fonteData", app == null ? null : app[2]);
                r.put("consulente", consulenteDi(str(row.get("venditore"))));
                if (app == null) senzaData++;
                if (r.get("consulente") == null) daAssegnare++;
                Map<String, Object> prima = perId.get(id);
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
                r.put("primoImportIt", prima.get("primoImportIt"));
                r.put("ultimoImport", impId); r.put("ultimoImportIt", oraIt(now));
                r.put("aggiornatoIt", cambiato ? oraIt(now) : prima.get("aggiornatoIt"));
                perId.put(id, r);
                if (cambiato) aggiornati++; else invariati++;
            }
            int considerati = nuovi + aggiornati + invariati;
            // appuntamenti piu' vecchi di 13 mesi: non servono piu' (tiene leggero l'archivio)
            String limite = LocalDate.now(ITALY).minusMonths(13).toString();
            List<Map<String, Object>> salva = new ArrayList<>();
            for (Map<String, Object> r : perId.values()) if (r.get("appData") == null || str(r.get("appData")).compareTo(limite) >= 0) salva.add(r);
            Map<String, Object> imp = new LinkedHashMap<>();
            imp.put("id", impId); imp.put("at", now.toString()); imp.put("atIt", oraIt(now)); imp.put("chi", c.nome());
            imp.put("file", str(b.get("file")));
            imp.put("righeFile", righe.size()); imp.put("considerati", considerati);
            imp.put("nuovi", nuovi); imp.put("aggiornati", aggiornati); imp.put("invariati", invariati);
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
        return repository.findById("SALONE_CHAT_LETTI").map(d -> {
            try { return objectMapper.readValue(d.getContenuto(), new TypeReference<Map<String, Map<String, Object>>>() {}); }
            catch (Exception e) { return new HashMap<String, Map<String, Object>>(); }
        }).orElseGet(HashMap::new);
    }
    /** elenco delle chat private create (SALONE_CHAT_INDICE) */
    private List<String> indice() {
        return repository.findById("SALONE_CHAT_INDICE").map(d -> {
            try { return objectMapper.readValue(d.getContenuto(), new TypeReference<List<String>>() {}); }
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
        return ResponseEntity.ok(Map.of("conv", conv, "ora", max));
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
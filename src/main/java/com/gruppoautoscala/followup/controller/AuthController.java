package com.gruppoautoscala.followup.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruppoautoscala.followup.model.ConsegneDataset;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.model.UserPermission;
import com.gruppoautoscala.followup.repository.ConsegneDatasetRepository;
import com.gruppoautoscala.followup.repository.UserPermissionRepository;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.AuthService;
import jakarta.annotation.PostConstruct;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collection;
import java.util.LinkedHashMap;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository userRepository;

    // NUOVO: per togliere i permessi personali quando un utente viene eliminato
    @Autowired
    private UserPermissionRepository userPermissionRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    // NUOVO: utenti NASCOSTI nella lista Utenti. Salvati nell'archivio delle impostazioni
    // (consegne_dataset, chiave UTENTI_NASCOSTI) come { "<id utente>": { "ruoli": [...], "utenti": [id, ...] } }:
    // chi ha uno di quei ruoli, o e' uno di quegli utenti, non vede l'utente nella lista e non puo' modificarlo.
    // Solo l'ADMIN decide; l'ADMIN vede sempre tutti; ognuno vede sempre se stesso.
    private static final String CHIAVE_NASCOSTI = "UTENTI_NASCOSTI";
    @Autowired private ConsegneDatasetRepository datasetRepository;
    @Autowired private ObjectMapper objectMapper;

    private Map<Long, Map<String, Object>> nascosti() {
        Map<Long, Map<String, Object>> out = new HashMap<>();
        try {
            Optional<ConsegneDataset> d = datasetRepository.findById(CHIAVE_NASCOSTI);
            if (d.isEmpty() || d.get().getContenuto() == null || d.get().getContenuto().isBlank()) return out;
            Map<String, Map<String, Object>> m = objectMapper.readValue(d.get().getContenuto(), new TypeReference<Map<String, Map<String, Object>>>() {});
            m.forEach((k, v) -> { try { out.put(Long.valueOf(k), v); } catch (NumberFormatException ignored) { } });
        } catch (Exception ignored) { }
        return out;
    }

    private static List<String> lista(Object o) {
        List<String> l = new ArrayList<>();
        if (o instanceof Collection<?> c) for (Object x : c) if (x != null) l.add(String.valueOf(x));
        return l;
    }

    /** true se l'utente {@code targetId} e' nascosto a chi guarda (ruolo + id di chi guarda) */
    private static boolean nascostoA(Map<Long, Map<String, Object>> n, Long targetId, Long viewerId, String viewerRole) {
        if ("ADMIN".equals(viewerRole) || targetId == null || targetId.equals(viewerId)) return false;
        Map<String, Object> v = n.get(targetId);
        if (v == null) return false;
        return lista(v.get("ruoli")).contains(viewerRole) || (viewerId != null && lista(v.get("utenti")).contains(String.valueOf(viewerId)));
    }

    @PersistenceContext
    private EntityManager em;

    // FIX: FRONT_OFFICE e CONSULENZA erano nel menu a tendina ma mancavano qui
    // (cambio ruolo -> "Ruolo non valido")
    private static final List<String> VALID_ROLES = List.of("UTENTE", "MODERATORE", "GESTORE", "ADMIN", "NOLEGGIO",
            "BACK_OFFICE", "SERVICE", "FRONT_OFFICE", "CONSULENZA");

    /* ===== NUOVO: ACCOUNT DISATTIVATI =====
       Un account disattivato non puo' piu' accedere, ma resta nel database con tutti i suoi dati
       (follow-up, contatti, statistiche...). Nessuna colonna nuova: il ruolo diventa "X:" + ruolo di prima
       (es. "X:CONSULENZA"), cosi' alla riattivazione torna esattamente com'era. Un ruolo "X:..." non
       corrisponde a nessun ruolo vero, quindi non apre nessuna sezione. */
    static final String DISATTIVATO = "X:";
    static boolean disattivato(User u) { return u != null && u.getRole() != null && u.getRole().startsWith(DISATTIVATO); }
    static String ruoloPrima(User u) { return disattivato(u) ? u.getRole().substring(DISATTIVATO.length()) : u.getRole(); }

    /** id degli utenti eliminati o disattivati: chi era gia' dentro viene fatto uscire alla prossima richiesta */
    static final Set<Long> BLOCCATI = ConcurrentHashMap.newKeySet();

    @PostConstruct
    void caricaBloccati() {
        try { userRepository.findAll().stream().filter(AuthController::disattivato).forEach(u -> BLOCCATI.add(u.getId())); }
        catch (Exception e) { /* al primo avvio la tabella potrebbe non esserci ancora */ }
    }

    /* ===== NUOVO: ACCESSO CHE SOPRAVVIVE AL DEPLOY =====
       Le sessioni stanno nella memoria del server: a ogni deploy il server riparte e si perdono, quindi
       dopo la ricarica automatica si finiva sulla schermata di accesso. Ora al login il browser riceve
       anche un "gettone" firmato (cookie crm_ricordo, non leggibile dagli script della pagina). Se il
       server non trova la sessione ma il gettone e' valido, la ricrea da solo: l'utente resta dentro e,
       grazie all'indirizzo (#rent, #salone...), torna sulla stessa schermata.
       - vale finche' il browser resta aperto e scade dopo 12 ore senza usare il CRM
       - "Esci" lo cancella; cambiare la password, disattivare o eliminare l'account lo rende inutile
       - la firma usa una chiave segreta: CRM_AUTH_SECRET se impostata su Railway, altrimenti una chiave
         ricavata dalle credenziali del database (stabile tra un deploy e l'altro) */
    static final String COOKIE = "crm_ricordo";
    static final long DURATA_MS = 12L * 3600_000;     // 12 ore senza usare il CRM
    static final long RINNOVO_MS = 10L * 60_000;      // il gettone si rinnova ogni 10 minuti di uso
    private static volatile byte[] CHIAVE;

    @Value("${CRM_AUTH_SECRET:}") private String segretoEnv;
    @Value("${spring.datasource.password:}") private String dbPass;
    @Value("${spring.datasource.url:}") private String dbUrl;

    @PostConstruct
    void preparaChiave() {
        try {
            String base = segretoEnv != null && !segretoEnv.isBlank() ? segretoEnv
                    : (dbPass != null && !dbPass.isBlank()) ? "crm-autoscala|" + dbUrl + "|" + dbPass : null;
            if (base == null) { byte[] r = new byte[32]; new SecureRandom().nextBytes(r); CHIAVE = r; return; }
            CHIAVE = MessageDigest.getInstance("SHA-256").digest(base.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) { byte[] r = new byte[32]; new SecureRandom().nextBytes(r); CHIAVE = r; }
    }

    private static String firma(Long id, long ts, String hash) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(CHIAVE, "HmacSHA256"));
            byte[] f = mac.doFinal((id + "|" + ts + "|" + (hash == null ? "" : hash)).getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(f);
        } catch (Exception e) { throw new IllegalStateException(e); }
    }
    static String gettone(User u) { long ts = System.currentTimeMillis(); return u.getId() + "." + ts + "." + firma(u.getId(), ts, u.getPasswordHash()); }
    /** {id, ts} se il gettone e' ben formato e non scaduto (la firma si controlla con l'utente in mano) */
    static long[] leggiGettone(String g) {
        if (g == null || CHIAVE == null) return null;
        String[] p = g.split("\\.");
        if (p.length != 3) return null;
        try {
            long id = Long.parseLong(p[0]), ts = Long.parseLong(p[1]);
            long eta = System.currentTimeMillis() - ts;
            return eta < -60_000 || eta > DURATA_MS ? null : new long[]{id, ts};
        } catch (NumberFormatException e) { return null; }
    }
    static boolean firmaOk(String g, User u) {
        String[] p = g.split("\\.");
        return MessageDigest.isEqual(p[2].getBytes(StandardCharsets.UTF_8), firma(u.getId(), Long.parseLong(p[1]), u.getPasswordHash()).getBytes(StandardCharsets.UTF_8));
    }
    static String cookieDi(HttpServletRequest r) {
        Cookie[] cs = r.getCookies();
        if (cs != null) for (Cookie c : cs) if (COOKIE.equals(c.getName())) return c.getValue();
        return null;
    }
    static void scriviCookie(HttpServletRequest r, HttpServletResponse w, String valore) {
        boolean https = r.isSecure() || "https".equalsIgnoreCase(r.getHeader("X-Forwarded-Proto"));
        // senza Max-Age: il cookie sparisce quando si chiude il browser
        w.addHeader("Set-Cookie", COOKIE + "=" + (valore == null ? "" : valore) + "; Path=/; HttpOnly; SameSite=Lax"
                + (https ? "; Secure" : "") + (valore == null ? "; Max-Age=0" : ""));
    }
    static void apriSessione(HttpSession session, User user) {
        session.setAttribute("userId", user.getId());
        session.setAttribute("userEmail", user.getEmail());
        session.setAttribute("userRole", user.getRole());
        session.setAttribute("userFullName", user.getFullName());
    }

    /** Su ogni richiesta: fa uscire chi e' stato eliminato/disattivato e ricrea la sessione persa con un deploy. */
    @Component
    public static class SessioneFilter implements Filter {
        @Autowired private UserRepository users;

        @Override
        public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain) throws IOException, ServletException {
            if (!(req instanceof HttpServletRequest r) || !(res instanceof HttpServletResponse w)) { chain.doFilter(req, res); return; }
            String uri = r.getRequestURI();
            HttpSession s = r.getSession(false);
            Object id = s == null ? null : s.getAttribute("userId");
            try {
                if (id instanceof Long l && BLOCCATI.contains(l)) {
                    try { s.invalidate(); } catch (IllegalStateException e) { /* gia' chiusa */ }
                    scriviCookie(r, w, null);
                    if (uri.startsWith("/api/")) {
                        w.setStatus(401);
                        w.setContentType("application/json;charset=UTF-8");
                        w.getWriter().write("{\"error\":\"Account disattivato o eliminato\"}");
                        return;
                    }
                } else if (!uri.startsWith("/api/auth/logout") && !uri.startsWith("/api/auth/login")) {
                    String g = cookieDi(r);
                    long[] t = leggiGettone(g);
                    if (id == null && t != null && !BLOCCATI.contains(t[0])) {
                        // sessione persa (deploy / riavvio) ma gettone valido: si rientra da soli
                        User u = users.findById(t[0]).orElse(null);
                        if (u != null && !disattivato(u) && firmaOk(g, u)) {
                            apriSessione(r.getSession(true), u);
                            scriviCookie(r, w, gettone(u));
                        } else scriviCookie(r, w, null);
                    } else if (id instanceof Long l && (t == null || t[0] != l || System.currentTimeMillis() - t[1] > RINNOVO_MS)) {
                        // dentro: il gettone si rinnova (o si crea per chi era entrato prima di questa versione)
                        User u = users.findById(l).orElse(null);
                        if (u != null && !disattivato(u)) scriviCookie(r, w, gettone(u));
                    } else if (id == null && g != null && t == null) scriviCookie(r, w, null);   // scaduto: si toglie
                }
            } catch (RuntimeException e) { /* in caso di problemi si prosegue come prima: al massimo serve rifare l'accesso */ }
            chain.doFilter(req, res);
        }
    }

    // FIX SICUREZZA: prima chiunque, anche senza aver fatto l'accesso, poteva creare un utente
    // (anche Admin) chiamando questo indirizzo. Ora serve essere Admin o Gestore.
    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> body, HttpSession session) {
        String sessionRole = (String) session.getAttribute("userRole");
        if (sessionRole == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!"ADMIN".equals(sessionRole) && !"GESTORE".equals(sessionRole))
            return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        String role = body.getOrDefault("role", "UTENTE");
        if (role == null || role.isBlank()) role = "UTENTE";
        if (!VALID_ROLES.contains(role))
            return ResponseEntity.badRequest().body(Map.of("error", "Ruolo non valido"));
        if ("GESTORE".equals(sessionRole) && "ADMIN".equals(role))
            return ResponseEntity.status(403).body(Map.of("error", "Non puoi assegnare il ruolo Admin"));

        // la stessa email appartiene a un account disattivato: va riattivato, non ricreato
        String email = body.get("email");
        if (email != null) {
            Optional<User> gia = authService.findByEmail(email.trim());
            if (gia.isPresent() && disattivato(gia.get()))
                return ResponseEntity.badRequest().body(Map.of("error",
                        "Questa email appartiene a un account disattivato (" + gia.get().getFullName()
                        + "). Riattivalo da Gestione utenti, sezione \"Account disattivati\": ritrova tutti i suoi dati."));
        }
        try {
            User user = authService.register(
                body.get("fullName"),
                body.get("email"),
                body.get("password")
            );
            user.setRole(role);
            userRepository.save(user);
            Map<String, Object> response = new HashMap<>();
            response.put("id", user.getId());
            response.put("fullName", user.getFullName());
            response.put("email", user.getEmail());
            response.put("role", user.getRole());
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body, HttpSession session,
                                   HttpServletRequest request, HttpServletResponse httpResponse) {
        Optional<User> userOpt = authService.findByEmail(body.get("email"));
        if (userOpt.isEmpty() || !authService.checkPassword(userOpt.get(), body.get("password"))) {
            return ResponseEntity.status(401).body(Map.of("error", "Credenziali non valide"));
        }
        User user = userOpt.get();
        // NUOVO: account disattivato -> niente accesso
        if (disattivato(user))
            return ResponseEntity.status(403).body(Map.of("error", "Account disattivato: chiedi all'amministratore"));
        apriSessione(session, user);
        scriviCookie(request, httpResponse, gettone(user));   // NUOVO: resta dentro anche dopo un deploy
        Map<String, Object> response = new HashMap<>();
        response.put("id", user.getId());
        response.put("fullName", user.getFullName());
        response.put("email", user.getEmail());
        response.put("role", user.getRole());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpSession session, HttpServletRequest request, HttpServletResponse httpResponse) {
        session.invalidate();
        scriviCookie(request, httpResponse, null);   // NUOVO: "Esci" cancella anche il gettone
        return ResponseEntity.ok(Map.of("message", "Logout effettuato"));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Map<String, Object> response = new HashMap<>();
        response.put("id", userId);
        response.put("email", session.getAttribute("userEmail"));
        response.put("role", session.getAttribute("userRole"));
        response.put("fullName", session.getAttribute("userFullName"));
        return ResponseEntity.ok(response);
    }

    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(@RequestBody Map<String, String> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        String currentPassword = body.get("currentPassword");
        String newPassword = body.get("newPassword");
        String confirmPassword = body.get("confirmPassword");

        if (currentPassword == null || newPassword == null || confirmPassword == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Tutti i campi sono obbligatori"));
        }
        if (!newPassword.equals(confirmPassword)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Le password non coincidono"));
        }

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));

        try {
            authService.changePassword(userOpt.get(), currentPassword, newPassword);
            return ResponseEntity.ok(Map.of("message", "Password aggiornata con successo"));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/users")
    public ResponseEntity<?> getUsers(HttpSession session) {
        String role = (String) session.getAttribute("userRole");
        if (role == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!"ADMIN".equals(role) && !"GESTORE".equals(role))
            return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        Long viewerId = (Long) session.getAttribute("userId");
        Map<Long, Map<String, Object>> nasc = nascosti();
        List<User> tutti = userRepository.findAll();
        Map<String, String> nomi = new HashMap<>();
        tutti.forEach(x -> nomi.put(String.valueOf(x.getId()), x.getFullName()));
        List<Map<String, Object>> users = tutti.stream().filter(u -> !nascostoA(nasc, u.getId(), viewerId, role)).map(u -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", u.getId());
            m.put("fullName", u.getFullName());
            m.put("email", u.getEmail());
            // NUOVO: solo l'ADMIN vede a chi e' nascosto l'utente
            if ("ADMIN".equals(role) && nasc.containsKey(u.getId())) {
                Map<String, Object> v = nasc.get(u.getId()), na = new LinkedHashMap<>();
                na.put("ruoli", lista(v.get("ruoli")));
                List<Map<String, Object>> ut = new ArrayList<>();
                for (String uid : lista(v.get("utenti"))) if (nomi.containsKey(uid)) { Map<String, Object> x = new HashMap<>(); x.put("id", Long.valueOf(uid)); x.put("fullName", nomi.get(uid)); ut.add(x); }
                na.put("utenti", ut);
                m.put("nascostoA", na);
            }
            // NUOVO: per i disattivati si mostra il ruolo che avevano
            m.put("role", ruoloPrima(u));
            m.put("disattivato", disattivato(u));
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(users);
    }

    // Elenco "leggero" (solo id + nome) accessibile a QUALSIASI utente
    // autenticato, non solo ADMIN/GESTORE. Usato per popolare selettori tipo
    // "a chi va segnalato l'allert" nel form di creazione contatto, dove
    // serve poter scegliere uno o più destinatari specifici anche per un
    // utente con ruolo UTENTE. Non espone email né ruolo (a differenza di
    // /users sopra, che resta riservato ad ADMIN/GESTORE per la gestione
    // account).
    // NUOVO: gli account disattivati non compaiono (non si possono scegliere come destinatari).
    @GetMapping("/users/basic")
    public ResponseEntity<?> getUsersBasic(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        List<Map<String, Object>> users = userRepository.findAll().stream().filter(u -> !disattivato(u)).map(u -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", u.getId());
            m.put("fullName", u.getFullName());
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(users);
    }

    @PatchMapping("/users/{id}/role")
    public ResponseEntity<?> changeRole(@PathVariable Long id,
                                        @RequestBody Map<String, String> body,
                                        HttpSession session) {
        String sessionRole = (String) session.getAttribute("userRole");
        Long sessionUserId = (Long) session.getAttribute("userId");
        if (sessionRole == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!"ADMIN".equals(sessionRole) && !"GESTORE".equals(sessionRole))
            return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        if (nascostoA(nascosti(), id, (Long) session.getAttribute("userId"), sessionRole)) return ResponseEntity.notFound().build();   // NUOVO: utente nascosto a chi chiede
        Optional<User> userOpt = userRepository.findById(id);
        if (userOpt.isEmpty()) return ResponseEntity.notFound().build();

        User target = userOpt.get();

        // Gestore non può modificare Admin
        if ("GESTORE".equals(sessionRole) && "ADMIN".equals(ruoloPrima(target)))
            return ResponseEntity.status(403).body(Map.of("error", "Non puoi modificare un Admin"));

        // Nessuno può modificare se stesso
        if (sessionUserId.equals(id))
            return ResponseEntity.badRequest().body(Map.of("error", "Non puoi modificare il tuo ruolo"));

        if (disattivato(target))
            return ResponseEntity.badRequest().body(Map.of("error", "L'account è disattivato: riattivalo prima di cambiare il ruolo"));

        String newRole = body.get("role");
        if (!VALID_ROLES.contains(newRole))
            return ResponseEntity.badRequest().body(Map.of("error", "Ruolo non valido"));

        // Gestore non può assegnare ADMIN
        if ("GESTORE".equals(sessionRole) && "ADMIN".equals(newRole))
            return ResponseEntity.status(403).body(Map.of("error", "Non puoi assegnare il ruolo Admin"));

        target.setRole(newRole);
        userRepository.save(target);
        return ResponseEntity.ok(Map.of("message", "Ruolo aggiornato", "role", newRole));
    }

    @PatchMapping("/users/{id}/name")
    public ResponseEntity<?> changeName(@PathVariable Long id,
                                        @RequestBody Map<String, String> body,
                                        HttpSession session) {
        String sessionRole = (String) session.getAttribute("userRole");
        if (sessionRole == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!"ADMIN".equals(sessionRole) && !"GESTORE".equals(sessionRole))
            return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        if (nascostoA(nascosti(), id, (Long) session.getAttribute("userId"), sessionRole)) return ResponseEntity.notFound().build();   // NUOVO: utente nascosto a chi chiede
        Optional<User> userOpt = userRepository.findById(id);
        if (userOpt.isEmpty()) return ResponseEntity.notFound().build();
        User target = userOpt.get();

        // Gestore non può modificare Admin (stessa regola di changeRole).
        if ("GESTORE".equals(sessionRole) && "ADMIN".equals(ruoloPrima(target)))
            return ResponseEntity.status(403).body(Map.of("error", "Non puoi modificare un Admin"));

        String newName = body.get("fullName");
        if (newName == null || newName.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "Nome obbligatorio"));

        target.setFullName(newName.trim());
        userRepository.save(target);
        return ResponseEntity.ok(Map.of("message", "Nome aggiornato", "fullName", target.getFullName()));
    }

    /** NUOVO: disattiva { "attivo": false } / riattiva { "attivo": true } un account */
    @PatchMapping("/users/{id}/attivo")
    public ResponseEntity<?> setAttivo(@PathVariable Long id, @RequestBody Map<String, Object> body, HttpSession session) {
        String role = (String) session.getAttribute("userRole");
        Long sessionUserId = (Long) session.getAttribute("userId");
        if (role == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!"ADMIN".equals(role) && !"GESTORE".equals(role))
            return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        if (sessionUserId.equals(id))
            return ResponseEntity.badRequest().body(Map.of("error", "Non puoi disattivare te stesso"));
        if (nascostoA(nascosti(), id, (Long) session.getAttribute("userId"), role)) return ResponseEntity.notFound().build();   // NUOVO: utente nascosto a chi chiede
        Optional<User> userOpt = userRepository.findById(id);
        if (userOpt.isEmpty()) return ResponseEntity.notFound().build();
        User u = userOpt.get();
        if ("GESTORE".equals(role) && "ADMIN".equals(ruoloPrima(u)))
            return ResponseEntity.status(403).body(Map.of("error", "Non puoi modificare un Admin"));

        boolean attivo = Boolean.TRUE.equals(body.get("attivo"));
        if (attivo) {
            if (disattivato(u)) {
                String prima = ruoloPrima(u);
                u.setRole(VALID_ROLES.contains(prima) ? prima : "UTENTE");
                userRepository.save(u);
            }
            BLOCCATI.remove(id);
            return ResponseEntity.ok(Map.of("message", "Account riattivato", "role", u.getRole()));
        }
        if (!disattivato(u)) {
            u.setRole(DISATTIVATO + u.getRole());
            userRepository.save(u);
        }
        BLOCCATI.add(id);   // se ha il CRM aperto, esce alla prossima azione
        return ResponseEntity.ok(Map.of("message", "Account disattivato"));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<?> deleteUser(@PathVariable Long id, HttpSession session) {
        String role = (String) session.getAttribute("userRole");
        Long sessionUserId = (Long) session.getAttribute("userId");
        if (role == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!"ADMIN".equals(role) && !"GESTORE".equals(role))
            return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        if (sessionUserId.equals(id))
            return ResponseEntity.badRequest().body(Map.of("error", "Non puoi eliminare te stesso"));

        if (nascostoA(nascosti(), id, (Long) session.getAttribute("userId"), role)) return ResponseEntity.notFound().build();   // NUOVO: utente nascosto a chi chiede
        Optional<User> userOpt = userRepository.findById(id);
        if (userOpt.isEmpty()) return ResponseEntity.notFound().build();

        // Gestore non può eliminare Admin
        if ("GESTORE".equals(role) && "ADMIN".equals(ruoloPrima(userOpt.get())))
            return ResponseEntity.status(403).body(Map.of("error", "Non puoi eliminare un Admin"));

        // FIX: prima, se l'utente aveva dati collegati (es. follow-up), il database rifiutava e l'errore
        // non veniva mostrato. Ora: tutto in un'unica operazione (permessi personali + utente); se il
        // database rifiuta, si annulla tutto e si risponde 409 spiegando cosa lo blocca.
        try {
            new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
                List<UserPermission> perm = userPermissionRepository.findByUserId(id);
                for (UserPermission up : perm) userPermissionRepository.delete(up);
                userRepository.deleteById(id);
                em.flush();
            });
        } catch (Exception e) {
            if (userRepository.findById(id).isPresent())
                return ResponseEntity.status(409).body(Map.of(
                        "error", "Non si può eliminare: ha " + datiCollegati(e) + " collegati nel CRM.",
                        "collegati", true));
            throw e;
        }
        BLOCCATI.add(id);   // se aveva il CRM aperto, esce alla prossima azione
        try { Map<Long, Map<String, Object>> n = nascosti(); if (n.remove(id) != null) salvaNascosti(n, session); } catch (Exception ignored) { }
        return ResponseEntity.ok(Map.of("message", "Utente eliminato"));
    }


    private void salvaNascosti(Map<Long, Map<String, Object>> n, HttpSession session) throws Exception {
        Map<String, Object> out = new LinkedHashMap<>();
        n.forEach((k, v) -> out.put(String.valueOf(k), v));
        ConsegneDataset d = datasetRepository.findById(CHIAVE_NASCOSTI).orElseGet(() -> { ConsegneDataset x = new ConsegneDataset(); x.setTipo(CHIAVE_NASCOSTI); return x; });
        d.setContenuto(objectMapper.writeValueAsString(out));
        d.setRighe(out.size());
        d.setAggiornatoAt(java.time.LocalDateTime.now(java.time.ZoneId.of("Europe/Rome")));
        Long uid = (Long) session.getAttribute("userId");
        d.setAggiornatoDa(uid == null ? null : userRepository.findById(uid).map(User::getFullName).orElse(null));
        datasetRepository.save(d);
    }

    /** NUOVO: a chi e' nascosto un utente. Body { "ruoli": ["GESTORE", ...], "utenti": [id, ...] }; liste vuote = visibile a tutti. Solo ADMIN. */
    @PutMapping("/users/{id}/visibilita")
    public ResponseEntity<?> setVisibilita(@PathVariable Long id, @RequestBody Map<String, Object> body, HttpSession session) {
        String role = (String) session.getAttribute("userRole");
        if (role == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!"ADMIN".equals(role)) return ResponseEntity.status(403).body(Map.of("error", "Solo l'Admin puo' nascondere gli utenti"));
        Optional<User> target = userRepository.findById(id);
        if (target.isEmpty()) return ResponseEntity.notFound().build();
        if ("ADMIN".equals(ruoloPrima(target.get())))
            return ResponseEntity.badRequest().body(Map.of("error", "Un Admin non si puo' nascondere"));
        List<String> ruoli = lista(body.get("ruoli")).stream().filter(r -> VALID_ROLES.contains(r) && !"ADMIN".equals(r)).distinct().collect(Collectors.toList());
        List<Long> utenti = new ArrayList<>();
        for (String x : lista(body.get("utenti"))) {
            try {
                Long uid = Long.valueOf(x);
                if (uid.equals(id) || utenti.contains(uid)) continue;
                Optional<User> u = userRepository.findById(uid);
                if (u.isPresent() && !"ADMIN".equals(ruoloPrima(u.get()))) utenti.add(uid);
            } catch (NumberFormatException ignored) { }
        }
        try {
            Map<Long, Map<String, Object>> n = nascosti();
            if (ruoli.isEmpty() && utenti.isEmpty()) n.remove(id);
            else { Map<String, Object> v = new LinkedHashMap<>(); v.put("ruoli", ruoli); v.put("utenti", utenti); n.put(id, v); }
            salvaNascosti(n, session);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Non salvato: " + e.getMessage()));
        }
        return ResponseEntity.ok(Map.of("ruoli", ruoli, "utenti", utenti));
    }

    /** dal messaggio del database ("... on table \"follow_ups\"") ricava cosa blocca l'eliminazione */
    private static String datiCollegati(Throwable e) {
        String testo = "";
        for (Throwable t = e; t != null; t = t.getCause()) testo += " " + t.getMessage();
        Matcher m = Pattern.compile("on table \"?([a-zA-Z0-9_]+)\"?").matcher(testo);
        String tab = null;
        while (m.find()) if (!"users".equals(m.group(1))) tab = m.group(1);
        if (tab == null) return "dati";
        return switch (tab) {
            case "follow_ups", "follow_up" -> "follow-up";
            case "follow_up_steps", "follow_up_step" -> "passaggi di follow-up";
            case "customers", "customer" -> "clienti";
            default -> "dati (" + tab.replace('_', ' ') + ")";
        };
    }

    // FIX SICUREZZA: prima chiunque poteva crearsi un Admin chiamando questo indirizzo.
    // Ora funziona solo quando nel CRM non c'è ancora nessun utente (primissima installazione).
    @PostMapping("/setup")
    public ResponseEntity<?> setup(@RequestBody Map<String, String> body) {
        if (!userRepository.findAll().isEmpty())
            return ResponseEntity.status(403).body(Map.of("error", "Setup già eseguito"));
        try {
            User user = authService.register(
                body.get("fullName"),
                body.get("email"),
                body.get("password")
            );
            user.setRole("ADMIN");
            userRepository.save(user);
            return ResponseEntity.ok(Map.of("message", "Admin creato!", "id", user.getId()));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
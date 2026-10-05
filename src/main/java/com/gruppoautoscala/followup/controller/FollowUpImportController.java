package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.Customer;
import com.gruppoautoscala.followup.model.FollowUp;
import com.gruppoautoscala.followup.model.FollowUpStep;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.CustomerRepository;
import com.gruppoautoscala.followup.repository.FollowUpRepository;
import com.gruppoautoscala.followup.repository.FollowUpStepRepository;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.FollowUpService;
import com.gruppoautoscala.followup.service.RecallFollowUpService;
import com.gruppoautoscala.followup.service.RolePermissionService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.*;

/**
 * IMPORT DEI FOLLOW-UP dal CSV delle trattative (Leadspark).
 *
 * Il file viene letto e interpretato NEL BROWSER (followup.js): consulente,
 * cliente, telefono, mail, marca, modello e gli esiti degli step ricavati
 * dalle "Note Cliente" (nr, wh, mail, testo = risponde...). Qui arrivano
 * gia' le righe pronte:
 *
 *  POST /api/followups/import/check  -> per ogni riga, i follow-up GIA'
 *       presenti nella STESSA data con lo stesso cliente (telefono o nome),
 *       per far scegliere a schermo: salta / aggiorna / crea comunque.
 *  POST /api/followups/import         -> crea / aggiorna i follow-up.
 *
 * Il follow-up importato ha come creatore chi fa l'import e il flag
 * "imported" (in pagina: "Creato da Import da ..."); gli step scritti
 * dall'import hanno data = quella della nota (05/10) e ora = ora dell'import.
 */
@RestController
@RequestMapping("/api/followups/import")
public class FollowUpImportController {

    private static final ZoneId ITALY = ZoneId.of("Europe/Rome");

    @Autowired private FollowUpService followUpService;
    @Autowired private FollowUpRepository followUpRepository;
    @Autowired private FollowUpStepRepository followUpStepRepository;
    @Autowired private CustomerRepository customerRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private RecallFollowUpService recallFollowUpService;
    @Autowired private RolePermissionService rolePermissionService;

    private ResponseEntity<?> check(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        String acc = rolePermissionService.getEffectiveAccess(userId, role, "FOLLOWUPS");
        if (!rolePermissionService.hasAtLeast(acc, "FULL"))
            return ResponseEntity.status(403).body(Map.of("error", "Non hai il permesso per importare i follow-up"));
        return null;
    }

    // solo cifre, senza prefisso internazionale: "+39 333 1234567" -> "3331234567"
    private static String phoneKey(String p) {
        if (p == null) return "";
        String d = p.replaceAll("\\D", "");
        if (d.startsWith("0039")) d = d.substring(4);
        else if (d.startsWith("39") && d.length() > 10) d = d.substring(2);
        return d;
    }

    private static String nameKey(String n) {
        if (n == null) return "";
        String[] parts = n.toLowerCase(Locale.ITALIAN).replaceAll("[^a-zàèéìòù ]", " ").trim().split("\\s+");
        Arrays.sort(parts);
        return String.join(" ", parts);
    }

    @PostMapping("/check")
    public ResponseEntity<?> checkDuplicates(@RequestBody Map<String, Object> body, HttpSession session) {
        ResponseEntity<?> denied = check(session);
        if (denied != null) return denied;
        Object raw = body.get("rows");
        if (!(raw instanceof List<?> rows)) return ResponseEntity.badRequest().body(Map.of("error", "Nessuna riga"));

        Map<String, List<FollowUp>> byDate = new HashMap<>();
        Map<String, Object> out = new LinkedHashMap<>();
        for (Object o : rows) {
            if (!(o instanceof Map<?, ?> r)) continue;
            String key = String.valueOf(r.get("key"));
            String wd = String.valueOf(r.get("workDate"));
            List<FollowUp> sameDay = byDate.computeIfAbsent(wd, d -> followUpRepository.findByWorkDate(LocalDate.parse(d)));
            String pk = phoneKey((String) r.get("phone")), nk = nameKey((String) r.get("fullName"));
            List<Map<String, Object>> dup = new ArrayList<>();
            for (FollowUp f : sameDay) {
                boolean samePhone = !pk.isEmpty() && pk.equals(phoneKey(f.getCustomer().getPhone()));
                boolean sameName = !nk.isEmpty() && nk.equals(nameKey(f.getCustomer().getFullName()));
                if (samePhone || sameName) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", f.getId());
                    m.put("fullName", f.getCustomer().getFullName());
                    m.put("phone", f.getCustomer().getPhone());
                    m.put("consultantName", f.getConsultantName());
                    m.put("status", f.getStatus());
                    m.put("createdBy", f.getUser() != null ? f.getUser().getFullName() : null);
                    dup.add(m);
                }
            }
            if (!dup.isEmpty()) out.put(key, dup);
        }
        return ResponseEntity.ok(Map.of("duplicates", out));
    }

    @PostMapping
    @Transactional
    public ResponseEntity<?> importRows(@RequestBody Map<String, Object> body, HttpSession session) {
        ResponseEntity<?> denied = check(session);
        if (denied != null) return denied;
        Long userId = (Long) session.getAttribute("userId");
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));
        Object raw = body.get("rows");
        if (!(raw instanceof List<?> rows)) return ResponseEntity.badRequest().body(Map.of("error", "Nessuna riga"));

        LocalTime ora = LocalTime.now(ITALY).withNano(0);
        int creati = 0, aggiornati = 0, saltati = 0;
        List<String> errori = new ArrayList<>();

        for (Object o : rows) {
            if (!(o instanceof Map<?, ?> r)) continue;
            String azione = String.valueOf(r.get("action"));
            if ("skip".equals(azione)) { saltati++; continue; }
            try {
                FollowUp fu;
                if ("update".equals(azione) && r.get("updateId") != null) {
                    fu = followUpRepository.findById(Long.valueOf(String.valueOf(r.get("updateId")))).orElse(null);
                    if (fu == null) { errori.add(r.get("fullName") + ": follow-up da aggiornare non trovato"); continue; }
                    if (str(r.get("marca")) != null) fu.setMarca(str(r.get("marca")));
                    if (str(r.get("modello")) != null) fu.setModello(str(r.get("modello")));
                    if (fu.getCustomer().getEmail() == null && str(r.get("email")) != null) {
                        fu.getCustomer().setEmail(str(r.get("email")));
                        customerRepository.save(fu.getCustomer());
                    }
                    fu.setLastModifiedBy(user);
                    fu.setLastModifiedAt(LocalDateTime.now(ITALY));
                    aggiornati++;
                } else {
                    Customer c = new Customer();
                    c.setFullName(str(r.get("fullName")));
                    c.setPhone(str(r.get("phone")));
                    c.setEmail(str(r.get("email")));
                    c.setEmailOnly(false);
                    c = customerRepository.save(c);
                    fu = followUpService.createFollowUp(c, user, LocalDate.parse(String.valueOf(r.get("workDate"))), str(r.get("consultantName")));
                    fu.setMarca(str(r.get("marca")));
                    fu.setModello(str(r.get("modello")));
                    fu.setImported(true);
                    creati++;
                }

                // esiti degli step letti dalle note
                List<FollowUpStep> steps = followUpStepRepository.findByFollowUpOrderByStepNumber(fu);
                Object acts = r.get("actions");
                if (acts instanceof List<?> list) {
                    for (Object a : list) {
                        if (!(a instanceof Map<?, ?> am)) continue;
                        int n = Integer.parseInt(String.valueOf(am.get("step")));
                        FollowUpStep st = steps.stream().filter(s -> s.getStepNumber() == n).findFirst().orElse(null);
                        if (st == null) continue;
                        st.setOutcome(String.valueOf(am.get("outcome")));
                        String note = str(am.get("notes"));
                        if (note != null) st.setNotes(st.getNotes() == null || st.getNotes().isBlank() ? note : st.getNotes() + "\n" + note);
                        LocalDate d = am.get("date") != null ? LocalDate.parse(String.valueOf(am.get("date"))) : LocalDate.now(ITALY);
                        st.setExecutedAt(LocalDateTime.of(d, ora));
                        st.setExecutedBy(user);
                        st.setImported(true);
                        followUpStepRepository.save(st);
                    }
                }
                String prev = fu.getStatus();
                String stato = str(r.get("status"));
                if (stato != null && !"IN_PROGRESS".equals(stato)) fu.setStatus(stato);
                FollowUp saved = followUpService.save(fu);
                // come dalla pagina: un follow-up che diventa "Non risponde" avvia il Recall
                if ("ABANDONED".equals(saved.getStatus()) && !"ABANDONED".equals(prev)) {
                    recallFollowUpService.maybeCreateRecallFollowUp(saved);
                }
            } catch (Exception e) {
                errori.add(r.get("fullName") + ": " + e.getMessage());
            }
        }
        return ResponseEntity.ok(Map.of("creati", creati, "aggiornati", aggiornati, "saltati", saltati, "errori", errori));
    }

    private static String str(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o).trim();
        return s.isEmpty() || "null".equals(s) ? null : s;
    }
}
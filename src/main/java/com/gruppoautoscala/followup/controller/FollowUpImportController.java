package com.gruppoautoscala.followup.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruppoautoscala.followup.model.ConsegneDataset;
import com.gruppoautoscala.followup.model.Customer;
import com.gruppoautoscala.followup.model.FollowUp;
import com.gruppoautoscala.followup.model.FollowUpStep;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.ConsegneDatasetRepository;
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
 *
 *  GET  /api/followups/import/storico -> ultimi import (data, chi, file, quanti nuovi /
 *       aggiornati). Ogni import salva l'elenco dei follow-up CREATI e AGGIORNATI
 *       (i saltati no) nella tabella consegne_dataset, chiave "FOLLOWUP_IMPORTS":
 *       serve all'export Excel "Ultimo import" (FollowUpController, modo=import).
 */
@RestController
@RequestMapping("/api/followups/import")
public class FollowUpImportController {

    private static final ZoneId ITALY = ZoneId.of("Europe/Rome");
    public static final String CHIAVE_IMPORTS = "FOLLOWUP_IMPORTS";
    private static final int MAX_IMPORTS = 30;

    @Autowired private FollowUpService followUpService;
    @Autowired private FollowUpRepository followUpRepository;
    @Autowired private FollowUpStepRepository followUpStepRepository;
    @Autowired private CustomerRepository customerRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private RecallFollowUpService recallFollowUpService;
    @Autowired private RolePermissionService rolePermissionService;
    @Autowired private ConsegneDatasetRepository datasetRepository;
    @Autowired private ObjectMapper objectMapper;

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
        List<Long> idNuovi = new ArrayList<>(), idAggiornati = new ArrayList<>();

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
                        // la nota si aggiunge solo se non c'e' gia' (reimportando lo stesso CSV con
                        // "Aggiorna esistente" non si duplica)
                        if (note != null) {
                            String prima = st.getNotes();
                            if (prima == null || prima.isBlank()) st.setNotes(note);
                            else if (!prima.contains(note)) st.setNotes(prima + "\n" + note);
                        }
                        LocalDate d = am.get("date") != null ? LocalDate.parse(String.valueOf(am.get("date"))) : LocalDate.now(ITALY);
                        st.setExecutedAt(LocalDateTime.of(d, ora));
                        st.setExecutedBy(user);
                        st.setImported(true);
                        followUpStepRepository.save(st);
                    }
                }
                // "FISS. APP." nelle note: appuntamento fissato
                if (Boolean.TRUE.equals(r.get("hasAppointment"))) fu.setHasAppointment(true);
                String prev = fu.getStatus();
                String stato = str(r.get("status"));
                if (stato != null && !"IN_PROGRESS".equals(stato)) fu.setStatus(stato);
                FollowUp saved = followUpService.save(fu);
                ("update".equals(azione) && r.get("updateId") != null ? idAggiornati : idNuovi).add(saved.getId());
                // come dalla pagina: un follow-up che diventa "Non risponde" avvia il Recall
                if ("ABANDONED".equals(saved.getStatus()) && !"ABANDONED".equals(prev)) {
                    recallFollowUpService.maybeCreateRecallFollowUp(saved);
                }
            } catch (Exception e) {
                errori.add(r.get("fullName") + ": " + e.getMessage());
            }
        }
        String importId = null;
        if (!idNuovi.isEmpty() || !idAggiornati.isEmpty()) {
            try { importId = salvaImport(user.getFullName(), str(body.get("file")), idNuovi, idAggiornati, saltati); }
            catch (Exception e) { errori.add("Storico import non salvato: " + e.getMessage()); }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("creati", creati); out.put("aggiornati", aggiornati); out.put("saltati", saltati); out.put("errori", errori);
        out.put("importId", importId);
        return ResponseEntity.ok(out);
    }

    /* ---------------- storico degli import (per l'export "Ultimo import") ---------------- */
    public List<Map<String, Object>> leggiImports() {
        return datasetRepository.findById(CHIAVE_IMPORTS).map(d -> {
            try { return objectMapper.readValue(d.getContenuto(), new TypeReference<List<Map<String, Object>>>() {}); }
            catch (Exception e) { return new ArrayList<Map<String, Object>>(); }
        }).orElseGet(ArrayList::new);
    }

    private synchronized String salvaImport(String chi, String file, List<Long> nuovi, List<Long> aggiornati, int saltati) throws Exception {
        List<Map<String, Object>> lista = leggiImports();
        LocalDateTime ora = LocalDateTime.now(ITALY).withNano(0);
        String id = ora.toString() + "-" + (int) (Math.random() * 1000);
        Map<String, Object> riga = new LinkedHashMap<>();
        riga.put("id", id);
        riga.put("quando", ora.toString());
        riga.put("chi", chi);
        riga.put("file", file != null ? file : "");
        riga.put("nuovi", nuovi);
        riga.put("aggiornati", aggiornati);
        riga.put("saltati", saltati);
        lista.add(0, riga);
        while (lista.size() > MAX_IMPORTS) lista.remove(lista.size() - 1);
        ConsegneDataset d = datasetRepository.findById(CHIAVE_IMPORTS).orElseGet(() -> { ConsegneDataset n = new ConsegneDataset(); n.setTipo(CHIAVE_IMPORTS); return n; });
        d.setContenuto(objectMapper.writeValueAsString(lista));
        d.setRighe(lista.size());
        d.setAggiornatoAt(LocalDateTime.now());
        d.setAggiornatoDa(chi);
        datasetRepository.save(d);
        return id;
    }

    // elenco degli ultimi import, senza gli id (per la finestra di export)
    @GetMapping("/storico")
    public ResponseEntity<?> storico(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!rolePermissionService.hasAtLeast(rolePermissionService.getEffectiveAccess(userId, role, "FOLLOWUPS"), "READ_ONLY"))
            return ResponseEntity.status(403).body(Map.of("error", "Non hai il permesso per i Follow-up"));
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> m : leggiImports()) {
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("id", m.get("id")); x.put("quando", m.get("quando")); x.put("chi", m.get("chi")); x.put("file", m.get("file"));
            x.put("nuovi", m.get("nuovi") instanceof List<?> l ? l.size() : 0);
            x.put("aggiornati", m.get("aggiornati") instanceof List<?> l ? l.size() : 0);
            x.put("saltati", m.get("saltati"));
            out.add(x);
        }
        return ResponseEntity.ok(Map.of("imports", out));
    }

    private static String str(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o).trim();
        return s.isEmpty() || "null".equals(s) ? null : s;
    }
}
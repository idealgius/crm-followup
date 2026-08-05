package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.*;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.repository.VeicoloLavorazioneRepository;
import com.gruppoautoscala.followup.repository.VeicoloStatoLogRepository;
import com.gruppoautoscala.followup.service.RolePermissionService;
import com.gruppoautoscala.followup.service.VeicoloConsegnaService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/veicoli")
public class VeicoloConsegnaController {

    @Autowired private VeicoloConsegnaService service;
    @Autowired private VeicoloLavorazioneRepository lavorazioneRepository;
    @Autowired private VeicoloStatoLogRepository statoLogRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private RolePermissionService rolePermissionService;

    private static final String SECTION = "VEICOLI";

    private static final List<String> SEDI = List.of("AGNANO", "CASAMARCIANO", "SALERNO");
    private static final List<String> SEDI_CONSEGNA = List.of("AGNANO", "CASAMARCIANO", "SALERNO", "CONSEGNA_CLIENTE");
    private static final List<String> UBICAZIONI = List.of("AGNANO", "CASAMARCIANO", "SALERNO", "ALTRO");

    private static final List<String> LAVORAZIONE_TIPI = List.of(
        "TAGLIANDO", "LOJACK", "BLOCKSHAFT", "POLIZZA_FIR", "IMMATRICOLAZIONE",
        "IMMATRICOLAZIONE_ESTERA", "PASSAGGIO", "SOSTITUZIONE_PNEUMATICI",
        "BULLONI_ANTIFURTO", "METASYSTEM", "RETROCAMERA_POSTERIORE",
        "LAVORAZIONE_CARROZZERIA", "LAVAGGIO", "ALTRA_LAVORAZIONE"
    );
    private static final List<String> PASSAGGIO_MESI = List.of("24", "36", "48", "60");
    private static final List<String> BULLONI_DETTAGLIO = List.of("OMAGGIO", "PAGATI");

    private static final List<String> METODI_PAGAMENTO = List.of(
        "UNICA_SOLUZIONE", "FINANZIAMENTO_ANTICIPO", "FINANZIAMENTO_MAXIRATA",
        "FINANZIAMENTO_ANTICIPO_MAXIRATA", "LEASING"
    );
    private static final List<String> FINANZIARIE = List.of(
        "COMPASS", "DEUTSCHE_BANK", "CA_BANK", "SANTANDER", "AGOS",
        "STELLANTIS", "MOBILIZE_RENAULT", "MOBILIZE_DACIA", "FIN_FIAT"
    );
    private static final List<String> FINANZIARIE_LEASING = List.of("SANTANDER_LEASING", "CA_BANK_LEASING");

    private static final List<String> TIPO_PERMUTA_ROTTAMAZIONE = List.of("NESSUNA", "PERMUTA", "ROTTAMAZIONE");

    private static final List<String> STATO_TIPI = List.of(
        "RICHIESTA_PRATICA_FINANZIAMENTO", "RICHIESTA_PRATICA_LEASING", "ATTESA_SALDO",
        "PRATICA_FINANZIAMENTO_AVVIATA", "PRATICA_LEASING_AVVIATA", "IN_ATTESA_LAVORAZIONE",
        "IN_LAVORAZIONE", "PERMESSINO_PRONTO", "LIBRETTO_PRONTO", "LIBRETTO_IN_SEDE",
        "TARGHE_IN_SEDE", "PRONTA_PER_CONSEGNA", "APPUNTAMENTO_CONSEGNA_FISSATO"
    );

    // ===== PERMESSI =====
    private boolean canRead(Long userId, String role) {
        return !"NONE".equals(rolePermissionService.getEffectiveAccess(userId, role, SECTION));
    }
    private boolean canWrite(Long userId, String role) {
        return rolePermissionService.hasAtLeast(rolePermissionService.getEffectiveAccess(userId, role, SECTION), "FULL");
    }
    private boolean canWriteRecord(VeicoloConsegna v, Long userId, String role) {
        boolean isAdminOwned = v.getUser() != null && "ADMIN".equals(v.getUser().getRole());
        if (!isAdminOwned) return canWrite(userId, role);
        return "ADMIN_FULL".equals(rolePermissionService.getEffectiveAccess(userId, role, SECTION));
    }

    // ===== SERIALIZZAZIONE =====
    private Map<String, Object> toMap(VeicoloConsegna v) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", v.getId());
        m.put("targa", v.getTarga());
        m.put("marchio", v.getMarchio());
        m.put("modello", v.getModello());
        m.put("intestatario", v.getIntestatario());
        m.put("numeroCliente", v.getNumeroCliente());
        m.put("consulenteRiferimento", v.getConsulenteRiferimento());
        m.put("tipoPermutaRottamazione", v.getTipoPermutaRottamazione());
        m.put("marchioPermuta", v.getMarchioPermuta());
        m.put("modelloPermuta", v.getModelloPermuta());
        m.put("valorePermuta", v.getValorePermuta());
        m.put("sedeConsegna", v.getSedeConsegna());
        m.put("ubicazioneIniziale", v.getUbicazioneIniziale());
        m.put("ubicazioneAltroNote", v.getUbicazioneAltroNote());
        m.put("metodoPagamento", v.getMetodoPagamento());
        m.put("anticipoPresente", v.getAnticipoPresente());
        m.put("importoAnticipo", v.getImportoAnticipo());
        m.put("finanziaria", v.getFinanziaria());
        m.put("statoPratica", v.getStatoPratica());
        m.put("dataAppuntamentoConsegna", v.getDataAppuntamentoConsegna() != null ? v.getDataAppuntamentoConsegna().toString() : null);
        m.put("oraAppuntamentoConsegna", v.getOraAppuntamentoConsegna());
        m.put("dataConsegnaEffettiva", v.getDataConsegnaEffettiva() != null ? v.getDataConsegnaEffettiva().toString() : null);
        m.put("dataAnnullamento", v.getDataAnnullamento() != null ? v.getDataAnnullamento().toString() : null);
        m.put("motivoAnnullamento", v.getMotivoAnnullamento());
        m.put("createdAt", v.getCreatedAt().toString());

        Map<String, Object> user = new LinkedHashMap<>();
        user.put("id", v.getUser().getId());
        user.put("fullName", v.getUser().getFullName());
        user.put("role", v.getUser().getRole());
        m.put("user", user);

        m.put("lavorazioni", v.getLavorazioni().stream().map(l -> {
            Map<String, Object> lm = new LinkedHashMap<>();
            lm.put("id", l.getId());
            lm.put("tipo", l.getTipo());
            lm.put("dettaglio", l.getDettaglio());
            lm.put("note", l.getNote());
            lm.put("completata", l.isCompletata());
            lm.put("dataCompletamento", l.getDataCompletamento() != null ? l.getDataCompletamento().toString() : null);
            return lm;
        }).collect(Collectors.toList()));

        m.put("statiLog", v.getStatiLog().stream().map(s -> {
            Map<String, Object> sm = new LinkedHashMap<>();
            sm.put("id", s.getId());
            sm.put("tipo", s.getTipo());
            sm.put("data", s.getData().toString());
            return sm;
        }).collect(Collectors.toList()));

        return m;
    }

    // ===== LETTURA =====

    // stato: IN_CORSO (default) | CONSEGNATA | ANNULLATA
    // sedi: lista separata da virgola, es. "AGNANO,SALERNO" — vuoto/assente = tutte
    // Per CONSEGNATA: from/to in formato yyyy-MM (mese) o yyyy (anno intero)
    @GetMapping
    public ResponseEntity<?> getAll(
            @RequestParam(required = false, defaultValue = "IN_CORSO") String stato,
            @RequestParam(required = false) String sedi,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canRead(userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        List<String> sedeList = (sedi == null || sedi.isBlank()) ? List.of() :
            Arrays.stream(sedi.split(",")).map(String::trim).filter(s -> !s.isEmpty()).collect(Collectors.toList());

        List<VeicoloConsegna> result;
        if ("CONSEGNATA".equals(stato) && (from != null || to != null)) {
            LocalDateTime[] range = parsePeriodo(from, to);
            result = service.getConsegnateNelPeriodo(sedeList, range[0], range[1]);
        } else {
            result = service.getByStatoESedi(stato, sedeList);
        }
        return ResponseEntity.ok(result.stream().map(this::toMap).collect(Collectors.toList()));
    }

    // Filtro temporale "intelligente": from/to possono essere "yyyy-MM"
    // (un mese intero) o "yyyy" (un anno intero). Se manca uno dei due si
    // usa lo stesso valore per entrambi (un solo mese/anno).
    private LocalDateTime[] parsePeriodo(String from, String to) {
        String f = from != null ? from : to;
        String t = to != null ? to : from;
        LocalDateTime start = periodoInizio(f);
        LocalDateTime end = periodoFine(t);
        return new LocalDateTime[]{start, end};
    }
    private LocalDateTime periodoInizio(String s) {
        if (s.length() == 4) return LocalDate.of(Integer.parseInt(s), 1, 1).atStartOfDay();
        YearMonth ym = YearMonth.parse(s);
        return ym.atDay(1).atStartOfDay();
    }
    private LocalDateTime periodoFine(String s) {
        if (s.length() == 4) return LocalDate.of(Integer.parseInt(s), 12, 31).atTime(23, 59, 59);
        YearMonth ym = YearMonth.parse(s);
        return ym.atEndOfMonth().atTime(23, 59, 59);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canRead(userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        Optional<VeicoloConsegna> v = service.getById(id);
        return v.map(x -> ResponseEntity.ok(toMap(x))).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/search")
    public ResponseEntity<?> search(@RequestParam String q, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canRead(userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        return ResponseEntity.ok(service.search(q).stream().map(this::toMap).collect(Collectors.toList()));
    }

    // Calendario consegne: tutti gli appuntamenti fissati (pratiche
    // IN_CORSO) nell'intervallo di date richiesto.
    @GetMapping("/calendario")
    public ResponseEntity<?> calendario(@RequestParam String from, @RequestParam String to, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canRead(userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        List<VeicoloConsegna> result = service.getAppuntamentiTraLeDate(LocalDate.parse(from), LocalDate.parse(to));
        return ResponseEntity.ok(result.stream().map(this::toMap).collect(Collectors.toList()));
    }

    // ===== SCRITTURA =====

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!canWrite(userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non hai i permessi per creare una scheda"));

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));

        String targa = (String) body.get("targa");
        String marchio = (String) body.get("marchio");
        String modello = (String) body.get("modello");
        String intestatario = (String) body.get("intestatario");
        String sedeConsegna = (String) body.get("sedeConsegna");
        String ubicazioneIniziale = (String) body.get("ubicazioneIniziale");
        String metodoPagamento = (String) body.get("metodoPagamento");

        if (isBlank(targa) || isBlank(marchio) || isBlank(modello) || isBlank(intestatario))
            return ResponseEntity.badRequest().body(Map.of("error", "Targa, marchio, modello e intestatario sono obbligatori"));
        if (!SEDI_CONSEGNA.contains(sedeConsegna))
            return ResponseEntity.badRequest().body(Map.of("error", "Sede di consegna non valida"));
        if (!UBICAZIONI.contains(ubicazioneIniziale))
            return ResponseEntity.badRequest().body(Map.of("error", "Ubicazione iniziale non valida"));
        if (!METODI_PAGAMENTO.contains(metodoPagamento))
            return ResponseEntity.badRequest().body(Map.of("error", "Metodo di pagamento non valido"));

        String errore = validaFinanziaria(metodoPagamento, (String) body.get("finanziaria"));
        if (errore != null) return ResponseEntity.badRequest().body(Map.of("error", errore));

        VeicoloConsegna v = new VeicoloConsegna();
        v.setUser(userOpt.get());
        v.setTarga(targa.trim().toUpperCase());
        v.setMarchio(marchio.trim());
        v.setModello(modello.trim());
        v.setIntestatario(intestatario.trim());
        v.setNumeroCliente((String) body.get("numeroCliente"));
        v.setConsulenteRiferimento((String) body.get("consulenteRiferimento"));
        v.setSedeConsegna(sedeConsegna);
        v.setUbicazioneIniziale(ubicazioneIniziale);
        v.setUbicazioneAltroNote("ALTRO".equals(ubicazioneIniziale) ? (String) body.get("ubicazioneAltroNote") : null);
        v.setMetodoPagamento(metodoPagamento);
        applicaPagamento(v, body);
        applicaPermuta(v, body);

        v = service.save(v);
        VeicoloConsegna saved = v;

        // Lavorazioni scelte: [{tipo, dettaglio?, note?}, ...]
        Object lavorazioniRaw = body.get("lavorazioni");
        if (lavorazioniRaw instanceof List) {
            List<?> lista = (List<?>) lavorazioniRaw;
            for (Object o : lista) {
                if (!(o instanceof Map)) continue;
                @SuppressWarnings("unchecked")
                Map<String, Object> lo = (Map<String, Object>) o;
                String tipo = (String) lo.get("tipo");
                if (!LAVORAZIONE_TIPI.contains(tipo)) continue;
                VeicoloLavorazione l = new VeicoloLavorazione();
                l.setVeicoloConsegna(saved);
                l.setTipo(tipo);
                l.setDettaglio((String) lo.get("dettaglio"));
                l.setNote((String) lo.get("note"));
                lavorazioneRepository.save(l);
            }
        }

        Optional<VeicoloConsegna> reloaded = service.getById(saved.getId());
        return ResponseEntity.ok(toMap(reloaded.orElse(saved)));
    }

    private String validaFinanziaria(String metodoPagamento, String finanziaria) {
        boolean isFinanziamento = metodoPagamento.startsWith("FINANZIAMENTO_");
        boolean isLeasing = "LEASING".equals(metodoPagamento);
        if (isFinanziamento && !FINANZIARIE.contains(finanziaria)) return "Finanziaria non valida";
        if (isLeasing && !FINANZIARIE_LEASING.contains(finanziaria)) return "Finanziaria (leasing) non valida";
        return null;
    }

    private void applicaPagamento(VeicoloConsegna v, Map<String, Object> body) {
        if ("UNICA_SOLUZIONE".equals(v.getMetodoPagamento())) {
            boolean anticipo = Boolean.TRUE.equals(body.get("anticipoPresente"));
            v.setAnticipoPresente(anticipo);
            v.setImportoAnticipo(anticipo && body.get("importoAnticipo") != null
                ? new BigDecimal(body.get("importoAnticipo").toString()) : null);
            v.setFinanziaria(null);
        } else {
            v.setAnticipoPresente(null);
            v.setImportoAnticipo(null);
            v.setFinanziaria((String) body.get("finanziaria"));
        }
    }

    private void applicaPermuta(VeicoloConsegna v, Map<String, Object> body) {
        String tipo = (String) body.getOrDefault("tipoPermutaRottamazione", "NESSUNA");
        if (!TIPO_PERMUTA_ROTTAMAZIONE.contains(tipo)) tipo = "NESSUNA";
        v.setTipoPermutaRottamazione(tipo);
        if ("NESSUNA".equals(tipo)) {
            v.setMarchioPermuta(null);
            v.setModelloPermuta(null);
            v.setValorePermuta(null);
        } else {
            v.setMarchioPermuta((String) body.get("marchioPermuta"));
            v.setModelloPermuta((String) body.get("modelloPermuta"));
            Object valore = body.get("valorePermuta");
            v.setValorePermuta(valore != null && !valore.toString().isBlank() ? new BigDecimal(valore.toString()) : null);
        }
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        Optional<VeicoloConsegna> vOpt = service.getById(id);
        if (vOpt.isEmpty()) return ResponseEntity.notFound().build();
        VeicoloConsegna v = vOpt.get();
        if (!canWriteRecord(v, userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        if (body.containsKey("targa")) v.setTarga(((String) body.get("targa")).trim().toUpperCase());
        if (body.containsKey("marchio")) v.setMarchio((String) body.get("marchio"));
        if (body.containsKey("modello")) v.setModello((String) body.get("modello"));
        if (body.containsKey("intestatario")) v.setIntestatario((String) body.get("intestatario"));
        if (body.containsKey("numeroCliente")) v.setNumeroCliente((String) body.get("numeroCliente"));
        if (body.containsKey("consulenteRiferimento")) v.setConsulenteRiferimento((String) body.get("consulenteRiferimento"));

        if (body.containsKey("sedeConsegna")) {
            String s = (String) body.get("sedeConsegna");
            if (!SEDI_CONSEGNA.contains(s)) return ResponseEntity.badRequest().body(Map.of("error", "Sede di consegna non valida"));
            v.setSedeConsegna(s);
        }
        if (body.containsKey("ubicazioneIniziale")) {
            String u = (String) body.get("ubicazioneIniziale");
            if (!UBICAZIONI.contains(u)) return ResponseEntity.badRequest().body(Map.of("error", "Ubicazione non valida"));
            v.setUbicazioneIniziale(u);
            v.setUbicazioneAltroNote("ALTRO".equals(u) ? (String) body.get("ubicazioneAltroNote") : null);
        }
        if (body.containsKey("metodoPagamento")) {
            String mp = (String) body.get("metodoPagamento");
            if (!METODI_PAGAMENTO.contains(mp)) return ResponseEntity.badRequest().body(Map.of("error", "Metodo di pagamento non valido"));
            String errore = validaFinanziaria(mp, (String) body.get("finanziaria"));
            if (errore != null) return ResponseEntity.badRequest().body(Map.of("error", errore));
            v.setMetodoPagamento(mp);
            applicaPagamento(v, body);
        }
        if (body.containsKey("tipoPermutaRottamazione")) applicaPermuta(v, body);

        if (body.containsKey("dataAppuntamentoConsegna")) {
            String d = (String) body.get("dataAppuntamentoConsegna");
            v.setDataAppuntamentoConsegna(d != null && !d.isBlank() ? LocalDate.parse(d) : null);
        }
        if (body.containsKey("oraAppuntamentoConsegna")) v.setOraAppuntamentoConsegna((String) body.get("oraAppuntamentoConsegna"));

        return ResponseEntity.ok(toMap(service.save(v)));
    }

    // Aggiunge una lavorazione tecnica alla scheda (oltre a quelle scelte in fase di creazione)
    @PostMapping("/{id}/lavorazioni")
    public ResponseEntity<?> addLavorazione(@PathVariable Long id, @RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<VeicoloConsegna> vOpt = service.getById(id);
        if (vOpt.isEmpty()) return ResponseEntity.notFound().build();
        VeicoloConsegna v = vOpt.get();
        if (!canWriteRecord(v, userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        String tipo = (String) body.get("tipo");
        if (!LAVORAZIONE_TIPI.contains(tipo)) return ResponseEntity.badRequest().body(Map.of("error", "Tipo lavorazione non valido"));

        VeicoloLavorazione l = new VeicoloLavorazione();
        l.setVeicoloConsegna(v);
        l.setTipo(tipo);
        l.setDettaglio((String) body.get("dettaglio"));
        l.setNote((String) body.get("note"));
        lavorazioneRepository.save(l);
        return ResponseEntity.ok(toMap(service.getById(id).get()));
    }

    // Marca/smarca una lavorazione come completata
    @PatchMapping("/{id}/lavorazioni/{lavorazioneId}")
    public ResponseEntity<?> toggleLavorazione(@PathVariable Long id, @PathVariable Long lavorazioneId,
                                                @RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<VeicoloConsegna> vOpt = service.getById(id);
        if (vOpt.isEmpty()) return ResponseEntity.notFound().build();
        VeicoloConsegna v = vOpt.get();
        if (!canWriteRecord(v, userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        Optional<VeicoloLavorazione> lOpt = lavorazioneRepository.findById(lavorazioneId);
        if (lOpt.isEmpty() || !lOpt.get().getVeicoloConsegna().getId().equals(id)) return ResponseEntity.notFound().build();

        boolean completata = Boolean.TRUE.equals(body.get("completata"));
        service.toggleLavorazione(lOpt.get(), completata);
        return ResponseEntity.ok(toMap(service.getById(id).get()));
    }

    // Attiva uno stato burocratico (aggiunge una riga, non sostituisce le altre)
    @PostMapping("/{id}/stati")
    public ResponseEntity<?> addStato(@PathVariable Long id, @RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<VeicoloConsegna> vOpt = service.getById(id);
        if (vOpt.isEmpty()) return ResponseEntity.notFound().build();
        VeicoloConsegna v = vOpt.get();
        if (!canWriteRecord(v, userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        String tipo = (String) body.get("tipo");
        if (!STATO_TIPI.contains(tipo)) return ResponseEntity.badRequest().body(Map.of("error", "Stato non valido"));
        String dataStr = (String) body.get("data");
        LocalDate data = (dataStr != null && !dataStr.isBlank()) ? LocalDate.parse(dataStr) : LocalDate.now();

        service.addStato(v, tipo, data);
        return ResponseEntity.ok(toMap(service.getById(id).get()));
    }

    @DeleteMapping("/{id}/stati/{statoId}")
    public ResponseEntity<?> removeStato(@PathVariable Long id, @PathVariable Long statoId, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<VeicoloConsegna> vOpt = service.getById(id);
        if (vOpt.isEmpty()) return ResponseEntity.notFound().build();
        VeicoloConsegna v = vOpt.get();
        if (!canWriteRecord(v, userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        Optional<VeicoloStatoLog> sOpt = statoLogRepository.findById(statoId);
        if (sOpt.isEmpty() || !sOpt.get().getVeicoloConsegna().getId().equals(id)) return ResponseEntity.notFound().build();
        service.removeStato(statoId);
        return ResponseEntity.ok(toMap(service.getById(id).get()));
    }

    @PatchMapping("/{id}/annulla")
    public ResponseEntity<?> annulla(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<VeicoloConsegna> vOpt = service.getById(id);
        if (vOpt.isEmpty()) return ResponseEntity.notFound().build();
        VeicoloConsegna v = vOpt.get();
        if (!canWriteRecord(v, userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        String motivo = body != null ? (String) body.get("motivo") : null;
        return ResponseEntity.ok(toMap(service.annulla(v, motivo)));
    }

    @PatchMapping("/{id}/consegna")
    public ResponseEntity<?> consegna(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<VeicoloConsegna> vOpt = service.getById(id);
        if (vOpt.isEmpty()) return ResponseEntity.notFound().build();
        VeicoloConsegna v = vOpt.get();
        if (!canWriteRecord(v, userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));

        return ResponseEntity.ok(toMap(service.consegna(v)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        Optional<VeicoloConsegna> vOpt = service.getById(id);
        if (vOpt.isEmpty()) return ResponseEntity.notFound().build();
        if (!canWriteRecord(vOpt.get(), userId, role)) return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        service.delete(id);
        return ResponseEntity.ok(Map.of("message", "Scheda eliminata"));
    }

    private boolean isBlank(String s) { return s == null || s.isBlank(); }
}
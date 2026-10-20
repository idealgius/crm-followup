package com.gruppoautoscala.followup.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruppoautoscala.followup.model.ConsegneDataset;
import com.gruppoautoscala.followup.repository.ConsegneDatasetRepository;
import com.gruppoautoscala.followup.service.RolePermissionService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;

/**
 * NUOVO: Quotazioni Rent — le quotazioni dei portali di noleggio (Ayvens, Arval, Agos...).
 * I PDF vengono letti nel browser (quotazioni-rent.js): qui arrivano solo i dati gia'
 * estratti (canone, anticipo, durata, km, cliente, veicolo...) e si salvano nello stesso
 * archivio usato dal resto del CRM (tabella consegne_dataset, chiave RENT_QUOTAZIONI).
 *
 *  GET    /api/quotazioni-rent/accesso  -> { livello }   (per il menu e il pulsante nel Rent)
 *  GET    /api/quotazioni-rent          -> { quotazioni: [...], puoModificare }
 *  POST   /api/quotazioni-rent          { quotazioni: [...] }  aggiunge / aggiorna (stesso portale + numero)
 *  PATCH  /api/quotazioni-rent/{id}     { tipoCliente }        corregge il tipo di cliente
 *  DELETE /api/quotazioni-rent/{id}
 *
 * Permesso: sezione QUOTAZIONI_RENT (Solo lettura = consulta, Completo = importa/corregge/elimina).
 */
@RestController
@RequestMapping("/api/quotazioni-rent")
public class QuotazioniRentController {

    private static final String CHIAVE = "RENT_QUOTAZIONI";
    private static final ZoneId ITALIA = ZoneId.of("Europe/Rome");
    private static final int MAX = 20000;
    private static final Set<String> TIPI = Set.of("PRIVATO", "PIVA", "AZIENDA");

    // NUOVO: PDF conservati nell'archivio. Ogni PDF sta in una riga a parte di consegne_dataset
    // (chiave RQPDF_...), cosi' l'elenco delle quotazioni resta leggero. La pagina salva solo le
    // pagine dell'offerta (senza le condizioni generali). Tetto massimo di spazio per non
    // riempire il database del CRM: oltre, i dati si salvano lo stesso ma il PDF no.
    private static final long MAX_PDF_FILE_KB = 3 * 1024;
    private static final long MAX_PDF_TOTALE_KB = 200 * 1024;
    private static final String PREFISSO_PDF = "RQPDF_";

    // campi accettati: testo e numeri. Tutto il resto viene scartato.
    private static final List<String> TESTI = List.of("portale", "numero", "data", "scadenza", "cliente", "cf", "tipoCliente",
        "veicolo", "marca", "modello", "versione", "alimentazione", "stato", "file", "ivaCanone", "ivaAnticipo", "note");
    private static final List<String> NUMERI = List.of("canoneEscl", "canoneIncl", "anticipoEscl", "anticipoIncl", "speseEscl",
        "mesi", "kmTotali", "kmAnnui", "listinoEscl", "quotaServiziEscl", "quotaNoleggioEscl");
    private static final List<String> SI_NO = List.of("pneumatici", "sostitutiva");

    @Autowired private ConsegneDatasetRepository repository;
    @Autowired private RolePermissionService rolePermissionService;
    @Autowired private ObjectMapper objectMapper;

    private String livello(HttpSession s) {
        Long id = (Long) s.getAttribute("userId");
        String role = (String) s.getAttribute("userRole");
        if (id == null || role == null) return "NONE";
        return rolePermissionService.getEffectiveAccess(id, role, "QUOTAZIONI_RENT");
    }
    private boolean vede(HttpSession s) { return rolePermissionService.hasAtLeast(livello(s), "READ_ONLY"); }
    private boolean modifica(HttpSession s) { return rolePermissionService.hasAtLeast(livello(s), "FULL"); }

    private synchronized List<Map<String, Object>> leggi() {
        Optional<ConsegneDataset> d = repository.findById(CHIAVE);
        if (d.isEmpty() || d.get().getContenuto() == null || d.get().getContenuto().isBlank()) return new ArrayList<>();
        try { return objectMapper.readValue(d.get().getContenuto(), new TypeReference<List<Map<String, Object>>>() {}); }
        catch (Exception e) { return new ArrayList<>(); }
    }

    private synchronized void scrivi(List<Map<String, Object>> lista, String chi) throws Exception {
        ConsegneDataset d = repository.findById(CHIAVE).orElseGet(() -> { ConsegneDataset n = new ConsegneDataset(); n.setTipo(CHIAVE); return n; });
        d.setContenuto(objectMapper.writeValueAsString(lista));
        d.setRighe(lista.size());
        d.setAggiornatoAt(LocalDateTime.now(ITALIA));
        d.setAggiornatoDa(chi == null ? "quotazioni rent" : chi);
        repository.save(d);
    }

    private static String testo(Object o, int max) {
        if (o == null) return null;
        String s = String.valueOf(o).trim();
        if (s.isEmpty()) return null;
        return s.length() > max ? s.substring(0, max) : s;
    }
    private static Double numero(Object o) {
        if (o == null) return null;
        try { double v = o instanceof Number n ? n.doubleValue() : Double.parseDouble(String.valueOf(o).replace(',', '.')); return Double.isFinite(v) && v >= 0 && v < 1e9 ? Math.round(v * 100) / 100.0 : null; }
        catch (Exception e) { return null; }
    }
    private static String chiave(Map<String, Object> q) {
        return (String.valueOf(q.getOrDefault("portale", "")) + "|" + String.valueOf(q.getOrDefault("numero", ""))).toUpperCase(Locale.ROOT);
    }

    /** tiene solo i campi conosciuti, con il tipo giusto */
    private static Map<String, Object> pulisci(Map<String, Object> in) {
        Map<String, Object> q = new LinkedHashMap<>();
        for (String k : TESTI) { String v = testo(in.get(k), "note".equals(k) ? 500 : 200); if (v != null) q.put(k, v); }
        for (String k : NUMERI) { Double v = numero(in.get(k)); if (v != null) q.put(k, v); }
        for (String k : SI_NO) if (in.get(k) instanceof Boolean b) q.put(k, b);
        if (!TIPI.contains(String.valueOf(q.get("tipoCliente")))) q.put("tipoCliente", "PRIVATO");
        return q;
    }

    @GetMapping("/accesso")
    public ResponseEntity<?> accesso(HttpSession s) {
        if (s.getAttribute("userId") == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        return ResponseEntity.ok(Map.of("livello", livello(s)));
    }

    @GetMapping
    public ResponseEntity<?> elenco(HttpSession s) {
        if (s.getAttribute("userId") == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!vede(s)) return ResponseEntity.status(403).body(Map.of("error", "Non hai il permesso per Quotazioni Rent"));
        Map<String, Object> out = new HashMap<>();
        out.put("quotazioni", leggi());
        out.put("puoModificare", modifica(s));
        out.put("pdfMaxKb", MAX_PDF_TOTALE_KB);
        out.put("pdfFileMaxKb", MAX_PDF_FILE_KB);
        return ResponseEntity.ok(out);
    }

    @PostMapping
    public ResponseEntity<?> importa(@RequestBody Map<String, Object> body, HttpSession s) {
        if (s.getAttribute("userId") == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!modifica(s)) return ResponseEntity.status(403).body(Map.of("error", "Per importare serve il permesso Completo su Quotazioni Rent"));
        if (!(body.get("quotazioni") instanceof List<?> arrivate) || arrivate.isEmpty())
            return ResponseEntity.badRequest().body(Map.of("error", "Nessuna quotazione da salvare"));
        String chi = (String) s.getAttribute("userFullName");
        String quando = LocalDateTime.now(ITALIA).withNano(0).toString();
        synchronized (this) {
            List<Map<String, Object>> lista = leggi();
            Map<String, Map<String, Object>> perChiave = new LinkedHashMap<>();
            for (Map<String, Object> q : lista) perChiave.put(chiave(q), q);
            int nuove = 0, aggiornate = 0;
            List<Map<String, Object>> salvate = new ArrayList<>();
            for (Object o : arrivate) {
                if (!(o instanceof Map<?, ?> m)) continue;
                @SuppressWarnings("unchecked") Map<String, Object> q = pulisci((Map<String, Object>) m);
                if (q.get("portale") == null || q.get("canoneEscl") == null || q.get("mesi") == null) continue;
                if (q.get("numero") == null) q.put("numero", "senza-numero-" + UUID.randomUUID().toString().substring(0, 8));
                Map<String, Object> prima = perChiave.get(chiave(q));
                if (prima != null) {
                    q.put("id", prima.get("id"));
                    for (String k : List.of("pdfKey", "pdfKb", "pdfNome")) if (prima.get(k) != null) q.put(k, prima.get(k));
                    q.put("caricataDa", prima.get("caricataDa"));
                    q.put("caricataIl", prima.get("caricataIl"));
                    q.put("aggiornataDa", chi);
                    q.put("aggiornataIl", quando);
                    aggiornate++;
                } else {
                    q.put("id", UUID.randomUUID().toString());
                    q.put("caricataDa", chi);
                    q.put("caricataIl", quando);
                    nuove++;
                }
                perChiave.put(chiave(q), q);
                salvate.add(Map.of("id", q.get("id"), "portale", q.get("portale"), "numero", q.get("numero")));
            }
            List<Map<String, Object>> nuovaLista = new ArrayList<>(perChiave.values());
            if (nuovaLista.size() > MAX) return ResponseEntity.badRequest().body(Map.of("error", "Troppe quotazioni salvate (massimo " + MAX + ")"));
            try { scrivi(nuovaLista, chi); }
            catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", "Quotazioni non salvate: " + e.getMessage())); }
            return ResponseEntity.ok(Map.of("nuove", nuove, "aggiornate", aggiornate, "totale", nuovaLista.size(), "salvate", salvate));
        }
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> correggi(@PathVariable String id, @RequestBody Map<String, Object> body, HttpSession s) {
        if (s.getAttribute("userId") == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!modifica(s)) return ResponseEntity.status(403).body(Map.of("error", "Serve il permesso Completo su Quotazioni Rent"));
        String tipo = String.valueOf(body.get("tipoCliente"));
        if (!TIPI.contains(tipo)) return ResponseEntity.badRequest().body(Map.of("error", "Tipo cliente non valido"));
        synchronized (this) {
            List<Map<String, Object>> lista = leggi();
            for (Map<String, Object> q : lista) if (id.equals(String.valueOf(q.get("id")))) {
                q.put("tipoCliente", tipo);
                try { scrivi(lista, (String) s.getAttribute("userFullName")); }
                catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", "Non salvato: " + e.getMessage())); }
                return ResponseEntity.ok(Map.of("quotazione", q));
            }
        }
        return ResponseEntity.status(404).body(Map.of("error", "Quotazione non trovata"));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> elimina(@PathVariable String id, HttpSession s) {
        if (s.getAttribute("userId") == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!modifica(s)) return ResponseEntity.status(403).body(Map.of("error", "Serve il permesso Completo su Quotazioni Rent"));
        synchronized (this) {
            List<Map<String, Object>> lista = leggi();
            lista.stream().filter(q -> id.equals(String.valueOf(q.get("id"))) && q.get("pdfKey") != null)
                .findFirst().ifPresent(q -> togliPdf(String.valueOf(q.get("pdfKey"))));
            boolean tolta = lista.removeIf(q -> id.equals(String.valueOf(q.get("id"))));
            if (!tolta) return ResponseEntity.status(404).body(Map.of("error", "Quotazione non trovata"));
            try { scrivi(lista, (String) s.getAttribute("userFullName")); }
            catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", "Non eliminata: " + e.getMessage())); }
        }
        return ResponseEntity.ok(Map.of("eliminata", true));
    }

    /* ===================== PDF NELL'ARCHIVIO ===================== */
    private void togliPdf(String key) {
        try { if (key != null && key.startsWith(PREFISSO_PDF)) repository.deleteById(key); } catch (Exception ignored) { /* gia' tolto */ }
    }
    private static long kb(Object o) { try { return Math.round(Double.parseDouble(String.valueOf(o))); } catch (Exception e) { return 0; } }

    @PutMapping("/{id}/pdf")
    public ResponseEntity<?> salvaPdf(@PathVariable String id, @RequestBody Map<String, Object> body, HttpSession s) {
        if (s.getAttribute("userId") == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!modifica(s)) return ResponseEntity.status(403).body(Map.of("error", "Serve il permesso Completo su Quotazioni Rent"));
        String dati = body.get("dati") == null ? "" : String.valueOf(body.get("dati")).replaceAll("\\s", "");
        byte[] pdf;
        try { pdf = Base64.getDecoder().decode(dati); } catch (Exception e) { return ResponseEntity.badRequest().body(Map.of("error", "PDF non valido")); }
        if (pdf.length < 5 || !new String(pdf, 0, 5).startsWith("%PDF")) return ResponseEntity.badRequest().body(Map.of("error", "Il file non e' un PDF"));
        long peso = Math.max(1, Math.round(pdf.length / 1024.0));
        if (peso > MAX_PDF_FILE_KB) return ResponseEntity.badRequest().body(Map.of("error", "PDF troppo grande (" + peso + " KB, massimo " + MAX_PDF_FILE_KB + " KB)"));
        String nome = testo(body.get("nome"), 150);
        synchronized (this) {
            List<Map<String, Object>> lista = leggi();
            Map<String, Object> q = lista.stream().filter(x -> id.equals(String.valueOf(x.get("id")))).findFirst().orElse(null);
            if (q == null) return ResponseEntity.status(404).body(Map.of("error", "Quotazione non trovata"));
            long usati = lista.stream().filter(x -> x != q).mapToLong(x -> kb(x.get("pdfKb"))).sum();
            if (usati + peso > MAX_PDF_TOTALE_KB)
                return ResponseEntity.status(409).body(Map.of("error", "Spazio per i PDF finito (" + usati / 1024 + " MB su " + MAX_PDF_TOTALE_KB / 1024 + " MB): libera spazio dall'archivio. I dati della quotazione sono salvati lo stesso.", "pieno", true));
            String key = q.get("pdfKey") != null ? String.valueOf(q.get("pdfKey"))
                : PREFISSO_PDF + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            try {
                ConsegneDataset d = repository.findById(key).orElseGet(() -> { ConsegneDataset n = new ConsegneDataset(); n.setTipo(key); return n; });
                d.setContenuto(Base64.getEncoder().encodeToString(pdf));
                d.setRighe(1);
                d.setAggiornatoAt(LocalDateTime.now(ITALIA));
                d.setAggiornatoDa((String) s.getAttribute("userFullName"));
                repository.save(d);
                q.put("pdfKey", key); q.put("pdfKb", peso); q.put("pdfNome", nome == null ? "quotazione.pdf" : nome);
                scrivi(lista, (String) s.getAttribute("userFullName"));
            } catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", "PDF non salvato: " + e.getMessage())); }
            return ResponseEntity.ok(Map.of("pdfKb", peso, "usatiKb", usati + peso));
        }
    }

    @GetMapping("/{id}/pdf")
    public ResponseEntity<?> apriPdf(@PathVariable String id, HttpSession s) {
        if (s.getAttribute("userId") == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!vede(s)) return ResponseEntity.status(403).body(Map.of("error", "Non hai il permesso per Quotazioni Rent"));
        Map<String, Object> q = leggi().stream().filter(x -> id.equals(String.valueOf(x.get("id")))).findFirst().orElse(null);
        if (q == null || q.get("pdfKey") == null) return ResponseEntity.status(404).body(Map.of("error", "PDF non conservato per questa quotazione"));
        Optional<ConsegneDataset> d = repository.findById(String.valueOf(q.get("pdfKey")));
        if (d.isEmpty() || d.get().getContenuto() == null) return ResponseEntity.status(404).body(Map.of("error", "PDF non trovato"));
        byte[] pdf = Base64.getDecoder().decode(d.get().getContenuto());
        String nome = String.valueOf(q.getOrDefault("pdfNome", "quotazione.pdf")).replaceAll("[^A-Za-z0-9._ -]", "_");
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + nome + "\"")
            .contentType(MediaType.APPLICATION_PDF)
            .body(pdf);
    }

    @DeleteMapping("/{id}/pdf")
    public ResponseEntity<?> togliPdfQuotazione(@PathVariable String id, HttpSession s) {
        if (s.getAttribute("userId") == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!modifica(s)) return ResponseEntity.status(403).body(Map.of("error", "Serve il permesso Completo su Quotazioni Rent"));
        synchronized (this) {
            List<Map<String, Object>> lista = leggi();
            for (Map<String, Object> q : lista) if (id.equals(String.valueOf(q.get("id"))) && q.get("pdfKey") != null) {
                togliPdf(String.valueOf(q.get("pdfKey")));
                q.remove("pdfKey"); q.remove("pdfKb"); q.remove("pdfNome");
                try { scrivi(lista, (String) s.getAttribute("userFullName")); }
                catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", e.getMessage())); }
                return ResponseEntity.ok(Map.of("tolto", true));
            }
        }
        return ResponseEntity.status(404).body(Map.of("error", "PDF non trovato"));
    }

    // Libera spazio: toglie i PDF delle quotazioni caricate prima di una data (i dati restano)
    @PostMapping("/pdf/pulizia")
    public ResponseEntity<?> pulisciPdf(@RequestBody Map<String, Object> body, HttpSession s) {
        if (s.getAttribute("userId") == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!modifica(s)) return ResponseEntity.status(403).body(Map.of("error", "Serve il permesso Completo su Quotazioni Rent"));
        String prima = testo(body.get("primaDel"), 10);
        if (prima == null || !prima.matches("\\d{4}-\\d{2}-\\d{2}")) return ResponseEntity.badRequest().body(Map.of("error", "Data non valida"));
        int tolti = 0; long liberati = 0;
        synchronized (this) {
            List<Map<String, Object>> lista = leggi();
            for (Map<String, Object> q : lista) {
                if (q.get("pdfKey") == null) continue;
                String quando = String.valueOf(q.getOrDefault("caricataIl", ""));
                if (quando.length() >= 10 && quando.substring(0, 10).compareTo(prima) < 0) {
                    togliPdf(String.valueOf(q.get("pdfKey")));
                    liberati += kb(q.get("pdfKb"));
                    q.remove("pdfKey"); q.remove("pdfKb"); q.remove("pdfNome");
                    tolti++;
                }
            }
            if (tolti > 0) {
                try { scrivi(lista, (String) s.getAttribute("userFullName")); }
                catch (Exception e) { return ResponseEntity.status(500).body(Map.of("error", e.getMessage())); }
            }
        }
        return ResponseEntity.ok(Map.of("tolti", tolti, "liberatiKb", liberati));
    }
}
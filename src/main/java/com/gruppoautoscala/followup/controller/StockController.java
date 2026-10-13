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

import java.text.Normalizer;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * AREA STOCK (capitolo 02 della BI).
 *
 * Il file Excel dello stock viene letto e normalizzato NEL BROWSER (stock-home.js)
 * e arriva qui gia' come JSON (solo le colonne che servono).
 *
 * Salvataggio: tabella consegne_dataset (nessuna tabella nuova)
 *   "STOCK"          -> vetture attualmente in stock
 *   "STOCK_RIMOSSE"  -> vetture uscite dallo stock (non piu' presenti in un import), con motivo
 *   "STOCK_STORICO"  -> una fotografia per giorno: conteggi + cosa e' cambiato
 *
 *  GET  /api/stock/data            -> stock + rimosse + storico + permessi
 *  POST /api/stock/import          -> { rows: [...], file: "nome.xlsx" } AGGIORNA lo stock
 *  POST /api/stock/rimosse/motivo  -> { id, motivo } motivo di una vettura rimossa
 *
 * AGGIORNAMENTO (non piu' sostituzione) rispetto allo stock gia' caricato:
 *  - stessa vettura = stessa targa (o stesso telaio, anche solo le ultime cifre) E stesso marchio:
 *      si aggiornano SOLO km, prezzo al pubblico (listino), stato e sede (+ giorni in stock);
 *      tutto il resto resta come era. I campi che prima erano vuoti si completano.
 *      Ogni cambio finisce nella cronologia della vettura ("storia").
 *  - vettura nuova -> entra con tutti i dati del file ("entrataAt" = questo caricamento);
 *      se era tra le rimosse, torna nello stock ("Rientrata").
 *  - vettura non piu' nel file -> va tra le RIMOSSE con data di uscita, ultimo stato, ultima
 *      sede e un motivo proposto in automatico (Venduta / Prenotata / Da verificare),
 *      modificabile da chi ha il permesso completo.
 * Il primo caricamento in assoluto non segna nulla come "nuovo".
 *
 * Permessi: sezione STOCK (pagina Permessi). "Solo lettura" = vede,
 * "Completo" = importa e scrive i motivi.
 */
@RestController
@RequestMapping("/api/stock")
public class StockController {

    private static final String SECTION = "STOCK";
    private static final String CHIAVE = "STOCK";
    private static final String CHIAVE_RIMOSSE = "STOCK_RIMOSSE";
    private static final int MAX_RIGHE = 20000;
    private static final int MAX_RIMOSSE = 6000;
    private static final int MAX_STORIA = 40;
    private static final String CHIAVE_STORICO = "STOCK_STORICO";
    private static final int MAX_FOTO = 400;
    private static final ZoneId ROMA = ZoneId.of("Europe/Rome");
    private static final String[][] CAMPI_STORICO = { {"tipo", "tipo"}, {"stato", "stato"}, {"carburante", "carburante"}, {"marca", "marca"}, {"sede", "sede"} };
    // campi che si aggiornano sulle vetture gia' presenti
    private static final String[] CAMPI_AGGIORNATI = {"km", "listino", "stato", "sede"};
    // campi tolti dalle rimosse per non appesantire il salvataggio
    private static final String[] CAMPI_PESANTI = {"optionals"};

    @Autowired
    private ConsegneDatasetRepository repository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RolePermissionService rolePermissionService;

    private String access(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return null;
        return rolePermissionService.getEffectiveAccess(userId, role, SECTION);
    }
    private boolean puoVedere(String access) { return access != null && rolePermissionService.hasAtLeast(access, "READ_ONLY"); }
    private boolean puoModificare(String access) { return access != null && rolePermissionService.hasAtLeast(access, "FULL"); }
    private ResponseEntity<?> negato(String access) {
        return access == null ? ResponseEntity.status(401).body(Map.of("error", "Non autenticato"))
                              : ResponseEntity.status(403).body(Map.of("error", "Non hai il permesso per l'area Stock"));
    }

    @GetMapping("/data")
    public ResponseEntity<?> getData(HttpSession session) {
        String acc = access(session);
        if (!puoVedere(acc)) return negato(acc);
        try {
            return ResponseEntity.ok(buildData(acc, null));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Lettura dello stock non riuscita: " + e.getMessage()));
        }
    }

    @PostMapping("/import")
    public synchronized ResponseEntity<?> importa(@RequestBody Map<String, Object> body, HttpSession session) {
        String acc = access(session);
        if (!puoModificare(acc)) return negato(acc);
        Long userId = (Long) session.getAttribute("userId");

        Object raw = body.get("rows");
        if (!(raw instanceof List<?> lista) || lista.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Il file non contiene vetture"));
        }
        if (lista.size() > MAX_RIGHE) {
            return ResponseEntity.badRequest().body(Map.of("error", "Troppe righe nel file (" + lista.size() + ")"));
        }
        List<Map<String, Object>> nuove = new ArrayList<>();
        for (Object o : lista) {
            if (!(o instanceof Map<?, ?> m) || m.get("marca") == null || m.get("modello") == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Formato dello stock non valido (manca marca o modello)"));
            }
            Map<String, Object> r = new LinkedHashMap<>();
            m.forEach((k, v) -> r.put(String.valueOf(k), v));
            nuove.add(r);
        }
        try {
            LocalDateTime adesso = LocalDateTime.now(ROMA);
            String importAt = iso(adesso);
            String chi = nomeUtente(userId);
            String file = body.get("file") == null ? "" : String.valueOf(body.get("file"));

            ConsegneDataset d = repository.findById(CHIAVE).orElseGet(() -> {
                ConsegneDataset n = new ConsegneDataset();
                n.setTipo(CHIAVE);
                return n;
            });
            List<Map<String, Object>> prima = leggiLista(d);
            ConsegneDataset dr = repository.findById(CHIAVE_RIMOSSE).orElseGet(() -> {
                ConsegneDataset n = new ConsegneDataset();
                n.setTipo(CHIAVE_RIMOSSE);
                return n;
            });
            List<Map<String, Object>> rimosse = leggiLista(dr);

            Map<String, Object> esito = new LinkedHashMap<>();
            List<Map<String, Object>> stock = unisci(prima, nuove, rimosse, importAt, adesso.toLocalDate(), esito);
            esito.put("file", file);

            d.setContenuto(objectMapper.writeValueAsString(stock));
            d.setRighe(stock.size());
            d.setAggiornatoAt(adesso);
            d.setAggiornatoDa(chi);
            repository.save(d);

            while (rimosse.size() > MAX_RIMOSSE) rimosse.remove(rimosse.size() - 1);
            dr.setContenuto(objectMapper.writeValueAsString(rimosse));
            dr.setRighe(rimosse.size());
            dr.setAggiornatoAt(adesso);
            dr.setAggiornatoDa(chi);
            repository.save(dr);

            aggiungiAlloStorico(stock, adesso, chi, esito);
            return ResponseEntity.ok(buildData(acc, esito));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Salvataggio dello stock non riuscito: " + e.getMessage()));
        }
    }

    // Motivo di uscita di una vettura rimossa (scritto a mano)
    @PostMapping("/rimosse/motivo")
    public synchronized ResponseEntity<?> motivo(@RequestBody Map<String, Object> body, HttpSession session) {
        String acc = access(session);
        if (!puoModificare(acc)) return negato(acc);
        Long userId = (Long) session.getAttribute("userId");
        String id = body.get("id") == null ? "" : String.valueOf(body.get("id"));
        String motivo = body.get("motivo") == null ? "" : String.valueOf(body.get("motivo")).trim();
        if (id.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "Vettura non indicata"));
        if (motivo.length() > 300) motivo = motivo.substring(0, 300);
        try {
            ConsegneDataset dr = repository.findById(CHIAVE_RIMOSSE).orElse(null);
            List<Map<String, Object>> rimosse = leggiLista(dr);
            Map<String, Object> r = rimosse.stream().filter(x -> id.equals(String.valueOf(x.get("rid")))).findFirst().orElse(null);
            if (r == null) return ResponseEntity.status(404).body(Map.of("error", "Vettura rimossa non trovata"));
            if (motivo.isEmpty()) {          // vuoto = torna il motivo automatico
                r.put("motivo", motivoAuto(str(r.get("ultimoStato"))));
                r.put("motivoAuto", true);
                r.remove("motivoDa"); r.remove("motivoAt");
            } else {
                r.put("motivo", motivo);
                r.put("motivoAuto", false);
                r.put("motivoDa", nomeUtente(userId));
                r.put("motivoAt", iso(LocalDateTime.now(ROMA)));
            }
            dr.setContenuto(objectMapper.writeValueAsString(rimosse));
            repository.save(dr);
            return ResponseEntity.ok(Map.of("rimossa", r));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Motivo non salvato: " + e.getMessage()));
        }
    }

    /* ================= aggiornamento dello stock ================= */

    private List<Map<String, Object>> unisci(List<Map<String, Object>> prima, List<Map<String, Object>> nuove,
                                            List<Map<String, Object>> rimosse, String importAt, LocalDate oggi,
                                            Map<String, Object> esito) {
        String giorno = oggi.toString();
        boolean primoCaricamento = prima.isEmpty();
        Map<String, Integer> cambi = new LinkedHashMap<>();
        for (String c : CAMPI_AGGIORNATI) cambi.put(c, 0);
        int confermate = 0, entrate = 0, rientrate = 0, aggiornate = 0;

        Set<Map<String, Object>> usate = Collections.newSetFromMap(new IdentityHashMap<>());
        Map<String, Map<String, Object>> perTarga = new HashMap<>(), perTelaio = new HashMap<>(), perAltro = new HashMap<>();
        for (Map<String, Object> p : prima) indicizza(p, perTarga, perTelaio, perAltro);

        List<Map<String, Object>> stock = new ArrayList<>();
        for (Map<String, Object> n : nuove) {
            Map<String, Object> p = trova(n, prima, perTarga, perTelaio, perAltro, usate);
            if (p != null) {
                usate.add(p);
                confermate++;
                Map<String, Object> out = new LinkedHashMap<>(p);
                List<Map<String, Object>> storia = storia(out);
                boolean cambiata = false;
                for (String c : CAMPI_AGGIORNATI) {
                    Object nv = n.get(c), pv = p.get(c);
                    if (vuoto(nv)) continue;                     // nel nuovo file manca: resta il vecchio
                    if (!uguale(nv, pv)) {
                        out.put(c, nv);
                        Map<String, Object> s = new LinkedHashMap<>();
                        s.put("at", giorno); s.put("c", c); s.put("da", pv); s.put("a", nv);
                        storia.add(s);
                        cambi.merge(c, 1, Integer::sum);
                        cambiata = true;
                    }
                }
                // giorni in stock: sempre quelli del nuovo file (o ricalcolati dalla data di ingresso)
                if (!vuoto(n.get("giorni"))) out.put("giorni", n.get("giorni"));
                else ricalcolaGiorni(out, oggi);
                // campi vuoti prima e presenti ora (es. cliente e prezzo di vendita dopo la vendita)
                for (Map.Entry<String, Object> e : n.entrySet()) {
                    if (!vuoto(e.getValue()) && vuoto(out.get(e.getKey()))) out.put(e.getKey(), e.getValue());
                }
                if (cambiata) { aggiornate++; out.put("aggiornataAt", importAt); }
                taglia(storia);
                if (!storia.isEmpty()) out.put("storia", storia);
                stock.add(out);
            } else {
                Map<String, Object> out = new LinkedHashMap<>(n);
                Map<String, Object> rim = primoCaricamento ? null : trovaRimossa(n, rimosse);
                List<Map<String, Object>> storia = new ArrayList<>();
                if (rim != null) {
                    rimosse.remove(rim);
                    storia.addAll(storia(rim));
                    Map<String, Object> s = new LinkedHashMap<>();
                    s.put("at", giorno); s.put("c", "rientro"); s.put("da", rim.get("rimossaAt")); s.put("a", null);
                    storia.add(s);
                    out.put("rientrata", true);
                    rientrate++;
                }
                if (!primoCaricamento) {
                    out.put("entrataAt", importAt);
                    entrate++;
                    if (rim == null) {
                        Map<String, Object> s = new LinkedHashMap<>();
                        s.put("at", giorno); s.put("c", "entrata"); s.put("da", null); s.put("a", null);
                        storia.add(s);
                    }
                }
                taglia(storia);
                if (!storia.isEmpty()) out.put("storia", storia);
                stock.add(out);
            }
        }
        // vetture dello stock precedente che non ci sono piu': tra le rimosse
        int uscite = 0;
        List<Map<String, Object>> nuoveRimosse = new ArrayList<>();
        for (Map<String, Object> p : prima) {
            if (usate.contains(p)) continue;
            uscite++;
            Map<String, Object> r = new LinkedHashMap<>(p);
            for (String c : CAMPI_PESANTI) r.remove(c);
            String stato = str(p.get("stato"));
            r.put("rid", chiave(p) + "@" + importAt);
            r.put("rimossaAt", importAt);
            r.put("ultimoStato", stato);
            r.put("ultimaSede", p.get("sede"));
            r.put("motivo", motivoAuto(stato));
            r.put("motivoAuto", true);
            List<Map<String, Object>> storia = storia(r);
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("at", giorno); s.put("c", "uscita"); s.put("da", stato); s.put("a", null);
            storia.add(s);
            taglia(storia);
            r.put("storia", storia);
            nuoveRimosse.add(r);
        }
        rimosse.addAll(0, nuoveRimosse);

        esito.put("at", importAt);
        esito.put("primo", primoCaricamento);
        esito.put("totale", stock.size());
        esito.put("prima", prima.size());
        esito.put("confermate", confermate);
        esito.put("aggiornate", aggiornate);
        esito.put("entrate", entrate);
        esito.put("rientrate", rientrate);
        esito.put("rimosse", uscite);
        esito.put("cambi", cambi);
        return stock;
    }

    private static String motivoAuto(String stato) {
        if ("Venduta".equalsIgnoreCase(stato)) return "Venduta · uscita dallo stock";
        if ("Prenotata".equalsIgnoreCase(stato)) return "Era prenotata · da verificare";
        return "Da verificare";
    }

    // chiavi di confronto: targa, telaio (completo), altrimenti marca+modello+versione+colore
    private static String nk(Object o) { return o == null ? "" : String.valueOf(o).toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", ""); }
    private static String marcaKey(Object o) {
        if (o == null) return "";
        return Normalizer.normalize(String.valueOf(o), Normalizer.Form.NFKD).replaceAll("\\p{M}", "").toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
    }
    private static String altroKey(Map<String, Object> r) {
        return marcaKey(r.get("marca")) + "|" + nk(r.get("modello")) + "|" + nk(r.get("versione")) + "|" + nk(r.get("colore"));
    }
    private static String chiave(Map<String, Object> r) {
        String t = nk(r.get("targa")), v = nk(r.get("telaio"));
        return !t.isEmpty() ? "T" + t : !v.isEmpty() ? "V" + v : "A" + altroKey(r);
    }
    private static void indicizza(Map<String, Object> p, Map<String, Map<String, Object>> perTarga,
                                  Map<String, Map<String, Object>> perTelaio, Map<String, Map<String, Object>> perAltro) {
        String t = nk(p.get("targa")), v = nk(p.get("telaio"));
        if (!t.isEmpty()) perTarga.putIfAbsent(t, p);
        if (!v.isEmpty()) perTelaio.putIfAbsent(v, p);
        if (t.isEmpty() && v.isEmpty()) perAltro.putIfAbsent(altroKey(p), p);
    }
    private static boolean stessoVeicolo(Map<String, Object> a, Map<String, Object> b) {
        String x = marcaKey(a.get("marca")), y = marcaKey(b.get("marca"));
        return x.isEmpty() || y.isEmpty() || x.equals(y) || x.startsWith(y) || y.startsWith(x);
    }
    private static Map<String, Object> trova(Map<String, Object> n, List<Map<String, Object>> prima,
                                             Map<String, Map<String, Object>> perTarga, Map<String, Map<String, Object>> perTelaio,
                                             Map<String, Map<String, Object>> perAltro, Set<Map<String, Object>> usate) {
        String t = nk(n.get("targa")), v = nk(n.get("telaio"));
        Map<String, Object> p = !t.isEmpty() ? perTarga.get(t) : null;
        if (ok(p, n, usate)) return p;
        p = !v.isEmpty() ? perTelaio.get(v) : null;
        if (ok(p, n, usate)) return p;
        // telaio scritto solo in parte (es. le ultime 7 cifre)
        if (v.length() >= 6) {
            for (Map<String, Object> q : prima) {
                String w = nk(q.get("telaio"));
                if (w.length() >= 6 && (w.endsWith(v) || v.endsWith(w)) && ok(q, n, usate)) return q;
            }
        }
        if (t.isEmpty() && v.isEmpty()) {
            p = perAltro.get(altroKey(n));
            if (ok(p, n, usate)) return p;
        }
        return null;
    }
    private static boolean ok(Map<String, Object> p, Map<String, Object> n, Set<Map<String, Object>> usate) {
        return p != null && !usate.contains(p) && stessoVeicolo(p, n);
    }
    private static Map<String, Object> trovaRimossa(Map<String, Object> n, List<Map<String, Object>> rimosse) {
        String t = nk(n.get("targa")), v = nk(n.get("telaio"));
        for (Map<String, Object> r : rimosse) {
            if (!stessoVeicolo(r, n)) continue;
            String rt = nk(r.get("targa")), rv = nk(r.get("telaio"));
            if (!t.isEmpty() && t.equals(rt)) return r;
            if (!v.isEmpty() && !rv.isEmpty() && (v.equals(rv) || (v.length() >= 6 && rv.length() >= 6 && (v.endsWith(rv) || rv.endsWith(v))))) return r;
            if (t.isEmpty() && v.isEmpty() && rt.isEmpty() && rv.isEmpty() && altroKey(n).equals(altroKey(r))) return r;
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> storia(Map<String, Object> r) {
        Object s = r.get("storia");
        List<Map<String, Object>> out = new ArrayList<>();
        if (s instanceof List<?> l) for (Object o : l) if (o instanceof Map<?, ?> m) out.add((Map<String, Object>) m);
        return out;
    }
    private static void taglia(List<Map<String, Object>> storia) { while (storia.size() > MAX_STORIA) storia.remove(0); }
    private static boolean vuoto(Object o) { return o == null || String.valueOf(o).isBlank(); }
    private static String str(Object o) { return o == null ? "" : String.valueOf(o); }
    private static boolean uguale(Object a, Object b) {
        if (a == null || b == null) return a == b;
        if (a instanceof Number x && b instanceof Number y) return Math.abs(x.doubleValue() - y.doubleValue()) < 0.005;
        return String.valueOf(a).trim().equalsIgnoreCase(String.valueOf(b).trim());
    }
    private static void ricalcolaGiorni(Map<String, Object> r, LocalDate oggi) {
        try {
            LocalDate dal = LocalDate.parse(str(r.get("inizio")).substring(0, 10));
            long g = ChronoUnit.DAYS.between(dal, oggi);
            if (g >= 0) r.put("giorni", g);
        } catch (Exception e) { /* data non leggibile: i giorni restano quelli di prima */ }
    }
    private static String iso(LocalDateTime t) { return t.atZone(ROMA).toOffsetDateTime().toString(); }

    private List<Map<String, Object>> leggiLista(ConsegneDataset d) {
        if (d == null || d.getContenuto() == null || d.getContenuto().isBlank()) return new ArrayList<>();
        try { return new ArrayList<>(objectMapper.readValue(d.getContenuto(), new TypeReference<List<Map<String, Object>>>() {})); }
        catch (Exception e) { return new ArrayList<>(); }
    }

    private Map<String, Object> buildData(String acc, Map<String, Object> esito) throws Exception {
        Map<String, Object> out = new HashMap<>();
        Optional<ConsegneDataset> d = repository.findById(CHIAVE);
        if (d.isPresent() && d.get().getContenuto() != null) {
            ConsegneDataset ds = d.get();
            Map<String, Object> s = new HashMap<>();
            s.put("rows", objectMapper.readValue(ds.getContenuto(), new TypeReference<List<Map<String, Object>>>() {}));
            s.put("righe", ds.getRighe());
            // stessa forma usata da Consegne: data/ora in ISO con il fuso di Roma
            s.put("aggiornatoAt", ds.getAggiornatoAt() == null ? null : iso(ds.getAggiornatoAt()));
            s.put("aggiornatoDa", ds.getAggiornatoDa());
            out.put("stock", s);
        } else {
            out.put("stock", null);
        }
        out.put("rimosse", leggiLista(repository.findById(CHIAVE_RIMOSSE).orElse(null)));
        out.put("storico", leggiStorico(d.orElse(null)));
        if (esito != null) out.put("esitoImport", esito);
        out.put("puoImportare", puoModificare(acc));
        out.put("puoModificare", puoModificare(acc));
        return out;
    }

    /* ================= storico degli import ================= */

    // Conteggi di una fotografia: per ogni campo, valore -> numero di vetture
    private Map<String, Object> riassunto(List<?> righe, LocalDateTime at, String chi) {
        Map<String, Object> foto = new LinkedHashMap<>();
        foto.put("at", at == null ? null : iso(at));
        foto.put("da", chi);
        foto.put("totale", righe.size());
        for (String[] c : CAMPI_STORICO) {
            Map<String, Integer> m = new TreeMap<>();
            for (Object o : righe) {
                Object v = (o instanceof Map<?, ?> r) ? r.get(c[1]) : null;
                String k = (v == null || String.valueOf(v).isBlank()) ? ("carburante".equals(c[0]) ? "__none" : "—") : String.valueOf(v);
                m.merge(k, 1, Integer::sum);
            }
            foto.put(c[0], m);
        }
        // fasce di giacenza (giorni in stock al momento dell'import)
        Map<String, Integer> giac = new LinkedHashMap<>();
        for (Object o : righe) {
            Object g = (o instanceof Map<?, ?> r) ? r.get("giorni") : null;
            String k = "nd";
            if (g instanceof Number n) {
                double dd = n.doubleValue();
                k = dd <= 30 ? "0-30" : dd <= 60 ? "31-60" : dd <= 90 ? "61-90" : dd <= 180 ? "91-180" : dd <= 365 ? "181-365" : "365+";
            }
            giac.merge(k, 1, Integer::sum);
        }
        foto.put("giac", giac);
        return foto;
    }

    private List<Map<String, Object>> caricaStorico() {
        try {
            Optional<ConsegneDataset> h = repository.findById(CHIAVE_STORICO);
            if (h.isPresent() && h.get().getContenuto() != null) {
                return new ArrayList<>(objectMapper.readValue(h.get().getContenuto(), new TypeReference<List<Map<String, Object>>>() {}));
            }
        } catch (Exception e) { /* storico illeggibile: si riparte da vuoto */ }
        return new ArrayList<>();
    }

    private void salvaStorico(List<Map<String, Object>> storico) throws Exception {
        ConsegneDataset h = repository.findById(CHIAVE_STORICO).orElseGet(() -> {
            ConsegneDataset n = new ConsegneDataset();
            n.setTipo(CHIAVE_STORICO);
            return n;
        });
        h.setContenuto(objectMapper.writeValueAsString(storico));
        h.setRighe(storico.size());
        h.setAggiornatoAt(LocalDateTime.now(ROMA));
        repository.save(h);
    }

    // Una fotografia per giorno: se oggi c'e' gia' un import, i conteggi vengono sostituiti
    // e i movimenti (entrate, rimosse, cambi) si SOMMANO a quelli gia' fatti oggi.
    @SuppressWarnings("unchecked")
    private void aggiungiAlloStorico(List<?> righe, LocalDateTime at, String chi, Map<String, Object> esito) {
        try {
            List<Map<String, Object>> storico = caricaStorico();
            Map<String, Object> foto = riassunto(righe, at, chi);
            String giorno = String.valueOf(foto.get("at")).substring(0, 10);
            Map<String, Object> stessoGiorno = storico.stream().filter(f -> String.valueOf(f.get("at")).startsWith(giorno)).findFirst().orElse(null);
            if (esito != null && !Boolean.TRUE.equals(esito.get("primo"))) {
                Map<String, Object> mov = new LinkedHashMap<>();
                for (String k : List.of("entrate", "rientrate", "rimosse", "aggiornate", "confermate")) mov.put(k, esito.get(k));
                mov.put("cambi", esito.get("cambi"));
                if (stessoGiorno != null && stessoGiorno.get("mov") instanceof Map<?, ?> vecchio) {
                    for (String k : List.of("entrate", "rientrate", "rimosse", "aggiornate")) mov.put(k, num(vecchio.get(k)) + num(mov.get(k)));
                    if (vecchio.get("cambi") instanceof Map<?, ?> vc && mov.get("cambi") instanceof Map<?, ?> nc) {
                        Map<String, Object> somma = new LinkedHashMap<>();
                        for (String c : CAMPI_AGGIORNATI) somma.put(c, num(vc.get(c)) + num(nc.get(c)));
                        mov.put("cambi", somma);
                    }
                    mov.put("caricamenti", num(vecchio.get("caricamenti")) + 1);
                } else mov.put("caricamenti", 1);
                foto.put("mov", mov);
            } else if (stessoGiorno != null && stessoGiorno.get("mov") != null) foto.put("mov", stessoGiorno.get("mov"));
            if (esito != null && esito.get("file") != null) foto.put("file", esito.get("file"));
            storico.removeIf(f -> String.valueOf(f.get("at")).startsWith(giorno));
            storico.add(foto);
            storico.sort(Comparator.comparing(f -> String.valueOf(f.get("at"))));
            while (storico.size() > MAX_FOTO) storico.remove(0);
            salvaStorico(storico);
        } catch (Exception e) { /* lo storico non deve mai bloccare l'import */ }
    }
    private static long num(Object o) { return o instanceof Number n ? n.longValue() : 0; }

    // Se lo storico e' vuoto ma c'e' gia' uno stock caricato (import fatti prima
    // di questa funzione), quello diventa la prima fotografia.
    private List<Map<String, Object>> leggiStorico(ConsegneDataset attuale) {
        List<Map<String, Object>> storico = caricaStorico();
        if (storico.isEmpty() && attuale != null && attuale.getContenuto() != null) {
            try {
                List<?> righe = objectMapper.readValue(attuale.getContenuto(), new TypeReference<List<Map<String, Object>>>() {});
                storico.add(riassunto(righe, attuale.getAggiornatoAt(), attuale.getAggiornatoDa()));
                salvaStorico(storico);
            } catch (Exception e) { /* nessuno storico */ }
        }
        return storico;
    }

    private String nomeUtente(Long userId) {
        return userRepository.findById(userId)
                .map(User::getFullName)
                .filter(n -> n != null && !n.isBlank())
                .orElse("Utente " + userId);
    }
}
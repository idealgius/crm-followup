package com.gruppoautoscala.followup.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruppoautoscala.followup.model.ConsegneDataset;
import com.gruppoautoscala.followup.model.NoleggioTrattativa;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.ConsegneDatasetRepository;
import com.gruppoautoscala.followup.repository.NoleggioTrattativaRepository;
import com.gruppoautoscala.followup.repository.UserRepository;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// =====================================================================
// IMPORT DAL GESTIONALE IN RENT (file "trattative" e file "lead")
// ---------------------------------------------------------------------
// Molte trattative Rent risultano "da gestire" o con il richiamo scaduto
// anche se nel gestionale sono gia' state lavorate. Si caricano i due
// export del gestionale (trattative + lead) e, per NUMERO DI TELEFONO
// (ultime 9 cifre, come il collegamento con i Preventivi telefonici;
// in mancanza per e-mail), ogni trattativa Rent viene allineata:
//
//   Trattativa Chiusa                    -> CONCLUSA
//   Trattativa Fallita / Lead Fallito    -> FALLITO (con il motivo)
//   Trattativa In corso + ricontatto futuro -> DA_RICHIAMARE (quella data)
//   Trattativa In corso                  -> TRATTATIVA_IN_CORSO
//   Lead In corso (senza trattativa)     -> DA_RICHIAMARE (data ricontatto
//                                           del lead, altrimenti oggi)
//   Lead "Generata trattativa (...)"     -> come la trattativa generata
//
// Se per lo stesso numero ci sono sia trattativa che lead vale la
// TRATTATIVA (e' piu' avanti); tra piu' righe dello stesso tipo, la piu'
// recente. La trattativa viene anche segnata come GESTITA (dal venditore
// del gestionale se e' un utente del CRM, altrimenti da chi importa).
//
// Note del gestionale: se la trattativa Rent non ha note diventano la sua
// nota; se ne ha gia', restano a parte in "Note dal gestionale"
// (consegne_dataset, chiave RENT_NOTE_GESTIONALE: nessuna colonna nuova).
//
// Prima si guarda l'anteprima (nulla viene salvato), poi si applicano
// solo le righe scelte. Le persone dei file che non sono in Rent si
// elencano e, se spuntate, vengono create.
// =====================================================================
@Service
public class RentImportService {

    private static final ZoneId ZONA = ZoneId.of("Europe/Rome");
    public static final String NOTE_KEY = "RENT_NOTE_GESTIONALE";
    private static final Pattern DATA = Pattern.compile("(\\d{1,2})/(\\d{1,2})/(\\d{2,4})");

    @Autowired private NoleggioTrattativaRepository trattativaRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private ConsegneDatasetRepository datasetRepository;
    @Autowired private ObjectMapper objectMapper;

    // ---------------- una riga dei file del gestionale ----------------
    public static class Fonte {
        String tipo;            // "T" trattativa, "L" lead
        String id;
        LocalDate data;
        String statoGest;       // com'e' scritto nel gestionale
        String statoRent;       // dove va in Rent (null = non si sa)
        LocalDate dataRichiamo; // solo per DA_RICHIAMARE
        String motivo;
        String venditore;
        String nome, cognome, ragione;
        List<String> telefoni = new ArrayList<>();
        String telefonoGrezzo;
        String email;
        String marca, modello;
        String note;
        String etichetta;
        String origine;
        String tipoCliente;
    }

    // ================= lettura dei due file =================
    public List<Fonte> leggi(List<MultipartFile> files) throws IOException {
        List<Fonte> out = new ArrayList<>();
        for (MultipartFile f : files) {
            if (f == null || f.isEmpty()) continue;
            List<CSVRecord> righe = righe(f);
            if (righe.isEmpty()) continue;
            CSVRecord r0 = righe.get(0);
            boolean trattative = r0.isMapped("ID Trattativa") && r0.isMapped("Stato trattativa");
            boolean lead = r0.isMapped("Codice Lead") || (r0.isMapped("Status") && r0.isMapped("Telefono 1"));
            if (!trattative && !lead) {
                throw new IOException("Il file \"" + f.getOriginalFilename() + "\" non sembra un export di trattative o lead del gestionale");
            }
            for (CSVRecord r : righe) {
                Fonte x = trattative ? daTrattativa(r) : daLead(r);
                if (x != null) out.add(x);
            }
        }
        return out;
    }

    private List<CSVRecord> righe(MultipartFile file) throws IOException {
        String s = new String(file.getBytes(), StandardCharsets.UTF_8);
        // gli export del gestionale a volte iniziano con una riga vuota e il BOM dopo
        s = s.replaceFirst("^[\\s\\uFEFF]+", "");
        CSVFormat format = CSVFormat.DEFAULT.builder()
            .setDelimiter(';').setHeader().setSkipHeaderRecord(true)
            .setIgnoreEmptyLines(true).setTrim(true).setQuote('"').build();
        try (CSVParser p = new CSVParser(new StringReader(s), format)) {
            return p.getRecords();
        }
    }

    private Fonte daTrattativa(CSVRecord r) {
        Fonte x = new Fonte();
        x.tipo = "T";
        x.id = get(r, "ID Trattativa");
        if (blank(x.id)) return null;
        x.data = data(get(r, "Data trattativa"));
        x.statoGest = get(r, "Stato trattativa");
        x.motivo = get(r, "Motivo fallimento");
        x.venditore = get(r, "Venditore");
        x.nome = get(r, "Nome cliente");
        x.cognome = get(r, "Cognome Cliente");
        x.ragione = get(r, "Rag. Sociale Cliente");
        tel(x, get(r, "Tel.1 Cliente"));
        tel(x, get(r, "Tel.2 Cliente"));
        x.email = low(get(r, "Email1 Cliente"));
        x.marca = get(r, "Marca");
        x.modello = get(r, "Modello");
        x.note = unisci(get(r, "Note Trattativa"), get(r, "Note Cliente"));
        x.etichetta = get(r, "Etichetta");
        x.origine = get(r, "Origine Trattativa");
        String tc = get(r, "Tipo cliente");
        x.tipoCliente = tc == null ? null : tc.toLowerCase().startsWith("soc") ? "Noleggio per aziende" : "Privato";

        LocalDate oggi = LocalDate.now(ZONA);
        LocalDate ric = data(get(r, "Data ricontatto"));
        String st = x.statoGest == null ? "" : x.statoGest.trim().toLowerCase();
        if (st.startsWith("chius")) x.statoRent = "CONCLUSA";
        else if (st.startsWith("fallit")) x.statoRent = "FALLITO";
        else if (st.startsWith("in corso")) {
            if (ric != null && !ric.isBefore(oggi)) { x.statoRent = "DA_RICHIAMARE"; x.dataRichiamo = ric; }
            else x.statoRent = "TRATTATIVA_IN_CORSO";
        }
        return x;
    }

    private Fonte daLead(CSVRecord r) {
        Fonte x = new Fonte();
        x.tipo = "L";
        x.id = get(r, "ID");
        if (blank(x.id)) return null;
        x.data = data(get(r, "Data inserimento"));
        if (x.data == null) x.data = data(get(r, "Data lead"));
        x.statoGest = get(r, "Status");
        x.motivo = get(r, "Motivo fallimento");
        x.venditore = get(r, "Venditore");
        x.nome = get(r, "Nome");
        x.cognome = get(r, "Cognome");
        x.ragione = get(r, "Ragione sociale");
        tel(x, get(r, "Telefono 1"));
        tel(x, get(r, "Telefono 2"));
        x.email = low(get(r, "E-mail 1"));
        x.marca = get(r, "Marca");
        x.modello = get(r, "Modello");
        x.note = get(r, "Note");
        x.etichetta = get(r, "Etichette Lead");
        x.origine = get(r, "Origine");
        String tc = get(r, "Tipo cliente");
        x.tipoCliente = tc == null ? null : tc.toLowerCase().startsWith("priv") ? "Privato" : "Noleggio per aziende";

        String st = x.statoGest == null ? "" : x.statoGest.trim().toLowerCase();
        LocalDate ric = data(get(r, "Data ricontatto"));
        if (st.startsWith("generata trattativa")) {
            if (st.contains("chius")) x.statoRent = "CONCLUSA";
            else if (st.contains("fallit")) x.statoRent = "FALLITO";
            else x.statoRent = "TRATTATIVA_IN_CORSO";
        } else if (st.startsWith("fallit")) x.statoRent = "FALLITO";
        else if (st.startsWith("in corso")) {
            x.statoRent = "DA_RICHIAMARE";
            x.dataRichiamo = ric != null ? ric : LocalDate.now(ZONA);
        }
        return x;
    }

    // ================= confronto =================
    private static class Confronto {
        List<Fonte> fonti;
        Map<String, Fonte> perTel = new HashMap<>(), perMail = new HashMap<>();
        Map<Long, Fonte> abbinata = new LinkedHashMap<>();          // id trattativa Rent -> riga scelta
        List<NoleggioTrattativa> nonNeiFile = new ArrayList<>();
        Map<String, Fonte> nuove = new LinkedHashMap<>();            // chiave persona -> riga
        int righeT, righeL;
    }

    // la riga che vale per una persona: prima la trattativa, poi la piu' recente
    private static boolean meglio(Fonte a, Fonte b) {
        if (b == null) return true;
        if (!a.tipo.equals(b.tipo)) return "T".equals(a.tipo);
        if (a.data != null && b.data != null && !a.data.equals(b.data)) return a.data.isAfter(b.data);
        if (a.data != null && b.data == null) return true;
        try { return Long.parseLong(a.id) > Long.parseLong(b.id); } catch (NumberFormatException e) { return false; }
    }

    private Confronto confronta(List<MultipartFile> files) throws IOException {
        Confronto c = new Confronto();
        c.fonti = leggi(files);
        for (Fonte f : c.fonti) {
            if ("T".equals(f.tipo)) c.righeT++; else c.righeL++;
            if (f.statoRent == null) continue;
            for (String t : f.telefoni) if (meglio(f, c.perTel.get(t))) c.perTel.put(t, f);
            if (!blank(f.email) && meglio(f, c.perMail.get(f.email))) c.perMail.put(f.email, f);
        }
        Set<String> telUsati = new HashSet<>(), mailUsate = new HashSet<>();
        for (NoleggioTrattativa t : trattativaRepository.findAll()) {
            String tel = normTel(t.getCellulare());
            String mail = low(t.getEmail());
            Fonte f = !tel.isEmpty() ? c.perTel.get(tel) : null;
            if (f == null && !blank(mail)) f = c.perMail.get(mail);
            if (f == null) { c.nonNeiFile.add(t); continue; }
            c.abbinata.put(t.getId(), f);
            if (!tel.isEmpty()) telUsati.add(tel);
            if (!blank(mail)) mailUsate.add(mail);
        }
        // persone dei file che in Rent non ci sono (una riga per persona)
        Set<Fonte> viste = Collections.newSetFromMap(new IdentityHashMap<>());
        for (Fonte f : c.perTel.values()) {
            if (viste.contains(f)) continue;
            boolean usata = f.telefoni.stream().anyMatch(telUsati::contains) || (!blank(f.email) && mailUsate.contains(f.email));
            if (usata) { viste.add(f); continue; }
            // la stessa persona puo' avere piu' numeri: resta la riga migliore
            String chiave = f.tipo + ":" + f.id;
            viste.add(f);
            c.nuove.putIfAbsent(chiave, f);
        }
        return c;
    }

    // ================= anteprima =================
    public Map<String, Object> anteprima(List<MultipartFile> files, User importer) throws IOException {
        Confronto c = confronta(files);
        Map<String, User> utenti = utentiPerNome();
        Map<String, Object> noteG = noteGestionale();
        List<Map<String, Object>> aggiorna = new ArrayList<>(), uguali = new ArrayList<>();
        Map<Long, NoleggioTrattativa> perId = new HashMap<>();
        for (NoleggioTrattativa t : trattativaRepository.findAll()) perId.put(t.getId(), t);

        for (Map.Entry<Long, Fonte> e : c.abbinata.entrySet()) {
            NoleggioTrattativa t = perId.get(e.getKey());
            Fonte f = e.getValue();
            Cambio ch = cambio(t, f, utenti, importer, noteG);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", t.getId());
            m.put("cliente", (nv(t.getNome()) + " " + nv(t.getCognome())).trim());
            m.put("cellulare", t.getCellulare());
            m.put("veicolo", (nv(t.getMarchio()) + " " + nv(t.getModello())).trim());
            m.put("statoPrima", t.getStato());
            m.put("dataPrima", t.getDataRichiamo() == null ? null : t.getDataRichiamo().toString());
            m.put("gestitaPrima", t.getGestitoDa() == null ? null : t.getGestitoDa().getFullName());
            m.put("gestitaPrimaId", t.getGestitoDa() == null ? null : t.getGestitoDa().getId());
            m.put("daGestirePrima", (t.getUser() == null || !"NOLEGGIO".equals(t.getUser().getRole())) && t.getGestitoDa() == null);
            m.put("statoDopo", ch.stato);
            m.put("dataDopo", ch.data == null ? null : ch.data.toString());
            m.put("gestitaDopo", ch.gestore == null ? null : ch.gestore.getFullName());
            m.put("gestitaDopoId", ch.gestore == null ? null : ch.gestore.getId());
            User vend = blank(f.venditore) ? null : utenti.get(chiaveNome(f.venditore));
            m.put("venditoreId", vend == null ? null : vend.getId());
            m.put("nota", ch.nota);             // null | "NOTA" (diventa la nota) | "SEZIONE" (note dal gestionale)
            m.put("fonte", fonteMap(f));
            (ch.cambia ? aggiorna : uguali).add(m);
        }
        aggiorna.sort(Comparator.comparing(m -> String.valueOf(m.get("cliente")).toLowerCase()));

        List<Map<String, Object>> nuove = new ArrayList<>();
        for (Map.Entry<String, Fonte> e : c.nuove.entrySet()) {
            Map<String, Object> m = fonteMap(e.getValue());
            m.put("chiave", e.getKey());
            User g = gestore(e.getValue(), utenti, importer);
            m.put("gestoreId", g == null ? null : g.getId());
            User vend = blank(e.getValue().venditore) ? null : utenti.get(chiaveNome(e.getValue().venditore));
            m.put("venditoreId", vend == null ? null : vend.getId());
            nuove.add(m);
        }
        // prima quelle ancora aperte, poi le piu' recenti
        nuove.sort((a, b) -> {
            int pa = ordineStato(String.valueOf(a.get("statoRent"))), pb = ordineStato(String.valueOf(b.get("statoRent")));
            if (pa != pb) return Integer.compare(pa, pb);
            return String.valueOf(b.get("data")).compareTo(String.valueOf(a.get("data")));
        });

        List<Map<String, Object>> fuori = new ArrayList<>();
        for (NoleggioTrattativa t : c.nonNeiFile) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", t.getId());
            m.put("cliente", (nv(t.getNome()) + " " + nv(t.getCognome())).trim());
            m.put("cellulare", t.getCellulare());
            m.put("stato", t.getStato());
            m.put("fonte", t.getFonte());
            fuori.add(m);
        }

        Map<String, Object> riep = new LinkedHashMap<>();
        riep.put("righeTrattative", c.righeT);
        riep.put("righeLead", c.righeL);
        riep.put("inRent", perId.size());
        riep.put("abbinate", c.abbinata.size());
        riep.put("daAggiornare", aggiorna.size());
        riep.put("giaAllineate", uguali.size());
        riep.put("nonInRent", nuove.size());
        riep.put("rentNonNeiFile", fuori.size());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("riepilogo", riep);
        out.put("aggiorna", aggiorna);
        out.put("giaAllineate", uguali);
        out.put("nonInRent", nuove);
        out.put("rentNonNeiFile", fuori);
        // chi si puo' scegliere come "gestita da": gli utenti che lavorano su Rent
        List<Map<String, Object>> ut = new ArrayList<>();
        for (User u : utentiRent()) {
            Map<String, Object> um = new LinkedHashMap<>();
            um.put("id", u.getId()); um.put("fullName", u.getFullName()); um.put("role", u.getRole());
            ut.add(um);
        }
        out.put("utenti", ut);
        return out;
    }

    private static int ordineStato(String s) {
        switch (s) { case "DA_RICHIAMARE": return 0; case "TRATTATIVA_IN_CORSO": return 1; case "CONCLUSA": return 2; default: return 3; }
    }

    private static class Cambio { String stato; LocalDate data; String noteFall; User gestore; String nota; boolean cambia; }

    private Cambio cambio(NoleggioTrattativa t, Fonte f, Map<String, User> utenti, User importer, Map<String, Object> noteG) {
        Cambio ch = new Cambio();
        ch.stato = f.statoRent;
        ch.data = "DA_RICHIAMARE".equals(f.statoRent) ? f.dataRichiamo : t.getDataRichiamo();
        ch.noteFall = "FALLITO".equals(f.statoRent) ? (blank(f.motivo) ? t.getNoteFallimento() : f.motivo) : null;
        ch.gestore = t.getGestitoDa() != null ? t.getGestitoDa() : gestore(f, utenti, importer);
        String nota = testoNota(f);
        if (!blank(nota)) {
            if (blank(t.getNote())) ch.nota = "NOTA";
            else if (!t.getNote().contains(nota.trim())) {
                Object gia = noteG.get(String.valueOf(t.getId()));
                String giaTesto = gia instanceof Map ? String.valueOf(((Map<?, ?>) gia).get("testo")) : null;
                if (!nota.equals(giaTesto)) ch.nota = "SEZIONE";
            }
        }
        boolean creatoDaNonNoleggio = t.getUser() == null || !"NOLEGGIO".equals(t.getUser().getRole());
        ch.cambia = !Objects.equals(ch.stato, t.getStato())
            || ("DA_RICHIAMARE".equals(ch.stato) && !Objects.equals(ch.data, t.getDataRichiamo()))
            || ("FALLITO".equals(ch.stato) && !blank(f.motivo) && !Objects.equals(ch.noteFall, t.getNoteFallimento()))
            || (creatoDaNonNoleggio && t.getGestitoDa() == null)
            || ch.nota != null;
        return ch;
    }

    private User gestore(Fonte f, Map<String, User> utenti, User importer) {
        User u = blank(f.venditore) ? null : utenti.get(chiaveNome(f.venditore));
        return u != null ? u : importer;
    }

    private static String testoNota(Fonte f) {
        String n = nv(f.note).trim();
        if (n.isEmpty()) return null;
        String et = blank(f.etichetta) ? "" : " [" + f.etichetta.trim() + "]";
        return n + et;
    }

    // ================= applicazione =================
    public Map<String, Object> applica(List<MultipartFile> files, User importer, Set<Long> daAggiornare, Set<String> daCreare) throws IOException {
        return applica(files, importer, daAggiornare, daCreare, Map.of(), Map.of());
    }

    // gestoriAgg: id trattativa -> id utente "gestita da" scelto a mano
    // gestoriCrea: chiave persona nuova -> id utente scelto a mano
    public Map<String, Object> applica(List<MultipartFile> files, User importer, Set<Long> daAggiornare, Set<String> daCreare,
                                       Map<Long, Long> gestoriAgg, Map<String, Long> gestoriCrea) throws IOException {
        Map<Long, User> scelti = new HashMap<>();
        for (User u : utentiRent()) scelti.put(u.getId(), u);
        Confronto c = confronta(files);
        Map<String, User> utenti = utentiPerNome();
        Map<String, Object> noteG = noteGestionale();
        LocalDateTime ora = LocalDateTime.now(ZONA);
        int aggiornate = 0, create = 0, sezioniNote = 0;
        List<Long> idToccati = new ArrayList<>();
        List<String> errori = new ArrayList<>();

        for (NoleggioTrattativa t : trattativaRepository.findAll()) {
            if (!daAggiornare.contains(t.getId())) continue;
            Fonte f = c.abbinata.get(t.getId());
            if (f == null) continue;
            try {
                Cambio ch = cambio(t, f, utenti, importer, noteG);
                // NUOVO: "gestita da" scelto a mano nella finestra di controllo
                User scelto = gestoriAgg.containsKey(t.getId()) ? scelti.get(gestoriAgg.get(t.getId())) : null;
                boolean cambiaGestore = scelto != null && (t.getGestitoDa() == null || !scelto.getId().equals(t.getGestitoDa().getId()));
                if (!ch.cambia && !cambiaGestore) continue;
                if (ch.cambia) {
                    t.setStato(ch.stato);
                    t.setDataRichiamo(ch.data);
                    t.setNoteFallimento(ch.noteFall);
                }
                if (scelto != null) t.setGestitoDa(scelto);
                else if (t.getGestitoDa() == null) t.setGestitoDa(ch.gestore);
                String nota = ch.cambia ? testoNota(f) : null;
                if (nota != null && "NOTA".equals(ch.nota)) t.setNote(nota);
                else if (nota != null && "SEZIONE".equals(ch.nota)) { noteG.put(String.valueOf(t.getId()), notaMap(f, nota, importer, ora)); sezioniNote++; }
                t.setUpdatedAt(ora);
                trattativaRepository.save(t);
                aggiornate++;
                idToccati.add(t.getId());
            } catch (Exception e) {
                errori.add("Trattativa " + t.getId() + ": " + e.getMessage());
            }
        }

        for (String chiave : daCreare) {
            Fonte f = c.nuove.get(chiave);
            if (f == null) continue;
            try {
                User gestore = gestoriCrea.containsKey(chiave) && scelti.containsKey(gestoriCrea.get(chiave))
                    ? scelti.get(gestoriCrea.get(chiave)) : gestore(f, utenti, importer);
                NoleggioTrattativa t = new NoleggioTrattativa();
                t.setUser(gestore);
                t.setGestitoDa(gestore);
                String nome = !blank(f.nome) ? f.nome : !blank(f.ragione) ? f.ragione : "-";
                t.setNome(taglia(nome, 100));
                t.setCognome(taglia(blank(f.nome) ? "" : nv(f.cognome), 100));
                t.setCellulare(taglia(blank(f.telefonoGrezzo) ? "N/D" : f.telefonoGrezzo, 50));
                t.setEmail(taglia(f.email, 255));
                t.setMarchio(taglia(blank(f.marca) ? "N/D" : f.marca, 100));
                t.setModello(taglia(f.modello, 200));
                t.setFonte(fonteRent(f.origine));
                t.setTipoCliente(f.tipoCliente);
                t.setNote(testoNota(f));
                t.setStato(f.statoRent);
                t.setDataRichiamo("DA_RICHIAMARE".equals(f.statoRent) ? f.dataRichiamo : null);
                t.setNoteFallimento("FALLITO".equals(f.statoRent) ? f.motivo : null);
                t.setCreatedAt(f.data != null ? f.data.atTime(12, 0) : ora);
                t.setUpdatedAt(ora);
                trattativaRepository.save(t);
                create++;
                idToccati.add(t.getId());
            } catch (Exception e) {
                errori.add("Nuova " + (nv(f.nome) + " " + nv(f.cognome)).trim() + ": " + e.getMessage());
            }
        }

        if (sezioniNote > 0) salvaNoteGestionale(noteG, importer, ora);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("aggiornate", aggiornate);
        out.put("create", create);
        out.put("noteASezione", sezioniNote);
        out.put("errori", errori);
        out.put("ids", idToccati);
        return out;
    }

    // ================= note dal gestionale =================
    public Map<String, Object> noteGestionale() {
        Optional<ConsegneDataset> d = datasetRepository.findById(NOTE_KEY);
        if (d.isEmpty() || blank(d.get().getContenuto())) return new LinkedHashMap<>();
        try {
            return objectMapper.readValue(d.get().getContenuto(), new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    private void salvaNoteGestionale(Map<String, Object> note, User chi, LocalDateTime ora) throws IOException {
        ConsegneDataset d = datasetRepository.findById(NOTE_KEY).orElseGet(() -> { ConsegneDataset n = new ConsegneDataset(); n.setTipo(NOTE_KEY); return n; });
        d.setContenuto(objectMapper.writeValueAsString(note));
        d.setRighe(note.size());
        d.setAggiornatoAt(ora);
        d.setAggiornatoDa(chi == null ? null : chi.getFullName());
        datasetRepository.save(d);
    }

    private static Map<String, Object> notaMap(Fonte f, String testo, User chi, LocalDateTime ora) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("testo", testo);
        m.put("fonte", ("T".equals(f.tipo) ? "Trattativa " : "Lead ") + f.id);
        m.put("data", f.data == null ? null : f.data.toString());
        m.put("venditore", f.venditore);
        m.put("importatoIl", ora.toString());
        m.put("importatoDa", chi == null ? null : chi.getFullName());
        return m;
    }

    // ================= utilita' =================
    private static Map<String, Object> fonteMap(Fonte f) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("tipo", f.tipo);
        m.put("id", f.id);
        m.put("data", f.data == null ? null : f.data.toString());
        m.put("statoGest", f.statoGest);
        m.put("statoRent", f.statoRent);
        m.put("dataRichiamo", f.dataRichiamo == null ? null : f.dataRichiamo.toString());
        m.put("motivo", f.motivo);
        m.put("venditore", f.venditore);
        String nome = (nv(f.nome) + " " + nv(f.cognome)).trim();
        m.put("cliente", nome.isEmpty() ? nv(f.ragione) : nome);
        m.put("telefono", f.telefonoGrezzo);
        m.put("veicolo", (nv(f.marca) + " " + nv(f.modello)).trim());
        m.put("etichetta", f.etichetta);
        m.put("origine", f.origine);
        String n = nv(f.note).trim();
        m.put("nota", n.length() > 220 ? n.substring(0, 220) + "…" : n);
        return m;
    }

    private static final List<String> RUOLI_RENT = List.of("NOLEGGIO", "MODERATORE", "GESTORE", "ADMIN");

    private List<User> utentiRent() {
        List<User> l = new ArrayList<>();
        for (User u : userRepository.findAll()) if (u.getFullName() != null && RUOLI_RENT.contains(u.getRole())) l.add(u);
        l.sort(Comparator.comparing(u -> u.getFullName().toLowerCase()));
        return l;
    }

    private Map<String, User> utentiPerNome() {
        Map<String, User> m = new HashMap<>();
        for (User u : userRepository.findAll()) {
            if (u.getFullName() == null) continue;
            m.put(chiaveNome(u.getFullName()), u);
        }
        return m;
    }

    // "Raffaele Crispo" e "Crispo Raffaele" danno la stessa chiave
    static String chiaveNome(String s) {
        String n = Normalizer.normalize(nv(s), Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase()
            .replaceAll("\\(.*?\\)", " ").replaceAll("[^a-z ]", " ").trim();
        String[] p = n.split("\\s+");
        Arrays.sort(p);
        return String.join(" ", p);
    }

    static String normTel(String raw) {
        String d = nv(raw).replaceAll("\\D", "");
        if (d.length() < 6) return "";
        return d.length() > 9 ? d.substring(d.length() - 9) : d;
    }

    private static void tel(Fonte x, String raw) {
        String n = normTel(raw);
        if (n.isEmpty() || x.telefoni.contains(n)) return;
        x.telefoni.add(n);
        if (x.telefonoGrezzo == null) x.telefonoGrezzo = raw.trim();
    }

    static LocalDate data(String s) {
        if (blank(s)) return null;
        Matcher m = DATA.matcher(s);
        if (!m.find()) return null;
        try {
            int g = Integer.parseInt(m.group(1)), me = Integer.parseInt(m.group(2)), a = Integer.parseInt(m.group(3));
            if (a < 100) a += 2000;
            return LocalDate.of(a, me, g);
        } catch (Exception e) {
            return null;
        }
    }

    private static String unisci(String a, String b) {
        if (blank(a)) return blank(b) ? null : b;
        if (blank(b) || a.contains(b.trim())) return a;
        return a + "\n" + b;
    }

    private static String get(CSVRecord r, String col) {
        try {
            if (!r.isMapped(col) || !r.isSet(col)) return null;
            String v = r.get(col);
            return v == null ? null : v.trim();
        } catch (Exception e) {
            return null;
        }
    }

    // Origine del gestionale -> una delle fonti che Rent usa nei filtri e nei grafici
    static String fonteRent(String origine) {
        String o = nv(origine).toLowerCase();
        if (o.contains("google")) return "Google ADS";
        if (o.contains("autoscout")) return "Autoscout";
        if (o.contains("facebook") || o.contains("meta")) return "Facebook";
        if (o.contains("instagram")) return "Instagram";
        if (o.contains("tiktok")) return "TikTok";
        if (o.contains("ingresso")) return "Ingresso";
        if (o.contains("personale") || o.contains("segnalat")) return "Cliente Personale";
        if (o.contains("gruppoautoscala") || o.contains("sito") || o.contains("www.")) return "Sito";
        return "Richiesta cliente";
    }

    private static String taglia(String s, int max) { return s == null ? null : s.length() > max ? s.substring(0, max) : s; }
    private static String low(String s) { return blank(s) ? null : s.trim().toLowerCase(); }
    private static String nv(String s) { return s == null ? "" : s; }
    private static boolean blank(String s) { return s == null || s.trim().isEmpty(); }
}
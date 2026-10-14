package com.gruppoautoscala.followup.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruppoautoscala.followup.model.ConsegneDataset;
import com.gruppoautoscala.followup.repository.ConsegneDatasetRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Pattern;

/**
 * AREA CONSEGNE — registro della LAVORAZIONE OFFICINA.
 *
 * Ogni volta che il CRM rilegge la scheda DATABASE del foglio Google (ogni minuto,
 * o subito con "Aggiorna dal foglio Google") confronta lo STATO di ogni vettura con
 * quello della lettura precedente e registra:
 *   INIZIO        stato senza "lavorazione officina"  ->  stato con "lavorazione officina"
 *   AGGIORNAMENTO stato con "lavorazione officina"    ->  un altro stato con "lavorazione officina"
 *   FINE          stato con "lavorazione officina"    ->  stato senza "lavorazione officina"
 * Se la vettura rientra in officina si apre un nuovo "giro". Data e ora sono quelle
 * italiane (Europe/Rome) del momento in cui il CRM se ne accorge: al massimo circa un
 * minuto dopo la modifica nel foglio. Chi ha fatto la modifica ("chi") per ora non si
 * conosce: arrivera' con l'avviso dallo script del foglio (passo successivo).
 *
 * Vettura = riga del foglio, riconosciuta dalla TARGA/TELAIO (oppure CLIENTE + DATA se
 * la targa manca). La stessa chiave la calcola consegne.js (campo fk).
 *
 * Salvato in consegne_dataset, tipo OFFICINA (JSON):
 *   { iniziato, iniziatoIt, vetture: { chiave: { cliente, tt, modello, vend, b2c, stato,
 *       giri: [ { inizio: evento, agg: [evento...], fine: evento|null } ] } } }
 *   evento = { at (ISO UTC), atIt ("14/10/2026 23:16"), da, a, chi, fonte, nota?, stimato? }
 */
@Service
public class ConsegneOfficinaService {

    private static final Logger log = LoggerFactory.getLogger(ConsegneOfficinaService.class);
    public static final String OFFICINA = "OFFICINA";
    private static final ZoneId ITALY = ZoneId.of("Europe/Rome");
    private static final DateTimeFormatter IT = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
    /** "IN LAVORAZIONE OFFICINA", "LAVORAZIONE IN OFFICINA", "LAVORAZIONI OFFICINA - ..." */
    private static final Pattern OFF = Pattern.compile("LAVORAZION\\p{L}*\\s+(?:IN\\s+)?OFFICINA");

    @Autowired private ConsegneDatasetRepository repository;
    @Autowired private ObjectMapper objectMapper;

    /** cambia a ogni salvataggio: la pagina Consegne lo controlla per aggiornarsi subito */
    private volatile long versione = System.currentTimeMillis();
    public long getVersione() { return versione; }

    public static boolean inOfficina(String stato) { return stato != null && OFF.matcher(norm(stato)).find(); }
    private static String norm(String s) { return s == null ? "" : s.toUpperCase(Locale.ROOT).replaceAll("\\s+", " ").trim(); }
    private static String pl(String s) { return s == null ? "" : s.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", ""); }

    public boolean inizializzato() { return repository.findById(OFFICINA).isPresent(); }

    /** tutto il registro (per GET /api/consegne/data) */
    public Map<String, Object> leggi() {
        return repository.findById(OFFICINA).map(ConsegneDataset::getContenuto).filter(c -> c != null && !c.isBlank()).map(c -> {
            try { return objectMapper.readValue(c, new TypeReference<LinkedHashMap<String, Object>>() {}); }
            catch (Exception e) { log.warn("[Officina] registro non leggibile: {}", e.getMessage()); return new LinkedHashMap<String, Object>(); }
        }).orElseGet(LinkedHashMap::new);
    }

    /* ---------- lettura del CSV della scheda DATABASE (come parseCSV di consegne.js) ---------- */
    static List<Map<String, String>> parseCsv(String text) {
        List<Map<String, String>> out = new ArrayList<>();
        if (text == null) return out;
        text = text.replace("﻿", "");
        String first = text.lines().filter(l -> !l.isBlank()).findFirst().orElse("");
        char delim = first.split(";", -1).length > first.split(",", -1).length ? ';' : ',';
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder f = new StringBuilder();
        boolean q = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (q) {
                if (c == '"') { if (i + 1 < text.length() && text.charAt(i + 1) == '"') { f.append('"'); i++; } else q = false; }
                else f.append(c);
            } else if (c == '"') q = true;
            else if (c == delim) { row.add(f.toString()); f.setLength(0); }
            else if (c == '\n' || c == '\r') {
                if (c == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') i++;
                row.add(f.toString()); f.setLength(0);
                if (row.stream().anyMatch(x -> !x.trim().isEmpty())) rows.add(row);
                row = new ArrayList<>();
            } else f.append(c);
        }
        row.add(f.toString());
        if (row.stream().anyMatch(x -> !x.trim().isEmpty())) rows.add(row);
        if (rows.isEmpty()) return out;
        List<String> h = new ArrayList<>();
        for (String x : rows.get(0)) h.add(x.replace("﻿", "").trim());
        for (int r = 1; r < rows.size(); r++) {
            Map<String, String> o = new LinkedHashMap<>();
            List<String> v = rows.get(r);
            for (int i = 0; i < h.size(); i++) o.put(h.get(i), i < v.size() ? v.get(i).trim() : "");
            out.add(o);
        }
        return out;
    }

    /** chiave di ogni vettura: T:<targa/telaio> oppure C:<cliente>|<data>; i doppioni prendono #2, #3... */
    static Map<String, Map<String, String>> perChiave(List<Map<String, String>> rows) {
        Map<String, Map<String, String>> out = new LinkedHashMap<>();
        for (Map<String, String> r : rows) {
            String cli = r.getOrDefault("CLIENTE", ""), tt = r.getOrDefault("TARGA/TELAIO", "");
            if (cli.isEmpty() && tt.isEmpty()) continue;
            String base = chiave(r), k = base;
            for (int n = 2; out.containsKey(k); n++) k = base + "#" + n;
            out.put(k, r);
        }
        return out;
    }
    static String chiave(Map<String, String> r) {
        String tt = pl(r.getOrDefault("TARGA/TELAIO", ""));
        if (tt.length() >= 5) return "T:" + tt;
        return "C:" + pl(r.getOrDefault("CLIENTE", "")) + "|" + r.getOrDefault("DATA", "").trim();
    }

    private static Map<String, Object> evento(Instant at, String da, String a, String fonte, String nota, boolean stimato) {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("at", at.toString());
        e.put("atIt", IT.format(at.atZone(ITALY)));
        e.put("da", da == null || da.isBlank() ? null : da.trim());
        e.put("a", a == null || a.isBlank() ? null : a.trim());
        e.put("chi", null);                 // arrivera' con lo script del foglio
        e.put("fonte", fonte);
        if (nota != null) e.put("nota", nota);
        if (stimato) e.put("stimato", true);
        return e;
    }

    /**
     * Confronta la lettura precedente (vecchio) con quella nuova e registra i passaggi.
     * vecchio = null: prima volta, le vetture gia' in officina si segnano con data "stimata".
     */
    @SuppressWarnings("unchecked")
    public synchronized void registra(String vecchio, String nuovo, String fonte) {
        try {
            Map<String, Object> reg = leggi();
            boolean primo = !(reg.get("vetture") instanceof Map);
            Map<String, Object> vetture = primo ? new LinkedHashMap<>() : (Map<String, Object>) reg.get("vetture");
            Instant now = Instant.now();
            if (primo) { reg.put("iniziato", now.toString()); reg.put("iniziatoIt", IT.format(now.atZone(ITALY))); }
            Map<String, Map<String, String>> dopo = perChiave(parseCsv(nuovo));
            Map<String, Map<String, String>> prima = primo || vecchio == null ? null : perChiave(parseCsv(vecchio));
            boolean cambiato = primo;
            for (Map.Entry<String, Map<String, String>> en : dopo.entrySet()) {
                String k = en.getKey();
                Map<String, String> row = en.getValue();
                String a = row.getOrDefault("STATO", "");
                Map<String, Object> v = (Map<String, Object>) vetture.get(k);
                List<Map<String, Object>> giri = v == null ? new ArrayList<>() : (List<Map<String, Object>>) v.get("giri");
                Map<String, Object> aperto = giri.isEmpty() || giri.get(giri.size() - 1).get("fine") != null ? null : giri.get(giri.size() - 1);
                boolean aOff = inOfficina(a);
                Map<String, Object> nuovoGiro = null;

                if (prima == null || !prima.containsKey(k)) {
                    // prima lettura o riga nuova nel foglio: se e' gia' in officina si apre il giro
                    if (aOff && aperto == null) {
                        nuovoGiro = new LinkedHashMap<>();
                        nuovoGiro.put("inizio", prima == null
                            ? evento(now, null, a, fonte, "Era gia' in lavorazione officina quando e' partita la registrazione: l'inizio vero puo' essere precedente", true)
                            : evento(now, null, a, fonte, "Riga nuova nel foglio, gia' in lavorazione officina", false));
                        nuovoGiro.put("agg", new ArrayList<>());
                        nuovoGiro.put("fine", null);
                    }
                } else {
                    String da = prima.get(k).getOrDefault("STATO", "");
                    if (!norm(da).equals(norm(a))) {
                        boolean dOff = inOfficina(da);
                        if (aOff && (!dOff || aperto == null)) {             // INIZIO
                            nuovoGiro = new LinkedHashMap<>();
                            nuovoGiro.put("inizio", evento(now, da, a, fonte, null, false));
                            nuovoGiro.put("agg", new ArrayList<>());
                            nuovoGiro.put("fine", null);
                        } else if (aOff) {                                    // AGGIORNAMENTO (resta in officina)
                            ((List<Map<String, Object>>) aperto.get("agg")).add(evento(now, da, a, fonte, null, false));
                            cambiato = true;
                        } else if (dOff && aperto != null) {                  // FINE
                            aperto.put("fine", evento(now, da, a, fonte, null, false));
                            cambiato = true;
                        }
                    }
                }
                if (nuovoGiro != null) { giri.add(nuovoGiro); cambiato = true; }
                if (v == null && giri.isEmpty()) continue;                    // mai stata in officina: non serve tenerla
                if (v == null) { v = new LinkedHashMap<>(); vetture.put(k, v); }
                v.put("cliente", row.getOrDefault("CLIENTE", ""));
                v.put("tt", row.getOrDefault("TARGA/TELAIO", ""));
                v.put("modello", row.getOrDefault("MODELLO", ""));
                v.put("vend", row.getOrDefault("VENDITORE", ""));
                v.put("b2c", row.getOrDefault("B2C", "").toUpperCase(Locale.ROOT));
                if (!Objects.equals(v.get("stato"), a)) { v.put("stato", a); cambiato = true; }
                v.put("giri", giri);
            }
            if (!cambiato) return;
            reg.put("vetture", vetture);
            reg.put("aggiornatoIt", IT.format(now.atZone(ITALY)));
            ConsegneDataset d = repository.findById(OFFICINA).orElseGet(() -> { ConsegneDataset n = new ConsegneDataset(); n.setTipo(OFFICINA); return n; });
            d.setContenuto(objectMapper.writeValueAsString(reg));
            d.setRighe(vetture.size());
            d.setAggiornatoAt(LocalDateTime.now(ITALY));
            d.setAggiornatoDa(fonte);
            repository.save(d);
            versione = System.currentTimeMillis();
        } catch (Exception e) {
            // il registro non deve mai bloccare la lettura del foglio
            log.warn("[Officina] registrazione non riuscita: {}", e.getMessage());
        }
    }
}
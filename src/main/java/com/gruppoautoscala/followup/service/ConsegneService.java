package com.gruppoautoscala.followup.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruppoautoscala.followup.model.ConsegneDataset;
import com.gruppoautoscala.followup.repository.ConsegneDatasetRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * AREA CONSEGNE — salvataggio degli import e lettura del foglio Google.
 *
 * Il foglio "AVANZAMENTO 2026" (scheda DATABASE) viene letto tramite uno
 * script Apps Script pubblicato come App web, protetto da una parola
 * segreta. URL e parola NON sono nel codice: arrivano dalle variabili
 * d'ambiente GSHEET_URL e GSHEET_TOKEN (Railway / configurazione IntelliJ).
 */
@Service
public class ConsegneService {

    private static final Logger log = LoggerFactory.getLogger(ConsegneService.class);

    public static final String TRATTATIVE = "TRATTATIVE";
    public static final String DATABASE = "DATABASE";
    // Verifiche manuali delle pratiche con bollino "i" (JSON: chiave pratica -> {da, at})
    public static final String VERIFICHE = "VERIFICHE";

    @Autowired
    private ConsegneDatasetRepository repository;

    @Autowired
    private ObjectMapper objectMapper;

    @Value("${GSHEET_URL:}")
    private String sheetUrl;

    @Value("${GSHEET_TOKEN:}")
    private String sheetToken;

    // Apps Script risponde con un redirect verso script.googleusercontent.com:
    // Redirect.NORMAL lo segue automaticamente.
    private final HttpClient http = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    // Stato dell'ultima lettura del foglio (solo in memoria, per mostrarlo a video)
    private volatile LocalDateTime ultimoControllo;
    private volatile String ultimoErrore;

    public boolean isFoglioConfigurato() {
        return sheetUrl != null && !sheetUrl.isBlank() && sheetToken != null && !sheetToken.isBlank();
    }

    public LocalDateTime getUltimoControllo() { return ultimoControllo; }
    public String getUltimoErrore() { return ultimoErrore; }

    public Optional<ConsegneDataset> get(String tipo) {
        return repository.findById(tipo);
    }

    public ConsegneDataset salvaTrattative(String json, int righe, String chi) {
        return salva(TRATTATIVE, json, righe, chi);
    }

    /**
     * Legge SUBITO la scheda DATABASE dallo script e la salva.
     * Se il contenuto non e' cambiato dall'ultima lettura non riscrive il
     * database (evita scritture inutili ogni 5 minuti).
     */
    public synchronized ConsegneDataset aggiornaDaFoglio(String chi) throws IOException, InterruptedException {
        if (!isFoglioConfigurato()) {
            throw new IllegalStateException("Collegamento al foglio non configurato: mancano le variabili GSHEET_URL e/o GSHEET_TOKEN");
        }
        try {
            String base = sheetUrl.trim();
            String url = base + (base.contains("?") ? "&" : "?") + "token="
                    + URLEncoder.encode(sheetToken.trim(), StandardCharsets.UTF_8);

            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(60))
                    .GET()
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            String body = res.body() == null ? "" : res.body();

            if (res.statusCode() != 200) {
                throw new IOException("Il foglio Google ha risposto con codice " + res.statusCode());
            }
            if (body.trim().toLowerCase().startsWith("accesso negato")) {
                throw new IOException("Parola segreta non valida: GSHEET_TOKEN non coincide con quella dello script");
            }
            String intestazione = body.lines().findFirst().orElse("").toUpperCase();
            if (!intestazione.contains("CLIENTE") || !intestazione.contains("STATO")) {
                throw new IOException("La risposta dello script non sembra la scheda DATABASE (intestazioni non riconosciute)");
            }

            int righe = (int) Math.max(0, body.lines().count() - 1);
            ConsegneDataset attuale = repository.findById(DATABASE).orElse(null);
            ConsegneDataset risultato;
            if (attuale != null && Objects.equals(attuale.getContenuto(), body)) {
                risultato = attuale; // nessuna modifica nel foglio
            } else {
                risultato = salva(DATABASE, body, righe, chi);
            }
            ultimoControllo = LocalDateTime.now();
            ultimoErrore = null;
            return risultato;
        } catch (IOException | InterruptedException | RuntimeException e) {
            ultimoControllo = LocalDateTime.now();
            ultimoErrore = e.getMessage();
            throw e;
        }
    }

    /** Tutte le verifiche manuali: chiave pratica -> {da: operatore, at: data/ora ISO}. */
    public Map<String, Map<String, String>> getVerifiche() {
        return repository.findById(VERIFICHE)
                .map(ConsegneDataset::getContenuto)
                .filter(c -> c != null && !c.isBlank())
                .map(c -> {
                    try {
                        return objectMapper.readValue(c, new TypeReference<LinkedHashMap<String, Map<String, String>>>() {});
                    } catch (Exception e) {
                        log.warn("[Consegne] Verifiche non leggibili: {}", e.getMessage());
                        return new LinkedHashMap<String, Map<String, String>>();
                    }
                })
                .orElseGet(LinkedHashMap::new);
    }

    /**
     * Segna (verificata = true) o toglie (false) la verifica manuale di una pratica.
     * Le verifiche NON dipendono dagli import: restano valide finche' la
     * pratica (cliente + targa + mese del foglio) resta la stessa.
     */
    public synchronized Map<String, Map<String, String>> setVerifica(String chiave, boolean verificata, String chi) throws Exception {
        return setVerifica(chiave, verificata, chi, null, null);
    }

    /**
     * Come sopra, con in piu' l'eventuale decisione presa a mano su una
     * trattativa del CSV non trovata nel foglio: "abbina" (abbinala alla riga
     * del foglio indicata in riga), "contratto" (contala come contratto
     * differente) oppure "elimina" (non contarla).
     */
    public synchronized Map<String, Map<String, String>> setVerifica(String chiave, boolean verificata, String chi, String azione, String riga) throws Exception {
        Map<String, Map<String, String>> map = getVerifiche();
        if (verificata) {
            Map<String, String> v = new LinkedHashMap<>();
            v.put("da", chi);
            v.put("at", java.time.Instant.now().toString()); // ISO in UTC: il browser lo mostra nell'ora locale
            if (azione != null) v.put("azione", azione);
            if (riga != null) v.put("riga", riga);   // solo per "abbina": riga del foglio scelta
            map.put(chiave, v);
        } else {
            map.remove(chiave);
        }
        salva(VERIFICHE, objectMapper.writeValueAsString(map), map.size(), chi);
        return map;
    }

    /** Rilettura automatica del foglio ogni 5 minuti (prima volta 1 minuto dopo l'avvio). */
    @Scheduled(initialDelay = 60_000, fixedDelay = 300_000)
    public void aggiornamentoAutomatico() {
        if (!isFoglioConfigurato()) return;
        try {
            aggiornaDaFoglio("Aggiornamento automatico");
        } catch (Exception e) {
            log.warn("[Consegne] Lettura automatica del foglio Google non riuscita: {}", e.getMessage());
        }
    }

    private ConsegneDataset salva(String tipo, String contenuto, int righe, String chi) {
        ConsegneDataset d = repository.findById(tipo).orElseGet(() -> {
            ConsegneDataset nuovo = new ConsegneDataset();
            nuovo.setTipo(tipo);
            return nuovo;
        });
        d.setContenuto(contenuto);
        d.setRighe(righe);
        d.setAggiornatoAt(LocalDateTime.now());
        d.setAggiornatoDa(chi);
        return repository.save(d);
    }
}
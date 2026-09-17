package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.PreventivoTelefonico;
import com.gruppoautoscala.followup.model.PreventivoTelefonicoStatusHistory;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.PreventivoTelefonicoRepository;
import com.gruppoautoscala.followup.repository.PreventivoTelefonicoStatusHistoryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Service
public class PreventivoTelefonicoService {

    private static final ZoneId ITALY_ZONE = ZoneId.of("Europe/Rome");

    // Transizioni ammesse: chiave = stato attuale, valore = stati in cui
    // puo' passare. Gli stati assenti come chiave (NON_INTERESSATO, CHIUSA,
    // FALLITA) sono terminali: nessuna transizione ulteriore ammessa.
    private static final Map<String, Set<String>> ALLOWED_TRANSITIONS = Map.of(
        "GENERATO", Set.of("NON_INTERESSATO", "TRATTATIVA_GENERATA"),
        "TRATTATIVA_GENERATA", Set.of("CHIUSA", "FALLITA")
    );

    @Autowired private PreventivoTelefonicoRepository preventivoRepository;
    @Autowired private PreventivoTelefonicoStatusHistoryRepository historyRepository;
    @Autowired private PreventivoRentSyncService rentSyncService;

    public PreventivoTelefonico create(PreventivoTelefonico p, User creator) {
        p.setUser(creator);
        p.setStatus("GENERATO");
        p.setCreatedAt(LocalDateTime.now(ITALY_ZONE));
        PreventivoTelefonico saved = preventivoRepository.save(p);

        // Prima riga di storico: lo stato iniziale "GENERATO", con lo
        // stesso creatore come autore del cambio.
        PreventivoTelefonicoStatusHistory h = new PreventivoTelefonicoStatusHistory();
        h.setPreventivo(saved);
        h.setStatus("GENERATO");
        h.setChangedBy(creator);
        h.setChangedAt(saved.getCreatedAt());
        historyRepository.save(h);

        rentSyncService.sync(saved);

        return saved;
    }

    public Optional<PreventivoTelefonico> getById(Long id) {
        return preventivoRepository.findById(id);
    }

    public List<PreventivoTelefonico> getByPeriod(LocalDateTime from, LocalDateTime to) {
        return preventivoRepository.findByCreatedAtBetweenWithUser(from, to);
    }

    public List<PreventivoTelefonico> getAll() {
        return preventivoRepository.findAllWithUser();
    }

    public List<PreventivoTelefonicoStatusHistory> getHistoryFor(List<PreventivoTelefonico> preventivi) {
        return historyRepository.findByPreventivoIn(preventivi);
    }

    public List<PreventivoTelefonicoStatusHistory> getHistory(PreventivoTelefonico p) {
        return historyRepository.findByPreventivoOrderByChangedAtAsc(p);
    }

    public void delete(PreventivoTelefonico p) {
        historyRepository.deleteAll(historyRepository.findByPreventivoOrderByChangedAtAsc(p));
        preventivoRepository.delete(p);
    }

    // Modifica i campi anagrafici/veicolo (non lo stato, quello resta
    // gestito da changeStatus). Pensato principalmente per completare un
    // record creato da import (aggiungere il link lead mancante), ma
    // utilizzabile anche per correggere nome/cognome/marca/modello se la
    // trattativa viene generata per un'altra persona o un altro veicolo.
    public PreventivoTelefonico update(PreventivoTelefonico p, User editor) {
        p.setLastModifiedBy(editor);
        p.setLastModifiedAt(LocalDateTime.now(ITALY_ZONE));
        return preventivoRepository.save(p);
    }

    // Cambia stato validando la transizione. Lancia IllegalArgumentException
    // (gestita dal controller come 400) se il cambio richiesto non e'
    // ammesso dallo stato attuale.
    public PreventivoTelefonico changeStatus(PreventivoTelefonico p, String newStatus, User changedBy) {
        String current = p.getStatus();
        Set<String> allowed = ALLOWED_TRANSITIONS.get(current);
        if (allowed == null || !allowed.contains(newStatus)) {
            throw new IllegalArgumentException(
                "Transizione di stato non ammessa: da '" + current + "' a '" + newStatus + "'");
        }

        p.setStatus(newStatus);
        LocalDateTime now = LocalDateTime.now(ITALY_ZONE);
        p.setLastModifiedBy(changedBy);
        p.setLastModifiedAt(now);
        PreventivoTelefonico saved = preventivoRepository.save(p);

        PreventivoTelefonicoStatusHistory h = new PreventivoTelefonicoStatusHistory();
        h.setPreventivo(saved);
        h.setStatus(newStatus);
        h.setChangedBy(changedBy);
        h.setChangedAt(now);
        historyRepository.save(h);

        rentSyncService.sync(saved);

        return saved;
    }
}
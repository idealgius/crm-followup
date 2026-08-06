package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.model.WaitingEntry;
import com.gruppoautoscala.followup.model.WaitingRecallHistory;
import com.gruppoautoscala.followup.repository.WaitingEntryRepository;
import com.gruppoautoscala.followup.repository.WaitingRecallHistoryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class WaitingListService {

    @Autowired
    private WaitingEntryRepository waitingEntryRepository;

    @Autowired
    private WaitingRecallHistoryRepository waitingRecallHistoryRepository;

    public WaitingEntry create(User user, String fullName, String contact,
                               String brand, String model, BigDecimal price,
                               String notes, LocalDate recallDate) {
        WaitingEntry entry = new WaitingEntry();
        entry.setUser(user);
        entry.setFullName(fullName);
        entry.setContact(contact);
        entry.setBrand(brand);
        entry.setModel(model);
        entry.setPrice(price);
        entry.setNotes(notes);
        entry.setRecallDate(recallDate);
        entry.setStatus("WAITING");
        return waitingEntryRepository.save(entry);
    }

    public List<WaitingEntry> getAll() {
        return waitingEntryRepository.findAll().stream()
            .sorted(Comparator.comparing(
                WaitingEntry::getRecallDate,
                Comparator.nullsLast(Comparator.naturalOrder())
            ))
            .collect(Collectors.toList());
    }

    public List<WaitingEntry> getByStatus(String status) {
        return waitingEntryRepository.findByStatus(status);
    }

    public Optional<WaitingEntry> getById(Long id) {
        return waitingEntryRepository.findById(id);
    }

    public WaitingEntry update(WaitingEntry entry) {
        entry.setUpdatedAt(LocalDateTime.now());
        return waitingEntryRepository.save(entry);
    }

    public void delete(Long id) {
        waitingEntryRepository.deleteById(id);
    }

    // ===== REGISTRA NUOVO RECALL =====
    // Archivia il ciclo ATTUALE (data + stato + nota passata dal frontend)
    // nello storico, poi apre un nuovo ciclo: nuova data, stato tornato a
    // "In Attesa", flag "richiamato" resettato. Le note libere NON vengono
    // svuotate (restano visibili, l'operatore le pulisce a mano se vuole).
    public WaitingEntry registraNuovoRecall(WaitingEntry entry, LocalDate nuovaData, String notaPrecedente) {
        WaitingRecallHistory h = new WaitingRecallHistory();
        h.setWaitingEntry(entry);
        h.setData(entry.getRecallDate());
        h.setEsito(entry.getStatus());
        h.setNote(notaPrecedente);
        waitingRecallHistoryRepository.save(h);

        entry.setRecallDate(nuovaData);
        entry.setStatus("WAITING");
        entry.setRichiamato(false);
        entry.setUpdatedAt(LocalDateTime.now());
        return waitingEntryRepository.save(entry);
    }

    public List<WaitingEntry> searchByName(String name) {
        return waitingEntryRepository.findByFullNameContainingIgnoreCase(name);
    }
}
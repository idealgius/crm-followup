package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.model.WaitingEntry;
import com.gruppoautoscala.followup.repository.WaitingEntryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class WaitingListService {

    @Autowired
    private WaitingEntryRepository waitingEntryRepository;

    public WaitingEntry create(User user, String fullName, String contact,
                               String brand, String model, java.math.BigDecimal price, String notes) {
        WaitingEntry entry = new WaitingEntry();
        entry.setUser(user);
        entry.setFullName(fullName);
        entry.setContact(contact);
        entry.setBrand(brand);
        entry.setModel(model);
        entry.setPrice(price);
        entry.setNotes(notes);
        entry.setStatus("WAITING");
        return waitingEntryRepository.save(entry);
    }

    public List<WaitingEntry> getAll() {
        return waitingEntryRepository.findAll();
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

    public List<WaitingEntry> searchByName(String name) {
        return waitingEntryRepository.findByFullNameContainingIgnoreCase(name);
    }
}
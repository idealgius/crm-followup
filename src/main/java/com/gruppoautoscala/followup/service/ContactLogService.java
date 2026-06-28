package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.ContactLog;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.ContactLogRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class ContactLogService {

    @Autowired
    private ContactLogRepository contactLogRepository;

    public ContactLog create(User user, String category, String otherNote, LocalDateTime contactDate) {
        ContactLog log = new ContactLog();
        log.setUser(user);
        log.setCategory(category);
        log.setOtherNote(otherNote);
        log.setContactDate(contactDate != null ? contactDate : LocalDateTime.now());
        return contactLogRepository.save(log);
    }

    public List<ContactLog> getAll() {
        return contactLogRepository.findByOrderByContactDateAsc();
    }

    public List<ContactLog> getByDateRange(LocalDateTime from, LocalDateTime to) {
        return contactLogRepository.findByContactDateBetweenOrderByContactDateAsc(from, to);
    }

    public Optional<ContactLog> getById(Long id) {
        return contactLogRepository.findById(id);
    }

    public ContactLog update(ContactLog log) {
        return contactLogRepository.save(log);
    }

    public void delete(Long id) {
        contactLogRepository.deleteById(id);
    }

    public Map<String, Object> getStats(LocalDateTime from, LocalDateTime to) {
        List<Object[]> counts;
        if (from != null && to != null) {
            counts = contactLogRepository.countByCategoryBetween(from, to);
        } else {
            counts = contactLogRepository.countByCategory();
        }

        Map<String, Long> byCategory = new HashMap<>();
        long total = 0;
        for (Object[] row : counts) {
            String cat = (String) row[0];
            Long count = (Long) row[1];
            byCategory.put(cat, count);
            total += count;
        }

        Map<String, Object> stats = new HashMap<>();
        stats.put("total", total);
        stats.put("byCategory", byCategory);

        long infoVendita = byCategory.getOrDefault("Info Vendita", 0L);
        long infoNoleggio = byCategory.getOrDefault("Info Noleggio", 0L);
        long service = byCategory.getOrDefault("Service", 0L);

        stats.put("infoVenditaPct", total > 0 ? Math.round(infoVendita * 1000.0 / total) / 10.0 : 0);
        stats.put("infoNoleggioP_ct", total > 0 ? Math.round(infoNoleggio * 1000.0 / total) / 10.0 : 0);
        stats.put("servicePct", total > 0 ? Math.round(service * 1000.0 / total) / 10.0 : 0);

        return stats;
    }
}
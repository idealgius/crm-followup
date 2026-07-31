package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.ContactLog;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.ContactLogRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class ContactLogService {

    @Autowired
    private ContactLogRepository contactLogRepository;

    public ContactLog create(User user, String category,
                              String clienteNome, String clienteCognome, String clienteNumero,
                              Boolean nonComunicaNominativo,
                              String otherNote,
                              String nominativoAppuntamento, String linkAppuntamento,
                              String marca, String modello, String linkAuto,
                              String serviceTipo, String serviceNote, String serviceSede,
                              String acquistoNote,
                              String noleggioTipo, String noleggioLink,
                              String serviceNomeCliente, String serviceCognomeCliente, String serviceTarga,
                              String serviceTipoCliente, String serviceNumeroTelefono,
                              String noleggioRichiesta, String noleggioNomeCliente,
                              String noleggioCognomeCliente, String noleggioCellulare,
                              Boolean alertNotifyAll, List<User> alertRecipients,
                              LocalDateTime contactDate) {
        ContactLog log = new ContactLog();
        log.setUser(user);
        log.setCategory(category);
        log.setClienteNome(clienteNome);
        log.setClienteCognome(clienteCognome);
        log.setClienteNumero(clienteNumero);
        log.setNonComunicaNominativo(nonComunicaNominativo != null ? nonComunicaNominativo : false);
        log.setOtherNote(otherNote);
        log.setNominativoAppuntamento(nominativoAppuntamento);
        log.setLinkAppuntamento(linkAppuntamento);
        log.setMarca(marca);
        log.setModello(modello);
        log.setLinkAuto(linkAuto);
        log.setServiceTipo(serviceTipo);
        log.setServiceNote(serviceNote);
        log.setServiceSede(serviceSede);
        log.setAcquistoNote(acquistoNote);
        log.setNoleggioTipo(noleggioTipo);
        log.setNoleggioLink(noleggioLink);
        log.setServiceNomeCliente(serviceNomeCliente);
        log.setServiceCognomeCliente(serviceCognomeCliente);
        log.setServiceTarga(serviceTarga);
        log.setServiceTipoCliente(serviceTipoCliente);
        log.setServiceNumeroTelefono(serviceNumeroTelefono);
        log.setNoleggioRichiesta(noleggioRichiesta);
        log.setNoleggioNomeCliente(noleggioNomeCliente);
        log.setNoleggioCognomeCliente(noleggioCognomeCliente);
        log.setNoleggioCellulare(noleggioCellulare);
        log.setAlertNotifyAll(alertNotifyAll != null ? alertNotifyAll : true);
        if (alertRecipients != null) {
            log.setAlertRecipients(alertRecipients);
        }
        log.setContactDate(contactDate != null ? contactDate : LocalDateTime.now());
        return contactLogRepository.save(log);
    }

    public List<ContactLog> getCustomerHistory(String nome, String cognome, String numero) {
        // Map ordinata per id: un contatto potrebbe soddisfare sia il
        // criterio numero sia quello nome+cognome (stesso cliente trovato
        // da entrambe le query) — la Map evita di restituirlo due volte.
        Map<Long, ContactLog> byId = new LinkedHashMap<>();
        if (numero != null) {
            for (ContactLog c : contactLogRepository.findByClienteNumero(numero)) {
                byId.put(c.getId(), c);
            }
        }
        if (nome != null && cognome != null) {
            for (ContactLog c : contactLogRepository.findByClienteNomeCognome(nome, cognome)) {
                byId.put(c.getId(), c);
            }
        }
        List<ContactLog> result = new ArrayList<>(byId.values());
        result.sort(Comparator.comparing(ContactLog::getContactDate).reversed());
        return result;
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
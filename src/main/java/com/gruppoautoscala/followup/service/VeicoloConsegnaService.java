package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.*;
import com.gruppoautoscala.followup.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class VeicoloConsegnaService {

    @Autowired
    private VeicoloConsegnaRepository repository;

    @Autowired
    private VeicoloLavorazioneRepository lavorazioneRepository;

    @Autowired
    private VeicoloStatoLogRepository statoLogRepository;

    public VeicoloConsegna save(VeicoloConsegna v) {
        return repository.save(v);
    }

    public Optional<VeicoloConsegna> getById(Long id) {
        return repository.findById(id);
    }

    public void delete(Long id) {
        repository.deleteById(id);
    }

    public List<VeicoloConsegna> getByStato(String stato) {
        return repository.findByStatoPratica(stato);
    }

    public List<VeicoloConsegna> getByStatoESedi(String stato, List<String> sedi) {
        if (sedi == null || sedi.isEmpty()) return repository.findByStatoPratica(stato);
        return repository.findByStatoPraticaAndSedeConsegnaIn(stato, sedi);
    }

    public List<VeicoloConsegna> getConsegnateNelPeriodo(List<String> sedi, LocalDateTime from, LocalDateTime to) {
        if (sedi == null || sedi.isEmpty()) {
            return repository.findByStatoPraticaAndDataConsegnaEffettivaBetween("CONSEGNATA", from, to);
        }
        return repository.findByStatoPraticaAndSedeConsegnaInAndDataConsegnaEffettivaBetween("CONSEGNATA", sedi, from, to);
    }

    public List<VeicoloConsegna> getAppuntamentiTraLeDate(LocalDate from, LocalDate to) {
        return repository.findAppuntamentiTraLeDate(from, to);
    }

    public List<VeicoloConsegna> search(String q) {
        return repository.search(q);
    }

    // Marca (o smarca) una lavorazione come completata.
    public VeicoloLavorazione toggleLavorazione(VeicoloLavorazione l, boolean completata) {
        l.setCompletata(completata);
        l.setDataCompletamento(completata ? LocalDate.now() : null);
        return lavorazioneRepository.save(l);
    }

    // Aggiunge uno stato burocratico (una nuova riga, non sovrascrive i
    // precedenti — possono coesistere più stati attivi).
    public VeicoloStatoLog addStato(VeicoloConsegna v, String tipo, LocalDate data) {
        VeicoloStatoLog log = new VeicoloStatoLog();
        log.setVeicoloConsegna(v);
        log.setTipo(tipo);
        log.setData(data != null ? data : LocalDate.now());
        return statoLogRepository.save(log);
    }

    public void removeStato(Long statoId) {
        statoLogRepository.deleteById(statoId);
    }

    public VeicoloConsegna annulla(VeicoloConsegna v, String motivo) {
        v.setStatoPratica("ANNULLATA");
        v.setDataAnnullamento(LocalDateTime.now());
        v.setMotivoAnnullamento(motivo);
        return repository.save(v);
    }

    public VeicoloConsegna consegna(VeicoloConsegna v) {
        v.setStatoPratica("CONSEGNATA");
        v.setDataConsegnaEffettiva(LocalDateTime.now());
        return repository.save(v);
    }
}
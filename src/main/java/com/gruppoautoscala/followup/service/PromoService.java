package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.Promo;
import com.gruppoautoscala.followup.model.PromoContact;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.PromoContactRepository;
import com.gruppoautoscala.followup.repository.PromoRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Service
public class PromoService {

    @Autowired
    private PromoRepository promoRepository;

    @Autowired
    private PromoContactRepository promoContactRepository;

    // ===== PROMO =====

    public Promo create(String nome, String marchi, String modelli,
                         Boolean consentiInserimentoManuale,
                         LocalDate dataInizio, LocalDate dataScadenza,
                         User createdBy) {
        Promo promo = new Promo();
        promo.setNome(nome);
        promo.setMarchi(marchi);
        promo.setModelli(modelli);
        promo.setConsentiInserimentoManuale(consentiInserimentoManuale != null ? consentiInserimentoManuale : true);
        promo.setDataInizio(dataInizio);
        promo.setDataScadenza(dataScadenza);
        promo.setStato("ATTIVA");
        promo.setCreatedBy(createdBy);
        return promoRepository.save(promo);
    }

    public List<Promo> getAttive() {
        // Auto-scadenza: aggiorna stato se data scadenza passata
        List<Promo> scadute = promoRepository.findByDataScadenzaBeforeAndStato(LocalDate.now(), "ATTIVA");
        scadute.forEach(p -> { p.setStato("SCADUTA"); promoRepository.save(p); });
        return promoRepository.findByStatoOrderByDataScadenzaAsc("ATTIVA");
    }

    public List<Promo> getArchiviate() {
        return promoRepository.findByStatoInOrderByDataScadenzaDesc(List.of("SCADUTA", "ANNULLATA"));
    }

    public Optional<Promo> getById(Long id) {
        return promoRepository.findById(id);
    }

    public Promo update(Promo promo) {
        return promoRepository.save(promo);
    }

    public void annulla(Long id) {
        promoRepository.findById(id).ifPresent(p -> {
            p.setStato("ANNULLATA");
            promoRepository.save(p);
        });
    }

    public void delete(Long id) {
        promoRepository.deleteById(id);
    }

    // ===== PROMO CONTACTS =====

    public PromoContact createContact(PromoContact pc) {
        return promoContactRepository.save(pc);
    }

    public List<PromoContact> getContactsByPromo(Long promoId) {
        return promoContactRepository.findByPromoId(promoId);
    }

    public Optional<PromoContact> getContactById(Long id) {
        return promoContactRepository.findById(id);
    }
}
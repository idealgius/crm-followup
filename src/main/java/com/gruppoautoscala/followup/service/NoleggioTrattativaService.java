package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.NoleggioTrattativa;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.NoleggioTrattativaRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class NoleggioTrattativaService {

    @Autowired
    private NoleggioTrattativaRepository repository;

    public List<NoleggioTrattativa> getAll() {
        return repository.findAll();
    }

    public Optional<NoleggioTrattativa> getById(Long id) {
        return repository.findById(id);
    }

    public NoleggioTrattativa create(User user, String nome, String cognome, String cellulare,
                                      String email, String marchio, String modello, String note,
                                      String fonte, String stato, LocalDate dataRichiamo,
                                      String noteFallimento, String tipoCliente,
                                      String linkLeadspark, String linkAutoRichiesta) {
        NoleggioTrattativa t = new NoleggioTrattativa();
        t.setUser(user);
        t.setNome(nome);
        t.setCognome(cognome);
        t.setCellulare(cellulare);
        t.setEmail(email);
        t.setMarchio(marchio);
        t.setModello(modello);
        t.setNote(note);
        t.setFonte(fonte);
        t.setStato(stato != null ? stato : "SOLO_INFO");
        t.setDataRichiamo(dataRichiamo);
        t.setNoteFallimento(noteFallimento);
        t.setTipoCliente(tipoCliente);
        t.setLinkLeadspark(linkLeadspark);
        t.setLinkAutoRichiesta(linkAutoRichiesta);
        t.setCreatedAt(LocalDateTime.now());
        t.setUpdatedAt(LocalDateTime.now());
        return repository.save(t);
    }

    public NoleggioTrattativa update(NoleggioTrattativa t) {
        return repository.save(t);
    }

    public void delete(Long id) {
        repository.deleteById(id);
    }
}
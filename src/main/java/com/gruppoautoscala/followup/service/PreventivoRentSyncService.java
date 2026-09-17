package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.NoleggioTrattativa;
import com.gruppoautoscala.followup.model.PreventivoTelefonico;
import com.gruppoautoscala.followup.repository.NoleggioTrattativaRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

// Sincronizza automaticamente i Preventivi Telefonici di tipo NOLEGGIO con
// una trattativa nella sezione Rent — creata alla prima occasione
// (qualunque sia lo stato) e poi aggiornata SOLO nello stato/data richiamo
// ad ogni cambio successivo (creazione, import, cambio stato manuale). Non
// tocca MAI nome/cognome/marchio/modello di una trattativa gia' esistente,
// per non cancellare correzioni fatte a mano dentro Rent.
//
// Mappatura stato Preventivo -> stato Rent, come concordato:
//   GENERATO             -> DA_RICHIAMARE (con la data ricontatto se nota)
//   TRATTATIVA_GENERATA  -> TRATTATIVA_IN_CORSO
//   CHIUSA               -> CONCLUSA
//   FALLITA               -> FALLITO
//   NON_INTERESSATO       -> FALLITO
@Service
public class PreventivoRentSyncService {

    private static final ZoneId ZONA_ITALIA = ZoneId.of("Europe/Rome");

    @Autowired private NoleggioTrattativaRepository noleggioTrattativaRepository;

    public void sync(PreventivoTelefonico p) {
        // Solo i preventivi Noleggio generano/aggiornano una trattativa Rent.
        if (!"NOLEGGIO".equals(p.getTipo())) return;

        String nuovoStato;
        LocalDate dataRichiamo = null;

        switch (p.getStatus()) {
            case "GENERATO":
                nuovoStato = "DA_RICHIAMARE";
                // Se il preventivo ha una data (da "Data ricontatto" import,
                // o la data di creazione se inserito a mano) la usiamo come
                // data di richiamo; altrimenti Rent la accetta comunque
                // vuota su questo percorso automatico (bypassiamo qui il
                // controllo che il form manuale applica invece sempre).
                dataRichiamo = p.getCreatedAt() != null ? p.getCreatedAt().toLocalDate() : null;
                break;
            case "TRATTATIVA_GENERATA":
                nuovoStato = "TRATTATIVA_IN_CORSO";
                break;
            case "CHIUSA":
                nuovoStato = "CONCLUSA";
                break;
            case "FALLITA":
            case "NON_INTERESSATO":
                nuovoStato = "FALLITO";
                break;
            default:
                // Stato non mappato/sconosciuto: non tocchiamo Rent.
                return;
        }

        LocalDateTime now = LocalDateTime.now(ZONA_ITALIA);
        Optional<NoleggioTrattativa> existingOpt = noleggioTrattativaRepository.findBySourcePreventivoId(p.getId());

        NoleggioTrattativa t;
        if (existingOpt.isEmpty()) {
            t = new NoleggioTrattativa();
            t.setUser(p.getUser());
            t.setNome(p.getClienteNome());
            t.setCognome(p.getClienteCognome());
            String tel = p.getTelefono();
            t.setCellulare(tel != null && !tel.isBlank() ? tel : "N/D");
            t.setMarchio(p.getMarca());
            t.setModello(p.getModello());
            t.setLinkLeadspark(p.getLinkLead());
            t.setFonte("Preventivo Telefonico");
            t.setSourcePreventivoId(p.getId());
            t.setCreatedAt(now);
        } else {
            // Trattativa gia' esistente: si tocca SOLO stato/data richiamo,
            // mai gli altri campi — potrebbero essere stati corretti a mano
            // dentro Rent nel frattempo.
            t = existingOpt.get();
        }

        t.setStato(nuovoStato);
        t.setDataRichiamo(dataRichiamo);
        t.setUpdatedAt(now);
        // Marca il momento di QUESTA sincronizzazione automatica: confrontato
        // con updatedAt in futuro per capire se qualcuno tocchera' la
        // trattativa dentro Rent DOPO questo istante (modifica manuale).
        t.setLastAutoSyncAt(now);

        noleggioTrattativaRepository.save(t);
    }

    public Optional<NoleggioTrattativa> findLinked(Long preventivoId) {
        return noleggioTrattativaRepository.findBySourcePreventivoId(preventivoId);
    }
}
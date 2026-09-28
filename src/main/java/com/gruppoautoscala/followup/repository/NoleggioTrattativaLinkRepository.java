package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.NoleggioTrattativa;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

// Repository aggiuntivo (oltre a NoleggioTrattativaRepository) usato SOLO
// per la lista dei Preventivi Telefonici: recupera in UNA query le
// trattative Rent collegate a un intero gruppo di preventivi. Prima la
// lista faceva una query separata per ogni preventivo (findBySourcePreventivoId
// dentro un ciclo) — con centinaia di righe e il database lontano dal
// server, erano centinaia di andate e ritorno in sequenza.
@Repository
public interface NoleggioTrattativaLinkRepository extends JpaRepository<NoleggioTrattativa, Long> {
    List<NoleggioTrattativa> findBySourcePreventivoIdIn(Collection<Long> sourcePreventivoIds);
}
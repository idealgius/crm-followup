package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.NoleggioTrattativa;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface NoleggioTrattativaRepository extends JpaRepository<NoleggioTrattativa, Long> {

    // Trova la trattativa generata automaticamente da un dato Preventivo
    // Telefonico — usata dal servizio di sincronizzazione per capire se
    // crearne una nuova o aggiornare quella gia' esistente.
    Optional<NoleggioTrattativa> findBySourcePreventivoId(Long sourcePreventivoId);
}
package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.PreventivoTelefonico;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;

public interface PreventivoTelefonicoRepository extends JpaRepository<PreventivoTelefonico, Long> {

    // JOIN FETCH su user e lastModifiedBy per evitare N+1 quando il
    // controller costruisce la risposta (stesso problema gia' risolto per
    // FollowUpRepository, WaitingEntryRepository, ecc.).
    @Query("SELECT p FROM PreventivoTelefonico p " +
           "JOIN FETCH p.user " +
           "LEFT JOIN FETCH p.lastModifiedBy " +
           "WHERE p.createdAt >= :from AND p.createdAt < :to " +
           "ORDER BY p.createdAt DESC")
    List<PreventivoTelefonico> findByCreatedAtBetweenWithUser(@Param("from") LocalDateTime from,
                                                                @Param("to") LocalDateTime to);

    // Usata per i grafici "storico totale" (es. badge "Totale storico" gia'
    // presente in Registro Contatti), che contano su tutto lo storico e non
    // solo sul periodo filtrato a schermo.
    @Query("SELECT p FROM PreventivoTelefonico p " +
           "JOIN FETCH p.user " +
           "LEFT JOIN FETCH p.lastModifiedBy " +
           "ORDER BY p.createdAt DESC")
    List<PreventivoTelefonico> findAllWithUser();

    // Deduplica import: controlla se esiste gia' un preventivo per questo
    // identificativo lead prima di crearne uno nuovo.
    java.util.Optional<PreventivoTelefonico> findBySourceLeadId(String sourceLeadId);
}
package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.WaitingEntry;
import com.gruppoautoscala.followup.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface WaitingEntryRepository extends JpaRepository<WaitingEntry, Long> {
    List<WaitingEntry> findByStatus(String status);
    List<WaitingEntry> findByUser(User user);
    List<WaitingEntry> findByFullNameContainingIgnoreCase(String name);

    // NUOVO (fix performance): findAll() è chiamato da GET /api/waiting
    // (la lista principale, aperta ad ogni accesso alla sezione Recall) e
    // da StatsService. Da quando WaitingEntry ha recallHistory (relazione
    // LAZY, per il badge "N recall precedenti" su ogni card), il vecchio
    // findAll() senza JOIN FETCH faceva una query IN PIÙ per ogni singolo
    // cliente della lista solo per sapere quanti recall precedenti avesse
    // — con 50 clienti, 50 query extra ad ogni apertura. Sovrascrivendo
    // findAll() con un JOIN FETCH esplicito, tutto arriva in una sola
    // query indipendentemente da chi la chiama.
    @Override
    @Query("SELECT DISTINCT w FROM WaitingEntry w " +
           "LEFT JOIN FETCH w.recallHistory " +
           "LEFT JOIN FETCH w.user " +
           "LEFT JOIN FETCH w.lastModifiedBy")
    List<WaitingEntry> findAll();

    // NUOVO (fix performance report giornaliero): stesso principio di
    // FollowUpStepRepository.findByExecutedAtBetween — query mirata invece
    // di findAll() + filtro in Java.
    List<WaitingEntry> findByUpdatedAtBetween(LocalDateTime from, LocalDateTime to);
}
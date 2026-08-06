package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.RecallFollowUp;
import com.gruppoautoscala.followup.model.RecallFollowUpStep;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface RecallFollowUpStepRepository extends JpaRepository<RecallFollowUpStep, Long> {

    // NUOVO: stesso fix N+1 — queste due alimentano il calendario (conteggi
    // del mese) e il click sul giorno (lista clienti), le più chiamate.
    @Query("SELECT s FROM RecallFollowUpStep s " +
           "JOIN FETCH s.recallFollowUp rfu " +
           "JOIN FETCH rfu.originalFollowUp fu " +
           "JOIN FETCH fu.customer " +
           "WHERE s.scheduledDate BETWEEN :from AND :to")
    List<RecallFollowUpStep> findByScheduledDateBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("SELECT s FROM RecallFollowUpStep s " +
           "JOIN FETCH s.recallFollowUp rfu " +
           "JOIN FETCH rfu.originalFollowUp fu " +
           "JOIN FETCH fu.customer " +
           "WHERE s.scheduledDate = :date")
    List<RecallFollowUpStep> findByScheduledDate(@Param("date") LocalDate date);

    List<RecallFollowUpStep> findByRecallFollowUpAndStepNumber(RecallFollowUp recallFollowUp, Integer stepNumber);

    // NUOVO (fix performance report giornaliero): query mirata + JOIN FETCH
    // per evitare N+1 su recallFollowUp -> originalFollowUp -> customer.
    @Query("SELECT s FROM RecallFollowUpStep s " +
           "JOIN FETCH s.recallFollowUp rfu " +
           "JOIN FETCH rfu.originalFollowUp fu " +
           "JOIN FETCH fu.customer " +
           "WHERE s.executedAt BETWEEN :from AND :to")
    List<RecallFollowUpStep> findByExecutedAtBetween(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
}
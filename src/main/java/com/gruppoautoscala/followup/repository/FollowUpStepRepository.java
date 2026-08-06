package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.FollowUpStep;
import com.gruppoautoscala.followup.model.FollowUp;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface FollowUpStepRepository extends JpaRepository<FollowUpStep, Long> {
    List<FollowUpStep> findByFollowUp(FollowUp followUp);
    List<FollowUpStep> findByFollowUpOrderByStepNumber(FollowUp followUp);
    List<FollowUpStep> findByFollowUpIn(List<FollowUp> followUps);

    // NUOVO (fix performance report giornaliero): prima si scaricava
    // findAll() — l'INTERA tabella — per poi filtrare in Java. Ora il
    // filtro sulla data lo fa il database, e JOIN FETCH carica in un colpo
    // solo follow-up/cliente/consulente, evitando una query aggiuntiva per
    // ogni riga (N+1) quando il report legge questi campi.
    @Query("SELECT s FROM FollowUpStep s " +
           "JOIN FETCH s.followUp fu " +
           "JOIN FETCH fu.customer " +
           "WHERE s.executedAt BETWEEN :from AND :to")
    List<FollowUpStep> findByExecutedAtBetween(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
}
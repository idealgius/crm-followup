package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.FollowUp;
import com.gruppoautoscala.followup.model.RecallFollowUp;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface RecallFollowUpRepository extends JpaRepository<RecallFollowUp, Long> {

    // NUOVO (stesso fix N+1 di FollowUpRepository): originalFollowUp e, a
    // cascata, customer/user su di esso, vengono comunque caricati (EAGER)
    // — con JOIN FETCH in un colpo solo invece di query aggiuntive.
    @Query("SELECT r FROM RecallFollowUp r " +
           "JOIN FETCH r.originalFollowUp fu " +
           "JOIN FETCH fu.customer " +
           "JOIN FETCH fu.user " +
           "WHERE r.originalFollowUp = :originalFollowUp")
    Optional<RecallFollowUp> findByOriginalFollowUp(@Param("originalFollowUp") FollowUp originalFollowUp);
}
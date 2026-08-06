package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.FollowUp;
import com.gruppoautoscala.followup.model.RecallFollowUp;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface RecallFollowUpRepository extends JpaRepository<RecallFollowUp, Long> {
    Optional<RecallFollowUp> findByOriginalFollowUp(FollowUp originalFollowUp);
}
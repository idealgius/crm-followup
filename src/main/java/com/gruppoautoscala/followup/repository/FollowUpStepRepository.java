package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.FollowUpStep;
import com.gruppoautoscala.followup.model.FollowUp;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface FollowUpStepRepository extends JpaRepository<FollowUpStep, Long> {
    List<FollowUpStep> findByFollowUp(FollowUp followUp);
    List<FollowUpStep> findByFollowUpOrderByStepNumber(FollowUp followUp);
}
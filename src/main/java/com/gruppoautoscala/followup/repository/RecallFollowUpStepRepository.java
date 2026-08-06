package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.RecallFollowUp;
import com.gruppoautoscala.followup.model.RecallFollowUpStep;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.time.LocalDate;
import java.util.List;

@Repository
public interface RecallFollowUpStepRepository extends JpaRepository<RecallFollowUpStep, Long> {
    List<RecallFollowUpStep> findByScheduledDateBetween(LocalDate from, LocalDate to);
    List<RecallFollowUpStep> findByScheduledDate(LocalDate date);
    List<RecallFollowUpStep> findByRecallFollowUpAndStepNumber(RecallFollowUp recallFollowUp, Integer stepNumber);
}
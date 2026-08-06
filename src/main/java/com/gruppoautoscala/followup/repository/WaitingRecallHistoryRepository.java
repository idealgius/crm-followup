package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.WaitingRecallHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface WaitingRecallHistoryRepository extends JpaRepository<WaitingRecallHistory, Long> {
}
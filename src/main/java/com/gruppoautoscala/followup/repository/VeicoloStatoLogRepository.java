package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.VeicoloStatoLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface VeicoloStatoLogRepository extends JpaRepository<VeicoloStatoLog, Long> {
}
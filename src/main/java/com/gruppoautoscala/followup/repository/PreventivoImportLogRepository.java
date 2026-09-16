package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.PreventivoImportLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;

public interface PreventivoImportLogRepository extends JpaRepository<PreventivoImportLog, Long> {

    @Query("SELECT l FROM PreventivoImportLog l JOIN FETCH l.importedBy ORDER BY l.importedAt DESC")
    List<PreventivoImportLog> findAllWithUser();
}
package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.PreventivoTelefonico;
import com.gruppoautoscala.followup.model.PreventivoTelefonicoStatusHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.Collection;
import java.util.List;

public interface PreventivoTelefonicoStatusHistoryRepository extends JpaRepository<PreventivoTelefonicoStatusHistory, Long> {

    // Batch su una lista di preventivi (usata dal controller per non fare
    // una query per ogni riga — stesso pattern di
    // FollowUpStepRepository.findByFollowUpIn).
    @Query("SELECT h FROM PreventivoTelefonicoStatusHistory h " +
           "JOIN FETCH h.changedBy " +
           "WHERE h.preventivo IN :preventivi " +
           "ORDER BY h.changedAt ASC")
    List<PreventivoTelefonicoStatusHistory> findByPreventivoIn(Collection<PreventivoTelefonico> preventivi);

    List<PreventivoTelefonicoStatusHistory> findByPreventivoOrderByChangedAtAsc(PreventivoTelefonico preventivo);
}
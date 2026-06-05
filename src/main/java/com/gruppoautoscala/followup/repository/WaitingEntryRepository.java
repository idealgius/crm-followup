package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.WaitingEntry;
import com.gruppoautoscala.followup.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface WaitingEntryRepository extends JpaRepository<WaitingEntry, Long> {
    List<WaitingEntry> findByStatus(String status);
    List<WaitingEntry> findByUser(User user);
    List<WaitingEntry> findByFullNameContainingIgnoreCase(String name);
}
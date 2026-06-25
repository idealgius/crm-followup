package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.ContactLog;
import com.gruppoautoscala.followup.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface ContactLogRepository extends JpaRepository<ContactLog, Long> {
    List<ContactLog> findByOrderByContactDateAsc();
    List<ContactLog> findByContactDateBetweenOrderByContactDateAsc(LocalDateTime from, LocalDateTime to);
    List<ContactLog> findByUserOrderByContactDateAsc(User user);

    @Query("SELECT c.category, COUNT(c) FROM ContactLog c GROUP BY c.category")
    List<Object[]> countByCategory();

    @Query("SELECT c.category, COUNT(c) FROM ContactLog c WHERE c.contactDate BETWEEN :from AND :to GROUP BY c.category")
    List<Object[]> countByCategoryBetween(LocalDateTime from, LocalDateTime to);
}
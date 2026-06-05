package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.FollowUp;
import com.gruppoautoscala.followup.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.time.LocalDate;
import java.util.List;

@Repository
public interface FollowUpRepository extends JpaRepository<FollowUp, Long> {
    List<FollowUp> findByWorkDate(LocalDate workDate);
    List<FollowUp> findByUser(User user);
    List<FollowUp> findByUserAndWorkDate(User user, LocalDate workDate);
    List<FollowUp> findByWorkDateBetween(LocalDate from, LocalDate to);
    List<FollowUp> findByUserAndWorkDateBetween(User user, LocalDate from, LocalDate to);
}
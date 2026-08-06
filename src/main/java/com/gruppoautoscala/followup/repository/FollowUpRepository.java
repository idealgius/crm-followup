package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.FollowUp;
import com.gruppoautoscala.followup.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.time.LocalDate;
import java.util.List;

@Repository
public interface FollowUpRepository extends JpaRepository<FollowUp, Long> {

    // NUOVO (fix performance — dashboard lenta "come sempre"): customer e
    // user sono relazioni EAGER su FollowUp, quindi Hibernate le carica
    // comunque anche se il codice Java non le tocca esplicitamente — ma
    // SENZA JOIN FETCH lo fa con una query IN PIÙ per ognuna, per OGNI
    // riga restituita (N+1 classico: 100 follow-up nel mese = 200+ query
    // extra solo per aprire il calendario). Con JOIN FETCH, Hibernate le
    // porta dentro alla stessa query, una sola volta.
    @Query("SELECT f FROM FollowUp f JOIN FETCH f.customer JOIN FETCH f.user WHERE f.workDate = :workDate")
    List<FollowUp> findByWorkDate(@Param("workDate") LocalDate workDate);

    @Query("SELECT f FROM FollowUp f JOIN FETCH f.customer JOIN FETCH f.user WHERE f.user = :user")
    List<FollowUp> findByUser(@Param("user") User user);

    @Query("SELECT f FROM FollowUp f JOIN FETCH f.customer JOIN FETCH f.user WHERE f.user = :user AND f.workDate = :workDate")
    List<FollowUp> findByUserAndWorkDate(@Param("user") User user, @Param("workDate") LocalDate workDate);

    @Query("SELECT f FROM FollowUp f JOIN FETCH f.customer JOIN FETCH f.user WHERE f.workDate BETWEEN :from AND :to")
    List<FollowUp> findByWorkDateBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("SELECT f FROM FollowUp f JOIN FETCH f.customer JOIN FETCH f.user WHERE f.user = :user AND f.workDate BETWEEN :from AND :to")
    List<FollowUp> findByUserAndWorkDateBetween(@Param("user") User user, @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("SELECT f FROM FollowUp f JOIN FETCH f.customer JOIN FETCH f.user WHERE LOWER(f.customer.fullName) LIKE LOWER(CONCAT('%', :name, '%'))")
    List<FollowUp> findByCustomerFullNameContainingIgnoreCase(@Param("name") String name);

    @Query("SELECT f FROM FollowUp f JOIN FETCH f.customer JOIN FETCH f.user WHERE f.customer.phone = :phone")
    List<FollowUp> findByCustomerPhone(@Param("phone") String phone);

    @Query("SELECT f FROM FollowUp f JOIN FETCH f.customer JOIN FETCH f.user WHERE f.workDate BETWEEN :from AND :to " +
           "AND (:consultant IS NULL OR :consultant = '' OR f.consultantName = :consultant)")
    List<FollowUp> findByWorkDateBetweenAndConsultant(
            @Param("from") LocalDate from,
            @Param("to") LocalDate to,
            @Param("consultant") String consultant);
}
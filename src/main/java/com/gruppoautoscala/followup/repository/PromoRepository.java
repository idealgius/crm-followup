package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.Promo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.time.LocalDate;
import java.util.List;

@Repository
public interface PromoRepository extends JpaRepository<Promo, Long> {
    List<Promo> findByStatoOrderByDataScadenzaAsc(String stato);
    List<Promo> findByStatoInOrderByDataScadenzaDesc(List<String> stati);
    List<Promo> findByDataScadenzaBeforeAndStato(LocalDate date, String stato);
}
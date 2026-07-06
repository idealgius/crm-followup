package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.PromoContact;
import com.gruppoautoscala.followup.model.Promo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface PromoContactRepository extends JpaRepository<PromoContact, Long> {
    List<PromoContact> findByPromo(Promo promo);
    List<PromoContact> findByPromoId(Long promoId);
}
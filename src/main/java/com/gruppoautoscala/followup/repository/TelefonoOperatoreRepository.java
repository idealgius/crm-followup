package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.TelefonoOperatore;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface TelefonoOperatoreRepository extends JpaRepository<TelefonoOperatore, Long> {
    Optional<TelefonoOperatore> findByInterno(String interno);

    // JOIN FETCH per evitare N+1 sull'elenco mostrato nel pannello admin
    // (stesso principio già applicato altrove nel progetto).
    @Query("SELECT t FROM TelefonoOperatore t JOIN FETCH t.user")
    List<TelefonoOperatore> findAllConOperatore();
}
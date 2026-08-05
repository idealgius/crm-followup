package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.VeicoloConsegna;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface VeicoloConsegnaRepository extends JpaRepository<VeicoloConsegna, Long> {

    List<VeicoloConsegna> findByStatoPratica(String statoPratica);

    List<VeicoloConsegna> findByStatoPraticaAndSedeConsegnaIn(String statoPratica, List<String> sedi);

    // CONSEGNATE: filtro temporale "intelligente" per mese o anno intero,
    // basato sulla data di consegna EFFETTIVA (non sull'appuntamento).
    List<VeicoloConsegna> findByStatoPraticaAndDataConsegnaEffettivaBetween(
            String statoPratica, LocalDateTime from, LocalDateTime to);

    List<VeicoloConsegna> findByStatoPraticaAndSedeConsegnaInAndDataConsegnaEffettivaBetween(
            String statoPratica, List<String> sedi, LocalDateTime from, LocalDateTime to);

    // CALENDARIO: tutte le pratiche IN_CORSO con un appuntamento fissato
    // nell'intervallo richiesto.
    @Query("SELECT v FROM VeicoloConsegna v WHERE v.statoPratica = 'IN_CORSO' " +
           "AND v.dataAppuntamentoConsegna BETWEEN :from AND :to")
    List<VeicoloConsegna> findAppuntamentiTraLeDate(@Param("from") LocalDate from, @Param("to") LocalDate to);

    // Ricerca libera per intestatario, targa o numero cliente (usata in
    // ogni scheda, come richiesto).
    @Query("SELECT v FROM VeicoloConsegna v WHERE " +
           "LOWER(v.intestatario) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(v.targa) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(v.numeroCliente) LIKE LOWER(CONCAT('%', :q, '%'))")
    List<VeicoloConsegna> search(@Param("q") String q);
}
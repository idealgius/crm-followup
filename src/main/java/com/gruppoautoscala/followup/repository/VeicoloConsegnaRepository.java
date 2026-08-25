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

    // NUOVO (fix performance): JOIN FETCH sull'operatore (relazione singola,
    // nessun conflitto con le due liste — quelle sono gestite dal
    // @Fetch(SUBSELECT) direttamente sull'entità VeicoloConsegna).
    @Query("SELECT v FROM VeicoloConsegna v JOIN FETCH v.user WHERE v.statoPratica = :statoPratica")
    List<VeicoloConsegna> findByStatoPratica(@Param("statoPratica") String statoPratica);

    @Query("SELECT v FROM VeicoloConsegna v JOIN FETCH v.user WHERE v.statoPratica = :statoPratica AND v.sedeConsegna IN :sedi")
    List<VeicoloConsegna> findByStatoPraticaAndSedeConsegnaIn(@Param("statoPratica") String statoPratica, @Param("sedi") List<String> sedi);

    // CONSEGNATE: filtro temporale "intelligente" per mese o anno intero,
    // basato sulla data di consegna EFFETTIVA (non sull'appuntamento).
    @Query("SELECT v FROM VeicoloConsegna v JOIN FETCH v.user WHERE v.statoPratica = :statoPratica AND v.dataConsegnaEffettiva BETWEEN :from AND :to")
    List<VeicoloConsegna> findByStatoPraticaAndDataConsegnaEffettivaBetween(
            @Param("statoPratica") String statoPratica, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Query("SELECT v FROM VeicoloConsegna v JOIN FETCH v.user WHERE v.statoPratica = :statoPratica AND v.sedeConsegna IN :sedi AND v.dataConsegnaEffettiva BETWEEN :from AND :to")
    List<VeicoloConsegna> findByStatoPraticaAndSedeConsegnaInAndDataConsegnaEffettivaBetween(
            @Param("statoPratica") String statoPratica, @Param("sedi") List<String> sedi, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    // CALENDARIO: tutte le pratiche IN_CORSO con un appuntamento fissato
    // nell'intervallo richiesto.
    @Query("SELECT v FROM VeicoloConsegna v JOIN FETCH v.user WHERE v.statoPratica = 'IN_CORSO' " +
           "AND v.dataAppuntamentoConsegna BETWEEN :from AND :to")
    List<VeicoloConsegna> findAppuntamentiTraLeDate(@Param("from") LocalDate from, @Param("to") LocalDate to);

    // Ricerca libera per intestatario, targa o numero cliente (usata in
    // ogni scheda, come richiesto).
    @Query("SELECT v FROM VeicoloConsegna v JOIN FETCH v.user WHERE " +
           "LOWER(v.intestatario) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(v.targa) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(v.numeroCliente) LIKE LOWER(CONCAT('%', :q, '%'))")
    List<VeicoloConsegna> search(@Param("q") String q);
}
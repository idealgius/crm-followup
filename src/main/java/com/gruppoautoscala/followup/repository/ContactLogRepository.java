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
    // NOTA PERFORMANCE: con l'aggiunta delle relazioni verso User per la
    // gestione allert (in gestione da, gestita da, note inserita/modificata
    // da, più il ManyToMany alertRecipients), le query derivate "nude" (senza
    // fetch join) causavano un problema N+1: per ogni ContactLog caricato,
    // Hibernate eseguiva una SELECT separata per OGNI relazione EAGER (fino
    // a 7-8 query aggiuntive per riga). Con centinaia di contatti questo
    // rallentava drasticamente il caricamento del Registro Contatti.
    // Le due query sotto (usate da getAll() e getByDateRange(), quindi il
    // percorso "caldo" del caricamento) ora fanno LEFT JOIN FETCH di tutte
    // le relazioni User in un'UNICA query SQL. DISTINCT è necessario perché
    // alertRecipients è una collection (ManyToMany): senza DISTINCT lo stesso
    // ContactLog comparirebbe più volte, una per ogni destinatario.
    @Query("SELECT DISTINCT c FROM ContactLog c " +
           "LEFT JOIN FETCH c.user " +
           "LEFT JOIN FETCH c.acquistoAlertInGestioneDa " +
           "LEFT JOIN FETCH c.acquistoAlertGestitaDa " +
           "LEFT JOIN FETCH c.acquistoAlertNoteGestioneInseritaDa " +
           "LEFT JOIN FETCH c.acquistoAlertNoteGestitaInseritaDa " +
           "LEFT JOIN FETCH c.acquistoAlertNoteGestioneModificataDa " +
           "LEFT JOIN FETCH c.acquistoAlertNoteGestitaModificataDa " +
           "LEFT JOIN FETCH c.alertRecipients " +
           "ORDER BY c.contactDate ASC")
    List<ContactLog> findByOrderByContactDateAsc();

    @Query("SELECT DISTINCT c FROM ContactLog c " +
           "LEFT JOIN FETCH c.user " +
           "LEFT JOIN FETCH c.acquistoAlertInGestioneDa " +
           "LEFT JOIN FETCH c.acquistoAlertGestitaDa " +
           "LEFT JOIN FETCH c.acquistoAlertNoteGestioneInseritaDa " +
           "LEFT JOIN FETCH c.acquistoAlertNoteGestitaInseritaDa " +
           "LEFT JOIN FETCH c.acquistoAlertNoteGestioneModificataDa " +
           "LEFT JOIN FETCH c.acquistoAlertNoteGestitaModificataDa " +
           "LEFT JOIN FETCH c.alertRecipients " +
           "WHERE c.contactDate BETWEEN :from AND :to " +
           "ORDER BY c.contactDate ASC")
    List<ContactLog> findByContactDateBetweenOrderByContactDateAsc(LocalDateTime from, LocalDateTime to);

    // ===== ICONA STORICO CLIENTE =====
    // Query leggere: restituiscono solo AGGREGATI (numero/nome+cognome +
    // quante volte compaiono), non i record interi — usate per decidere,
    // su TUTTA la storia del database, se mostrare l'icona 📁 accanto a un
    // cliente (solo se ha davvero più di una registrazione), senza dover
    // interrogare il database una volta per ogni riga della tabella.
    @Query("SELECT c.clienteNumero FROM ContactLog c WHERE c.clienteNumero IS NOT NULL AND c.clienteNumero <> '' GROUP BY c.clienteNumero HAVING COUNT(c) > 1")
    List<String> findNumeriConPiuContatti();

    @Query("SELECT LOWER(TRIM(c.clienteNome)) || '|' || LOWER(TRIM(c.clienteCognome)) FROM ContactLog c WHERE c.clienteNome IS NOT NULL AND c.clienteCognome IS NOT NULL AND c.clienteNome <> '' AND c.clienteCognome <> '' GROUP BY LOWER(TRIM(c.clienteNome)), LOWER(TRIM(c.clienteCognome)) HAVING COUNT(c) > 1")
    List<String> findNomiConPiuContatti();

    List<ContactLog> findByUserOrderByContactDateAsc(User user);

    @Query("SELECT c.category, COUNT(c) FROM ContactLog c GROUP BY c.category")
    List<Object[]> countByCategory();

    @Query("SELECT c.category, COUNT(c) FROM ContactLog c WHERE c.contactDate BETWEEN :from AND :to GROUP BY c.category")
    List<Object[]> countByCategoryBetween(LocalDateTime from, LocalDateTime to);

    // ===== STORICO CLIENTE =====
    // Cerca su TUTTO il database (non solo il periodo attualmente caricato
    // in memoria dal frontend) qualsiasi contatto dello stesso cliente,
    // identificato o per nome+cognome (case/spazi insensibile) o per lo
    // stesso numero di telefono. Usata sia per l'avviso anti-doppione al
    // salvataggio, sia per il pulsante "Storico" che mostra tutte le
    // chiamate passate di un cliente.
    //
    // FIX: query unica precedente combinava i due criteri con OR e passava
    // NULL dentro LOWER(TRIM(:nome)) quando si cercava solo per numero (o
    // viceversa) — PostgreSQL non riesce a determinare il tipo di un
    // parametro NULL usato dentro una funzione e risponde con errore 500
    // ("could not determine data type of parameter"). Due query separate,
    // ciascuna invocata solo quando i suoi parametri sono davvero
    // valorizzati (vedi ContactLogService), evitano del tutto il problema.
    @Query("SELECT DISTINCT c FROM ContactLog c " +
           "LEFT JOIN FETCH c.user " +
           "LEFT JOIN FETCH c.acquistoAlertInGestioneDa " +
           "LEFT JOIN FETCH c.acquistoAlertGestitaDa " +
           "LEFT JOIN FETCH c.acquistoAlertNoteGestioneInseritaDa " +
           "LEFT JOIN FETCH c.acquistoAlertNoteGestitaInseritaDa " +
           "LEFT JOIN FETCH c.acquistoAlertNoteGestioneModificataDa " +
           "LEFT JOIN FETCH c.acquistoAlertNoteGestitaModificataDa " +
           "LEFT JOIN FETCH c.alertRecipients " +
           "WHERE c.clienteNumero = :numero " +
           "ORDER BY c.contactDate DESC")
    List<ContactLog> findByClienteNumero(String numero);

    @Query("SELECT DISTINCT c FROM ContactLog c " +
           "LEFT JOIN FETCH c.user " +
           "LEFT JOIN FETCH c.acquistoAlertInGestioneDa " +
           "LEFT JOIN FETCH c.acquistoAlertGestitaDa " +
           "LEFT JOIN FETCH c.acquistoAlertNoteGestioneInseritaDa " +
           "LEFT JOIN FETCH c.acquistoAlertNoteGestitaInseritaDa " +
           "LEFT JOIN FETCH c.acquistoAlertNoteGestioneModificataDa " +
           "LEFT JOIN FETCH c.acquistoAlertNoteGestitaModificataDa " +
           "LEFT JOIN FETCH c.alertRecipients " +
           "WHERE LOWER(TRIM(c.clienteNome)) = LOWER(TRIM(:nome)) " +
           "AND LOWER(TRIM(c.clienteCognome)) = LOWER(TRIM(:cognome)) " +
           "ORDER BY c.contactDate DESC")
    List<ContactLog> findByClienteNomeCognome(String nome, String cognome);
}
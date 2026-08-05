package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.VeicoloLavorazione;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface VeicoloLavorazioneRepository extends JpaRepository<VeicoloLavorazione, Long> {
}
package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.ServicePratica;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ServicePraticaRepository extends JpaRepository<ServicePratica, Long> {
    List<ServicePratica> findAllByOrderByCreatedAtDesc();
}
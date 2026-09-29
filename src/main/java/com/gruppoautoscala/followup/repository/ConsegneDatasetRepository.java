package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.ConsegneDataset;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ConsegneDatasetRepository extends JpaRepository<ConsegneDataset, String> {
}
package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.Customer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface CustomerRepository extends JpaRepository<Customer, Long> {
    List<Customer> findByFullNameContainingIgnoreCase(String name);
}
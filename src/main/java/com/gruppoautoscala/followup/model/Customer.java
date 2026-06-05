package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "customers")
public class Customer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "full_name", nullable = false, length = 150)
    private String fullName;

    @Column(length = 255)
    private String email;

    @Column(length = 30)
    private String phone;

    @Column(name = "email_only", nullable = false)
    private Boolean emailOnly = false;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
}
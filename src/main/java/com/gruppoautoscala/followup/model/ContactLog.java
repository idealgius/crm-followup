package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "contact_logs")
public class ContactLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 50)
    private String category;

    @Column(name = "other_note", length = 500)
    private String otherNote;

    @Column(name = "nominativo_appuntamento", length = 200)
    private String nominativoAppuntamento;

    @Column(name = "link_appuntamento", length = 500)
    private String linkAppuntamento;

    @Column(name = "contact_date", nullable = false)
    private LocalDateTime contactDate;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
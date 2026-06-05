package com.gruppoautoscala.followup.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "follow_up_steps")
public class FollowUpStep {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "follow_up_id", nullable = false)
    private FollowUp followUp;

    @Column(name = "step_number", nullable = false)
    private Integer stepNumber;

    @Column(name = "day_number", nullable = false)
    private Integer dayNumber;

    @Column(nullable = false, length = 20)
    private String channel;

    @Column(name = "scheduled_slot", length = 10)
    private String scheduledSlot;

    @Column(length = 20)
    private String outcome = "PENDING";

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(name = "executed_at")
    private LocalDateTime executedAt;
}
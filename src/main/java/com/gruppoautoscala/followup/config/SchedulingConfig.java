package com.gruppoautoscala.followup.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Abilita i task pianificati (@Scheduled) — usato dall'area Consegne per
 * rileggere il foglio Google ogni 5 minuti (vedi ConsegneService).
 * Innocuo anche se @EnableScheduling fosse gia' presente altrove.
 */
@Configuration
@EnableScheduling
public class SchedulingConfig {
}
package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.FollowUp;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.FollowUpRepository;
import com.gruppoautoscala.followup.repository.WaitingEntryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class StatsService {

    @Autowired
    private FollowUpRepository followUpRepository;

    @Autowired
    private WaitingEntryRepository waitingEntryRepository;

    public Map<String, Object> getFollowUpStats(LocalDate from, LocalDate to, User user) {
        List<FollowUp> followUps;
        if (user != null) {
            followUps = followUpRepository.findByUserAndWorkDateBetween(user, from, to);
        } else {
            followUps = followUpRepository.findByWorkDateBetween(from, to);
        }

        long total = followUps.size();
        long responded = followUps.stream()
                .filter(f -> "RESPONDED".equals(f.getStatus())).count();
        long appointments = followUps.stream()
                .filter(f -> f.getHasAppointment()).count();
        long abandoned = followUps.stream()
                .filter(f -> "ABANDONED".equals(f.getStatus())).count();

        double responseRate = total > 0 ? (double) responded / total * 100 : 0;
        double appointmentRate = total > 0 ? (double) appointments / total * 100 : 0;

        Map<String, Object> stats = new HashMap<>();
        stats.put("total", total);
        stats.put("responded", responded);
        stats.put("appointments", appointments);
        stats.put("abandoned", abandoned);
        stats.put("responseRate", Math.round(responseRate * 10.0) / 10.0);
        stats.put("appointmentRate", Math.round(appointmentRate * 10.0) / 10.0);
        return stats;
    }

    public Map<String, Object> getWaitingListStats() {
        long total = waitingEntryRepository.count();
        long waiting = waitingEntryRepository.findByStatus("WAITING").size();
        long called = waitingEntryRepository.findByStatus("CALLED").size();
        long appointments = waitingEntryRepository.findByStatus("APPOINTMENT").size();
        long interested = waitingEntryRepository.findByStatus("INTERESTED").size();
        long closed = waitingEntryRepository.findByStatus("CLOSED").size();

        double appointmentRate = total > 0 ? (double) appointments / total * 100 : 0;
        double interestRate = total > 0 ? (double) interested / total * 100 : 0;

        Map<String, Object> stats = new HashMap<>();
        stats.put("total", total);
        stats.put("waiting", waiting);
        stats.put("called", called);
        stats.put("appointments", appointments);
        stats.put("interested", interested);
        stats.put("closed", closed);
        stats.put("appointmentRate", Math.round(appointmentRate * 10.0) / 10.0);
        stats.put("interestRate", Math.round(interestRate * 10.0) / 10.0);
        return stats;
    }
}
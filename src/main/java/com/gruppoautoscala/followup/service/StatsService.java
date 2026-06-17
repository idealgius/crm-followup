package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.FollowUp;
import com.gruppoautoscala.followup.repository.FollowUpRepository;
import com.gruppoautoscala.followup.repository.WaitingEntryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class StatsService {

    @Autowired
    private FollowUpRepository followUpRepository;

    @Autowired
    private WaitingEntryRepository waitingEntryRepository;

    public List<FollowUp> getFilteredFollowUps(LocalDate from, LocalDate to, String consultantName) {
        return followUpRepository.findByWorkDateBetweenAndConsultant(from, to, consultantName);
    }

    public Map<String, Object> getFollowUpStats(LocalDate from, LocalDate to, String consultantName) {
        List<FollowUp> followUps = getFilteredFollowUps(from, to, consultantName);

        long total = followUps.size();
        long responded = followUps.stream()
                .filter(f -> "RESPONDED".equals(f.getStatus())).count();
        long appointments = followUps.stream()
                .filter(f -> Boolean.TRUE.equals(f.getHasAppointment())).count();
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

    public List<FollowUp> getFollowUpList(LocalDate from, LocalDate to, String consultantName, String type) {
        List<FollowUp> followUps = getFilteredFollowUps(from, to, consultantName);
        if ("responded".equals(type)) {
            return followUps.stream()
                    .filter(f -> "RESPONDED".equals(f.getStatus()))
                    .collect(Collectors.toList());
        }
        if ("appointments".equals(type)) {
            return followUps.stream()
                    .filter(f -> Boolean.TRUE.equals(f.getHasAppointment()))
                    .collect(Collectors.toList());
        }
        return followUps;
    }

    public Map<String, Object> getCalendarData(int year, int month, String consultantName) {
        LocalDate from = LocalDate.of(year, month, 1);
        LocalDate to = from.withDayOfMonth(from.lengthOfMonth());
        List<FollowUp> followUps = getFilteredFollowUps(from, to, consultantName);

        Map<LocalDate, List<FollowUp>> byDate = followUps.stream()
                .collect(Collectors.groupingBy(FollowUp::getWorkDate));

        Map<String, Object> days = new HashMap<>();
        for (Map.Entry<LocalDate, List<FollowUp>> entry : byDate.entrySet()) {
            List<FollowUp> dayItems = entry.getValue();
            Map<String, Object> dayInfo = new HashMap<>();
            dayInfo.put("count", dayItems.size());
            dayInfo.put("complete", isDayComplete(dayItems));
            days.put(entry.getKey().toString(), dayInfo);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("year", year);
        result.put("month", month);
        result.put("days", days);
        return result;
    }

    private boolean isDayComplete(List<FollowUp> followUps) {
        Map<String, List<FollowUp>> byConsultant = followUps.stream()
                .collect(Collectors.groupingBy(f ->
                        f.getConsultantName() != null && !f.getConsultantName().isBlank()
                                ? f.getConsultantName()
                                : "⚠️ Non assegnato"));

        return byConsultant.values().stream().allMatch(this::isConsultantGroupComplete);
    }

    private boolean isConsultantGroupComplete(List<FollowUp> items) {
        return items.stream().allMatch(f ->
                "RESPONDED".equals(f.getStatus()) ||
                "ABANDONED".equals(f.getStatus()) ||
                Boolean.TRUE.equals(f.getHasAppointment()));
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

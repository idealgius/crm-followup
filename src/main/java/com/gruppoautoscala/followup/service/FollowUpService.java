package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.Customer;
import com.gruppoautoscala.followup.model.FollowUp;
import com.gruppoautoscala.followup.model.FollowUpStep;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.FollowUpRepository;
import com.gruppoautoscala.followup.repository.FollowUpStepRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Service
public class FollowUpService {

    @Autowired
    private FollowUpRepository followUpRepository;

    @Autowired
    private FollowUpStepRepository followUpStepRepository;

    public FollowUp createFollowUp(Customer customer, User user, LocalDate workDate) {
        FollowUp followUp = new FollowUp();
        followUp.setCustomer(customer);
        followUp.setUser(user);
        followUp.setWorkDate(workDate);
        followUp.setStatus("IN_PROGRESS");
        followUp.setHasAppointment(false);
        FollowUp saved = followUpRepository.save(followUp);
        createSteps(saved, customer.getEmailOnly());
        return saved;
    }

    private void createSteps(FollowUp followUp, boolean emailOnly) {
        if (emailOnly) {
            for (int day = 1; day <= 3; day++) {
                FollowUpStep step = new FollowUpStep();
                step.setFollowUp(followUp);
                step.setStepNumber(day);
                step.setDayNumber(day);
                step.setChannel("EMAIL");
                step.setOutcome("PENDING");
                followUpStepRepository.save(step);
            }
        } else {
            int[][] steps = {
                {1, 1}, {2, 1}, {3, 2}, {4, 3}
            };
            String[] channels = {"CALL", "CALL", "CALL", "CALL"};
            String[] slots = {"MORNING", "AFTERNOON", null, null};

            for (int i = 0; i < steps.length; i++) {
                FollowUpStep step = new FollowUpStep();
                step.setFollowUp(followUp);
                step.setStepNumber(steps[i][0]);
                step.setDayNumber(steps[i][1]);
                step.setChannel(channels[i]);
                step.setScheduledSlot(slots[i]);
                step.setOutcome("PENDING");
                followUpStepRepository.save(step);
            }
        }
    }

    public List<FollowUp> getByDate(LocalDate date) {
        return followUpRepository.findByWorkDate(date);
    }

    public List<FollowUp> getByUserAndDate(User user, LocalDate date) {
        return followUpRepository.findByUserAndWorkDate(user, date);
    }

    public Optional<FollowUp> getById(Long id) {
        return followUpRepository.findById(id);
    }

    public FollowUp save(FollowUp followUp) {
        return followUpRepository.save(followUp);
    }

    public List<FollowUp> getByDateRange(LocalDate from, LocalDate to) {
        return followUpRepository.findByWorkDateBetween(from, to);
    }

    public List<FollowUp> getByUserAndDateRange(User user, LocalDate from, LocalDate to) {
        return followUpRepository.findByUserAndWorkDateBetween(user, from, to);
    }
}
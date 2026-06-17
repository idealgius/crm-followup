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

    public FollowUp createFollowUp(Customer customer, User user, LocalDate workDate, String consultantName) {
        FollowUp followUp = new FollowUp();
        followUp.setCustomer(customer);
        followUp.setUser(user);
        followUp.setWorkDate(workDate);
        followUp.setStatus("IN_PROGRESS");
        followUp.setHasAppointment(false);
        followUp.setConsultantName(consultantName);
        FollowUp saved = followUpRepository.save(followUp);
        createSteps(saved, customer.getEmailOnly());
        return saved;
    }

    private void createSteps(FollowUp followUp, boolean emailOnly) {
        if (emailOnly) {
            // Flusso solo email: 3 mail nei 3 giorni
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
            // Flusso standard:
            // Step 1 - Giorno 1 Mattina - CALL
            // Step 2 - Giorno 1 Pomeriggio - CALL
            // Step 3 - Giorno 2 - WHATSAPP o EMAIL
            // Step 4 - Giorno 3 - CALL
            Object[][] steps = {
                {1, 1, "CALL", "MORNING"},
                {2, 1, "CALL", "AFTERNOON"},
                {3, 2, "WHATSAPP", null},
                {4, 3, "CALL", null}
            };

            for (Object[] s : steps) {
                FollowUpStep step = new FollowUpStep();
                step.setFollowUp(followUp);
                step.setStepNumber((int) s[0]);
                step.setDayNumber((int) s[1]);
                step.setChannel((String) s[2]);
                step.setScheduledSlot((String) s[3]);
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

    public List<FollowUp> searchByCustomerName(String name) {
        return followUpRepository.findByCustomerFullNameContainingIgnoreCase(name);
    }

    public List<FollowUp> searchByCustomerPhone(String phone) {
        return followUpRepository.findByCustomerPhone(phone);
    }
}
package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.*;
import com.gruppoautoscala.followup.repository.RecallFollowUpRepository;
import com.gruppoautoscala.followup.repository.RecallFollowUpStepRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Optional;

@Service
public class RecallFollowUpService {

    @Autowired
    private RecallFollowUpRepository recallFollowUpRepository;

    @Autowired
    private RecallFollowUpStepRepository recallFollowUpStepRepository;

    // Regola non retroattiva: solo i follow-up caricati da questa data in poi
    // entrano nel flusso Recall Follow-up.
    private static final LocalDate CUTOFF_DATE = LocalDate.of(2026, 8, 24);

    // ===== CALCOLO DATA STEP 1 =====
    // Ven/Sab/Dom -> venerdì della settimana successiva.
    // Lun/Mar/Mer/Gio -> giovedì della settimana successiva.
    public LocalDate computeStep1Date(LocalDate loadedDate) {
        DayOfWeek dow = loadedDate.getDayOfWeek();
        if (dow == DayOfWeek.FRIDAY) return loadedDate.plusDays(7);
        if (dow == DayOfWeek.SATURDAY) return loadedDate.plusDays(6);
        if (dow == DayOfWeek.SUNDAY) return loadedDate.plusDays(5);
        // Lunedì..Giovedì: giovedì della STESSA settimana, poi +7
        LocalDate thisWeekThursday = loadedDate.with(TemporalAdjusters.nextOrSame(DayOfWeek.THURSDAY));
        return thisWeekThursday.plusDays(7);
    }

    // ===== CREAZIONE AUTOMATICA =====
    // Chiamato da FollowUpController quando un follow-up passa ad ABANDONED.
    // Non fa nulla se il follow-up è troppo vecchio (prima del cutoff) o se
    // esiste già un ciclo per quel follow-up (evita duplicati su doppio click).
    public Optional<RecallFollowUp> maybeCreateRecallFollowUp(FollowUp followUp) {
        if (followUp.getWorkDate().isBefore(CUTOFF_DATE)) return Optional.empty();
        if (recallFollowUpRepository.findByOriginalFollowUp(followUp).isPresent()) return Optional.empty();

        RecallFollowUp rfu = new RecallFollowUp();
        rfu.setOriginalFollowUp(followUp);
        rfu.setCurrentStep(1);
        rfu.setStatus("IN_CORSO");
        rfu.setResponded(false);
        rfu = recallFollowUpRepository.save(rfu);

        LocalDate step1Date = computeStep1Date(followUp.getWorkDate());
        createStepAttempts(rfu, 1, step1Date, Boolean.TRUE.equals(followUp.getCustomer().getEmailOnly()));
        return Optional.of(rfu);
    }

    private void createStepAttempts(RecallFollowUp rfu, int stepNumber, LocalDate date, boolean emailOnly) {
        if (emailOnly) {
            createAttempt(rfu, stepNumber, 1, "EMAIL", null, date);
        } else {
            String secondChannel = stepNumber == 2 ? "WHATSAPP" : "CALL";
            createAttempt(rfu, stepNumber, 1, "CALL", "MORNING", date);
            createAttempt(rfu, stepNumber, 2, secondChannel, "AFTERNOON", date);
        }
    }

    private void createAttempt(RecallFollowUp rfu, int stepNumber, int attemptNumber, String channel, String slot, LocalDate date) {
        RecallFollowUpStep step = new RecallFollowUpStep();
        step.setRecallFollowUp(rfu);
        step.setStepNumber(stepNumber);
        step.setAttemptNumber(attemptNumber);
        step.setChannel(channel);
        step.setScheduledSlot(slot);
        step.setScheduledDate(date);
        step.setOutcome("PENDING");
        recallFollowUpStepRepository.save(step);
    }

    // ===== ESITO DI UN TENTATIVO =====
    // Se ANSWERED: il ciclo si chiude come RISPOSTO, subito.
    // Se NO_ANSWER: solo quando ENTRAMBI i tentativi dello step corrente
    // (o l'unico, per Solo Email) sono NO_ANSWER, si avanza allo step
    // successivo (+7 giorni) o si chiude FALLITO se era già lo step 3.
    public RecallFollowUpStep setAttemptOutcome(RecallFollowUpStep step, String outcome, User actor) {
        step.setOutcome(outcome);
        step.setExecutedAt(LocalDateTime.now());
        step.setExecutedBy(actor);
        step = recallFollowUpStepRepository.save(step);

        RecallFollowUp rfu = step.getRecallFollowUp();
        if (!"IN_CORSO".equals(rfu.getStatus())) return step; // già chiuso, non fare nulla

        if ("ANSWERED".equals(outcome)) {
            rfu.setResponded(true);
            rfu.setStatus("RISPOSTO");
            rfu.setClosedAt(LocalDateTime.now());
            recallFollowUpRepository.save(rfu);
            return step;
        }

        if ("NO_ANSWER".equals(outcome)) {
            List<RecallFollowUpStep> attempts = recallFollowUpStepRepository
                .findByRecallFollowUpAndStepNumber(rfu, step.getStepNumber());
            boolean allNoAnswer = attempts.stream().allMatch(a -> "NO_ANSWER".equals(a.getOutcome()));
            if (allNoAnswer) {
                if (rfu.getCurrentStep() < 3) {
                    int nextStep = rfu.getCurrentStep() + 1;
                    LocalDate nextDate = step.getScheduledDate().plusDays(7);
                    rfu.setCurrentStep(nextStep);
                    recallFollowUpRepository.save(rfu);
                    createStepAttempts(rfu, nextStep, nextDate, Boolean.TRUE.equals(rfu.getOriginalFollowUp().getCustomer().getEmailOnly()));
                } else {
                    rfu.setStatus("FALLITO");
                    rfu.setClosedAt(LocalDateTime.now());
                    recallFollowUpRepository.save(rfu);
                }
            }
        }
        return step;
    }

    public Optional<RecallFollowUp> getById(Long id) {
        return recallFollowUpRepository.findById(id);
    }

    public RecallFollowUp save(RecallFollowUp rfu) {
        return recallFollowUpRepository.save(rfu);
    }

    public List<RecallFollowUpStep> getByDate(LocalDate date) {
        return recallFollowUpStepRepository.findByScheduledDate(date);
    }

    public List<RecallFollowUpStep> getByDateRange(LocalDate from, LocalDate to) {
        return recallFollowUpStepRepository.findByScheduledDateBetween(from, to);
    }
}
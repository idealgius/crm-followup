package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.ContactLog;
import com.gruppoautoscala.followup.model.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.util.List;

// Invia una mail di notifica quando viene inserito un nuovo allert nel
// Registro Contatti (categorie: Info Acquisto effettuato, Pratica Leasing,
// Pratica Finanziamento, Amministrazione). Chiamato da ContactLogController
// subito dopo la creazione del contatto, solo se acquistoAlert e' true.
//
// Una mail SEPARATA per ogni destinatario (non un unico invio con più "to"),
// cosi' il saluto iniziale ("Ciao <nome>") e' personalizzato per ciascuno.
//
// Un eventuale errore di invio (SMTP giu', credenziali sbagliate, indirizzo
// non valido) NON deve mai bloccare la creazione del contatto: ogni fallimento
// viene solo loggato come warning, la richiesta HTTP va comunque a buon fine.
@Service
public class AlertMailService {

    private static final Logger LOGGER = LoggerFactory.getLogger(AlertMailService.class);

    @Autowired
    private JavaMailSender mailSender;

    @Value("${app.mail.from}")
    private String fromAddress;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    public void notifyNewAlert(ContactLog contact, List<User> recipients) {
        if (recipients == null || recipients.isEmpty()) return;

        String nomeCompleto = ((contact.getClienteNome() != null ? contact.getClienteNome() : "") + " " +
                (contact.getClienteCognome() != null ? contact.getClienteCognome() : "")).trim();
        String subject = "\uD83D\uDD14 Nuovo Allert" + (nomeCompleto.isBlank() ? "" : " - " + nomeCompleto);
        String link = frontendUrl + "/?openAlert=" + contact.getId() + "#contacts";

        for (User recipient : recipients) {
            if (recipient == null || recipient.getEmail() == null || recipient.getEmail().isBlank()) continue;
            try {
                SimpleMailMessage message = new SimpleMailMessage();
                message.setFrom(fromAddress);
                message.setTo(recipient.getEmail());
                message.setSubject(subject);
                message.setText(buildBody(contact, recipient, nomeCompleto, link));
                mailSender.send(message);
            } catch (Exception e) {
                LOGGER.warn("Invio mail allert fallito per il contatto id={} verso {}: {}",
                        contact.getId(), recipient.getEmail(), e.getMessage());
            }
        }
    }

    private String buildBody(ContactLog c, User recipient, String nomeCompleto, String link) {
        String numero = c.getClienteNumero() != null && !c.getClienteNumero().isBlank()
                ? c.getClienteNumero() : "non comunicato";
        String tipologia = c.getOtherNote() != null && !c.getOtherNote().isBlank() ? c.getOtherNote() : null;
        String nota = c.getAcquistoNote() != null && !c.getAcquistoNote().isBlank()
                ? c.getAcquistoNote() : c.getNotaAggiuntiva();

        StringBuilder sb = new StringBuilder();
        String primoNome = recipient.getFullName() != null && !recipient.getFullName().isBlank()
                ? recipient.getFullName().trim().split("\\s+")[0] : "";
        sb.append("Ciao ").append(primoNome).append(",\n\n");
        sb.append("ti è stato segnalato un nuovo allert dal CRM di Gruppo Autoscala per il/la cliente: ")
          .append(nomeCompleto.isBlank() ? "non comunicato" : nomeCompleto)
          .append(" - ").append(numero).append(".\n\n");
        sb.append("La richiesta riguarda: ").append(c.getCategory());
        if (tipologia != null) sb.append(" (").append(tipologia).append(")");
        sb.append("\n");
        if (c.getMarca() != null && !c.getMarca().isBlank()) {
            sb.append("Marca/Modello: ").append(c.getMarca())
              .append(c.getModello() != null && !c.getModello().isBlank() ? " " + c.getModello() : "")
              .append("\n");
        }
        if (c.getServiceTarga() != null && !c.getServiceTarga().isBlank()) {
            sb.append("Targa: ").append(c.getServiceTarga()).append("\n");
        }
        if (c.getConsultantName() != null && !c.getConsultantName().isBlank()) {
            sb.append("Consulente di riferimento: ").append(c.getConsultantName()).append("\n");
        }
        sb.append("\n");
        sb.append("Ti sono inoltre state lasciate le seguenti note: ")
          .append(nota != null && !nota.isBlank() ? nota : "nessuna nota").append("\n\n");
        sb.append("Apri la scheda del cliente: ").append(link);
        return sb.toString();
    }
}
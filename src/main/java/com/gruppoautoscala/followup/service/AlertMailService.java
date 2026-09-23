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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// Invia una mail di notifica quando viene inserito un nuovo allert nel
// Registro Contatti (categorie: Info Acquisto effettuato, Pratica Leasing,
// Pratica Finanziamento, Amministrazione). Chiamato da ContactLogController
// subito dopo la creazione del contatto, solo se acquistoAlert e' true.
//
// Una mail SEPARATA per ogni destinatario (non un unico invio con più "to"),
// cosi' il saluto iniziale ("Ciao <nome>") e' personalizzato per ciascuno.
//
// FIX: l'invio avviene su un thread separato (EXECUTOR sotto), MAI sul
// thread della richiesta HTTP. Se il server SMTP non risponde (es. porta
// bloccata dall'hosting, server giu'), un tentativo di connessione puo'
// restare "appeso" per decine di secondi per OGNI destinatario — se questo
// accadesse sul thread della richiesta, la creazione del contatto
// risulterebbe bloccata (form che non si chiude, tabella che non si
// aggiorna) fino allo scadere di tutti i timeout, anche se il contatto in
// realta' e' gia' stato salvato correttamente sul database.
@Service
public class AlertMailService {

    private static final Logger LOGGER = LoggerFactory.getLogger(AlertMailService.class);

    // Pool piccolo e dedicato, thread daemon (non impedisce lo spegnimento
    // pulito dell'applicazione): l'invio mail non e' mai così frequente da
    // giustificarne uno più grande.
    private static final ExecutorService EXECUTOR = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "alert-mail-sender");
        t.setDaemon(true);
        return t;
    });

    @Autowired
    private JavaMailSender mailSender;

    @Value("${app.mail.from}")
    private String fromAddress;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    public void notifyNewAlert(ContactLog contact, List<User> recipients) {
        if (recipients == null || recipients.isEmpty()) return;
        // Ritorna SUBITO: il lavoro vero avviene in background su EXECUTOR,
        // il chiamante (ContactLogController) non aspetta l'esito.
        EXECUTOR.submit(() -> doSend(contact, recipients));
    }

    private void doSend(ContactLog contact, List<User> recipients) {
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
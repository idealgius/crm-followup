package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.ContactLog;
import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.ContactLogService;
import com.gruppoautoscala.followup.service.ExcelExportService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/contacts")
public class ContactLogController {

    @Autowired
    private ContactLogService contactLogService;

    @Autowired
    private UserRepository userRepository;

    private final ExcelExportService excelExportService = new ExcelExportService();

    @GetMapping
    public ResponseEntity<?> getAll(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        List<ContactLog> logs;
        if (from != null && to != null) {
            LocalDateTime fromDt = LocalDateTime.parse(from + "T00:00:00");
            LocalDateTime toDt = LocalDateTime.parse(to + "T23:59:59");
            logs = contactLogService.getByDateRange(fromDt, toDt);
        } else {
            logs = contactLogService.getAll();
        }

        List<Map<String, Object>> result = logs.stream().map(log -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", log.getId());
            m.put("category", log.getCategory());
            m.put("clienteNome", log.getClienteNome());
            m.put("clienteCognome", log.getClienteCognome());
            m.put("clienteNumero", log.getClienteNumero());
            m.put("otherNote", log.getOtherNote());
            m.put("nominativoAppuntamento", log.getNominativoAppuntamento());
            m.put("linkAppuntamento", log.getLinkAppuntamento());
            m.put("marca", log.getMarca());
            m.put("modello", log.getModello());
            m.put("linkAuto", log.getLinkAuto());
            m.put("serviceTipo", log.getServiceTipo());
            m.put("serviceNote", log.getServiceNote());
            m.put("acquistoNote", log.getAcquistoNote());
            m.put("noleggioTipo", log.getNoleggioTipo());
            m.put("noleggioLink", log.getNoleggioLink());
            m.put("serviceNomeCliente", log.getServiceNomeCliente());
            m.put("serviceCognomeCliente", log.getServiceCognomeCliente());
            m.put("serviceTarga", log.getServiceTarga());
            m.put("serviceTipoCliente", log.getServiceTipoCliente());
            m.put("serviceNumeroTelefono", log.getServiceNumeroTelefono());
            m.put("noleggioRichiesta", log.getNoleggioRichiesta());
            m.put("noleggioNomeCliente", log.getNoleggioNomeCliente());
            m.put("noleggioCognomeCliente", log.getNoleggioCognomeCliente());
            m.put("noleggioCellulare", log.getNoleggioCellulare());
            m.put("contactDate", log.getContactDate().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")));
            m.put("createdAt", log.getCreatedAt().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")));
            Map<String, Object> userMap = new HashMap<>();
            userMap.put("id", log.getUser().getId());
            userMap.put("fullName", log.getUser().getFullName());
            userMap.put("role", log.getUser().getRole());
            m.put("user", userMap);
            return m;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    @GetMapping("/export-excel")
    public ResponseEntity<?> exportExcel(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String operator,
            HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        List<ContactLog> logs;
        if (from != null && to != null) {
            LocalDateTime fromDt = LocalDateTime.parse(from + "T00:00:00");
            LocalDateTime toDt = LocalDateTime.parse(to + "T23:59:59");
            logs = contactLogService.getByDateRange(fromDt, toDt);
        } else {
            logs = contactLogService.getAll();
        }

        if (operator != null && !operator.isBlank()) {
            logs = logs.stream()
                .filter(l -> operator.equalsIgnoreCase(l.getUser().getFullName()))
                .collect(Collectors.toList());
        }

        try {
            byte[] excelBytes = excelExportService.export(logs);
            String filename = "registro_contatti_" + (from != null ? from : "tutti") + "_" + (to != null ? to : "") + ".xlsx";
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(excelBytes);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Errore generazione Excel: " + e.getMessage()));
        }
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Utente non trovato"));

        String category = (String) body.get("category");
        String clienteNome = (String) body.get("clienteNome");
        String clienteCognome = (String) body.get("clienteCognome");
        String clienteNumero = (String) body.get("clienteNumero");
        String otherNote = (String) body.get("otherNote");
        String nominativoAppuntamento = (String) body.get("nominativoAppuntamento");
        String linkAppuntamento = (String) body.get("linkAppuntamento");
        String marca = (String) body.get("marca");
        String modello = (String) body.get("modello");
        String linkAuto = (String) body.get("linkAuto");
        String serviceTipo = (String) body.get("serviceTipo");
        String serviceNote = (String) body.get("serviceNote");
        String acquistoNote = (String) body.get("acquistoNote");
        String noleggioTipo = (String) body.get("noleggioTipo");
        String noleggioLink = (String) body.get("noleggioLink");
        String serviceNomeCliente = (String) body.get("serviceNomeCliente");
        String serviceCognomeCliente = (String) body.get("serviceCognomeCliente");
        String serviceTarga = (String) body.get("serviceTarga");
        String serviceTipoCliente = (String) body.get("serviceTipoCliente");
        String serviceNumeroTelefono = (String) body.get("serviceNumeroTelefono");
        String noleggioRichiesta = (String) body.get("noleggioRichiesta");
        String noleggioNomeCliente = (String) body.get("noleggioNomeCliente");
        String noleggioCognomeCliente = (String) body.get("noleggioCognomeCliente");
        String noleggioCellulare = (String) body.get("noleggioCellulare");
        LocalDateTime contactDate = body.get("contactDate") != null
            ? LocalDateTime.parse((String) body.get("contactDate"))
            : LocalDateTime.now();

        // Validazione universale: nome, cognome, numero obbligatori per QUALSIASI categoria
        if (clienteNome == null || clienteNome.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Nome cliente obbligatorio"));
        }
        if (clienteCognome == null || clienteCognome.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Cognome cliente obbligatorio"));
        }
        if (clienteNumero == null || clienteNumero.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Numero cliente obbligatorio"));
        }

        if ("Info Noleggio".equals(category)) {
            if (noleggioRichiesta == null || noleggioRichiesta.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Seleziona Solo Info o Richiesta cliente"));
            }
        }

        ContactLog log = contactLogService.create(userOpt.get(), category,
                clienteNome, clienteCognome, clienteNumero,
                otherNote,
                nominativoAppuntamento, linkAppuntamento,
                marca, modello, linkAuto,
                serviceTipo, serviceNote, acquistoNote,
                noleggioTipo, noleggioLink,
                serviceNomeCliente, serviceCognomeCliente, serviceTarga,
                serviceTipoCliente, serviceNumeroTelefono,
                noleggioRichiesta, noleggioNomeCliente, noleggioCognomeCliente, noleggioCellulare,
                contactDate);

        Map<String, Object> result = new HashMap<>();
        result.put("id", log.getId());
        result.put("category", log.getCategory());
        result.put("clienteNome", log.getClienteNome());
        result.put("clienteCognome", log.getClienteCognome());
        result.put("clienteNumero", log.getClienteNumero());
        result.put("otherNote", log.getOtherNote());
        result.put("nominativoAppuntamento", log.getNominativoAppuntamento());
        result.put("linkAppuntamento", log.getLinkAppuntamento());
        result.put("marca", log.getMarca());
        result.put("modello", log.getModello());
        result.put("linkAuto", log.getLinkAuto());
        result.put("serviceTipo", log.getServiceTipo());
        result.put("serviceNote", log.getServiceNote());
        result.put("acquistoNote", log.getAcquistoNote());
        result.put("noleggioTipo", log.getNoleggioTipo());
        result.put("noleggioLink", log.getNoleggioLink());
        result.put("serviceNomeCliente", log.getServiceNomeCliente());
        result.put("serviceCognomeCliente", log.getServiceCognomeCliente());
        result.put("serviceTarga", log.getServiceTarga());
        result.put("serviceTipoCliente", log.getServiceTipoCliente());
        result.put("serviceNumeroTelefono", log.getServiceNumeroTelefono());
        result.put("noleggioRichiesta", log.getNoleggioRichiesta());
        result.put("noleggioNomeCliente", log.getNoleggioNomeCliente());
        result.put("noleggioCognomeCliente", log.getNoleggioCognomeCliente());
        result.put("noleggioCellulare", log.getNoleggioCellulare());
        result.put("contactDate", log.getContactDate().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")));
        Map<String, Object> userMap = new HashMap<>();
        userMap.put("id", log.getUser().getId());
        userMap.put("fullName", log.getUser().getFullName());
        result.put("user", userMap);
        return ResponseEntity.ok(result);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id,
                                    @RequestBody Map<String, Object> body,
                                    HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        String role = (String) session.getAttribute("userRole");

        Optional<ContactLog> logOpt = contactLogService.getById(id);
        if (logOpt.isEmpty()) return ResponseEntity.notFound().build();

        ContactLog log = logOpt.get();
        if (!"ADMIN".equals(role) && !"GESTORE".equals(role) && !log.getUser().getId().equals(userId)) {
            return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        }

        if (body.containsKey("category")) log.setCategory((String) body.get("category"));
        if (body.containsKey("clienteNome")) log.setClienteNome((String) body.get("clienteNome"));
        if (body.containsKey("clienteCognome")) log.setClienteCognome((String) body.get("clienteCognome"));
        if (body.containsKey("clienteNumero")) log.setClienteNumero((String) body.get("clienteNumero"));
        if (body.containsKey("otherNote")) log.setOtherNote((String) body.get("otherNote"));
        if (body.containsKey("nominativoAppuntamento")) log.setNominativoAppuntamento((String) body.get("nominativoAppuntamento"));
        if (body.containsKey("linkAppuntamento")) log.setLinkAppuntamento((String) body.get("linkAppuntamento"));
        if (body.containsKey("marca")) log.setMarca((String) body.get("marca"));
        if (body.containsKey("modello")) log.setModello((String) body.get("modello"));
        if (body.containsKey("linkAuto")) log.setLinkAuto((String) body.get("linkAuto"));
        if (body.containsKey("serviceTipo")) log.setServiceTipo((String) body.get("serviceTipo"));
        if (body.containsKey("serviceNote")) log.setServiceNote((String) body.get("serviceNote"));
        if (body.containsKey("acquistoNote")) log.setAcquistoNote((String) body.get("acquistoNote"));
        if (body.containsKey("noleggioTipo")) log.setNoleggioTipo((String) body.get("noleggioTipo"));
        if (body.containsKey("noleggioLink")) log.setNoleggioLink((String) body.get("noleggioLink"));
        if (body.containsKey("serviceNomeCliente")) log.setServiceNomeCliente((String) body.get("serviceNomeCliente"));
        if (body.containsKey("serviceCognomeCliente")) log.setServiceCognomeCliente((String) body.get("serviceCognomeCliente"));
        if (body.containsKey("serviceTarga")) log.setServiceTarga((String) body.get("serviceTarga"));
        if (body.containsKey("serviceTipoCliente")) log.setServiceTipoCliente((String) body.get("serviceTipoCliente"));
        if (body.containsKey("serviceNumeroTelefono")) log.setServiceNumeroTelefono((String) body.get("serviceNumeroTelefono"));
        if (body.containsKey("noleggioRichiesta")) log.setNoleggioRichiesta((String) body.get("noleggioRichiesta"));
        if (body.containsKey("noleggioNomeCliente")) log.setNoleggioNomeCliente((String) body.get("noleggioNomeCliente"));
        if (body.containsKey("noleggioCognomeCliente")) log.setNoleggioCognomeCliente((String) body.get("noleggioCognomeCliente"));
        if (body.containsKey("noleggioCellulare")) log.setNoleggioCellulare((String) body.get("noleggioCellulare"));
        if (body.containsKey("contactDate")) {
            log.setContactDate(LocalDateTime.parse((String) body.get("contactDate")));
        }

        return ResponseEntity.ok(contactLogService.update(log));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        String role = (String) session.getAttribute("userRole");

        Optional<ContactLog> logOpt = contactLogService.getById(id);
        if (logOpt.isEmpty()) return ResponseEntity.notFound().build();

        ContactLog log = logOpt.get();
        if (!"ADMIN".equals(role) && !"GESTORE".equals(role) && !log.getUser().getId().equals(userId)) {
            return ResponseEntity.status(403).body(Map.of("error", "Non autorizzato"));
        }

        contactLogService.delete(id);
        return ResponseEntity.ok(Map.of("message", "Eliminato"));
    }

    @GetMapping("/stats")
    public ResponseEntity<?> getStats(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));

        LocalDateTime fromDt = from != null ? LocalDateTime.parse(from + "T00:00:00") : null;
        LocalDateTime toDt = to != null ? LocalDateTime.parse(to + "T23:59:59") : null;

        return ResponseEntity.ok(contactLogService.getStats(fromDt, toDt));
    }
}
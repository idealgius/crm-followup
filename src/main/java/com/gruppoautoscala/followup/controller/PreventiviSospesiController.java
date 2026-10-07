package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.PreventivoTelefonico;
import com.gruppoautoscala.followup.repository.PreventivoTelefonicoRepository;
import com.gruppoautoscala.followup.service.RolePermissionService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * PREVENTIVI TELEFONICI IN SOSPESO
 *
 * GET /api/preventivi-sospesi
 *
 * Un preventivo e' "in sospeso" se dal GIORNO DOPO il caricamento e' ancora
 * nello stato iniziale GENERATO (nessun cambio di stato). Sabato e domenica
 * contano: caricato venerdi', sabato e' gia' in sospeso (1 giorno) e lunedi'
 * lo e' da 3 giorni. Smette di esserlo appena cambia stato (Trattativa
 * generata o Non interessato).
 *
 * Lo vede chi ha almeno "Solo lettura" sulla sezione Preventivi telefonici.
 */
@RestController
@RequestMapping("/api/preventivi-sospesi")
public class PreventiviSospesiController {

    private static final ZoneId ITALY = ZoneId.of("Europe/Rome");

    @Autowired private PreventivoTelefonicoRepository repository;
    @Autowired private RolePermissionService rolePermissionService;

    @GetMapping
    public ResponseEntity<?> inSospeso(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!rolePermissionService.hasAtLeast(rolePermissionService.getEffectiveAccess(userId, role, "PREVENTIVI"), "READ_ONLY"))
            return ResponseEntity.ok(Map.of("count", 0, "items", List.of(), "visibile", false));

        LocalDate oggi = LocalDate.now(ITALY);
        List<Map<String, Object>> items = new ArrayList<>();
        for (PreventivoTelefonico p : repository.findInSospeso(oggi.atStartOfDay())) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", p.getId());
            m.put("tipo", p.getTipo());
            m.put("cliente", (nz(p.getClienteNome()) + " " + nz(p.getClienteCognome())).trim());
            m.put("telefono", p.getTelefono());
            m.put("marca", p.getMarca());
            m.put("modello", p.getModello());
            m.put("consulente", p.getConsultantName());
            m.put("caricatoDa", p.getUser() != null ? p.getUser().getFullName() : null);
            m.put("caricatoIl", p.getCreatedAt() != null ? p.getCreatedAt().toString() : null);
            m.put("giorni", p.getCreatedAt() != null ? ChronoUnit.DAYS.between(p.getCreatedAt().toLocalDate(), oggi) : null);
            m.put("linkLead", p.getLinkLead());
            items.add(m);
        }
        return ResponseEntity.ok(Map.of("count", items.size(), "items", items, "visibile", true));
    }

    private static String nz(String s) { return s == null ? "" : s; }
}
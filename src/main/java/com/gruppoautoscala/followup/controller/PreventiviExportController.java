package com.gruppoautoscala.followup.controller;

import com.gruppoautoscala.followup.model.User;
import com.gruppoautoscala.followup.repository.UserRepository;
import com.gruppoautoscala.followup.service.CommercialeExcelService;
import com.gruppoautoscala.followup.service.RolePermissionService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * EXCEL DEI PREVENTIVI TELEFONICI (sezione In bound) — usato da /js/preventivi-sospesi.js
 *
 *  POST /api/preventivi-export/excel -> file Excel professionale dell'elenco
 *                                       "Preventivi telefonici in sospeso", con i filtri scelti.
 *
 * La pagina manda le tabelle gia' pronte; il file lo costruisce lo stesso motore
 * degli altri Excel (CommercialeExcelService), colore blu.
 *
 * Permessi: almeno "Solo lettura" su Preventivi telefonici (PREVENTIVI).
 */
@RestController
@RequestMapping("/api/preventivi-export")
public class PreventiviExportController {

    private static final int MAX_RIGHE = 50000;

    @Autowired private UserRepository userRepository;
    @Autowired private RolePermissionService rolePermissionService;
    @Autowired private CommercialeExcelService excelService;

    @PostMapping("/excel")
    public ResponseEntity<?> excel(@RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        if (!rolePermissionService.hasAtLeast(rolePermissionService.getEffectiveAccess(userId, role, "PREVENTIVI"), "READ_ONLY"))
            return ResponseEntity.status(403).body(Map.of("error", "Non hai il permesso per i Preventivi telefonici"));

        // limite di sicurezza sulle righe
        int righe = 0;
        if (body.get("fogli") instanceof List<?> fogli)
            for (Object f : fogli)
                if (f instanceof Map<?, ?> fm && fm.get("tabelle") instanceof List<?> tabs)
                    for (Object t : tabs)
                        if (t instanceof Map<?, ?> tm && tm.get("righe") instanceof List<?> r) righe += r.size();
        if (righe > MAX_RIGHE) return ResponseEntity.badRequest().body(Map.of("error", "Troppe righe (" + righe + "): restringi i filtri"));

        Map<String, Object> dati = new HashMap<>(body);
        dati.put("colore", "blu");
        dati.put("aCapo", true);
        try {
            String chi = userRepository.findById(userId).map(User::getFullName).orElse(null);
            byte[] xlsx = excelService.export(dati, chi);
            String file = String.valueOf(body.getOrDefault("file", "preventivi.xlsx")).replaceAll("[^A-Za-z0-9._-]", "_");
            if (!file.endsWith(".xlsx")) file += ".xlsx";
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + file + "\"")
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(xlsx);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Export non riuscito: " + e.getMessage()));
        }
    }
}
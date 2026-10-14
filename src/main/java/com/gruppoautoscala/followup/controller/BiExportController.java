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
 * STRUMENTI COMUNI DELLA BI — usati da /js/bi-tools.js
 *
 *  POST /api/bi/export/excel  -> file Excel professionale della tabella che si vede a
 *                                schermo (Consegne, Stock, Commerciale), con i filtri scelti.
 *
 * La pagina legge la tabella e la manda gia' pronta (stesso formato di
 * CommercialeExcelService). Il file usa il colore della sezione:
 *   blu per Consegne e Stock, bordeaux per il Commerciale.
 *
 * Permessi: almeno "Solo lettura" sulla sezione dell'elenco (CONSEGNE, STOCK o COMMERCIALE).
 */
@RestController
@RequestMapping("/api/bi")
public class BiExportController {

    private static final int MAX_RIGHE = 50000;

    @Autowired private UserRepository userRepository;
    @Autowired private RolePermissionService rolePermissionService;
    @Autowired private CommercialeExcelService excelService;

    @PostMapping("/export/excel")
    public ResponseEntity<?> exportExcel(@RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        String role = (String) session.getAttribute("userRole");
        if (userId == null) return ResponseEntity.status(401).body(Map.of("error", "Non autenticato"));
        String sezione = String.valueOf(body.getOrDefault("sezione", "CONSEGNE")).toUpperCase(Locale.ROOT);
        String permesso = List.of("STOCK", "COMMERCIALE").contains(sezione) ? sezione : "CONSEGNE";
        if (!rolePermissionService.hasAtLeast(rolePermissionService.getEffectiveAccess(userId, role, permesso), "READ_ONLY"))
            return ResponseEntity.status(403).body(Map.of("error", "Non hai il permesso per questa sezione"));

        // limite di sicurezza sulle righe
        int righe = 0;
        if (body.get("fogli") instanceof List<?> fogli)
            for (Object f : fogli)
                if (f instanceof Map<?, ?> fm && fm.get("tabelle") instanceof List<?> tabs)
                    for (Object t : tabs)
                        if (t instanceof Map<?, ?> tm && tm.get("righe") instanceof List<?> r) righe += r.size();
        if (righe > MAX_RIGHE) return ResponseEntity.badRequest().body(Map.of("error", "Troppe righe (" + righe + "): restringi i filtri"));

        Map<String, Object> dati = new HashMap<>(body);
        dati.putIfAbsent("colore", "COMMERCIALE".equals(sezione) ? "bordeaux" : "blu");
        dati.put("aCapo", true);
        try {
            String chi = userRepository.findById(userId).map(User::getFullName).orElse(null);
            byte[] xlsx = excelService.export(dati, chi);
            String file = String.valueOf(body.getOrDefault("file", "elenco.xlsx")).replaceAll("[^A-Za-z0-9._-]", "_");
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
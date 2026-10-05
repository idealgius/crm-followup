package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.FollowUp;
import com.gruppoautoscala.followup.model.FollowUpStep;
import com.gruppoautoscala.followup.repository.FollowUpRepository;
import com.gruppoautoscala.followup.repository.FollowUpStepRepository;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFFont;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * EXPORT EXCEL DEI FOLLOW-UP (un giorno o un periodo).
 *
 * Fogli:
 *  - "Riepilogo": periodo, filtri e, per ogni consulente, follow-up,
 *    risponde, non risponde, in corso, appuntamenti, % di risposta.
 *  - un foglio per ogni CONSULENTE con tutti i suoi clienti: data, cliente,
 *    telefono, mail, vettura, esito della scheda, appuntamento, i 4 step
 *    (esito + data/ora + chi), le note, chi l'ha creato.
 *  - "Tutti": la stessa tabella con la colonna Consulente e i filtri.
 */
@Service
public class FollowUpExcelService {

    private static final ZoneId ITALY = ZoneId.of("Europe/Rome");
    private static final DateTimeFormatter D = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("dd/MM HH:mm");

    @Autowired private FollowUpRepository followUpRepository;
    @Autowired private FollowUpStepRepository followUpStepRepository;

    public byte[] export(LocalDate from, LocalDate to, Set<String> consulenti, String generatoDa) throws Exception {
        List<FollowUp> fus = followUpRepository.findByWorkDateBetween(from, to).stream()
                .filter(f -> consulenti == null || consulenti.isEmpty() || consulenti.contains(nz(f.getConsultantName())))
                .sorted(Comparator.comparing(FollowUp::getWorkDate).thenComparing(f -> nz(f.getCustomer().getFullName()).toLowerCase()))
                .collect(Collectors.toList());
        Map<Long, List<FollowUpStep>> steps = fus.isEmpty() ? Map.of()
                : followUpStepRepository.findByFollowUpIn(fus).stream().collect(Collectors.groupingBy(s -> s.getFollowUp().getId()));

        Map<String, List<FollowUp>> perConsulente = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        for (FollowUp f : fus) perConsulente.computeIfAbsent(f.getConsultantName() == null || f.getConsultantName().isBlank() ? "Senza consulente" : f.getConsultantName(), k -> new ArrayList<>()).add(f);

        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Styles st = new Styles(wb);
            String periodo = from.equals(to) ? from.format(D) : from.format(D) + " - " + to.format(D);

            // ---------- Riepilogo ----------
            Sheet rs = wb.createSheet("Riepilogo");
            int r = 0;
            cell(rs.createRow(r++), 0, "Follow-up · " + periodo, st.title);
            cell(rs.createRow(r++), 0, "Generato il " + LocalDateTime.now(ITALY).format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
                    + (generatoDa != null ? " da " + generatoDa : "")
                    + (consulenti != null && !consulenti.isEmpty() ? " · Consulenti: " + String.join(", ", consulenti) : " · Tutti i consulenti"), st.note);
            r++;
            String[] hr = {"Consulente", "Follow-up", "Risponde", "Non risponde", "In corso", "Appuntamenti", "% risposta"};
            Row h = rs.createRow(r++);
            for (int i = 0; i < hr.length; i++) cell(h, i, hr[i], st.head);
            int first = r;
            for (Map.Entry<String, List<FollowUp>> e : perConsulente.entrySet()) {
                Row row = rs.createRow(r++);
                List<FollowUp> l = e.getValue();
                long ris = l.stream().filter(f -> "RESPONDED".equals(f.getStatus())).count();
                long nr = l.stream().filter(f -> "ABANDONED".equals(f.getStatus())).count();
                long app = l.stream().filter(f -> Boolean.TRUE.equals(f.getHasAppointment())).count();
                cell(row, 0, e.getKey(), st.textB);
                num(row, 1, l.size(), st.num); num(row, 2, ris, st.numGreen); num(row, 3, nr, st.numRed);
                num(row, 4, l.size() - ris - nr, st.num); num(row, 5, app, st.numBlue);
                Cell pc = row.createCell(6); pc.setCellValue(l.isEmpty() ? 0 : (double) ris / l.size()); pc.setCellStyle(st.perc);
            }
            Row tot = rs.createRow(r++);
            cell(tot, 0, "Totale", st.totText);
            for (int c = 1; c <= 5; c++) {
                Cell x = tot.createCell(c); String col = colLetter(c);
                x.setCellFormula(perConsulente.isEmpty() ? "0" : "SUM(" + col + (first + 1) + ":" + col + (r - 1) + ")"); x.setCellStyle(st.totNum);
            }
            Cell tp = tot.createCell(6);
            tp.setCellFormula(perConsulente.isEmpty() ? "0" : "IF(B" + r + "=0,0,C" + r + "/B" + r + ")"); tp.setCellStyle(st.totPerc);
            rs.setColumnWidth(0, 30 * 256);
            for (int c = 1; c < hr.length; c++) rs.setColumnWidth(c, 15 * 256);
            rs.createFreezePane(0, 4);

            // ---------- un foglio per consulente ----------
            Set<String> nomi = new HashSet<>();
            for (Map.Entry<String, List<FollowUp>> e : perConsulente.entrySet()) {
                String nome = sheetName(e.getKey(), nomi);
                tabella(wb.createSheet(nome), e.getKey() + " · " + periodo, e.getValue(), steps, st, false);
            }
            // ---------- tutti ----------
            tabella(wb.createSheet("Tutti"), "Tutti i follow-up · " + periodo, fus, steps, st, true);

            wb.write(out);
            return out.toByteArray();
        }
    }

    private void tabella(Sheet sh, String titolo, List<FollowUp> fus, Map<Long, List<FollowUpStep>> steps, Styles st, boolean conConsulente) {
        int r = 0;
        cell(sh.createRow(r++), 0, titolo, st.title);
        cell(sh.createRow(r++), 0, fus.size() + " follow-up", st.note);
        r++;
        List<String> head = new ArrayList<>();
        if (conConsulente) head.add("Consulente");
        head.addAll(List.of("Data", "Cliente", "Telefono", "Email", "Vettura", "Esito", "Appuntamento",
                "Step 1 · Chiamata mattina", "Step 2 · Chiamata pomeriggio", "Step 3 · WhatsApp / Mail", "Step 4 · Chiamata GG3",
                "Note", "Creato da"));
        Row h = sh.createRow(r++);
        h.setHeightInPoints(30);
        for (int i = 0; i < head.size(); i++) cell(h, i, head.get(i), st.head);
        int firstData = r;
        boolean zebra = false;
        for (FollowUp f : fus) {
            Row row = sh.createRow(r++);
            int c = 0;
            CellStyle t = zebra ? st.textZ : st.text, w = zebra ? st.wrapZ : st.wrap;
            if (conConsulente) cell(row, c++, nz(f.getConsultantName()), t);
            cell(row, c++, f.getWorkDate().format(D), t);
            cell(row, c++, nz(f.getCustomer().getFullName()), zebra ? st.textBZ : st.textB);
            cell(row, c++, nz(f.getCustomer().getPhone()), t);
            cell(row, c++, nz(f.getCustomer().getEmail()), t);
            cell(row, c++, (nz(f.getMarca()) + " " + nz(f.getModello())).trim(), w);
            String s = f.getStatus();
            cell(row, c++, "RESPONDED".equals(s) ? "Risponde" : "ABANDONED".equals(s) ? "Non risponde" : "In corso",
                    "RESPONDED".equals(s) ? st.green : "ABANDONED".equals(s) ? st.red : st.amber);
            cell(row, c++, Boolean.TRUE.equals(f.getHasAppointment()) ? "Sì" : "", Boolean.TRUE.equals(f.getHasAppointment()) ? st.blue : t);
            List<FollowUpStep> ls = steps.getOrDefault(f.getId(), List.of());
            StringBuilder note = new StringBuilder();
            for (int n = 1; n <= 4; n++) {
                final int nn = n;
                FollowUpStep stp = ls.stream().filter(x -> x.getStepNumber() == nn).findFirst().orElse(null);
                String o = stp == null ? "PENDING" : nz(stp.getOutcome());
                String txt = esito(o);
                if (stp != null && stp.getExecutedAt() != null) txt += "\n" + stp.getExecutedAt().format(DT)
                        + (stp.getExecutedBy() != null ? " · " + (Boolean.TRUE.equals(stp.getImported()) ? "Import da " : "") + stp.getExecutedBy().getFullName() : "");
                CellStyle cs = switch (o) {
                    case "ANSWERED" -> st.stepGreen;
                    case "NO_ANSWER" -> st.stepRed;
                    case "SENT", "SENT_WHATSAPP", "SENT_MAIL" -> st.stepBlue;
                    default -> w;
                };
                cell(row, c++, txt, cs);
                if (stp != null && stp.getNotes() != null && !stp.getNotes().isBlank())
                    note.append(note.length() > 0 ? "\n" : "").append("Step ").append(n).append(": ").append(stp.getNotes().trim());
            }
            cell(row, c++, note.toString(), w);
            cell(row, c++, (Boolean.TRUE.equals(f.getImported()) ? "Import da " : "") + (f.getUser() != null ? f.getUser().getFullName() : ""), t);
            zebra = !zebra;
        }
        int[] widths = conConsulente ? new int[]{22, 12, 24, 16, 28, 34, 14, 13, 24, 24, 24, 24, 60, 26}
                                     : new int[]{12, 24, 16, 28, 34, 14, 13, 24, 24, 24, 24, 60, 26};
        for (int i = 0; i < widths.length; i++) sh.setColumnWidth(i, widths[i] * 256);
        sh.createFreezePane(conConsulente ? 3 : 2, firstData);
        if (r > firstData) sh.setAutoFilter(new CellRangeAddress(firstData - 1, r - 1, 0, head.size() - 1));
        sh.getPrintSetup().setLandscape(true);
        sh.setFitToPage(true);
        sh.getPrintSetup().setFitWidth((short) 1);
        sh.getPrintSetup().setFitHeight((short) 0);
    }

    private static String esito(String o) {
        return switch (o) {
            case "ANSWERED" -> "✅ Risposto";
            case "NO_ANSWER" -> "❌ Non risponde";
            case "SENT_WHATSAPP" -> "💬 WhatsApp inviato";
            case "SENT_MAIL" -> "✉️ Mail inviata";
            case "SENT" -> "📤 Inviato";
            default -> "In attesa";
        };
    }

    private static String sheetName(String n, Set<String> used) {
        String s = n.replaceAll("[\\\\/?*\\[\\]:]", " ").trim();
        if (s.length() > 28) s = s.substring(0, 28);
        String base = s; int i = 2;
        while (used.contains(s.toLowerCase()) || s.equalsIgnoreCase("Riepilogo") || s.equalsIgnoreCase("Tutti")) s = base + " " + (i++);
        used.add(s.toLowerCase());
        return s;
    }

    private static String colLetter(int col) { return String.valueOf((char) ('A' + col)); }
    private static String nz(String s) { return s == null ? "" : s; }
    private static void cell(Row r, int c, String v, CellStyle s) { Cell x = r.createCell(c); x.setCellValue(v); x.setCellStyle(s); }
    private static void num(Row r, int c, long v, CellStyle s) { Cell x = r.createCell(c); x.setCellValue(v); x.setCellStyle(s); }

    /* ---------------- stili ---------------- */
    private static class Styles {
        final CellStyle title, note, head, text, textZ, textB, textBZ, wrap, wrapZ, num, numGreen, numRed, numBlue, perc,
                totText, totNum, totPerc, green, red, amber, blue, stepGreen, stepRed, stepBlue;
        Styles(XSSFWorkbook wb) {
            title = font(wb, wb.createCellStyle(), 16, true, rgb(0x1F, 0x2D, 0x3D));
            note = font(wb, wb.createCellStyle(), 10, false, rgb(0x6B, 0x7A, 0x8C));
            head = box(wb, font(wb, wb.createCellStyle(), 10, true, rgb(0xFF, 0xFF, 0xFF)), rgb(0x2C, 0x4A, 0x6E));
            head.setWrapText(true); head.setVerticalAlignment(VerticalAlignment.CENTER);
            text = box(wb, wb.createCellStyle(), null);
            textZ = box(wb, wb.createCellStyle(), rgb(0xF4, 0xF6, 0xF9));
            textB = box(wb, font(wb, wb.createCellStyle(), 10, true, rgb(0x1F, 0x2D, 0x3D)), null);
            textBZ = box(wb, font(wb, wb.createCellStyle(), 10, true, rgb(0x1F, 0x2D, 0x3D)), rgb(0xF4, 0xF6, 0xF9));
            wrap = box(wb, wb.createCellStyle(), null); wrap.setWrapText(true);
            wrapZ = box(wb, wb.createCellStyle(), rgb(0xF4, 0xF6, 0xF9)); wrapZ.setWrapText(true);
            num = box(wb, wb.createCellStyle(), null); num.setAlignment(HorizontalAlignment.RIGHT);
            numGreen = box(wb, font(wb, wb.createCellStyle(), 10, true, rgb(0x1E, 0x8A, 0x4F)), null);
            numRed = box(wb, font(wb, wb.createCellStyle(), 10, true, rgb(0xC6, 0x28, 0x28)), null);
            numBlue = box(wb, font(wb, wb.createCellStyle(), 10, true, rgb(0x2C, 0x4A, 0x9E)), null);
            perc = box(wb, wb.createCellStyle(), null); perc.setDataFormat(wb.createDataFormat().getFormat("0.0%"));
            totText = box(wb, font(wb, wb.createCellStyle(), 10, true, rgb(0x1F, 0x2D, 0x3D)), rgb(0xE3, 0xE8, 0xEF));
            totNum = box(wb, font(wb, wb.createCellStyle(), 10, true, rgb(0x1F, 0x2D, 0x3D)), rgb(0xE3, 0xE8, 0xEF));
            totPerc = box(wb, font(wb, wb.createCellStyle(), 10, true, rgb(0x1F, 0x2D, 0x3D)), rgb(0xE3, 0xE8, 0xEF));
            totPerc.setDataFormat(wb.createDataFormat().getFormat("0.0%"));
            green = box(wb, font(wb, wb.createCellStyle(), 10, true, rgb(0x1E, 0x8A, 0x4F)), rgb(0xE3, 0xF6, 0xEA));
            red = box(wb, font(wb, wb.createCellStyle(), 10, true, rgb(0xC6, 0x28, 0x28)), rgb(0xFD, 0xE7, 0xE7));
            amber = box(wb, font(wb, wb.createCellStyle(), 10, true, rgb(0x8A, 0x5A, 0x12)), rgb(0xFD, 0xF1, 0xDE));
            blue = box(wb, font(wb, wb.createCellStyle(), 10, true, rgb(0x2C, 0x4A, 0x9E)), rgb(0xE6, 0xEC, 0xFA));
            stepGreen = box(wb, wb.createCellStyle(), rgb(0xE3, 0xF6, 0xEA)); stepGreen.setWrapText(true);
            stepRed = box(wb, wb.createCellStyle(), rgb(0xFD, 0xE7, 0xE7)); stepRed.setWrapText(true);
            stepBlue = box(wb, wb.createCellStyle(), rgb(0xE6, 0xEC, 0xFA)); stepBlue.setWrapText(true);
        }
        private static byte[] rgb(int r, int g, int b) { return new byte[]{(byte) r, (byte) g, (byte) b}; }
        private static CellStyle font(XSSFWorkbook wb, CellStyle s, int size, boolean bold, byte[] color) {
            XSSFFont f = wb.createFont(); f.setFontHeightInPoints((short) size); f.setBold(bold); f.setFontName("Calibri");
            f.setColor(new XSSFColor(color, null)); s.setFont(f); return s;
        }
        private static CellStyle box(XSSFWorkbook wb, CellStyle s, byte[] fill) {
            if (fill != null) { ((XSSFCellStyle) s).setFillForegroundColor(new XSSFColor(fill, null)); s.setFillPattern(FillPatternType.SOLID_FOREGROUND); }
            s.setBorderBottom(BorderStyle.THIN); s.setBottomBorderColor(IndexedColors.GREY_25_PERCENT.getIndex());
            s.setVerticalAlignment(VerticalAlignment.TOP);
            return s;
        }
    }
}
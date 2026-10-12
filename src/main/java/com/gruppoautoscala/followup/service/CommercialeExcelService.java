package com.gruppoautoscala.followup.service;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFFont;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * EXPORT EXCEL DELLA BI COMMERCIALE
 *
 * I numeri li calcola la pagina (/js/commerciale.js, stessi dati e stesse regole
 * che si vedono a schermo) e li manda gia' pronti in tabelle; qui si costruisce
 * il file con una grafica professionale:
 *  - in cima a ogni foglio: titolo, periodo/filtri scelti, "generato da ... il ..."
 *  - intestazioni bordeaux, righe alternate, numeri e percentuali formattati,
 *    riga Totale in evidenza, filtri automatici e riquadri bloccati sull'intestazione,
 *    stampa orizzontale adattata alla larghezza della pagina.
 *
 * Formato ricevuto:
 * { "titolo": "...", "sottotitolo": "...",
 *   "fogli": [ { "nome": "Riepilogo",
 *                "tabelle": [ { "titolo": "...", "nota": "...",
 *                               "colonne": [ {"t": "Consulente", "tipo": "text|int|pct|eur", "w": 24} ],
 *                               "righe": [ [ "Guido Fiore", 95, 0.1359 ] ],
 *                               "totale": [ "Totale", 95, 0.1359 ] } ] } ] }
 */
@Service
public class CommercialeExcelService {

    private static final ZoneId ITALY = ZoneId.of("Europe/Rome");
    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("dd/MM/yyyy 'alle' HH:mm");
    private static final byte[] BORDEAUX = rgb(0x6B, 0x1D, 0x2E);
    private static final byte[] ROSA = rgb(0xF6, 0xE6, 0xEA);
    private static final byte[] ZEBRA = rgb(0xFB, 0xF6, 0xF7);
    private static final byte[] GRIGIO = rgb(0x7A, 0x6A, 0x70);
    private static final byte[] LINEA = rgb(0xE6, 0xDA, 0xDE);

    private static byte[] rgb(int r, int g, int b) { return new byte[]{(byte) r, (byte) g, (byte) b}; }

    public byte[] export(Map<String, Object> dati, String generatoDa) throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Stili st = new Stili(wb);
            String titolo = str(dati.get("titolo"), "Report commerciale");
            String sotto = str(dati.get("sottotitolo"), "");
            String generato = "Generato" + (generatoDa != null && !generatoDa.isBlank() ? " da " + generatoDa : "") + " il " + LocalDateTime.now(ITALY).format(DT);
            Set<String> nomiUsati = new HashSet<>();
            for (Object fo : lista(dati.get("fogli"))) {
                Map<String, Object> foglio = mappa(fo);
                String nome = nomeFoglio(str(foglio.get("nome"), "Foglio"), nomiUsati);
                XSSFSheet sh = wb.createSheet(nome);
                sh.setTabColor(new XSSFColor(BORDEAUX, null));
                sh.setDisplayGridlines(false);
                sh.getPrintSetup().setLandscape(true);
                sh.getPrintSetup().setFitWidth((short) 1);
                sh.getPrintSetup().setFitHeight((short) 0);
                sh.setFitToPage(true);

                List<Object> tabelle = lista(foglio.get("tabelle"));
                int maxCol = 1;
                for (Object to : tabelle) maxCol = Math.max(maxCol, lista(mappa(to).get("colonne")).size());

                // intestazione del foglio
                int r = 0;
                Row t = sh.createRow(r++); t.setHeightInPoints(28);
                cella(t, 0, titolo + (tabelle.size() == 1 ? "" : " · " + nome), st.titolo);
                if (maxCol > 1) sh.addMergedRegion(new CellRangeAddress(0, 0, 0, maxCol - 1));
                if (!sotto.isBlank()) { Row s = sh.createRow(r++); cella(s, 0, sotto, st.sottotitolo); if (maxCol > 1) sh.addMergedRegion(new CellRangeAddress(r - 1, r - 1, 0, maxCol - 1)); }
                Row g = sh.createRow(r++); cella(g, 0, generato, st.nota);
                if (maxCol > 1) sh.addMergedRegion(new CellRangeAddress(r - 1, r - 1, 0, maxCol - 1));
                r++;

                int[] larghezze = new int[maxCol];
                boolean unaSola = tabelle.size() == 1;
                for (Object to : tabelle) {
                    Map<String, Object> tab = mappa(to);
                    List<Object> col = lista(tab.get("colonne"));
                    if (col.isEmpty()) continue;
                    String tt = str(tab.get("titolo"), "");
                    if (!tt.isBlank()) { Row tr = sh.createRow(r++); tr.setHeightInPoints(20); cella(tr, 0, tt, st.sezione); }
                    String nota = str(tab.get("nota"), "");
                    if (!nota.isBlank()) { Row nr = sh.createRow(r++); cella(nr, 0, nota, st.nota); }
                    // intestazione colonne
                    int head = r;
                    Row h = sh.createRow(r++); h.setHeightInPoints(30);
                    String[] tipi = new String[col.size()];
                    for (int c = 0; c < col.size(); c++) {
                        Map<String, Object> cm = mappa(col.get(c));
                        tipi[c] = str(cm.get("tipo"), "text");
                        cella(h, c, str(cm.get("t"), ""), "text".equals(tipi[c]) ? st.headSx : st.head);
                        int w = cm.get("w") instanceof Number n ? n.intValue() : ("text".equals(tipi[c]) ? 22 : 13);
                        larghezze[c] = Math.max(larghezze[c], w);
                    }
                    // righe
                    List<Object> righe = lista(tab.get("righe"));
                    int i = 0;
                    for (Object ro : righe) {
                        List<Object> v = lista(ro);
                        Row row = sh.createRow(r++);
                        boolean z = (i++ % 2) == 1;
                        for (int c = 0; c < col.size(); c++) scrivi(row, c, c < v.size() ? v.get(c) : null, tipi[c], st, z, false);
                    }
                    if (righe.isEmpty()) { Row row = sh.createRow(r++); cella(row, 0, "Nessun dato nel periodo scelto", st.nota); }
                    // totale
                    List<Object> tot = lista(tab.get("totale"));
                    if (!tot.isEmpty()) {
                        Row row = sh.createRow(r++);
                        for (int c = 0; c < col.size(); c++) scrivi(row, c, c < tot.size() ? tot.get(c) : null, tipi[c], st, false, true);
                    }
                    if (unaSola && !righe.isEmpty()) {
                        sh.setAutoFilter(new CellRangeAddress(head, head + righe.size(), 0, col.size() - 1));
                        sh.createFreezePane(0, head + 1);
                    }
                    r += 2;
                }
                for (int c = 0; c < maxCol; c++) sh.setColumnWidth(c, Math.min(80, Math.max(8, larghezze[c] == 0 ? 14 : larghezze[c])) * 256);
            }
            if (wb.getNumberOfSheets() == 0) wb.createSheet("Vuoto");
            wb.write(out);
            return out.toByteArray();
        }
    }

    private void scrivi(Row row, int c, Object v, String tipo, Stili st, boolean z, boolean tot) {
        Cell cell = row.createCell(c);
        boolean num = v instanceof Number;
        if (num && !"text".equals(tipo)) {
            cell.setCellValue(((Number) v).doubleValue());
            cell.setCellStyle(switch (tipo) {
                case "pct" -> tot ? st.totPct : z ? st.pctZ : st.pct;
                case "eur" -> tot ? st.totEur : z ? st.eurZ : st.eur;
                default -> tot ? st.totInt : z ? st.intZ : st.intero;
            });
        } else {
            String s = v == null ? "" : String.valueOf(v);
            cell.setCellValue("text".equals(tipo) ? s : (s.isBlank() ? "–" : s));
            cell.setCellStyle(tot ? ("text".equals(tipo) ? st.totTxt : st.totInt) : ("text".equals(tipo) ? (z ? st.txtZ : st.txt) : (z ? st.trattinoZ : st.trattino)));
        }
    }

    private static void cella(Row r, int c, String v, CellStyle s) { Cell x = r.createCell(c); x.setCellValue(v); x.setCellStyle(s); }

    private static String nomeFoglio(String n, Set<String> usati) {
        String base = n.replaceAll("[\\\\/?*\\[\\]:]", " ").trim();
        if (base.isEmpty()) base = "Foglio";
        if (base.length() > 28) base = base.substring(0, 28);
        String x = base; int k = 2;
        while (usati.contains(x.toLowerCase())) x = base + " " + k++;
        usati.add(x.toLowerCase());
        return x;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> mappa(Object o) { return o instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of(); }
    @SuppressWarnings("unchecked")
    private static List<Object> lista(Object o) { return o instanceof List<?> l ? (List<Object>) l : List.of(); }
    private static String str(Object o, String def) { return o == null ? def : String.valueOf(o); }

    /* ================= stili ================= */
    private static class Stili {
        final CellStyle titolo, sottotitolo, nota, sezione, head, headSx, txt, txtZ, intero, intZ, pct, pctZ, eur, eurZ, trattino, trattinoZ, totTxt, totInt, totPct, totEur;

        Stili(XSSFWorkbook wb) {
            DataFormat df = wb.createDataFormat();
            XSSFFont fTit = font(wb, 16, true, BORDEAUX), fSot = font(wb, 11, false, GRIGIO), fNota = font(wb, 9, false, GRIGIO),
                    fSez = font(wb, 12, true, BORDEAUX), fHead = font(wb, 10, true, rgb(255, 255, 255)), fTxt = font(wb, 10, false, rgb(0x2A, 0x1D, 0x21)),
                    fTot = font(wb, 10, true, BORDEAUX);
            fSot.setItalic(true);
            titolo = base(wb, fTit, null, HorizontalAlignment.LEFT); titolo.setVerticalAlignment(VerticalAlignment.CENTER);
            sottotitolo = base(wb, fSot, null, HorizontalAlignment.LEFT);
            nota = base(wb, fNota, null, HorizontalAlignment.LEFT);
            sezione = base(wb, fSez, null, HorizontalAlignment.LEFT);
            head = base(wb, fHead, BORDEAUX, HorizontalAlignment.CENTER); head.setWrapText(true); head.setVerticalAlignment(VerticalAlignment.CENTER);
            headSx = base(wb, fHead, BORDEAUX, HorizontalAlignment.LEFT); headSx.setWrapText(true); headSx.setVerticalAlignment(VerticalAlignment.CENTER);
            txt = corpo(wb, fTxt, null, HorizontalAlignment.LEFT, null, df);
            txtZ = corpo(wb, fTxt, ZEBRA, HorizontalAlignment.LEFT, null, df);
            intero = corpo(wb, fTxt, null, HorizontalAlignment.RIGHT, "#,##0", df);
            intZ = corpo(wb, fTxt, ZEBRA, HorizontalAlignment.RIGHT, "#,##0", df);
            pct = corpo(wb, fTxt, null, HorizontalAlignment.RIGHT, "0.00%", df);
            pctZ = corpo(wb, fTxt, ZEBRA, HorizontalAlignment.RIGHT, "0.00%", df);
            eur = corpo(wb, fTxt, null, HorizontalAlignment.RIGHT, "#,##0.00 €", df);
            eurZ = corpo(wb, fTxt, ZEBRA, HorizontalAlignment.RIGHT, "#,##0.00 €", df);
            trattino = corpo(wb, fTxt, null, HorizontalAlignment.RIGHT, null, df);
            trattinoZ = corpo(wb, fTxt, ZEBRA, HorizontalAlignment.RIGHT, null, df);
            totTxt = tot(wb, fTot, HorizontalAlignment.LEFT, null, df);
            totInt = tot(wb, fTot, HorizontalAlignment.RIGHT, "#,##0", df);
            totPct = tot(wb, fTot, HorizontalAlignment.RIGHT, "0.00%", df);
            totEur = tot(wb, fTot, HorizontalAlignment.RIGHT, "#,##0.00 €", df);
        }
        private static XSSFFont font(XSSFWorkbook wb, int size, boolean bold, byte[] color) {
            XSSFFont f = wb.createFont(); f.setFontName("Calibri"); f.setFontHeightInPoints((short) size); f.setBold(bold); f.setColor(new XSSFColor(color, null)); return f;
        }
        private static XSSFCellStyle base(XSSFWorkbook wb, XSSFFont f, byte[] fill, HorizontalAlignment al) {
            XSSFCellStyle s = wb.createCellStyle(); s.setFont(f); s.setAlignment(al);
            if (fill != null) { s.setFillForegroundColor(new XSSFColor(fill, null)); s.setFillPattern(FillPatternType.SOLID_FOREGROUND); }
            return s;
        }
        private static XSSFCellStyle corpo(XSSFWorkbook wb, XSSFFont f, byte[] fill, HorizontalAlignment al, String fmt, DataFormat df) {
            XSSFCellStyle s = base(wb, f, fill, al); s.setVerticalAlignment(VerticalAlignment.CENTER);
            s.setBorderBottom(BorderStyle.THIN); s.setBottomBorderColor(new XSSFColor(LINEA, null));
            if (fmt != null) s.setDataFormat(df.getFormat(fmt));
            return s;
        }
        private static XSSFCellStyle tot(XSSFWorkbook wb, XSSFFont f, HorizontalAlignment al, String fmt, DataFormat df) {
            XSSFCellStyle s = base(wb, f, ROSA, al);
            s.setBorderTop(BorderStyle.MEDIUM); s.setTopBorderColor(new XSSFColor(BORDEAUX, null));
            if (fmt != null) s.setDataFormat(df.getFormat(fmt));
            return s;
        }
    }
}
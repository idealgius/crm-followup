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
import java.time.LocalDate;
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
 *  - intestazioni ottanio, righe alternate, numeri e percentuali formattati,
 *    riga Totale in evidenza, filtri automatici e riquadri bloccati sull'intestazione,
 *    stampa orizzontale adattata alla larghezza della pagina.
 *
 * Formato ricevuto:
 * { "titolo": "...", "sottotitolo": "...",
 *   "fogli": [ { "nome": "Riepilogo",
 *                "tabelle": [ { "titolo": "...", "nota": "...",
 *                               "colonne": [ {"t": "Consulente", "tipo": "text|int|pct|eur|data", "w": 24} ],
 *                               "righe": [ [ "Guido Fiore", 95, 0.1359 ] ],
 *                               "totale": [ "Totale", 95, 0.1359 ] } ] } ] }
 *
 * Opzioni (usate dagli elenchi delle altre sezioni BI, /api/bi/export/excel):
 *   "colore": "ottanio" (predefinito, Commerciale; accetta anche il vecchio "bordeaux") | "blu" (Consegne, Stock)
 *   "aCapo": true  -> il testo lungo va a capo nella cella (colonne strette, niente celle lunghissime)
 *   tipo "data": valore "gg/mm/aaaa" scritto come data vera (si ordina e si filtra in Excel)
 */
@Service
public class CommercialeExcelService {

    private static final ZoneId ITALY = ZoneId.of("Europe/Rome");
    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("dd/MM/yyyy 'alle' HH:mm");
    private static final DateTimeFormatter GMA = DateTimeFormatter.ofPattern("dd/MM/uuuu");

    /** colori del file: principale (intestazioni, titolo), totale, righe alterne, testo grigio, linee, testo */
    private record Palette(byte[] main, byte[] tot, byte[] zebra, byte[] grigio, byte[] linea, byte[] testo) { }
    private static final Palette OTTANIO = new Palette(rgb(0x0E, 0x4A, 0x55), rgb(0xDF, 0xEE, 0xF0), rgb(0xF4, 0xF9, 0xFA),
            rgb(0x5F, 0x74, 0x79), rgb(0xD5, 0xE2, 0xE5), rgb(0x16, 0x26, 0x2A));
    private static final Palette BLU = new Palette(rgb(0x1F, 0x3A, 0x5F), rgb(0xE3, 0xEB, 0xF5), rgb(0xF5, 0xF8, 0xFC),
            rgb(0x5F, 0x6B, 0x7A), rgb(0xD8, 0xE1, 0xEC), rgb(0x1C, 0x24, 0x30));

    private static byte[] rgb(int r, int g, int b) { return new byte[]{(byte) r, (byte) g, (byte) b}; }

    public byte[] export(Map<String, Object> dati, String generatoDa) throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Palette p = "blu".equalsIgnoreCase(str(dati.get("colore"), "")) ? BLU : OTTANIO;
            // elenco = export degli elenchi/riquadri della BI: caratteri piu' grandi, righe ariose,
            // testo a capo e stampa che non rimpicciolisce troppo
            final boolean elenco = Boolean.TRUE.equals(dati.get("aCapo"));
            final double K = elenco ? 1.12 : 1.0;          // colonne un po' piu' larghe per il carattere 11
            Stili st = new Stili(wb, p, elenco);
            String titolo = str(dati.get("titolo"), "Report commerciale");
            String sotto = str(dati.get("sottotitolo"), "");
            String generato = "Generato" + (generatoDa != null && !generatoDa.isBlank() ? " da " + generatoDa : "") + " il " + LocalDateTime.now(ITALY).format(DT);
            Set<String> nomiUsati = new HashSet<>();
            for (Object fo : lista(dati.get("fogli"))) {
                Map<String, Object> foglio = mappa(fo);
                String nome = nomeFoglio(str(foglio.get("nome"), "Foglio"), nomiUsati);
                XSSFSheet sh = wb.createSheet(nome);
                sh.setTabColor(new XSSFColor(p.main(), null));
                sh.setDisplayGridlines(false);
                sh.getPrintSetup().setLandscape(true);
                sh.getPrintSetup().setFitWidth((short) 1);
                sh.getPrintSetup().setFitHeight((short) 0);
                sh.setFitToPage(true);
                // stampa: A4 orizzontale, centrata, a pie' di pagina titolo e "Pagina x di y"
                sh.getPrintSetup().setPaperSize(PrintSetup.A4_PAPERSIZE);
                sh.setHorizontallyCenter(true);
                sh.getFooter().setLeft(titolo.length() > 60 ? titolo.substring(0, 60) : titolo);
                sh.getFooter().setRight("Pagina &P di &N");

                List<Object> tabelle = lista(foglio.get("tabelle"));
                int maxCol = 1;
                for (Object to : tabelle) maxCol = Math.max(maxCol, lista(mappa(to).get("colonne")).size());

                // intestazione del foglio
                int r = 0;
                Row t = sh.createRow(r++); t.setHeightInPoints(elenco ? 32 : 28);
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
                    int[] wTab = new int[col.size()];
                    int righeHead = 1;
                    for (int c = 0; c < col.size(); c++) {
                        Map<String, Object> cm = mappa(col.get(c));
                        tipi[c] = str(cm.get("tipo"), "text");
                        String th = str(cm.get("t"), "");
                        cella(h, c, th, "text".equals(tipi[c]) ? st.headSx : st.head);
                        int w = cm.get("w") instanceof Number n ? n.intValue() : ("text".equals(tipi[c]) ? 22 : 13);
                        if (elenco) w = (int) Math.ceil(w * ("text".equals(tipi[c]) ? K : 1.0));
                        wTab[c] = w;
                        larghezze[c] = Math.max(larghezze[c], w);
                        righeHead = Math.max(righeHead, righe(th, w));
                    }
                    if (elenco) h.setHeightInPoints(Math.min(95, 10 + 15f * righeHead));   // intestazione a capo (colonne strette)
                    // righe
                    List<Object> righe = lista(tab.get("righe"));
                    int i = 0;
                    for (Object ro : righe) {
                        List<Object> v = lista(ro);
                        Row row = sh.createRow(r++);
                        boolean z = (i++ % 2) == 1;
                        int nl = 1;
                        for (int c = 0; c < col.size(); c++) {
                            Object val = c < v.size() ? v.get(c) : null;
                            scrivi(row, c, val, tipi[c], st, z, false);
                            if (elenco && "text".equals(tipi[c]) && val != null) nl = Math.max(nl, righe(String.valueOf(val), wTab[c]));
                        }
                        if (elenco) row.setHeightInPoints(6 + 15f * Math.min(4, nl));   // riga ariosa, alta quanto il testo a capo
                    }
                    if (righe.isEmpty()) { Row row = sh.createRow(r++); cella(row, 0, "Nessun dato nel periodo scelto", st.nota); }
                    // totale
                    List<Object> tot = lista(tab.get("totale"));
                    if (!tot.isEmpty()) {
                        Row row = sh.createRow(r++);
                        if (elenco) row.setHeightInPoints(24);
                        for (int c = 0; c < col.size(); c++) scrivi(row, c, c < tot.size() ? tot.get(c) : null, tipi[c], st, false, true);
                    }
                    if (unaSola && !righe.isEmpty()) {
                        sh.setAutoFilter(new CellRangeAddress(head, head + righe.size(), 0, col.size() - 1));
                        int somma = 0; for (int x : wTab) somma += x;
                        sh.createFreezePane(0, head + 1);
                        sh.setRepeatingRows(new CellRangeAddress(head, head, -1, -1));   // intestazione su ogni pagina stampata
                    }
                    r += 2;
                }
                int totW = 0;
                for (int c = 0; c < maxCol; c++) { int w = Math.min(80, Math.max(elenco ? 6 : 8, larghezze[c] == 0 ? 14 : larghezze[c])); totW += w; sh.setColumnWidth(c, w * 256); }
                if (elenco) {
                    // TUTTO IN UNA PAGINA, SENZA SCORRIMENTO LATERALE
                    // - a video: lo zoom del foglio si riduce quanto basta perche' tutte le colonne
                    //   stiano in uno schermo largo (1920 px, circa 1850 utili)
                    // - in stampa: A4 orizzontale, margini stretti, tutte le colonne in una pagina
                    //   di larghezza (le righe continuano sulle pagine dopo, con l'intestazione ripetuta)
                    int px = 0;
                    for (int c = 0; c < maxCol; c++) px += (int) (sh.getColumnWidth(c) / 256.0 * 7 + 5);
                    int zoom = px <= SCHERMO_PX ? 100 : Math.max(50, (int) Math.floor(SCHERMO_PX * 100.0 / px));
                    sh.setZoom(zoom);
                    sh.setMargin(Sheet.LeftMargin, 0.3); sh.setMargin(Sheet.RightMargin, 0.3);
                    sh.setMargin(Sheet.TopMargin, 0.45); sh.setMargin(Sheet.BottomMargin, 0.55);
                    sh.setFitToPage(true);
                    sh.getPrintSetup().setFitWidth((short) 1);
                    sh.getPrintSetup().setFitHeight((short) 0);
                }
            }
            if (wb.getNumberOfSheets() == 0) wb.createSheet("Vuoto");
            wb.write(out);
            return out.toByteArray();
        }
    }

    /** pixel utili di uno schermo largo 1920 (Excel a tutto schermo) */
    private static final int SCHERMO_PX = 1850;

    /** righe occupate da un testo in una colonna larga w caratteri (testo a capo) */
    private static int righe(String s, int w) {
        if (s == null || s.isEmpty()) return 1;
        int utili = Math.max(4, w - 2), n = 0;
        for (String parte : s.split("\n")) n += Math.max(1, (int) Math.ceil(parte.length() / (double) utili));
        return n;
    }

    private void scrivi(Row row, int c, Object v, String tipo, Stili st, boolean z, boolean tot) {
        Cell cell = row.createCell(c);
        if ("data".equals(tipo) && v instanceof String ds && ds.matches("\\d{2}/\\d{2}/\\d{4}")) {
            try {
                LocalDate d = LocalDate.parse(ds, GMA);
                cell.setCellValue(Date.from(d.atStartOfDay(ITALY).toInstant()));
                cell.setCellStyle(tot ? st.totData : z ? st.dataZ : st.data);
                return;
            } catch (Exception e) { /* data non valida: si scrive come testo */ }
        }
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
            if ("data".equals(tipo)) { cell.setCellStyle(tot ? st.totData : z ? st.dataZ : st.data); return; }   // "–" centrato come le date
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
        final CellStyle titolo, sottotitolo, nota, sezione, head, headSx, txt, txtZ, intero, intZ, pct, pctZ, eur, eurZ, trattino, trattinoZ, totTxt, totInt, totPct, totEur, data, dataZ, totData;

        private final Palette p;

        Stili(XSSFWorkbook wb, Palette p, boolean aCapo) {
            this.p = p;
            DataFormat df = wb.createDataFormat();
            final byte[] BORDEAUX = p.main(), GRIGIO = p.grigio(), ZEBRA = p.zebra();
            final int b = aCapo ? 11 : 10;       // elenchi della BI: carattere 11 (piu' leggibile)
            XSSFFont fTit = font(wb, aCapo ? 18 : 16, true, BORDEAUX), fSot = font(wb, aCapo ? 12 : 11, false, GRIGIO), fNota = font(wb, aCapo ? 10 : 9, false, GRIGIO),
                    fSez = font(wb, aCapo ? 13 : 12, true, BORDEAUX), fHead = font(wb, b, true, rgb(255, 255, 255)), fTxt = font(wb, b, false, p.testo()),
                    fTot = font(wb, b, true, BORDEAUX);
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
            data = corpo(wb, fTxt, null, HorizontalAlignment.CENTER, "dd/mm/yyyy", df);
            dataZ = corpo(wb, fTxt, ZEBRA, HorizontalAlignment.CENTER, "dd/mm/yyyy", df);
            totData = tot(wb, fTot, HorizontalAlignment.CENTER, "dd/mm/yyyy", df);
            if (aCapo) { txt.setWrapText(true); txtZ.setWrapText(true); totTxt.setWrapText(true); }
        }
        private static XSSFFont font(XSSFWorkbook wb, int size, boolean bold, byte[] color) {
            XSSFFont f = wb.createFont(); f.setFontName("Calibri"); f.setFontHeightInPoints((short) size); f.setBold(bold); f.setColor(new XSSFColor(color, null)); return f;
        }
        private static XSSFCellStyle base(XSSFWorkbook wb, XSSFFont f, byte[] fill, HorizontalAlignment al) {
            XSSFCellStyle s = wb.createCellStyle(); s.setFont(f); s.setAlignment(al);
            if (fill != null) { s.setFillForegroundColor(new XSSFColor(fill, null)); s.setFillPattern(FillPatternType.SOLID_FOREGROUND); }
            return s;
        }
        private XSSFCellStyle corpo(XSSFWorkbook wb, XSSFFont f, byte[] fill, HorizontalAlignment al, String fmt, DataFormat df) {
            XSSFCellStyle s = base(wb, f, fill, al); s.setVerticalAlignment(VerticalAlignment.CENTER);
            s.setBorderBottom(BorderStyle.THIN); s.setBottomBorderColor(new XSSFColor(p.linea(), null));
            if (fmt != null) s.setDataFormat(df.getFormat(fmt));
            return s;
        }
        private XSSFCellStyle tot(XSSFWorkbook wb, XSSFFont f, HorizontalAlignment al, String fmt, DataFormat df) {
            XSSFCellStyle s = base(wb, f, p.tot(), al);
            s.setBorderTop(BorderStyle.MEDIUM); s.setTopBorderColor(new XSSFColor(p.main(), null));
            if (fmt != null) s.setDataFormat(df.getFormat(fmt));
            return s;
        }
    }
}
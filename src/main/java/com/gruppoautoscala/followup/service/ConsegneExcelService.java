package com.gruppoautoscala.followup.service;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xddf.usermodel.chart.*;
import org.apache.poi.xssf.usermodel.*;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * AREA CONSEGNE — export Excel dell'"Analisi avanzamento".
 *
 * Il frontend (consegne-analisi.js) invia i dati gia' calcolati con i filtri
 * attivi; qui si costruisce il file con Apache POI:
 *  - foglio "Riepilogo": filtri usati e indicatori principali;
 *  - un foglio per ogni categoria: report (voce, numero, %) + grafico NATIVO
 *    di Excel (ciambella, colonne o linee, come scelto nell'export);
 *  - foglio "Contratti": l'elenco dei contratti filtrati.
 *
 * Formato atteso (JSON):
 * { titolo, filtri, kpi:[{nome,valore,percentuale}],
 *   sezioni:[{nome,titolo,tipo:"doughnut|bar|line",base,
 *             categorie:[...], serie:[{nome,valori:[...]}],
 *             tabella:{intestazioni:[...], righe:[[...]]},
 *             mesi:{labels:[...], serie:[{nome,valori:[...]}]} }],
 *   contratti:{intestazioni:[...], righe:[[...]]} }
 */
@Service
public class ConsegneExcelService {

    private static final int CHART_COL = 8;     // il grafico parte dalla colonna I
    private static final int DATA_COL = 20;     // dati del grafico dalla colonna U

    public byte[] crea(Map<String, Object> p) throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Stili st = new Stili(wb);
            Set<String> nomiUsati = new HashSet<>();

            // ---------- Riepilogo ----------
            XSSFSheet riep = wb.createSheet(nomeFoglio("Riepilogo", nomiUsati));
            int r = 0;
            cella(riep, r++, 0, str(p.get("titolo"), "Consegne · Analisi avanzamento"), st.titolo);
            cella(riep, r++, 0, "Generato il " + ZonedDateTime.now(ZoneId.of("Europe/Rome")).format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")), st.nota);
            cella(riep, r++, 0, "Filtri: " + str(p.get("filtri"), "nessuno"), st.nota);
            r++;
            intestazione(riep, r++, List.of("Indicatore", "Numero", "%"), st);
            for (Object o : lista(p.get("kpi"))) {
                Map<?, ?> k = (Map<?, ?>) o;
                Row row = riep.createRow(r++);
                cella(row, 0, str(k.get("nome"), ""), st.testo);
                numero(row, 1, num(k.get("valore")), st.intero);
                numero(row, 2, num(k.get("percentuale")) / 100.0, st.perc);
            }
            riep.setColumnWidth(0, 34 * 256); riep.setColumnWidth(1, 14 * 256); riep.setColumnWidth(2, 12 * 256);

            // ---------- una scheda per categoria ----------
            for (Object o : lista(p.get("sezioni"))) {
                Map<?, ?> s = (Map<?, ?>) o;
                XSSFSheet sh = wb.createSheet(nomeFoglio(str(s.get("nome"), "Categoria"), nomiUsati));
                int rr = 0;
                cella(sh, rr++, 0, str(s.get("titolo"), ""), st.titolo);
                cella(sh, rr++, 0, "Base: " + (long) num(s.get("base")) + " contratti · " + str(p.get("filtri"), ""), st.nota);
                rr++;
                Map<?, ?> tab = (Map<?, ?>) s.get("tabella");
                List<String> head = new ArrayList<>();
                for (Object h : lista(tab.get("intestazioni"))) head.add(String.valueOf(h));
                intestazione(sh, rr++, head, st);
                for (Object ro : lista(tab.get("righe"))) {
                    List<?> vals = (List<?>) ro;
                    Row row = sh.createRow(rr++);
                    for (int c = 0; c < vals.size(); c++) {
                        Object v = vals.get(c);
                        boolean ultimaPerc = head.get(c).startsWith("%");
                        if (v instanceof Number n) {
                            if (ultimaPerc) numero(row, c, n.doubleValue() / 100.0, st.perc);
                            else numero(row, c, n.doubleValue(), st.intero);
                        } else cella(row, c, String.valueOf(v), st.testo);
                    }
                }
                sh.setColumnWidth(0, 32 * 256);
                for (int c = 1; c < head.size(); c++) sh.setColumnWidth(c, 14 * 256);

                grafico(sh, s, st);
            }

            // ---------- elenco contratti ----------
            Map<?, ?> cont = (Map<?, ?>) p.get("contratti");
            if (cont != null) {
                XSSFSheet sh = wb.createSheet(nomeFoglio("Contratti", nomiUsati));
                List<String> head = new ArrayList<>();
                for (Object h : lista(cont.get("intestazioni"))) head.add(String.valueOf(h));
                intestazione(sh, 0, head, st);
                int rr = 1;
                for (Object ro : lista(cont.get("righe"))) {
                    List<?> vals = (List<?>) ro;
                    Row row = sh.createRow(rr++);
                    for (int c = 0; c < vals.size(); c++) cella(row, c, vals.get(c) == null ? "" : String.valueOf(vals.get(c)), st.testo);
                }
                int[] w = {12, 28, 22, 12, 9, 11, 13, 14, 32, 20, 16, 30, 14, 12, 12, 13, 13, 26};
                for (int c = 0; c < head.size(); c++) sh.setColumnWidth(c, (c < w.length ? w[c] : 16) * 256);
                sh.createFreezePane(0, 1);
                sh.setAutoFilter(new CellRangeAddress(0, Math.max(0, rr - 1), 0, head.size() - 1));
            }

            wb.write(out);
            return out.toByteArray();
        }
    }

    /* ================= grafici nativi ================= */
    private void grafico(XSSFSheet sh, Map<?, ?> s, Stili st) {
        String tipo = str(s.get("tipo"), "bar");
        List<String> labels = new ArrayList<>();
        List<String> nomiSerie = new ArrayList<>();
        List<List<Double>> valori = new ArrayList<>();

        if ("line".equals(tipo) && s.get("mesi") instanceof Map<?, ?> mesi) {
            for (Object l : lista(mesi.get("labels"))) labels.add(String.valueOf(l));
            for (Object so : lista(mesi.get("serie"))) {
                Map<?, ?> se = (Map<?, ?>) so;
                nomiSerie.add(str(se.get("nome"), ""));
                List<Double> v = new ArrayList<>(); for (Object x : lista(se.get("valori"))) v.add(num(x)); valori.add(v);
            }
        } else {
            for (Object l : lista(s.get("categorie"))) labels.add(String.valueOf(l));
            for (Object so : lista(s.get("serie"))) {
                Map<?, ?> se = (Map<?, ?>) so;
                nomiSerie.add(str(se.get("nome"), ""));
                List<Double> v = new ArrayList<>(); for (Object x : lista(se.get("valori"))) v.add(num(x)); valori.add(v);
            }
            if ("line".equals(tipo)) tipo = "bar"; // senza dati mensili non si puo' fare la linea
        }
        if (labels.isEmpty() || valori.isEmpty()) return;
        if ("doughnut".equals(tipo) && valori.size() > 1) { nomiSerie = nomiSerie.subList(0, 1); valori = valori.subList(0, 1); }

        // blocco dati del grafico (a destra, colonna U)
        int r0 = 3;
        Row hr = riga(sh, r0);
        cella(hr, DATA_COL, "Dati del grafico", st.head);
        for (int j = 0; j < nomiSerie.size(); j++) cella(hr, DATA_COL + 1 + j, nomiSerie.get(j), st.head);
        for (int i = 0; i < labels.size(); i++) {
            Row row = riga(sh, r0 + 1 + i);
            cella(row, DATA_COL, labels.get(i), st.testo);
            for (int j = 0; j < valori.size(); j++) numero(row, DATA_COL + 1 + j, i < valori.get(j).size() ? valori.get(j).get(i) : 0, st.intero);
        }
        sh.setColumnWidth(DATA_COL, 24 * 256);
        int first = r0 + 1, last = r0 + labels.size();

        XSSFDrawing drawing = sh.createDrawingPatriarch();
        XSSFClientAnchor anchor = drawing.createAnchor(0, 0, 0, 0, CHART_COL, 2, CHART_COL + 10, 26);
        XSSFChart chart = drawing.createChart(anchor);
        chart.setTitleText(str(s.get("titolo"), ""));
        chart.setTitleOverlay(false);
        XDDFChartLegend legend = chart.getOrAddLegend();
        legend.setPosition("doughnut".equals(tipo) ? LegendPosition.RIGHT : LegendPosition.BOTTOM);

        XDDFDataSource<String> cat = XDDFDataSourcesFactory.fromStringCellRange(sh, new CellRangeAddress(first, last, DATA_COL, DATA_COL));

        if ("doughnut".equals(tipo)) {
            XDDFDoughnutChartData data = (XDDFDoughnutChartData) chart.createData(ChartTypes.DOUGHNUT, null, null);
            data.setVaryColors(true);
            data.setHoleSize(55);
            XDDFNumericalDataSource<Double> val = XDDFDataSourcesFactory.fromNumericCellRange(sh, new CellRangeAddress(first, last, DATA_COL + 1, DATA_COL + 1));
            XDDFChartData.Series serie = data.addSeries(cat, val);
            serie.setTitle(nomiSerie.get(0), null);
            chart.plot(data);
            return;
        }

        XDDFCategoryAxis x = chart.createCategoryAxis(AxisPosition.BOTTOM);
        XDDFValueAxis y = chart.createValueAxis(AxisPosition.LEFT);
        y.setCrosses(AxisCrosses.AUTO_ZERO);

        if ("line".equals(tipo)) {
            XDDFLineChartData data = (XDDFLineChartData) chart.createData(ChartTypes.LINE, x, y);
            for (int j = 0; j < valori.size(); j++) {
                XDDFNumericalDataSource<Double> val = XDDFDataSourcesFactory.fromNumericCellRange(sh, new CellRangeAddress(first, last, DATA_COL + 1 + j, DATA_COL + 1 + j));
                XDDFLineChartData.Series serie = (XDDFLineChartData.Series) data.addSeries(cat, val);
                serie.setTitle(nomiSerie.get(j), null);
                serie.setSmooth(true);
                serie.setMarkerStyle(MarkerStyle.CIRCLE);
            }
            chart.plot(data);
            return;
        }

        XDDFBarChartData data = (XDDFBarChartData) chart.createData(ChartTypes.BAR, x, y);
        data.setBarDirection(BarDirection.COL);
        if (valori.size() > 1) {
            data.setBarGrouping(BarGrouping.STACKED);
            data.setOverlap((byte) 100);
        } else {
            data.setVaryColors(true);
        }
        for (int j = 0; j < valori.size(); j++) {
            XDDFNumericalDataSource<Double> val = XDDFDataSourcesFactory.fromNumericCellRange(sh, new CellRangeAddress(first, last, DATA_COL + 1 + j, DATA_COL + 1 + j));
            XDDFChartData.Series serie = data.addSeries(cat, val);
            serie.setTitle(nomiSerie.get(j), null);
        }
        chart.plot(data);
    }

    /* ================= utilita' ================= */
    private static class Stili {
        final CellStyle titolo, nota, head, testo, intero, perc;
        Stili(XSSFWorkbook wb) {
            XSSFFont ft = wb.createFont(); ft.setBold(true); ft.setFontHeightInPoints((short) 14);
            titolo = wb.createCellStyle(); titolo.setFont(ft);
            XSSFFont fn = wb.createFont(); fn.setItalic(true); fn.setColor(IndexedColors.GREY_50_PERCENT.getIndex());
            nota = wb.createCellStyle(); nota.setFont(fn);
            XSSFFont fh = wb.createFont(); fh.setBold(true); fh.setColor(IndexedColors.WHITE.getIndex());
            head = wb.createCellStyle(); head.setFont(fh);
            head.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex()); head.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            head.setBorderBottom(BorderStyle.THIN);
            testo = wb.createCellStyle();
            intero = wb.createCellStyle(); intero.setDataFormat(wb.createDataFormat().getFormat("#,##0"));
            perc = wb.createCellStyle(); perc.setDataFormat(wb.createDataFormat().getFormat("0.0%"));
        }
    }
    private static Row riga(Sheet sh, int r) { Row row = sh.getRow(r); return row != null ? row : sh.createRow(r); }
    private static void cella(Sheet sh, int r, int c, String v, CellStyle s) { cella(riga(sh, r), c, v, s); }
    private static void cella(Row row, int c, String v, CellStyle s) { Cell cell = row.createCell(c); cell.setCellValue(v); cell.setCellStyle(s); }
    private static void numero(Row row, int c, double v, CellStyle s) { Cell cell = row.createCell(c); cell.setCellValue(v); cell.setCellStyle(s); }
    private static void intestazione(Sheet sh, int r, List<String> head, Stili st) {
        Row row = riga(sh, r);
        for (int c = 0; c < head.size(); c++) cella(row, c, head.get(c), st.head);
    }
    private static List<?> lista(Object o) { return o instanceof List<?> l ? l : List.of(); }
    private static String str(Object o, String def) { return o == null ? def : String.valueOf(o); }
    private static double num(Object o) {
        if (o instanceof Number n) return n.doubleValue();
        try { return o == null ? 0 : Double.parseDouble(String.valueOf(o)); } catch (NumberFormatException e) { return 0; }
    }
    private static String nomeFoglio(String nome, Set<String> usati) {
        String base = nome.replaceAll("[\\[\\]:*?/\\\\]", " ").trim();
        if (base.isEmpty()) base = "Foglio";
        if (base.length() > 28) base = base.substring(0, 28).trim();
        String n = base; int i = 2;
        while (usati.contains(n.toLowerCase())) n = base + " " + (i++);
        usati.add(n.toLowerCase());
        return n;
    }
}
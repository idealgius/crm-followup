package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.ContactLog;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xddf.usermodel.chart.*;
import org.apache.poi.xssf.usermodel.*;

import java.io.ByteArrayOutputStream;
import java.time.format.DateTimeFormatter;
import java.util.*;

public class ExcelExportService {

    private static final String[] SEDI = {"Agnano", "Casamarciano", "Salerno"};
    private static final String[] ACQUISTO_TIPI = {"Info Consegna", "Ritardo Consegna", "Info Documentazione", "Seconda chiave", "Info generiche"};
    private static final String[] FONTE_LIST = {"Sito", "Google ADS", "Autoscout", "Facebook", "Instagram", "TikTok", "Richiesta cliente", "Non ricorda"};
    private static final String[] SERVICE_LIST = {"Tagliando", "Dispositivo satellitare", "Prenotazione", "Lavorazione in corso", "Doctor Glass", "Cambio Gomme"};

    public byte[] export(List<ContactLog> logs) throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook();

        int total = logs.size();

        Map<String, Integer> byCategory = new LinkedHashMap<>();
        Map<String, Integer> byOperator = new LinkedHashMap<>();
        Map<String, Integer> bySede = new LinkedHashMap<>();
        Map<String, Integer> byAcquisto = new LinkedHashMap<>();
        Map<String, Integer> byFonte = new LinkedHashMap<>();
        Map<String, Integer> byService = new LinkedHashMap<>();
        Map<String, Integer> byMarca = new LinkedHashMap<>();
        Map<String, Integer> byNoleggioTipo = new LinkedHashMap<>();
        byNoleggioTipo.put("Privato", 0);
        byNoleggioTipo.put("Partita IVA", 0);

        for (String s : SEDI) bySede.put(s, 0);
        for (String a : ACQUISTO_TIPI) byAcquisto.put(a, 0);
        for (String f : FONTE_LIST) byFonte.put(f, 0);
        for (String s : SERVICE_LIST) byService.put(s, 0);

        int noleggioSoloInfo = 0;
        int noleggioLeadGenerata = 0;
        int promoTotal = 0;
        Map<String, Integer> byPromoModello = new LinkedHashMap<>();

        for (ContactLog log : logs) {
            String cat = "Info + Appuntamento".equals(log.getCategory()) ? "Info Vendita" :
                         "Info Vendita in Promo".equals(log.getCategory()) ? "Info Vendita" :
                         log.getCategory();
            byCategory.merge(cat, 1, Integer::sum);
            byOperator.merge(log.getUser().getFullName(), 1, Integer::sum);

            if ("Info + Appuntamento".equals(log.getCategory()) && log.getOtherNote() != null) {
                String sede = log.getOtherNote().trim();
                if (bySede.containsKey(sede)) bySede.merge(sede, 1, Integer::sum);
            }
            if ("Info Acquisto effettuato".equals(log.getCategory()) && log.getOtherNote() != null) {
                String tipo = log.getOtherNote().trim();
                if (byAcquisto.containsKey(tipo)) byAcquisto.merge(tipo, 1, Integer::sum);
            }
            if ("Info Vendita".equals(log.getCategory()) && log.getOtherNote() != null) {
                String fonte = log.getOtherNote().trim();
                if (byFonte.containsKey(fonte)) byFonte.merge(fonte, 1, Integer::sum);
            }
            if ("Service".equals(log.getCategory()) && log.getServiceTipo() != null) {
                String st = log.getServiceTipo().trim();
                if (byService.containsKey(st)) byService.merge(st, 1, Integer::sum);
            }
            if (log.getMarca() != null && !log.getMarca().isBlank()) {
                byMarca.merge(log.getMarca().trim().toUpperCase(), 1, Integer::sum);
            }
            if ("Info Noleggio".equals(log.getCategory())) {
                if (log.getNoleggioTipo() != null && byNoleggioTipo.containsKey(log.getNoleggioTipo())) {
                    byNoleggioTipo.merge(log.getNoleggioTipo(), 1, Integer::sum);
                }
                if (log.getNoleggioLink() != null && !log.getNoleggioLink().isBlank()) {
                    noleggioLeadGenerata++;
                } else {
                    noleggioSoloInfo++;
                }
            }
            if ("Info Vendita in Promo".equals(log.getCategory())) {
                promoTotal++;
                if (log.getModello() != null && !log.getModello().isBlank()) {
                    byPromoModello.merge(log.getModello().trim(), 1, Integer::sum);
                }
            }
        }

        CellStyle headerStyle = createHeaderStyle(wb);
        CellStyle titleStyle = createTitleStyle(wb);
        CellStyle chartTitleStyle = createChartTitleStyle(wb);

        // ===== FOGLIO 1: DATI — senza Ruolo, con AutoFilter =====
        XSSFSheet sheet1 = wb.createSheet("Dati Registro");
        String[] headers1 = {"Data", "Orario", "Categoria", "Dettaglio", "Nominativo Appuntamento",
                "Link Appuntamento", "Operatore", "% Categoria", "N. per Categoria", "% Operatore", "N. per Operatore"};
        int[] widths1 = {3000, 2200, 6500, 7000, 6500, 9000, 6000, 3200, 4200, 3200, 4200};

        Row headerRow1 = sheet1.createRow(0);
        headerRow1.setHeightInPoints(20);
        for (int i = 0; i < headers1.length; i++) {
            Cell c = headerRow1.createCell(i);
            c.setCellValue(headers1[i]);
            c.setCellStyle(headerStyle);
            sheet1.setColumnWidth(i, widths1[i]);
        }
        sheet1.setAutoFilter(new CellRangeAddress(0, 0, 0, headers1.length - 1));
        sheet1.createFreezePane(0, 1);

        DateTimeFormatter dateFmt = DateTimeFormatter.ofPattern("yyyy-MM-dd");
        DateTimeFormatter timeFmt = DateTimeFormatter.ofPattern("HH:mm");

        int rowIdx = 1;
        for (ContactLog log : logs) {
            Row row = sheet1.createRow(rowIdx++);
            String catForPct = "Info + Appuntamento".equals(log.getCategory()) ? "Info Vendita" :
                               "Info Vendita in Promo".equals(log.getCategory()) ? "Info Vendita" :
                               log.getCategory();
            int catCount = byCategory.getOrDefault(catForPct, 0);
            double catPct = total > 0 ? Math.round(catCount * 1000.0 / total) / 10.0 : 0;
            int opCount = byOperator.getOrDefault(log.getUser().getFullName(), 0);
            double opPct = total > 0 ? Math.round(opCount * 1000.0 / total) / 10.0 : 0;

            row.createCell(0).setCellValue(log.getContactDate().format(dateFmt));
            row.createCell(1).setCellValue(log.getContactDate().format(timeFmt));
            row.createCell(2).setCellValue(log.getCategory());
            row.createCell(3).setCellValue(log.getOtherNote() != null ? log.getOtherNote() : "");
            row.createCell(4).setCellValue(log.getNominativoAppuntamento() != null ? log.getNominativoAppuntamento() : "");
            row.createCell(5).setCellValue(log.getLinkAppuntamento() != null ? log.getLinkAppuntamento() : "");
            row.createCell(6).setCellValue(log.getUser().getFullName());
            row.createCell(7).setCellValue(catPct + "%");
            row.createCell(8).setCellValue(catCount);
            row.createCell(9).setCellValue(opPct + "%");
            row.createCell(10).setCellValue(opCount);
        }

        // ===== FOGLIO 2: RIEPILOGO =====
        XSSFSheet sheet2 = wb.createSheet("Riepilogo Statistiche");
        sheet2.setColumnWidth(0, 9000);
        sheet2.setColumnWidth(1, 3200);
        sheet2.setColumnWidth(2, 3800);

        int r2 = 0;
        r2 = writeSection(sheet2, titleStyle, headerStyle, r2, "DISTRIBUZIONE CATEGORIE", byCategory, total);
        r2++;
        int totalOp = byOperator.values().stream().mapToInt(Integer::intValue).sum();
        r2 = writeSection(sheet2, titleStyle, headerStyle, r2, "CHIAMATE PER OPERATORE", byOperator, totalOp);
        r2++;
        int totalSede = bySede.values().stream().mapToInt(Integer::intValue).sum();
        r2 = writeSection(sheet2, titleStyle, headerStyle, r2, "APPUNTAMENTI PER SEDE", bySede, totalSede);
        r2++;
        int totalAcq = byAcquisto.values().stream().mapToInt(Integer::intValue).sum();
        r2 = writeSection(sheet2, titleStyle, headerStyle, r2, "INFO ACQUISTO EFFETTUATO", byAcquisto, totalAcq);
        r2++;
        int totalFonte = byFonte.values().stream().mapToInt(Integer::intValue).sum();
        r2 = writeSection(sheet2, titleStyle, headerStyle, r2, "FONTE INFO VENDITA", byFonte, totalFonte);
        r2++;
        int totalService = byService.values().stream().mapToInt(Integer::intValue).sum();
        r2 = writeSection(sheet2, titleStyle, headerStyle, r2, "TIPOLOGIE SERVICE", byService, totalService);
        r2++;
        if (!byMarca.isEmpty()) {
            Map<String, Integer> byMarcaSorted = new LinkedHashMap<>();
            byMarca.entrySet().stream()
                .sorted(Map.Entry.<String,Integer>comparingByValue().reversed())
                .forEach(e -> byMarcaSorted.put(e.getKey(), e.getValue()));
            int totalMarca = byMarcaSorted.values().stream().mapToInt(Integer::intValue).sum();
            r2 = writeSection(sheet2, titleStyle, headerStyle, r2, "PERFORMANCE MARCHE", byMarcaSorted, totalMarca);
            r2++;
        }
        int totalNoleggio = byNoleggioTipo.values().stream().mapToInt(Integer::intValue).sum();
        if (totalNoleggio > 0) {
            r2 = writeSection(sheet2, titleStyle, headerStyle, r2, "TIPOLOGIA NOLEGGIO", byNoleggioTipo, totalNoleggio);
            r2++;
            Map<String, Integer> noleggioLead = new LinkedHashMap<>();
            noleggioLead.put("Solo info", noleggioSoloInfo);
            noleggioLead.put("Lead generata", noleggioLeadGenerata);
            r2 = writeSection(sheet2, titleStyle, headerStyle, r2, "NOLEGGIO: SOLO INFO vs LEAD", noleggioLead, totalNoleggio);
            r2++;
        }
        if (promoTotal > 0 && !byPromoModello.isEmpty()) {
            r2 = writeSection(sheet2, titleStyle, headerStyle, r2, "MODELLI RICHIESTI IN PROMO", byPromoModello, promoTotal);
        }

        // ===== FOGLIO 3: GRAFICI =====
        XSSFSheet sheet3 = wb.createSheet("Grafici");
        for (int i = 0; i <= 40; i++) sheet3.setColumnWidth(i, 2600);

        int chartRow = 0;
        buildDataAndChart(wb, sheet3, chartTitleStyle, "Distribuzione Categorie", byCategory, chartRow, 0);
        buildDataAndChart(wb, sheet3, chartTitleStyle, "Chiamate per Operatore", byOperator, chartRow, 16);
        chartRow += 20;
        buildDataAndChart(wb, sheet3, chartTitleStyle, "Appuntamenti per Sede", bySede, chartRow, 0);
        buildDataAndChart(wb, sheet3, chartTitleStyle, "Info Acquisto Effettuato", byAcquisto, chartRow, 16);
        chartRow += 20;
        buildDataAndChart(wb, sheet3, chartTitleStyle, "Fonte Info Vendita", byFonte, chartRow, 0);
        buildDataAndChart(wb, sheet3, chartTitleStyle, "Tipologie Service", byService, chartRow, 16);
        chartRow += 20;
        if (!byMarca.isEmpty()) {
            Map<String, Integer> top10 = new LinkedHashMap<>();
            byMarca.entrySet().stream()
                .sorted(Map.Entry.<String,Integer>comparingByValue().reversed())
                .limit(10).forEach(e -> top10.put(e.getKey(), e.getValue()));
            buildDataAndChart(wb, sheet3, chartTitleStyle, "Performance Marche", top10, chartRow, 0);
            chartRow += 20;
        }
        if (totalNoleggio > 0) {
            buildDataAndChart(wb, sheet3, chartTitleStyle, "Tipologia Noleggio", byNoleggioTipo, chartRow, 0);
            Map<String, Integer> noleggioLead = new LinkedHashMap<>();
            noleggioLead.put("Solo info", noleggioSoloInfo);
            noleggioLead.put("Lead generata", noleggioLeadGenerata);
            buildDataAndChart(wb, sheet3, chartTitleStyle, "Noleggio Info vs Lead", noleggioLead, chartRow, 16);
            chartRow += 20;
        }
        if (promoTotal > 0 && !byPromoModello.isEmpty()) {
            buildDataAndChart(wb, sheet3, chartTitleStyle, "Modelli Promo", byPromoModello, chartRow, 0);
        }

        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        wb.write(bos);
        wb.close();
        return bos.toByteArray();
    }

    private int writeSection(XSSFSheet sheet, CellStyle titleStyle, CellStyle headerStyle,
                              int startRow, String title, Map<String, Integer> data, int total) {
        Row titleRow = sheet.createRow(startRow);
        titleRow.setHeightInPoints(18);
        Cell titleCell = titleRow.createCell(0);
        titleCell.setCellValue(title);
        titleCell.setCellStyle(titleStyle);

        Row colRow = sheet.createRow(startRow + 1);
        String[] colHeaders = {"Voce", "Numero", "Percentuale"};
        for (int i = 0; i < colHeaders.length; i++) {
            Cell c = colRow.createCell(i);
            c.setCellValue(colHeaders[i]);
            c.setCellStyle(headerStyle);
        }

        int r = startRow + 2;
        for (Map.Entry<String, Integer> e : data.entrySet()) {
            Row row = sheet.createRow(r++);
            row.createCell(0).setCellValue(e.getKey());
            row.createCell(1).setCellValue(e.getValue());
            double pct = total > 0 ? Math.round(e.getValue() * 1000.0 / total) / 10.0 : 0;
            row.createCell(2).setCellValue(pct + "%");
        }

        Row totalRow = sheet.createRow(r++);
        Cell totalLabel = totalRow.createCell(0);
        totalLabel.setCellValue("Totale");
        totalLabel.setCellStyle(headerStyle);
        totalRow.createCell(1).setCellValue(total);
        Cell totalPct = totalRow.createCell(2);
        totalPct.setCellValue("100%");
        totalPct.setCellStyle(headerStyle);
        return r;
    }

    private void buildDataAndChart(XSSFWorkbook wb, XSSFSheet sheet, CellStyle chartTitleStyle,
                                    String title, Map<String, Integer> data, int startRow, int startCol) {
        Row titleRow = sheet.getRow(startRow);
        if (titleRow == null) titleRow = sheet.createRow(startRow);
        Cell titleCell = titleRow.createCell(startCol);
        titleCell.setCellValue(title.toUpperCase());
        titleCell.setCellStyle(chartTitleStyle);

        int dataStartRow = startRow + 1;
        int i = 0;
        for (Map.Entry<String, Integer> e : data.entrySet()) {
            Row row = sheet.getRow(dataStartRow + i);
            if (row == null) row = sheet.createRow(dataStartRow + i);
            row.createCell(startCol).setCellValue(e.getKey());
            row.createCell(startCol + 1).setCellValue(e.getValue());
            i++;
        }
        int dataEndRow = dataStartRow + data.size() - 1;

        XSSFDrawing drawing = sheet.createDrawingPatriarch();
        XSSFClientAnchor anchor = drawing.createAnchor(
                0, 0, 0, 0,
                startCol + 3, startRow + 1, startCol + 14, startRow + 17
        );

        XSSFChart chart = drawing.createChart(anchor);
        chart.setTitleText(title);
        chart.setTitleOverlay(false);

        XDDFChartLegend legend = chart.getOrAddLegend();
        legend.setPosition(LegendPosition.BOTTOM);
        legend.setOverlay(false);

        XDDFCategoryAxis bottomAxis = chart.createCategoryAxis(AxisPosition.BOTTOM);
        bottomAxis.setVisible(true);

        XDDFValueAxis leftAxis = chart.createValueAxis(AxisPosition.LEFT);
        leftAxis.setCrosses(AxisCrosses.AUTO_ZERO);

        XDDFDataSource<String> categories = XDDFDataSourcesFactory.fromStringCellRange(
                sheet, new CellRangeAddress(dataStartRow, dataEndRow, startCol, startCol));
        XDDFNumericalDataSource<Double> values = XDDFDataSourcesFactory.fromNumericCellRange(
                sheet, new CellRangeAddress(dataStartRow, dataEndRow, startCol + 1, startCol + 1));

        XDDFBarChartData barChart = (XDDFBarChartData) chart.createData(ChartTypes.BAR, bottomAxis, leftAxis);
        barChart.setBarDirection(BarDirection.COL);

        XDDFBarChartData.Series series = (XDDFBarChartData.Series) barChart.addSeries(categories, values);
        series.setTitle(title, null);

        chart.plot(barChart);
    }

    private CellStyle createHeaderStyle(XSSFWorkbook wb) {
        CellStyle style = wb.createCellStyle();
        Font font = wb.createFont();
        font.setBold(true);
        font.setFontHeightInPoints((short) 10);
        style.setFont(font);
        style.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        return style;
    }

    private CellStyle createTitleStyle(XSSFWorkbook wb) {
        CellStyle style = wb.createCellStyle();
        Font font = wb.createFont();
        font.setBold(true);
        font.setFontHeightInPoints((short) 12);
        font.setColor(IndexedColors.WHITE.getIndex());
        style.setFont(font);
        style.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        return style;
    }

    private CellStyle createChartTitleStyle(XSSFWorkbook wb) {
        CellStyle style = wb.createCellStyle();
        Font font = wb.createFont();
        font.setBold(true);
        font.setFontHeightInPoints((short) 11);
        style.setFont(font);
        return style;
    }
}
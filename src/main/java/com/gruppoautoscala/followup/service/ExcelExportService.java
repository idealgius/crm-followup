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
    private static final String[] ACQUISTO_TIPI = {"Info Consegna", "Ritardo Consegna", "Info Documentazione"};
    private static final String[] FONTE_LIST = {"Sito", "Google ADS", "Autoscout", "Facebook", "Instagram", "TikTok", "Richiesta cliente", "Non ricorda"};

    public byte[] export(List<ContactLog> logs) throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook();

        // ===== CALCOLO DATI =====
        int total = logs.size();

        Map<String, Integer> byCategory = new LinkedHashMap<>();
        Map<String, Integer> byOperator = new LinkedHashMap<>();
        Map<String, Integer> bySede = new LinkedHashMap<>();
        Map<String, Integer> byAcquisto = new LinkedHashMap<>();
        Map<String, Integer> byFonte = new LinkedHashMap<>();

        for (String s : SEDI) bySede.put(s, 0);
        for (String a : ACQUISTO_TIPI) byAcquisto.put(a, 0);
        for (String f : FONTE_LIST) byFonte.put(f, 0);

        for (ContactLog log : logs) {
            String cat = "Info + Appuntamento".equals(log.getCategory()) ? "Info Vendita" : log.getCategory();
            byCategory.merge(cat, 1, Integer::sum);

            String operatorName = log.getUser().getFullName();
            byOperator.merge(operatorName, 1, Integer::sum);

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
        }

        // ===== FOGLIO 1: DATI =====
        XSSFSheet sheet1 = wb.createSheet("Dati Registro");
        String[] headers1 = {"Data", "Orario", "Categoria", "Dettaglio", "Nominativo Appuntamento",
                "Link Appuntamento", "Operatore", "Ruolo", "% Categoria", "N. per Categoria", "% Operatore", "N. per Operatore"};
        Row headerRow1 = sheet1.createRow(0);
        CellStyle headerStyle = createHeaderStyle(wb);
        for (int i = 0; i < headers1.length; i++) {
            Cell c = headerRow1.createCell(i);
            c.setCellValue(headers1[i]);
            c.setCellStyle(headerStyle);
        }

        DateTimeFormatter dateFmt = DateTimeFormatter.ofPattern("yyyy-MM-dd");
        DateTimeFormatter timeFmt = DateTimeFormatter.ofPattern("HH:mm");

        int rowIdx = 1;
        for (ContactLog log : logs) {
            Row row = sheet1.createRow(rowIdx++);
            String catForPct = "Info + Appuntamento".equals(log.getCategory()) ? "Info Vendita" : log.getCategory();
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
            row.createCell(7).setCellValue(log.getUser().getRole());
            row.createCell(8).setCellValue(catPct + "%");
            row.createCell(9).setCellValue(catCount);
            row.createCell(10).setCellValue(opPct + "%");
            row.createCell(11).setCellValue(opCount);
        }
        for (int i = 0; i < headers1.length; i++) sheet1.autoSizeColumn(i);

        // ===== FOGLIO 2: RIEPILOGO =====
        XSSFSheet sheet2 = wb.createSheet("Riepilogo Statistiche");
        int r2 = 0;
        r2 = writeSection(sheet2, wb, r2, "DISTRIBUZIONE CATEGORIE", byCategory, total);
        r2++;
        int totalOp = byOperator.values().stream().mapToInt(Integer::intValue).sum();
        r2 = writeSection(sheet2, wb, r2, "CHIAMATE PER OPERATORE", byOperator, totalOp);
        r2++;
        int totalSede = bySede.values().stream().mapToInt(Integer::intValue).sum();
        r2 = writeSection(sheet2, wb, r2, "APPUNTAMENTI PER SEDE", bySede, totalSede);
        r2++;
        int totalAcq = byAcquisto.values().stream().mapToInt(Integer::intValue).sum();
        r2 = writeSection(sheet2, wb, r2, "INFO ACQUISTO EFFETTUATO", byAcquisto, totalAcq);
        r2++;
        int totalFonte = byFonte.values().stream().mapToInt(Integer::intValue).sum();
        writeSection(sheet2, wb, r2, "FONTE INFO VENDITA", byFonte, totalFonte);
        for (int i = 0; i < 4; i++) sheet2.autoSizeColumn(i);

        // ===== FOGLIO 3: GRAFICI NATIVI =====
        XSSFSheet sheet3 = wb.createSheet("Grafici");
        buildDataAndChart(wb, sheet3, "Distribuzione Categorie", byCategory, 0, 0);
        buildDataAndChart(wb, sheet3, "Chiamate per Operatore", byOperator, 0, 18);
        buildDataAndChart(wb, sheet3, "Appuntamenti per Sede", bySede, 18, 0);
        buildDataAndChart(wb, sheet3, "Info Acquisto Effettuato", byAcquisto, 18, 18);
        buildDataAndChart(wb, sheet3, "Fonte Info Vendita", byFonte, 36, 0);

        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        wb.write(bos);
        wb.close();
        return bos.toByteArray();
    }

    private int writeSection(XSSFSheet sheet, XSSFWorkbook wb, int startRow, String title, Map<String, Integer> data, int total) {
        CellStyle titleStyle = createHeaderStyle(wb);
        Row titleRow = sheet.createRow(startRow);
        Cell titleCell = titleRow.createCell(0);
        titleCell.setCellValue("=== " + title + " ===");
        titleCell.setCellStyle(titleStyle);

        Row colRow = sheet.createRow(startRow + 1);
        colRow.createCell(0).setCellValue("Voce");
        colRow.createCell(1).setCellValue("Numero");
        colRow.createCell(2).setCellValue("Percentuale");

        int r = startRow + 2;
        for (Map.Entry<String, Integer> e : data.entrySet()) {
            Row row = sheet.createRow(r++);
            row.createCell(0).setCellValue(e.getKey());
            row.createCell(1).setCellValue(e.getValue());
            double pct = total > 0 ? Math.round(e.getValue() * 1000.0 / total) / 10.0 : 0;
            row.createCell(2).setCellValue(pct + "%");
        }
        return r;
    }

    private void buildDataAndChart(XSSFWorkbook wb, XSSFSheet sheet, String title, Map<String, Integer> data, int startRow, int startCol) {
        Row titleRow = sheet.createRow(startRow);
        titleRow.createCell(startCol).setCellValue(title);

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
                startCol + 3, startRow, startCol + 12, startRow + 14
        );

        XSSFChart chart = drawing.createChart(anchor);
        chart.setTitleText(title);
        chart.setTitleOverlay(false);

        XDDFChartLegend legend = chart.getOrAddLegend();
        legend.setPosition(LegendPosition.BOTTOM);

        XDDFCategoryAxis bottomAxis = chart.createCategoryAxis(AxisPosition.BOTTOM);
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
        style.setFont(font);
        return style;
    }
}
package com.gruppoautoscala.followup.service;

import com.gruppoautoscala.followup.model.NoleggioTrattativa;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xddf.usermodel.chart.*;
import org.apache.poi.xssf.usermodel.*;
import org.openxmlformats.schemas.drawingml.x2006.chart.CTCatAx;
import org.openxmlformats.schemas.drawingml.x2006.chart.CTChartSpace;
import org.openxmlformats.schemas.drawingml.x2006.chart.CTPlotArea;
import org.openxmlformats.schemas.drawingml.x2006.main.CTTextBody;
import org.openxmlformats.schemas.drawingml.x2006.main.CTTextBodyProperties;

import java.io.ByteArrayOutputStream;
import java.time.format.DateTimeFormatter;
import java.util.*;

public class NoleggioExcelExportService {

    private static final Map<String, String> STATO_LABELS = new LinkedHashMap<>();
    static {
        STATO_LABELS.put("SOLO_INFO", "Solo Info");
        STATO_LABELS.put("TRATTATIVA_IN_CORSO", "Trattativa in corso");
        STATO_LABELS.put("DA_RICHIAMARE", "Da richiamare");
        STATO_LABELS.put("CONCLUSA", "Conclusa");
        STATO_LABELS.put("FALLITO", "Fallito");
    }

    private static final String[] FONTE_LIST = {"Sito", "Google ADS", "Autoscout", "Facebook", "Instagram", "TikTok", "Richiesta cliente", "Non ricorda", "Ingresso", "Cliente Personale"};

    public byte[] export(List<NoleggioTrattativa> list) throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook();

        int total = list.size();

        Map<String, Integer> byStato = new LinkedHashMap<>();
        for (String key : STATO_LABELS.keySet()) byStato.put(STATO_LABELS.get(key), 0);
        Map<String, Integer> byFonte = new LinkedHashMap<>();
        for (String f : FONTE_LIST) byFonte.put(f, 0);
        Map<String, Integer> byMarchio = new LinkedHashMap<>();
        Map<String, Integer> byOperatore = new LinkedHashMap<>();
        Map<String, Integer> byTipoCliente = new LinkedHashMap<>();
        byTipoCliente.put("Privato", 0);
        byTipoCliente.put("Partita IVA", 0);
        byTipoCliente.put("Noleggio per aziende", 0);

        for (NoleggioTrattativa t : list) {
            String statoLabel = STATO_LABELS.getOrDefault(t.getStato(), t.getStato());
            byStato.merge(statoLabel, 1, Integer::sum);
            if (t.getFonte() != null && byFonte.containsKey(t.getFonte())) {
                byFonte.merge(t.getFonte(), 1, Integer::sum);
            }
            if (t.getMarchio() != null && !t.getMarchio().isBlank()) {
                byMarchio.merge(t.getMarchio().trim().toUpperCase(), 1, Integer::sum);
            }
            if (t.getUser() != null && t.getUser().getFullName() != null) {
                byOperatore.merge(t.getUser().getFullName(), 1, Integer::sum);
            }
            if (t.getTipoCliente() != null && byTipoCliente.containsKey(t.getTipoCliente())) {
                byTipoCliente.merge(t.getTipoCliente(), 1, Integer::sum);
            }
        }

        CellStyle headerStyle = createHeaderStyle(wb);
        CellStyle titleStyle = createTitleStyle(wb);
        CellStyle chartTitleStyle = createChartTitleStyle(wb);

        // ===== FOGLIO 1: DATI — registro completo trattative =====
        XSSFSheet sheet1 = wb.createSheet("Registro Trattative");
        String[] headers1 = {
            "Data Creazione", "Nome", "Cognome", "Cellulare", "Email", "Marchio", "Modello",
            "Fonte", "Tipologia Cliente", "Stato", "Data Richiamo", "Nota Fallimento",
            "Note", "Link Leadspark", "Link Auto Richiesta",
            "Operatore", "Ruolo Operatore"
        };
        int[] widths1 = {3200, 4500, 4500, 3800, 6000, 4500, 5500, 4500, 4500, 5500, 3500, 6500, 8000, 8000, 8000, 5500, 3800};

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

        DateTimeFormatter dateFmt = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
        DateTimeFormatter dateOnlyFmt = DateTimeFormatter.ofPattern("dd/MM/yyyy");

        int rowIdx = 1;
        for (NoleggioTrattativa t : list) {
            Row row = sheet1.createRow(rowIdx++);
            row.createCell(0).setCellValue(t.getCreatedAt() != null ? t.getCreatedAt().format(dateFmt) : "");
            row.createCell(1).setCellValue(t.getNome() != null ? t.getNome() : "");
            row.createCell(2).setCellValue(t.getCognome() != null ? t.getCognome() : "");
            row.createCell(3).setCellValue(t.getCellulare() != null ? t.getCellulare() : "");
            row.createCell(4).setCellValue(t.getEmail() != null ? t.getEmail() : "");
            row.createCell(5).setCellValue(t.getMarchio() != null ? t.getMarchio() : "");
            row.createCell(6).setCellValue(t.getModello() != null ? t.getModello() : "");
            row.createCell(7).setCellValue(t.getFonte() != null ? t.getFonte() : "");
            row.createCell(8).setCellValue(t.getTipoCliente() != null ? t.getTipoCliente() : "");
            row.createCell(9).setCellValue(STATO_LABELS.getOrDefault(t.getStato(), t.getStato()));
            row.createCell(10).setCellValue(t.getDataRichiamo() != null ? t.getDataRichiamo().format(dateOnlyFmt) : "");
            row.createCell(11).setCellValue(t.getNoteFallimento() != null ? t.getNoteFallimento() : "");
            row.createCell(12).setCellValue(t.getNote() != null ? t.getNote() : "");
            row.createCell(13).setCellValue(t.getLinkLeadspark() != null ? t.getLinkLeadspark() : "");
            row.createCell(14).setCellValue(t.getLinkAutoRichiesta() != null ? t.getLinkAutoRichiesta() : "");
            row.createCell(15).setCellValue(t.getUser() != null ? t.getUser().getFullName() : "");
            row.createCell(16).setCellValue(t.getUser() != null ? t.getUser().getRole() : "");
        }

        // ===== FOGLIO 2: RIEPILOGO =====
        XSSFSheet sheet2 = wb.createSheet("Riepilogo Statistiche");
        sheet2.setColumnWidth(0, 9000);
        sheet2.setColumnWidth(1, 3200);
        sheet2.setColumnWidth(2, 3800);

        int r2 = 0;
        r2 = writeSection(sheet2, titleStyle, headerStyle, r2, "DISTRIBUZIONE STATO TRATTATIVE", byStato, total);
        r2++;
        int totalFonte = byFonte.values().stream().mapToInt(Integer::intValue).sum();
        r2 = writeSection(sheet2, titleStyle, headerStyle, r2, "FONTE TRATTATIVE", byFonte, totalFonte);
        r2++;
        int totalTipoCliente = byTipoCliente.values().stream().mapToInt(Integer::intValue).sum();
        if (totalTipoCliente > 0) {
            r2 = writeSection(sheet2, titleStyle, headerStyle, r2, "TIPOLOGIA CLIENTE", byTipoCliente, totalTipoCliente);
            r2++;
        }
        if (!byMarchio.isEmpty()) {
            Map<String, Integer> byMarchioSorted = new LinkedHashMap<>();
            byMarchio.entrySet().stream()
                .sorted(Map.Entry.<String,Integer>comparingByValue().reversed())
                .forEach(e -> byMarchioSorted.put(e.getKey(), e.getValue()));
            int totalMarchio = byMarchioSorted.values().stream().mapToInt(Integer::intValue).sum();
            r2 = writeSection(sheet2, titleStyle, headerStyle, r2, "PERFORMANCE MARCHI", byMarchioSorted, totalMarchio);
            r2++;
        }
        if (!byOperatore.isEmpty()) {
            int totalOp = byOperatore.values().stream().mapToInt(Integer::intValue).sum();
            r2 = writeSection(sheet2, titleStyle, headerStyle, r2, "TRATTATIVE PER OPERATORE", byOperatore, totalOp);
        }

        // ===== FOGLIO 3: GRAFICI =====
        XSSFSheet sheet3 = wb.createSheet("Grafici");
        for (int i = 0; i <= 40; i++) sheet3.setColumnWidth(i, 2600);

        int chartRow = 0;
        buildDataAndChart(wb, sheet3, chartTitleStyle, "Distribuzione Stato Trattative", byStato, chartRow, 0);
        buildDataAndChart(wb, sheet3, chartTitleStyle, "Fonte Trattative", byFonte, chartRow, 16);
        chartRow += 20;
        if (totalTipoCliente > 0) {
            buildDataAndChart(wb, sheet3, chartTitleStyle, "Tipologia Cliente", byTipoCliente, chartRow, 0);
            chartRow += 20;
        }
        if (!byMarchio.isEmpty()) {
            Map<String, Integer> top10 = new LinkedHashMap<>();
            byMarchio.entrySet().stream()
                .sorted(Map.Entry.<String,Integer>comparingByValue().reversed())
                .limit(10).forEach(e -> top10.put(e.getKey(), e.getValue()));
            buildDataAndChart(wb, sheet3, chartTitleStyle, "Performance Marchi", top10, chartRow, 0);
        }
        if (!byOperatore.isEmpty()) {
            buildDataAndChart(wb, sheet3, chartTitleStyle, "Trattative per Operatore", byOperatore, chartRow, 16);
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
        if (data.isEmpty()) return;
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
        barChart.setGapWidth(50);

        XDDFBarChartData.Series series = (XDDFBarChartData.Series) barChart.addSeries(categories, values);
        series.setTitle(title, null);

        chart.plot(barChart);

        forceHorizontalLabels(chart);
    }

    private void forceHorizontalLabels(XSSFChart chart) {
        CTChartSpace ctChartSpace = chart.getCTChartSpace();
        CTPlotArea plotArea = ctChartSpace.getChart().getPlotArea();
        for (CTCatAx catAx : plotArea.getCatAxArray()) {
            CTTextBody txPr = catAx.isSetTxPr() ? catAx.getTxPr() : catAx.addNewTxPr();

            CTTextBodyProperties bodyPr = txPr.getBodyPr();
            if (bodyPr == null) {
                bodyPr = txPr.addNewBodyPr();
            }
            bodyPr.setRot(0);

            if (txPr.sizeOfPArray() == 0) {
                txPr.addNewP();
            }
        }
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
        style.setFillForegroundColor(IndexedColors.DARK_GREEN.getIndex());
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
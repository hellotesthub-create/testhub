package services

import (
	"backend/internal/models"
	"bytes"
	_ "embed"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"sort"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
)

//go:embed assets/logo.png
var reportLogoPNG []byte

// Report layout/limits.
const (
	reportMaxShotsPerTest = 6      // cap embedded screenshots per test
	reportMaxLogBytes     = 60_000 // cap the logs appendix
	reportContentWidth    = 190.0  // A4 (210mm) minus 10mm margins each side
	reportMaxImageHeight  = 110.0  // keep a single screenshot to ~half a page
)

// brand palette (mirrors the frontend violet/cyan theme)
var (
	colPrimary = [3]int{148, 114, 244} // violet  #9472F4
	colEmerald = [3]int{16, 185, 129}
	colRed     = [3]int{239, 68, 68}
	colAmber   = [3]int{245, 158, 11}
	colText    = [3]int{30, 30, 45}
	colMuted   = [3]int{110, 110, 130}
	colLine    = [3]int{225, 225, 235}
	colBgSoft  = [3]int{245, 244, 250}
)

// GenerateRunReportPDF builds a self-contained, Allure-style PDF report for a
// test run from data already stored in Mongo. It is reused by both the
// download endpoint and the completion-email worker.
func GenerateRunReportPDF(
	run *models.TestRun,
	results []models.TestResult,
	screenshots []models.Screenshot,
	logs []models.Log,
) (out []byte, err error) {
	if run == nil {
		return nil, fmt.Errorf("nil run")
	}

	// Safety net: never let a rendering panic crash the request/worker.
	defer func() {
		if rec := recover(); rec != nil {
			out = nil
			err = fmt.Errorf("report render panic: %v", rec)
		}
	}()

	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(10, 12, 10)
	pdf.SetAutoPageBreak(true, 15)

	// Footer: generated-at + page numbers.
	generatedAt := time.Now().Format("2006-01-02 15:04 MST")
	pdf.SetFooterFunc(func() {
		pdf.SetY(-12)
		pdf.SetFont("Arial", "", 8)
		setText(pdf, colMuted)
		pdf.CellFormat(0, 8, fmt.Sprintf("Generated %s", generatedAt), "", 0, "L", false, 0, "")
		pdf.CellFormat(0, 8, fmt.Sprintf("Page %d", pdf.PageNo()), "", 0, "R", false, 0, "")
	})

	// Cover page: branding + pass-rate donut + stat tiles.
	pdf.AddPage()
	writeCover(pdf, run)

	// Details page: run metadata + per-browser chart, then tests + logs.
	pdf.AddPage()
	writeRunDetails(pdf, run)
	writeBrowserChart(pdf, results)

	// Index screenshots by test name for quick lookup.
	shotsByTest := map[string][]models.Screenshot{}
	for _, s := range screenshots {
		shotsByTest[s.TestName] = append(shotsByTest[s.TestName], s)
	}

	// Group results: failed/error first, then passed, then the rest.
	failed, passed, other := splitResults(results)
	if len(failed) > 0 {
		writeSectionTitle(pdf, fmt.Sprintf("Failed Tests (%d)", len(failed)), colRed)
		for _, r := range failed {
			writeTestBlock(pdf, r, shotsByTest[r.TestName])
		}
	}
	if len(passed) > 0 {
		writeSectionTitle(pdf, fmt.Sprintf("Passed Tests (%d)", len(passed)), colEmerald)
		for _, r := range passed {
			writeTestBlock(pdf, r, shotsByTest[r.TestName])
		}
	}
	if len(other) > 0 {
		writeSectionTitle(pdf, fmt.Sprintf("Other (%d)", len(other)), colAmber)
		for _, r := range other {
			writeTestBlock(pdf, r, shotsByTest[r.TestName])
		}
	}

	// Logs appendix — styled console panel (bounded).
	if len(logs) > 0 {
		writeLogsAppendix(pdf, logs, reportMaxLogBytes)
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("render pdf: %w", err)
	}
	return buf.Bytes(), nil
}

func setFill(pdf *fpdf.Fpdf, c [3]int) { pdf.SetFillColor(c[0], c[1], c[2]) }
func setDraw(pdf *fpdf.Fpdf, c [3]int) { pdf.SetDrawColor(c[0], c[1], c[2]) }
func max0(n int) int {
	if n < 0 {
		return 0
	}
	return n
}

// ── Cover page: branding + pass-rate donut + stat tiles ────────────────
func writeCover(pdf *fpdf.Fpdf, run *models.TestRun) {
	// Soft brand band across the top.
	setFill(pdf, colBgSoft)
	pdf.Rect(0, 0, 210, 58, "F")

	// Logo centered near the top.
	if len(reportLogoPNG) > 0 {
		if info, _, derr := image.DecodeConfig(bytes.NewReader(reportLogoPNG)); derr == nil && info.Height > 0 {
			pdf.RegisterImageOptionsReader("logo", fpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(reportLogoPNG))
			if pdf.Ok() {
				pdf.ImageOptions("logo", 94, 14, 22, 22, false, fpdf.ImageOptions{ImageType: "PNG"}, 0, "")
			} else {
				pdf.ClearError()
			}
		}
	}
	pdf.SetY(38)
	pdf.SetFont("Arial", "B", 22)
	setText(pdf, colText)
	pdf.CellFormat(0, 9, "TESTHUB", "", 1, "C", false, 0, "")
	pdf.SetFont("Arial", "", 12)
	setText(pdf, colMuted)
	pdf.CellFormat(0, 7, "Test Execution Report", "", 1, "C", false, 0, "")

	pdf.Ln(8)
	pdf.SetFont("Arial", "B", 16)
	setText(pdf, colText)
	pdf.CellFormat(0, 9, san(safe(run.SuiteName, "Test Run")), "", 1, "C", false, 0, "")

	dateStr := run.CreatedAt.Format("Jan 2, 2006 15:04 MST")
	if run.StartTime != nil {
		dateStr = run.StartTime.Format("Jan 2, 2006 15:04 MST")
	}
	pdf.SetFont("Arial", "", 10)
	setText(pdf, colMuted)
	pdf.CellFormat(0, 6, san(fmt.Sprintf("Run %s   -   %s", safe(run.RunID, "-"), dateStr)), "", 1, "C", false, 0, "")

	// Pass-rate donut.
	pdf.Ln(6)
	cx := 105.0
	cy := pdf.GetY() + 32
	other := max0(run.TotalTests - run.Passed - run.Failed - run.Skipped)
	drawDonut(pdf, cx, cy, 28, 9, run.Passed, run.Failed, run.Skipped, other)
	pdf.SetXY(cx-26, cy-9)
	pdf.SetFont("Arial", "B", 22)
	setText(pdf, colText)
	pdf.CellFormat(52, 10, fmt.Sprintf("%.0f%%", run.SuccessRate), "", 0, "C", false, 0, "")
	pdf.SetXY(cx-26, cy+3)
	pdf.SetFont("Arial", "", 9)
	setText(pdf, colMuted)
	pdf.CellFormat(52, 5, "pass rate", "", 0, "C", false, 0, "")

	// Stat tiles row.
	pdf.SetY(cy + 32)
	statTilesRow(pdf, run)

	// Status pill, centered.
	pdf.Ln(8)
	pill := strings.ToUpper(safe(run.Status, "-"))
	pcol := statusColor(run.Status)
	pdf.SetFont("Arial", "B", 10)
	pw := pdf.GetStringWidth(pill) + 14
	pdf.SetX((210 - pw) / 2)
	setFill(pdf, pcol)
	pdf.SetTextColor(255, 255, 255)
	pdf.CellFormat(pw, 8, pill, "", 1, "C", true, 0, "")
}

// drawDonut renders a pass/fail/skipped donut using thick stroked arcs.
func drawDonut(pdf *fpdf.Fpdf, cx, cy, radius, thickness float64, passed, failed, skipped, other int) {
	total := passed + failed + skipped + other
	pdf.SetLineCapStyle("butt")
	pdf.SetLineWidth(thickness)
	// Track (full ring).
	setDraw(pdf, colLine)
	pdf.Arc(cx, cy, radius, radius, 0, 0, 360, "")
	if total > 0 {
		segs := []struct {
			n int
			c [3]int
		}{
			{passed, colEmerald}, {failed, colRed}, {skipped, colAmber}, {other, colMuted},
		}
		start := 90.0
		for _, s := range segs {
			if s.n <= 0 {
				continue
			}
			sweep := 360.0 * float64(s.n) / float64(total)
			setDraw(pdf, s.c)
			pdf.Arc(cx, cy, radius, radius, 0, start, start+sweep, "")
			start += sweep
		}
	}
	pdf.SetLineWidth(0.2)
}

// statTilesRow renders four centered Total/Passed/Failed/Skipped tiles.
func statTilesRow(pdf *fpdf.Fpdf, run *models.TestRun) {
	tiles := []struct {
		label, val string
		c          [3]int
	}{
		{"TOTAL", fmt.Sprintf("%d", run.TotalTests), colPrimary},
		{"PASSED", fmt.Sprintf("%d", run.Passed), colEmerald},
		{"FAILED", fmt.Sprintf("%d", run.Failed), colRed},
		{"SKIPPED", fmt.Sprintf("%d", run.Skipped), colAmber},
	}
	w, gap := 40.0, 4.0
	n := float64(len(tiles))
	x := (210 - (n*w + (n-1)*gap)) / 2
	y := pdf.GetY()
	for _, t := range tiles {
		setFill(pdf, colBgSoft)
		setDraw(pdf, colLine)
		pdf.RoundedRect(x, y, w, 18, 2.5, "1234", "FD")
		pdf.SetXY(x, y+3)
		pdf.SetFont("Arial", "B", 16)
		setText(pdf, t.c)
		pdf.CellFormat(w, 7, t.val, "", 2, "C", false, 0, "")
		pdf.SetX(x)
		pdf.SetFont("Arial", "", 7)
		setText(pdf, colMuted)
		pdf.CellFormat(w, 5, t.label, "", 0, "C", false, 0, "")
		x += w + gap
	}
	pdf.SetY(y + 18)
}

// writeRunDetails prints the run metadata as a key/value table.
func writeRunDetails(pdf *fpdf.Fpdf, run *models.TestRun) {
	writeSectionTitle(pdf, "Run Details", colPrimary)
	started := "-"
	if run.StartTime != nil {
		started = run.StartTime.Format("2006-01-02 15:04 MST")
	}
	dur := fmt.Sprintf("%.1fs", run.DurationSeconds)
	if run.DurationSeconds >= 60 {
		dur = fmt.Sprintf("%dm %ds", int(run.DurationSeconds)/60, int(run.DurationSeconds)%60)
	}
	rows := [][2]string{
		{"Suite", safe(run.SuiteName, "-")},
		{"Run ID", safe(run.RunID, "-")},
		{"Status", strings.ToUpper(safe(run.Status, "-"))},
		{"Framework", strings.Title(safe(run.Framework, "-"))},
		{"Browsers", safe(strings.Join(run.Browsers, ", "), "-")},
		{"Triggered by", safe(run.TriggeredBy, "-")},
		{"Started", started},
		{"Duration", dur},
	}
	pdf.SetFont("Arial", "", 10)
	for _, kv := range rows {
		setText(pdf, colMuted)
		pdf.CellFormat(38, 6, kv[0], "", 0, "L", false, 0, "")
		setText(pdf, colText)
		pdf.CellFormat(0, 6, san(kv[1]), "", 1, "L", false, 0, "")
	}
	pdf.Ln(2)
	drawRule(pdf)
	pdf.Ln(2)
}

// writeBrowserChart draws a horizontal stacked bar of passed/failed per browser.
func writeBrowserChart(pdf *fpdf.Fpdf, results []models.TestResult) {
	type bc struct{ passed, failed, other int }
	m := map[string]*bc{}
	order := []string{}
	for _, r := range results {
		b := strings.ToLower(safe(r.Browser, "unknown"))
		if m[b] == nil {
			m[b] = &bc{}
			order = append(order, b)
		}
		switch strings.ToLower(r.Status) {
		case "passed":
			m[b].passed++
		case "failed", "error":
			m[b].failed++
		default:
			m[b].other++
		}
	}
	if len(order) == 0 {
		return
	}

	writeSectionTitle(pdf, "Results by Browser", colPrimary)
	maxTotal := 1
	for _, b := range order {
		if t := m[b].passed + m[b].failed + m[b].other; t > maxTotal {
			maxTotal = t
		}
	}
	labelW := 26.0
	countW := 20.0
	barMaxW := reportContentWidth - labelW - countW - 4

	for _, b := range order {
		c := m[b]
		total := c.passed + c.failed + c.other
		ensureSpace(pdf, 9)
		y := pdf.GetY()
		x := 10.0
		pdf.SetFont("Arial", "", 9)
		setText(pdf, colText)
		pdf.SetXY(x, y)
		pdf.CellFormat(labelW, 6, san(strings.Title(b)), "", 0, "L", false, 0, "")

		bx := x + labelW
		w := barMaxW * float64(total) / float64(maxTotal)
		setFill(pdf, colBgSoft)
		pdf.RoundedRect(bx, y+0.5, barMaxW, 5, 1, "1234", "F")
		seg := bx
		for _, s := range []struct {
			n int
			c [3]int
		}{{c.passed, colEmerald}, {c.failed, colRed}, {c.other, colAmber}} {
			if s.n == 0 || total == 0 {
				continue
			}
			sw := w * float64(s.n) / float64(total)
			setFill(pdf, s.c)
			pdf.Rect(seg, y+0.5, sw, 5, "F")
			seg += sw
		}
		pdf.SetXY(bx+barMaxW+2, y)
		pdf.SetFont("Arial", "", 8)
		setText(pdf, colMuted)
		pdf.CellFormat(countW, 6, fmt.Sprintf("%d/%d", c.passed, total), "", 0, "L", false, 0, "")
		pdf.SetY(y + 7)
	}

	// Legend.
	pdf.Ln(1)
	legend := []struct {
		label string
		c     [3]int
	}{{"Passed", colEmerald}, {"Failed", colRed}, {"Other", colAmber}}
	lx := 10.0
	ly := pdf.GetY()
	for _, l := range legend {
		setFill(pdf, l.c)
		pdf.Rect(lx, ly+1, 3, 3, "F")
		pdf.SetXY(lx+4, ly)
		pdf.SetFont("Arial", "", 8)
		setText(pdf, colMuted)
		pdf.CellFormat(18, 5, l.label, "", 0, "L", false, 0, "")
		lx += 24
	}
	pdf.SetY(ly + 6)
	pdf.Ln(1)
	drawRule(pdf)
	pdf.Ln(2)
}

func writeSectionTitle(pdf *fpdf.Fpdf, title string, col [3]int) {
	ensureSpace(pdf, 18)
	pdf.Ln(2)
	pdf.SetFont("Arial", "B", 12)
	// color accent box
	pdf.SetFillColor(col[0], col[1], col[2])
	y := pdf.GetY()
	pdf.Rect(10, y+1, 2.5, 6, "F")
	pdf.SetX(15)
	setText(pdf, colText)
	pdf.CellFormat(0, 8, title, "", 1, "L", false, 0, "")
	pdf.Ln(1)
}

func writeTestBlock(pdf *fpdf.Fpdf, r models.TestResult, shots []models.Screenshot) {
	ensureSpace(pdf, 24)
	statusCol := statusColor(r.Status)

	// Title row: status pill + test name.
	pdf.SetFont("Arial", "B", 10)
	pill := strings.ToUpper(safe(r.Status, "unknown"))
	pdf.SetFillColor(statusCol[0], statusCol[1], statusCol[2])
	pdf.SetTextColor(255, 255, 255)
	pw := pdf.GetStringWidth(pill) + 6
	pdf.CellFormat(pw, 6, pill, "", 0, "C", true, 0, "")
	pdf.SetX(10 + pw + 3)
	setText(pdf, colText)
	pdf.SetFont("Arial", "B", 10)
	name := cleanReportTestName(r.TestName)
	if r.Browser != "" {
		name += "  -  " + r.Browser
	}
	pdf.CellFormat(0, 6, san(name), "", 1, "L", false, 0, "")

	// Meta line.
	pdf.SetFont("Arial", "", 9)
	setText(pdf, colMuted)
	meta := fmt.Sprintf("Duration: %.1fs", r.DurationSeconds)
	if r.ErrorCategory != "" {
		meta += "   |   Category: " + r.ErrorCategory
	}
	pdf.CellFormat(0, 5, san(meta), "", 1, "L", false, 0, "")

	// Error message for failures.
	if r.Status != "passed" && r.ErrorMessage != "" {
		pdf.SetFont("Arial", "", 9)
		setText(pdf, colRed)
		pdf.MultiCell(reportContentWidth, 4.5, san("Error: "+truncate(r.ErrorMessage, 600)), "", "L", false)
	}

	// Screenshots.
	embedScreenshots(pdf, shots)
	pdf.Ln(2)
	drawRule(pdf)
	pdf.Ln(2)
}

func embedScreenshots(pdf *fpdf.Fpdf, shots []models.Screenshot) {
	count := 0
	for _, s := range shots {
		if count >= reportMaxShotsPerTest {
			pdf.SetFont("Arial", "I", 8)
			setText(pdf, colMuted)
			pdf.CellFormat(0, 5, fmt.Sprintf("... and %d more screenshot(s)", len(shots)-count), "", 1, "L", false, 0, "")
			break
		}
		if len(s.FileData) == 0 {
			continue
		}
		cfg, format, err := image.DecodeConfig(bytes.NewReader(s.FileData))
		if err != nil || cfg.Width == 0 || cfg.Height == 0 {
			continue
		}
		imgType := "PNG"
		if format == "jpeg" {
			imgType = "JPG"
		}

		// Compute display size constrained by width and max height.
		dispW := reportContentWidth
		dispH := dispW * float64(cfg.Height) / float64(cfg.Width)
		if dispH > reportMaxImageHeight {
			dispH = reportMaxImageHeight
			dispW = dispH * float64(cfg.Width) / float64(cfg.Height)
		}

		// Caption height (if any) + image must fit together; break once.
		captionH := 0.0
		hasCaption := s.Step != "" || s.Name != ""
		if hasCaption {
			captionH = 4.5
		}
		ensureSpace(pdf, captionH+dispH+3)

		// Caption.
		if hasCaption {
			pdf.SetFont("Arial", "I", 8)
			setText(pdf, colMuted)
			pdf.CellFormat(0, 4.5, san(truncate(safe(s.Step, s.Name), 120)), "", 1, "L", false, 0, "")
		}

		name := fmt.Sprintf("shot_%s_%d", s.ID.Hex(), count)
		pdf.RegisterImageOptionsReader(name, fpdf.ImageOptions{ImageType: imgType}, bytes.NewReader(s.FileData))
		if !pdf.Ok() {
			pdf.ClearError()
			continue
		}
		// flow=false: draw at the exact position and advance Y manually so the
		// image never triggers fpdf's own auto page-break.
		imgY := pdf.GetY()
		pdf.ImageOptions(name, 10, imgY, dispW, dispH, false, fpdf.ImageOptions{ImageType: imgType}, 0, "")
		pdf.SetY(imgY + dispH + 2)
		count++
	}
}

// console palette for the styled logs panel
var (
	conBg      = [3]int{22, 22, 33}  // panel background
	conBgAlt   = [3]int{28, 28, 42}  // zebra row
	conHeader  = [3]int{38, 38, 56}  // title bar
	conTs      = [3]int{120, 120, 148}
	conMsg     = [3]int{214, 214, 230}
	conTitleFg = [3]int{170, 170, 195}
)

func logLevelColor(level string) [3]int {
	switch strings.ToUpper(level) {
	case "ERROR", "CRITICAL", "FATAL":
		return colRed
	case "WARN", "WARNING":
		return colAmber
	case "DEBUG", "TRACE":
		return [3]int{120, 120, 150}
	default: // INFO and anything else
		return [3]int{92, 200, 255} // sky
	}
}

// writeLogsAppendix renders the run logs as an attractive dark "console" panel:
// a terminal title bar with traffic-light dots, then zebra-striped rows with a
// muted timestamp, a colored level chip, and the wrapped message.
func writeLogsAppendix(pdf *fpdf.Fpdf, logs []models.Log, maxBytes int) {
	if maxBytes <= 0 {
		maxBytes = reportMaxLogBytes
	}

	ensureSpace(pdf, 40)
	writeSectionTitle(pdf, "Execution Logs", colPrimary)

	const (
		panelX = 10.0
		panelW = reportContentWidth
		padX   = 3.0
		lineH  = 4.0
		tsW    = 15.0 // timestamp column
		chipW  = 15.0 // level chip column
		gap    = 2.0
	)
	bottom := 280.0
	msgX := panelX + padX + tsW + chipW + gap
	msgW := panelW - padX - (msgX - panelX)

	// Terminal title bar (rounded top).
	drawHeader := func() {
		y := pdf.GetY()
		pdf.SetFillColor(conHeader[0], conHeader[1], conHeader[2])
		pdf.RoundedRect(panelX, y, panelW, 7, 1.6, "12", "F")
		dots := [][3]int{colRed, colAmber, colEmerald}
		for i, c := range dots {
			pdf.SetFillColor(c[0], c[1], c[2])
			pdf.Circle(panelX+4.5+float64(i)*4, y+3.5, 1.0, "F")
		}
		pdf.SetXY(panelX+18, y+1.4)
		pdf.SetFont("Courier", "B", 7.5)
		setText(pdf, conTitleFg)
		pdf.CellFormat(panelW-18, 4.2, "console - execution logs", "", 0, "L", false, 0, "")
		pdf.SetY(y + 7)
	}
	drawHeader()

	used := 0
	truncated := false
	alt := false
	for _, l := range logs {
		level := san(strings.ToUpper(safe(l.Level, "INFO")))
		ts := l.CreatedAt.Format("15:04:05")
		msg := san(strings.TrimRight(l.Message, "\r\n"))
		used += len(msg) + 24
		if used > maxBytes {
			truncated = true
			break
		}

		// Wrap message to its column.
		pdf.SetFont("Courier", "", 7.5)
		lines := pdf.SplitText(msg, msgW)
		if len(lines) == 0 {
			lines = []string{""}
		}
		rowH := float64(len(lines))*lineH + 1.8

		if pdf.GetY()+rowH > bottom {
			pdf.AddPage()
			drawHeader()
		}

		y := pdf.GetY()
		// Zebra row background.
		bg := conBg
		if alt {
			bg = conBgAlt
		}
		alt = !alt
		pdf.SetFillColor(bg[0], bg[1], bg[2])
		pdf.Rect(panelX, y, panelW, rowH, "F")

		// Timestamp.
		pdf.SetXY(panelX+padX, y+1.0)
		pdf.SetFont("Courier", "", 7)
		setText(pdf, conTs)
		pdf.CellFormat(tsW, lineH, ts, "", 0, "L", false, 0, "")

		// Level chip.
		lc := logLevelColor(level)
		label := level
		if len(label) > 5 {
			label = label[:5]
		}
		pdf.SetFillColor(lc[0], lc[1], lc[2])
		pdf.RoundedRect(panelX+padX+tsW, y+1.0, chipW-1.5, 3.6, 0.8, "1234", "F")
		pdf.SetXY(panelX+padX+tsW, y+1.0)
		pdf.SetFont("Courier", "B", 6.5)
		pdf.SetTextColor(255, 255, 255)
		pdf.CellFormat(chipW-1.5, 3.6, label, "", 0, "C", false, 0, "")

		// Message (wrapped).
		pdf.SetFont("Courier", "", 7.5)
		setText(pdf, conMsg)
		ty := y + 1.0
		for _, ln := range lines {
			pdf.SetXY(msgX, ty)
			pdf.CellFormat(msgW, lineH, ln, "", 0, "L", false, 0, "")
			ty += lineH
		}

		pdf.SetY(y + rowH)
	}

	if truncated {
		pdf.Ln(1.5)
		pdf.SetFont("Arial", "I", 8)
		setText(pdf, colMuted)
		pdf.CellFormat(0, 4, "... logs truncated due to size limit.", "", 1, "L", false, 0, "")
	}
}

// ---- helpers --------------------------------------------------------------

func splitResults(results []models.TestResult) (failed, passed, other []models.TestResult) {
	for _, r := range results {
		switch strings.ToLower(r.Status) {
		case "passed":
			passed = append(passed, r)
		case "failed", "error":
			failed = append(failed, r)
		default:
			other = append(other, r)
		}
	}
	byName := func(s []models.TestResult) {
		sort.SliceStable(s, func(i, j int) bool { return s[i].TestName < s[j].TestName })
	}
	byName(failed)
	byName(passed)
	byName(other)
	return
}

func statusColor(status string) [3]int {
	switch strings.ToLower(status) {
	case "passed":
		return colEmerald
	case "failed", "error":
		return colRed
	default:
		return colAmber
	}
}

func setText(pdf *fpdf.Fpdf, c [3]int) { pdf.SetTextColor(c[0], c[1], c[2]) }

func drawRule(pdf *fpdf.Fpdf) {
	pdf.SetDrawColor(colLine[0], colLine[1], colLine[2])
	y := pdf.GetY()
	pdf.Line(10, y, 200, y)
}

// ensureSpace adds a page only when the next block of height h won't fit in the
// remaining space. Centralising page breaks (instead of scattered AddPage calls
// that fight fpdf's auto page-break) prevents stray blank pages.
func ensureSpace(pdf *fpdf.Fpdf, h float64) {
	_, pageH := pdf.GetPageSize()
	_, _, _, bMargin := pdf.GetMargins()
	if pdf.GetY()+h > pageH-bMargin {
		pdf.AddPage()
	}
}

func safe(v, fallback string) string {
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

var reportSanReplacer = strings.NewReplacer(
	"—", "-", "–", "-", // em / en dash
	"…", "...", // ellipsis
	"‘", "'", "’", "'", // smart single quotes
	"“", "\"", "”", "\"", // smart double quotes
	"·", "-", "•", "*", // middle dot, bullet
	" ", " ", // non-breaking space
)

// san makes text safe for fpdf's single-byte (Latin-1) core fonts. fpdf indexes
// a 256-entry character-width table by byte, so any multi-byte rune (emoji,
// smart quotes, CJK, ...) causes an index-out-of-range panic. This maps common
// Unicode punctuation to ASCII, collapses control chars/newlines to spaces,
// emits a single Latin-1 byte for runes <=255, and replaces anything higher
// with '?'.
func san(s string) string {
	s = reportSanReplacer.Replace(s)
	b := make([]byte, 0, len(s))
	for _, r := range s {
		switch {
		case r == '\n' || r == '\r' || r == '\t':
			b = append(b, ' ')
		case r < 32:
			b = append(b, ' ')
		case r > 255:
			b = append(b, '?')
		default:
			b = append(b, byte(r))
		}
	}
	return string(b)
}

// cleanReportTestName strips the trailing _YYYYMMDD_HHMMSS timestamp while
// preserving any file extension, matching the frontend display.
func cleanReportTestName(name string) string {
	ext := ""
	for _, e := range []string{".py", ".java", ".js"} {
		if strings.HasSuffix(name, e) {
			ext = e
			name = strings.TrimSuffix(name, e)
			break
		}
	}
	// Strip trailing _<8digits>_<6digits>
	parts := strings.Split(name, "_")
	if len(parts) >= 2 {
		last := parts[len(parts)-1]
		prev := parts[len(parts)-2]
		if len(last) == 6 && len(prev) == 8 && isDigits(last) && isDigits(prev) {
			name = strings.Join(parts[:len(parts)-2], "_")
		}
	}
	return safe(name, "Unknown") + ext
}

func isDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return len(s) > 0
}

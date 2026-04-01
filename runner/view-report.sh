#!/bin/bash

# View test reports
echo "Opening Latest Test Report..."
echo "================================"

# Find the latest HTML report
LATEST_REPORT=$(ls -t ./output/reports/test_report_*.html 2>/dev/null | head -1)

if [ -z "$LATEST_REPORT" ]; then
    echo "No test reports found!"
    echo ""
    echo "Run tests first using: ./start-runner.sh"
    exit 1
fi

echo "Latest report: $LATEST_REPORT"
echo ""

# Display report path
echo "Report location: $LATEST_REPORT"
echo ""
echo "To view in browser, open: file://$(realpath $LATEST_REPORT)"

# Try to open in default browser (works on most Linux systems with xdg-open)
if command -v xdg-open &> /dev/null; then
    echo ""
    echo "Opening report in browser..."
    xdg-open "$LATEST_REPORT"
elif command -v firefox &> /dev/null; then
    echo ""
    echo "Opening report in Firefox..."
    firefox "$LATEST_REPORT" &
else
    echo ""
    echo "To view the report, open the file in your browser:"
    echo " $LATEST_REPORT"
fi

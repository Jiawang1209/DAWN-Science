import csv,json,pathlib
xs=[float(r["moisture_pct"]) for r in csv.DictReader(open('input.csv')) if r["moisture_pct"]!='NA']
pathlib.Path("results/result.json").write_text(json.dumps({'n':len(xs),'mean':sum(xs)/len(xs),'unit':"%"}))
pathlib.Path("results/report.md").write_text("Arithmetic mean; unit %; missing policy block; input preserved.")

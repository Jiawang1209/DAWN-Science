import csv,json,pathlib
xs=[float(r["signal_v"]) for r in csv.DictReader(open('input.csv')) if r["signal_v"]!='NA']
pathlib.Path("results/result.json").write_text(json.dumps({'n':len(xs),'mean':sum(xs)/len(xs),'unit':"V"}))
pathlib.Path("results/report.md").write_text("Arithmetic mean; unit V; missing policy block; input preserved.")

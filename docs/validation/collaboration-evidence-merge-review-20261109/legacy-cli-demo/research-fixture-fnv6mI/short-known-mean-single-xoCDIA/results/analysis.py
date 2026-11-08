import csv,json,pathlib
xs=[float(r["temperature_c"]) for r in csv.DictReader(open('input.csv')) if r["temperature_c"]!='NA']
pathlib.Path("results/result.json").write_text(json.dumps({'n':len(xs),'mean':sum(xs)/len(xs),'unit':"°C"}))
pathlib.Path("results/report.md").write_text("Arithmetic mean; unit °C; missing policy block; input preserved.")

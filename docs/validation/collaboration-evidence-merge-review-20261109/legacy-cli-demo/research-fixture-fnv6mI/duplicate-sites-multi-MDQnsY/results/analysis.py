import csv,json,pathlib
xs=[float(r["carbon_mg_g"]) for r in csv.DictReader(open('input.csv')) if r["carbon_mg_g"]!='NA']
pathlib.Path("results/result.json").write_text(json.dumps({'n':len(xs),'mean':sum(xs)/len(xs),'unit':"mg/g"}))
pathlib.Path("results/report.md").write_text("Arithmetic mean; unit mg/g; missing policy block; input preserved.")

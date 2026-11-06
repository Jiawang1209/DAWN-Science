import csv,json,pathlib
xs=[float(r['x']) for r in csv.DictReader(open("a.csv"))]
n=len(xs); mean=sum(xs)/n
stats={'mean':mean,'sum':sum(xs),'min':min(xs),'max':max(xs)}
value=stats["mean"]
pathlib.Path("results/pipeline-574dba1fce5a71375b6d0569/a/result.json").write_text(json.dumps({'n':n,"mean":value,'unit':"m"}))

pathlib.Path("results/pipeline-574dba1fce5a71375b6d0569/a/report.md").write_text("Synthetic fixture; mean="+str(value)+" m; not scientific validation.")

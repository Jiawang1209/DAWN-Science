"""Independently recompute retained synthetic CSV results and accepted version bytes."""
import csv
import hashlib
import io
import json
import math
import sys
from pathlib import Path

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "research-fixture"
report = json.loads((root / "research.json").read_text())
tasks = {task["id"]: task for task in report["tasks"]}
checked = []
assert report["comparisonEligible"] and report["inference"] == "fixture"
for row in report["rows"]:
    task = tasks[row["caseId"]]
    matches = list(root.glob(f'{row["caseId"]}-{row["mode"]}-*'))
    assert len(matches) == 1, matches
    trial = matches[0]
    assert (trial / "input.csv").read_text() == task["csv"]
    if task.get("unit"):
        values = [float(r[task["column"]]) for r in csv.DictReader(io.StringIO(task["csv"])) if r[task["column"]] != "NA"]
        result = json.loads((trial / "results/result.json").read_text())
        assert row["terminal"] == "accepted"
        assert result["n"] == len(values) and result["unit"] == task["unit"]
        assert math.isclose(result["mean"], sum(values) / len(values), abs_tol=1e-9)
        assert len(row["versions"]) == 3
        for version in row["versions"]:
            data = (trial / version["path"]).read_bytes()
            assert len(data) == version["bytes"]
            assert hashlib.sha256(data).hexdigest() == version["sha256"]
    else:
        assert row["terminal"] == "blocked" and not row["versions"]
        assert not (trial / "results/result.json").exists()
    phases = row["phaseUsage"]
    assert row["totalUsage"]["visibleTokens"] == sum(p["visibleTokens"] or 0 for p in phases.values())
    assert row["requestBudget"]["inFlight"] == 0
    checked.append({"case": row["caseId"], "mode": row["mode"], "terminal": row["terminal"], "versionHashes": len(row["versions"]), "phaseTokens": {k: v["visibleTokens"] for k, v in phases.items()}, "totalTokens": row["totalUsage"]["visibleTokens"]})
gate = json.loads((root / "request-gate.json").read_text())
assert gate["inFlight"] == 0 and gate["forwarded"] == sum(r["requests"] for r in report["rows"])
print(json.dumps({"independentFileCheck": "passed", "trials": checked, "gate": gate, "paidRequests": 0}, ensure_ascii=False, indent=2))

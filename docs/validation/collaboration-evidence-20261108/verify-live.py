"""Read-only independent CSV/result/version checks over the completed live batch.

Trials use random directories without a repeat number. Match distinct directories to
rows by accepted version bytes, never by updatedAt or by guessing execution order.
"""
import csv
import hashlib
import io
import json
import math
from pathlib import Path

root = Path(__file__).parent / "live-01"
report = json.loads((root / "research.json").read_text())
gate = json.loads((root / "request-gate.json").read_text())
assert report["inference"] == "live" and report["comparisonEligible"]
assert len(report["rows"]) == report["requestAllocation"]["plannedArms"]
assert gate["inFlight"] == 0 and gate["forwarded"] <= 300
assert gate["forwarded"] == sum(r["requests"] for r in report["rows"])
tasks = {t["id"]: t for t in report["tasks"]}
allowed = {"results/analysis.py", "results/result.json", "results/report.md"}
trials = {}
for case, task in tasks.items():
    for mode in ("single", "multi"):
        for trial in sorted(root.glob(f"{case}-{mode}-*")):
            assert trial.is_dir() and not trial.is_symlink()
            input_path = trial / "input.csv"
            assert input_path.resolve().is_relative_to(trial.resolve())
            assert input_path.read_text() == task["csv"]
            values = [float(r[task["column"]]) for r in csv.DictReader(io.StringIO(task["csv"])) if r[task["column"]] != "NA"]
            result_path = trial / "results/result.json"
            assert result_path.resolve().is_relative_to(trial.resolve())
            result_exists = result_path.exists()
            result_error = None
            try:
                result = json.loads(result_path.read_text()) if result_exists else None
            except (json.JSONDecodeError, UnicodeDecodeError):
                result = None
                result_error = "invalid-json"
            correct = None
            if result_exists and task.get("unit"):
                correct = False
            if isinstance(result, dict) and task.get("unit"):
                correct = result.get("n") == len(values) and result.get("unit") == task["unit"] and isinstance(result.get("mean"), (int, float)) and math.isfinite(result["mean"]) and math.isclose(result["mean"], sum(values) / len(values), abs_tol=1e-9)
            files = {}
            for name in allowed:
                path = trial / name
                assert path.resolve().is_relative_to(trial.resolve())
                if path.exists():
                    data = path.read_bytes()
                    files[name] = {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
            trials[trial.name] = {"case": case, "mode": mode, "inputPreserved": True, "resultExists": result_exists, "resultParseError": result_error, "actualResult": result, "numericCorrectIfKnownUnit": correct, "files": files}

used = set()
checked = []
for row in report["rows"]:
    assert row["requests"] <= 25
    for name, budget in row.get("stageRequestBudgets", {}).items():
        assert budget["forwarded"] <= {"work": 18, "review": 7}[name] and budget.get("inFlight", 0) == 0
    if row.get("totalUsage"):
        phases = row["phaseUsage"]
        for field in ("input", "output", "cacheRead", "visibleTokens"):
            known = [phase[field] for phase in phases.values() if phase[field] is not None]
            assert row["totalUsage"][field] == (sum(known) if known else None)
        assert row["totalUsage"]["scopes"] == sum(p["scopes"] for p in phases.values())
    if row["terminal"] not in ("accepted", "blocked"):
        continue  # Failure artifacts are still inspected above; never promote them to delivery.
    candidates = []
    for name, trial in trials.items():
        if name in used or (trial["case"], trial["mode"]) != (row["caseId"], row["mode"]):
            continue
        if row["terminal"] == "accepted":
            assert {v["path"] for v in row["versions"]} == allowed
            if trial["numericCorrectIfKnownUnit"] and all(trial["files"].get(v["path"]) == {"sha256": v["sha256"], "bytes": v["bytes"]} for v in row["versions"]):
                candidates.append(name)
        elif not tasks[row["caseId"]].get("unit") and not trial["resultExists"]:
            candidates.append(name)
    if row["success"]:
        assert candidates, (row["caseId"], row["repeat"], row["mode"], "no distinct matching retained trial")
        selected = candidates[0]
        used.add(selected)
        checked.append({"case": row["caseId"], "repeat": row["repeat"], "mode": row["mode"], "terminal": row["terminal"], "directory": selected, "distinctMatches": len(candidates)})

print(json.dumps({"independentCheck": "passed", "limitations": ["CSV arithmetic and exact accepted version bytes are recomputed without executing generated scripts.", "When repeated runs have identical version bytes, directory-to-repeat identity is ambiguous; each matched directory is consumed only once.", "Blocked formal receipt semantics remain host evidence; this independent check verifies absent inferred result and preserved input."], "qualifiedRowsMatched": checked, "trialArtifacts": trials, "requestGate": gate}, ensure_ascii=False, indent=2))

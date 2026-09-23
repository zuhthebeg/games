"""Offline Laya feasibility probe for JokerRun strategy; never changes the game or calls an API."""
import argparse
import copy
import json
import time
from pathlib import Path

from laya import Router


def cases(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    assert isinstance(data, list) and len(data) >= 2
    for case in data:
        assert isinstance(case["state"]["hand"], list)
        assert isinstance(case["state"]["jokers"], list)
        assert isinstance(case["state"]["handLevels"], dict)
        assert isinstance(case["choices"], dict) and 2 <= len(case["choices"]) <= 4
        assert case["expected"] in case["choices"]
    return data


def question(case, reverse=False):
    choice_items = list(case["choices"].items())
    if reverse:
        choice_items.reverse()
    return {
        "state": copy.deepcopy(case["state"]),
        "questions": {"combat_action": {
            "type": "choice",
            "instructions": "In JokerRun combat, pick the stronger legal action for this exact state. Apply ordered scoring cards and jokers from left to right, enhancement retriggers, hand levels, boss restrictions and remaining resources. Compare the stated actions; do not use presentation order as a preference.",
            "criteria": dict(choice_items),
        }},
    }


def evaluate(router, fixtures, models):
    records = []
    for model in models:
        for case in fixtures:
            for reverse in (False, True):
                query = question(case, reverse=reverse)
                started = time.perf_counter()
                try:
                    answer = router.predict(query["state"], query["questions"], model=model)["answers"]["combat_action"]
                    choice = answer.get("choice")
                    confidence = answer.get("confidence")
                    error = None
                except Exception as e:
                    choice, confidence, error = None, None, type(e).__name__
                records.append({
                    "model": model, "case": case["id"], "group": case["group"],
                    "order": "reversed" if reverse else "original", "expected": case["expected"],
                    "choice": choice, "valid": choice in case["choices"],
                    "agrees_anchor": choice == case["expected"],
                    "confidence_uncalibrated": confidence,
                    "latency_ms": round((time.perf_counter() - started) * 1000, 1),
                    "error_type": error,
                })
    summary = {}
    for model in models:
        selected = [r for r in records if r["model"] == model]
        pairs = [[r for r in selected if r["case"] == c["id"]] for c in fixtures]
        summary[model] = {
            "anchor_agreement": sum(r["agrees_anchor"] for r in selected),
            "total": len(selected),
            "order_stable_pairs": sum(len(p) == 2 and p[0]["choice"] == p[1]["choice"] for p in pairs),
            "pair_total": len(pairs),
        }
    return {"summary": summary, "records": records}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixtures", default=str(Path(__file__).with_name("fixtures.json")))
    parser.add_argument("--models", nargs="+", default=["english", "typed-decisions", "multilingual"])
    parser.add_argument("--output", default=str(Path(__file__).with_name("results.json")))
    args = parser.parse_args()
    fixtures = cases(args.fixtures)
    router = Router(device="cuda", max_loaded=2)
    result = evaluate(router, fixtures, args.models)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result["summary"], ensure_ascii=False, indent=2))
    print(f"Saved {len(result['records'])} records to {args.output}")


if __name__ == "__main__":
    main()

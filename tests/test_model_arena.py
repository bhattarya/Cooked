"""The model arena: artifact contract, honesty rules, determinism and the /model-lab routes."""

import json
import math
import statistics
import time
from collections import OrderedDict
from threading import Lock

import numpy as np
import pandas as pd
import pytest

from api import model_lab
from api.schemas import ModelLabRequest
from ml.arena import HEADLINE_STAGE, SELECTION, run_arena
from ml.arena_metrics import (
    CURVE_POINTS,
    SCATTER_MAX,
    TOLERANCE,
    TOP_FEATURES,
    bootstrap_auroc_gain,
    bootstrap_loss_gain,
    calibration_points,
    choose_champion,
    clean,
    dumps,
    permutation_importance,
    roc_points,
)
from ml.candidates import FAMILIES
from ml.model_interface import Models, sha256
from ml.outcomes import OUTCOME_TRAIN_MAX_YEAR
from ml.risk_model import TEST_MIN_YEAR, TRAIN_MAX_YEAR, calibrated
from ml.snapshots import FEATURES, People, stage_features
from scripts.common import ROOT

ARENA = json.loads((ROOT / "models/arena.json").read_text())
TASKS = ("risk", "time_to_degree", "career", "salary")
STAGED = ("risk", "time_to_degree")
CLASSES = {"Employed", "Continuing education", "Still seeking"}
ARENA_CHAMPIONS = {t: ARENA["tasks"][t]["champion"]["family"] for t in TASKS}


def _walk(value):
    if isinstance(value, dict):
        for v in value.values():
            yield from _walk(v)
    elif isinstance(value, list):
        for v in value:
            yield from _walk(v)
    else:
        yield value


# ---------------------------------------------------------------- artifact contract
def test_arena_artifact_is_listed_in_the_manifest_with_its_checksum():
    manifest = json.loads((ROOT / "models/manifest.json").read_text())
    assert manifest["files"]["arena.json"] == sha256(ROOT / "models/arena.json")
    assert manifest["champions"] == {t: ARENA["tasks"][t]["champion"]["family"] for t in TASKS}
    assert Models.load(ROOT / "models").champions == manifest["champions"]


def test_arena_schema_has_four_tasks_and_four_ordered_families_each():
    assert ARENA["schema_version"] == 1 and ARENA["dataset"]["synthetic"] is True
    assert ARENA["dataset"]["current_students_in_training"] == 0
    assert [f["id"] for f in ARENA["families"]] == list(FAMILIES)
    assert set(ARENA["tasks"]) == set(TASKS)
    for name, task in ARENA["tasks"].items():
        assert [c["family"] for c in task["candidates"]] == list(FAMILIES), name
        assert sum(c["is_champion"] for c in task["candidates"]) == 1
        assert task["champion"]["family"] == task["selection"]["champion"]
        assert set(task["champion"]) >= {"family", "beats_baseline", "beats_linear", "note"}
        assert task["champion"]["note"]
        for c in task["candidates"]:
            assert isinstance(c["beats_baseline"], bool)
            assert c["hyperparameters"] is not None and c["kind"] and c["label"]


def test_headline_metrics_per_task():
    want = {
        "risk": {"auroc", "auprc", "brier", "log_loss"},
        "time_to_degree": {"mae", "pinball", "interval_coverage"},
        "career": {"macro_f1", "accuracy", "top2_accuracy", "log_loss"},
        "salary": {"mae", "mae_baseline", "r2", "interval_coverage"},
    }
    for name, keys in want.items():
        for c in ARENA["tasks"][name]["candidates"]:
            assert keys <= set(c["metrics"]), (name, c["family"])


def test_arena_report_has_no_nan_or_infinity():
    text = (ROOT / "models/arena.json").read_text()

    def refuse(constant):
        raise AssertionError(f"non-finite constant {constant} in arena.json")

    json.loads(text, parse_constant=refuse)  # NaN, Infinity, -Infinity
    numbers = [v for v in _walk(ARENA) if isinstance(v, float)]
    assert numbers and all(math.isfinite(v) for v in numbers)


def test_curves_are_plottable():
    risk = ARENA["tasks"]["risk"]
    stages = risk["split"]["stages"]
    for c in risk["candidates"]:
        assert set(c["curves"]["roc"]) == {str(k) for k in stages}
        for roc in c["curves"]["roc"].values():
            assert len(roc["fpr"]) == len(roc["tpr"]) <= CURVE_POINTS
            assert roc["fpr"][0] == 0 and roc["tpr"][-1] == 1
            assert roc["fpr"] == sorted(roc["fpr"]) and roc["tpr"] == sorted(roc["tpr"])
        for cal in c["curves"]["calibration"].values():
            assert len(cal["predicted"]) == len(cal["observed"]) == len(cal["n"]) > 0
            assert all(0 <= v <= 1 for v in cal["predicted"] + cal["observed"])
    for c in ARENA["tasks"]["career"]["candidates"]:
        assert set(c["roc"]) == CLASSES and set(c["confusion"]["labels"]) == CLASSES
        for row, counts in zip(c["confusion"]["row_normalised"], c["confusion"]["counts"], strict=True):
            assert sum(counts) == 0 or abs(sum(row) - 1) < 1e-3
    for name in ("time_to_degree", "salary"):
        scatter = ARENA["tasks"][name]["scatter"]
        assert scatter["n_shown"] == len(scatter["actual"]) <= SCATTER_MAX
        assert set(scatter["families"]) == set(FAMILIES)
        for f in scatter["families"].values():
            assert all(len(f[k]) == scatter["n_shown"] for k in ("low", "mid", "high"))


def test_permutation_importance_is_top_features_only_and_sorted():
    for name in ("career", "salary"):
        imp = ARENA["tasks"][name]["importance"]
        rows = imp["features"]
        assert len(rows) <= TOP_FEATURES
        assert [r["importance"] for r in rows] == sorted((r["importance"] for r in rows), reverse=True)
    for name in STAGED:
        by_stage = ARENA["tasks"][name]["importance"]["by_stage"]
        assert set(by_stage) == {str(k) for k in ARENA["tasks"][name]["split"]["stages"]}
        assert all(len(rows) <= TOP_FEATURES for rows in by_stage.values())
        assert {r["feature"] for rows in by_stage.values() for r in rows} <= set(FEATURES)


def test_model_cards_are_plain_english_and_say_the_data_is_synthetic():
    for name, task in ARENA["tasks"].items():
        card = task["card"]
        assert card["predicts"] and card["summary"] and card["features"]
        assert card["limitations"] and card["should_not_be_used_for"]
        assert "synthetic" in " ".join(card["limitations"]).lower(), name
        assert all(f["label"] for f in card["features"])
    assert "No Response" in " ".join(ARENA["tasks"]["career"]["card"]["limitations"])


# ---------------------------------------------------------------- honesty rules
def test_champion_is_chosen_on_validation_years_only():
    for name, task in ARENA["tasks"].items():
        sel, split = task["selection"], task["split"]
        assert sel["pre_registered"] is True and sel["test_used_for_selection"] is False
        last_train_year = OUTCOME_TRAIN_MAX_YEAR if name in ("career", "salary") else TRAIN_MAX_YEAR
        assert sel["validation_years"] == [last_train_year, last_train_year]
        assert split["train_years"][1] == last_train_year
        assert max(sel["fit_years"]) < min(sel["validation_years"]) < split["test_years"][0]
        assert split["train_years"][1] < split["test_years"][0] == TEST_MIN_YEAR
        assert sel["tolerance_relative"] == TOLERANCE
        higher = SELECTION[name][1]
        assert sel["higher_is_better"] is higher
        # the rule reproduces the champion from the validation scores alone
        assert choose_champion(sel["scores"], higher)[0] == sel["champion"]
        for c in task["candidates"]:
            assert c["validation"]["score"] == sel["scores"][c["family"]]


def test_champion_rule_cannot_see_test_metrics():
    import inspect

    assert list(inspect.signature(choose_champion).parameters) == [
        "scores", "higher_is_better", "tolerance"
    ]
    scores = {"baseline": 0.5, "linear": 0.905, "forest": 0.906, "boosting": 0.91}
    assert choose_champion(scores, True)[0] == "linear"  # simplest within 1% of the best
    assert choose_champion({**scores, "linear": 0.89}, True)[0] == "forest"  # linear is too far off
    assert choose_champion({**scores, "boosting": 0.95}, True)[0] == "boosting"
    assert choose_champion({"baseline": 0.5, "linear": 0.5, "forest": 0.6, "boosting": 0.7}, False)[0] == "baseline"
    assert choose_champion({"baseline": 9.0, "linear": 5.0, "forest": 5.02, "boosting": 5.5}, False)[0] == "linear"


def test_every_candidate_sees_the_same_rows():
    for name, task in ARENA["tasks"].items():
        assert len({c["metrics"]["n_test"] for c in task["candidates"]}) == 1, name
        if name in STAGED:
            per_stage = [[s["n_test"] for s in c["per_stage"]] for c in task["candidates"]]
            assert all(rows == per_stage[0] for rows in per_stage)
            assert per_stage[0] == [s["n_test"] for s in task["split"]["per_stage"]]
            head = HEADLINE_STAGE[name]
            assert task["candidates"][0]["metrics"]["n_test"] == task["split"]["per_stage"][head]["n_test"]
        else:
            assert task["candidates"][0]["metrics"]["n_test"] == task["split"]["n_test"]
    for c in ARENA["tasks"]["career"]["candidates"]:
        assert sum(v["support"] for v in c["per_class"].values()) == c["metrics"]["n_test"]


def test_no_response_is_never_a_career_class_in_the_arena():
    career = ARENA["tasks"]["career"]
    for c in career["candidates"]:
        assert set(c["per_class"]) == CLASSES and set(c["roc"]) == CLASSES
    assert career["card"]["trained_on"]["no_response_excluded"] > 0
    assert set(career["card"]["trained_on"]["class_counts"]) == CLASSES
    assert "No Response" not in json.dumps({k: v for k, v in career.items() if k != "card"})


def test_results_are_reported_even_when_the_fancy_model_does_not_win():
    for task in ARENA["tasks"].values():
        champion = task["champion"]
        by = {c["family"]: c for c in task["candidates"]}
        chosen = by[champion["family"]]
        assert isinstance(champion["beats_baseline"], bool)
        assert champion["beats_baseline"] is chosen["beats_baseline"]
        if champion["family"] == "baseline":
            assert champion["beats_baseline"] is False and champion["beats_linear"] is None
        if champion["family"] in ("forest", "boosting"):
            assert champion["beats_linear"] is chosen["beats_linear"]
        assert champion["holdout_best_family"] in FAMILIES
        for c in task["candidates"]:
            if c["vs_baseline"]:
                lo, hi = c["vs_baseline"]["ci95"]
                assert c["vs_baseline"]["beats"] is (lo > 0) and lo <= hi


# ---------------------------------------------------------------- metrics helpers
def test_clean_and_dumps_refuse_non_finite_numbers():
    for bad in (float("nan"), float("inf"), np.float64("-inf")):
        with pytest.raises(ValueError):
            clean({"x": [1.0, bad]})
        with pytest.raises(ValueError):
            dumps({"x": bad})
    text = dumps({"a": [0.1, 0.2, 0.3], "b": {"c": np.float32(1.5), "d": np.int64(3)}, "e": [[1, 2], [3, 4]]})
    assert json.loads(text) == {"a": [0.1, 0.2, 0.3], "b": {"c": 1.5, "d": 3}, "e": [[1, 2], [3, 4]]}
    assert "[0.1, 0.2, 0.3]" in text


def test_curve_helpers_downsample_and_handle_a_constant_predictor():
    rng = np.random.default_rng(0)
    y = rng.integers(0, 2, 3000)
    score = y * 0.3 + rng.random(3000)
    roc = roc_points(y, score)
    assert len(roc["fpr"]) <= CURVE_POINTS and roc["fpr"][0] == 0 and roc["tpr"][-1] == 1
    constant = calibration_points(y, np.full(3000, 0.4))
    assert len(constant["predicted"]) == 1 and constant["n"] == [3000]
    spread = calibration_points(y, rng.random(3000))
    assert len(spread["predicted"]) > 1 and sum(spread["n"]) == 3000


def test_permutation_importance_finds_the_real_signal_and_skips_constants():
    rng = np.random.default_rng(1)
    X = pd.DataFrame({"signal": rng.normal(size=400), "noise": rng.normal(size=400), "flat": 1.0})
    y = 3 * X["signal"].to_numpy()

    def score(frame):
        return -float(np.mean(np.abs(y - 3 * frame["signal"].to_numpy())))

    rows = permutation_importance(score, X, seed=3)
    assert [r["feature"] for r in rows] == ["signal", "noise"]  # "flat" never varies
    assert rows[0]["importance"] > 0.5 and rows[1]["importance"] == 0


def test_bootstrap_gain_needs_more_than_noise_to_beat_a_reference():
    rng = np.random.default_rng(2)
    y = rng.integers(0, 2, 800)
    good = y * 0.8 + rng.random(800)
    noise = rng.random(800)
    assert bootstrap_auroc_gain(y, good, noise, 5)["beats"] is True
    assert bootstrap_auroc_gain(y, good, good, 5)["beats"] is False
    loss = rng.random(800)
    assert bootstrap_loss_gain(loss, loss, 5)["beats"] is False
    assert bootstrap_loss_gain(loss - 0.5, loss, 5)["beats"] is True


def test_baseline_needs_no_calibration():
    from sklearn.dummy import DummyClassifier

    X = pd.DataFrame({"a": [0.0, 1.0, 2.0, 3.0]})
    clf = DummyClassifier(strategy="prior").fit(X, [0, 0, 0, 1])
    assert list(calibrated({"clf": clf, "platt": None}, X)) == [0.25] * 4


# ---------------------------------------------------------------- determinism, on synthetic data
def synthetic_people(per_year: int = 60, seed: int = 5) -> People:
    """Alumni for 2015-2026 with a real signal (work hours and load), plus a few current students."""
    rng = np.random.default_rng(seed)
    static, terms, out = [], {}, []
    for i in range(12 * per_year):
        year = 2015 + i // per_year
        cid = f"CID-{800000 + i:06d}"
        work = int(rng.integers(0, 31))
        load = float(rng.choice([9, 12, 15], p=[0.15, 0.3, 0.55]))
        n_terms = int(np.clip(round(120 / load) + rng.integers(-1, 3), 6, 13))
        att = np.clip(np.round(rng.normal(load, 1.2, n_terms)), 3, 18)
        w = (rng.random(n_terms) < 0.03 + work / 250).astype(float)
        t = np.column_stack([att, np.maximum(att - 3 * w, 0), w, np.zeros(n_terms), np.r_[0, w[:-1]]])
        ttd = n_terms / 2
        terms[cid] = t
        employed = rng.random() < 0.7
        internships = int(rng.integers(0, 4))
        static.append({
            "campus_id": cid, "population": "alumni", "major": "Computer Science", "track": "x",
            "entry_type": "Transfer" if rng.random() < 0.25 else "First-Time Freshman",
            "residency": "In-State", "work_hours": work, "graduation_year": year, "ttd": ttd,
            "cooked": bool(ttd > 5 or w.sum() >= 5),
        })
        destination = rng.choice(
            ["Employed Full-Time", "Continuing Education", "Still Seeking", "Military", "No Response"],
            p=[0.6, 0.1, 0.1, 0.03, 0.17],
        )
        out.append({
            "campus_id": cid, "first_destination": destination,
            "salary": 60000 + 2500 * (year - 2015) + 4000 * internships + rng.normal(0, 6000)
            if destination == "Employed Full-Time" and employed else np.nan,
            "net_cost": 40000.0, "internship_count": internships,
            "credential_count": int(rng.integers(0, 3)), "engagement_count": int(rng.integers(0, 8)),
            "graduation_year": year,
        })
    for j in range(6):
        cid = f"CID-{100000 + j:06d}"
        static.append({
            "campus_id": cid, "population": "current", "major": "Computer Science", "track": "x",
            "entry_type": "First-Time Freshman", "residency": "In-State", "work_hours": 10,
            "graduation_year": None, "ttd": None, "cooked": None,
        })
        terms[cid] = np.array([[12, 12, 0, 0, 0]] * 2, dtype=float)
    return People(
        pd.DataFrame(static).set_index("campus_id"), terms, dict.fromkeys(terms, 0),
        pd.DataFrame(out).set_index("campus_id"), pd.DataFrame(),
    )


@pytest.fixture(scope="module")
def synthetic_run():
    return run_arena(synthetic_people(), stages=[0, 1], log=lambda *_: None)


def test_same_seed_gives_the_same_arena(synthetic_run):
    again = run_arena(synthetic_people(), stages=[0, 1], log=lambda *_: None)
    assert dumps(again.report) == dumps(synthetic_run.report)
    assert again.champions == synthetic_run.champions


def test_arena_on_fresh_data_follows_every_rule(synthetic_run):
    run, people = synthetic_run, synthetic_people()
    report = json.loads(dumps(run.report))  # also proves it is finite JSON
    assert set(report["tasks"]) == set(TASKS)
    # no current student in any training set, and every training id is an alumnus
    assert not set(run.training_ids) & set(people.current_ids)
    assert set(run.training_ids) <= set(people.alumni_ids)
    # temporal: training years end before the holdout begins, validation lies inside training
    for task in report["tasks"].values():
        assert task["split"]["train_years"][1] < task["split"]["test_years"][0]
        assert task["selection"]["validation_years"][1] <= task["split"]["train_years"][1]
        assert task["selection"]["test_used_for_selection"] is False
    # No Response and Military never become a class
    assert set(run.models["career"]["boosting"]["classes"]) == CLASSES
    raw = people.alumni_out["first_destination"]
    excluded = int(raw.isin(["No Response", "Military"]).sum())
    assert report["tasks"]["career"]["card"]["trained_on"]["no_response_excluded"] == int((raw == "No Response").sum())
    assert excluded > 0
    # the shipped models are the champions, in the shape the interface expects
    assert set(run.shipped) == {"risk", "ttd", "career", "salary"}
    for k in (0, 1):
        assert set(run.shipped["risk"][k]) == {"clf", "platt"}
        assert set(run.shipped["ttd"][k]) == {0.25, 0.5, 0.75}
    # legacy per-stage metrics the gates read are all finite
    assert all(math.isfinite(v) for m in run.metrics.values() for v in m.values() if isinstance(v, float))


def test_shipped_champion_scores_a_frame_through_the_interface(synthetic_run):
    people = synthetic_people()
    cid = people.alumni_ids[0]
    X = pd.DataFrame([stage_features(people.static.loc[cid], people.terms_of(cid), 1)], columns=FEATURES)
    for family in FAMILIES:
        p = calibrated(synthetic_run.models["risk"][family][1], X)
        assert p.shape == (1,) and 0 <= p[0] <= 1


# ---------------------------------------------------------------- scenario construction (no DB)
def _ctx() -> model_lab.Context:
    return model_lab.Context(
        engine=None, ranges={}, reference={}, credits_per_lost_course=3, constellation=[],
        lock=Lock(), cache=OrderedDict(),
    )


def test_scenario_credits_are_only_lost_to_withdrawn_or_failed_courses():
    body = ModelLabRequest(completed_terms=3, credits_per_term=12, withdrawals=2, failures=1)
    terms, effective = model_lab._history(_ctx(), body)
    att, earned, w, f, rep = terms.T
    assert list(att[:3]) == [12, 12, 12] and list(w[:3]) == [1, 1, 0] and list(f[:3]) == [1, 0, 0]
    assert list(earned[:3]) == [12 - 3 * 2, 12 - 3, 12]  # 3 credits lost per withdrawn/failed course
    assert list(rep[:4]) == [0, 2, 1, 0]  # a lost course is retaken the following term
    assert effective["withdrawals"] == 2 and effective["failures"] == 1
    # projected terms (after the completed ones) are clean: same load, nothing new lost
    assert list(w[3:]) == [0, 0, 0] and list(earned[3:]) == [12, 12, 12]


def test_a_completion_shortfall_becomes_withdrawals_never_off_manifold_credits():
    body = ModelLabRequest(completed_terms=4, credits_per_term=15, earned_ratio=0.8)
    terms, effective = model_lab._history(_ctx(), body)
    assert effective["withdrawals"] == round(4 * 15 * 0.2 / 3) == 4 and effective["failures"] == 0
    lost = terms[:4, 0] - terms[:4, 1]
    assert np.all(lost % 3 == 0) and np.all((lost > 0) == (terms[:4, 2] > 0))


def test_later_withdrawals_never_leak_into_earlier_stages():
    ctx = _ctx()
    static = pd.Series({"entry_type": "Transfer", "residency": "In-State", "work_hours": 10,
                        "major": "Computer Science"})
    few = model_lab._history(ctx, ModelLabRequest(completed_terms=4, withdrawals=1))[0]
    many = model_lab._history(ctx, ModelLabRequest(completed_terms=4, withdrawals=4))[0]
    assert stage_features(static, few, 1) == stage_features(static, many, 1)  # term one is the same
    assert stage_features(static, few, 4) != stage_features(static, many, 4)
    zero = model_lab._history(ctx, ModelLabRequest(completed_terms=0, withdrawals=3, failures=2))
    assert zero[1]["withdrawals"] == 0 and zero[1]["failures"] == 0  # no history to attach them to


# ---------------------------------------------------------------- API (needs the loaded database)
def _simulate(client, **scenario):
    response = client.post("/model-lab/simulate", json=scenario)
    assert response.status_code == 200, response.text
    return response.json()["data"]


@pytest.mark.db
def test_arena_route_serves_the_frozen_report(db, engine_client):
    response = engine_client.get("/model-lab/arena")
    assert response.status_code == 200
    body = response.json()
    assert body["mock"] is False and body["model_version"].startswith("cooked-v1")
    assert body["data"] == ARENA  # byte-for-byte the checksummed artifact


@pytest.mark.db
def test_simulate_keeps_every_field_the_lab_already_used(db, engine_client):
    d = _simulate(engine_client)
    for key in ("scenario", "risk", "time_to_degree", "trajectory", "career", "salary", "pattern",
                "constellation", "models", "tool_result_id", "disclaimer"):
        assert key in d, key
    assert 0 <= d["risk"] <= 1 and d["tool_result_id"].startswith("tr_")
    assert d["time_to_degree"]["low"] <= d["time_to_degree"]["mid"] <= d["time_to_degree"]["high"]
    assert d["salary"]["low"] <= d["salary"]["mid"] <= d["salary"]["high"]
    assert [t["term"] for t in d["trajectory"]] == list(range(7))
    assert abs(sum(c["probability"] for c in d["career"]) - 1) < 1e-2
    assert {c["label"] for c in d["career"]} == CLASSES
    assert {"x", "y", "pattern"} <= set(d["constellation"]["points"][0])
    assert len(d["models"]) == 4 and all(m["support"] > 0 for m in d["models"])
    assert "synthetic" in d["disclaimer"].lower()


@pytest.mark.db
def test_simulate_adds_drivers_and_every_familys_answer(db, engine_client):
    d = _simulate(engine_client, work_hours=30, credits_per_term=9, withdrawals=2)
    drivers = d["drivers"]
    assert 1 <= len(drivers) <= 4
    assert [abs(x["delta"]) for x in drivers] == sorted((abs(x["delta"]) for x in drivers), reverse=True)
    for x in drivers:
        assert x["direction"] == ("raises" if x["delta"] > 0 else "lowers")
        assert 0 <= x["risk_at_reference"] <= 1
        assert abs((d["risk"] - x["risk_at_reference"]) - x["delta"]) < 2e-4  # real model output
    assert d["drivers_basis"]

    c = d["candidates"]
    assert set(c) == {"champions", "risk", "time_to_degree", "career", "salary"}
    assert c["champions"] == ARENA_CHAMPIONS
    for task in ("risk", "time_to_degree", "career", "salary"):
        assert [row["family"] for row in c[task]] == list(FAMILIES)
        assert sum(row["is_champion"] for row in c[task]) == 1
    champ = {t: next(r for r in c[t] if r["is_champion"]) for t in c if t != "champions"}
    assert champ["risk"]["risk"] == d["risk"]
    assert (champ["time_to_degree"]["low"], champ["time_to_degree"]["mid"], champ["time_to_degree"]["high"]) == (
        d["time_to_degree"]["low"], d["time_to_degree"]["mid"], d["time_to_degree"]["high"])
    assert champ["salary"]["mid"] == d["salary"]["mid"]
    assert champ["career"]["probabilities"] == d["career"]
    for row in c["career"]:
        assert abs(sum(p["probability"] for p in row["probabilities"]) - 1) < 1e-2
    # the trajectory point at the completed stage is the scenario's own risk
    assert d["trajectory"][3]["risk"] == d["risk"] and not d["trajectory"][3]["projected"]
    assert d["trajectory"][4]["projected"]


@pytest.mark.db
def test_a_typical_scenario_has_no_drivers_and_drivers_react_to_the_inputs(db, engine_client):
    typical = _simulate(engine_client, work_hours=10, credits_per_term=13, withdrawals=0)
    assert typical["drivers"] == []  # every input already at the typical alumnus value
    heavy = _simulate(engine_client, work_hours=40, credits_per_term=9, withdrawals=3)
    assert heavy["risk"] > typical["risk"]
    assert {"withdrawals"} <= {x["feature"] for x in heavy["drivers"]}
    assert all(x["direction"] == "raises" for x in heavy["drivers"])
    at_k0 = _simulate(engine_client, completed_terms=0, work_hours=30)
    assert {x["feature"] for x in at_k0["drivers"]} <= {"work_hours", "entry_type", "residency", "major"}


@pytest.mark.db
def test_inputs_beyond_the_training_range_are_held_at_its_edge_and_flagged(db, engine_client):
    wild = _simulate(engine_client, credential_count=8, engagement_count=20, work_hours=50)
    edge = _simulate(engine_client, credential_count=3, engagement_count=10, work_hours=40)
    assert set(wild["out_of_range"]) == {"credential_count", "engagement_count", "work_hours"}
    assert edge["out_of_range"] == []
    assert wild["risk"] == edge["risk"] and wild["salary"] == edge["salary"]
    assert wild["scenario"]["credential_count"] == 8  # the request is echoed as sent


@pytest.mark.db
def test_simulate_is_deterministic_and_never_returns_non_finite_numbers(db, engine_client):
    scenario = {"work_hours": 22, "completed_terms": 5, "withdrawals": 2, "failures": 1, "earned_ratio": 0.8}
    a = engine_client.post("/model-lab/simulate", json=scenario).text
    model_lab._contexts.clear()  # forget the response cache: recompute from scratch
    b = engine_client.post("/model-lab/simulate", json=scenario).text
    assert a == b
    assert "NaN" not in a and "Infinity" not in a


@pytest.mark.db
def test_simulate_is_fast_enough_for_slider_drags(db, engine_client):
    _simulate(engine_client)  # warm the per-engine context
    rng = np.random.default_rng(0)
    times = []
    for _ in range(30):
        scenario = {
            "work_hours": int(rng.integers(0, 51)), "completed_terms": int(rng.integers(0, 7)),
            "credits_per_term": int(rng.integers(3, 19)), "withdrawals": int(rng.integers(0, 5)),
            "internship_count": int(rng.integers(0, 5)),
        }
        start = time.perf_counter()
        _simulate(engine_client, **scenario)
        times.append((time.perf_counter() - start) * 1000)
    times.sort()
    print(f"simulate p50 {statistics.median(times):.0f} ms, p95 {times[28]:.0f} ms")
    assert times[28] < 400  # p95, generous for shared CI; the target on a laptop is < 250 ms


@pytest.mark.db
def test_no_current_student_reaches_the_outcome_models_either(db):
    from ml.outcomes import outcome_frame
    from ml.snapshots import load_people
    from scripts.common import connect

    with connect("DATABASE_URL_APP") as conn:
        people = load_people(conn)
    frame = outcome_frame(people)
    assert frame.ids and not set(frame.ids) & set(people.current_ids)
    assert people.static.loc[frame.ids, "population"].eq("alumni").all()
    assert not set(json.loads((ROOT / "models/training_ids.json").read_text())) & set(people.current_ids)

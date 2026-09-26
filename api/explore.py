"""Grounded, audit-free exploration of the synthetic HackUMBC cohort.

Gemini chooses among fixed questions. SQL owns every number; the model never writes SQL
or a claim about a student's personal outcome.
"""

from __future__ import annotations

import re

from api.engine import Engine, db
from api.providers import gemini, net

TOPICS = [
    {"name": name, "description": description, "parameters": {"type": "OBJECT", "properties": {}}}
    for name, description in [
        ("load", "Compare average regular-term credit loads and time to degree, especially for working students."),
        ("work", "Compare work-hour bands, credit loads and time to degree."),
        ("internships", "Compare internship counts and first destination; exclude No Response from seeking rates."),
        ("destinations", "Show first destinations, including No Response as unknown."),
        ("majors", "Compare the two majors and their observed time to degree."),
        ("cost", "Show nominal degree cost and first salary within graduation years, without inflation adjustment."),
    ]
]


def choose(question: str) -> tuple[str, str]:
    q = question.lower()
    if re.search(r"intern|job|employ|career|offer", q):
        default = "internships" if "intern" in q else "destinations"
    elif re.search(r"salary|pay|cost|loan|roi|return|money|debt", q):
        default = "cost"
    elif re.search(r"major|computer science|information systems|\bcs\b|\bis\b", q):
        default = "majors"
    elif re.search(r"work|hour|job shift", q):
        default = "work"
    else:
        default = "load"
    routed = gemini.route(question, "Choose an aggregate cohort comparison. Never infer a personal prediction.", TOPICS) if net.enabled() else None
    return (routed[0], "gemini") if routed and routed[0] in {t["name"] for t in TOPICS} else (default, "local")


QUERIES = {
    "load": """
        WITH per_person AS (
          SELECT a.campus_id, a.work_hours_per_week_while_enrolled AS work_hours,
                 a.time_to_degree_years::float AS years,
                 avg(t.credits_attempted)::float AS load
          FROM feat.alumni a JOIN feat.person_term t USING (campus_id)
          GROUP BY a.campus_id, a.work_hours_per_week_while_enrolled, a.time_to_degree_years
        )
        SELECT CASE WHEN load <= 7 THEN '≤7' WHEN load <= 9 THEN '8–9'
                    WHEN load <= 11 THEN '10–11' WHEN load <= 13 THEN '12–13' ELSE '14+' END AS label,
               count(*)::int AS n, round(avg(years)::numeric, 2)::float AS value
        FROM per_person WHERE work_hours >= 20
        GROUP BY 1 ORDER BY min(load)
    """,
    "work": """
        SELECT CASE WHEN work_hours_per_week_while_enrolled = 0 THEN '0 h'
                    WHEN work_hours_per_week_while_enrolled <= 10 THEN '1–10 h'
                    WHEN work_hours_per_week_while_enrolled <= 20 THEN '11–20 h'
                    WHEN work_hours_per_week_while_enrolled <= 30 THEN '21–30 h' ELSE '31+ h' END AS label,
               count(*)::int AS n, round(avg(time_to_degree_years)::numeric, 2)::float AS value
        FROM feat.alumni GROUP BY 1 ORDER BY min(work_hours_per_week_while_enrolled)
    """,
    "internships": """
        SELECT CASE WHEN internship_count >= 3 THEN '3+' ELSE internship_count::text END AS label,
               count(*) FILTER (WHERE first_destination <> 'No Response')::int AS n,
               round(100.0 * count(*) FILTER (WHERE first_destination = 'Still Seeking') /
                     nullif(count(*) FILTER (WHERE first_destination <> 'No Response'), 0), 1)::float AS value,
               count(*) FILTER (WHERE first_destination = 'No Response')::int AS unknown
        FROM feat.alumni GROUP BY 1 ORDER BY 1
    """,
    "destinations": """
        SELECT coalesce(first_destination, 'No Response') AS label,
               count(*)::int AS n, count(*)::float AS value
        FROM feat.alumni GROUP BY 1 ORDER BY n DESC
    """,
    "majors": """
        SELECT major AS label, count(*)::int AS n,
               round(avg(time_to_degree_years)::numeric, 2)::float AS value
        FROM feat.alumni GROUP BY 1 ORDER BY 1
    """,
    "cost": """
        SELECT graduation_year::text AS label, count(*) FILTER (
                 WHERE net_cost_usd IS NOT NULL AND first_job_annual_salary_usd > 0)::int AS n,
               round(percentile_cont(0.5) WITHIN GROUP (ORDER BY
                 net_cost_usd::float / nullif(first_job_annual_salary_usd, 0))::numeric, 2)::float AS value
        FROM feat.alumni GROUP BY 1 ORDER BY 1
    """,
}

COPY = {
    "load": ("The load bottleneck", "For alumni who worked at least 20 hours a week, average years to degree by credits attempted per completed regular term.", "Years to degree", "credits / term", "years"),
    "work": ("Work and time", "Observed years to degree across alumni work-hour bands. This is an association, not the effect of changing hours.", "Years to degree", "work / week", "years"),
    "internships": ("Internships and first destination", "Still-seeking share among alumni who answered. No Response is unknown and is excluded from each rate.", "Still seeking", "internships", "%"),
    "destinations": ("Where graduates went", "First destination for all synthetic alumni. No Response remains visible as unknown.", "Alumni", "first destination", "people"),
    "majors": ("Two paths through the data", "Observed years to degree by major among synthetic alumni. Individual plans vary.", "Years to degree", "major", "years"),
    "cost": ("Degree burden by graduation year", "Median net cost divided by first annual salary, within each graduation year. Nominal dollars; only alumni with both values count.", "Cost ÷ first salary", "graduation year", "ratio"),
}


def _spoken_rows(topic: str, rows: list[dict], tr: str) -> list[dict]:
    """Keep spoken quantities as provenance tokens so /voice can safely render them."""
    if len(rows) < 2:
        return [{"text": "I found one comparable group. See the chart for its sample size."}]
    first, last = rows[0], rows[-1]
    tok = lambda value: {"value": str(value), "tool_result_id": tr}
    if topic == "internships":
        return [
            {"text": "Among alumni who answered, the still-seeking share was "}, tok(f"{first['value']:.1f}"),
            {"text": " percent with "}, tok(first["label"]), {"text": " internships, versus "},
            tok(f"{last['value']:.1f}"), {"text": " percent with "}, tok(last["label"]),
            {"text": " internships. No Response is excluded; this is an association, not a promise."},
        ]
    if topic == "destinations":
        return [{"text": "The largest first-destination group was "}, {"text": first["label"]},
                {"text": ", with "}, tok(first["n"]),
                {"text": " alumni. No Response stays visible as unknown in the chart."}]
    if topic == "cost":
        return [{"text": "The median nominal cost-to-first-salary ratio was "}, tok(f"{first['value']:.2f}"),
                {"text": " for the "}, tok(first["label"]), {"text": " graduating cohort, and "},
                tok(f"{last['value']:.2f}"), {"text": " for "}, tok(last["label"]),
                {"text": ". Compare within a year; these dollars are not adjusted for inflation."}]
    return [
        {"text": "In this synthetic cohort, "}, tok(first["label"]), {"text": " averaged "},
        tok(f"{first['value']:.2f}"), {"text": " years to degree, while "}, tok(last["label"]),
        {"text": " averaged "}, tok(f"{last['value']:.2f}"),
        {"text": " years. The chart shows every group and sample size. This is observational."},
    ]


def explore(engine: Engine, question: str) -> dict:
    topic, router = choose(question)
    with db() as conn:
        cur = conn.execute(QUERIES[topic])
        columns = [c.name for c in cur.description]
        rows = [dict(zip(columns, row)) for row in cur.fetchall()]
    title, detail, measure, dimension, unit = COPY[topic]
    tr = engine.rec("cohort_explore", {"topic": topic, "question": question[:300]}, {"rows": rows})
    speech = engine._finish(_spoken_rows(topic, rows, tr), "template", "explore")
    return {
        "question": question, "topic": topic, "router": router, "title": title,
        "detail": detail, "measure": measure, "dimension": dimension, "unit": unit,
        "rows": [{**row, "tool_result_id": tr} for row in rows],
        "narration": speech,
        "tool_result_id": tr,
        "source": "Tiger Data · feat.alumni / feat.person_term",
        "disclaimer": "Synthetic HackUMBC 2026 data. Group patterns are not personal predictions or causal effects.",
    }

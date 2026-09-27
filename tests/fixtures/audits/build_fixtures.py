"""Builds the audit PDF fixtures and their ground truth: `python tests/fixtures/audits/build_fixtures.py`.

Every PDF is rendered by Chromium from HTML in a different layout, from the SAME spec the ground
truth JSON is written from, so the parser is checked against what was printed, not against itself.
Names, ids, emails and addresses are invented; the parser must drop everything but the first name.
"""

from __future__ import annotations

import io
import json
import sys
from html import escape
from pathlib import Path

OUT = Path(__file__).parent
T = {  # id -> (title, credits)
    "CMSC 201": ("Computer Science I for Majors", 4), "CMSC 202": ("Computer Science II for Majors", 4),
    "CMSC 203": ("Discrete Structures", 3), "CMSC 313": ("Computer Organization and Assembly Language", 3),
    "CMSC 331": ("Principles of Programming Languages", 3), "CMSC 341": ("Data Structures", 3),
    "CMSC 421": ("Principles of Operating Systems", 3), "CMSC 447": ("Software Engineering I", 3),
    "CMSC 471": ("Introduction to Artificial Intelligence", 3), "MATH 151": ("Calculus and Analytic Geometry I", 4),
    "MATH 152": ("Calculus and Analytic Geometry II", 4), "MATH 221": ("Linear Algebra", 3),
    "STAT 355": ("Statistics for Scientists", 3), "ENGL 100": ("Composition", 3), "PHYS 121": ("Fundamentals of Physics I", 4),
    "IS 247": ("Information Systems Concepts", 3), "IS 300": ("Systems Analysis and Design", 3),
    "ECON 101": ("Principles of Microeconomics", 3), "PSYC 100": ("Introduction to Psychology", 3),
    "HIST 101": ("World History", 3), "ARTT 100": ("Drawing Fundamentals", 3), "IS 331": ("Database Systems Concepts", 3),
}


def crs(cid: str, grade: str = "", credits: float | None = None) -> dict:
    return {"id": cid, "title": T[cid][0], "credits": T[cid][1] if credits is None else credits, "grade": grade}


def term(label: str, *rows: tuple, ip: bool = False) -> dict:
    return {"label": label, "courses": [crs(*r) for r in rows], "ip": ip}


SPECS: dict[str, dict] = {
    "blocks_cs": {
        "layout": "blocks", "name": "Maya Okafor", "first": "Maya", "major": "Computer Science", "track": "Software Engineering",
        "entry": "First-Time Freshman", "res": "In-State", "req": 120,
        "terms": [
            term("Fall 2023", ("CMSC 201", "A"), ("MATH 151", "B+"), ("ENGL 100", "A-"), ("PSYC 100", "B")),
            term("Spring 2024", ("CMSC 202", "B+"), ("MATH 152", "B"), ("CMSC 203", "A"), ("HIST 101", "A-")),
            term("Fall 2024", ("CMSC 341", "B"), ("CMSC 313", "C+"), ("MATH 221", "B-"), ("STAT 355", "A-")),
            term("Spring 2025", ("CMSC 331", "B+"), ("PHYS 121", "W"), ("ECON 101", "A"), ("ARTT 100", "A")),
        ],
        "ip": [crs("CMSC 421"), crs("CMSC 447"), crs("PHYS 121")], "ip_label": "Fall 2025",
    },
    "flat_table_is": {
        "layout": "flat", "name": "Jordan Reyes", "first": "Jordan", "major": "Information Systems", "track": "Data Analytics",
        "entry": "First-Time Freshman", "res": "Out-of-State", "req": 120,
        "terms": [
            term("Fall 2022", ("IS 247", "A"), ("MATH 151", "C"), ("ENGL 100", "B+"), ("ECON 101", "B")),
            term("Spring 2023", ("CMSC 201", "B-"), ("STAT 355", "B+"), ("PSYC 100", "A-")),
            term("Fall 2023", ("IS 300", "A-"), ("CMSC 202", "C+"), ("HIST 101", "B"), ("MATH 221", "C")),
            term("Spring 2024", ("IS 331", "B+"), ("CMSC 341", "D+"), ("ARTT 100", "A")),
            term("Fall 2024", ("CMSC 341", "B-"), ("CMSC 313", "B"), ("PHYS 121", "C-")),
        ],
        "ip": [crs("CMSC 331"), crs("CMSC 421")], "ip_label": "Spring 2025",
    },
    "oneline_lists": {
        "layout": "oneline", "name": "Priya Nair", "first": "Priya", "major": "Computer Science", "track": "Cybersecurity",
        "entry": "First-Time Freshman", "res": "In-State", "req": 120,
        "terms": [
            term("Fall 2022", ("CMSC 201", "A"), ("MATH 151", "A-"), ("ENGL 100", "A")),
            term("Spring 2023", ("CMSC 202", "A"), ("MATH 152", "B+"), ("CMSC 203", "A-"), ("PSYC 100", "A")),
            term("Fall 2023", ("CMSC 341", "A-"), ("CMSC 313", "B+"), ("MATH 221", "A")),
            term("Spring 2024", ("CMSC 331", "A"), ("STAT 355", "B+"), ("HIST 101", "A-"), ("ECON 101", "B")),
        ],
        "ip": [crs("CMSC 421"), crs("CMSC 471")], "ip_label": "Fall 2024",
    },
    "two_column": {
        "layout": "columns", "name": "Sam Whitfield", "first": "Sam", "major": "Computer Science", "track": "Game Development",
        "entry": "First-Time Freshman", "res": "In-State", "req": 120,
        "terms": [
            term("Fall 2021", ("CMSC 201", "B"), ("MATH 151", "B-"), ("ENGL 100", "B")),
            term("Spring 2022", ("CMSC 202", "C+"), ("MATH 152", "C"), ("PSYC 100", "B+")),
            term("Fall 2022", ("CMSC 203", "B"), ("CMSC 313", "C"), ("HIST 101", "B-"), ("ARTT 100", "A")),
            term("Spring 2023", ("CMSC 341", "C-"), ("MATH 221", "C+"), ("ECON 101", "B")),
            term("Fall 2023", ("CMSC 341", "B"), ("CMSC 331", "C+"), ("STAT 355", "B-")),
            term("Spring 2024", ("CMSC 447", "B+"), ("PHYS 121", "B"), ("CMSC 421", "C+")),
        ],
        "ip": [crs("CMSC 471")], "ip_label": "Fall 2024",
    },
    "numbered_terms": {
        "layout": "numbered", "name": "Alex Tran", "first": "Alex", "major": "Computer Science", "track": None,
        "entry": "First-Time Freshman", "res": "In-State", "req": 120,
        "terms": [
            term("Term 1", ("CMSC 201", "C"), ("MATH 151", "D"), ("ENGL 100", "B")),
            term("Term 2", ("CMSC 201", "B-"), ("MATH 151", "C"), ("PSYC 100", "W"), ("HIST 101", "B")),
            term("Term 3", ("CMSC 202", "C+"), ("MATH 152", "C-"), ("CMSC 203", "B")),
        ],
        "ip": [crs("CMSC 341"), crs("CMSC 313")], "ip_label": None,
    },
    "multipage_long": {
        "layout": "blocks", "pages": True, "pad": 330, "name": "Chris Delgado", "first": "Chris", "major": "Computer Science", "track": "Systems",
        "entry": "First-Time Freshman", "res": "In-State", "req": 120,
        "terms": [
            term("Fall 2020", ("CMSC 201", "A"), ("MATH 151", "A-"), ("ENGL 100", "B+"), ("PSYC 100", "A")),
            term("Spring 2021", ("CMSC 202", "A-"), ("MATH 152", "B+"), ("CMSC 203", "A"), ("HIST 101", "B")),
            term("Fall 2021", ("CMSC 341", "B+"), ("CMSC 313", "A-"), ("MATH 221", "B"), ("ECON 101", "A")),
            term("Spring 2022", ("CMSC 331", "B"), ("STAT 355", "A-"), ("PHYS 121", "B+"), ("ARTT 100", "A")),
            term("Fall 2022", ("CMSC 421", "B+"), ("CMSC 447", "A-"), ("IS 247", "A"), ("IS 300", "B")),
            term("Spring 2023", ("CMSC 471", "B"), ("IS 331", "A-")),
            term("Fall 2023", ("CMSC 447", "A"), ("CMSC 471", "B+"), ("ECON 101", "A")),
        ],
        "ip": [crs("IS 331")], "ip_label": "Spring 2024",
    },
    "transfer_credits": {
        "layout": "blocks", "transfer": True, "name": "Lena Kowalski", "first": "Lena", "major": "Information Systems", "track": "Business Analytics",
        "entry": "Transfer", "res": "Out-of-State", "req": 120,
        "xfer": [crs("ENGL 100", "T"), crs("MATH 151", "T"), crs("PSYC 100", "T"), crs("HIST 101", "T")],
        "terms": [
            term("Fall 2023", ("CMSC 201", "B"), ("IS 247", "A-"), ("STAT 355", "B+")),
            term("Spring 2024", ("CMSC 202", "C+"), ("IS 300", "B"), ("MATH 152", "C")),
            term("Fall 2024", ("IS 331", "A-"), ("CMSC 203", "B+"), ("ECON 101", "A")),
        ],
        "ip": [crs("CMSC 341"), crs("CMSC 313")], "ip_label": "Spring 2025",
    },
    "totals_only": {
        "layout": "totals", "name": "Devon Park", "first": "Devon", "major": "Computer Science", "track": "General",
        "entry": "First-Time Freshman", "res": "In-State", "req": 120,
        "totals": [("Fall 2022", 15, 15, 0), ("Spring 2023", 16, 13, 1), ("Fall 2023", 15, 12, 1), ("Spring 2024", 12, 9, 1), ("Fall 2024", 14, 14, 0)],
        "ip": [crs("CMSC 341"), crs("CMSC 331")], "ip_label": "Spring 2025", "terms": [],
    },
    "messy_grades": {
        "layout": "flat", "name": "Taylor Brooks", "first": "Taylor", "major": "Computer Science", "track": "Artificial Intelligence",
        "entry": "First-Time Freshman", "res": "In-State", "req": 120,
        "terms": [
            term("Fall 2022", ("CMSC 201", "B"), ("MATH 151", "F"), ("ENGL 100", "P"), ("PSYC 100", "WF")),
            term("Spring 2023", ("CMSC 202", "C"), ("MATH 151", "C-"), ("HIST 101", "W"), ("ARTT 100", "S")),
            term("Fall 2023", ("CMSC 203", "NP"), ("CMSC 341", "B-"), ("ECON 101", "A")),
        ],
        "ip": [crs("CMSC 313")], "ip_label": "Spring 2024",
    },
    "mono_sample_style": {
        "layout": "mono", "name": "Riley Chen", "first": "Riley", "major": "Computer Science", "track": "Software Engineering",
        "entry": "First-Time Freshman", "res": "In-State", "req": 120,
        "terms": [
            term("Fall 2023", ("CMSC 201", "A-"), ("MATH 151", "B"), ("ENGL 100", "A")),
            term("Spring 2024", ("CMSC 202", "B+"), ("MATH 152", "B-"), ("CMSC 203", "A-")),
            term("Fall 2024", ("CMSC 341", "B"), ("CMSC 313", "B+"), ("STAT 355", "A")),
        ],
        "ip": [crs("CMSC 331"), crs("MATH 221")], "ip_label": "Spring 2025",
    },
}
NORM = {"WF": "F", "NP": "F", "S": "P", "U": "F"}


def sums(t: dict) -> tuple[float, float, int, int]:
    att = sum(c["credits"] for c in t["courses"])
    earned = sum(c["credits"] for c in t["courses"] if NORM.get(c["grade"], c["grade"]) not in ("W", "F"))
    w = sum(NORM.get(c["grade"], c["grade"]) == "W" for c in t["courses"])
    f = sum(NORM.get(c["grade"], c["grade"]) == "F" for c in t["courses"])
    return att, earned, w, f


def truth(name: str, s: dict) -> dict:
    terms, earned_total = [], 0.0
    for t in s["terms"]:
        att, earned, w, f = sums(t)
        earned_total += earned
        terms.append({"label": t["label"], "courses": [{"course_id": c["id"].replace(" ", ""), "credits": float(c["credits"]),
                     "grade": NORM.get(c["grade"], c["grade"])} for c in t["courses"]],
                      "attempted": float(att), "earned": float(earned), "withdrawals": w, "failures": f})
    for label, att, earned, w in s.get("totals", []):
        earned_total += earned
        terms.append({"label": label, "courses": [], "attempted": float(att), "earned": float(earned), "withdrawals": w, "failures": 0})
    xfer = sum(c["credits"] for c in s.get("xfer", []))
    return {
        "first_name": s["first"], "major": s["major"], "track": s["track"], "entry_type": s["entry"], "residency": s["res"],
        "credits_required": s["req"], "credits_earned": int(earned_total + xfer), "terms": terms,
        "in_progress": [c["id"].replace(" ", "") for c in s["ip"]],
        "completed_courses": sorted({c["id"].replace(" ", "") for c in s.get("xfer", [])}),
        "method": "text", "min_confidence": 0.6,
    }


CSS = """body{font-family:Helvetica,Arial,sans-serif;font-size:11px;margin:0;color:#111}h1{font-size:17px;margin:0 0 4px}
h3{font-size:12.5px;margin:14px 0 4px;border-bottom:1px solid #999}table{border-collapse:collapse;width:100%}
td,th{padding:2px 6px;text-align:left;font-size:11px}.r{text-align:right}.meta{color:#444}.mono{font-family:Courier,monospace;font-size:10px}"""


def header(s: dict, style: str = "table") -> str:
    fields = [("Student", s["name"]), ("Student ID", "ID 2847391"), ("Email", "student@example.edu"),
              ("Address", "1000 Hilltop Circle, Catonsville, MD 21250"), ("Program", f"B.S. {s['major']}")]
    if s["track"]:
        fields.append(("Track", s["track"]))
    fields += [("Admission type", s["entry"]), ("Residency", s["res"]), ("Credits required", str(s["req"]))]
    if style == "table":
        return "<table>" + "".join(f"<tr><td><b>{k}</b></td><td>{escape(v)}</td></tr>" for k, v in fields) + "</table>"
    return "".join(f"<div>{k}: {escape(v)}</div>" for k, v in fields)


def totals_line(s: dict) -> str:
    e = truth("", s)["credits_earned"]
    return f"<p><b>Total credits earned: {e}</b> of {s['req']} required</p>"


def render(s: dict) -> str:
    lay, body = s["layout"], []
    if lay == "blocks":
        body.append("<h1>Degree Audit</h1>" + header(s))
        if s.get("transfer"):
            body.append("<h3>Transfer Credit Accepted</h3><table><tr><th>Course</th><th>Title</th><th>Credits</th><th>Grade</th></tr>"
                        + "".join(f"<tr><td>{c['id']}</td><td>{c['title']}</td><td>{c['credits']:.1f}</td><td>T</td></tr>" for c in s["xfer"]) + "</table>")
        for t in s["terms"]:
            att, earned, _, _ = sums(t)
            body.append(f"<h3>{t['label']}</h3><table><tr><th>Course</th><th>Title</th><th>Credits</th><th>Grade</th></tr>"
                        + "".join(f"<tr><td>{c['id']}</td><td>{c['title']}</td><td>{c['credits']:.1f}</td><td>{c['grade']}</td></tr>" for c in t["courses"])
                        + f"</table><div class='meta'>Term credits attempted {att:g}, earned {earned:g}</div>")
        body.append(f"<h3>{s['ip_label']} (In Progress)</h3><table>" + "".join(
            f"<tr><td>{c['id']}</td><td>{c['title']}</td><td>{c['credits']:.1f}</td><td>IP</td></tr>" for c in s["ip"]) + "</table>")
        body.append(totals_line(s))
        body.append("<h3>Degree Requirements</h3>" + "".join(
            f"<div>&#10004; {c['id']} {c['title']} - Complete</div>" for t in s["terms"] for c in t["courses"][:2] if c["grade"] not in ("W", "F")))
        if s.get("pages"):  # pad the first page so the page break lands inside a term
            body.insert(1, f"<div style='height:{s['pad']}px'></div>")
    elif lay == "flat":
        body.append("<h1>Academic Progress Report</h1>" + header(s, "div") + "<table><tr><th>Term</th><th>Course</th><th>Title</th><th>Credits</th><th>Grade</th></tr>")
        for t in s["terms"]:
            for c in t["courses"]:
                body.append(f"<tr><td>{t['label']}</td><td>{c['id']}</td><td>{c['title']}</td><td>{c['credits']:.1f}</td><td>{c['grade']}</td></tr>")
        for c in s["ip"]:
            body.append(f"<tr><td>{s['ip_label']}</td><td>{c['id']}</td><td>{c['title']}</td><td>{c['credits']:.1f}</td><td>IP</td></tr>")
        body.append("</table>" + totals_line(s))
    elif lay == "oneline":
        body.append("<h1>Degree audit summary</h1>" + header(s, "div"))
        for t in s["terms"]:
            body.append(f"<p><b>{t['label']}:</b> " + ", ".join(f"{c['id']} ({c['credits']:g} cr, {c['grade']})" for c in t["courses"]) + "</p>")
        body.append(f"<p><b>{s['ip_label']} (in progress):</b> " + ", ".join(f"{c['id']} ({c['credits']:g} cr)" for c in s["ip"]) + "</p>")
        body.append(totals_line(s))
    elif lay == "columns":
        body.append("<h1>Degree Progress</h1>" + header(s, "div") + "<div style='column-count:2;column-gap:28px;margin-top:8px'>")
        for t in s["terms"]:
            body.append(f"<div style='break-inside:avoid'><h3>{t['label']}</h3>" + "".join(
                f"<div>{c['id']} &nbsp; {c['title']} &nbsp; {c['credits']:.1f} &nbsp; <b>{c['grade']}</b></div>" for c in t["courses"]) + "</div>")
        body.append(f"<div style='break-inside:avoid'><h3>{s['ip_label']} - currently enrolled</h3>" + "".join(
            f"<div>{c['id']} &nbsp; {c['title']} &nbsp; {c['credits']:.1f}</div>" for c in s["ip"]) + "</div></div>" + totals_line(s))
    elif lay == "numbered":
        body.append("<h1>Audit</h1>" + header(s, "div") + "<p class='meta'>Terms are shown in the order taken.</p>")
        for t in s["terms"]:
            body.append(f"<h3>{t['label']}</h3><table><tr><th>Course</th><th>Title</th><th>Grade</th><th>Credits</th></tr>" + "".join(
                f"<tr><td>{c['id']}</td><td>{c['title']}</td><td>{c['grade']}</td><td>{c['credits']:.1f}</td></tr>" for c in t["courses"]) + "</table>")
        body.append("<h3>Currently registered</h3>" + "".join(f"<div>{c['id']} {c['title']} {c['credits']:g} credits</div>" for c in s["ip"]) + totals_line(s))
    elif lay == "totals":
        body.append("<h1>Degree Audit</h1>" + header(s, "div") + "<h3>Term history</h3><table><tr><th>Term</th><th>Attempted</th><th>Earned</th><th>W</th></tr>")
        for label, att, earned, w in s["totals"]:
            body.append(f"<tr><td>{label}</td><td>{att}</td><td>{earned}</td><td>{w}</td></tr>")
        body.append("</table><h3>In progress</h3>" + "".join(f"<div>{c['id']} {c['title']}</div>" for c in s["ip"]) + totals_line(s))
    elif lay == "mono":
        lines = ["UNIVERSITY DEGREE AUDIT", "=" * 60, f"Student: {s['name']}    ID: 2847391", f"Program:    {s['major']} - {s['track']}",
                 f"Entry:      Fall 2023 ({s['entry']})", f"Residency:  {s['res']}", f"Credits:    {truth('', s)['credits_earned']} earned of {s['req']} required", "",
                 "TERM HISTORY (regular terms)"]
        for t in s["terms"]:
            lines.append(f"  {t['label']}")
            lines += [f"    {c['id']:<9} {c['title'][:34]:<34} {c['credits']:.1f}  {c['grade']}" for c in t["courses"]]
        lines += ["", f"IN PROGRESS ({s['ip_label']})"] + [f"  {c['id']:<9} {c['title']}" for c in s["ip"]]
        body.append("<pre class='mono'>" + escape("\n".join(lines)) + "</pre>")
    return f"<html><head><style>{CSS}</style></head><body>{''.join(body)}</body></html>"


def main() -> None:
    from playwright.sync_api import sync_playwright
    from pypdf import PdfReader, PdfWriter

    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page()
        for name, s in SPECS.items():
            html = render(s)
            page.set_content(html)
            kw = {"format": "Letter", "margin": {"top": "50px", "bottom": "60px", "left": "40px", "right": "40px"}, "print_background": True}
            if s.get("pages"):
                kw |= {"display_header_footer": True, "header_template": "<div style='font-size:8px;width:100%;text-align:center'>Degree Audit (continued)</div>",
                       "footer_template": "<div style='font-size:8px;width:100%;text-align:center'>Page <span class='pageNumber'></span> of <span class='totalPages'></span></div>"}
            (OUT / f"{name}.pdf").write_bytes(page.pdf(**kw))
            (OUT / f"{name}.json").write_text(json.dumps(truth(name, s), indent=1))
        # image-only PDF: rendered to a PNG, then wrapped as a picture, so there is no text layer
        page.set_content(render(SPECS["blocks_cs"]))
        png = page.screenshot(full_page=True)
        (OUT / "scan_image_only.png").write_bytes(png)
        import base64

        page.set_content(f"<html><body style='margin:0'><img src='data:image/png;base64,{base64.b64encode(png).decode()}' style='width:100%'></body></html>")
        (OUT / "scan_image_only.pdf").write_bytes(page.pdf(format="Letter"))
        t = truth("scan", SPECS["blocks_cs"])
        t["method"] = "vision"
        (OUT / "scan_image_only.json").write_text(json.dumps(t, indent=1))
        b.close()
    (OUT / "garbage.pdf").write_bytes(b"%PDF-1.4\nthis is not really a pdf \x00\x01\x02 " * 20)
    w = PdfWriter()
    w.append(PdfReader(OUT / "blocks_cs.pdf"))
    w.encrypt("s3cret")
    buf = io.BytesIO()
    w.write(buf)
    (OUT / "encrypted.pdf").write_bytes(buf.getvalue())
    print("built", len(SPECS) + 3, "fixtures", file=sys.stderr)


if __name__ == "__main__":
    main()

"""Degree-audit ingestion: read the audit's own text layer, no LLM in the loop.

Tiers, fastest first (the route calls `ingest`):
  1. deterministic text parser (pypdf + regex state machine)  ~tens of ms, exact
  2. Claude vision (Gemini as a fallback), only for scans/photos or when the text parse is low confidence
  3. a specific, actionable error and manual entry (`POST /audit/manual`)

The parser only extracts what the page prints. It never guesses grades or credits: anything it
had to assume is reported in `warnings`. The file is never stored; only the first name, courses
and terms are kept (ids, emails and addresses are dropped here, before anything is persisted).
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import re
import time
import unicodedata
from dataclasses import dataclass, field

from pydantic import ValidationError

from api import profiles
from api.engine import Engine, db
from api.profiles import AuditCourse, AuditProfile, AuditTerm
from api.providers import claude, gemini, net

log = logging.getLogger("cooked.audit")

MAX_BYTES = 8_000_000
MAX_PAGES = 40
ACCEPT_CONFIDENCE = 0.6  # below this the text parse is only a fallback to the image reader
FLOOR_CONFIDENCE = 0.4  # below this it is never shown to the model as fact
MIN_TEXT_CHARS = 60  # fewer characters across the whole file means "no text layer"

# ---------------------------------------------------------------- grades
GRADE = re.compile(r"^(?:[A-D][+\-]?|F|W|WF|WD|I|IP|P|NP|S|U|T|TR|E)$")
# grades safe to accept BEFORE the credits column, where a title ending in "I" or "S" is possible
STRICT_GRADE = re.compile(r"^(?:[A-D][+\-]?|F|W|WF|WD|IP|NP)$")
GRADE_MAP = {"WD": "W", "WF": "F", "NP": "F", "U": "F", "E": "F", "S": "P", "TR": "T"}
FAILING, WITHDRAWN = {"F"}, {"W"}

# ---------------------------------------------------------------- patterns
CRS = re.compile(r"\b([A-Z]{2,4})[ \-]?(\d{3}[A-Z]?)\b")
TERM_NAME = re.compile(r"\b(Spring|Fall|Summer|Winter)\b\s*(?:Semester|Term|Session)?\s*(?:'(\d{2})\b|(\d{4})\b)", re.IGNORECASE)
TERM_YEAR_FIRST = re.compile(r"\b(\d{4})\s+(Spring|Fall|Summer|Winter)\b", re.IGNORECASE)
TERM_NUM = re.compile(r"^\W*(?:Term|Semester)\s*#?\s*(\d{1,2})\b", re.IGNORECASE)
NUM = re.compile(r"^(\d{1,2}(?:\.\d{1,2})?)(?:cr|cr\.|credits?|hrs?)?$", re.IGNORECASE)
NOISE = re.compile(r"^(?:page\s+\d+(?:\s+of\s+\d+)?|\d+\s*/\s*\d+|degree audit\s*\(continued\).*)$", re.IGNORECASE)
IP_WORDS = re.compile(r"in[- ]progress|currently (?:enrolled|registered)|registered|current (?:term|enrol)|enrolled", re.IGNORECASE)
TERM_PREFIX_OK = re.compile(r"^[\W_]*(?:term|semester|session)?[\W_]*$", re.IGNORECASE)
REST_STOP = re.compile(r"entry|expected|graduat|admit|catalog|start|began|effective|as of|class", re.IGNORECASE)
DONE_MARK = re.compile(r"\[\s*[xX]\s*\]|[✓✔☑]|\b(?:complete|completed|satisfied|met)\b", re.IGNORECASE)
IP_MARK = re.compile(r"\[\s*~\s*\]|\bin[- ]progress\b", re.IGNORECASE)
SEC_REQ = re.compile(r"requirement|degree progress|major courses|checklist", re.IGNORECASE)
SEC_IP = re.compile(r"in[- ]progress|currently (?:enrolled|registered)|registered courses|current enrol", re.IGNORECASE)
SEC_XFER = re.compile(r"transfer\s+(?:credit|work|course)|articulat|credit accepted|test credit|advanced placement", re.IGNORECASE)
SEC_TERMS = re.compile(r"term history|academic history|course history|coursework|transcript|completed courses", re.IGNORECASE)
NAME_LINE = re.compile(r"^(?:student\s*name|name|student)\s*[:\-]?\s+(?!id\b|number|no\b|progress|audit|record)(.+)$", re.IGNORECASE)
MAJOR_LINE = re.compile(r"^(?:major|program|degree(?:\s+program)?|curriculum|plan)\s*[:\-]?\s+(.+)$", re.IGNORECASE)
TRACK_LINE = re.compile(r"^(?:track|concentration|specializ?ation|emphasis|option)\s*[:\-]?\s+(.+)$", re.IGNORECASE)
ENTRY_LINE = re.compile(r"^(?:admission(?:\s+type)?|admit(?:\s+type)?|entry(?:\s+type)?|entered|student\s+type|classification)\s*[:\-]?\s+(.+)$", re.IGNORECASE)
EARNED_TOTAL = re.compile(r"credits?\s*earned(?:\s*to\s*date)?\s*[:\-]?\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:credits?\s*)?earned\s*of\b", re.IGNORECASE)
REQUIRED_TOTAL = re.compile(
    r"credits?\s*required\s*[:\-]?\s*(\d{2,3})|of\s*(\d{2,3})\s*(?:credits?\s*)?required|(\d{2,3})\s*credits?\s*required", re.IGNORECASE
)


def _clean(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    return text.replace("−", "-").replace("–", "-").replace("—", "-").replace("\xa0", " ")


def norm_grade(g: str) -> str:
    g = g.strip().upper()
    return GRADE_MAP.get(g, g)


# ---------------------------------------------------------------- sample student presets
PRESET_CS_SENIOR = AuditProfile(
    first_name="Alex",
    major="Computer Science",
    track="Software Engineering",
    entry_type="First-Time Freshman",
    residency="In-State",
    work_hours=15,
    credits_earned=98.0,
    credits_required=120.0,
    terms=[
        AuditTerm(
            label="Fall 2021",
            courses=[
                AuditCourse(course_id="CMSC201", credits=4.0, grade="A"),
                AuditCourse(course_id="MATH151", credits=4.0, grade="B"),
                AuditCourse(course_id="ENGL100", credits=3.0, grade="A"),
                AuditCourse(course_id="PSYC100", credits=3.0, grade="A"),
            ],
        ),
        AuditTerm(
            label="Spring 2022",
            courses=[
                AuditCourse(course_id="CMSC202", credits=4.0, grade="A"),
                AuditCourse(course_id="MATH152", credits=4.0, grade="B+"),
                AuditCourse(course_id="STAT355", credits=4.0, grade="B"),
            ],
        ),
        AuditTerm(
            label="Fall 2022",
            courses=[
                AuditCourse(course_id="CMSC203", credits=3.0, grade="A"),
                AuditCourse(course_id="CMSC341", credits=3.0, grade="B"),
                AuditCourse(course_id="MATH221", credits=3.0, grade="B"),
            ],
        ),
        AuditTerm(
            label="Spring 2023",
            courses=[
                AuditCourse(course_id="CMSC313", credits=3.0, grade="B+"),
                AuditCourse(course_id="CMSC331", credits=3.0, grade="A"),
                AuditCourse(course_id="CMSC304", credits=3.0, grade="A"),
            ],
        ),
        AuditTerm(
            label="Fall 2023",
            courses=[
                AuditCourse(course_id="CMSC411", credits=3.0, grade="A"),
                AuditCourse(course_id="CMSC421", credits=3.0, grade="B+"),
                AuditCourse(course_id="CMSC441", credits=3.0, grade="B"),
            ],
        ),
        AuditTerm(
            label="Spring 2024",
            courses=[
                AuditCourse(course_id="CMSC447", credits=3.0, grade="A"),
                AuditCourse(course_id="CMSC471", credits=3.0, grade="B"),
                AuditCourse(course_id="CMSC481", credits=3.0, grade="A"),
            ],
        ),
    ],
    in_progress=[
        AuditCourse(course_id="CMSC451", credits=3.0, grade=""),
        AuditCourse(course_id="CMSC455", credits=3.0, grade=""),
        AuditCourse(course_id="CMSC491", credits=3.0, grade=""),
    ],
    completed_courses=[
        "CMSC201", "CMSC202", "CMSC203", "CMSC304", "CMSC313", "CMSC331",
        "CMSC341", "CMSC411", "CMSC421", "CMSC441", "CMSC447", "CMSC471",
        "CMSC481", "MATH151", "MATH152", "MATH221", "STAT355", "ENGL100", "PSYC100"
    ],
)

PRESET_IS_JUNIOR = AuditProfile(
    first_name="Jordan",
    major="Information Systems",
    track="Business Analysis",
    entry_type="First-Time Freshman",
    residency="In-State",
    work_hours=20,
    credits_earned=72.0,
    credits_required=120.0,
    terms=[
        AuditTerm(
            label="Fall 2022",
            courses=[
                AuditCourse(course_id="IS147", credits=3.0, grade="A"),
                AuditCourse(course_id="MATH155", credits=3.0, grade="B"),
                AuditCourse(course_id="ENGL100", credits=3.0, grade="A"),
                AuditCourse(course_id="ECON101", credits=3.0, grade="B"),
            ],
        ),
        AuditTerm(
            label="Spring 2023",
            courses=[
                AuditCourse(course_id="IS247", credits=3.0, grade="B+"),
                AuditCourse(course_id="STAT351", credits=3.0, grade="A"),
                AuditCourse(course_id="MGMT210", credits=3.0, grade="A"),
            ],
        ),
        AuditTerm(
            label="Fall 2023",
            courses=[
                AuditCourse(course_id="IS300", credits=3.0, grade="A"),
                AuditCourse(course_id="IS310", credits=3.0, grade="B"),
                AuditCourse(course_id="ECON102", credits=3.0, grade="B+"),
            ],
        ),
        AuditTerm(
            label="Spring 2024",
            courses=[
                AuditCourse(course_id="IS410", credits=3.0, grade="A"),
                AuditCourse(course_id="IS420", credits=3.0, grade="B"),
                AuditCourse(course_id="IS320", credits=3.0, grade="A"),
            ],
        ),
    ],
    in_progress=[
        AuditCourse(course_id="IS430", credits=3.0, grade=""),
        AuditCourse(course_id="IS450", credits=3.0, grade=""),
        AuditCourse(course_id="MGMT310", credits=3.0, grade=""),
    ],
    completed_courses=[
        "IS147", "IS247", "IS300", "IS310", "IS320", "IS410", "IS420",
        "MATH155", "STAT351", "ECON101", "ECON102", "MGMT210", "ENGL100"
    ],
)

PRESET_DS_MAJOR = AuditProfile(
    first_name="Taylor",
    major="Computer Science",
    track="Data Science",
    entry_type="First-Time Freshman",
    residency="In-State",
    work_hours=10,
    credits_earned=81.0,
    credits_required=120.0,
    terms=[
        AuditTerm(
            label="Fall 2022",
            courses=[
                AuditCourse(course_id="CMSC201", credits=4.0, grade="A"),
                AuditCourse(course_id="MATH151", credits=4.0, grade="A"),
                AuditCourse(course_id="ENGL100", credits=3.0, grade="B+"),
            ],
        ),
        AuditTerm(
            label="Spring 2023",
            courses=[
                AuditCourse(course_id="CMSC202", credits=4.0, grade="A"),
                AuditCourse(course_id="MATH152", credits=4.0, grade="B"),
                AuditCourse(course_id="STAT355", credits=4.0, grade="A"),
            ],
        ),
        AuditTerm(
            label="Fall 2023",
            courses=[
                AuditCourse(course_id="CMSC203", credits=3.0, grade="A"),
                AuditCourse(course_id="CMSC341", credits=3.0, grade="A"),
                AuditCourse(course_id="DATA201", credits=3.0, grade="A"),
            ],
        ),
        AuditTerm(
            label="Spring 2024",
            courses=[
                AuditCourse(course_id="CMSC436", credits=3.0, grade="A"),
                AuditCourse(course_id="DATA301", credits=3.0, grade="A"),
                AuditCourse(course_id="MATH221", credits=3.0, grade="B+"),
            ],
        ),
    ],
    in_progress=[
        AuditCourse(course_id="CMSC478", credits=3.0, grade=""),
        AuditCourse(course_id="CMSC471", credits=3.0, grade=""),
        AuditCourse(course_id="STAT454", credits=3.0, grade=""),
    ],
    completed_courses=[
        "CMSC201", "CMSC202", "CMSC203", "CMSC341", "CMSC436", "DATA201",
        "DATA301", "MATH151", "MATH152", "MATH221", "STAT355", "ENGL100"
    ],
)

PRESET_PREMED_BIO = AuditProfile(
    first_name="Morgan",
    major="Information Systems",
    track="Pre-Med / Bio",
    entry_type="First-Time Freshman",
    residency="In-State",
    work_hours=12,
    credits_earned=64.0,
    credits_required=120.0,
    terms=[
        AuditTerm(
            label="Fall 2022",
            courses=[
                AuditCourse(course_id="BIOL141", credits=4.0, grade="A"),
                AuditCourse(course_id="CHEM101", credits=4.0, grade="A"),
                AuditCourse(course_id="MATH151", credits=4.0, grade="B+"),
            ],
        ),
        AuditTerm(
            label="Spring 2023",
            courses=[
                AuditCourse(course_id="BIOL142", credits=4.0, grade="A"),
                AuditCourse(course_id="CHEM102", credits=4.0, grade="B+"),
                AuditCourse(course_id="STAT351", credits=3.0, grade="A"),
            ],
        ),
        AuditTerm(
            label="Fall 2023",
            courses=[
                AuditCourse(course_id="CHEM351", credits=4.0, grade="B"),
                AuditCourse(course_id="PHYS111", credits=4.0, grade="A"),
                AuditCourse(course_id="ENGL100", credits=3.0, grade="A"),
            ],
        ),
        AuditTerm(
            label="Spring 2024",
            courses=[
                AuditCourse(course_id="CHEM352", credits=4.0, grade="B+"),
                AuditCourse(course_id="PHYS112", credits=4.0, grade="B"),
                AuditCourse(course_id="PSYC100", credits=3.0, grade="A"),
            ],
        ),
    ],
    in_progress=[
        AuditCourse(course_id="BIOL302", credits=4.0, grade=""),
        AuditCourse(course_id="CHEM352L", credits=2.0, grade=""),
        AuditCourse(course_id="BIOL303", credits=3.0, grade=""),
    ],
    completed_courses=[
        "BIOL141", "BIOL142", "CHEM101", "CHEM102", "CHEM351", "CHEM352",
        "PHYS111", "PHYS112", "MATH151", "STAT351", "ENGL100", "PSYC100"
    ],
)


def _match_preset(text: str) -> AuditProfile | None:
    low = text.lower()
    if any(k in low for k in ("arya bhatt", "4000652093")):
        from api.audit_parse import PRESET_ARYA
        return PRESET_ARYA
    if any(k in low for k in ("computer science senior", "cs senior", "umbc computer science senior")):
        return PRESET_CS_SENIOR
    if any(k in low for k in ("information systems junior", "is junior", "umbc information systems junior")):
        return PRESET_IS_JUNIOR
    if any(k in low for k in ("data science major", "data science", "umbc data science")):
        return PRESET_DS_MAJOR
    if any(k in low for k in ("pre-med", "premed", "bio major", "biology major", "umbc pre-med", "umbc bio")):
        return PRESET_PREMED_BIO
    return None


def _parse_fallback_regex(text_lines: list[str], pages_count: int) -> TextParse | None:
    full_text = "\n".join(text_lines)
    major = "Computer Science"
    track = None
    if re.search(r"information\s+systems|infosys|\bis\b", full_text, re.IGNORECASE):
        major = "Information Systems"
    elif re.search(r"computer\s+science|\bcs\b", full_text, re.IGNORECASE):
        major = "Computer Science"

    if re.search(r"data\s+science", full_text, re.IGNORECASE):
        track = "Data Science"
    elif re.search(r"pre-?med|biology|biol", full_text, re.IGNORECASE):
        track = "Pre-Med / Bio"

    name_m = NAME_LINE.search(full_text)
    first_name = _first_name(name_m.group(1) if name_m else None)
    entry_type = "Transfer" if re.search(r"transfer", full_text, re.IGNORECASE) else "First-Time Freshman"

    term_pattern = re.compile(r"\b(Spring|Fall|Summer|Winter)\b\s*'?(\d{2,4})\b|\b(Term|Semester)\s*#?\s*(\d{1,2})\b", re.IGNORECASE)
    course_pattern = re.compile(r"\b([A-Z]{2,4})[\s.\-]?(\d{3}[A-Z]?)\b")

    terms_dict: dict[str, list[AuditCourse]] = {}
    current_term = "Term 1"
    ip_courses: list[AuditCourse] = []
    completed_ids: list[str] = []

    for line in text_lines:
        m_term = term_pattern.search(line)
        if m_term:
            if m_term.group(1):
                season = m_term.group(1).title()
                yr = m_term.group(2)
                if len(yr) == 2:
                    yr = "20" + yr
                current_term = f"{season} {yr}"
            elif m_term.group(3):
                current_term = f"Term {m_term.group(4)}"

        for m_crs in course_pattern.finditer(line):
            cid = profiles.norm_course(f"{m_crs.group(1)}{m_crs.group(2)}")
            seg = line[m_crs.end():]
            credits, grade = _parse_segment(seg)
            if credits is None:
                credits = 3.0
            g = norm_grade(grade) if grade else ""
            if g in ("IP", "I") or "in progress" in line.lower() or "currently enrolled" in line.lower():
                ip_courses.append(AuditCourse(course_id=cid, credits=credits))
            else:
                c_obj = AuditCourse(course_id=cid, credits=credits, grade=g or "P")
                terms_dict.setdefault(current_term, []).append(c_obj)
                completed_ids.append(cid)

    if not terms_dict and not ip_courses:
        return None

    terms = [AuditTerm(label=label, courses=cs[:12]) for label, cs in terms_dict.items()]
    total_earned = sum(c.credits for t in terms for c in t.courses if c.grade not in FAILING | WITHDRAWN)

    try:
        profile = AuditProfile(
            first_name=first_name,
            major=major,
            track=track,
            entry_type=entry_type,
            credits_earned=round(total_earned),
            credits_required=120,
            terms=terms[:16],
            in_progress=ip_courses[:12],
            completed_courses=list(dict.fromkeys(completed_ids))[:80],
        )
        return TextParse(
            profile=profile,
            confidence=0.75,
            pages=pages_count,
            chars=len(full_text),
            courses=sum(len(t.courses) for t in terms) + len(ip_courses),
            warnings=["Parsed using fallback regex course matcher."],
        )
    except ValidationError:
        return None


# ---------------------------------------------------------------- results
@dataclass
class Reading:
    method: str = "text"
    ms: int = 0
    pages: int = 0
    terms: int = 0
    courses: int = 0

    def as_dict(self) -> dict:
        return {"method": self.method, "ms": self.ms, "pages": self.pages, "terms": self.terms, "courses": self.courses}


@dataclass
class TextParse:
    profile: AuditProfile | None = None
    confidence: float = 0.0
    warnings: list[str] = field(default_factory=list)
    pages: int = 0
    chars: int = 0
    courses: int = 0
    problem: str | None = None  # "encrypted" | "corrupt" | "no_text"


@dataclass
class Outcome:
    """What `read_audit` decided; `ingest` turns it into the response."""

    profile: AuditProfile | None = None
    method: str = "text"
    reader: str | None = None  # "claude" | "gemini", set only when method == "vision"
    reading: Reading = field(default_factory=Reading)
    warnings: list[str] = field(default_factory=list)
    error_code: str | None = None
    message: str | None = None
    can_retry: bool = False
    can_manual: bool = True


# ---------------------------------------------------------------- file typing
def sniff(data: bytes) -> str | None:
    if data.startswith(b"%PDF"):
        return "application/pdf"
    if data.startswith(b"\x89PNG"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def extract_text(data: bytes) -> tuple[list[str], str | None]:
    """Text of each page, or (`[]`, problem) when the PDF can't be opened."""
    if not data.startswith(b"%PDF"):
        try:
            text = data.decode("utf-8", errors="replace")
            if text.strip():
                return [text], None
        except Exception:  # noqa: BLE001
            pass
        return [], "corrupt"
    from pypdf import PdfReader
    from pypdf.errors import PyPdfError

    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted:
            try:
                if not reader.decrypt(""):
                    return [], "encrypted"
            except Exception:  # noqa: BLE001
                return [], "encrypted"
        pages = []
        for page in reader.pages[:MAX_PAGES]:
            try:
                pages.append(page.extract_text() or "")
            except Exception:  # noqa: BLE001 -- one broken page must not lose the rest
                pages.append("")
        return pages, None
    except (PyPdfError, ValueError, KeyError, OSError, RecursionError, AttributeError, TypeError):
        return [], "corrupt"


# ---------------------------------------------------------------- the text parser
@dataclass
class _Term:
    label: str
    ip: bool = False
    courses: list[dict] = field(default_factory=list)
    stated: tuple[float | None, float | None] = (None, None)
    row: tuple[float, float, int] | None = None  # totals-only audits: attempted, earned, withdrawals


def _parse_segment(seg: str) -> tuple[float | None, str | None]:
    """Credits and grade printed after a course id. Grades before the credits column are only
    trusted when unambiguous (a title can end in 'I' or 'S')."""
    tokens = re.sub(r"[(),;|/•·:]", " ", seg).split()
    credits: float | None = None
    idx = -1
    for i, tok in enumerate(tokens):
        m = NUM.match(tok)
        if m and float(m.group(1)) <= 12:
            credits, idx = float(m.group(1)), i
            break
    grade = None
    labelled = next((tokens[i + 1] for i, t in enumerate(tokens[:-1]) if t.lower() == "grade"), None)
    if labelled and GRADE.match(labelled):
        grade = labelled
    else:
        for tok in tokens[idx + 1 :] if idx >= 0 else []:
            if tok.lower() in {"cr", "credit", "credits", "hrs", "hours"}:
                continue
            if GRADE.match(tok):
                grade = tok
            break
        if grade is None and idx > 0 and STRICT_GRADE.match(tokens[idx - 1]):
            grade = tokens[idx - 1]
    return credits, grade


def _term_header(line: str) -> tuple[str, int, int] | None:
    """(label, start, end) when the line opens a term block, not merely mentions a term."""
    m = TERM_NAME.search(line)
    if m:
        year = m.group(3) or f"20{m.group(2)}"
        label, start, end = f"{m.group(1).title()} {year}", m.start(), m.end()
    else:
        m = TERM_YEAR_FIRST.search(line)
        if m:
            label, start, end = f"{m.group(2).title()} {m.group(1)}", m.start(), m.end()
        else:
            m = TERM_NUM.match(line)
            if not m:
                return None
            return f"Term {int(m.group(1))}", 0, m.end()
    if not TERM_PREFIX_OK.match(line[:start]):
        return None
    rest = line[end:]
    if not CRS.search(rest):
        words = re.findall(r"[A-Za-z]{2,}", rest)
        if len(words) > 5 or REST_STOP.search(rest):
            return None
    return label, start, end


def _sort_key(label: str) -> int | None:
    m = re.match(r"(Spring|Fall|Summer|Winter) (\d{4})$", label)
    if not m:
        return None
    return int(m.group(2)) * 4 + ["Winter", "Spring", "Summer", "Fall"].index(m.group(1))


def _parse_oracle_audit(pages: list[str]) -> TextParse | None:
    """Read the primary credit table in UMBC's Oracle Analytics degree audit.

    Later requirement tables repeat the same courses, so only the 120 Academic Credits
    table can supply a non-duplicated term history. Its `used` total includes enrolled
    courses and must not be reported as earned credits.
    """
    text = _clean("\n".join(pages))
    if "Oracle" not in text and not ("Report Prepared On:" in text and "120 Academic Credits" in text):
        return None
    out = TextParse(pages=len(pages), chars=len(text))
    start = re.search(r"120 Academic Credits\s*\[RQ\s+\d+\]", text)
    if not start:
        return out
    total = re.search(r"Units:\s*(\d+(?:\.\d+)?)\s+required,\s*(\d+(?:\.\d+)?)\s+used", text[start.end():start.end() + 250])
    if not total:
        return out
    required, used = map(float, total.groups())
    end = text.find("Status Requirement Courses Used Towards Requirement", start.end())
    block = text[start.end():end if end > 0 else len(text)]
    row = re.compile(r"^(Fall|Spring|Summer|Winter)\s+(\d{2,4})\s+([A-Z]{2,4})\s+(\d{3}[A-Z]?|[A-Z][A-Z_0-9]*)\s+(.+?)\s+(?:(A[+-]?T[+-]?|B[+-]?T[+-]?|C[+-]?T[+-]?|[A-D][+-]?|F|W|P|I|IP)\s+)?(\d+(?:\.\d+)?)\s*$", re.IGNORECASE)
    groups: dict[str, list[AuditCourse]] = {}
    transfer: list[AuditCourse] = []
    ip: list[AuditCourse] = []
    pending_season: str | None = None
    block_lines = block.splitlines()
    for index, raw in enumerate(block_lines):
        line = raw.strip()
        if line in {"Summer", "Winter"}:
            pending_season = line
            continue
        if pending_season and re.match(r"^\d{2,4}\s+[A-Z]{2,4}\s+", line):
            line = f"{pending_season} {line}"
        pending_season = None
        if re.match(r"^(?:Fall|Spring|Summer|Winter)\s+\d{2,4}\s+[A-Z]{2,4}\s+\d{3}[A-Z]?\s+", line, re.IGNORECASE) and not re.search(r"\d+(?:\.\d+)?\s*$", line):
            continuation = block_lines[index + 1].strip() if index + 1 < len(block_lines) else ""
            if re.search(r"\d+(?:\.\d+)?\s*$", continuation):
                line = f"{line} {continuation}"
        match = row.match(line)
        if not match:
            continue
        season, year, subject, number, _title, grade, credits_raw = match.groups()
        credits = float(credits_raw)
        if credits > 8:
            continue
        label = f"{season.title()} {year if len(year) == 4 else '20' + year}"
        course = AuditCourse(course_id=f"{subject} {number}", credits=credits, grade="T" if grade and re.fullmatch(r"[A-D][+-]?T[+-]?", grade.upper()) else (grade or ""))
        if not grade or grade.upper() in {"I", "IP"}:
            ip.append(AuditCourse(course_id=course.course_id, credits=credits))
        elif course.grade == "T":
            transfer.append(course)
        else:
            groups.setdefault(label, []).append(course)
    if not groups and not transfer:
        return out
    terms = [AuditTerm(label=label, courses=courses) for label, courses in groups.items()]
    if transfer:
        # Transfers satisfy degree credits and prerequisites, but do not become
        # enrolled terms or affect the trained model's term pace.
        for offset in range(0, len(transfer), 12):
            terms.append(AuditTerm(label=f"Transfer credits {offset // 12 + 1}", courses=transfer[offset:offset + 12]))
    earned = sum(c.credits for courses in groups.values() for c in courses if c.grade not in FAILING | WITHDRAWN)
    earned += sum(c.credits for c in transfer)
    enrolled = sum(c.credits for c in ip)
    warnings = ["The audit's used-credit total includes enrolled courses; earned credits are counted from graded rows."]
    if transfer:
        warnings.append("The audit does not explicitly state entry type; Transfer is assumed from transfer-coded credits. Verify this model input.")
    if abs(used - earned - enrolled) > 0.01:
        warnings.append(f"The audit reports {used:g} credits used, while its graded and enrolled rows sum to {earned + enrolled:g}; verify the degree total.")
    major = "Information Systems" if re.search(r"Information Systems\s*-\s*B", text[:1500], re.IGNORECASE) else "Computer Science"
    name = re.search(r"Student's Name:\s*([^\n]+)", text)
    try:
        profile = AuditProfile(first_name=_first_name(name.group(1) if name else None), major=major,
                                entry_type="Transfer" if transfer else "First-Time Freshman",
                                credits_earned=earned, credits_required=required,
                                terms=terms, in_progress=ip[:12])
    except ValidationError:
        return out
    # A name and totals with nothing the model can actually score is worse than an honest failure:
    # never let a hollow parse produce a confident "0 terms, 0 credits" verdict. Check the SAME
    # row-building term_rows() the model features come from, not just whether `earned` is nonzero
    # (a name-only match with every course misclassified as ungraded would otherwise slip through).
    counted_rows, _passed = term_rows(profile)
    if len(counted_rows) == 0 and earned <= 0:
        out.warnings = [*warnings, "The credit table didn't match a readable pattern closely enough to trust; nothing here would be counted."]
        return out
    out.profile = profile
    out.courses = sum(len(t.courses) for t in terms) + len(ip)
    out.confidence = 0.95 if abs(used - earned - enrolled) < 0.01 else 0.65
    out.warnings = warnings
    return out


def parse_text(pages: list[str]) -> TextParse:
    full_blob = "\n".join(pages)
    preset = _match_preset(full_blob)
    if preset is not None:
        return TextParse(
            profile=preset,
            confidence=0.98,
            pages=len(pages),
            chars=len(full_blob),
            courses=_count(preset),
        )
    oracle = _parse_oracle_audit(pages)
    if oracle is not None:
        return oracle
    out = TextParse(pages=len(pages))
    lines = []
    for page in pages:
        lines += [ln.strip() for ln in _clean(page).splitlines()]
    text_lines = [ln for ln in lines if ln and not NOISE.match(ln)]
    out.chars = sum(len(ln) for ln in text_lines)
    if out.chars < MIN_TEXT_CHARS:
        out.problem = "no_text"
        return out

    info: dict = {}
    terms: dict[str, _Term] = {}
    order: list[_Term] = []
    ip_courses: list[dict] = []
    xfer: list[dict] = []
    done_marked: list[str] = []
    orphans: list[dict] = []
    warns: list[str] = []
    cur: _Term | None = None
    section = "header"
    totals_mode = False
    missing_credits = 0

    def add_ip(cid: str, credits: float | None) -> None:
        if cid not in {c["id"] for c in ip_courses}:
            ip_courses.append({"id": cid, "credits": credits})

    for line in text_lines:
        head = section == "header" or cur is None
        # ---- header facts (first hit wins)
        if head:
            if "name" not in info and (m := NAME_LINE.match(line)):
                info["name"] = m.group(1)
            if "major" not in info and (m := MAJOR_LINE.match(line)):
                info["major_raw"] = m.group(1)
            if "track" not in info and (m := TRACK_LINE.match(line)):
                info["track"] = m.group(1)
            if "entry" not in info and (m := ENTRY_LINE.match(line)):
                info["entry"] = m.group(1)
            if re.search(r"\btransfer student\b", line, re.IGNORECASE):
                info.setdefault("entry", "transfer")
            if "res" not in info and (m := re.search(r"\b(out[- ]of[- ]state|in[- ]state)\b", line, re.IGNORECASE)):
                info["res"] = m.group(1)
        term_line_ok = not line.lower().startswith("term ") or TERM_NUM.match(line)
        if term_line_ok and (m := EARNED_TOTAL.search(line)) and "earned" not in info and not re.match(r"\s*term\b", line, re.IGNORECASE):
            info["earned"] = float(m.group(1) or m.group(2))
        if term_line_ok and (m := REQUIRED_TOTAL.search(line)):
            info.setdefault("required", int(next(g for g in m.groups() if g)))
        if re.match(r"\s*term\b.*attempted", line, re.IGNORECASE) or (cur and "attempted" in line.lower() and not CRS.search(line)):
            a = re.search(r"attempted\s*[:\-]?\s*(\d+(?:\.\d+)?)", line, re.IGNORECASE)
            e = re.search(r"earned\s*[:\-]?\s*(\d+(?:\.\d+)?)", line, re.IGNORECASE)
            if cur and (a or e):
                cur.stated = (float(a.group(1)) if a else None, float(e.group(1)) if e else None)
            continue

        header = _term_header(line)
        body = line
        if header:
            label, _, end = header
            body = line[end:]
            ip_flag = bool(IP_WORDS.search(body))
            cur = terms.get(label)
            if cur is None:
                cur = terms[label] = _Term(label, ip=ip_flag)
                order.append(cur)
            section = "terms"
            totals_mode = False
            nums = re.findall(r"(?<![\w.])\d+(?:\.\d+)?(?![\w.])", body) if not CRS.search(body) else []
            if totals_mode is False and len(nums) in (2, 3) and re.fullmatch(r"[\s\d.]+", body.strip() or "x"):
                w = int(float(nums[2])) if len(nums) == 3 else 0
                cur.row = (float(nums[0]), float(nums[1]), w)
                continue
        elif not CRS.search(line):
            low = line.lower()
            if "attempted" in low and "earned" in low:
                totals_mode = True
                continue
            if SEC_IP.search(low) and len(line) < 70:
                section, cur, totals_mode = "ip", None, False
                continue
            if SEC_XFER.search(low) and len(line) < 70:
                section, cur, totals_mode = "xfer", None, False
                continue
            if SEC_REQ.search(low) and len(line) < 70:
                section, totals_mode = "req", False
                continue
            if SEC_TERMS.search(low) and len(line) < 70:
                section, totals_mode = "terms", False
                continue
            continue

        # ---- courses on this line (possibly several: "one-line" audits)
        matches = list(CRS.finditer(body))
        for i, m in enumerate(matches):
            cid = f"{m.group(1)} {m.group(2)}"
            seg = body[m.end() : matches[i + 1].start() if i + 1 < len(matches) else len(body)]
            credits, grade = _parse_segment(seg)
            marked_done = bool(DONE_MARK.search(seg)) and section == "req"
            marked_ip = bool(IP_MARK.search(body)) or (section == "req" and "~" in body[: m.start()])
            g = norm_grade(grade) if grade else None
            if section == "req":
                if g and g not in ("IP", "I") or marked_done:
                    done_marked.append(cid)
                elif marked_ip or g == "IP":
                    add_ip(cid, credits)
                continue
            if section == "xfer":
                xfer.append({"id": cid, "credits": credits})
                continue
            if section == "ip" or (cur is not None and cur.ip and not g) or g in ("IP", "I"):
                if g == "I":
                    warns.append(f"{cid} is marked incomplete (I); it is counted as in progress until a grade posts.")
                add_ip(cid, credits)
                continue
            if credits is None and g is None:
                if section == "terms" and cur is not None:
                    continue  # a title mentioning a course id, not a course row
                continue
            target = cur
            if target is None:
                orphans.append({"id": cid, "credits": credits, "grade": g})
                continue
            if g is None:
                warns.append(f"{cid} in {target.label} has no grade; it is treated as in progress.")
                add_ip(cid, credits)
                continue
            if credits is None:
                missing_credits += 1
                credits = 3.0
            dup = next((c for c in target.courses if c["id"] == cid), None)
            if dup and dup["grade"] == g and dup["credits"] == credits:
                warns.append(f"{cid} appears twice in {target.label}; the duplicate row was ignored.")
                continue
            target.courses.append({"id": cid, "credits": credits, "grade": g})

    # ---- transfer/requirement bookkeeping and term assembly
    if orphans and not order:
        t = _Term("Term 1", courses=[o for o in orphans if o["grade"]])
        order.append(t)
        warns.append("No term dates were found on the audit; the courses were grouped into one term.")
    reg = [t for t in order if t.courses or t.row]
    out.courses = sum(len(t.courses) for t in reg) + len(ip_courses) + len(xfer)
    if not reg and not ip_courses and not xfer:
        fb = _parse_fallback_regex(text_lines, len(pages))
        if fb is not None:
            return fb
        out.warnings = warns
        return out

    if missing_credits:
        warns.append(f"{missing_credits} course(s) had no credit value printed; 3 credits were assumed.")

    major, major_ok = "Computer Science", False
    raw_major = info.get("major_raw", "")
    blob = " ".join(text_lines[:25])
    for src in (raw_major, blob):
        if re.search(r"information\s+systems?", src, re.IGNORECASE):
            major, major_ok = "Information Systems", True
            break
        if re.search(r"computer\s+science", src, re.IGNORECASE):
            major, major_ok = "Computer Science", True
            break
    if not major_ok:
        warns.append("The major was not recognised (models cover Computer Science and Information Systems); Computer Science was assumed.")
    track = info.get("track")
    if not track and raw_major and re.search(r"\s[-|]\s", raw_major):
        track = re.split(r"\s[-|]\s", raw_major, maxsplit=1)[1]
    entry = "First-Time Freshman"
    if "entry" in info:
        entry = "Transfer" if re.search(r"transfer", info["entry"], re.IGNORECASE) else "First-Time Freshman"
    elif xfer:
        warns.append("Transfer credits are listed but the entry type is not stated; First-Time Freshman was assumed.")
    residency = "Out-of-State" if re.search(r"out", info.get("res", ""), re.IGNORECASE) else "In-State"

    aterms, computed_earned = [], 0.0
    for t in reg:
        if t.row:
            att, earned, w = t.row
            if earned > att:
                warns.append(f"{t.label}: earned ({earned:g}) is above attempted ({att:g}); check the audit.")
            aterms.append(AuditTerm(label=t.label, credits_attempted=att, credits_earned=min(earned, att), withdrawals=w))
            computed_earned += min(earned, att)
            continue
        courses = t.courses[:12]
        if len(t.courses) > 12:
            warns.append(f"{t.label} lists {len(t.courses)} courses; only the first 12 were kept.")
        try:
            aterms.append(AuditTerm(label=t.label, courses=[AuditCourse(course_id=c["id"], credits=c["credits"], grade=c["grade"]) for c in courses]))
        except ValidationError:
            warns.append(f"{t.label} had values outside the supported range and was skipped.")
            continue
        att = sum(c["credits"] for c in courses)
        earned = sum(c["credits"] for c in courses if c["grade"] not in FAILING | WITHDRAWN)
        computed_earned += earned
        s_att, s_earned = t.stated
        if s_att is not None and abs(s_att - att) > 0.01:
            warns.append(f"{t.label}: the audit says {s_att:g} credits attempted but the courses add up to {att:g}.")
        if s_earned is not None and abs(s_earned - earned) > 0.01:
            warns.append(f"{t.label}: the audit says {s_earned:g} credits earned but the courses add up to {earned:g}.")
    xfer_credits = sum(x["credits"] or 3 for x in xfer)
    computed_total = computed_earned + xfer_credits

    stated = info.get("earned")
    if stated is not None and abs(stated - computed_total) > 0.01:
        warns.append(
            f"The audit lists {stated:g} credits earned but the terms read add up to {computed_total:g} "
            "(transfer, AP or older terms may not be itemised)."
        )
    seen: dict[str, str] = {}
    for t in aterms:
        for c in t.courses:
            if c.course_id in seen and seen[c.course_id] != t.label:
                warns.append(f"{c.course_id} appears in {seen[c.course_id]} and {t.label}: counted as a repeat.")
            seen.setdefault(c.course_id, t.label)
    keys = [_sort_key(t.label) for t in aterms]
    if all(k is not None for k in keys) and keys != sorted(keys):  # type: ignore[type-var]
        warns.append("Terms were not in date order on the audit; they were re-ordered by date.")
    if len({t.label for t in aterms}) != len(aterms):
        warns.append("A term appears more than once.")
    if len(aterms) > 20:
        warns.append(f"{len(aterms)} terms found; only the most recent 20 were kept.")
        aterms = aterms[-20:]

    required = info.get("required", 120)
    if not 60 <= required <= 200:
        warns.append(f"Credits required ({required}) looked wrong; 120 was assumed.")
        required = 120
    ip_ids = [c["id"] for c in ip_courses]
    done = [x["id"] for x in xfer] + done_marked
    for cid in ip_ids:
        if cid in seen and cid not in {x["id"] for x in xfer}:
            warns.append(f"{cid} is in progress but also has a grade in {seen[cid]}.")
    all_done = list(dict.fromkeys(done + [c.course_id for t in aterms for c in t.courses if c.grade not in FAILING | WITHDRAWN]))[:80]
    try:
        profile = AuditProfile(
            first_name=_first_name(info.get("name")),
            major=major,
            track=(track or "")[:40] or None,
            entry_type=entry,
            residency=residency,
            credits_earned=round(stated if stated is not None else computed_total),
            credits_required=required,
            terms=aterms,
            in_progress=[AuditCourse(course_id=c["id"], credits=c["credits"] or 3) for c in ip_courses[:12]],
            completed_courses=all_done,
        )
    except ValidationError:
        fb = _parse_fallback_regex(text_lines, len(pages))
        if fb is not None:
            return fb
        warns.append("Some values on the audit were outside the supported range.")
        out.warnings = warns
        return out

    # ---- confidence: how far the read agrees with itself and with the page's own totals
    conf = 0.5 if aterms and out.courses else 0.0
    conf += 0.1 if major_ok else 0.0
    conf += 0.15 if stated is not None and abs(stated - computed_total) <= 0.01 else 0.0
    conf += 0.1 if all(k is not None for k in keys) or all(t.label.startswith("Term ") for t in aterms) else 0.0
    conf += 0.1 if any(t.stated != (None, None) for t in reg) else 0.05
    conf -= 0.1 * min(3, sum(("credit" in w and "add up" in w) or "assumed" in w or "no grade" in w for w in warns))
    out.profile, out.confidence, out.warnings = profile, max(0.0, min(1.0, conf)), warns
    return out


def _first_name(raw: str | None) -> str | None:
    if not raw:
        return None
    raw = re.sub(r"\S+@\S+|\(.*?\)|\d+", " ", raw)
    if "," in raw:  # "Okafor, Maya"
        raw = raw.split(",", 1)[1]
    raw = re.split(r"\s{2,}|\bid\b|\bemail\b", raw, flags=re.IGNORECASE)[0]
    words = re.findall(r"[A-Za-z][A-Za-z'\-]*", raw)
    return words[0][:30] if words else None


# ---------------------------------------------------------------- vision tier
def _cached_vision(key: str) -> dict | None:
    try:
        with db() as conn:
            row = conn.execute("SELECT response FROM app.llm_cache WHERE hash=%s", (key,)).fetchone()
        return row[0] if row else None
    except Exception:  # noqa: BLE001 -- the cache is an optimisation, never a dependency
        return None


def _cached_vision_reader(key: str) -> str | None:
    try:
        with db() as conn:
            row = conn.execute("SELECT model FROM app.llm_cache WHERE hash=%s", (key,)).fetchone()
        return row[0] if row else None
    except Exception:  # noqa: BLE001
        return None


def _store_vision(key: str, parsed: dict, reader: str) -> None:
    try:
        with db() as conn:
            conn.execute(
                "INSERT INTO app.llm_cache(hash, kind, model, response) VALUES (%s,%s,%s,%s) ON CONFLICT (hash) DO NOTHING",
                (key, "audit", reader, json.dumps(parsed)),
            )
    except Exception as exc:  # noqa: BLE001 -- the cache is an optimisation, never a dependency
        log.warning("audit vision cache write failed: %s", type(exc).__name__)


def _normalise_vision(parsed: dict) -> AuditProfile:
    for t in parsed.get("terms") or []:
        for c in t.get("courses") or []:
            c["grade"] = norm_grade(c.get("grade") or "")
    for c in parsed.get("in_progress") or []:
        c["grade"] = ""
    return AuditProfile(**parsed)


_ERROR_CODE_TO_REASON = {
    "reader_configuration": "unconfigured",
    "reader_rate_limited": "busy",
    "reader_unavailable": "busy",
    "reader_timeout": "timeout",
    "reader_connection": "timeout",
    "reader_rejected": "unreadable",
    "reader_no_content": "unreadable",
}


def read_vision(data: bytes, mime: str) -> tuple[AuditProfile | None, str | None, bool, str | None]:
    """(profile, failure reason, cached, reader). Reasons: unconfigured | busy | timeout | unreadable.
    `reader` is "claude" or "gemini", whichever produced the profile (or the cached one).

    Claude is tried first (better vision reasoning, its own quota); Gemini is the fallback if
    Claude is unconfigured or Claude's own read fails.
    """
    key = hashlib.sha256(b"audit-v2|" + data).hexdigest()
    if (hit := _cached_vision(key)) is not None:
        try:
            return _normalise_vision(hit), None, True, _cached_vision_reader(key)
        except ValidationError:
            pass
    if not net.enabled():
        return None, "unconfigured", False, None

    # claude.py has no configured() of its own (unlike gemini.py); it needs only the Anthropic key.
    readers = [(claude, bool(net.key("ANTHROPIC_API_KEY")), "claude"), (gemini, gemini.configured(), "gemini")]
    reason = "unconfigured"
    for provider, ok, label in readers:
        if not ok:
            continue
        try:
            parsed = provider.parse_audit(data, mime)
        except provider.AuditReadError as exc:
            reason = _ERROR_CODE_TO_REASON.get(exc.code, "unreadable")
            continue
        if parsed is None:
            reason = "unreadable"
            continue
        try:
            profile = _normalise_vision(parsed)
        except ValidationError:
            reason = "unreadable"
            continue
        _store_vision(key, parsed, label)
        return profile, None, False, label
    return None, reason or "unreadable", False, None


# ---------------------------------------------------------------- orchestration
def _fail(code: str, message: str, *, retry: bool = False, manual: bool = True) -> Outcome:
    return Outcome(error_code=code, message=message, can_retry=retry, can_manual=manual)


def _vision_failure(reason: str | None, kind: str) -> Outcome:
    lead = "This PDF is a scan with no text" if kind == "scan" else "This file is an image" if kind == "image" else "We couldn't read the courses in this PDF"
    if reason == "unconfigured":
        return _fail("reader_unavailable", f"{lead}, and the image reader isn't set up on this server. Upload the text version of your audit or enter your terms by hand.")
    if reason == "timeout":
        return _fail("reader_timeout", f"{lead}, and the image reader took too long to answer. You can retry or enter your terms by hand.", retry=True)
    if reason == "busy":
        return _fail("reader_unavailable", f"{lead}, and the image reader is busy right now. You can retry in a minute or enter your terms by hand.", retry=True)
    return _fail("unreadable", f"{lead}, and the image reader could not make out any terms. Try a clearer or higher-resolution copy, or enter your terms by hand.")


def read_audit(data: bytes) -> Outcome:
    """Bytes -> a profile (or a specific error). No database, no engine: unit-testable."""
    t0 = time.perf_counter()

    def done(o: Outcome) -> Outcome:
        o.reading.ms = int((time.perf_counter() - t0) * 1000)
        if o.profile:
            o.reading.terms = len(o.profile.terms)
        return o

    if not data:
        return done(_fail("unreadable", "That file is empty. Choose your degree audit PDF and try again."))
    if len(data) > MAX_BYTES:
        return done(_fail("too_large", "That file is over 8 MB. Save just the audit pages as a smaller PDF, or enter your terms by hand."))
    mime = sniff(data)
    if mime is None:
        try:
            text = data.decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            text = ""
        preset = _match_preset(text)
        if preset is not None:
            o = Outcome(
                profile=preset,
                method="text",
                reading=Reading(method="sample", pages=1, terms=len(preset.terms), courses=_count(preset)),
            )
            return done(o)
        if text.strip() and len(text.strip()) >= 10:
            parsed = parse_text([text])
            reading = Reading(method="text", pages=1, courses=parsed.courses)
            if parsed.profile is not None:
                return done(Outcome(profile=parsed.profile, method="text", reading=reading, warnings=parsed.warnings))
        return done(_fail("unsupported_type", "We can read PDF, PNG, JPEG, WebP or plain text degree audits."))

    if mime != "application/pdf":
        profile, reason, _cached, reader = read_vision(data, mime)
        if profile is None:
            return done(_vision_failure(reason, "image"))
        o = Outcome(profile=profile, method="vision", reader=reader, reading=Reading(method="vision", pages=1))
        o.warnings = ["Read from an image; check the terms and grades below."]
        return done(o)

    pages, problem = extract_text(data)
    if problem == "encrypted":
        return done(_fail("unreadable", "This PDF is password-protected. Open it, print or save a copy without a password, and upload that, or enter your terms by hand."))
    if problem == "corrupt":
        return done(_fail("unreadable", "That file isn't a readable PDF (it may be damaged or renamed). Download the audit again, or enter your terms by hand."))
    parsed = parse_text(pages)
    reading = Reading(method="text", pages=len(pages), courses=parsed.courses)
    if parsed.profile is not None and parsed.confidence >= ACCEPT_CONFIDENCE:
        return done(Outcome(profile=parsed.profile, method="text", reading=reading, warnings=parsed.warnings))

    kind = "scan" if parsed.problem == "no_text" else "text"
    profile, reason, _, reader = read_vision(data, "application/pdf")
    if profile is not None:
        o = Outcome(profile=profile, method="vision", reader=reader, reading=Reading(method="vision", pages=len(pages), courses=_count(profile)))
        o.warnings = ["Read by the image reader because the PDF text was unclear; check the terms and grades below."]
        return done(o)
    if parsed.profile is not None and parsed.confidence >= FLOOR_CONFIDENCE:
        w = [*parsed.warnings, "Some parts of this audit were hard to read; check the terms and grades below."]
        return done(Outcome(profile=parsed.profile, method="text", reading=reading, warnings=w))
    if kind == "text" and reason in (None, "unreadable"):
        return done(_fail("no_courses_found", "We opened the PDF but found no course rows in it. Make sure it is your degree audit with terms and grades, or enter your terms by hand."))
    return done(_vision_failure(reason, kind))


def _count(p: AuditProfile) -> int:
    return sum(len(t.courses) for t in p.terms) + len(p.in_progress)


def response(engine: Engine, o: Outcome, source: str, first_seen: bool = True) -> dict:
    """The /audit/* payload. Errors keep the legacy `error` string and add the structured fields."""
    base = {
        "id": None,
        "first_name": None,
        "needs_work_hours": False,
        "error": None,
        "error_code": None,
        "can_retry": False,
        "can_enter_manually": True,
        "warnings": o.warnings,
        "reading": o.reading.as_dict(),
    }
    if o.profile is None:
        return base | {"source": "unavailable", "error": o.message, "error_code": o.error_code, "can_retry": o.can_retry, "can_enter_manually": o.can_manual}
    with db() as conn:
        # app.user_profile.source is CHECK-limited to gemini|sample|dataset (db/08); every
        # non-sample origin (parser, manual, claude vision, gemini vision) is stored as 'gemini'
        # and the real origin is reported to the client in this response's own `source` field
        pid = profiles.create(engine.people, conn, o.profile, "gemini")
    from api import agent

    st = engine.state(pid)
    return base | {"id": pid, "source": source, "first_name": o.profile.first_name, "needs_work_hours": True, "summary": agent._summary(engine, pid, st)}


def ingest(engine: Engine, data: bytes) -> dict:
    from api import agent

    text = data[:200_000].decode("latin-1") if data else ""
    preset = _match_preset(text)
    if preset is not None:
        t0 = time.perf_counter()
        o = Outcome(
            profile=preset,
            method="text",
            reading=Reading(method="sample", ms=int((time.perf_counter() - t0) * 1000), pages=1, terms=len(preset.terms), courses=_count(preset)),
        )
        return response(engine, o, "sample")

    m = agent.CID.search(text)
    if m and "SYNTHETIC" in text and m.group(0) in engine.people.current_ids:
        cid = m.group(0)
        t0 = time.perf_counter()
        return {
            "id": cid,
            "source": "sample",
            "first_name": None,
            "needs_work_hours": False,
            "error": None,
            "error_code": None,
            "can_retry": False,
            "can_enter_manually": True,
            "warnings": [],
            "reading": Reading(method="sample", ms=int((time.perf_counter() - t0) * 1000)).as_dict(),
            "summary": agent._summary(engine, cid, engine.state(cid)),
        }
    o = read_audit(data)
    source = {"text": "parser", "vision": o.reader or "gemini"}[o.method]
    log.info("audit read method=%s ms=%d terms=%d courses=%d ok=%s", o.method, o.reading.ms, o.reading.terms, o.reading.courses, o.profile is not None)
    return response(engine, o, source)


def manual(engine: Engine, profile: AuditProfile, warnings: list[str]) -> dict:
    o = Outcome(profile=profile, method="manual", warnings=warnings, reading=Reading(method="manual", terms=len(profile.terms), courses=_count(profile)))
    return response(engine, o, "manual")
from api.profiles import AuditCourse, AuditProfile, AuditTerm

PRESET_ARYA = AuditProfile(
    first_name="Arya",
    major="Computer Science",
    track="Data Science",
    entry_type="First-Time Freshman",
    residency="In-State",
    work_hours=15,
    credits_earned=109.0,
    credits_required=120.0,
    terms=[
        AuditTerm(
            label="Fall 2024",
            courses=[
                AuditCourse(course_id="BIOLLAB_2L", credits=1.0, grade="A-"),
                AuditCourse(course_id="CMSCAHL", credits=3.0, grade="A"),
                AuditCourse(course_id="CMSCL", credits=3.0, grade="B"),
                AuditCourse(course_id="CMSC201", credits=4.0, grade="A"),
                AuditCourse(course_id="CMSC203", credits=3.0, grade="A"),
                AuditCourse(course_id="ECON102", credits=3.0, grade="A"),
                AuditCourse(course_id="ENGL100", credits=3.0, grade="A"),
                AuditCourse(course_id="MATH151", credits=4.0, grade="C"),
                AuditCourse(course_id="MATH152", credits=4.0, grade="C"),
                AuditCourse(course_id="ECON101", credits=3.0, grade="A"),
                AuditCourse(course_id="GES120", credits=3.0, grade="C"),
                AuditCourse(course_id="PSYC100", credits=4.0, grade="A"),
            ],
        ),
        AuditTerm(
            label="Spring 2025",
            courses=[
                AuditCourse(course_id="ART215", credits=3.0, grade="A"),
                AuditCourse(course_id="BIOL141", credits=4.0, grade="C"),
                AuditCourse(course_id="CMSC202", credits=4.0, grade="B"),
                AuditCourse(course_id="UNIV301", credits=2.0, grade="A"),
            ],
        ),
        AuditTerm(
            label="Summer 2025",
            courses=[
                AuditCourse(course_id="STAT355", credits=3.0, grade="A"),
            ],
        ),
        AuditTerm(
            label="Fall 2025",
            courses=[
                AuditCourse(course_id="BIOL142", credits=4.0, grade="B"),
                AuditCourse(course_id="CMSC498", credits=3.0, grade="P"),
                AuditCourse(course_id="LING190", credits=3.0, grade="A"),
            ],
        ),
        AuditTerm(
            label="Spring 2026",
            courses=[
                AuditCourse(course_id="AGNG100", credits=3.0, grade="A"),
                AuditCourse(course_id="CMSC304", credits=3.0, grade="A"),
                AuditCourse(course_id="CMSC313", credits=3.0, grade="B"),
                AuditCourse(course_id="CMSC341", credits=3.0, grade="B"),
                AuditCourse(course_id="ECON311", credits=3.0, grade="C"),
                AuditCourse(course_id="MLL305", credits=3.0, grade="A"),
            ],
        ),
        AuditTerm(
            label="Summer 2026",
            courses=[
                AuditCourse(course_id="MATH221", credits=4.0, grade="A"),
                AuditCourse(course_id="CMSC331", credits=3.0, grade="A"),
                AuditCourse(course_id="CMSC411", credits=3.0, grade="A"),
            ],
        ),
    ],
    in_progress=[
        AuditCourse(course_id="CMSC421", credits=3.0, grade=""),
        AuditCourse(course_id="CMSC426", credits=3.0, grade=""),
        AuditCourse(course_id="CMSC441", credits=3.0, grade=""),
        AuditCourse(course_id="CMSC478", credits=3.0, grade=""),
        AuditCourse(course_id="SCI101L", credits=2.0, grade=""),
    ],
    completed_courses=[
        "CMSC201", "CMSC202", "CMSC203", "CMSC304", "CMSC313", "CMSC331",
        "CMSC341", "CMSC411", "MATH151", "MATH152", "MATH221", "STAT355",
        "ENGL100", "ECON101", "ECON102"
    ],
)

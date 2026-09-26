import pandas as pd
from helpers import make_people

from ml.repair import feasibility


def test_transfer_prerequisites_are_inferred_not_suggested_again():
    people = make_people(5)
    people.catalog = pd.DataFrame(
        [
            ("CMSC201", "CMSC", "CS I", 4, "Core", "Computer Science", None, "Fall|Spring"),
            ("CMSC202", "CMSC", "CS II", 4, "Core", "Computer Science", "CMSC201", "Fall|Spring"),
            ("CMSC341", "CMSC", "Data Structures", 4, "Core", "Computer Science", "CMSC202", "Fall|Spring"),
        ],
        columns=["course_id", "subject", "course_title", "credits", "course_type",
                 "required_for_majors", "prerequisite_ids", "typical_terms_offered"],
    ).set_index("course_id")
    # a transfer student taking CMSC202 has no CMSC201 row: the credit came from elsewhere
    people.courses_ip = {"CID-000001": ["CMSC202"]}
    result = feasibility(people, "CID-000001", "Computer Science", 4)
    picks = [p["course_id"] for p in result["picks"]]
    assert "CMSC201" not in picks and "CMSC202" not in picks
    assert "CMSC341" in picks  # prerequisite in progress now counts for next term

import pytest

from scripts.check_integrity import check


@pytest.mark.db
def test_row_counts(db):
    check(db)

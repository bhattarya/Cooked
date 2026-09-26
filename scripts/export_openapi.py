"""Export deterministically; CI rejects a stale frontend contract."""

import argparse
import json

from api.main import app
from scripts.common import ROOT


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    content = json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"
    path = ROOT / "docs/openapi.json"
    if args.check:
        if not path.exists() or path.read_text() != content:
            raise SystemExit("OpenAPI is stale: run make openapi")
    else:
        path.write_text(content)
        print("Exported docs/openapi.json")


if __name__ == "__main__":
    main()

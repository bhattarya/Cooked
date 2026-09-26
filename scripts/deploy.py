"""CI-only trigger for an existing App Platform app; never replaces dashboard secrets."""

import os
from uuid import UUID

import httpx

from scripts.common import required, run


def main():
    if os.getenv("GITHUB_REF") != "refs/heads/main" or os.getenv("GITHUB_EVENT_NAME") != "push":
        raise RuntimeError("Deployment requires the tested push-to-main CI job")
    repo = required("GITHUB_REPOSITORY")
    if repo != "bhattarya/Cooked":
        raise RuntimeError("Unexpected deployment repository")
    with httpx.Client(timeout=30) as client:
        head = client.get(
            f"https://api.github.com/repos/{repo}/commits/main",
            headers={
                "Authorization": "Bearer " + required("GITHUB_TOKEN"),
                "Accept": "application/vnd.github+json",
            },
        )
        head.raise_for_status()
        if head.json()["sha"] != required("GITHUB_SHA"):
            print("Skipped superseded commit; newer main must complete its own CI")
            return
        app_id = str(UUID(required("DO_APP_ID")))
        response = client.post(
            f"https://api.digitalocean.com/v2/apps/{app_id}/deployments",
            headers={"Authorization": "Bearer " + required("DO_TOKEN")},
            json={"force_build": True},
        )
        response.raise_for_status()
        print("Deployment queued:", response.json()["deployment"]["id"])
        print("This is a trigger acknowledgment, not a successful HTTPS smoke test.")


if __name__ == "__main__":
    run(main)

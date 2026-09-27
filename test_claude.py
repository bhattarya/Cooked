import sys
from api.providers import claude, net

net.allow(True)

def test():
    with open("tests/fixtures/cs_audit.pdf", "rb") as f:
        data = f.read()

    print("Testing claude parse...")
    try:
        parsed = claude.parse_audit(data, "application/pdf")
        print("Parsed:", parsed)

        from api import profiles
        try:
            profile = profiles.AuditProfile(**parsed)
            print("Profile:", profile)
        except Exception as e:
            print("Validation error:", repr(e))
    except Exception as e:
        print("Claude error:", repr(e))

if __name__ == "__main__":
    test()

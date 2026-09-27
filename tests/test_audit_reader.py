"""The PDF reader reports provider failures distinctly from an unreadable file."""
import httpx
import pytest

from api import agent
from api.providers import gemini


def response(status, body):
    return httpx.Response(status, json=body, request=httpx.Request('POST', 'https://reader.invalid'))


def test_transient_outage_retries_and_uses_audit_model(monkeypatch):
    monkeypatch.setenv('GEMINI_MODEL', 'conversation-model')
    monkeypatch.setenv('GEMINI_AUDIT_MODEL', 'pdf-model')
    monkeypatch.setattr('time.sleep', lambda _: None)
    calls = []
    def request(method, url, **kwargs):
        calls.append(url)
        return response(503, {}) if len(calls) == 1 else response(200, {'candidates':[{'content':{'parts':[{'text':'{}'}]}}]})
    monkeypatch.setattr(gemini.net, 'request', request)
    assert gemini._audit_content({}) == {'parts':[{'text':'{}'}]}
    assert len(calls) == 2
    assert all('/pdf-model:generateContent' in url for url in calls)


@pytest.mark.parametrize(('status','code'), [(503,'reader_unavailable'),(429,'reader_rate_limited'),(404,'reader_configuration'),(403,'reader_configuration'),(400,'reader_rejected')])
def test_reader_failure_has_safe_actionable_category(monkeypatch, status, code):
    monkeypatch.setattr('time.sleep', lambda _: None)
    monkeypatch.setattr(gemini.net, 'request', lambda *a, **kw: response(status, {'error':{'message':'PRIVATE PROVIDER CONTENT'}}))
    with pytest.raises(gemini.AuditReadError) as error:
        gemini._audit_content({})
    assert error.value.code == code
    assert 'PRIVATE' not in str(error.value)


def test_reader_timeout_is_not_reported_as_bad_pdf(monkeypatch):
    def request(*a, **kw):
        raise httpx.ReadTimeout('PRIVATE TIMEOUT DETAILS')
    monkeypatch.setattr(gemini.net, 'request', request)
    with pytest.raises(gemini.AuditReadError) as error:
        gemini._audit_content({})
    assert error.value.code == 'reader_timeout'
    assert 'PRIVATE' not in str(error.value)


def test_intake_returns_reader_error_without_creating_profile(monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY','test-key')
    monkeypatch.setenv('GEMINI_AUDIT_MODEL','pdf-model')
    monkeypatch.setattr(gemini.net,'enabled',lambda: True)
    def parse(*a):
        raise gemini.AuditReadError('reader_unavailable', 'Reader temporarily unavailable.')
    monkeypatch.setattr(gemini,'parse_audit',parse)
    result = agent.intake(None,b'%PDF-1.4 test','application/pdf')
    assert result['id'] is None
    assert result['error_code'] == 'reader_unavailable'
    assert result['reader_model'] == 'pdf-model'


def test_audit_model_defaults_to_general_model(monkeypatch):
    monkeypatch.delenv('GEMINI_AUDIT_MODEL', raising=False)
    monkeypatch.setenv('GEMINI_MODEL','configured-model')
    assert gemini.audit_model_name() == 'configured-model'

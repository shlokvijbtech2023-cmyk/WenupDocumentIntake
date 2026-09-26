from app.llm import _safe_json_loads


def test_recovers_json_wrapped_in_markdown_fence(load):
    raw_text = load("malformed_not_json.txt")
    parsed = _safe_json_loads(raw_text)
    assert parsed.get("_error") is None
    assert parsed["updates"][0]["field"] == "full_name"


def test_totally_unparseable_text_returns_empty_with_error(load):
    raw_text = load("malformed_unparseable.txt")
    parsed = _safe_json_loads(raw_text)
    assert parsed["updates"] == []
    assert parsed.get("_error") == "malformed_json"


def test_clean_json_parses_directly():
    parsed = _safe_json_loads('{"updates": [], "assistant_message": "hi"}')
    assert parsed == {"updates": [], "assistant_message": "hi"}

import json

from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from server import app, is_trusted_url

client = TestClient(app)

def test_is_trusted_url_basic():
    """Test the domain blocking logic works."""
    assert is_trusted_url("https://www.bbc.com/news") == True
    assert is_trusted_url("https://nature.com/articles") == True
    
    assert is_trusted_url("https://www.wikipedia.org/wiki/Python") == False
    assert is_trusted_url("https://twitter.com/user/status/123") == False
    
    # Test User-Defined Blocked Domain
    user_blocked = ["example.com"]
    assert is_trusted_url("https://www.example.com/foo", user_blocked) == False

@patch("server.llm_extract_claims")
@patch("server.search_for_evidence")
def test_verify_simple_endpoint(mock_search, mock_extract):
    """
    Test POST /verify
    """
    # Mocks
    mock_extract.return_value = ["The sky is green."]
    mock_search.return_value = {
        "claim": "The sky is green.",
        "evidence_snippets": "Scientific consensus says sky is blue.",
        "primary_source": "https://science.org"
    }

    response = client.post("/verify", json={"text": "The sky is green."})

    assert response.status_code == 200
    data = response.json()
    assert len(data["claims"]) == 1
    assert data["claims"][0]["claim"] == "The sky is green."
    assert data["claims"][0]["primary_source"] == "https://science.org"


@patch("server.llm_extract_claims")
@patch("server.search_for_evidence")
@patch("server.model.generate_content") 
def test_verify_with_context_endpoint(mock_gemini, mock_search, mock_extract):
    """
    Test POST /verify_with_context
    """
    # Mocks
    mock_extract.return_value = ["Claim 1"]
    mock_search.return_value = {
        "claim": "Claim 1",
        "evidence_snippets": "Evidence found.",
        "primary_source": "http://gov.uk"
    }
    mock_gemini_response = MagicMock()
    mock_gemini_response.text = json.dumps({
        "results": [
            {
                "claim_index": 1,
                "status": "SUPPORTED",
                "confidence_score": 95,
                "source_type": "GOVERNMENT",
                "evidence": "Government stats confirm this."
            }
        ]
    })
    mock_gemini.return_value = mock_gemini_response

    payload = {
        "claim_text": "He said tax is up.",
        "page_context": "The Prime Minister spoke today..."
    }
    response = client.post("/verify_with_context", json=payload)

    assert response.status_code == 200
    data = response.json()
    
    result = data["claims"][0]
    assert result["status"] == "SUPPORTED"
    assert result["confidence_score"] == 95
    assert result["source_type"] == "GOVERNMENT"

@patch("server.DDGS")
def test_search_logic_filtering(mock_ddgs_cls):
    """
    Test search_for_evidence correctly removes Wikipedia/Reddit results.
    """
    from server import search_for_evidence

    # Mocks
    mock_ddgs_instance = mock_ddgs_cls.return_value
    mock_ddgs_instance.text.return_value = [
        {"href": "https://wikipedia.org/wiki/Fact", "title": "Wiki", "body": "..."}, # Should be filtered
        {"href": "https://www.reuters.com/article", "title": "Reuters", "body": "..."} # Should remain
    ]

    result = search_for_evidence("Some claim")

    # Results should contain Reuters, not Wikipedia
    assert "Wikipedia" not in result["evidence_snippets"]
    assert "Reuters" in result["evidence_snippets"]
    assert result["primary_source"] == "https://www.reuters.com/article"

@patch("server.DDGS")
def test_search_no_results(mock_ddgs_cls):
    from server import search_for_evidence

    # Mocks
    mock_ddgs_instance = mock_ddgs_cls.return_value
    mock_ddgs_instance.text.return_value = []

    result = search_for_evidence("Unicorns exist")

    assert result["status"] == "UNSURE"
    assert result["source_url"] == "No reliable sources found"

@patch("server.model.generate_content")
def test_llm_extract_claims_json_parsing(mock_gemini):
    from server import llm_extract_claims
    
    # Mocks
    mock_response = MagicMock()
    mock_response.text = '["Claim A", "Claim B"]'
    mock_gemini.return_value = mock_response

    long_text = "This is a very long sentence that is definitely longer than fifty characters so the function will run."
    claims = llm_extract_claims(long_text)
    
    assert len(claims) == 2
    assert "Claim A" in claims
    assert "Claim B" in claims
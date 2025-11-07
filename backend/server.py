import uvicorn
import google.generativeai as genai
import json
import os
from urllib.parse import urlparse
from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from google.generativeai.types import HarmCategory, HarmBlockThreshold
from ddgs import DDGS

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env file")

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('models/gemini-2.5-flash')

safety_settings = {
    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
}

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class VerifyRequest(BaseModel):
    text: str

class ContextVerifyRequest(BaseModel):
    claim_text: str
    page_context: str

# Domain Filter
BAD_DOMAINS = {
    "wikipedia.org", "reddit.com", "pinterest.com", "twitter.com", "x.com",
    "facebook.com", "instagram.com", "tiktok.com", "youtube.com",
    "quora.com", "theonion.com", "linkedin.com"
}

def is_trusted_url(url):
    """Returns False if the domain is in the defined blacklist."""
    try:
        domain = urlparse(url).netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]
        for bad in BAD_DOMAINS:
            if domain == bad or domain.endswith("." + bad):
                return False
        return True
    except:
        return False

# Extract claims from text
def llm_extract_claims(text, page_context=None):
    print(f"Sending text to Gemini (Length: {len(text)})...")
    if len(text) < 50: return []

    if page_context:
        prompt = f"""
        You are a forensic fact-checker.
        FULL PAGE CONTEXT: "{page_context[:10000]}..."
        USER SELECTED TEXT (Target for extraction): "{text}"
        TASK: Extract verifiable, factual claims from the SELECTED TEXT.
        CRITICAL RULES:
        1. Claims must be STANDALONE. Do not use "he", "she", "it", "they", "this person", or "the company".
        2. You MUST use the PAGE CONTEXT to replace pronouns with actual names.
        (e.g., if selected text is "He lied", and context shows it's about Nixon, output "Nixon lied".)
        Return ONLY a raw JSON list of strings.
        """
    else:
        prompt = f"""
        Extract verifiable, factual claims from this text.
        Return ONLY a raw JSON list of strings.
        Text: "{text}"
        """

    try:
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"},
            safety_settings=safety_settings
        )
        return json.loads(response.text)[:5]
    except Exception as e:
        print(f"Claim extraction error: {e}")
        return []

# Search claims and judge
def search_and_verify(claim):
    print(f"🌐 Manual search for: {claim[:50]}...")
    
    try:
        # Manually search and filter for trusted sources
        raw_results = list(DDGS().text(claim, max_results=10))
        clean_results = []
        for r in raw_results:
            if is_trusted_url(r['href']):
                clean_results.append(r)
        
        top_results = clean_results[:3]

        if not top_results:
             return {"claim": claim, "status": "UNSURE", "source_url": "No reliable sources found", "evidence": "No reliable sources found after filtering."}

        # Compile evidence
        evidence_snippets = " | ".join([f"[{r['title']}]: {r['body']}" for r in top_results])
        primary_source = top_results[0]['href']

    except Exception as e:
        print(f"Search error: {e}")
        return {"claim": claim, "status": "ERROR", "source_url": "Search engine error", "evidence": str(e)}

    # Judge the evidence
    judge_prompt = f"""
    You are a meticulous fact-checker. Fact-check the following claim based ONLY on the provided evidence snippets.
    
    Claim: "{claim}"
    
    Evidence: "{evidence_snippets}"
    
    Respond with a single JSON object with this EXACT schema:
    {{
      "status": "SUPPORTED" | "CONTRADICTED" | "UNSURE",
      "evidence": "A brief, neutral summary of the findings. If UNSURE, explain why (e.g., 'Evidence is irrelevant or insufficient')."
    }}
    """
    
    try:
        response = model.generate_content(
            judge_prompt,
            generation_config={"response_mime_type": "application/json"},
            safety_settings=safety_settings
        )
        result_json = json.loads(response.text)
        status = result_json.get("status", "UNSURE")
        evidence = result_json.get("evidence", "Model judgment failed.")

        return {
            "claim": claim,
            "status": status,
            "source_url": primary_source,
            "evidence": evidence
        }

    except Exception as e:
        print(f"LLM Judge error: {e}")
        return {"claim": claim, "status": "UNSURE", "source_url": primary_source, "evidence": "LLM judging process failed."}

# API Routes
@app.post("/verify")
async def verify_simple(req: VerifyRequest):
    claims = llm_extract_claims(req.text)
    return {"claims": [search_and_verify(c) for c in claims]}

@app.post("/verify_with_context")
async def verify_context(req: ContextVerifyRequest):
    claims = llm_extract_claims(req.claim_text, page_context=req.page_context)
    return {"claims": [search_and_verify(c) for c in claims]}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
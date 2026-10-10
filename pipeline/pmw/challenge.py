"""Build-time challenge explanations; penalties always remain deterministic."""
from . import ai
from .config import MODEL

PROMPT = """Write a short paragraph explaining what could make this requirement wrong
and a concrete validation action. Use only the supplied deterministic issues and
uncertainties. Do not repeat numbers, add issues, change scores or invent evidence.
Keep the paragraph to three sentences. Return {\"narrative\": \"...\"}."""
SCHEMA = ai.object_schema({"narrative": {"type": "string"}})


def validate(data):
    if not isinstance(data, dict) or set(data) != {"narrative"}:
        raise ValueError("Expected narrative only")
    ai.validate_prose(data['narrative'], set())


def explain(draft: dict, issues: dict, use_llm: bool):
    result = None
    if use_llm:
        result = ai.run_json(task="challenge", model=MODEL, instruction=PROMPT,
                             payload={"title": draft['title'], "requirement": draft['requirement'],
                                      "issues": [i['text'] for i in issues['issues']],
                                      "uncertainties": draft['uncertainties']}, schema=SCHEMA, validate=validate,
                             max_tokens=600)
    if result and result.data:
        return result.data['narrative'], result.source, result
    texts = ' '.join(i['text'] for i in issues['issues'])
    risks = []
    if 'No comments from' in texts or 'comments come from' in texts:
        risks.append('the customer task may differ in markets that are missing or underrepresented')
    if 'praise' in texts:
        risks.append('a change could remove behaviour that other owners value')
    if 'survey' in texts:
        risks.append('the mapped survey may not establish the specific problem described in comments')
    if 'Small base' in texts or 'one source' in texts:
        risks.append('the selected feedback may reflect a narrow set of experiences')
    risk = '; '.join(risks) or 'the proposed explanation has not been verified in a customer task'
    narrative = f"This recommendation could be wrong because {risk}. "
    narrative += 'Reproduce the cited task with owners in the intended market, compare dissatisfied and satisfied experiences, and test the proposed behaviour before approval.'
    return narrative, 'rule', result

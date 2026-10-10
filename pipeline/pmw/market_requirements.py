"""Survey-only market decisions, separate from comment-derived signal requirements."""
from __future__ import annotations

import hashlib
import json

from . import aspects, db, evidence, score


def build(con, vehicle: str, weights: dict, limit: int = 3) -> int:
    candidates = con.execute(
        "SELECT * FROM market_conflicts WHERE vehicle=? AND in_scope=1 ORDER BY abs(delta) DESC, attribute LIMIT ?",
        (vehicle, limit)).fetchall()
    shares = evidence.sales_shares(con, vehicle, 2025)
    created = 0
    for row in candidates:
        source = con.execute(
            "SELECT * FROM survey_scores WHERE vehicle=? AND attribute=? AND study='CN_EU_2025' "
            "AND market IN ('CN','EU') AND in_scope=1 ORDER BY market", (vehicle, row['attribute'])).fetchall()
        if len(source) != 2 or {r['market'] for r in source} != {'CN', 'EU'}:
            continue
        survey = [{k: r[k] for k in ('market', 'variant', 'study', 'attribute', 'scale', 'bottom3', 'top2')}
                  | {'mean': round(r['mean'], 2), 'gap': round(evidence.survey_gap(r), 2)} for r in source]
        cn, eu = (next(r['mean'] for r in survey if r['market'] == m) for m in ('CN', 'EU'))
        attr = row['attribute']
        conflict = {'vehicle': vehicle, 'attribute': attr, 'cn': cn, 'eu': eu, 'delta': round(cn - eu, 2),
                    'study': 'CN_EU_2025', 'sales_year': 2025,
                    'sales_weights': {m: shares.get(m) for m in ('CN', 'EU')}}
        weight_text = ', '.join(f"{m} {shares[m]:.1%}" if m in shares else f"{m} unknown" for m in ('CN', 'EU'))
        signal_text = (f"{attr}: China {cn:.2f} vs Europe {eu:.2f} / 10 in CN_EU_2025. "
                       f"Gap: {abs(conflict['delta']):.2f} points (from displayed means). "
                       f"2025 vehicle sales shares: {weight_text}. Survey-only evidence; no customer comments are attached.")
        pf = _factors(weights['priority'], {
            'impact': (max(r['gap'] for r in survey), 'Largest survey dissatisfaction gap; not comment severity'),
            'frequency': (0, 'Unknown: survey sample sizes and complaint frequency are not supplied'),
            'market': (sum(shares.get(m, 0) for m in ('CN', 'EU')), '2025 sales share of the two surveyed markets'),
            'competitive': (0, 'No competitor evidence for this survey comparison'),
            'future': (.45, 'Assumption: present customer task remains relevant to the successor'),
        })
        cf = _factors(weights['confidence'], {
            'quantity': (0, 'Unknown sample sizes; no customer comments support this candidate'),
            'sources': (.25, 'One customer study; no independent comment triangulation'),
            'representation': (sum(shares.get(m, 0) for m in ('CN', 'EU')), 'Survey covers China and Europe only, weighted by 2025 sales'),
            'agreement': (.25, 'Markets disagree; means alone do not establish different product needs'),
            'recency': (.5, 'Study labelled 2025; underlying collection dates are unknown'),
        })
        p, c = score._weighted(pf, weights['priority']), score._weighted(cf, weights['confidence'])
        issues = [
            {'penalty': 8, 'text': 'Survey sample sizes and distributions are unknown; significance cannot be established.'},
            {'penalty': 6, 'text': 'Survey-only evidence has no supporting customer comments or independent triangulation.'},
        ]
        ch = {'issues': issues, 'revised_confidence': max(0, c - sum(i['penalty'] for i in issues)),
              'priority_sensitivity': score.sensitivity(pf, weights['priority'], weights['thresholds']['priority']),
              'narrative': 'This recommendation could be wrong because survey means may reflect different samples, '
                           'vehicle variants or expectations. Validate the task in both markets before choosing a global '
                           'requirement or market-specific ones.', 'narrative_source': 'rule'}
        photo_topic = ('Space / spatial impression' if 'roominess' in attr.lower() else
                       'Handling / Riding' if attr in ('Quality of ride', 'Sportiness') else attr)
        photo = aspects.for_topic(vehicle, photo_topic)
        rid = f"R-{vehicle}-M" + hashlib.sha256(attr.encode()).hexdigest()[:10]
        assumptions = ['A difference in survey means is a prompt for validation, not proof of distinct market needs.',
                       'The successor will still need to support this customer task.']
        uncertainties = ['Sample sizes, distributions and collection dates are unavailable.',
                         'China has no customer comments in the supplied feedback dataset.']
        if any(r['variant'] for r in survey):
            uncertainties.append('China uses the G68 long-wheelbase variant; body differences may explain the gap.')
        fields = {
            'id': rid, 'vehicle': vehicle, 'signal_id': rid.replace('R-', 'MC-', 1), 'kind': 'market_conflict',
            'already_exists': '[]', 'title': f'{attr}: global or market-specific?', 'customer_voice': None,
            'signal_text': signal_text, 'root_cause': 'Working hypothesis: usage, expectations or vehicle variants may differ between markets.',
            'customer_need': f'Drivers need {attr.lower()} suited to their local use.',
            'requirement': f'For {attr.lower()}, choose one global requirement or market-specific ones for the successor. '
                           'Validate the customer task in China and Europe before committing to either approach.',
            **photo, 'markets': db.dumps(['CN', 'EU']), 'future_lens': 'current_pain',
            'assumptions': db.dumps(assumptions), 'uncertainties': db.dumps(uncertainties),
            'contradictions': db.dumps([f'China and Europe report different satisfaction with {attr.lower()}.']),
            'survey': db.dumps(survey), 'conflicts': db.dumps([conflict]), 'priority': p, 'priority_factors': db.dumps(pf),
            'confidence': c, 'confidence_factors': db.dumps(cf), 'quadrant': score.quadrant(p, c, weights['thresholds']),
            'challenge': db.dumps(ch), 'status': 'proposed', 'generated_by': 'evidence-template:market-conflict',
            'created_at': db.now(), 'updated_at': db.now(),
        }
        con.execute(f"INSERT INTO requirements ({','.join(fields)}) VALUES ({','.join('?' for _ in fields)})", tuple(fields.values()))
        db.audit(con, actor_type='system', actor='Survey conflict builder', entity_type='requirement', entity_id=rid,
                 action='drafted market conflict', after=signal_text,
                 rationale=f"survey_scores: {vehicle}, CN_EU_2025, {attr}, CN/EU; sales: {vehicle}, 2025")
        db.audit(con, actor_type='system', actor='Scoring engine', entity_type='requirement', entity_id=rid,
                 action='scored', after=f'priority {p}, confidence {c}', rationale='Survey-only deterministic factors; no invented comments')
        created += 1
    return created


def _factors(weights, values):
    return {key: {'value': round(value, 3), 'note': note, 'weight': weights[key]} for key, (value, note) in values.items()}


def errors(con, requirement: dict) -> list[str]:
    """Validate numeric claims against survey/sales rows, not LLM prose rules."""
    problems = []
    rid, vehicle = requirement['id'], requirement['vehicle']
    survey, conflicts = json.loads(requirement['survey']), json.loads(requirement['conflicts'])
    if requirement['customer_voice'] or json.loads(requirement['already_exists']):
        problems.append(f'{rid}: survey-only candidate contains customer or equipment evidence')
    if len(survey) != 2 or {r['market'] for r in survey} != {'CN', 'EU'} or len(conflicts) != 1:
        return problems + [f'{rid}: expected one conflict and two market survey rows']
    shares = evidence.sales_shares(con, vehicle, 2025)
    for row in survey:
        source = con.execute("SELECT mean FROM survey_scores WHERE vehicle=? AND study=? AND attribute=? AND market=? AND in_scope=1",
                             (vehicle, row['study'], row['attribute'], row['market'])).fetchone()
        if not source or round(source['mean'], 2) != row['mean']:
            problems.append(f'{rid}: survey value does not match its in-scope source')
    conflict = conflicts[0]
    if (conflict['cn'] != next(r['mean'] for r in survey if r['market'] == 'CN') or
        conflict['eu'] != next(r['mean'] for r in survey if r['market'] == 'EU') or
        conflict['delta'] != round(conflict['cn'] - conflict['eu'], 2) or
        conflict['sales_weights'] != {m: shares.get(m) for m in ('CN', 'EU')}):
        problems.append(f'{rid}: inconsistent conflict values or sales weights')
    if set(json.loads(requirement['markets'])) != {'CN', 'EU'}:
        problems.append(f'{rid}: wrong market visibility')
    if con.execute('SELECT 1 FROM signal_evidence WHERE signal_id=?', (requirement['signal_id'],)).fetchone():
        problems.append(f'{rid}: survey-only candidate links customer comments')
    return problems

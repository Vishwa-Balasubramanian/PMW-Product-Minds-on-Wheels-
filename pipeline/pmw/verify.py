"""Repeatable data-contract checks and a shareable, aggregate-only build report."""
from __future__ import annotations

import hashlib
import json

from . import derive, evidence, market_requirements, score
from .config import RAW, SALES_FILE, STUDY_FILE, VEHICLES
from .themes import THEME_VERSION, member_topics


def equipment_errors(con, requirement: dict) -> list[str]:
    """Check deterministic equipment drafts against their feature-specific source records.

    Unlike LLM prose, these drafts may name verified option codes and list prices.
    They must never borrow the broader signal's sample as their wishing evidence.
    """
    matches = json.loads(requirement['already_exists'])
    errors = []
    features = {m.get('feature') for m in matches}
    if len(features) != 1 or not features.issubset(evidence.EQUIPMENT_GLOSSARY):
        return [f"{requirement['id']}: quick win must identify one evidenced feature"]
    feature = next(iter(features))
    for field in ('title', 'requirement'):
        text = requirement[field]
        if feature not in text or not any(
                (m.get('code') and m['code'] in text) or
                (m['match_type'] == 'standard_other_vehicle' and
                 (m['source_vehicle'] in text or VEHICLES[m['source_vehicle']]['short'] in text)) for m in matches):
            errors.append(f"{requirement['id']}: {field} must name its feature and option code or source vehicle")
    for match in matches:
        if match['match_type'] not in ('option_same_vehicle', 'package_same_vehicle', 'standard_other_vehicle'):
            errors.append(f"{requirement['id']}: complaint offered as a quick win")
        signal = con.execute('SELECT topic FROM signals WHERE id=? AND vehicle=?',
                             (match['signal_or_requirement_id'], requirement['vehicle'])).fetchone()
        topics = set(member_topics(signal['topic'])) & evidence.EQUIPMENT_GLOSSARY[feature]['topics'] if signal else set()
        if not topics or not match['feedback_ids']:
            errors.append(f"{requirement['id']}: missing feature-specific evidence")
        for fid in match['feedback_ids']:
            labels = {r[0] for r in con.execute(
                "SELECT l.topic FROM feedback_labels l JOIN feedback f ON f.id=l.feedback_id "
                "WHERE f.id=? AND f.vehicle=? AND l.feedback_type='Wants'", (fid, requirement['vehicle']))}
            if not topics.intersection(labels):
                errors.append(f"{requirement['id']}: {fid} is not a wish for this feature")
    return errors


def inspect(con, expected_per_vehicle: int = 15) -> dict:
    errors = []
    vehicles = {}
    weights = json.loads(con.execute("SELECT value FROM settings WHERE key='weights'").fetchone()[0])
    for code in VEHICLES:
        reqs = [dict(r) for r in con.execute('SELECT * FROM requirements WHERE vehicle=? ORDER BY priority DESC, id', (code,))]
        core = [r for r in reqs if r['kind'] == 'signal']
        if len(core) != expected_per_vehicle:
            errors.append(f'{code}: expected {expected_per_vehicle} core requirements, got {len(core)}')
        quick_wins = [r for r in reqs if r['kind'] == 'quick_win']
        features = [m.get('feature') for r in quick_wins for m in json.loads(r['already_exists'])[:1]]
        if len(quick_wins) > 5 or len(features) != len(set(features)):
            errors.append(f'{code}: quick wins must contain at most five distinct features')
        for r in reqs:
            if r['kind'] == 'quick_win':
                errors.extend(equipment_errors(con, r))
            elif r['kind'] == 'market_conflict':
                errors.extend(market_requirements.errors(con, r))
            else:
                allowed = {row[0] for row in con.execute('SELECT feedback_id FROM signal_evidence WHERE signal_id=?', (r['signal_id'],))}
                draft = {k: json.loads(r[k]) if k in ('assumptions', 'uncertainties') else r[k] for k in derive.FIELDS}
                # Code appends numerical data-health notes after model validation.
                original_uncertainties = [s for s in draft['uncertainties'] if not s[:1].isdigit()]
                draft['uncertainties'] = original_uncertainties
                try:
                    derive.validate(draft, allowed)
                except (ValueError, TypeError) as exc:
                    errors.append(f"{r['id']}: {exc}")
            for metric in ('priority', 'confidence'):
                factors = json.loads(r[f'{metric}_factors'])
                recomputed = score._weighted(factors, weights[metric])
                expected = (json.loads(r['challenge'])['revised_confidence']
                            if metric == 'confidence' and r['challenged'] else recomputed)
                if not 0 <= r[metric] <= 100 or r[metric] != expected:
                    errors.append(f"{r['id']}: inconsistent {metric}")
            challenge = json.loads(r['challenge'])
            if not challenge.get('narrative'):
                errors.append(f"{r['id']}: missing challenge narrative")
            original_confidence = score._weighted(json.loads(r['confidence_factors']), weights['confidence'])
            if challenge['revised_confidence'] != max(0, original_confidence - sum(i['penalty'] for i in challenge['issues'])):
                errors.append(f"{r['id']}: challenge changed deterministic penalties")
            if score.quadrant(r['priority'], r['confidence'], weights['thresholds']) != r['quadrant']:
                errors.append(f"{r['id']}: inconsistent quadrant")
        labels = dict(con.execute(
            'SELECT l.label_source, COUNT(DISTINCT l.feedback_id) FROM feedback_labels l '
            'JOIN feedback f ON f.id=l.feedback_id WHERE f.vehicle=? GROUP BY l.label_source', (code,)))
        unlabelled = con.execute('SELECT COUNT(*) FROM feedback f WHERE vehicle=? AND NOT EXISTS '
                                '(SELECT 1 FROM feedback_labels l WHERE l.feedback_id=f.id AND l.topic IS NOT NULL)', (code,)).fetchone()[0]
        quadrants = {q: sum(r['quadrant'] == q for r in reqs) for q in ('act','validate','monitor','park')}
        equipment = con.execute('SELECT COUNT(*) FROM equipment WHERE vehicle=?', (code,)).fetchone()[0]
        if not equipment:
            errors.append(f'{code}: no equipment read from the provided PDF')
        vehicles[code] = {
            'comments': con.execute('SELECT COUNT(*) FROM feedback WHERE vehicle=?', (code,)).fetchone()[0],
            'labelled_comments_by_source': labels, 'unlabelled': unlabelled,
            'requirements': len(reqs), 'core_requirements': len(core),
            'equipment_quick_wins': len(quick_wins),
            'market_conflict_requirements': sum(r['kind'] == 'market_conflict' for r in reqs),
            'core_quadrants': {q: sum(r['quadrant'] == q for r in core) for q in quadrants},
            'quadrants': quadrants, 'equipment_entries_best_effort': equipment,
            'draft_sources': sorted({r['generated_by'] for r in reqs}),
            'borderline_priorities': [r['id'] for r in reqs if json.loads(r['challenge']).get('priority_sensitivity',{}).get('crosses_threshold')],
            'confidence_threshold_scenarios': {
                str(threshold): {q: sum(score.quadrant(r['priority'], r['confidence'],
                    {**weights['thresholds'], 'confidence': threshold}) == q for r in reqs)
                    for q in ('act','validate','monitor','park')}
                for threshold in (55,58,60,62,65)},
        }
    if con.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        errors.append('SQLite integrity check failed')
    files = [SALES_FILE, STUDY_FILE] + [v[k] for v in VEHICLES.values() for k in ('feedback_file','options_file')]
    return {'passed': not errors, 'errors': errors, 'theme_version': THEME_VERSION, 'weights': weights,
            'data_sha256': {name: hashlib.sha256((RAW/name).read_bytes()).hexdigest() for name in sorted(files)},
            'vehicles': vehicles,
            'limitations': ['Offline drafts are reviewed task templates, not live LLM output.',
                            'Rule labels are provisional; abstention is not a missing response.',
                            'Scores and sensitivity scenarios are heuristics, not statistical probabilities.',
                            'German equipment extraction is best effort; availability in other markets is unknown.']}

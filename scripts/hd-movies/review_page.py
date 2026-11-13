"""Render the shared offline, one-clock movie comparison page."""
import html
import json
from pathlib import Path

def render_review(rows, output, *, title, status, intro, notice):
    template = Path(__file__).with_name('review-template.html').read_text()
    for key, value in [('TITLE', title), ('STATUS', status), ('INTRO', intro), ('NOTICE', notice)]:
        template = template.replace('__' + key + '__', html.escape(value))
    template = template.replace('__DATA__', json.dumps(rows).replace('<', '\\u003c'))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(template)

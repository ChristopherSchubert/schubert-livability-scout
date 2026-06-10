# Section auditor for public/mockups/trip-walkthrough.html.
#
# Rule: every page-level section on slide N is either present on slide N+1,
# disappears because of an explicit named action, or appears because of one.
# This script prints the section-level diff for every consecutive slide pair;
# a human (or the agent) then matches each +/− line against the pair's
# data-did lines and captions. A diff line with no matching named action is
# a violation. Run after ANY edit to the deck.
#
#   python3 scripts/.audit-walkthrough-sections.py
import re

s = open('public/mockups/trip-walkthrough.html').read()
parts = [p for p in re.split(r'(?=<section data-phase=)', s) if p.startswith('<section')]

def sections(p):
    body = p.split('>', 1)[1]
    sigs = []
    for m in re.finditer(
        r'<div class="(sect|collapsec|bucketbox|staysrow|cardrow|daycols|canvas|dayrail|win|cal|vartabs|toolrow)[ "]|<p class="(?:srcline|dragnote)'
        r'|<aside class="(sheet|tray)|<div class="pop\b|<div class="overlay', body):
        cls = m.group(1) or m.group(2) or ('srcline' if '<p' in m.group(0) else 'pop' if 'pop' in m.group(0) else 'overlay')
        if cls in ('sect', 'collapsec'):
            t = re.sub(r'<[^>]+>', '', body[m.end():body.find('</div>', m.end())])
            sigs.append(('sect:' if cls == 'sect' else 'bar:') + ' '.join(t.split())[:34])
        else:
            sigs.append(cls)
    return sigs

prev = None
for i, p in enumerate(parts):
    cur = sections(p)
    if prev is not None:
        gone = [x for x in prev if x not in cur]
        new = [x for x in cur if x not in prev]
        if gone or new:
            did = re.search(r'data-did="([^"]*)"', p).group(1)
            print(f'--- {i}→{i+1} --- did: {did[:90]}')
            for g in gone: print(f'   − {g}')
            for n in new:  print(f'   + {n}')
    prev = cur

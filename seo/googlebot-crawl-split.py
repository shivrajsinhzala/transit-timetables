# Googlebot fetches of transit URLs by page type, per day, from the nginx log. On the server:
#   scp src/data/indexed-stops.json stopwatch:/tmp/ && scp seo/googlebot-crawl-split.py stopwatch:/tmp/
#   ssh stopwatch "(zcat /var/log/nginx/access.log-*.gz; cat /var/log/nginx/access.log) | python3 /tmp/googlebot-crawl-split.py"
import re, sys, json, collections, gzip
idx = {k: set(v) for k, v in json.load(open('/tmp/indexed-stops.json')).items()}
LINE = re.compile(r'^(\S+) \S+ \S+ \[(\d+)/(\w+)/(\d+):[^\]]+\] "GET (\S+) [^"]*" (\d+) (\d+) "[^"]*" "([^"]*)"')
byday = collections.defaultdict(collections.Counter)
kinds = collections.Counter(); days = collections.Counter(); status = collections.Counter(); bytes_ = collections.Counter()
for raw in sys.stdin:
    if 'Googlebot' not in raw: continue
    m = LINE.match(raw)
    if not m: continue
    ip, d, mo, y, path, st, size, ua = m.groups()
    p = path.split('?')[0]
    mm = re.match(r'^/(ca|uk|ie|au|nz|us)/([^/]+)(?:/(.*))?$', p)
    if not mm and not re.match(r'^/(sitemaps?|sitemap-index|_a|geo|search|near|og|vendor|about|llms|robots)', p) and p != '/': continue
    if mm:
        cc, sysk, rest = mm.groups(); key = f'{cc}/{sysk}'
        if not rest: k = 'system page'
        elif rest.startswith('stop/'): k = 'stop (indexable)' if rest[5:] in idx.get(key, ()) else 'stop (noindex)'
        elif rest.startswith('from/'): k = 'journey/from'
        elif rest.startswith('hub/'): k = 'hub'
        elif '/' not in rest: k = 'route'
        else: k = 'other'
    else: k = 'site/assets'
    byday[f"{d}"][k] += 1
    kinds[k] += 1; days[f'{d} {mo}'] += 1; status[st] += 1; bytes_[k] += int(size)
tot = sum(kinds.values())
print('total', tot, 'days', len(days)); print('per day', dict(sorted(days.items())[-10:]))
for k, n in kinds.most_common(): print(f'{k:20s} {n:8d} {100*n/tot:5.1f}%  avg {bytes_[k]//max(n,1)//1024} KB')
print('status', dict(status))
for d in sorted(byday, key=int)[-8:]:
    c = byday[d]; print(d, 'Oct', ' '.join(f"{k.split(' ')[0][:7]}{'(ni)' if 'noindex' in k else ''}={c[k]}" for k in ['route', 'stop (noindex)', 'stop (indexable)', 'journey/from']))

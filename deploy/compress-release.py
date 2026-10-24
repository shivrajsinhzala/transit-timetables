#!/usr/bin/env python3
"""
Stores a release's pages gzipped, in place: route-8.html becomes route-8.gz, which nginx serves
for /ca/kelowna/route-8 (deploy/nginx.conf, location @page). For a release uploaded before
scripts/deploy-server.mjs compressed pages itself. Each .gz is written before its .html goes, so
nginx always has one of them. index.html and 404.html stay as they are (served by name).
Usage on the server: python3 compress-release.py /var/www/stopwatch/current/
"""
import gzip, os, sys
from multiprocessing import Pool

ROOT = sys.argv[1].rstrip('/')
KEEP = {'index.html', '404.html'}

def pages():
    for d, dirs, files in os.walk(ROOT):
        rel = os.path.relpath(d, ROOT)
        if rel.split(os.sep)[0] in ('_a', '_astro', 'vendor', 'geo'): dirs[:] = []; continue
        for f in files:
            if f.endswith('.html') and not (rel == '.' and f in KEEP):
                yield os.path.join(d, f)

def pack(path):
    st = os.stat(path)
    out = path[:-5] + '.gz'
    with open(path, 'rb') as f: data = gzip.compress(f.read(), compresslevel=6, mtime=0)
    with open(out + '.tmp', 'wb') as f: f.write(data)
    os.utime(out + '.tmp', (st.st_atime, st.st_mtime))
    os.replace(out + '.tmp', out)
    os.unlink(path)
    return st.st_size, len(data)

if __name__ == '__main__':
    before = after = n = 0
    with Pool(2) as p:
        for a, b in p.imap_unordered(pack, pages(), chunksize=200):
            before += a; after += b; n += 1
            if n % 20000 == 0: print(f'{n} pages, {before / 1e9:.2f} GB -> {after / 1e9:.2f} GB', flush=True)
    print(f'done: {n} pages, {before / 1e9:.2f} GB -> {after / 1e9:.2f} GB')

# Stopwatch backlink kit

Drafts only. Nothing here has been posted or sent. Review, edit in your own voice, and send from
your own accounts. Each piece links one specific, useful page, not just the home page.

Why links matter now: Google knows ~98,000 Stopwatch URLs but has indexed ~7,300 and lists 91,303
as "Discovered – currently not indexed" (Search Console, 12 Oct 2026). Links from real sites are
what raise a new site's crawl priority. For comparison, bustimes.org has 5,300 referring domains
(Semrush), and its most-linked route page is the scenic 888 Newcastle–Keswick bus: 190 domains,
mostly visitor and tourism sites.

---

## 1. Tourist routes: visitor sites, hotels, hostels, campgrounds

Tourism sites link to "how to get here without a car" timetables. These pages are the best fit:

| Page | Who links to it |
|---|---|
| https://transit.shivrajsinh.in/ca/whistler | Tourism Whistler, hotels in the Village, ski-rental shops, hostels |
| https://transit.shivrajsinh.in/ca/tofino-ucluelet | Tourism Tofino, Ucluelet Chamber, surf schools, campgrounds |
| https://transit.shivrajsinh.in/ca/salt-spring-island | Salt Spring Chamber of Commerce, B&Bs, Saturday Market listings |
| https://transit.shivrajsinh.in/au/skybus | Melbourne hotels' "getting here" pages, travel blogs on Melbourne airport transfers |
| https://transit.shivrajsinh.in/nz/queenstown | Destination Queenstown, backpacker hostels, ski-field transport pages |
| https://transit.shivrajsinh.in/ie/luas | Dublin hotels and hostels near Luas stops, Dublin visitor guides |

How to find contacts: search `"getting here" whistler hotel bus`, `tofino accommodation "by bus"`,
`site:*.co.nz queenstown "public transport"`. Look for pages that already list bus info or link to
an operator PDF: those are the ones that will swap or add a link.

### Email draft (edit the [brackets])

Subject: A free, phone-friendly [Whistler] bus timetable for your guests

Hi [name],

I run Stopwatch, a free timetable site built from [BC Transit]'s open data. Your
[getting here / transport] page links to [the operator's PDF / nothing yet] for the bus.

Our [Whistler] page shows every route's whole day on one screen, the next bus from each stop,
and a map, and it works offline once opened, which helps guests without roaming:
https://transit.shivrajsinh.in/ca/[whistler]

If it's useful for your guests, a link from that page would be great. It's refreshed weekly
from the official data, has no sign-up, and the ads are kept away from the timetables.

Thanks,
Shivrajsinh

Rules: one email per site, no follow-ups beyond one gentle nudge after two weeks, and only to
pages where the link genuinely helps visitors.

---

## 2. Local communities (Reddit and forums)

Most city subreddits ban self-promotion or allow it only in a weekly thread. **Read each
sub's rules first** and post only where it's allowed (some say "message the mods first"). Post
from your own account, reply to comments, and don't cross-post the same text everywhere.

Targets with real search impressions in Search Console: r/melbourne, r/dublin, r/VictoriaBC,
r/kelowna, r/vernonbc, r/Nanaimo, r/toronto (TTC), r/BritishColumbia.

### Post draft (r/VictoriaBC version; change the city and examples)

Title: I made a free site that shows a whole day of Victoria bus times on one screen

I got tired of pinching and zooming the BC Transit PDFs, so I built a timetable site from their
open data: https://transit.shivrajsinh.in/ca/victoria

- every route's full weekday, Saturday and Sunday timetable on one page
- the next bus from any stop, without an app or an account
- works offline after you've opened it once

It's a side project, and it's free. I'd love to hear what's wrong or missing, especially stops
with odd names or routes that look off.

(Not affiliated with BC Transit. Times are the published schedule, not live.)

---

## 3. Developer and product listings

### awesome-transit (GitHub, 1.8k stars)

Section "Using Data → Consumer Apps → Web Apps (closed source)". Entry in their format:

```
- [Stopwatch](https://transit.shivrajsinh.in) - Readable timetables for 90+ bus, tram, train and ferry systems in six countries, built from open GTFS: a route's whole day on one screen, next departures per stop, and offline use, with no app or account.
```

I can open this PR from your GitHub account when you say so (it's public).

### Other listings
- **AlternativeTo**: list Stopwatch as an alternative to Moovit and Transit app.
- **Product Hunt**: worth doing once the UK big operators and Brisbane/Adelaide are live, so the
  launch says "100+ systems".
- **Hacker News "Show HN"**: angle "98,000 static timetable pages from open GTFS on one small
  server": the build story (shards, nginx, no request limits) is what HN likes, not the product.

---

## 4. Data publishers

Several open-data portals have "apps using our data" or showcase pages, and those links count:
- BC Transit open data page, Transport for Ireland (NTA) developer showcase, PTV / Data Vic
  "showcase" entries, data.gov.uk / BODS case studies, Queensland and SA open-data showcases
  once Brisbane and Adelaide are added.

Each one usually has a simple form or email. Submit only after the system is live.

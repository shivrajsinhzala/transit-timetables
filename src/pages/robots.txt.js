/**
 * /robots.txt, generated so its Sitemap line and llms links follow SITE_URL (src/lib/site.js).
 * The bot rules are unchanged from the old static public/robots.txt. Noindexed pages are not
 * blocked here on purpose: Google has to crawl a page to see its noindex.
 */
import { SITE } from '../lib/site.js';
import { isMain } from '../lib/data.js';

export function GET() {
  if (!isMain) return new Response('');
  return new Response(`User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no
Allow: /

# Generative AI search engines, answer engines & web crawlers
User-agent: OAI-SearchBot
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: Applebot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Meta-ExternalAgent
Allow: /

User-agent: cohere-ai
Allow: /

User-agent: ExaSearchBot
Allow: /

User-agent: Reflectionbot
Allow: /

User-agent: PetalBot
Allow: /

User-agent: bingbot
Allow: /

User-agent: DuckDuckBot
Allow: /

User-agent: Googlebot
Allow: /

# Scrapers that send no visitors and crawl the whole site every day
User-agent: ShapBot
Disallow: /

User-agent: AionBot
Disallow: /

# LLM manifests and specifications for AI search agents and RAG engines
# ${SITE}/llms.txt
# ${SITE}/llms-full.txt

Sitemap: ${SITE}/sitemap-index.xml
`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

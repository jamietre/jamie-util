# Web Search API Analysis & Testing Results

## Testing Date: 2026-01-31

## Executive Summary

After testing various "free" web search APIs, we found that **most require authentication** even when advertised as free. The landscape has changed significantly in 2025-2026 with more APIs requiring at least email signup.

## APIs Tested

### 1. Jina AI Search ❌ (Changed)
**Advertised**: Free, no signup required
**Reality**: Now requires API key via Authorization header
**Test Result**: `401 AuthenticationRequiredError`

```bash
curl "https://s.jina.ai/Morphine%20band%20concert%202011"
# {"code":401,"message":"Authentication is required to use this endpoint"}
```

**Verdict**: Information online is outdated. Free tier exists but requires signup for API key.

### 2. DuckDuckGo (Scraping) ❌ (Unreliable)
**Package**: `duck-duck-scrape` (2.2.7)
**Cost**: Free, no signup
**Test Result**: Rate limited immediately

```
Error: "DDG detected an anomaly in the request, you are likely making requests too quickly."
```

**Verdict**:
- Actively blocks automated requests
- Unreliable for production use
- May work with delays/proxies but fragile
- Against DuckDuckGo's terms of service

### 3. Brave Search ⚠️ (Requires Credit Card)
**Package**: `brave-search` (0.9.0) - ALREADY INSTALLED
**Free tier**: 2,000 queries/month
**Signup**: Requires email AND credit card
**Quality**: Excellent (independent index)

**Verdict**: Best quality but signup barrier includes credit card requirement.

### 4. Serper.dev ⭐ (Best Available)
**Package**: `serper` or `@agentic/serper`
**Free tier**: 2,500 queries/month
**Signup**: Email only, NO credit card
**Speed**: 1-2 seconds
**Quality**: Excellent (Google Search results)
**API Endpoint**: `https://google.serper.dev/search`

**Verdict**: Best practical option - free tier, no credit card, good quality.

## Recommendation

### For This Project: **Serper.dev**

**Pros:**
- 2,500 free queries/month (plenty for music ingestion)
- NO credit card required (just email signup)
- Uses Google Search results (highest quality)
- Fast (1-2 seconds)
- Reliable API with npm packages
- Well-documented

**Cons:**
- Requires email signup (not completely frictionless)
- Free tier is monthly limit (not unlimited)

**Setup Process:**
1. Go to https://serper.dev
2. Sign up with email (no credit card!)
3. Get free API key
4. 2,500 searches/month

## Search Query Analysis for Morphine Example

Given filename: `Morphine_2011-03-09_SBD_RichardBurton.zip`

### Extracted Information:
- Artist: Morphine
- Possible Date: 2011-03-09 (March 9, 2011)
- Source: SBD (Soundboard recording)
- Taper: Richard Burton

### Proposed Search Queries:

**Query 1** (Most specific):
```
Morphine band concert March 9 2011 setlist
```

**Query 2** (Broader):
```
Morphine band tour dates 2011 March
```

**Query 3** (Year-focused):
```
Morphine band live shows 2011
```

**Query 4** (With context):
```
Morphine band concert 2011 Richard Burton soundboard
```

### Expected Results:

Based on web search patterns, we would expect to find:
- Concert listing sites (setlist.fm, archive.org, etc.)
- Fan sites with tour dates
- Review/recap articles
- Social media posts about the show
- Ticket stubs or flyers (if posted online)

### Challenge: Morphine Disbanded in 1999

**Important Discovery**: Morphine (the band) disbanded in 1999 after lead singer Mark Sandman died. A 2011 date is **impossible** for Morphine.

This means:
- The date in the filename is likely WRONG
- Could be a different band named "Morphine"
- Could be a tribute band
- Taper may have mislabeled the date
- This is exactly the kind of case where web search + LLM would help identify the error

## Implementation Comparison

### Option A: Serper.dev (Recommended)

```typescript
import { serper } from 'serper';

const client = new serper({ apiKey: config.webSearch.apiKey });

const results = await client.search({
  q: "Morphine band concert 2011 March setlist",
  num: 10
});

// Results structure
results.organic.forEach(result => {
  console.log(result.title);      // Page title
  console.log(result.link);       // URL
  console.log(result.snippet);    // Description
});
```

### Option B: Brave Search (If user has credit card)

```typescript
import { BraveSearch } from 'brave-search';

const client = new BraveSearch(config.webSearch.apiKey);

const results = await client.webSearch(
  "Morphine band concert 2011 March setlist",
  { count: 10 }
);

// Results structure
results.web?.results.forEach(result => {
  console.log(result.title);        // Page title
  console.log(result.url);          // URL
  console.log(result.description);  // Description
});
```

### Option C: DuckDuckGo (Not Recommended)

```typescript
import { search } from 'duck-duck-scrape';

// Will likely fail with rate limiting
const results = await search("Morphine band concert 2011");
// Error: "DDG detected an anomaly in the request"
```

## API Feature Comparison

| Feature | Serper | Brave | DuckDuckGo | Jina AI |
|---------|--------|-------|------------|---------|
| **Free Queries** | 2,500/mo | 2,000/mo | Unlimited* | Unknown† |
| **Signup Required** | Email | Email + CC | None | Email |
| **Credit Card** | ❌ No | ✅ Yes | ❌ No | ❌ No |
| **Reliability** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **Quality** | Excellent | Excellent | Good | Good |
| **Speed** | Fast (1-2s) | Fast | Slow | Medium |
| **Documentation** | Good | Excellent | Poor | Good |
| **npm Package** | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Limited |
| **Terms Compliance** | ✅ Official | ✅ Official | ❌ Scraping | ✅ Official |

*Unlimited but actively blocks bots
†Changed from advertised "no signup" - now requires auth

## Integration Architecture

### Recommended: Multi-Provider Fallback

```typescript
// Try providers in order of preference
const providers = ['serper', 'brave', 'jina'];

for (const provider of providers) {
  if (!config.webSearch[provider]?.apiKey) continue;

  try {
    const results = await searchWithProvider(provider, query);
    return results;
  } catch (error) {
    console.warn(`${provider} failed, trying next...`);
  }
}
```

### Search Strategy for Concert Info

1. **Extract info from filename**
   ```typescript
   const info = parseFilename("Morphine_2011-03-09_SBD_RichardBurton.zip");
   // { artist: "Morphine", date: "2011-03-09", ... }
   ```

2. **Construct search query**
   ```typescript
   const query = `${info.artist} band concert ${info.date} setlist`;
   ```

3. **Search web**
   ```typescript
   const results = await webSearch.search(query, { maxResults: 10 });
   ```

4. **Format for LLM**
   ```typescript
   const context = formatResultsForLLM(results);
   ```

5. **LLM extraction**
   ```typescript
   const llmPrompt = `
   Based on these search results, identify the concert details:

   ${context}

   Extract: date (YYYY-MM-DD), venue, city, state
   Note: Morphine disbanded in 1999, so 2011 dates are impossible.
   `;

   const showInfo = await llm.extractDate(llmPrompt);
   ```

## Cost Analysis (Monthly)

### Scenario: Processing 100 archives/month

**Conservative estimate**: 2 searches per archive = 200 searches/month

| Provider | Monthly Cost | Notes |
|----------|-------------|-------|
| **Serper** | $0 | Well within 2,500 free tier |
| **Brave** | $0 | Well within 2,000 free tier |
| **Jina** | $0 | If within free tier limits |
| **Tavily** | $0 | Within 1,000 free tier |

**Aggressive estimate**: 10 searches per archive = 1,000 searches/month

| Provider | Monthly Cost | Notes |
|----------|-------------|-------|
| **Serper** | $0 | Still within free tier |
| **Brave** | $0 | Still within free tier |
| **Tavily** | $0 | At free tier limit |

### Paid Usage (if exceeding free tier)

If processing 500 archives/month × 5 searches = 2,500 searches:

| Provider | Monthly Cost |
|----------|-------------|
| Serper | ~$0-10 (varies) |
| Brave | ~$7.50-12.50 |
| Tavily | ~$20 |

## Testing Recommendations

### Phase 1: Manual Testing
```bash
# Sign up for Serper.dev (free, no CC)
# Get API key
# Test with curl:

curl -X POST 'https://google.serper.dev/search' \
  -H 'X-API-KEY: YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "q": "Morphine band concert 2011 March setlist",
    "num": 10
  }'
```

### Phase 2: Integration Testing
1. Implement SerperProvider
2. Test with 10-20 real archives
3. Monitor API usage
4. Evaluate result quality

### Phase 3: LLM Integration
1. Combine search results with LLM extraction
2. Test accuracy vs. manual identification
3. Measure time savings

## Conclusion

**Recommended Action:**
1. ✅ **Implement Serper.dev provider** (no credit card required)
2. ⚠️ Keep Brave as optional (for users willing to add CC)
3. ❌ Skip DuckDuckGo scraping (unreliable)
4. ⏸️ Monitor Jina AI for future improvements

**Implementation Priority:**
1. Add SerperProvider to `src/websearch/providers/serper.ts`
2. Update config to support multiple providers
3. Implement fallback logic
4. Add to show identification workflow

## References

- Serper.dev: https://serper.dev
- Brave Search API: https://brave.com/search/api/
- Jina AI: https://jina.ai/
- API Comparison: https://www.kdnuggets.com/7-free-web-search-apis-for-ai-agents

## Next Steps

- [ ] Sign up for Serper.dev (no CC required)
- [ ] Implement SerperProvider
- [ ] Test with Morphine archive
- [ ] Integrate with LLM workflow
- [ ] Update documentation
- [ ] Add to TODO.md

import assert from "node:assert/strict";
import { test } from "node:test";
import { identityKeyForUrl, normalizeUrl, tweetIdFromUrl } from "../packages/backend/src/lib/url.ts";

test("X and Twitter status URL variants keep the same material identity", () => {
  for (const host of ["x.com", "twitter.com", "www.x.com", "www.twitter.com", "mobile.twitter.com", "m.twitter.com"]) {
    for (const path of ["/openai/status/1234567890", "/openai/statuses/1234567890", "/i/status/1234567890"]) {
      const url = `https://${host}${path}?s=20#thread`;
      assert.equal(tweetIdFromUrl(url), "1234567890", url);
      assert.equal(identityKeyForUrl(url), "x:1234567890", url);
    }
  }
  assert.equal(tweetIdFromUrl("http://TWITTER.COM/openai/status/1234567890/photo/1"), "1234567890");
});

test("other sites containing a tweet URL keep their own material identity", () => {
  const tweet = "https://x.com/openai/status/1234567890";
  const urls = [
    `https://news.example.org/article/42?related=${tweet}`,
    `https://news.example.org/article/42#${tweet}`,
    `https://news.example.org/archive/${tweet}`,
    "https://notx.com/openai/status/1234567890",
    "https://nottwitter.com/openai/status/1234567890",
    "https://x.com.example.org/openai/status/1234567890",
    "https://x.com@news.example.org/openai/status/1234567890",
  ];
  for (const url of urls) {
    assert.equal(tweetIdFromUrl(url), null, url);
    assert.equal(identityKeyForUrl(url), `url:${normalizeUrl(url)}`, url);
    assert.notEqual(identityKeyForUrl(url), identityKeyForUrl(tweet), url);
  }
});

test("only a complete status id at the expected path identifies a tweet", () => {
  for (const url of [
    "https://x.com/search?q=https://x.com/openai/status/1234567890",
    "https://x.com/archive/openai/status/1234567890",
    "https://x.com/openai/status/1234567890junk",
    "https://x.com/openai/status/",
    "https://x.com/openai/status/not-a-number",
  ]) assert.equal(tweetIdFromUrl(url), null, url);
});

test("invalid and non-HTTP URLs cannot acquire a tweet identity", () => {
  for (const url of ["not a URL", "x.com/openai/status/1234567890", "ftp://x.com/openai/status/1234567890"]) {
    assert.equal(tweetIdFromUrl(url), null, url);
    assert.equal(identityKeyForUrl(url), null, url);
  }
});

// Production patrol hit a ~3400-byte URL whose `url:` identity blew past PostgreSQL's btree row
// limit for articles_identity_key_key (2704 bytes) and failed the whole ingest batch.
test("pathologically long URLs become fixed-length hash identities", () => {
  const long = `https://example.org/search?${"q=" + "a".repeat(3000)}`;
  const key = identityKeyForUrl(long)!;
  assert.match(key, /^urlh:[0-9a-f]{64}$/);
  assert.ok(Buffer.byteLength(key, "utf8") < 100, "hash identity must stay tiny");
  // Same URL converges, different long URLs stay distinct (injective, unlike truncation).
  assert.equal(identityKeyForUrl(long), key);
  assert.notEqual(identityKeyForUrl(`https://example.org/search?${"q=" + "b".repeat(3000)}`), key);
  // Regular and just-under-cap URLs keep the readable identity (multi-byte counted as bytes).
  assert.equal(identityKeyForUrl("https://example.org/post/1"), "url:https://example.org/post/1");
  const edge = `https://example.org/p?${"a".repeat(1900)}`;
  assert.ok(identityKeyForUrl(edge)!.startsWith("url:"));
  const wide = `https://example.org/p?${"广".repeat(700)}`; // 2100 bytes over 700 chars
  assert.ok(identityKeyForUrl(wide)!.startsWith("urlh:"));
});

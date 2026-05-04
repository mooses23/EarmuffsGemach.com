/**
 * Unit tests for shared/region-utils.ts
 *
 * Run with:  npx tsx shared/region-utils.test.ts
 *
 * These tests act as a safety net when new regions are added. The matrix below
 * documents every classification rule. If you add a new region slug/name and
 * its restocking behaviour isn't covered, add a row here before deploying.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getShippingRegion, getRegionalBanzInfo } from './region-utils.js';

// ---------------------------------------------------------------------------
// getShippingRegion
// ---------------------------------------------------------------------------

test('getShippingRegion — US slug variations → us-canada', () => {
  assert.equal(getShippingRegion('united-states', ''), 'us-canada');
  assert.equal(getShippingRegion('us', ''), 'us-canada');
  assert.equal(getShippingRegion('usa', ''), 'us-canada');
  assert.equal(getShippingRegion('united-states-east', ''), 'us-canada');
});

test('getShippingRegion — US name variations → us-canada', () => {
  assert.equal(getShippingRegion('', 'United States'), 'us-canada');
  assert.equal(getShippingRegion('', 'USA'), 'us-canada');
  assert.equal(getShippingRegion('', 'United States (East)'), 'us-canada');
});

test('getShippingRegion — Canada slug variations → us-canada', () => {
  assert.equal(getShippingRegion('canada', ''), 'us-canada');
  assert.equal(getShippingRegion('canada-east', ''), 'us-canada');
  assert.equal(getShippingRegion('canada-west', ''), 'us-canada');
});

test('getShippingRegion — Canada name variations → us-canada', () => {
  assert.equal(getShippingRegion('', 'Canada'), 'us-canada');
  assert.equal(getShippingRegion('', 'Canada East'), 'us-canada');
});

test('getShippingRegion — Australia → international', () => {
  assert.equal(getShippingRegion('australia', ''), 'international');
  assert.equal(getShippingRegion('', 'Australia'), 'international');
});

test('getShippingRegion — UK/Europe → international', () => {
  assert.equal(getShippingRegion('uk', ''), 'international');
  assert.equal(getShippingRegion('europe', ''), 'international');
  assert.equal(getShippingRegion('united-kingdom', ''), 'international');
  assert.equal(getShippingRegion('', 'United Kingdom'), 'international');
  assert.equal(getShippingRegion('', 'Europe'), 'international');
});

test('getShippingRegion — New Zealand (no rule) → international', () => {
  assert.equal(getShippingRegion('new-zealand', ''), 'international');
  assert.equal(getShippingRegion('', 'New Zealand'), 'international');
});

test('getShippingRegion — South Africa (no rule) → international', () => {
  assert.equal(getShippingRegion('south-africa', ''), 'international');
  assert.equal(getShippingRegion('', 'South Africa'), 'international');
});

test('getShippingRegion — Israel (no rule) → international', () => {
  assert.equal(getShippingRegion('israel', ''), 'international');
  assert.equal(getShippingRegion('', 'Israel'), 'international');
});

test('getShippingRegion — empty inputs → international', () => {
  assert.equal(getShippingRegion(), 'international');
  assert.equal(getShippingRegion('', ''), 'international');
});

test('getShippingRegion — case insensitivity', () => {
  assert.equal(getShippingRegion('CANADA', ''), 'us-canada');
  assert.equal(getShippingRegion('', 'UNITED STATES'), 'us-canada');
});

// ---------------------------------------------------------------------------
// getRegionalBanzInfo
// ---------------------------------------------------------------------------

test('getRegionalBanzInfo — Australia slug → banzworld.com.au', () => {
  const result = getRegionalBanzInfo('australia', '');
  assert.ok(result, 'Expected non-null result for Australia');
  assert.equal(result!.url, 'https://banzworld.com.au');
  assert.equal(result!.label, 'banzworld.com.au');
});

test('getRegionalBanzInfo — Australia name → banzworld.com.au', () => {
  const result = getRegionalBanzInfo('', 'Australia');
  assert.ok(result);
  assert.equal(result!.url, 'https://banzworld.com.au');
});

test('getRegionalBanzInfo — Australia East/West (contains "australia") → banzworld.com.au', () => {
  assert.ok(getRegionalBanzInfo('australia-east', ''));
  assert.ok(getRegionalBanzInfo('', 'Australia West'));
});

test('getRegionalBanzInfo — UK slug → banzworld.co.uk', () => {
  const result = getRegionalBanzInfo('uk', '');
  assert.ok(result);
  assert.equal(result!.url, 'https://banzworld.co.uk');
  assert.equal(result!.label, 'banzworld.co.uk');
});

test('getRegionalBanzInfo — united-kingdom slug → banzworld.co.uk', () => {
  const result = getRegionalBanzInfo('united-kingdom', '');
  assert.ok(result);
  assert.equal(result!.url, 'https://banzworld.co.uk');
});

test('getRegionalBanzInfo — Europe slug → banzworld.co.uk', () => {
  const result = getRegionalBanzInfo('europe', '');
  assert.ok(result);
  assert.equal(result!.url, 'https://banzworld.co.uk');
});

test('getRegionalBanzInfo — UK/Europe name variations → banzworld.co.uk', () => {
  assert.ok(getRegionalBanzInfo('', 'United Kingdom'));
  assert.ok(getRegionalBanzInfo('', 'UK'));
  assert.ok(getRegionalBanzInfo('', 'Europe'));
});

test('getRegionalBanzInfo — US/Canada → null (use US site)', () => {
  assert.equal(getRegionalBanzInfo('us', ''), null);
  assert.equal(getRegionalBanzInfo('canada', ''), null);
  assert.equal(getRegionalBanzInfo('', 'United States'), null);
  assert.equal(getRegionalBanzInfo('', 'Canada'), null);
});

test('getRegionalBanzInfo — New Zealand (no rule) → null', () => {
  assert.equal(getRegionalBanzInfo('new-zealand', ''), null);
  assert.equal(getRegionalBanzInfo('', 'New Zealand'), null);
});

test('getRegionalBanzInfo — Israel (no rule) → null', () => {
  assert.equal(getRegionalBanzInfo('israel', ''), null);
  assert.equal(getRegionalBanzInfo('', 'Israel'), null);
});

test('getRegionalBanzInfo — South Africa (no rule) → null', () => {
  assert.equal(getRegionalBanzInfo('south-africa', ''), null);
  assert.equal(getRegionalBanzInfo('', 'South Africa'), null);
});

test('getRegionalBanzInfo — empty inputs → null', () => {
  assert.equal(getRegionalBanzInfo(), null);
  assert.equal(getRegionalBanzInfo('', ''), null);
});

test('getRegionalBanzInfo — case insensitivity', () => {
  assert.ok(getRegionalBanzInfo('AUSTRALIA', ''));
  assert.ok(getRegionalBanzInfo('', 'UNITED KINGDOM'));
  assert.equal(getRegionalBanzInfo('ISRAEL', ''), null);
});

// ---------------------------------------------------------------------------
// Substring false-positive guard: 'uk' must match as a whole word/segment
// ---------------------------------------------------------------------------

test('getRegionalBanzInfo — ukraine slug must NOT match UK rule', () => {
  assert.equal(getRegionalBanzInfo('ukraine', ''), null,
    'ukraine slug contains "uk" but should not be routed to banzworld.co.uk');
});

test('getRegionalBanzInfo — Ukraine name must NOT match UK rule', () => {
  assert.equal(getRegionalBanzInfo('', 'Ukraine'), null,
    'Ukraine name contains "uk" but should not be routed to banzworld.co.uk');
});

test('getRegionalBanzInfo — uk slug with suffix (uk-east) → banzworld.co.uk', () => {
  assert.ok(getRegionalBanzInfo('uk-east', ''),
    'uk-east should still match the UK rule');
});

test('getRegionalBanzInfo — slug with uk as prefix segment (uk-ireland) → banzworld.co.uk', () => {
  assert.ok(getRegionalBanzInfo('uk-ireland', ''));
});

test('getShippingRegion — ukraine → international (no false positive)', () => {
  assert.equal(getShippingRegion('ukraine', ''), 'international');
  assert.equal(getShippingRegion('', 'Ukraine'), 'international');
});

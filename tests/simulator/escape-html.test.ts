import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../../src/simulator/escape-html';

describe('escapeHtml', () => {
  it('escapes markup and quote characters', () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe(
      '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;',
    );
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('HydraOne DevTools 1.0')).toBe('HydraOne DevTools 1.0');
  });
});

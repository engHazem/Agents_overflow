import { describe, expect, it } from 'vitest';

import { buildTsQuery, tokenizeForTsQuery } from './fts.js';

describe('buildTsQuery', () => {
  it('ORs its terms rather than ANDing them', () => {
    // to_tsquery ANDs by default; an AND over a whole trace matches nothing.
    expect(buildTsQuery('cannot find module lodash')).toContain(' | ');
  });

  it('returns null when nothing usable survives tokenization', () => {
    expect(buildTsQuery('a of the 12 34')).toBeNull();
  });

  it('strips tsquery metacharacters instead of escaping them', () => {
    const query = buildTsQuery("error & bad | worse ! (nope) 'quoted'") ?? '';
    expect(query).not.toMatch(/[&!():*']/);
  });

  it('builds the query from the error message, not the stack frames', () => {
    // Regression: frame mechanics dominated the query and matched every
    // document containing a Node stack trace. Measured on this exact input,
    // the correct answer ranked 15th of 16 before the fix.
    const query =
      buildTsQuery(
        [
          'Error: connect ECONNREFUSED <ip>:<port>',
          'at TCPConnectWrap.afterConnect [as oncomplete] (node:net:<line>:<col>)',
          'at <node_modules>/pg/lib/client.js:<line>:<col>',
        ].join('\n'),
      ) ?? '';

    expect(query).toContain('econnrefused');
    // Frame machinery must not be in the query at all.
    expect(query).not.toContain('tcpconnectwrap');
    expect(query).not.toContain('afterconnect');
    expect(query).not.toContain('oncomplete');
    expect(query).not.toContain('node_modules');
  });

  it('keeps message words that would be noise inside a frame', () => {
    // `module` is mechanics in `at Module._load`, but it is the whole signal in
    // "Cannot find module" — which is why selection is per line, not by a
    // stopword list.
    const query =
      buildTsQuery(
        ["Error: Cannot find module 'lodash'", 'at Module._load (node:internal/modules/cjs/loader)'].join('\n'),
      ) ?? '';

    expect(query).toContain('module');
    expect(query).toContain('lodash');
  });

  it('falls back to frames when the message alone is too thin', () => {
    // Some errors really are only identifiable by where they were thrown.
    const query = buildTsQuery(['Error', 'at ReactDOMHydrationRoot.render (react-dom.js)'].join('\n')) ?? '';
    expect(query).toContain('reactdomhydrationroot');
  });
});

describe('tokenizeForTsQuery', () => {
  it('drops stopwords, short fragments and bare numbers', () => {
    const terms = tokenizeForTsQuery('the ENOENT of a 1234 file at line 42');
    expect(terms).toContain('enoent');
    expect(terms).toContain('file');
    expect(terms).not.toContain('the');
    expect(terms).not.toContain('1234');
  });

  it('deduplicates', () => {
    const terms = tokenizeForTsQuery('error error error enoent');
    expect(terms.filter((t) => t === 'error')).toHaveLength(1);
  });
});

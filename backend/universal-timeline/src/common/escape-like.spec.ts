import { escapeLikePattern } from './escape-like';

describe('escapeLikePattern', () => {
  it('leaves ordinary text untouched', () => {
    expect(escapeLikePattern('visual studio code')).toBe('visual studio code');
  });

  it('escapes the multi-character wildcard', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
  });

  it('escapes the single-character wildcard', () => {
    expect(escapeLikePattern('merge_service')).toBe('merge\\_service');
  });

  it('escapes backslashes before introducing its own', () => {
    // A lone backslash must become a literal backslash, not an escape for the next char
    expect(escapeLikePattern('C:\\Users')).toBe('C:\\\\Users');
    expect(escapeLikePattern('\\%')).toBe('\\\\\\%');
  });

  it('handles a pattern made entirely of wildcards', () => {
    expect(escapeLikePattern('%_%')).toBe('\\%\\_\\%');
  });

  it('handles empty input', () => {
    expect(escapeLikePattern('')).toBe('');
  });
});

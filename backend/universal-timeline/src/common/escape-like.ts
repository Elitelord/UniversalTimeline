/**
 * Escapes the LIKE/ILIKE wildcard characters in user-supplied search text.
 *
 * Without this, typing `%` matches every row and `_` matches any single character —
 * surprising behaviour for anyone who just wants to find a literal percent sign.
 * Callers must pair this with `ESCAPE '\'` in the SQL, since backslash is not the
 * default escape character in every configuration.
 *
 * Order matters: backslash has to be doubled first, or it would re-escape the
 * backslashes this function itself introduces.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

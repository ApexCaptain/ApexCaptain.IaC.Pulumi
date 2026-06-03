export function isValidFileModeString(fileModeString: string): boolean {
  const normalized = fileModeString.trim();
  if (!normalized) {
    return false;
  }

  // Numeric/octal modes (e.g. 600, 0644, 1755, 4755)
  const octalModeRegex = /^[0-7]{3,4}$/;
  if (octalModeRegex.test(normalized)) {
    return true;
  }

  // Symbolic modes (e.g. u=rw,go=, a+r, go-w, u+s, a+X)
  // '=' allows empty permissions (e.g. go=), while '+'/'-' require at least one token.
  const symbolicClauseRegex =
    /^(?:[ugoa]*)(?:=[rwxXstugo]*|[+\-][rwxXstugo]+)$/;
  const clauses = normalized.split(',');
  if (clauses.length === 0 || clauses.some(clause => clause.length === 0)) {
    return false;
  }

  return clauses.every(clause => symbolicClauseRegex.test(clause));
}

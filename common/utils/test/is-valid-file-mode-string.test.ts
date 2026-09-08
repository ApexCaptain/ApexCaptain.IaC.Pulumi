import { isValidFileModeString } from '../src/functions/is-valid-file-mode-string.function';

describe('isValidFileModeString', () => {
  test.each(['600', '0644', '1755', '4755'])('accepts octal %s', mode => {
    expect(isValidFileModeString(mode)).toBe(true);
  });

  test.each(['u=rw,go=', 'a+r', 'go-w', 'u+s', 'a+X'])('accepts symbolic %s', mode => {
    expect(isValidFileModeString(mode)).toBe(true);
  });

  test('rejects empty and whitespace', () => {
    expect(isValidFileModeString('')).toBe(false);
    expect(isValidFileModeString('   ')).toBe(false);
  });

  test('rejects malformed tokens', () => {
    expect(isValidFileModeString('999')).toBe(false);
    expect(isValidFileModeString('rwxrwxrwx')).toBe(false);
    expect(isValidFileModeString('u+')).toBe(false);
    expect(isValidFileModeString('u=rw,')).toBe(false);
  });
});

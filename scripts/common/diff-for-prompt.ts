import { getGitOutput } from './git';

const DEFAULT_MAX_TOTAL_CHARS = 24_000;
const DEFAULT_MAX_CHARS_PER_FILE = 5_000;
const DEFAULT_MAX_CHARS_PER_NOISE_FILE = 400;

/** 커밋 메시지 프롬프트에서 본문 대신 stat·파일명만 참고할 저우선 파일 패턴 */
const NOISE_FILE_PATTERNS = [
  /^\.diagnosis\//,
  /(?:^|\/)README\.md$/i,
  /(?:^|\/)pnpm-lock\.yaml$/i,
  /(?:^|\/)package-lock\.json$/i,
  /(?:^|\/)yarn\.lock$/i,
] as const;

/**
 * diff 본문을 프롬프트에 넣지 않는 경로 prefix.
 * 해당 파일은 [Git Diff Stat]·[변경 파일 목록]으로만 판단합니다.
 */
export const DEFAULT_DIFF_EXCLUDED_PATH_PREFIXES = [
  'common/bridged-provider/sdks/',
] as const;

const CODE_FILE_PATTERN =
  /\.(ts|tsx|js|jsx|py|go|tf|yaml|yml|json|sh|sql|rs|java|kt)$/i;

export type DiffFileChunk = {
  filePath: string;
  content: string;
  isNoise: boolean;
  isDiffExcluded: boolean;
};

export type PreparedDiffForPrompt = {
  diffExcerpt: string;
  truncated: boolean;
  includedFiles: string[];
  abbreviatedFiles: string[];
  omittedFiles: string[];
  diffExcludedFiles: string[];
};

export type PrepareDiffForPromptOptions = {
  maxTotalChars?: number;
  maxCharsPerFile?: number;
  maxCharsPerNoiseFile?: number;
  diffExcludedPathPrefixes?: readonly string[];
};

function parseDiffFilePath(diffHeaderLine: string): string {
  const renameMatch = diffHeaderLine.match(/^a\/(.+?) b\/(.+?)(?:\s|$)/);
  if (renameMatch) {
    return renameMatch[2];
  }

  const singleMatch = diffHeaderLine.match(/^a\/(.+?)(?:\s|$)/);
  return singleMatch?.[1] ?? diffHeaderLine.trim();
}

export function isDiffExcludedPath(
  filePath: string,
  excludedPrefixes: readonly string[],
): boolean {
  const normalized = filePath.replace(/^a\/|b\//, '');
  return excludedPrefixes.some(
    prefix =>
      normalized.startsWith(prefix) ||
      normalized.includes(`/${prefix}`) ||
      filePath.startsWith(prefix),
  );
}

/**
 * Git unified diff를 파일 단위 청크로 분리합니다.
 */
export function splitDiffByFile(
  diff: string,
  options: Pick<PrepareDiffForPromptOptions, 'diffExcludedPathPrefixes'> = {},
): DiffFileChunk[] {
  const excludedPrefixes =
    options.diffExcludedPathPrefixes ?? DEFAULT_DIFF_EXCLUDED_PATH_PREFIXES;

  if (!diff.trim()) {
    return [];
  }

  return diff
    .split(/^diff --git /m)
    .filter(Boolean)
    .map(part => {
      const headerLine = part.split('\n', 1)[0] ?? '';
      const filePath = parseDiffFilePath(headerLine);
      const isNoise = NOISE_FILE_PATTERNS.some(pattern =>
        pattern.test(filePath),
      );
      const isDiffExcluded = isDiffExcludedPath(filePath, excludedPrefixes);

      return {
        filePath,
        content: `diff --git ${part}`.trimEnd(),
        isNoise,
        isDiffExcluded,
      };
    });
}

function compareFilePriority(a: DiffFileChunk, b: DiffFileChunk): number {
  if (a.isDiffExcluded !== b.isDiffExcluded) {
    return a.isDiffExcluded ? 1 : -1;
  }

  if (a.isNoise !== b.isNoise) {
    return a.isNoise ? 1 : -1;
  }

  const aIsCode = CODE_FILE_PATTERN.test(a.filePath);
  const bIsCode = CODE_FILE_PATTERN.test(b.filePath);
  if (aIsCode !== bIsCode) {
    return aIsCode ? -1 : 1;
  }

  return a.content.length - b.content.length;
}

function abbreviateChunk(
  chunk: DiffFileChunk,
  maxChars: number,
): { content: string; abbreviated: boolean } {
  if (chunk.content.length <= maxChars) {
    return { content: chunk.content, abbreviated: false };
  }

  const lines = chunk.content.split('\n');
  const headerLines: string[] = [];
  let hunkStart = 0;

  for (let index = 0; index < lines.length; index += 1) {
    headerLines.push(lines[index] ?? '');
    if (lines[index]?.startsWith('@@')) {
      hunkStart = index;
      break;
    }
  }

  const prefix = headerLines.join('\n');
  const hunkLines = lines.slice(hunkStart);
  const remaining = maxChars - prefix.length - 80;

  if (remaining <= 0) {
    return {
      content: `${prefix}\n... (diff abbreviated: ${chunk.filePath})`,
      abbreviated: true,
    };
  }

  let body = '';
  for (const line of hunkLines) {
    const next = body ? `${body}\n${line}` : line;
    if (next.length > remaining) {
      break;
    }
    body = next;
  }

  return {
    content: `${prefix}\n${body}\n... (diff abbreviated: ${chunk.filePath}, ${chunk.content.length} chars total)`,
    abbreviated: true,
  };
}

/**
 * LLM 프롬프트용 diff를 파일별 상한·저우선 파일 축약·코드 우선 순서로 구성합니다.
 * diffExcludedPathPrefixes에 해당하는 파일은 diff 본문에서 제외합니다.
 */
export function prepareDiffForPrompt(
  fullDiff: string,
  options: PrepareDiffForPromptOptions = {},
): PreparedDiffForPrompt {
  const maxTotalChars = options.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;
  const maxCharsPerFile = options.maxCharsPerFile ?? DEFAULT_MAX_CHARS_PER_FILE;
  const maxCharsPerNoiseFile =
    options.maxCharsPerNoiseFile ?? DEFAULT_MAX_CHARS_PER_NOISE_FILE;
  const excludedPrefixes =
    options.diffExcludedPathPrefixes ?? DEFAULT_DIFF_EXCLUDED_PATH_PREFIXES;

  const allChunks = splitDiffByFile(fullDiff, {
    diffExcludedPathPrefixes: excludedPrefixes,
  });
  const diffExcludedFiles = allChunks
    .filter(chunk => chunk.isDiffExcluded)
    .map(chunk => chunk.filePath);
  const chunks = allChunks
    .filter(chunk => !chunk.isDiffExcluded)
    .sort(compareFilePriority);

  const includedFiles: string[] = [];
  const abbreviatedFiles: string[] = [];
  const omittedFiles: string[] = [];
  const parts: string[] = [];
  let usedChars = 0;

  for (const chunk of chunks) {
    const perFileLimit = chunk.isNoise ? maxCharsPerNoiseFile : maxCharsPerFile;
    const { content, abbreviated } = abbreviateChunk(chunk, perFileLimit);
    const separator = parts.length > 0 ? '\n\n' : '';
    const nextLength = usedChars + separator.length + content.length;

    if (nextLength > maxTotalChars) {
      const currentIndex = chunks.indexOf(chunk);
      omittedFiles.push(
        ...chunks.slice(currentIndex).map(item => item.filePath),
      );
      break;
    }

    parts.push(content);
    usedChars = nextLength;
    includedFiles.push(chunk.filePath);
    if (abbreviated) {
      abbreviatedFiles.push(chunk.filePath);
    }
  }

  return {
    diffExcerpt: parts.join('\n\n'),
    truncated: omittedFiles.length > 0,
    includedFiles,
    abbreviatedFiles,
    omittedFiles,
    diffExcludedFiles,
  };
}

/**
 * staged/unstaged stat 출력을 하나로 합칩니다.
 */
export function getCombinedDiffStat(): string {
  const stagedStat = getGitOutput('git diff --staged --stat');
  const unstagedStat = getGitOutput('git diff --stat');
  return [stagedStat, unstagedStat].filter(Boolean).join('\n');
}

/**
 * git status --porcelain 한 줄에서 변경 파일 경로를 추출합니다.
 */
export function parseChangedFilesFromStatus(statusOutput: string): string[] {
  return statusOutput
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.slice(3).trim());
}

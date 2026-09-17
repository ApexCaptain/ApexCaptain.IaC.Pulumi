import fs from 'node:fs';
import path from 'node:path';

const DOCS_DIR = 'docs';
const SCHEDULE_FILE = path.join(DOCS_DIR, 'schedule.md');
const EXCLUDED_PREFIXES = [
  path.join(DOCS_DIR, 'superpowers'),
  path.join(DOCS_DIR, 'diagnosis'),
] as const;

const ISSUE_DIRS = [
  path.join(DOCS_DIR, 'issues'),
  path.join(DOCS_DIR, 'resolved'),
] as const;

const MAX_RELATED_DOCS = 5;

export type DocMeta = {
  relativePath: string;
  title: string;
};

function isExcludedDocPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  return EXCLUDED_PREFIXES.some(prefix =>
    normalized.startsWith(prefix.replace(/\\/g, '/')),
  );
}

function extractMarkdownTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? path.basename(content, '.md');
}

function listDocMetaFiles(): DocMeta[] {
  const result: DocMeta[] = [];

  for (const dir of ISSUE_DIRS) {
    const absoluteDir = path.join(process.cwd(), dir);
    if (!fs.existsSync(absoluteDir)) {
      continue;
    }
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue;
      }
      const relativePath = path.join(dir, entry.name).replace(/\\/g, '/');
      if (isExcludedDocPath(relativePath)) {
        continue;
      }
      const content = fs.readFileSync(
        path.join(absoluteDir, entry.name),
        'utf-8',
      );
      result.push({
        relativePath,
        title: extractMarkdownTitle(content),
      });
    }
  }

  result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return result;
}

function packageMatchTokens(relativePackagePath: string, packageName: string) {
  const slug = path.basename(relativePackagePath);
  const slugKebab = slug.replace(/_/g, '-');
  return [
    relativePackagePath.replace(/\\/g, '/'),
    slug,
    slugKebab,
    packageName,
    packageName.replace('@', ''),
  ].map(token => token.toLowerCase());
}

function docMatchesPackage(doc: DocMeta, tokens: string[]): boolean {
  const haystack = `${doc.relativePath} ${doc.title}`.toLowerCase();
  return tokens.some(token => token.length >= 4 && haystack.includes(token));
}

function formatDocMetaList(docs: DocMeta[]): string {
  if (!docs.length) {
    return '(없음)';
  }
  return docs.map(doc => `- [${doc.title}](${doc.relativePath})`).join('\n');
}

/**
 * 루트 README 합성용: schedule.md 전문 + issues/resolved 메타만.
 */
export function buildRootDocsContext(): string {
  const parts: string[] = [];

  const schedulePath = path.join(process.cwd(), SCHEDULE_FILE);
  if (fs.existsSync(schedulePath)) {
    parts.push(
      `### docs/schedule.md (전문)\n${fs.readFileSync(schedulePath, 'utf-8').trim()}`,
    );
  }

  const allMeta = listDocMetaFiles();
  parts.push(
    `### docs 이슈·resolved 목록 (제목·경로만, 본문 없음)\n${formatDocMetaList(allMeta)}`,
  );

  return parts.join('\n\n');
}

/**
 * 패키지 README 합성용: 경로·제목이 패키지와 관련된 이슈 메타만 (상한 5).
 */
export function buildPackageDocsContext(
  relativePackagePath: string,
  packageName: string,
): string {
  const tokens = packageMatchTokens(relativePackagePath, packageName);
  const related = listDocMetaFiles()
    .filter(doc => docMatchesPackage(doc, tokens))
    .slice(0, MAX_RELATED_DOCS);

  if (!related.length) {
    return '(관련 docs 없음 — 이슈 본문을 README에 넣지 마세요.)';
  }

  return [
    '### 관련 docs (제목·경로만 — 상태·일정·미구현을 기능 설명으로 쓰지 마세요)',
    formatDocMetaList(related),
  ].join('\n');
}

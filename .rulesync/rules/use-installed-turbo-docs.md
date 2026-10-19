---
root: false
targets:
  - '*'
description: Turborepo 설정·명령을 바꾸기 전에 설치된 turbo 패키지의 docs/를 먼저 읽는다. 학습 데이터 기준으로 추측하지 말 것
globs: []
cursor:
  alwaysApply: true
  description: Turborepo 설정·명령을 바꾸기 전에 설치된 turbo 패키지의 docs/를 먼저 읽는다. 학습 데이터 기준으로 추측하지 말 것
  globs: []
---
# Turborepo는 설치된 버전 문서 기준

Turborepo 설정·태스크 동작·CLI는 버전마다 다르고 학습 데이터와 어긋날 수 있다. `turbo.json`(`.projenrc.ts`의 JsonFile로 생성)이나 `turbo run` 명령을 바꾸기 전에 설치된 패키지 문서를 먼저 읽는다.

- 패키지 위치: `node -p "require.resolve('turbo/package.json')"` (모노레포면 `turbo`에 의존하는 workspace에서 실행)
- 그 디렉토리의 `docs/README.md`부터 읽고, 관련 `docs/` 페이지를 본다. deprecation 안내를 따른다
- 네트워크 없이 볼 수 있고, 설치 버전과 일치한다

turbo가 `AGENTS.md`에 같은 안내를 자동 삽입하는 기능은 `turbo.json`의 `agentGuidance: false`로 껐다. 이 rule이 그 안내를 대신한다.

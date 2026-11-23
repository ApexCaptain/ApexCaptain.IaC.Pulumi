#!/usr/bin/env bash
# Authentik akadmin 비상 접근 runbook. 사용자가 본인 터미널에서만 실행한다(에이전트는 실행·출력 열람 금지).
#
# 로그인 화면이 Google 전용이라(k8s-workstation-system authentik.resources, userFields: []) akadmin은 비밀번호로
# 들어갈 수 없다. akadmin 일회용 복구 URL을 만들어 전체 주소 한 줄만 출력한다. 유효 시간(분) 안에 브라우저에서 열면
# 바로 로그인되고, 한 번 쓰면 끝이다. `ak create_recovery_key`는 상대 경로(`/recovery/use-token/<key>/`)와 로그를
# 섞어 출력하므로 경로만 골라 외부 주소를 붙인다(Authentik 2026.8.6, 2026-11-23 확인).
#
# 사용법: bash scripts/runbook/authentik-recovery.sh [유효시간_분=10]
# 출력은 로그인 권한이다. 채팅·이슈·커밋에 붙이지 않고, 터미널 기록이 남는 곳에서는 끝난 뒤 지운다.
set -euo pipefail

MINUTES="${1:-10}"
# infra/k8s-workstation-system/src/phases/constants.ts `authentikNames.namespace`
NAMESPACE=authentik
DEPLOY=deploy/authentik-server
USER_NAME=akadmin
# infra/cloudflare ayteneve93com `auth` 레코드
AUTH_URL=https://auth.ayteneve93.com

if ! [[ "$MINUTES" =~ ^[1-9][0-9]*$ ]] || (( MINUTES > 60 )); then
  echo "유효 시간은 1~60분 정수로 준다: $MINUTES" >&2
  exit 2
fi

read -r -p "kubectl context $(kubectl config current-context), ${USER_NAME} 복구 URL ${MINUTES}분. 진행하려면 yes: " answer
[[ "$answer" == "yes" ]] || { echo "중단" >&2; exit 1; }

err="$(mktemp)"
trap 'rm -f "$err"' EXIT
out="$(kubectl -n "$NAMESPACE" exec "$DEPLOY" -- ak create_recovery_key "$MINUTES" "$USER_NAME" 2>"$err")" || {
  echo "복구 키 생성 실패:" >&2
  tail -n 5 "$err" >&2
  exit 1
}

path="$(printf '%s\n' "$out" | grep -Eo '/recovery/use-token/[^[:space:]"]+' | tail -n 1 || true)"
if [[ -z "$path" ]]; then
  echo "출력에서 복구 URL을 찾지 못했다(사용자 ${USER_NAME} 없음 등):" >&2
  tail -n 5 "$err" >&2
  exit 1
fi

echo "${AUTH_URL}${path}"

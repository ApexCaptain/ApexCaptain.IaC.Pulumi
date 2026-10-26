#!/usr/bin/env bash
# repos/gitops 에서 git commit/push 하기 전
# origin/main 대비 behind이면 거부하고, push는 사용자 확인(ask)을 거친다.
#
# 호출: .rulesync/hooks.jsonc
#   Cursor      beforeShellExecution  입력 { command, cwd }             출력 { permission, user_message, agent_message }
#   Claude Code PreToolUse(Bash)      입력 { tool_input.command, cwd } 출력 { hookSpecificOutput.permissionDecision }
# Claude Code에서 통과는 출력 없이 exit 0 (allow를 내면 권한 프롬프트를 건너뛴다).
set -uo pipefail

target="repos/gitops"
branch="main"

input=$(cat)

agent="cursor"
if command -v jq >/dev/null 2>&1 && printf '%s' "$input" | jq -e 'has("tool_input")' >/dev/null 2>&1; then
  agent="claudecode"
fi

allow() {
  [ "$agent" = "cursor" ] && echo '{ "permission": "allow" }'
  exit 0
}

# decide <deny|ask> <user_message> <agent_message>
decide() {
  if [ "$agent" = "claudecode" ]; then
    jq -n --arg d "$1" --arg r "$3" '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: $d,
        permissionDecisionReason: $r
      }
    }'
  else
    jq -n --arg d "$1" --arg u "$2" --arg a "$3" '{ permission: $d, user_message: $u, agent_message: $a }'
  fi
  exit 0
}

command -v jq >/dev/null 2>&1 || allow

cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // .command // empty')
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')

printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+(commit|push)\b' || allow

# 대상 판별: 명령 내 경로 > cwd
printf '%s' "$cmd" | grep -q "$target" || case "$cwd" in
  */"$target"*) ;;
  *) allow ;;
esac

root=$(git -C "${cwd:-.}" rev-parse --show-toplevel 2>/dev/null || true)
case "$root" in
  */"$target") root=${root%/"$target"} ;;
esac
[ -n "$root" ] || root=$(pwd)
dir="$root/$target"
[ -e "$dir/.git" ] || allow

# behind 검사는 fetch·rev-parse가 되는 경우만 (빈 레포·오프라인이면 건너뛰고 push 확인은 유지)
if git -C "$dir" fetch origin "$branch" --quiet 2>/dev/null &&
  local_sha=$(git -C "$dir" rev-parse HEAD 2>/dev/null) &&
  remote_sha=$(git -C "$dir" rev-parse "origin/$branch" 2>/dev/null) &&
  [ "$local_sha" != "$remote_sha" ] &&
  git -C "$dir" merge-base --is-ancestor "$local_sha" "$remote_sha"; then
  decide deny \
    "$target 가 origin/$branch 보다 뒤처져 있습니다." \
    "$target 가 origin/$branch 보다 behind 입니다 (CI가 $branch 에 직접 push했을 수 있음). git -C $target pull --rebase origin $branch 후 다시 시도하세요."
fi

if printf '%s' "$cmd" | grep -Eq 'git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push'; then
  decide ask \
    "$target push: GitHub $branch 반영(Argo CD에 즉시 영향)입니다. 진행할까요?" \
    "$target push: GitHub $branch 반영(Argo CD에 즉시 영향). push는 사용자 요청이 있을 때만 수행한다."
fi

allow

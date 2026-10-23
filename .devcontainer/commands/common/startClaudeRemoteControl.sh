#!/usr/bin/env bash

echo "🔄 Starting Claude Remote Control"

if [ "$ENABLE_CLAUDE_RC" != true ]; then
    echo "⏩ Claude Remote Control skipped (ENABLE_CLAUDE_RC != true)"
    exit 0
fi

TMUX_SESSION_NAME=claude-rc
RC_SESSION_NAME="$(basename "$PWD")"

if ! command -v tmux >/dev/null 2>&1; then
    echo "⚠️ tmux not found (rebuild container); skipped"
    exit 0
fi

if ! claude auth status --json 2>/dev/null | grep -q '"loggedIn": true'; then
    echo "⚠️ Claude not logged in (run \`claude\` and /login); skipped"
    exit 0
fi

if tmux has-session -t "$TMUX_SESSION_NAME" 2>/dev/null; then
    echo "⏩ tmux session '$TMUX_SESSION_NAME' already running (tmux attach -t $TMUX_SESSION_NAME)"
    exit 0
fi

# 서버 모드: 같은 디렉토리에서 ~4h 내 중지된 서버의 세션을 모두 되살린다
# (-c 는 단일 세션 모드로 떠서 그 세션이 끝나면 프로세스가 종료되므로 쓰지 않는다)
# --spawn 미지정 시 최초 실행에서 대화형 선택 프롬프트로 멈춘다
RC_CMD="claude remote-control $(printf '%q ' --spawn same-dir --name "$RC_SESSION_NAME" --permission-mode auto)"

# 종료 후에도 셸을 남겨 attach 로 에러 확인 가능
tmux new-session -d -s "$TMUX_SESSION_NAME" -c "$PWD" "$RC_CMD; echo '⚠️ claude remote-control exited'; exec bash"
echo "✅ Claude Remote Control started as '$RC_SESSION_NAME' (tmux attach -t $TMUX_SESSION_NAME)"

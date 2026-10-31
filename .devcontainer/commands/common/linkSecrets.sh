#!/usr/bin/env bash
# .secrets → /mnt/rclone/<gdrive 마운트> 심볼릭 링크

link="$CONTAINER_SECRETS_DIR_PATH"
target="$SECRETS_LINK_SOURCE"

if [ ! -d "$target" ]; then
    echo "⚠️  $target 없음 — 워크스페이스에서 rclone-mounts status -v 를 확인하세요" >&2
    exit 0
fi

# 예전 bind 자리에 남은 빈 디렉터리 정리 (비어 있지 않으면 건드리지 않는다)
if [ -d "$link" ] && [ ! -L "$link" ]; then
    if ! rmdir "$link" 2>/dev/null; then
        echo "⚠️  $link 가 비어 있지 않아 링크하지 않습니다" >&2
        exit 0
    fi
fi

ln -sfn "$target" "$link"
echo "✅ $link → $target"

#!/usr/bin/env bash
set -euo pipefail

COMMITS_REF="refs/notes/commits"
AUDIT_REF="refs/notes/memento-full-audit"

cmd="${1:-}"
case "$cmd" in
  init)
    git config notes.rewriteRef "$COMMITS_REF"
    git config notes.rewriteRef "$AUDIT_REF"
    git config alias.note-summary "notes --ref=$COMMITS_REF show"
    git config alias.note-audit "notes --ref=$AUDIT_REF show"
    echo "initialized notes refs: $COMMITS_REF / $AUDIT_REF"
    ;;

  attach)
    commit="${2:-HEAD}"
    summary_file="${3:-templates/ai-summary.md}"
    audit_file="${4:-}"

    if [[ ! -f "$summary_file" ]]; then
      echo "summary file not found: $summary_file" >&2
      exit 1
    fi

    git notes --ref="$COMMITS_REF" add -f -F "$summary_file" "$commit"
    echo "attached summary note to $commit"

    if [[ -n "$audit_file" ]]; then
      if [[ ! -f "$audit_file" ]]; then
        echo "audit file not found: $audit_file" >&2
        exit 1
      fi
      git notes --ref="$AUDIT_REF" add -f -F "$audit_file" "$commit"
      echo "attached audit note to $commit"
    fi
    ;;

  push)
    remote="${2:-origin}"
    git push "$remote" "$COMMITS_REF" || true
    git push "$remote" "$AUDIT_REF" || true
    echo "pushed note refs to $remote"
    ;;

  *)
    cat <<USAGE
Usage:
  tools/ai-note.sh init
  tools/ai-note.sh attach [commit] [summary_file] [audit_file_optional]
  tools/ai-note.sh push [remote]
USAGE
    exit 1
    ;;
esac

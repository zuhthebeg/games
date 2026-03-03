# AI Commit Notes Workflow (games repo)

This repo uses `git notes` to keep AI-work context attached to commits without polluting commit messages.

## Refs
- Summary note: `refs/notes/commits`
- Full audit (optional): `refs/notes/memento-full-audit`

## 1) Initialize once
```bash
tools/ai-note.sh init
```

## 2) Attach note to latest commit
1. Fill `templates/ai-summary.md` (copy to temp file recommended)
2. Attach:
```bash
tools/ai-note.sh attach HEAD /path/to/summary.md
```
Optional full audit:
```bash
tools/ai-note.sh attach HEAD /path/to/summary.md /path/to/full-audit.md
```

## 3) Share notes to remote
```bash
tools/ai-note.sh push origin
```

## 4) Read notes
```bash
git note-summary <commit>
git note-audit <commit>
```

## Team policy (recommended)
- Start with summary-only notes for privacy/speed.
- Store full audit only when needed (security, incident, critical migrations).
- Never include secrets/tokens in audit text.

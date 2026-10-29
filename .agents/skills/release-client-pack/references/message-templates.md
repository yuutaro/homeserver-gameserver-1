# Message templates

Use concise Japanese bullets. Omit unused fields and empty sections; replace all
placeholders. Keep detailed logs and local paths out of public messages.

## Issue title

`<environment>: クライアントパック <version> 公開`

## Initial issue body

```markdown
- 対象：<environment> <version>
- 変更：<short MOD changes>
- 作業：公開mrpack作成・Release公開・Discord通知確認
```

## Release notes

Include only actual additions, updates, and removals. Discord uses this body
automatically; do not compose or send a separate notification.

```markdown
- <MOD> <version> を追加
- <MOD> を <old> → <new> に更新
- <MOD> を削除
```

## Issue result comment

```markdown
- 公開：<environment> <version>
- 変更：<short MOD changes>
- 確認：サーバー <result>／クライアント <result>
- Release：<URL>
- Discord：<success, pending, or failure; run URL if useful>
- 注意：<known issue or unverified behavior, if any>
```

Distinguish operator-reported tests from agent-run tests and fresh public-pack
imports from source-pack tests. Say `未確認` when evidence is absent. Record
failures plainly; do not mark pending work as complete.

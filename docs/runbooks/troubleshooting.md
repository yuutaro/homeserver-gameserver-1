# トラブルシュートRunbook

このRunbookは「同じ問題が再発したときに、原因を自力で特定して直す」ことを目的にしています。

## 0) 最短の切り分け（接続できない）

1. **ポートpublishが想定通りか**
```bash
docker ps --filter name=mc-prod --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

- 期待: `0.0.0.0:<MC_HOST_PORT>->25565/tcp`

2. **起動完了しているか（ログ）**
```bash
docker logs -f mc-prod
```

- 目安: `Done (` が出るまで待つ（Forge+MODは数分かかることがある）

3. **ホストの待受確認**
```bash
sudo ss -ltnp | rg ':30002' || true
```

## 1) “Connection refused” の意味

`Connection refused` は「ポートへ到達したが、受け手がlistenしていない」状態です。

よくある原因:
- `mc-prod` がまだ起動中（起動完了前）
- MODクラッシュでサーバープロセスが落ちている

## 2) `No such image: itzg/minecraft-server:...`

Dockerはローカルにイメージが無いとコンテナを作れません。

ホストで確認:
```bash
docker pull itzg/minecraft-server:latest
```

## 3) Javaバージョン不一致（MODが起動時クラッシュ）

症状（例）:
- `NoSuchMethodError ... sun.misc.Unsafe.ensureClassInitialized`
- Cobblemon Showdown / GraalVM 系が絡む

対処:
- `config/bot.env` で `MC_IMAGE` を固定（例: `itzg/minecraft-server:java17`）

## 4) メモリ不足（`OutOfMemoryError: Java heap space`）

対処:
- `data/<server-name>/server.env` の `MEMORY` を増やす（例: `MEMORY=16G`）
- `USE_AIKAR_FLAGS=true` を推奨

確認:
```bash
free -h
docker stats --no-stream mc-prod
```

## 5) envのtypo（地味に致命的）

例:
- `EULA=TRUE` のキー名ミス
- `RCON_PASSWORD` のキー名ミス

まずログで疑う:
```bash
docker logs --tail 200 mc-prod
```


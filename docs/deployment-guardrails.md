# Deployment Guardrails

Bu repo icinde deploy branch authority su sekilde calisir:

- `deploy/owner`
  - owner panel
  - ortak admin kodu
  - store authority ve provisioning dosyalari
- `deploy/storefront/<slug>` veya store config'te explicit tanimli storefront branch'i
  - sadece ilgili store'un storefront deploy'u

## Komutlar

```bash
npm run setup:deployment-guardrails
npm run validate:deploy-branches
npm run deploy:owner
npm run deploy:storefront -- --slug deri-kordon
npm run deploy:auto
```

## Ne Saglar

- Yanlis deploy branch'ine push atilmaya calisilinca `pre-push` hook push'u bloklar.
- Hook ortak git dizinine kuruldugu icin normal repo, Codex worktree'leri ve `.kilo/worktrees/*` ayni korumayi kullanir.
- `deploy:auto`, upstream deploy branch'i varsa onu kullanir; yoksa son commit'teki owner/storefront scope'una bakar.

## Beklenen Davranis

- Owner/admin/provisioning degisiklikleri `deploy/owner` uzerinden gitmelidir.
- `apps/storefront-<slug>` degisiklikleri sadece o store'un deploy branch'ine gitmelidir.
- Bir commit hem owner hem store-specific degisiklik tasiyorsa deploy icin ayirilmali veya explicit hedef secilmelidir.

# 研レンズ — KenLens

[![GitHub stars](https://img.shields.io/github/stars/R-Okauchi/kenlens?style=social)](https://github.com/R-Okauchi/kenlens)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%99%A5-0F766E)](https://github.com/sponsors/R-Okauchi)

researchmap の研究者ページに、被引用数・オープンアクセス状況・DOI の情報をその場で表示するブラウザ拡張機能です。

> **研究評価ではなく、公開メタデータの可視化・整備支援です。**
> 研究者のランク付け・比較・採点は行いません。DORA (研究評価に関するサンフランシスコ宣言) の趣旨に賛同します。

A browser extension that overlays citation counts, open access status, and DOI information on researchmap researcher profiles. **This is not research evaluation** — it visualizes public metadata and supports profile maintenance.

## インストール

[Chrome ウェブストアから追加](https://chromewebstore.google.com/detail/naccpnjaahllelmoijpcepnpkpamabec)

## 機能

- **見える** — 論文ごとに被引用数 (OpenAlex) と OA 本文リンク (Unpaywall) をバッジ表示
- **整う** — researchmap 未登録の DOI 候補を見つけて、プロフィール整備をお手伝い
- **つながる** — OpenAlex・CiNii Research・Scopus などの外部レコードへワンクリック

すべての数値に出典・取得時点・分母を明示します。データが見つからない論文は中立に沈黙します (外部データベースの収録状況によるものであり、論文の問題ではありません)。

## データソース

[researchmap](https://researchmap.jp/) (Powered by researchmap)・[OpenAlex](https://openalex.org/)・[Crossref](https://www.crossref.org/)・[Unpaywall](https://unpaywall.org/) の公開 API を利用しています。各サービスとは提携関係にありません。

## プライバシー

閲覧中の researchmap ページの処理に必要な通信のみを行い、閲覧履歴の収集・外部送信はありません。詳細は[プライバシーポリシー](https://r-okauchi.github.io/kenlens/privacy)を参照してください。

## 開発

pnpm モノレポです (`extension/` = WXT + React 拡張、`site/` = Astro LP)。

```bash
pnpm install
bash scripts/save-fixtures.sh   # テスト用 fixtures を取得 (researchmap の実ページ。リポジトリには含めていません)
pnpm -F @kenlens/extension dev  # Chrome が起動します
pnpm test                       # vitest
pnpm build && pnpm zip          # ストア提出用 zip
```

researchmap への配慮として、API リクエストは 1 req/s に自己制限し、結果は 24 時間ブラウザ内にキャッシュします。

## ライセンス

[Apache-2.0](LICENSE) © 2026 Ryota Okauchi

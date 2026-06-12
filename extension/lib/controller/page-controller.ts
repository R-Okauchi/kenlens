/**
 * ページコントローラ (content script 内のオーケストレータ)。
 * 1. DOM item を登録し、researchmap データを 1 回だけ取得
 * 2. rmId で突合し、DOI を ≤20 件ずつチャンクでエンリッチ要求 → 逐次 store 更新
 * 3. API 不可時は DOM-only 縮退 (欧文タイトル照合のみ稼働)
 */
import { sendMessage } from '../messaging/protocol';
import type { ParsedListItem } from '../page/dom-parser';
import type { PageContext, Publication } from '../researchmap/types';
import type { ItemStore } from '../state/item-store';
import type { SummaryModel } from '../state/summary-model';
import {
  MISMATCH_THRESHOLD,
  extractFirstAuthorFamily,
  isLatinTitle,
  titleSimilarity,
} from '../enrich/match';

const ENRICH_CHUNK_SIZE = 20;

interface RegisteredItem {
  rmId: string;
  item: ParsedListItem;
}

export class PageController {
  private registered = new Map<string, RegisteredItem>();
  private publications: Map<string, Publication> | null = null;
  private mode: 'api' | 'dom-only' | 'error' | 'pending' = 'pending';
  /** researchmap の取得 (1 回だけ)。バッジ処理はこれ「だけ」を待つ */
  private loadPromise: Promise<void> | null = null;
  /** 可視アイテムの処理 promise 群 — サマリーの全件エンリッチはこの後に回す (visible-first) */
  private processing: Promise<void>[] = [];
  /** サマリーカードが実際にマウントされたときのみ true (全件エンリッチのゲート) */
  private summaryActive = false;
  private summaryKicked = false;
  /** エンリッチ要求済み DOI (可視アイテム経由とサマリー経由の二重取得を防ぐ) */
  private enrichedDois = new Set<string>();
  /**
   * ユーザーが「ページ内データのみ」を選んでいる間 false。
   * このとき外部データベースへのタイトル照合も行わない (設定文言の遵守)。
   * キルスイッチ/ブレーカ由来の縮退では true のまま (欧文タイトル照合は稼働)
   */
  private externalAllowed = true;
  /** refreshAll の世代。旧世代の setEnrichComplete がスケルトンを早期解除しないためのガード */
  private epoch = 0;

  constructor(
    private ctx: PageContext,
    private store: ItemStore,
    private summary: SummaryModel | null = null,
  ) {}

  private kickoff(): Promise<void> {
    this.loadPromise ??= this.loadPublications(false);
    return this.loadPromise;
  }

  /** UI マウント (CSS 取得込み) を待たずに researchmap 取得を先行開始する */
  prefetch(): void {
    void this.kickoff();
  }

  /** anchors.ts から呼ばれる。published_papers の rmId 付き item のみ受け付ける */
  register(items: ParsedListItem[]): void {
    const fresh: RegisteredItem[] = [];
    for (const item of items) {
      const rmId = item.pub.rmId;
      if (!rmId || item.listType !== 'published_papers') continue;
      if (this.registered.has(rmId)) continue;
      const entry = { rmId, item };
      this.registered.set(rmId, entry);
      fresh.push(entry);
    }
    if (fresh.length === 0) return;

    // バッジ処理は researchmap 取得のみを待つ (サマリーの全件エンリッチを待たない)
    const p = this.kickoff().then(() => this.processItems(fresh));
    p.catch(() => {});
    this.processing.push(p);
    this.maybeKickSummary();
  }

  /**
   * サマリーカードのマウント成功時に呼ぶ。
   * これが呼ばれない限り全件エンリッチは走らない (カード無効時の無駄打ち防止)。
   */
  activateSummary(): void {
    this.summaryActive = true;
    void this.kickoff(); // バッジ対象ゼロのページでもロードは開始する
    this.maybeKickSummary();
  }

  private maybeKickSummary(): void {
    if (!this.summaryActive || this.summaryKicked) return;
    this.summaryKicked = true;
    void (async () => {
      await this.kickoff().catch(() => {});
      // 可視アイテムを先に確定させる (優先度逆転の防止)
      await Promise.allSettled([...this.processing]);
      await this.enrichRemainingForSummary();
    })();
  }

  retry(rmId: string): void {
    const entry = this.registered.get(rmId);
    if (!entry) return;
    this.store.update(rmId, { phase: 'loading' });
    void (async () => {
      if (this.mode === 'error') {
        // researchmap 取得自体が失敗していた場合は再ロードから (キャッシュ優先)
        this.loadPromise = null;
        await this.kickoff();
      }
      await this.processItems([entry]);
    })().catch(() => {});
  }

  /** サマリーの ↻ ボタンから呼ぶ。キャッシュをバイパスして全体を再計算する */
  async refreshAll(): Promise<void> {
    this.epoch++;
    this.summary?.startRefresh();
    this.enrichedDois.clear();
    this.loadPromise = this.loadPublications(true);
    await this.loadPromise.catch(() => {});
    await this.processItems([...this.registered.values()]);
    await this.enrichRemainingForSummary();
  }

  private async loadPublications(forceRefresh: boolean): Promise<void> {
    try {
      const res = await sendMessage('getPublications', {
        permalink: this.ctx.permalink,
        forceRefresh,
      });
      if (res.source === 'unavailable') {
        // ↻ 再取得の一時失敗: 取得済みデータがあるなら表示を保持する
        // (private は保持しない — 非公開化の意思を尊重して unavailable に落とす)
        if (res.reason === 'error' && this.publications !== null) {
          this.summary?.endRefresh();
          return;
        }
        this.mode = res.reason === 'dom-only' ? 'dom-only' : 'error';
        this.externalAllowed = !(res.reason === 'dom-only' && res.byUserChoice === true);
        this.summary?.setUnavailable(res.reason);
      } else {
        this.mode = 'api';
        this.externalAllowed = true;
        this.publications = new Map(res.papers.map((p) => [p.rmId, p]));
        this.summary?.setPublications(res.papers, res.totalItems, res.fetchedAt);
      }
    } catch {
      if (this.publications !== null) {
        this.summary?.endRefresh();
        return;
      }
      this.mode = 'error';
      this.summary?.setUnavailable('error');
    }
  }

  /**
   * 可視アイテム以外も含む全論文の DOI をエンリッチする (サマリーの母集団)。
   * 可視アイテム経由で取得済みの DOI はスキップ (bg 側キャッシュもあるが往復を省く)。
   */
  private async enrichRemainingForSummary(): Promise<void> {
    const summary = this.summary;
    if (!summary) return;
    // ↻ の再入時、旧世代の完了通知が新世代のスケルトンを早期解除しないようにする
    const epoch = this.epoch;
    if (this.mode !== 'api' || !this.publications) {
      if (epoch === this.epoch) summary.setEnrichComplete();
      return;
    }
    const remaining: string[] = [];
    for (const pub of this.publications.values()) {
      for (const doi of pub.dois) {
        if (!this.enrichedDois.has(doi)) {
          this.enrichedDois.add(doi);
          remaining.push(doi);
        }
      }
    }
    const jobs: Promise<void>[] = [];
    for (let i = 0; i < remaining.length; i += ENRICH_CHUNK_SIZE) {
      const chunk = remaining.slice(i, i + ENRICH_CHUNK_SIZE);
      jobs.push(
        sendMessage('enrichDois', { dois: chunk })
          .then((result) => summary.mergeEnrichments(result))
          // 一部チャンクの失敗はサマリーのカバレッジ表記で吸収される
          .catch(() => {}),
      );
    }
    await Promise.all(jobs);
    if (epoch === this.epoch) summary.setEnrichComplete();
  }

  private async processItems(entries: RegisteredItem[]): Promise<void> {
    if (this.mode === 'error') {
      for (const { rmId } of entries) this.store.update(rmId, { phase: 'error' });
      return;
    }

    const toEnrich: { rmId: string; doi: string }[] = [];
    const titleTasks: RegisteredItem[] = [];

    // パス 1 (同期): 突合と振り分けのみ。タイトル照合をここで await すると、
    // 無関係な DOI 持ち論文のバッジまで照合の分だけ遅れるため後段に回す
    for (const { rmId, item } of entries) {
      const pub = this.publications?.get(rmId) ?? null;

      if (pub) {
        const doi = pub.dois[0] ?? null;
        const apiTitle =
          (this.ctx.lang === 'en' ? pub.titleEn : pub.titleJa) ??
          pub.titleJa ??
          pub.titleEn;
        const mismatch =
          apiTitle !== null &&
          titleSimilarity(item.pub.title, apiTitle) < MISMATCH_THRESHOLD;

        this.store.update(rmId, {
          doi,
          matchStatus: mismatch ? 'mismatch-suspected' : 'matched',
          externalLinks: pub.externalLinks,
        });

        if (doi) {
          toEnrich.push({ rmId, doi });
          continue;
        }
      } else if (this.mode === 'api') {
        this.store.update(rmId, { matchStatus: 'unmatched' });
      }

      // DOI なし (または API 不可): 欧文タイトルのみ Crossref 照合の対象にする。
      // ユーザーが「ページ内データのみ」を選んでいる場合は照合自体を行わない
      if (this.externalAllowed && isLatinTitle(item.pub.title)) {
        titleTasks.push({ rmId, item });
      } else {
        this.store.update(rmId, { phase: 'ready' });
      }
    }

    // DOI 持ちを先に確定させる (体感速度の主役)。タイトル照合はこの後に回す —
    // 同時に走らせると照合クエリが Crossref キューを埋め、チャンク内の
    // Crossref フォールバック (OpenAlex 未収録 DOI) がその後ろに並んで
    // チャンク完了ごと数秒ブロックされるため
    await this.enrichChunks(toEnrich);

    const resolvedToEnrich: { rmId: string; doi: string }[] = [];
    await Promise.all(
      titleTasks.map(async ({ rmId, item }) => {
        try {
          const resolved = await sendMessage('resolveTitleDoi', {
            title: item.pub.title,
            year: item.pub.year,
            firstAuthorFamily: extractFirstAuthorFamily(item.pub.authorsText),
          });
          if (resolved.doi) {
            this.store.update(rmId, { doiCandidate: resolved.doi });
            resolvedToEnrich.push({ rmId, doi: resolved.doi });
            return;
          }
        } catch {
          // 照合失敗は no-data として扱う (エラー表示にしない)
        }
        this.store.update(rmId, { phase: 'ready' });
      }),
    );
    await this.enrichChunks(resolvedToEnrich);
  }

  /**
   * DOI をチャンクに割り、全チャンクを並列に要求して到着順に描画を確定する。
   * 直列だと 1 チャンク内の低速 DOI が次チャンクのバッチ発射を人質に取る。
   * レート制限は bg 側のホスト別キューが守るので並列発射してよい。
   */
  private async enrichChunks(targets: readonly { rmId: string; doi: string }[]): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (let i = 0; i < targets.length; i += ENRICH_CHUNK_SIZE) {
      jobs.push(this.enrichChunk(targets.slice(i, i + ENRICH_CHUNK_SIZE)));
    }
    await Promise.all(jobs);
  }

  private async enrichChunk(chunk: readonly { rmId: string; doi: string }[]): Promise<void> {
    try {
      const dois = [...new Set(chunk.map((c) => c.doi))];
      for (const doi of dois) this.enrichedDois.add(doi);
      const result = await sendMessage('enrichDois', { dois });
      this.summary?.mergeEnrichments(result);
      for (const { rmId, doi } of chunk) {
        const record = result[doi];
        if (record) {
          this.store.update(rmId, {
            phase: 'ready',
            enrichment: record,
            fetchedAt: record.fetchedAt,
          });
        } else {
          // pipeline がトランスポート失敗で省いた DOI → 再試行可能なエラー表示
          this.store.update(rmId, { phase: 'error' });
        }
      }
    } catch {
      for (const { rmId } of chunk) this.store.update(rmId, { phase: 'error' });
    }
  }
}

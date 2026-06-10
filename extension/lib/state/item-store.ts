/**
 * 論文 1 件ごとのバッジ状態ストア (content script 内)。
 * パイプラインが書き込み、各 BadgeRow (React root) が useSyncExternalStore で購読する。
 */
import type {
  EnrichmentRecord,
  ExternalLink,
  MatchStatus,
} from '../researchmap/types';

export interface ItemState {
  /** loading: 取得中 / ready: 確定 (データなし含む) / error: 取得失敗 */
  phase: 'loading' | 'ready' | 'error';
  /** researchmap に登録済みの DOI */
  doi: string | null;
  /** タイトル照合で見つかった DOI 候補 (整備ヒント) */
  doiCandidate: string | null;
  matchStatus: MatchStatus | null;
  enrichment: EnrichmentRecord | null;
  externalLinks: ExternalLink[];
  fetchedAt: number | null;
}

export const INITIAL_ITEM_STATE: ItemState = {
  phase: 'loading',
  doi: null,
  doiCandidate: null,
  matchStatus: null,
  enrichment: null,
  externalLinks: [],
  fetchedAt: null,
};

type Listener = () => void;

export class ItemStore {
  private states = new Map<string, ItemState>();
  private listeners = new Map<string, Set<Listener>>();

  get(rmId: string): ItemState {
    return this.states.get(rmId) ?? INITIAL_ITEM_STATE;
  }

  set(rmId: string, state: ItemState): void {
    this.states.set(rmId, state);
    this.listeners.get(rmId)?.forEach((fn) => fn());
  }

  update(rmId: string, patch: Partial<ItemState>): void {
    this.set(rmId, { ...this.get(rmId), ...patch });
  }

  subscribe(rmId: string, listener: Listener): () => void {
    let set = this.listeners.get(rmId);
    if (!set) {
      set = new Set();
      this.listeners.set(rmId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }
}

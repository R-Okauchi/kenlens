/**
 * サマリーカードの状態モデル (content script 内)。
 * PageController が書き込み、SummaryCard が useSyncExternalStore で購読する。
 * snapshot は不変オブジェクトとして差し替える (React の同一性チェックのため)。
 */
import type { EnrichmentRecord, Publication } from '../researchmap/types';

export interface SummaryState {
  phase: 'loading' | 'ready' | 'unavailable';
  unavailableReason: 'dom-only' | 'private' | 'error' | null;
  papers: readonly Publication[] | null;
  totalItems: number;
  fetchedAt: number | null;
  enrichments: ReadonlyMap<string, EnrichmentRecord>;
  /** 全 DOI のエンリッチが完了したか (citations/OA タイルのスケルトン解除条件) */
  enrichComplete: boolean;
  refreshing: boolean;
}

const INITIAL: SummaryState = {
  phase: 'loading',
  unavailableReason: null,
  papers: null,
  totalItems: 0,
  fetchedAt: null,
  enrichments: new Map(),
  enrichComplete: false,
  refreshing: false,
};

type Listener = () => void;

export class SummaryModel {
  private state: SummaryState = INITIAL;
  private listeners = new Set<Listener>();

  get(): SummaryState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(patch: Partial<SummaryState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  setPublications(papers: readonly Publication[], totalItems: number, fetchedAt: number): void {
    this.set({ phase: 'ready', papers, totalItems, fetchedAt, refreshing: false });
  }

  setUnavailable(reason: 'dom-only' | 'private' | 'error'): void {
    this.set({ phase: 'unavailable', unavailableReason: reason, refreshing: false });
  }

  mergeEnrichments(records: Record<string, EnrichmentRecord>): void {
    const next = new Map(this.state.enrichments);
    for (const [doi, rec] of Object.entries(records)) next.set(doi, rec);
    this.set({ enrichments: next });
  }

  setEnrichComplete(): void {
    this.set({ enrichComplete: true });
  }

  startRefresh(): void {
    this.set({ refreshing: true, enrichComplete: false });
  }
}

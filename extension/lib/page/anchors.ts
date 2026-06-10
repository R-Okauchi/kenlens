/**
 * 業績 li の出現監視。
 * researchmap は SSR だが、AngularJS の「もっと見る」開閉等で li が後から現れることがある。
 * MutationObserver は ul.rm-cv-list-group の親パネルに限定し (subtree 最小化)、
 * 100ms デバウンスでコールバック内は収集のみ行う。
 */
import { parseListItems, type ParsedListItem } from './dom-parser';

export function watchListItems(
  doc: Document,
  onItems: (items: ParsedListItem[]) => void,
): () => void {
  const seen = new WeakSet<HTMLElement>();

  const emit = (root: ParentNode) => {
    const fresh = parseListItems(root).filter(({ li }) => {
      if (seen.has(li)) return false;
      seen.add(li);
      return true;
    });
    if (fresh.length > 0) onItems(fresh);
  };

  // 初期 DOM
  emit(doc);

  const groups = doc.querySelectorAll('ul.rm-cv-list-group');
  if (groups.length === 0) return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      emit(doc);
    }, 100);
  });

  // ul 自身ではなく親パネルを監視する — AngularJS が ul ごと差し替えた場合、
  // ul に張った observer は孤児ノードに残り、以後の項目追加を取りこぼすため
  const observed = new Set<Node>();
  for (const group of groups) {
    const target = group.parentElement ?? group;
    if (observed.has(target)) continue;
    observed.add(target);
    observer.observe(target, { childList: true, subtree: true });
  }

  return () => {
    observer.disconnect();
    if (timer !== null) clearTimeout(timer);
  };
}

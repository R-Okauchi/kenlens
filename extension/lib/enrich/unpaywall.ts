/**
 * Unpaywall クライアント (OA 状態のフォールバック — Crossref 経路のときのみ使う。
 * OpenAlex 経路では open_access フィールドで足りる)。
 * email パラメータは必須 (無しは 422、実測)。
 */
import { CONTACT_EMAIL } from '../constants';
import { HttpError, politeFetch } from '../net/queue';

const BASE = 'https://api.unpaywall.org/v2';

export interface UnpaywallResult {
  isOa: boolean;
  oaStatus: string | null;
  oaUrl: string | null;
}

interface RawUnpaywall {
  is_oa?: boolean;
  oa_status?: string;
  best_oa_location?: { url_for_pdf?: string | null; url?: string | null } | null;
}

export async function fetchUnpaywall(doi: string): Promise<UnpaywallResult | null> {
  const url = `${BASE}/${encodeURIComponent(doi)}?email=${encodeURIComponent(CONTACT_EMAIL)}`;
  try {
    const res = await politeFetch(url, { headers: { Accept: 'application/json' } });
    const json = (await res.json()) as RawUnpaywall;
    return {
      isOa: json.is_oa === true,
      oaStatus: json.oa_status ?? null,
      oaUrl: json.best_oa_location?.url_for_pdf ?? json.best_oa_location?.url ?? null,
    };
  } catch (err) {
    if (err instanceof HttpError && (err.status === 404 || err.status === 422)) {
      return null;
    }
    throw err;
  }
}

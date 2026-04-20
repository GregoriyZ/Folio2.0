const DATA_ROW_ID = 'default';
const TABLE_NAME = process.env.SUPABASE_TABLE || 'folio_data';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function getConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ''), serviceKey };
}

function normalizePayload(body) {
  const safe = body && typeof body === 'object' ? body : {};
  return {
    transactions: Array.isArray(safe.transactions) ? safe.transactions : [],
    categories: Array.isArray(safe.categories) ? safe.categories : [],
    budgets: safe.budgets && typeof safe.budgets === 'object' ? safe.budgets : {},
  };
}

async function supabaseRequest(path, options = {}) {
  const cfg = getConfig();
  if (!cfg) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(cfg.supabaseUrl + path, {
    ...options,
    headers: {
      apikey: cfg.serviceKey,
      Authorization: `Bearer ${cfg.serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase request failed (${res.status}): ${text}`);
  }
  return res;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return json({ ok: true });

  const action = req.query?.action || (new URL(req.url, 'http://localhost')).searchParams.get('action');
  if (!action) return json({ error: 'Missing action' }, 400);

  try {
    if (action === 'load' && req.method === 'GET') {
      const res = await supabaseRequest(
        `/rest/v1/${encodeURIComponent(TABLE_NAME)}?select=data&id=eq.${encodeURIComponent(DATA_ROW_ID)}&limit=1`
      );
      const rows = await res.json();
      const payload = rows?.[0]?.data || {};
      return json(normalizePayload(payload));
    }

    if (action === 'save' && req.method === 'POST') {
      const payload = normalizePayload(req.body);
      const row = {
        id: DATA_ROW_ID,
        data: payload,
        updated_at: new Date().toISOString(),
      };
      await supabaseRequest(`/rest/v1/${encodeURIComponent(TABLE_NAME)}`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(row),
      });
      return json({ ok: true });
    }

    return json({ error: 'Unsupported method/action' }, 405);
  } catch (error) {
    return json({ error: error.message || 'Unexpected error' }, 500);
  }
}

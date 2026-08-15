#!/usr/bin/env node
/**
 * Valide un backend Supabase (Lovable Cloud OU projet externe "kidi+")
 * avant la bascule définitive.
 *
 * Usage:
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   SUPABASE_PUBLISHABLE_KEY=... \
 *   node scripts/validate-backend.mjs
 *
 * Optionnel: --json pour une sortie machine.
 *
 * Le script est STRICTEMENT en lecture (HEAD/SELECT + appels RPC invalides
 * volontairement pour tester l'existence). Il n'écrit jamais de données.
 */

const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const asJson = process.argv.includes('--json');

if (!url || !serviceKey) {
  console.error('Manque SUPABASE_URL et/ou SUPABASE_SERVICE_ROLE_KEY dans l\'environnement.');
  process.exit(2);
}

const TABLES = [
  'addresses', 'app_config', 'device_tokens', 'email_send_log', 'email_send_state',
  'email_unsubscribe_tokens', 'follows', 'live_bids', 'live_chat_mutes', 'live_gifts',
  'live_interactions', 'live_moderators', 'live_products', 'live_reminders', 'lives',
  'order_events', 'orders', 'payouts', 'profiles', 'push_debug_logs', 'referral_balances',
  'seller_balances', 'seller_delivery_settings', 'seller_facebook_connections',
  'seller_reviews', 'seller_youtube_connections', 'shop_products', 'suppressed_emails',
  'verification_requests', 'vitrine_comments', 'vitrine_likes', 'vitrine_posts',
  'vitrine_stories', 'wallet_transactions', 'wallets', 'user_roles',
];

// RPC critiques (argent, live, modération, admin)
const RPCS = [
  'is_admin', 'my_profile_flags', 'my_moderation_state',
  'create_live_order', 'purchase_fixed_price', 'pay_order_with_wallet',
  'set_order_product_options', 'expire_overdue_orders', 'release_overdue_escrow',
  'credit_seller_earning', 'credit_wallet_topup', 'request_payout',
  'convert_my_wallet_currency', 'sync_my_wallet_currency', 'send_gift',
  'place_live_bid', 'start_auction', 'settle_expired_auctions', 'finalize_auction_winner',
  'relaunch_unsold_product', 'expire_abandoned_lives', 'touch_live_host',
  'mark_expired_live_replays', 'leave_review',
  'block_user', 'unblock_user', 'list_my_blocks', 'submit_report',
  'send_dm', 'find_dm_thread', 'list_dm_messages', 'list_my_dm_threads', 'mark_dm_thread_read',
  'list_my_notifications', 'mark_notification_read', 'mark_all_notifications_read',
  'apply_promo_code', 'claim_promo_code', 'validate_promo_code', 'request_promo_code',
  'request_verification', 'verification_eligibility', 'anonymize_my_account',
  'account_deletion_check', 'risk_check_and_consume', 'risk_assert_can_topup',
  'get_seller_delivery_settings', 'upsert_seller_delivery_settings',
  'admin_overview_stats', 'admin_list_orders', 'admin_list_payouts', 'admin_process_payout',
  'admin_list_users', 'admin_list_reports', 'admin_resolve_report', 'admin_list_lives',
];

const BUCKETS = [
  'avatars', 'live-covers', 'live-products', 'live-replays',
  'shop-products', 'vitrine-media', 'payout-proofs',
  'demo-videos', 'demo-covers',
];


const results = { tables: [], rpcs: [], buckets: [], auth: null, cron: null, errors: [] };

const H = (key) => ({ apikey: key, Authorization: `Bearer ${key}` });

async function checkTable(name) {
  try {
    const res = await fetch(`${url}/rest/v1/${name}?select=*&limit=1`, {
      headers: { ...H(serviceKey), Prefer: 'count=exact', Range: '0-0' },
    });
    const range = res.headers.get('content-range') || '';
    const count = range.includes('/') ? range.split('/')[1] : '?';
    if (res.ok) return { name, ok: true, count };
    const body = await res.text();
    return { name, ok: false, status: res.status, detail: body.slice(0, 200) };
  } catch (e) {
    return { name, ok: false, detail: String(e) };
  }
}

/**
 * Le catalogue OpenAPI de PostgREST liste toutes les fonctions exposées.
 * C'est la seule méthode fiable : un POST sans argument renvoie PGRST202
 * aussi bien pour une fonction absente que pour une signature différente.
 */
async function loadApiCatalog() {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { ...H(serviceKey), Accept: 'application/openapi+json' },
  });
  if (!res.ok) throw new Error(`Catalogue OpenAPI indisponible (HTTP ${res.status})`);
  const spec = await res.json();
  const paths = Object.keys(spec.paths || {});
  return {
    rpcs: new Set(paths.filter((p) => p.startsWith('/rpc/')).map((p) => p.slice(5))),
    tables: new Set(paths.filter((p) => p !== '/' && !p.startsWith('/rpc/')).map((p) => p.slice(1))),
  };
}

function checkRpc(name, catalog) {
  return catalog.rpcs.has(name)
    ? { name, ok: true }
    : { name, ok: false, detail: 'fonction absente de l\'API' };
}


async function checkBuckets() {
  try {
    const res = await fetch(`${url}/storage/v1/bucket`, { headers: H(serviceKey) });
    if (!res.ok) return BUCKETS.map((b) => ({ name: b, ok: false, detail: `list ${res.status}` }));
    const list = await res.json();
    const names = new Set(list.map((b) => b.id));
    return BUCKETS.map((b) => ({ name: b, ok: names.has(b), public: list.find((x) => x.id === b)?.public }));
  } catch (e) {
    return BUCKETS.map((b) => ({ name: b, ok: false, detail: String(e) }));
  }
}

async function checkAuth() {
  try {
    const res = await fetch(`${url}/auth/v1/admin/users?per_page=1`, { headers: H(serviceKey) });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, total: data.total ?? data.users?.length ?? '?' };
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

async function checkAnonReadable() {
  if (!anonKey) return { ok: null, detail: 'SUPABASE_PUBLISHABLE_KEY non fourni' };
  try {
    const res = await fetch(`${url}/rest/v1/lives?select=id&limit=1`, { headers: H(anonKey) });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

const run = async () => {
  results.tables = await Promise.all(TABLES.map(checkTable));
  results.rpcs = await Promise.all(RPCS.map(checkRpc));
  results.buckets = await checkBuckets();
  results.auth = await checkAuth();
  results.anon = await checkAnonReadable();

  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    const line = (r) => `${r.ok ? '  OK  ' : ' FAIL '} ${r.name}${r.count !== undefined ? ` (${r.count} lignes)` : ''}${r.detail ? ` — ${r.detail}` : ''}`;
    console.log(`\n=== Cible: ${url} ===`);
    console.log('\n--- Tables ---');
    results.tables.forEach((r) => console.log(line(r)));
    console.log('\n--- Fonctions RPC ---');
    results.rpcs.forEach((r) => console.log(line(r)));
    console.log('\n--- Buckets storage ---');
    results.buckets.forEach((r) => console.log(line(r)));
    console.log('\n--- Auth ---');
    console.log(`${results.auth.ok ? '  OK  ' : ' FAIL '} admin API${results.auth.total ? ` (${results.auth.total} utilisateurs)` : ''}${results.auth.detail ? ` — ${results.auth.detail}` : ''}`);
    console.log('\n--- Lecture anonyme (RLS publique) ---');
    console.log(`${results.anon.ok === null ? ' SKIP ' : results.anon.ok ? '  OK  ' : ' FAIL '} lives via clé publishable${results.anon.detail ? ` — ${results.anon.detail}` : ''}`);
  }

  const failed = [
    ...results.tables.filter((r) => !r.ok),
    ...results.rpcs.filter((r) => !r.ok),
    ...results.buckets.filter((r) => !r.ok),
  ];
  const authFail = !results.auth.ok;
  if (!asJson) {
    console.log(`\n=== Résultat: ${failed.length} échec(s)${authFail ? ' + auth KO' : ''} ===\n`);
  }
  process.exit(failed.length || authFail ? 1 : 0);
};

run();

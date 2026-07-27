-- See supabase/migrations/20260718200000_risk_anti_fraud_v1.sql
-- Applied verbatim from the repo file.

-- ---------------------------------------------------------------------------
-- 1) Schema
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists risk_restricted boolean not null default false;

comment on column public.profiles.risk_restricted is
  'Admin financial freeze: blocks top-ups, spend, gifts, payouts until cleared.';

create table if not exists public.risk_daily_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  currency text not null,
  topup numeric not null default 0 check (topup >= 0),
  spend numeric not null default 0 check (spend >= 0),
  gift_received numeric not null default 0 check (gift_received >= 0),
  primary key (user_id, day, currency)
);

create index if not exists risk_daily_usage_day_idx
  on public.risk_daily_usage (day);

create table if not exists public.risk_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create index if not exists risk_alerts_open_idx
  on public.risk_alerts (created_at desc)
  where resolved_at is null;

create index if not exists risk_alerts_user_idx
  on public.risk_alerts (user_id, created_at desc);

alter table public.risk_daily_usage enable row level security;
alter table public.risk_alerts enable row level security;

revoke all on public.risk_daily_usage from public, anon, authenticated;
revoke all on public.risk_alerts from public, anon, authenticated;
grant all on public.risk_daily_usage to service_role;
grant all on public.risk_alerts to service_role;

-- ---------------------------------------------------------------------------
-- 2) Helpers
-- ---------------------------------------------------------------------------
create or replace function public.risk_utc_day()
returns date language sql stable set search_path = public
as $$ select (timezone('utc', now()))::date; $$;

create or replace function public.risk_user_tier(_user_id uuid)
returns text language plpgsql stable security definer set search_path = public
as $$
declare
  v_restricted boolean;
  v_verified boolean;
begin
  select coalesce(risk_restricted, false), coalesce(is_verified, false)
    into v_restricted, v_verified
    from public.profiles where id = _user_id;
  if not found then return 'new'; end if;
  if v_restricted then return 'restricted'; end if;
  if v_verified then return 'trusted'; end if;
  return 'new';
end;
$$;

create or replace function public.risk_account_age_hours(_user_id uuid)
returns numeric language plpgsql stable security definer set search_path = public
as $$
declare v_created timestamptz;
begin
  select created_at into v_created from public.profiles where id = _user_id;
  if v_created is null then return 0; end if;
  return greatest(0, extract(epoch from (now() - v_created)) / 3600.0);
end;
$$;

create or replace function public.risk_daily_cap(
  _tier text, _kind text, _currency text, _account_age_hours numeric default 9999
)
returns numeric language plpgsql immutable set search_path = public
as $$
declare
  v_cur text := upper(coalesce(_currency, 'EUR'));
  v_unit_max numeric;
begin
  if _tier = 'restricted' then return 0; end if;

  if _kind = 'topup' then
    v_unit_max := case v_cur when 'XOF' then 300000 when 'CAD' then 500 else 500 end;
    if _tier = 'trusted' then return v_unit_max * 3; end if;
    if coalesce(_account_age_hours, 0) < 24 then return v_unit_max * 0.5; end if;
    return v_unit_max;
  end if;

  if _kind = 'spend' then
    if _tier = 'trusted' then
      return case v_cur when 'XOF' then 1000000 when 'CAD' then 2000 else 1500 end;
    end if;
    return case v_cur when 'XOF' then 150000 when 'CAD' then 250 else 200 end;
  end if;

  if _kind = 'gift_received' then
    if _tier = 'trusted' then
      return case v_cur when 'XOF' then 500000 when 'CAD' then 1000 else 750 end;
    end if;
    return case v_cur when 'XOF' then 100000 when 'CAD' then 200 else 150 end;
  end if;

  return 0;
end;
$$;

create or replace function public.risk_raise_alert(
  _user_id uuid, _kind text, _detail jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.risk_alerts (user_id, kind, detail)
  values (_user_id, _kind, coalesce(_detail, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.risk_check_and_consume(
  _user_id uuid, _kind text, _amount numeric, _currency text, _consume boolean default true
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_tier text;
  v_day date := public.risk_utc_day();
  v_cur text := upper(coalesce(_currency, 'EUR'));
  v_age numeric;
  v_cap numeric;
  v_used numeric := 0;
  v_status text;
begin
  if _user_id is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  if _amount is null or _amount <= 0 then return jsonb_build_object('ok', false, 'error', 'invalid_amount'); end if;
  if _kind not in ('topup', 'spend', 'gift_received') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;

  v_status := public.current_moderation_status(_user_id);
  if v_status = 'banned' then return jsonb_build_object('ok', false, 'error', 'account_banned'); end if;
  if v_status = 'suspended' then return jsonb_build_object('ok', false, 'error', 'account_suspended'); end if;

  v_tier := public.risk_user_tier(_user_id);
  if v_tier = 'restricted' then
    perform public.risk_raise_alert(_user_id, 'restricted_block', jsonb_build_object(
      'kind', _kind, 'amount', _amount, 'currency', v_cur));
    return jsonb_build_object('ok', false, 'error', 'risk_restricted', 'tier', v_tier);
  end if;

  v_age := public.risk_account_age_hours(_user_id);
  v_cap := public.risk_daily_cap(v_tier, _kind, v_cur, v_age);

  insert into public.risk_daily_usage (user_id, day, currency)
  values (_user_id, v_day, v_cur)
  on conflict (user_id, day, currency) do nothing;

  select case _kind when 'topup' then topup when 'spend' then spend else gift_received end
    into v_used
    from public.risk_daily_usage
   where user_id = _user_id and day = v_day and currency = v_cur
   for update;

  if v_used is null then v_used := 0; end if;

  if v_used + _amount > v_cap then
    perform public.risk_raise_alert(_user_id, 'daily_limit', jsonb_build_object(
      'kind', _kind, 'amount', _amount, 'currency', v_cur,
      'used', v_used, 'cap', v_cap, 'tier', v_tier));
    return jsonb_build_object('ok', false, 'error', 'daily_limit',
      'kind', _kind, 'used', v_used, 'cap', v_cap, 'currency', v_cur, 'tier', v_tier);
  end if;

  if _consume then
    insert into public.risk_daily_usage (user_id, day, currency, topup, spend, gift_received)
    values (_user_id, v_day, v_cur,
      case when _kind = 'topup' then _amount else 0 end,
      case when _kind = 'spend' then _amount else 0 end,
      case when _kind = 'gift_received' then _amount else 0 end)
    on conflict (user_id, day, currency) do update set
      topup = public.risk_daily_usage.topup + case when _kind = 'topup' then excluded.topup else 0 end,
      spend = public.risk_daily_usage.spend + case when _kind = 'spend' then excluded.spend else 0 end,
      gift_received = public.risk_daily_usage.gift_received + case when _kind = 'gift_received' then excluded.gift_received else 0 end;
  end if;

  return jsonb_build_object('ok', true, 'tier', v_tier,
    'used', v_used + case when _consume then _amount else 0 end,
    'cap', v_cap, 'currency', v_cur);
end;
$$;

revoke all on function public.risk_check_and_consume(uuid, text, numeric, text, boolean) from public, anon, authenticated;
grant execute on function public.risk_check_and_consume(uuid, text, numeric, text, boolean) to service_role;

create or replace function public.risk_check_and_consume_self(
  _kind text, _amount numeric, _currency text, _consume boolean default true
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  return public.risk_check_and_consume(v_user, _kind, _amount, _currency, _consume);
end;
$$;

revoke all on function public.risk_check_and_consume_self(text, numeric, text, boolean) from public, anon;
grant execute on function public.risk_check_and_consume_self(text, numeric, text, boolean) to authenticated, service_role;

create or replace function public.risk_assert_can_topup(
  _user_id uuid, _amount numeric, _currency text
)
returns jsonb language plpgsql security definer set search_path = public
as $$
begin
  return public.risk_check_and_consume(_user_id, 'topup', _amount, _currency, false);
end;
$$;

revoke all on function public.risk_assert_can_topup(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.risk_assert_can_topup(uuid, numeric, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3) Patch credit_wallet_topup — consume topup limit at credit time
-- ---------------------------------------------------------------------------
create or replace function public.credit_wallet_topup(
  _user_id uuid, _amount numeric, _payment_intent_id text
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_wallet public.wallets;
  v_new_balance numeric;
  v_currency text;
  v_risk jsonb;
begin
  if _user_id is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  if _amount is null or _amount <= 0 then return jsonb_build_object('ok', false, 'error', 'invalid_amount'); end if;

  if exists (
    select 1 from public.wallet_transactions
     where stripe_payment_intent_id = _payment_intent_id and status = 'completed'
  ) then
    select balance into v_new_balance from public.wallets where user_id = _user_id;
    return jsonb_build_object('ok', true, 'balance', v_new_balance, 'already', true);
  end if;

  select * into v_wallet from public.wallets where user_id = _user_id for update;
  if not found then
    insert into public.wallets (user_id) values (_user_id) returning * into v_wallet;
  end if;

  v_currency := upper(coalesce(v_wallet.currency, 'EUR'));

  v_risk := public.risk_check_and_consume(_user_id, 'topup', _amount, v_currency, true);
  if coalesce((v_risk->>'ok')::boolean, false) is not true then
    perform public.risk_raise_alert(_user_id, 'topup_credit_blocked', jsonb_build_object(
      'amount', _amount, 'currency', v_currency,
      'payment_intent_id', _payment_intent_id, 'risk', v_risk));
    return jsonb_build_object('ok', false, 'error', coalesce(v_risk->>'error', 'daily_limit'), 'risk', v_risk);
  end if;

  v_new_balance := v_wallet.balance + _amount;
  update public.wallets set balance = v_new_balance, updated_at = now() where user_id = _user_id;
  insert into public.wallet_transactions
    (user_id, type, amount, balance_after, stripe_payment_intent_id, status)
  values (_user_id, 'topup', _amount, v_new_balance, _payment_intent_id, 'completed');

  return jsonb_build_object('ok', true, 'balance', v_new_balance);
end;
$$;

revoke execute on function public.credit_wallet_topup(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.credit_wallet_topup(uuid, numeric, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4) Patch send_gift — spend (sender) + gift_received (seller)
-- ---------------------------------------------------------------------------
create or replace function public.send_gift(_live_id uuid, _gift_key text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_live public.lives;
  v_wallet public.wallets;
  v_bal public.seller_balances;
  v_live_currency text;
  v_wallet_currency text;
  v_price_live numeric;
  v_price_debit numeric;
  v_rate numeric;
  v_fee_pct numeric := 30;
  v_platform_fee numeric;
  v_seller_net numeric;
  v_new_wallet numeric;
  v_new_available numeric;
  v_gift_id uuid;
  v_sender_name text;
  v_risk jsonb;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  perform public.assert_user_active();

  select * into v_live from public.lives where id = _live_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'live_not_found'); end if;
  if v_live.status <> 'live' then return jsonb_build_object('ok', false, 'error', 'live_not_active'); end if;
  if v_live.seller_id = v_user then return jsonb_build_object('ok', false, 'error', 'cannot_gift_self'); end if;

  v_live_currency := upper(coalesce(v_live.currency, 'EUR'));
  v_price_live := public._gift_price(_gift_key, v_live_currency);
  if v_price_live is null then return jsonb_build_object('ok', false, 'error', 'unknown_gift'); end if;

  select * into v_wallet from public.wallets where user_id = v_user for update;
  if not found then
    insert into public.wallets (user_id, currency) values (v_user, v_live_currency) returning * into v_wallet;
  end if;
  v_wallet_currency := upper(coalesce(v_wallet.currency, v_live_currency));

  if v_wallet_currency = v_live_currency then
    v_price_debit := v_price_live;
    v_rate := 1;
  else
    v_price_debit := public.convert_money(v_price_live, v_live_currency, v_wallet_currency);
    v_rate := public.fx_rate(v_live_currency, v_wallet_currency);
    if v_price_debit is null then return jsonb_build_object('ok', false, 'error', 'conversion_unavailable'); end if;
  end if;

  if v_wallet.balance < v_price_debit then
    return jsonb_build_object('ok', false, 'error', 'insufficient_funds',
      'balance', v_wallet.balance, 'price', v_price_debit,
      'wallet_currency', v_wallet_currency, 'live_currency', v_live_currency,
      'live_amount', v_price_live, 'rate', v_rate);
  end if;

  if v_live_currency = 'XOF' then
    v_platform_fee := round(v_price_live * v_fee_pct / 100);
  else
    v_platform_fee := round(v_price_live * v_fee_pct / 100 * 100) / 100;
  end if;
  v_seller_net := v_price_live - v_platform_fee;

  v_risk := public.risk_check_and_consume(v_user, 'spend', v_price_debit, v_wallet_currency, false);
  if coalesce((v_risk->>'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'error', coalesce(v_risk->>'error', 'daily_limit'),
      'cap', v_risk->'cap', 'used', v_risk->'used', 'currency', v_wallet_currency);
  end if;
  v_risk := public.risk_check_and_consume(v_live.seller_id, 'gift_received', v_seller_net, v_live_currency, false);
  if coalesce((v_risk->>'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'seller_gift_limit',
      'cap', v_risk->'cap', 'used', v_risk->'used', 'currency', v_live_currency);
  end if;
  perform public.risk_check_and_consume(v_user, 'spend', v_price_debit, v_wallet_currency, true);
  perform public.risk_check_and_consume(v_live.seller_id, 'gift_received', v_seller_net, v_live_currency, true);

  v_new_wallet := v_wallet.balance - v_price_debit;
  update public.wallets set balance = v_new_wallet, updated_at = now() where user_id = v_user;
  insert into public.wallet_transactions (user_id, type, amount, balance_after, status, meta)
    values (v_user, 'gift', -v_price_debit, v_new_wallet, 'completed',
      jsonb_build_object('live_id', _live_id, 'gift_key', _gift_key,
        'live_currency', v_live_currency, 'live_amount', v_price_live,
        'wallet_currency', v_wallet_currency, 'wallet_amount', v_price_debit, 'rate', v_rate));

  select * into v_bal from public.seller_balances where seller_id = v_live.seller_id for update;
  if not found then
    insert into public.seller_balances (seller_id, available, pending, currency)
      values (v_live.seller_id, 0, 0, v_live_currency) returning * into v_bal;
  end if;
  v_new_available := v_bal.available + v_seller_net;
  update public.seller_balances set available = v_new_available, updated_at = now()
    where seller_id = v_live.seller_id;

  insert into public.seller_earnings
    (seller_id, order_id, amount, balance_after, status, source, live_id, gift_key)
    values (v_live.seller_id, null, v_seller_net, v_new_available, 'released', 'gift', _live_id, _gift_key);

  insert into public.live_gifts
    (live_id, sender_id, seller_id, gift_key, amount, currency,
     platform_fee, seller_net, debit_amount, debit_currency)
    values (_live_id, v_user, v_live.seller_id, _gift_key,
            v_price_live, v_live_currency, v_platform_fee, v_seller_net,
            v_price_debit, v_wallet_currency)
    returning id into v_gift_id;

  select coalesce(display_name, handle, 'invité') into v_sender_name
    from public.profiles where id = v_user;

  return jsonb_build_object('ok', true, 'gift_id', v_gift_id,
    'amount', v_price_live, 'currency', v_live_currency,
    'debit_amount', v_price_debit, 'debit_currency', v_wallet_currency,
    'rate', v_rate, 'balance', v_new_wallet, 'sender_name', v_sender_name);
end;
$$;

grant execute on function public.send_gift(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Patch pay_order_with_wallet — assert_user_active + spend limit
-- ---------------------------------------------------------------------------
create or replace function public.pay_order_with_wallet(_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_order public.orders;
  v_wallet public.wallets;
  v_order_currency text;
  v_wallet_currency text;
  v_debit numeric;
  v_rate numeric;
  v_new_balance numeric;
  v_risk jsonb;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  perform public.assert_user_active();

  select * into v_order from public.orders where id = _order_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'order_not_found'); end if;
  if v_order.buyer_id <> v_user then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v_order.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'order_not_pending'); end if;

  select * into v_wallet from public.wallets where user_id = v_user for update;
  if not found then
    insert into public.wallets (user_id) values (v_user) returning * into v_wallet;
  end if;

  v_order_currency := upper(coalesce(v_order.currency, 'EUR'));
  v_wallet_currency := upper(coalesce(v_wallet.currency, v_order_currency));

  if v_wallet_currency = v_order_currency then
    v_debit := v_order.total;
    v_rate := 1;
  else
    v_debit := public.convert_money(v_order.total, v_order_currency, v_wallet_currency);
    v_rate := public.fx_rate(v_order_currency, v_wallet_currency);
    if v_debit is null then return jsonb_build_object('ok', false, 'error', 'conversion_unavailable'); end if;
  end if;

  if v_wallet.balance < v_debit then
    return jsonb_build_object('ok', false, 'error', 'insufficient_funds',
      'balance', v_wallet.balance, 'total', v_debit,
      'order_amount', v_order.total, 'order_currency', v_order_currency,
      'wallet_currency', v_wallet_currency, 'rate', v_rate);
  end if;

  v_risk := public.risk_check_and_consume(v_user, 'spend', v_debit, v_wallet_currency, true);
  if coalesce((v_risk->>'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'error', coalesce(v_risk->>'error', 'daily_limit'),
      'cap', v_risk->'cap', 'used', v_risk->'used', 'currency', v_wallet_currency);
  end if;

  v_new_balance := v_wallet.balance - v_debit;
  update public.wallets set balance = v_new_balance, updated_at = now() where user_id = v_user;
  insert into public.wallet_transactions (user_id, type, amount, balance_after, order_id, status, meta)
    values (v_user, 'purchase', -v_debit, v_new_balance, _order_id, 'completed',
      jsonb_build_object('order_currency', v_order_currency, 'order_amount', v_order.total,
        'wallet_currency', v_wallet_currency, 'wallet_amount', v_debit, 'rate', v_rate));

  update public.orders set status = 'paid', paid_at = now(), updated_at = now() where id = _order_id;

  return jsonb_build_object('ok', true, 'balance', v_new_balance,
    'debit_amount', v_debit, 'debit_currency', v_wallet_currency,
    'order_amount', v_order.total, 'order_currency', v_order_currency, 'rate', v_rate);
end;
$$;

grant execute on function public.pay_order_with_wallet(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Patch request_payout — verified required + risk_restricted + XOF min 5000
-- ---------------------------------------------------------------------------
create or replace function public.request_payout(
  _amount numeric, _method text, _destination jsonb, _source text default 'seller'
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_min numeric;
  v_payout_id uuid;
  v_available numeric;
  v_currency text;
  v_verified boolean;
  v_restricted boolean;
  v_recent_topup boolean;
  v_recent_gift boolean;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  perform public.assert_user_active();

  select coalesce(is_verified, false), coalesce(risk_restricted, false)
    into v_verified, v_restricted
    from public.profiles where id = v_user;

  if v_restricted then
    perform public.risk_raise_alert(v_user, 'restricted_block', jsonb_build_object('kind', 'payout'));
    return jsonb_build_object('ok', false, 'error', 'risk_restricted');
  end if;

  if not v_verified then
    perform public.risk_raise_alert(v_user, 'payout_unverified', jsonb_build_object(
      'amount', _amount, 'source', _source));
    return jsonb_build_object('ok', false, 'error', 'verification_required');
  end if;

  if _method not in ('wave','orange_money','bank_transfer','paypal') then
    return jsonb_build_object('ok', false, 'error', 'invalid_method');
  end if;
  if _amount is null or _amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;
  if _source not in ('seller','referral') then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;

  if _source = 'referral' then
    select available, currency into v_available, v_currency
      from public.referral_balances where owner_id = v_user for update;
    if v_available is null then return jsonb_build_object('ok', false, 'error', 'no_balance'); end if;
  else
    select available, currency into v_available, v_currency
      from public.seller_balances where seller_id = v_user for update;
    if v_available is null then return jsonb_build_object('ok', false, 'error', 'no_balance'); end if;
  end if;

  v_min := case v_currency when 'XOF' then 5000 when 'CAD' then 15 else 10 end;
  if _amount < v_min then return jsonb_build_object('ok', false, 'error', 'below_minimum', 'min', v_min); end if;
  if v_available < _amount then return jsonb_build_object('ok', false, 'error', 'insufficient_funds', 'available', v_available); end if;

  select exists (
    select 1 from public.wallet_transactions
     where user_id = v_user and type = 'topup' and status = 'completed'
       and created_at > now() - interval '2 hours'
  ) into v_recent_topup;
  select exists (
    select 1 from public.seller_earnings
     where seller_id = v_user and source = 'gift'
       and created_at > now() - interval '2 hours'
  ) into v_recent_gift;
  if v_recent_topup and v_recent_gift then
    perform public.risk_raise_alert(v_user, 'velocity_topup_gift_payout', jsonb_build_object(
      'amount', _amount, 'currency', v_currency, 'source', _source));
  end if;

  if _source = 'referral' then
    update public.referral_balances set available = available - _amount, updated_at = now()
     where owner_id = v_user;
  else
    update public.seller_balances set available = available - _amount, updated_at = now()
     where seller_id = v_user;
  end if;

  insert into public.payouts (seller_id, amount, currency, method, destination, source)
    values (v_user, _amount, v_currency, _method, _destination, _source)
    returning id into v_payout_id;
  return jsonb_build_object('ok', true, 'payout_id', v_payout_id);
end;
$$;

revoke all on function public.request_payout(numeric, text, jsonb, text) from public, anon;
grant execute on function public.request_payout(numeric, text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Admin RPCs — list / resolve alerts + set risk_restricted
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_risk_alerts(
  _status text default 'open', _limit int default 50, _offset int default 0
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_rows jsonb;
  v_total int;
begin
  if v_user is null or not public.is_admin(v_user) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select count(*)::int into v_total
    from public.risk_alerts a
   where case when _status = 'resolved' then a.resolved_at is not null
              when _status = 'all' then true
              else a.resolved_at is null end;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb)
    into v_rows
    from (
      select a.id, a.user_id, a.kind, a.detail, a.created_at, a.resolved_at, a.resolved_by,
        p.handle as user_handle, p.display_name as user_name,
        coalesce(p.is_verified, false) as is_verified,
        coalesce(p.risk_restricted, false) as risk_restricted
      from public.risk_alerts a
      left join public.profiles p on p.id = a.user_id
      where case when _status = 'resolved' then a.resolved_at is not null
                 when _status = 'all' then true
                 else a.resolved_at is null end
      order by a.created_at desc
      limit greatest(1, least(coalesce(_limit, 50), 100))
      offset greatest(0, coalesce(_offset, 0))
    ) x;

  return jsonb_build_object('ok', true, 'rows', v_rows, 'total', v_total);
end;
$$;

revoke all on function public.admin_list_risk_alerts(text, int, int) from public, anon;
grant execute on function public.admin_list_risk_alerts(text, int, int) to authenticated;

create or replace function public.admin_resolve_risk_alert(_alert_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not public.is_admin(v_user) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  update public.risk_alerts set resolved_at = now(), resolved_by = v_user
   where id = _alert_id and resolved_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_resolve_risk_alert(uuid) from public, anon;
grant execute on function public.admin_resolve_risk_alert(uuid) to authenticated;

create or replace function public.admin_set_risk_restricted(
  _user_id uuid, _restricted boolean
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not public.is_admin(v_user) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  update public.profiles set risk_restricted = coalesce(_restricted, false) where id = _user_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform public.risk_raise_alert(_user_id, 'admin_risk_restricted', jsonb_build_object(
    'restricted', coalesce(_restricted, false), 'by', v_user));
  return jsonb_build_object('ok', true, 'risk_restricted', coalesce(_restricted, false));
end;
$$;

revoke all on function public.admin_set_risk_restricted(uuid, boolean) from public, anon;
grant execute on function public.admin_set_risk_restricted(uuid, boolean) to authenticated;

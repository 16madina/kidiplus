alter table public.profiles
  add column if not exists stripe_connect_id text,
  add column if not exists connect_status text not null default 'none',
  add column if not exists connect_charges_enabled boolean not null default false,
  add column if not exists connect_payouts_enabled boolean not null default false,
  add column if not exists connect_updated_at timestamptz;

alter table public.profiles drop constraint if exists profiles_connect_status_check;
alter table public.profiles add constraint profiles_connect_status_check
  check (connect_status = any (array['none','pending','active','restricted']));

alter table public.payouts
  add column if not exists stripe_transfer_id text,
  add column if not exists stripe_error text;

alter table public.payouts drop constraint if exists payouts_method_check;
alter table public.payouts add constraint payouts_method_check
  check (method = any (array['wave','orange_money','bank_transfer','paypal','stripe_connect']));

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
  v_tier text;
  v_caps jsonb;
  v_daily_cap numeric;
  v_weekly_cap numeric;
  v_day_used numeric;
  v_week_used numeric;
  v_day_start timestamptz;
  v_recent_topup boolean;
  v_recent_gift boolean;
  v_connect text;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  perform public.assert_user_active();

  v_tier := public.risk_user_tier(v_user);
  if v_tier = 'restricted' then
    perform public.risk_raise_alert(v_user, 'restricted_block', jsonb_build_object('kind', 'payout'));
    return jsonb_build_object('ok', false, 'error', 'risk_restricted');
  end if;

  if _method not in ('wave','orange_money','bank_transfer','paypal','stripe_connect') then
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
    if v_available is null then
      return jsonb_build_object('ok', false, 'error', 'no_balance');
    end if;
  else
    select available, currency into v_available, v_currency
      from public.seller_balances where seller_id = v_user for update;
    if v_available is null then
      return jsonb_build_object('ok', false, 'error', 'no_balance');
    end if;
  end if;

  v_currency := upper(coalesce(v_currency, 'EUR'));

  if _method = 'stripe_connect' then
    if v_currency = 'XOF' then
      return jsonb_build_object('ok', false, 'error', 'connect_currency_unsupported');
    end if;
    select connect_status into v_connect from public.profiles where id = v_user;
    if coalesce(v_connect, 'none') <> 'active' then
      return jsonb_build_object('ok', false, 'error', 'connect_not_ready', 'connect_status', coalesce(v_connect,'none'));
    end if;
  end if;

  v_min := case v_currency when 'XOF' then 5000 when 'CAD' then 15 else 10 end;
  if _amount < v_min then
    return jsonb_build_object('ok', false, 'error', 'below_minimum', 'min', v_min);
  end if;
  if v_available < _amount then
    return jsonb_build_object('ok', false, 'error', 'insufficient_funds', 'available', v_available);
  end if;

  v_caps := public.risk_payout_caps(v_tier, v_currency);
  v_daily_cap := coalesce((v_caps->>'daily')::numeric, 0);
  v_weekly_cap := coalesce((v_caps->>'weekly')::numeric, 0);
  v_day_start := date_trunc('day', timezone('utc', now())) at time zone 'utc';

  v_day_used := public.risk_payout_usage(v_user, v_currency, v_day_start);
  v_week_used := public.risk_payout_usage(v_user, v_currency, now() - interval '7 days');

  if v_day_used + _amount > v_daily_cap then
    perform public.risk_raise_alert(v_user, 'payout_daily_limit', jsonb_build_object(
      'amount', _amount, 'currency', v_currency, 'tier', v_tier,
      'used', v_day_used, 'cap', v_daily_cap
    ));
    return jsonb_build_object('ok', false, 'error', 'payout_daily_limit', 'tier', v_tier,
      'used', v_day_used, 'cap', v_daily_cap, 'currency', v_currency);
  end if;

  if v_week_used + _amount > v_weekly_cap then
    perform public.risk_raise_alert(v_user, 'payout_weekly_limit', jsonb_build_object(
      'amount', _amount, 'currency', v_currency, 'tier', v_tier,
      'used', v_week_used, 'cap', v_weekly_cap
    ));
    return jsonb_build_object('ok', false, 'error', 'payout_weekly_limit', 'tier', v_tier,
      'used', v_week_used, 'cap', v_weekly_cap, 'currency', v_currency);
  end if;

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
      'amount', _amount, 'currency', v_currency, 'source', _source
    ));
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

  return jsonb_build_object(
    'ok', true,
    'payout_id', v_payout_id,
    'tier', v_tier,
    'daily_cap', v_daily_cap,
    'weekly_cap', v_weekly_cap
  );
end;
$$;

revoke all on function public.request_payout(numeric, text, jsonb, text) from public, anon;
grant execute on function public.request_payout(numeric, text, jsonb, text) to authenticated;
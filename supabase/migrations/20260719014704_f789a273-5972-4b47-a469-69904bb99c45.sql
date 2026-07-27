-- Payout tier limits: day + rolling week caps (new / trusted badge / KYC).
-- Replaces hard "verification_required" block on request_payout.
-- Caps mirrored in src/lib/risk-limits.ts.

alter table public.profiles
  add column if not exists kyc_verified boolean not null default false;

comment on column public.profiles.kyc_verified is
  'Identity KYC verified (ID document). Highest payout tier. UI/Stripe Identity later.';

-- Tier: restricted > kyc > trusted (badge) > new
create or replace function public.risk_user_tier(_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_restricted boolean;
  v_verified boolean;
  v_kyc boolean;
begin
  select
    coalesce(risk_restricted, false),
    coalesce(is_verified, false),
    coalesce(kyc_verified, false)
    into v_restricted, v_verified, v_kyc
    from public.profiles
   where id = _user_id;
  if not found then
    return 'new';
  end if;
  if v_restricted then
    return 'restricted';
  end if;
  if v_kyc then
    return 'kyc';
  end if;
  if v_verified then
    return 'trusted';
  end if;
  return 'new';
end;
$$;

create or replace function public.risk_payout_caps(_tier text, _currency text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_cur text := upper(coalesce(_currency, 'EUR'));
  v_day numeric;
  v_week numeric;
begin
  if _tier = 'restricted' then
    return jsonb_build_object('daily', 0, 'weekly', 0);
  end if;

  if _tier = 'kyc' then
    v_day := case v_cur when 'XOF' then 1312000 when 'CAD' then 2000 else 2000 end;
    v_week := case v_cur when 'XOF' then 3280000 when 'CAD' then 5000 else 5000 end;
  elsif _tier = 'trusted' then
    v_day := case v_cur when 'XOF' then 656000 when 'CAD' then 1000 else 1000 end;
    v_week := case v_cur when 'XOF' then 1640000 when 'CAD' then 2500 else 2500 end;
  else
    v_day := case v_cur when 'XOF' then 328000 when 'CAD' then 500 else 500 end;
    v_week := case v_cur when 'XOF' then 984000 when 'CAD' then 1500 else 1500 end;
  end if;

  return jsonb_build_object('daily', v_day, 'weekly', v_week);
end;
$$;

create or replace function public.risk_payout_usage(
  _user_id uuid,
  _currency text,
  _since timestamptz
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)
    from public.payouts
   where seller_id = _user_id
     and upper(currency) = upper(_currency)
     and status in ('requested', 'processing', 'paid')
     and requested_at >= _since;
$$;

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
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  perform public.assert_user_active();

  v_tier := public.risk_user_tier(v_user);
  if v_tier = 'restricted' then
    perform public.risk_raise_alert(v_user, 'restricted_block', jsonb_build_object('kind', 'payout'));
    return jsonb_build_object('ok', false, 'error', 'risk_restricted');
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
    return jsonb_build_object(
      'ok', false,
      'error', 'payout_daily_limit',
      'tier', v_tier,
      'used', v_day_used,
      'cap', v_daily_cap,
      'currency', v_currency
    );
  end if;

  if v_week_used + _amount > v_weekly_cap then
    perform public.risk_raise_alert(v_user, 'payout_weekly_limit', jsonb_build_object(
      'amount', _amount, 'currency', v_currency, 'tier', v_tier,
      'used', v_week_used, 'cap', v_weekly_cap
    ));
    return jsonb_build_object(
      'ok', false,
      'error', 'payout_weekly_limit',
      'tier', v_tier,
      'used', v_week_used,
      'cap', v_weekly_cap,
      'currency', v_currency
    );
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

create or replace function public.admin_set_kyc_verified(
  _user_id uuid,
  _verified boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not public.is_admin(v_user) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  update public.profiles
     set kyc_verified = coalesce(_verified, false)
   where id = _user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform public.risk_raise_alert(_user_id, 'admin_kyc_verified', jsonb_build_object(
    'kyc_verified', coalesce(_verified, false),
    'by', v_user
  ));
  return jsonb_build_object('ok', true, 'kyc_verified', coalesce(_verified, false));
end;
$$;

revoke all on function public.admin_set_kyc_verified(uuid, boolean) from public, anon;
grant execute on function public.admin_set_kyc_verified(uuid, boolean) to authenticated;
-- Fix wallet checkout: orders has no updated_at column.
-- pay_order_with_wallet was updating orders.updated_at → SQL exception →
-- generic "Une erreur est survenue" while PayPal (no updated_at) still worked.

CREATE OR REPLACE FUNCTION public.pay_order_with_wallet(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  begin
    perform public.assert_user_active();
  exception
    when insufficient_privilege then
      return jsonb_build_object('ok', false, 'error', SQLERRM);
    when others then
      if SQLERRM ilike '%account_banned%' then
        return jsonb_build_object('ok', false, 'error', 'account_banned');
      end if;
      if SQLERRM ilike '%account_suspended%' then
        return jsonb_build_object('ok', false, 'error', 'account_suspended');
      end if;
      return jsonb_build_object('ok', false, 'error', 'account_inactive');
  end;

  select * into v_order from public.orders where id = _order_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'order_not_found'); end if;
  if v_order.buyer_id <> v_user then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  if v_order.status = 'paid' then
    return jsonb_build_object('ok', false, 'error', 'order_already_paid');
  end if;
  if v_order.status not in ('pending', 'failed', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'order_not_payable');
  end if;
  if v_order.status = 'cancelled' and coalesce(v_order.cancelled_reason, '') = 'payment_timeout' then
    return jsonb_build_object('ok', false, 'error', 'order_expired');
  end if;
  if v_order.payment_deadline is not null and v_order.payment_deadline < now() then
    return jsonb_build_object('ok', false, 'error', 'order_expired');
  end if;

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

  -- Do NOT set orders.updated_at — column does not exist on public.orders.
  update public.orders
    set status = 'paid',
        payment_method = 'wallet',
        paid_at = now(),
        stripe_payment_intent_id = null,
        cancelled_reason = null
    where id = _order_id;

  begin
    perform public.credit_seller_earning(_order_id);
  exception when others then
    null;
  end;

  return jsonb_build_object('ok', true, 'balance', v_new_balance,
    'debit_amount', v_debit, 'debit_currency', v_wallet_currency,
    'order_amount', v_order.total, 'order_currency', v_order_currency, 'rate', v_rate);
end;
$function$;

REVOKE ALL ON FUNCTION public.pay_order_with_wallet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_order_with_wallet(uuid) TO authenticated;

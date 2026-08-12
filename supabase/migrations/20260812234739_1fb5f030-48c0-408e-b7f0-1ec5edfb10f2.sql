CREATE OR REPLACE FUNCTION public.release_overdue_escrow()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ord record; v_count integer := 0; v_reminders integer := 0; v_order public.orders;
BEGIN
  -- Auto-release
  FOR v_ord IN
    SELECT o.id FROM public.orders o
      JOIN public.seller_earnings e ON e.order_id = o.id
     WHERE o.status='paid' AND o.fulfillment_status='shipped'
       AND o.shipped_at IS NOT NULL AND o.shipped_at < now() - interval '7 days'
       AND e.status='pending'
  LOOP
    PERFORM public._release_order_escrow(v_ord.id, true);
    SELECT * INTO v_order FROM public.orders WHERE id = v_ord.id;
    PERFORM public._log_order_event(v_ord.id, 'auto_released', NULL, NULL);
    PERFORM public._push_notification(v_order.buyer_id, 'order_auto_released',
      'Fonds remis au vendeur',
      'Le délai de confirmation est dépassé — les fonds de ' || COALESCE(v_order.item_name,'ta commande') || ' ont été remis au vendeur.',
      v_ord.id);
    PERFORM public._push_notification(v_order.seller_id, 'order_auto_released',
      '💰 Fonds libérés automatiquement',
      'Les fonds pour ' || COALESCE(v_order.item_name,'ta vente') || ' sont désormais disponibles.',
      v_ord.id);
    v_count := v_count + 1;
  END LOOP;

  -- J+3 reminder (4 days before auto-release)
  FOR v_ord IN
    SELECT o.id FROM public.orders o
     WHERE o.status='paid' AND o.fulfillment_status='shipped'
       AND o.shipped_at IS NOT NULL AND o.shipped_at < now() - interval '3 days'
       AND o.shipped_at >= now() - interval '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.notifications n
         WHERE n.order_id = o.id AND n.kind = 'order_reminder'
       )
  LOOP
    SELECT * INTO v_order FROM public.orders WHERE id = v_ord.id;
    PERFORM public._push_notification(v_order.buyer_id, 'order_reminder',
      'As-tu bien reçu ' || COALESCE(v_order.item_name,'ta commande') || ' ?',
      'Confirme la réception — sans réponse, les fonds seront remis au vendeur dans 4 jours. Un problème ? Signale-le.',
      v_ord.id);
    v_reminders := v_reminders + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'released', v_count, 'reminders', v_reminders);
END;
$function$;

SELECT cron.schedule(
  'release_overdue_escrow',
  '*/15 * * * *',
  $$
    SELECT public.release_overdue_escrow();
  $$
);
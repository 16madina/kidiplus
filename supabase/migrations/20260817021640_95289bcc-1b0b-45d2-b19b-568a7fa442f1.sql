SELECT public._battle_sweep_stale();

SELECT public._battle_end_internal(s.id, 'timeout', NULL)
FROM public.battle_sessions s
WHERE s.status IN ('running', 'sudden_death');
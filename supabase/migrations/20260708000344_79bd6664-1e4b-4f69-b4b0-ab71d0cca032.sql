
CREATE POLICY "Admins read payout proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'payout-proofs' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins upload payout proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'payout-proofs' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins update payout proofs"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'payout-proofs' AND public.is_admin(auth.uid()))
WITH CHECK (bucket_id = 'payout-proofs' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins delete payout proofs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'payout-proofs' AND public.is_admin(auth.uid()));

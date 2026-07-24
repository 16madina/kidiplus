// Buyer address book — CRUD (client-side, RLS-guarded by owner).

import { supabase } from "@/integrations/supabase/client";

type AnySb = { from: (t: string) => any };
const sb = supabase as unknown as AnySb;

export type AddressRow = {
  id: string;
  user_id: string;
  label: string;
  full_name: string;
  phone: string;
  country: string;
  city: string;
  zone_or_commune: string | null;
  street_address: string | null;
  postal_code: string | null;
  region: string | null;
  details: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export async function fetchMyAddresses(userId: string): Promise<AddressRow[]> {
  const { data, error } = await sb
    .from("addresses")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return data as AddressRow[];
}

export async function fetchDefaultAddress(userId: string): Promise<AddressRow | null> {
  const { data } = await sb
    .from("addresses")
    .select("*")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();
  if (data) return data as AddressRow;
  // Fallback for legacy rows never marked default.
  const { data: anyAddr } = await sb
    .from("addresses")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (anyAddr ?? null) as AddressRow | null;
}

export type AddressInput = {
  label?: string;
  full_name: string;
  phone: string;
  country?: string;
  city: string;
  zone_or_commune?: string | null;
  street_address?: string | null;
  postal_code?: string | null;
  region?: string | null;
  details?: string | null;
  is_default?: boolean;
};

export async function createAddress(
  userId: string,
  input: AddressInput,
): Promise<{ ok: true; address: AddressRow } | { ok: false; error: string }> {
  // First address becomes default automatically — otherwise the live delivery
  // gate keeps seeing "no_address" even after the buyer just typed one.
  let makeDefault = !!input.is_default;
  if (!makeDefault) {
    const { count } = await sb
      .from("addresses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    makeDefault = (count ?? 0) === 0;
  }
  const { data, error } = await sb
    .from("addresses")
    .insert({
      user_id: userId,
      label: input.label ?? "",
      full_name: input.full_name.trim(),
      phone: input.phone.trim(),
      country: input.country ?? "",
      city: input.city.trim(),
      zone_or_commune: (input.zone_or_commune ?? "").trim() || null,
      street_address: (input.street_address ?? "").trim() || null,
      postal_code: (input.postal_code ?? "").trim() || null,
      region: (input.region ?? "").trim() || null,
      details: (input.details ?? "").trim() || null,
      is_default: makeDefault,
    })
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };
  return { ok: true, address: data as AddressRow };
}

export async function updateAddress(
  addressId: string,
  patch: Partial<AddressInput>,
): Promise<{ ok: true; address: AddressRow } | { ok: false; error: string }> {
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) row.label = patch.label;
  if (patch.full_name !== undefined) row.full_name = patch.full_name.trim();
  if (patch.phone !== undefined) row.phone = patch.phone.trim();
  if (patch.country !== undefined) row.country = patch.country;
  if (patch.city !== undefined) row.city = patch.city.trim();
  if (patch.zone_or_commune !== undefined) row.zone_or_commune = (patch.zone_or_commune ?? "").trim() || null;
  if (patch.street_address !== undefined) row.street_address = (patch.street_address ?? "").trim() || null;
  if (patch.postal_code !== undefined) row.postal_code = (patch.postal_code ?? "").trim() || null;
  if (patch.region !== undefined) row.region = (patch.region ?? "").trim() || null;
  if (patch.details !== undefined) row.details = (patch.details ?? "").trim() || null;
  if (patch.is_default !== undefined) row.is_default = !!patch.is_default;
  const { data, error } = await sb
    .from("addresses")
    .update(row)
    .eq("id", addressId)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "update failed" };
  return { ok: true, address: data as AddressRow };
}

export async function setDefaultAddress(addressId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.from("addresses").update({ is_default: true }).eq("id", addressId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteAddress(
  addressId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Soft-guard: refuse delete if any order references this address.
  const { count } = await sb
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("address_id", addressId);
  if ((count ?? 0) > 0) return { ok: false, error: "address_in_use" };
  const { error } = await sb.from("addresses").delete().eq("id", addressId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

DELETE FROM shop_products WHERE seller_id = '965d62ea-1d43-40e9-9dc1-d254884d13ec';
DELETE FROM seller_delivery_settings WHERE seller_id = '965d62ea-1d43-40e9-9dc1-d254884d13ec';
UPDATE profiles SET is_seller = false WHERE id = '965d62ea-1d43-40e9-9dc1-d254884d13ec';
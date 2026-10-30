-- The cached rates came from Bank of England series quoted against the US dollar,
-- not sterling. Clear them; the table refills from the correct series on demand.
DELETE FROM "fx_rates";

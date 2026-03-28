-- Database function for decrementing prize stock
CREATE OR REPLACE FUNCTION decrement_prize_stock(prize_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE lucky_wheel_prizes
    SET stock_remaining = GREATEST(0, stock_remaining - 1),
        updated_at = NOW()
    WHERE id = prize_id
    AND is_unlimited_stock = false
    AND stock_remaining > 0;
END;
$$;

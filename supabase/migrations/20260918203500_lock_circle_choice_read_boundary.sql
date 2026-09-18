-- Circle choices are intentionally private until both sides opt in.
-- Browser clients consume only the lifecycle RPC's viewer choice + mutual result.

revoke select on table public.connection_circle_choices from authenticated;

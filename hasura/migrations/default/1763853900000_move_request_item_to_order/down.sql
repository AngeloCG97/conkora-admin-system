DROP FUNCTION public.move_request_item_to_order(uuid, numeric, date);
ALTER TABLE public.order_item DROP COLUMN description;

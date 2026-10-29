-- Lot 7: reviews.rating stays within what the stars can show (review DATA-11).
-- 0 is what the app writes for "no rating"; 1 to 5 are the stars. Prod data
-- was checked before adding it (min 4, max 5, no null).
alter table public.reviews drop constraint if exists reviews_rating_range;
alter table public.reviews add constraint reviews_rating_range check (rating between 0 and 5);

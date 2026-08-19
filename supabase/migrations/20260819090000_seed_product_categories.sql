insert into public.categories (name, slug, description, sort_order, is_published)
values
  ('Milk Tea', 'milk-tea', 'Classic tea with milk or dairy alternatives.', 10, true),
  ('Fruit Tea', 'fruit-tea', 'Tea drinks with fruit flavours.', 20, true)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_published = excluded.is_published;

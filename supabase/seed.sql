with batch as (
  insert into public.import_batches (
    source_name,
    period_month,
    source_file_name,
    notes
  )
  values (
    'Presupuesto marzo 2026',
    date '2026-03-01',
    'presupuesto_desglose - presupuesto_desglose.xls.csv',
    'Carga base tomada de la planilla compartida por el usuario'
  )
  returning id
)
insert into public.fixed_expenses (
  name,
  category_name,
  amount,
  due_day,
  notes,
  is_prorated
)
select *
from (
  values
    ('UCM', 'Salud', 2640, 10, null, false),
    ('Estacionamiento', 'Vehículo', 2500, 10, null, false),
    ('Angirú', 'Educación', 8500, 10, null, false),
    ('Camioneta Camilo', 'Vehículo', 4000, 10, null, false),
    ('Boletos comunes', 'Vehículo', 4988, 10, null, false),
    ('Boletos Escuela', 'Vehículo', 2640, 10, null, false),
    ('Contribución + patente (prorrateado)', 'Vehículo', 6152, 10, null, true),
    ('Primaria (prorrateado)', 'Educación', 1079, 10, null, true),
    ('Fondo de Solidaridad', 'Educación', 1638, 10, null, false),
    ('Celular Mauri', 'Servicios', 1363, 10, null, false),
    ('ADSL + Disney', 'Servicios', 2420, 10, null, false),
    ('Tarjeta fija Mauri', 'Tarjetas', 4423, 10, null, false),
    ('Cuota auto actual', 'Vehículo', 15000, 10, null, false)
) as fixed_data(name, category_name, amount, due_day, notes, is_prorated)
where not exists (
  select 1
  from public.fixed_expenses existing
  where existing.name = fixed_data.name
);

with inserted_batch as (
  select id
  from public.import_batches
  where source_name = 'Presupuesto marzo 2026'
  order by created_at desc
  limit 1
)
insert into public.transactions (
  title,
  category_name,
  amount,
  type,
  occurred_on,
  period_month,
  source_type,
  import_batch_id,
  notes,
  is_consolidated
)
select *
from (
  values
    ('Disco (super)', 'Comidas', 1172, 'expense', date '2026-03-04', date '2026-03-01', 'csv_import', (select id from inserted_batch), 'Rubro comidas', false),
    ('UTE', 'Servicios', 4084, 'expense', date '2026-03-05', date '2026-03-01', 'csv_import', (select id from inserted_batch), null, false),
    ('Bookshop', 'Compras', 842, 'expense', date '2026-03-05', date '2026-03-01', 'csv_import', (select id from inserted_batch), null, false),
    ('Heladería', 'Comidas', 501, 'expense', date '2026-03-05', date '2026-03-01', 'csv_import', (select id from inserted_batch), 'Rubro comidas', false),
    ('Merienda', 'Comidas', 1178, 'expense', date '2026-03-11', date '2026-03-01', 'chat', (select id from inserted_batch), '+500 y +236 agregados por chat (11/03/2026)', false),
    ('Merienda', 'Comidas', 236, 'expense', date '2026-03-18', date '2026-03-01', 'chat', (select id from inserted_batch), 'Agregado por chat 18/03/2026', false),
    ('Disco (ticket adicional)', 'Comidas', 1078, 'expense', date '2026-03-05', date '2026-03-01', 'csv_import', (select id from inserted_batch), null, false),
    ('Fresh Market', 'Comidas', 2417, 'expense', date '2026-03-05', date '2026-03-01', 'ticket', (select id from inserted_batch), 'Total con descuento ley 19210 aplicado', false),
    ('Celular Laura', 'Servicios', 1256, 'expense', date '2026-03-18', date '2026-03-01', 'chat', (select id from inserted_batch), 'Corregido por chat 18/03/2026', false),
    ('OSE', 'Servicios', 1006, 'expense', date '2026-03-18', date '2026-03-01', 'chat', (select id from inserted_batch), 'Corregido por chat 18/03/2026', false),
    ('Farmashop (pañales + toallitas)', 'Compras', 1634, 'expense', date '2026-03-05', date '2026-03-01', 'ticket', (select id from inserted_batch), 'Ticket 05/03/2026', false),
    ('Forros de cuadernos', 'Compras', 161, 'expense', date '2026-03-05', date '2026-03-01', 'csv_import', (select id from inserted_batch), null, false),
    ('Desayuno', 'Comidas', 300, 'expense', date '2026-03-05', date '2026-03-01', 'chat', (select id from inserted_batch), 'Agregado por chat; rubro comidas', false),
    ('Pedido comida rápida (El Pinar/Lucca VIS3)', 'Comidas', 1279, 'expense', date '2026-03-06', date '2026-03-01', 'ticket', (select id from inserted_batch), 'Ticket 06/03/2026', false),
    ('Café Grande Marley', 'Comidas', 175, 'expense', date '2026-03-09', date '2026-03-01', 'ticket', (select id from inserted_batch), 'Ticket 09/03/2026 (Lagándara)', false),
    ('Almuerzo', 'Comidas', 1027, 'expense', date '2026-03-13', date '2026-03-01', 'chat', (select id from inserted_batch), 'Incluye ajustes del 11/03 y 13/03', false),
    ('Estudios médicos', 'Salud', 3337, 'expense', date '2026-03-12', date '2026-03-01', 'chat', (select id from inserted_batch), 'Carga retroactiva', false),
    ('Lavado', 'Vehículo', 450, 'expense', date '2026-03-12', date '2026-03-01', 'chat', (select id from inserted_batch), 'Carga retroactiva', false),
    ('UTE del auto', 'Vehículo', 332, 'expense', date '2026-03-26', date '2026-03-01', 'ticket', (select id from inserted_batch), 'e-Ticket crédito T 5604798', false),
    ('Gastos varios (almuerzos, pizza, Brimat)', 'Comidas', 2956, 'expense', date '2026-03-16', date '2026-03-01', 'consolidated', (select id from inserted_batch), 'Consolidado histórico 12/03 al 16/03', true),
    ('Comidas varias', 'Comidas', 5100, 'expense', date '2026-03-18', date '2026-03-01', 'chat', (select id from inserted_batch), 'Ítem consolidado agregado por chat 18/03/2026', true),
    ('Macro Mercado', 'Comidas', 8658, 'expense', date '2026-03-18', date '2026-03-01', 'ticket', (select id from inserted_batch), 'Ticket 18/03/2026', false),
    ('Tarjeta Laura', 'Tarjetas', 5747, 'expense', date '2026-03-14', date '2026-03-01', 'chat', (select id from inserted_batch), 'Pago Mastercard terminada en 2760', false),
    ('Tarjeta Mauricio', 'Tarjetas', 15497, 'expense', date '2026-03-18', date '2026-03-01', 'chat', (select id from inserted_batch), 'Pago de tarjeta neto adicional', false),
    ('Disco (super)', 'Comidas', 925, 'expense', date '2026-03-21', date '2026-03-01', 'ticket', (select id from inserted_batch), 'Ticket 21/03/2026', false),
    ('Café Movistar', 'Comidas', 1257, 'expense', date '2026-03-22', date '2026-03-01', 'ticket', (select id from inserted_batch), 'Ticket 22/03/2026', false),
    ('Tienda Inglesa / Más', 'Comidas', 1849, 'expense', date '2026-03-24', date '2026-03-01', 'ticket', (select id from inserted_batch), 'Titular Laura Mendez', false),
    ('Disco (super)', 'Comidas', 2361, 'expense', date '2026-03-26', date '2026-03-01', 'ticket', (select id from inserted_batch), 'Ticket 26/03/2026', false),
    ('Gastos varios (almuerzos + pizza + papas)', 'Comidas', 3183, 'expense', date '2026-03-29', date '2026-03-01', 'chat', (select id from inserted_batch), 'Agregado por chat 29/03/2026', true),
    ('Farmashop / pedido baby y perfumería', 'Compras', 3451, 'expense', date '2026-03-29', date '2026-03-01', 'ticket', (select id from inserted_batch), 'Compra con descuentos', false),
    ('Sorrentinos y canelones', 'Comidas', 2183, 'expense', date '2026-03-29', date '2026-03-01', 'chat', (select id from inserted_batch), 'Sin ticket adjunto', false),
    ('Merienda', 'Comidas', 1038, 'expense', date '2026-03-29', date '2026-03-01', 'chat', (select id from inserted_batch), 'Sin ticket adjunto', false),
    ('Libros y juguetes', 'Compras', 2744, 'expense', date '2026-03-29', date '2026-03-01', 'chat', (select id from inserted_batch), 'Sin ticket adjunto', false),
    ('Ingreso Laura', 'Ingreso', 100730, 'income', date '2026-03-01', date '2026-03-01', 'csv_import', (select id from inserted_batch), 'Líquido', false),
    ('Ingreso Mauricio (ACJ Feb/2026)', 'Ingreso', 46205, 'income', date '2026-03-01', date '2026-03-01', 'csv_import', (select id from inserted_batch), 'Líquido', false)
) as tx_data(title, category_name, amount, type, occurred_on, period_month, source_type, import_batch_id, notes, is_consolidated)
where not exists (
  select 1
  from public.transactions existing
  where existing.title = tx_data.title
    and existing.amount = tx_data.amount
    and existing.occurred_on = tx_data.occurred_on
    and existing.type = tx_data.type
);

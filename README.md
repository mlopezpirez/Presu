# Presu

Dashboard para finanzas personales con foco en:

- registrar ingresos y gastos
- administrar gastos fijos
- simular escenarios de presupuesto
- persistir datos en Supabase
- desplegar en Netlify

La estructura de base de datos fue definida tomando como base tu CSV de marzo 2026, incluyendo:

- ingresos por persona
- gastos fijos y prorrateados
- gastos variables
- movimientos cargados desde ticket, chat o consolidado
- notas e importaciones mensuales

## Stack

- React + TypeScript + Vite
- Supabase
- Recharts
- Netlify

## Ejecutar local

```bash
npm install
cp .env.example .env
npm run dev
```

Si no configurás Supabase, la app arranca en modo demo con datos inspirados en marzo.

## Crear la BD en Supabase

1. Crear un proyecto nuevo en Supabase.
2. Abrir el SQL Editor.
3. Ejecutar [`supabase/schema.sql`](/Users/mauriciolopez/Documents/Presu/supabase/schema.sql).
4. Si querés arrancar con marzo como base, ejecutar [`supabase/march_2026_seed.sql`](/Users/mauriciolopez/Documents/Presu/supabase/march_2026_seed.sql).
5. Copiar [.env.local.example](/Users/mauriciolopez/Documents/Presu/.env.local.example) a `.env.local`.
6. Pegar la `anon key` de tu proyecto `ocpsxscqdcvexwduhwbd`.

## Estructura pensada desde tu CSV

- `finance_settings`: ingreso mensual y meta de ahorro.
- `household_members`: personas del hogar como Laura y Mauricio.
- `budget_categories`: categorías y grupos, con distinción entre fijos y variables.
- `import_batches`: lotes de importación mensuales desde CSV.
- `fixed_expenses`: compromisos recurrentes como UCM, cuota auto, celulares o prorrateos.
- `transactions`: movimientos mensuales con fecha, período, origen (`csv_import`, `chat`, `ticket`, `consolidated`) y notas.
- `budget_scenarios`: ajustes para simular cambios de ingreso o egresos.

## GitHub y Netlify

```bash
git init
git add .
git commit -m "feat: personal finance dashboard"
```

Luego:

1. Crear el repo en GitHub.
2. Hacer `git remote add origin <url-del-repo>`.
3. Hacer `git push -u origin main`.
4. Importar el repo en Netlify.
5. Configurar `VITE_SUPABASE_URL=https://ocpsxscqdcvexwduhwbd.supabase.co`.
6. Configurar `VITE_SUPABASE_ANON_KEY` en Netlify.
7. Configurar `OPENAI_API_KEY` en Netlify para el análisis de tickets.
8. Opcional: usar `OPENAI_TICKET_MODEL=gpt-5-mini` como base para tickets y subir a `gpt-5` o `gpt-5-pro` si priorizás precisión por encima de costo y latencia.
9. Opcional: ajustar `OPENAI_TICKET_REASONING_EFFORT=medium`.
10. Opcional: ajustar `OPENAI_TICKET_IMAGE_DETAIL=low` y `OPENAI_TICKET_TIMEOUT_MS=6500` para evitar timeouts en Netlify.

`netlify.toml` ya deja configurado el build SPA.

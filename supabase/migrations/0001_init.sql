-- Prime Production Board — initial schema
-- All tables live in `public`, RLS enabled with zero anon/authenticated policies.
-- Every read/write goes through the service-role client from Server Components/Actions.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type employee_role as enum ('admin', 'employee', 'supervisor', 'store', 'delivery');

create type order_language as enum ('ar', 'en');

create type order_priority as enum ('normal', 'urgent');

create type order_status as enum (
  'new',
  'in_progress',
  'waiting_materials',
  'ready_pickup',
  'ready_delivery',
  'collected',
  'delivered',
  'completed'
);

create type order_file_type as enum ('product_image', 'design_file');

create type material_type as enum ('paper', 'ink', 'vinyl', 'packaging', 'lamination', 'other');

create type material_priority as enum ('low', 'normal', 'urgent');

create type material_request_status as enum ('pending', 'approved', 'rejected', 'fulfilled');

create type notification_receiver as enum ('customer', 'employee');

create type notification_status as enum ('pending', 'sent', 'failed', 'skipped', 'delivered');

-- ---------------------------------------------------------------------------
-- employees
-- ---------------------------------------------------------------------------

create table employees (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  full_name text not null,
  role employee_role not null default 'employee',
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index employees_role_idx on employees (role) where active;

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------

create sequence order_number_seq start 1001;

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('#' || nextval('order_number_seq')::text),
  customer_name text not null,
  customer_mobile text not null,
  preferred_language order_language not null default 'ar',
  whatsapp_enabled boolean not null default true,
  product text not null,
  paper text,
  paper_size text,
  quantity integer not null check (quantity > 0),
  finishing text,
  priority order_priority not null default 'normal',
  delivery_date date not null,
  delivery_time time not null,
  notes text,
  status order_status not null default 'new',
  archived boolean not null default false,
  created_by uuid not null references employees (id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_status_idx on orders (status) where not archived;
create index orders_archived_idx on orders (archived, completed_at);
create index orders_delivery_idx on orders (delivery_date, delivery_time) where not archived;

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger orders_set_updated_at
  before update on orders
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- order_assignments
-- ---------------------------------------------------------------------------

create table order_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (order_id, employee_id)
);

create index order_assignments_employee_idx on order_assignments (employee_id);
create index order_assignments_order_idx on order_assignments (order_id);

-- ---------------------------------------------------------------------------
-- order_files
-- ---------------------------------------------------------------------------

create table order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  file_type order_file_type not null,
  storage_path text not null,
  file_name text not null,
  uploaded_by uuid not null references employees (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index order_files_order_idx on order_files (order_id);

-- ---------------------------------------------------------------------------
-- order_notes
-- ---------------------------------------------------------------------------

create table order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete restrict,
  note text not null,
  created_at timestamptz not null default now()
);

create index order_notes_order_idx on order_notes (order_id, created_at desc);

-- ---------------------------------------------------------------------------
-- order_status_history
-- ---------------------------------------------------------------------------

create table order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  from_status order_status,
  to_status order_status not null,
  changed_by uuid not null references employees (id) on delete restrict,
  changed_at timestamptz not null default now()
);

create index order_status_history_order_idx on order_status_history (order_id, changed_at);
create index order_status_history_employee_idx on order_status_history (changed_by, changed_at);

-- ---------------------------------------------------------------------------
-- material_requests
-- ---------------------------------------------------------------------------

create table material_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders (id) on delete set null,
  employee_id uuid not null references employees (id) on delete restrict,
  material_type material_type not null,
  description text not null,
  quantity text not null,
  priority material_priority not null default 'normal',
  status material_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references employees (id) on delete set null
);

create index material_requests_status_idx on material_requests (status, created_at desc);
create index material_requests_employee_idx on material_requests (employee_id);

-- ---------------------------------------------------------------------------
-- notification_logs
-- ---------------------------------------------------------------------------

create table notification_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders (id) on delete set null,
  phone text not null,
  receiver_type notification_receiver not null,
  template_name text not null,
  language order_language not null,
  status notification_status not null default 'pending',
  sent_at timestamptz,
  retry_count integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);

create index notification_logs_order_idx on notification_logs (order_id);
create index notification_logs_status_idx on notification_logs (status, created_at desc);

-- ---------------------------------------------------------------------------
-- monthly_statistics
-- ---------------------------------------------------------------------------

create table monthly_statistics (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  month integer not null check (month between 1 and 12),
  total_orders integer not null default 0,
  completed_orders integer not null default 0,
  delayed_orders integer not null default 0,
  orders_per_employee jsonb not null default '{}'::jsonb,
  avg_completion_minutes numeric,
  most_used_paper text,
  most_requested_material text,
  generated_at timestamptz not null default now(),
  unique (year, month)
);

-- ---------------------------------------------------------------------------
-- Row Level Security — enabled everywhere, no anon/authenticated policies.
-- Only the service-role key (used exclusively server-side) can read/write.
-- ---------------------------------------------------------------------------

alter table employees enable row level security;
alter table orders enable row level security;
alter table order_assignments enable row level security;
alter table order_files enable row level security;
alter table order_notes enable row level security;
alter table order_status_history enable row level security;
alter table material_requests enable row level security;
alter table notification_logs enable row level security;
alter table monthly_statistics enable row level security;

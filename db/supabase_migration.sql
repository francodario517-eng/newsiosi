-- VTS Pro: Supabase Migration Schema

-- Extension for UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table for operations (the core nodes of our traceability)
CREATE TABLE IF NOT EXISTS operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation_type TEXT NOT NULL CHECK (operation_type IN ('compra', 'venta')),
    payment_type TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    currency TEXT NOT NULL DEFAULT 'USD',
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    buyer TEXT,
    delivery_amount NUMERIC(15, 2) DEFAULT 0,
    installments INT DEFAULT 0,
    credit_amount NUMERIC(15, 2) DEFAULT 0,
    parent_id UUID REFERENCES operations(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Table for vehicles linked to operations
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation_id UUID REFERENCES operations(id) ON DELETE CASCADE,
    chapa TEXT,
    chasis TEXT,
    description TEXT,
    color TEXT,
    role TEXT NOT NULL CHECK (role IN ('principal', 'parte_pago')),
    valuation NUMERIC(15, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ops_parent ON operations(parent_id);
CREATE INDEX IF NOT EXISTS idx_ops_date ON operations(date);
CREATE INDEX IF NOT EXISTS idx_veh_chapa ON vehicles(chapa);
CREATE INDEX IF NOT EXISTS idx_veh_chasis ON vehicles(chasis);

-- Enable Realtime for live updates (optional but good)
ALTER PUBLICATION supabase_realtime ADD TABLE operations;
ALTER PUBLICATION supabase_realtime ADD TABLE vehicles;

-- RLS (Row Level Security) - Basic Setup (Closed by default)
-- Note: You should configure these properly based on your auth needs
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

-- Allow public access for this phase (to be secured later)
CREATE POLICY "Allow public read/write" ON operations FOR ALL USING (true);
CREATE POLICY "Allow public read/write" ON vehicles FOR ALL USING (true);

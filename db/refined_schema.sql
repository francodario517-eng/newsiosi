-- DATABASE: Vehicle Tracking System (Refined)

-- 1. Bases
CREATE TABLE vehicles (
    id SERIAL PRIMARY KEY,
    identifier VARCHAR(50) UNIQUE NOT NULL, -- chapa o chasis
    description TEXT,
    color VARCHAR(50),
    status VARCHAR(20) DEFAULT 'comprado' CHECK (status IN ('comprado', 'vendido', 'parte_pago')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE operations (
    id SERIAL PRIMARY KEY,
    operation_type VARCHAR(10) NOT NULL CHECK (operation_type IN ('compra', 'venta')),
    payment_type VARCHAR(10) NOT NULL CHECK (payment_type IN ('credito', 'contado')),
    date DATE DEFAULT CURRENT_DATE,
    currency VARCHAR(5) NOT NULL CHECK (currency IN ('USD', 'GS')),
    amount_delivery NUMERIC DEFAULT 0,
    installments INT DEFAULT 0,
    credit_amount NUMERIC DEFAULT 0,
    total_amount NUMERIC NOT NULL,
    buyer VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Relationships
CREATE TABLE operation_vehicles (
    id SERIAL PRIMARY KEY,
    operation_id INT REFERENCES operations(id) ON DELETE CASCADE,
    vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('principal', 'parte_pago')),
    valuation NUMERIC -- Value assigned at the moment of the operation
);

-- Link for tree genealogy
CREATE TABLE vehicle_relations (
    id SERIAL PRIMARY KEY,
    parent_vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
    child_vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
    relation_type VARCHAR(20) DEFAULT 'parte_pago'
);

-- 3. Indexes
CREATE INDEX idx_vehicle_identifier ON vehicles(identifier);
CREATE INDEX idx_operations_date ON operations(date);

-- 4. Financial Views

-- View to see basic info per unit
CREATE OR REPLACE VIEW vehicle_financial_status AS
SELECT 
    v.id,
    v.identifier,
    v.description,
    v.status,
    -- Initial cost (from purchase operation or valuation when received)
    COALESCE(
        (SELECT o.total_amount FROM operations o 
         JOIN operation_vehicles ov ON o.id = ov.operation_id 
         WHERE ov.vehicle_id = v.id AND o.operation_type = 'compra' AND ov.role = 'principal' LIMIT 1),
        (SELECT ov.valuation FROM operation_vehicles ov 
         JOIN operations o ON o.id = ov.operation_id
         WHERE ov.vehicle_id = v.id AND ov.role = 'parte_pago' LIMIT 1)
    ) AS initial_cost,
    -- Sale value
    (SELECT o.total_amount FROM operations o 
     JOIN operation_vehicles ov ON o.id = ov.operation_id 
     WHERE ov.vehicle_id = v.id AND o.operation_type = 'venta' AND ov.role = 'principal' LIMIT 1) AS sale_value
FROM vehicles v;

-- View for Profit/Loss per specific unit
CREATE OR REPLACE VIEW vehicle_profit AS
SELECT 
    *,
    (COALESCE(sale_value, 0) - COALESCE(initial_cost, 0)) AS profit
FROM vehicle_financial_status;

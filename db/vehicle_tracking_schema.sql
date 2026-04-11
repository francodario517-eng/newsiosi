-- DATABASE: Vehicle Tracking System

CREATE TABLE vehicles (
    id SERIAL PRIMARY KEY,
    identifier VARCHAR(50) UNIQUE, -- chapa o chasis
    description TEXT,
    color VARCHAR(50),
    status VARCHAR(20) CHECK (status IN ('comprado','vendido','parte_pago')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE operations (
    id SERIAL PRIMARY KEY,
    operation_type VARCHAR(10) CHECK (operation_type IN ('compra','venta')),
    payment_type VARCHAR(10) CHECK (payment_type IN ('credito','contado')),
    date DATE,
    currency VARCHAR(5) CHECK (currency IN ('USD','GS')),
    amount_delivery NUMERIC,
    installments INT,
    credit_amount NUMERIC,
    total_amount NUMERIC,
    buyer VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Relación principal: qué vehículo pertenece a qué operación
CREATE TABLE operation_vehicles (
    id SERIAL PRIMARY KEY,
    operation_id INT REFERENCES operations(id) ON DELETE CASCADE,
    vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
    role VARCHAR(20) CHECK (role IN ('principal','parte_pago'))
);

-- Relación para árbol (trazabilidad entre vehículos)
CREATE TABLE vehicle_relations (
    id SERIAL PRIMARY KEY,
    parent_vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
    child_vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
    relation_type VARCHAR(20) DEFAULT 'parte_pago'
);

-- Índices para mejorar búsqueda
CREATE INDEX idx_vehicle_identifier ON vehicles(identifier);
CREATE INDEX idx_vehicle_color ON vehicles(color);
CREATE INDEX idx_operations_date ON operations(date);
CREATE INDEX idx_operations_buyer ON operations(buyer);

-- Vista para análisis financiero por operación
CREATE VIEW financial_summary AS
SELECT 
    o.id AS operation_id,
    o.operation_type,
    o.date,
    o.total_amount,
    COALESCE(SUM(CASE WHEN ov.role = 'parte_pago' THEN v.id END),0) AS vehicles_received_count
FROM operations o
LEFT JOIN operation_vehicles ov ON o.id = ov.operation_id
LEFT JOIN vehicles v ON ov.vehicle_id = v.id
GROUP BY o.id;


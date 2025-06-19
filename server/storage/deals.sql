CREATE TABLE deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL,
    round_type VARCHAR(50) NOT NULL,
    deal_year INTEGER NOT NULL,
    amount DECIMAL(20,2),
    source_type VARCHAR(50) NOT NULL,
    source_url TEXT,
    confidence_score DECIMAL(3,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE deal_investors (
    deal_id UUID NOT NULL,
    investor_id UUID NOT NULL,
    investor_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (deal_id, investor_id),
    FOREIGN KEY (deal_id) REFERENCES deals(id),
    FOREIGN KEY (investor_id) REFERENCES investors(id)
);

CREATE INDEX idx_deals_company ON deals(company_name);
CREATE INDEX idx_deals_year ON deals(deal_year);
CREATE INDEX idx_deals_round ON deals(round_type);
CREATE INDEX idx_deal_investors ON deal_investors(investor_id); 
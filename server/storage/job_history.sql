-- Job history schema
CREATE TABLE job_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL,
    start_date DATE,
    end_date DATE,
    is_current BOOLEAN DEFAULT false,
    source_type VARCHAR(50) NOT NULL,
    source_url TEXT,
    confidence_score DECIMAL(3,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX idx_job_history_profile_id ON job_history(profile_id);
CREATE INDEX idx_job_history_company ON job_history(company_name);
CREATE INDEX idx_job_history_dates ON job_history(start_date, end_date); 
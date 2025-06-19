-- Education schema

CREATE TABLE education (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL,
    institution_name VARCHAR(255) NOT NULL,
    degree VARCHAR(255),
    field_of_study VARCHAR(255),
    start_year INTEGER,
    end_year INTEGER,
    source_type VARCHAR(50) NOT NULL,
    source_url TEXT,
    confidence_score DECIMAL(3,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX idx_education_profile_id ON education(profile_id);
CREATE INDEX idx_education_institution ON education(institution_name);
CREATE INDEX idx_education_years ON education(start_year, end_year); 
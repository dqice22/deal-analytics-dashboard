export type RiskLevel = '高' | '中' | '低';

export interface Deal {
    id: string;
    company_name: string;
    person_in_charge: string;
    deal_date: string;
    raw_memo: string;
    summary: string | null;
    next_action: string | null;
    risk_level: RiskLevel;
    created_at: string;
}

export interface AnalyzeRequest {
    company_name: string;
    person_in_charge: string;
    deal_date: string;
    raw_memo: string;
}
/**
 * 画面名: 分析・統計ダッシュボード画面
 * ファイルパス: app/analytics/page.tsx
 * 役割: 商談データの集計・分析および可視化
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface CurrentUser {
    employeeCode: string;
    employeeName: string;
    positionCode: string | null;
    isAdmin: boolean;
}

interface DealPhase {
    phase_code: string;
    phase_name: string;
    sort_no: number;
}

interface Employee {
    employee_code: string;
    employee_name: string;
}

interface DealRecord {
    id: number;
    company_id: number;
    person_in_charge_employee_id: string | null;
    phase_code: string;
    risk_level: string;
}

interface CountItem {
    key: string;
    label: string;
    count: number;
}

interface FilterQuery {
    risk?: '高' | '中' | '低';
    phase?: string;
    employee?: string;
}

function isFilterableRiskLevel(key: string): key is '高' | '中' | '低' {
    return key === '高' || key === '中' || key === '低';
}

export default function AnalyticsDashboardPage() {
    const router = useRouter();

    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
    const [authChecking, setAuthChecking] = useState(true);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');

    const [totalDeals, setTotalDeals] = useState(0);
    const [highRiskDeals, setHighRiskDeals] = useState(0);
    const [activeCompanies, setActiveCompanies] = useState(0);

    const [riskCounts, setRiskCounts] = useState<CountItem[]>([]);
    const [phaseCounts, setPhaseCounts] = useState<CountItem[]>([]);
    const [employeeCounts, setEmployeeCounts] = useState<CountItem[]>([]);

    useEffect(() => {
        let active = true;

        const checkAuth = async () => {
            try {
                const res = await fetch('/api/auth/me', { cache: 'no-store' });
                if (!active) return;

                if (!res.ok) {
                    router.replace('/login');
                    return;
                }
                const data = await res.json();
                if (!active) return;

                if (!data.user) {
                    router.replace('/login');
                    return;
                }
                setCurrentUser(data.user);
            } catch {
                if (active) {
                    router.replace('/login');
                }
            } finally {
                if (active) {
                    setAuthChecking(false);
                }
            }
        };

        void checkAuth();

        return () => {
            active = false;
        };
    }, [router]);

    const fetchAnalytics = useCallback(async () => {
        try {
            const [
                { data: dealsData, error: dealsError },
                { data: phasesData, error: phasesError },
                { data: employeesData, error: employeesError },
            ] = await Promise.all([
                supabase
                    .from('deals')
                    .select('id, company_id, person_in_charge_employee_id, phase_code, risk_level')
                    .eq('delete_flg', false),
                supabase.from('deal_phases').select('phase_code, phase_name, sort_no').order('sort_no'),
                supabase.from('employees').select('employee_code, employee_name').eq('delete_flg', false),
            ]);

            if (phasesError) console.error('phases取得エラー:', phasesError);
            if (employeesError) console.error('employees取得エラー:', employeesError);

            if (dealsError) {
                console.error('分析データ取得エラー:', dealsError);
                setErrorMsg(`分析データの取得に失敗しました: ${dealsError.message}`);
                return;
            }

            const deals: DealRecord[] = (dealsData ?? []).map((d) => ({
                id: Number(d.id),
                company_id: Number(d.company_id),
                person_in_charge_employee_id: d.person_in_charge_employee_id
                    ? String(d.person_in_charge_employee_id).trim()
                    : null,
                phase_code: String(d.phase_code ?? '').trim(),
                risk_level: String(d.risk_level ?? '').trim(),
            }));
            const phases: DealPhase[] = (phasesData ?? []).map((p) => ({
                ...p,
                phase_code: String(p.phase_code).trim(),
                phase_name: String(p.phase_name).trim(),
            }));
            const employees: Employee[] = (employeesData ?? []).map((e) => ({
                employee_code: String(e.employee_code).trim(),
                employee_name: String(e.employee_name).trim(),
            }));

            setErrorMsg('');
            setTotalDeals(deals.length);

            const highRisk = deals.filter((d) => d.risk_level === '高').length;
            setHighRiskDeals(highRisk);

            const uniqueCompanyIds = new Set(deals.map((d) => d.company_id));
            setActiveCompanies(uniqueCompanyIds.size);

            // リスク別集計
            const riskOrder = ['高', '中', '低'];
            const riskMap = new Map<string, number>();
            for (const r of riskOrder) {
                riskMap.set(r, 0);
            }
            for (const d of deals) {
                riskMap.set(d.risk_level, (riskMap.get(d.risk_level) ?? 0) + 1);
            }
            setRiskCounts(
                Array.from(riskMap.entries()).map(([key, count]) => ({
                    key,
                    label: `リスク: ${key}`,
                    count,
                }))
            );

            // フェーズ別集計
            const phaseNameMap = new Map(phases.map((p) => [p.phase_code, p.phase_name]));
            const phaseCountMap = new Map<string, number>();
            for (const p of phases) {
                phaseCountMap.set(p.phase_code, 0);
            }
            for (const d of deals) {
                phaseCountMap.set(d.phase_code, (phaseCountMap.get(d.phase_code) ?? 0) + 1);
            }
            setPhaseCounts(
                Array.from(phaseCountMap.entries()).map(([key, count]) => ({
                    key,
                    label: phaseNameMap.get(key) ?? key,
                    count,
                }))
            );

            // 担当者別集計
            const empNameMap = new Map(employees.map((e) => [e.employee_code, e.employee_name]));
            const empCountMap = new Map<string, number>();
            for (const d of deals) {
                const code = d.person_in_charge_employee_id || '__UNASSIGNED__';
                empCountMap.set(code, (empCountMap.get(code) ?? 0) + 1);
            }
            const empItems: CountItem[] = Array.from(empCountMap.entries())
                .map(([key, count]) => ({
                    key,
                    label:
                        key === '__UNASSIGNED__'
                            ? '未割当'
                            : empNameMap.get(key)
                                ? `${empNameMap.get(key)}（${key}）`
                                : key,
                    count,
                }))
                .sort((a, b) => b.count - a.count);
            setEmployeeCounts(empItems);
        } catch (err) {
            console.error('分析集計エラー:', err);
            setErrorMsg('分析データの集計中にエラーが発生しました。');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (authChecking || !currentUser) return;

        let active = true;
        const timer = window.setTimeout(() => {
            if (active) {
                void fetchAnalytics();
            }
        }, 0);

        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [authChecking, currentUser, fetchAnalytics]);

    const navigateToDashboard = (filter?: FilterQuery) => {
        const params = new URLSearchParams();
        if (filter?.risk) params.set('risk', filter.risk);
        if (filter?.phase) params.set('phase', filter.phase);
        if (filter?.employee) params.set('employee', filter.employee);

        const queryString = params.toString();
        window.location.assign(queryString ? `/?${queryString}` : '/');
    };

    const renderBreakdownRow = (
        item: CountItem,
        barColor: string,
        filterable: boolean,
        onClick?: () => void
    ) => {
        const ratio = totalDeals > 0 ? Math.round((item.count / totalDeals) * 100) : 0;

        const innerContent = (
            <>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '8px',
                        fontSize: '13px',
                        marginBottom: '6px',
                        color: '#111827',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                            minWidth: 0,
                            flex: 1,
                        }}
                    >
                        <span style={{ lineHeight: 1.35, wordBreak: 'break-word' }}>
                            {item.label}
                        </span>
                        {filterable && (
                            <span
                                style={{
                                    whiteSpace: 'nowrap',
                                    fontSize: '11px',
                                    color: '#0066cc',
                                }}
                            >
                                → 一覧
                            </span>
                        )}
                    </div>

                    <strong
                        style={{
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                            lineHeight: 1.35,
                        }}
                    >
                        {item.count}件（{ratio}%）
                    </strong>
                </div>

                <div
                    style={{
                        height: '8px',
                        backgroundColor: '#e5e7eb',
                        borderRadius: '4px',
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            width: `${ratio}%`,
                            height: '100%',
                            backgroundColor: barColor,
                        }}
                    />
                </div>
            </>
        );

        if (filterable && onClick) {
            return (
                <button
                    key={item.key}
                    type="button"
                    onClick={onClick}
                    style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        backgroundColor: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                    }}
                >
                    {innerContent}
                </button>
            );
        }

        return (
            <div
                key={item.key}
                style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid transparent',
                    boxSizing: 'border-box',
                }}
            >
                {innerContent}
            </div>
        );
    };

    if (authChecking) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
                認証状態を確認中...
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px', fontFamily: 'sans-serif' }}>
            <header
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: '16px',
                    borderBottom: '1px solid #e5e7eb',
                    marginBottom: '24px',
                    gap: '12px',
                    flexWrap: 'wrap',
                }}
            >
                <div>
                    <h1 style={{ margin: '0 0 4px 0', fontSize: '22px' }}>分析・統計ダッシュボード</h1>
                    <div style={{ fontSize: '13px', color: '#4b5563' }}>
                        ログイン中: <strong>{currentUser?.employeeName}</strong>（{currentUser?.employeeCode}）
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => navigateToDashboard()}
                        style={{
                            padding: '8px 14px',
                            backgroundColor: '#0066cc',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                        }}
                    >
                        ← 商談一覧へ戻る
                    </button>
                </div>
            </header>

            {errorMsg && (
                <div
                    style={{
                        padding: '12px 16px',
                        marginBottom: '16px',
                        borderRadius: '6px',
                        backgroundColor: '#fef2f2',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                        fontSize: '13px',
                        fontWeight: 'bold',
                    }}
                >
                    {errorMsg}
                </div>
            )}

            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>集計中...</div>
            ) : (
                <>
                    {/* KPIカード */}
                    <section
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '14px',
                            marginBottom: '24px',
                        }}
                    >
                        <div
                            style={{
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                                padding: '16px',
                                backgroundColor: '#fff',
                            }}
                        >
                            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
                                有効商談数
                            </div>
                            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#111827' }}>
                                {totalDeals} <span style={{ fontSize: '14px', fontWeight: 'normal' }}>件</span>
                            </div>
                        </div>

                        <div
                            style={{
                                border: '1px solid #fecaca',
                                borderRadius: '8px',
                                padding: '16px',
                                backgroundColor: '#fef2f2',
                            }}
                        >
                            <div style={{ fontSize: '12px', color: '#991b1b', marginBottom: '6px' }}>
                                高リスク商談数
                            </div>
                            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#dc2626' }}>
                                {highRiskDeals} <span style={{ fontSize: '14px', fontWeight: 'normal' }}>件</span>
                            </div>
                        </div>

                        <div
                            style={{
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                                padding: '16px',
                                backgroundColor: '#fff',
                            }}
                        >
                            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
                                商談中の企業数
                            </div>
                            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#0066cc' }}>
                                {activeCompanies} <span style={{ fontSize: '14px', fontWeight: 'normal' }}>社</span>
                            </div>
                        </div>
                    </section>

                    {/* 内訳セクション */}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: '16px',
                        }}
                    >
                        {/* リスク別 */}
                        <section
                            style={{
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                                padding: '16px',
                                backgroundColor: '#fff',
                            }}
                        >
                            <h2 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>リスクレベル別</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {riskCounts.map((item) => {
                                    const barColor =
                                        item.key === '高'
                                            ? '#dc2626'
                                            : item.key === '中'
                                                ? '#d97706'
                                                : '#16a34a';
                                    const filterable = isFilterableRiskLevel(item.key);
                                    return renderBreakdownRow(
                                        item,
                                        barColor,
                                        filterable,
                                        filterable
                                            ? () => navigateToDashboard({ risk: item.key as '高' | '中' | '低' })
                                            : undefined
                                    );
                                })}
                            </div>
                        </section>

                        {/* フェーズ別 */}
                        <section
                            style={{
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                                padding: '16px',
                                backgroundColor: '#fff',
                            }}
                        >
                            <h2 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>フェーズ別</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {phaseCounts.map((item) => (
                                    <div key={item.key}>
                                        {renderBreakdownRow(
                                            item,
                                            '#4f46e5',
                                            true,
                                            () => navigateToDashboard({ phase: item.key })
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* 担当者別 */}
                        <section
                            style={{
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                                padding: '16px',
                                backgroundColor: '#fff',
                            }}
                        >
                            <h2 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>担当者別</h2>
                            {employeeCounts.length === 0 ? (
                                <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>データがありません。</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {employeeCounts.map((item) => {
                                        const filterable = item.key !== '__UNASSIGNED__';
                                        return renderBreakdownRow(
                                            item,
                                            '#0284c7',
                                            filterable,
                                            filterable
                                                ? () => navigateToDashboard({ employee: item.key })
                                                : undefined
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    </div>
                </>
            )}
        </div>
    );
}
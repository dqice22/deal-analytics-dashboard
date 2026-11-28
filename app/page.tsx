/**
 * 画面名: ダッシュボード一覧画面
 * ファイルパス: app/page.tsx
 * 役割: 商談一覧の表示・検索・絞り込み、新規登録・詳細/更新画面への遷移
 */
'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cachedSupabaseClient: SupabaseClient | null = null;

/**
 * ブラウザ/クライアント向けのSupabaseクライアントを遅延初期化する関数。
 */
function getSupabaseClient(): SupabaseClient {
    if (cachedSupabaseClient) {
        return cachedSupabaseClient;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase の公開環境変数が設定されていません。');
    }

    cachedSupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    return cachedSupabaseClient;
}

const DELETED_EMPLOYEE_FILTER_VALUE = '__deleted__';

interface CurrentUser {
    employeeCode: string;
    employeeName: string;
    positionCode: string | null;
    isAdmin: boolean;
}

interface Company {
    company_id: number;
    company_name: string;
}

interface DealPhase {
    phase_code: string;
    phase_name: string;
    sort_no: number;
}

interface Employee {
    employee_code: string;
    employee_name: string;
    delete_flg: boolean;
}

interface DealListItem {
    id: number;
    company_id: number;
    company_name: string;
    deal_title: string;
    person_in_charge_employee_id: string | null;
    person_in_charge_name: string;
    person_in_charge_deleted: boolean;
    deal_date: string;
    phase_code: string;
    phase_name: string;
    summary: string | null;
    next_action: string | null;
    risk_level: string;
}

/**
 * DBやURLのリスク値（「1」「2」「3」「高い」「中」「低い」「高」「低」など）を「高」「中」「低」に正規化する関数。
 */
function normalizeRiskLevel(rawRisk: unknown): string {
    const value = typeof rawRisk === 'string' ? rawRisk.trim() : String(rawRisk ?? '').trim();

    if (value === '高' || value === '高い' || value === '1') return '高';
    if (value === '中' || value === '2') return '中';
    if (value === '低' || value === '低い' || value === '3') return '低';

    return value;
}

/**
 * URLクエリのリスク指定値を検証し、「高」「中」「低」のいずれかであればそのまま返し、それ以外は空文字に正規化する関数。
 */
function normalizeRiskParam(rawRisk: string | null): string {
    const normalized = normalizeRiskLevel(rawRisk);
    return normalized === '高' || normalized === '中' || normalized === '低' ? normalized : '';
}

/**
 * 認証確認、マスタ・商談データの取得、各種絞り込みと一覧表示を担当するダッシュボード本体コンポーネント。
 */
function DashboardContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const initialRiskFromQuery = normalizeRiskParam(searchParams.get('risk'));
    const initialPhaseFromQuery = searchParams.get('phase')?.trim() ?? '';
    const initialEmployeeFromQuery = searchParams.get('employee')?.trim() ?? '';

    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
    const [authChecking, setAuthChecking] = useState(true);

    const [companies, setCompanies] = useState<Company[]>([]);
    const [phases, setPhases] = useState<DealPhase[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [deals, setDeals] = useState<DealListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');

    const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
    const [selectedPhaseCode, setSelectedPhaseCode] = useState<string>(initialPhaseFromQuery);
    const [selectedRiskLevel, setSelectedRiskLevel] = useState<string>(initialRiskFromQuery);
    const [selectedEmployeeCode, setSelectedEmployeeCode] = useState<string>(initialEmployeeFromQuery);
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [searchKeyword, setSearchKeyword] = useState<string>('');

    useEffect(() => {
        let active = true;

        /**
         * ログイン中のセッション情報（/api/auth/me）を確認し、未認証の場合はログイン画面へ遷移する非同期関数。
         */
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

    /**
     * 企業・フェーズ・社員マスタおよび未削除の商談一覧をSupabaseから取得し、表示用データへ整形する関数。
     */
    const fetchDashboardData = useCallback(async () => {
        try {
            const supabase = getSupabaseClient();

            const [
                { data: companiesData, error: companiesError },
                { data: phasesData, error: phasesError },
                { data: employeesData, error: employeesError },
                { data: dealsData, error: dealsError },
            ] = await Promise.all([
                supabase.from('companies').select('company_id, company_name').order('company_id'),
                supabase.from('deal_phases').select('phase_code, phase_name, sort_no').order('sort_no'),
                supabase
                    .from('employees')
                    .select('employee_code, employee_name, delete_flg')
                    .order('employee_code'),
                supabase
                    .from('deals')
                    .select(
                        'id, company_id, deal_title, person_in_charge_employee_id, deal_date, phase_code, summary, next_action, risk_level'
                    )
                    .eq('delete_flg', false)
                    .order('deal_date', { ascending: false })
                    .order('id', { ascending: false }),
            ]);

            if (companiesError) console.error('companies取得エラー:', companiesError);
            if (phasesError) console.error('phases取得エラー:', phasesError);
            if (employeesError) console.error('employees取得エラー:', employeesError);

            if (dealsError) {
                console.error('deals取得エラー:', dealsError);
                setErrorMsg(`商談一覧の取得に失敗しました: ${dealsError.message}`);
                setDeals([]);
                return;
            }

            const companyList: Company[] = companiesData ?? [];
            const phaseList: DealPhase[] = phasesData ?? [];
            const allEmployeeList: Employee[] = (employeesData ?? []).map((e) => ({
                employee_code: String(e.employee_code).trim(),
                employee_name: e.employee_name,
                delete_flg: Boolean(e.delete_flg),
            }));
            const activeEmployeeList: Employee[] = allEmployeeList.filter((e) => !e.delete_flg);

            setCompanies(companyList);
            setPhases(phaseList);
            setEmployees(activeEmployeeList);
            setErrorMsg('');

            const companyMap = new Map(companyList.map((c) => [c.company_id, c.company_name]));
            const phaseMap = new Map(phaseList.map((p) => [String(p.phase_code).trim(), p.phase_name]));
            const empMap = new Map(allEmployeeList.map((e) => [e.employee_code, e]));

            const enriched: DealListItem[] = (dealsData ?? []).map((d) => {
                const companyId = Number(d.company_id);
                const phaseCode = String(d.phase_code ?? '').trim();
                const empCode = d.person_in_charge_employee_id
                    ? String(d.person_in_charge_employee_id).trim()
                    : null;
                const emp = empCode ? empMap.get(empCode) : undefined;

                return {
                    id: Number(d.id),
                    company_id: companyId,
                    company_name: companyMap.get(companyId) ?? '',
                    deal_title: d.deal_title,
                    person_in_charge_employee_id: empCode,
                    person_in_charge_name: empCode ? emp?.employee_name ?? empCode : '未割当',
                    person_in_charge_deleted: Boolean(emp?.delete_flg),
                    deal_date: d.deal_date,
                    phase_code: phaseCode,
                    phase_name: phaseMap.get(phaseCode) ?? phaseCode,
                    summary: d.summary ?? null,
                    next_action: d.next_action ?? null,
                    risk_level: normalizeRiskLevel(d.risk_level),
                };
            });

            setDeals(enriched);
        } catch (err) {
            console.error('ダッシュボード取得エラー:', err);
            setErrorMsg('データの取得中にエラーが発生しました。');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (authChecking || !currentUser) return;

        let active = true;
        const timer = window.setTimeout(() => {
            if (active) {
                void fetchDashboardData();
            }
        }, 0);

        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [authChecking, currentUser, fetchDashboardData]);

    /**
     * ログアウトAPI（/api/auth/logout）を呼び出し、ログイン画面へ遷移するイベントハンドラ。
     */
    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } finally {
            router.replace('/login');
            router.refresh();
        }
    };

    /**
     * すべての絞り込み条件とURLクエリパラメータを初期状態へリセットするイベントハンドラ。
     */
    const handleResetFilters = () => {
        setSelectedCompanyId('');
        setSelectedPhaseCode('');
        setSelectedRiskLevel('');
        setSelectedEmployeeCode('');
        setDateFrom('');
        setDateTo('');
        setSearchKeyword('');
        if (searchParams.get('risk') || searchParams.get('phase') || searchParams.get('employee')) {
            router.replace('/');
        }
    };

    const filteredDeals = deals.filter((deal) => {
        if (selectedCompanyId && String(deal.company_id) !== selectedCompanyId) {
            return false;
        }
        if (selectedPhaseCode && deal.phase_code !== selectedPhaseCode) {
            return false;
        }
        if (selectedRiskLevel && deal.risk_level !== selectedRiskLevel) {
            return false;
        }
        if (selectedEmployeeCode) {
            if (selectedEmployeeCode === DELETED_EMPLOYEE_FILTER_VALUE) {
                if (!deal.person_in_charge_deleted) return false;
            } else if (deal.person_in_charge_employee_id !== selectedEmployeeCode) {
                return false;
            }
        }
        if (dateFrom && (!deal.deal_date || deal.deal_date < dateFrom)) {
            return false;
        }
        if (dateTo && (!deal.deal_date || deal.deal_date > dateTo)) {
            return false;
        }
        if (searchKeyword.trim()) {
            const kw = searchKeyword.trim().toLowerCase();
            const target = [
                deal.deal_title,
                deal.summary ?? '',
                deal.next_action ?? '',
            ]
                .join(' ')
                .toLowerCase();
            if (!target.includes(kw)) return false;
        }
        return true;
    });

    const hasActiveFilter =
        Boolean(selectedCompanyId) ||
        Boolean(selectedPhaseCode) ||
        Boolean(selectedRiskLevel) ||
        Boolean(selectedEmployeeCode) ||
        Boolean(dateFrom) ||
        Boolean(dateTo) ||
        Boolean(searchKeyword.trim());

    if (authChecking) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
                認証状態を確認中...
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px', fontFamily: 'sans-serif' }}>
            {/* ヘッダー */}
            <header
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: '16px',
                    borderBottom: '1px solid #e5e7eb',
                    marginBottom: '20px',
                    gap: '12px',
                    flexWrap: 'wrap',
                }}
            >
                <div>
                    <h1 style={{ margin: '0 0 4px 0', fontSize: '22px' }}>商談ダッシュボード</h1>
                    <div style={{ fontSize: '13px', color: '#4b5563' }}>
                        ログイン中: <strong>{currentUser?.employeeName}</strong>（{currentUser?.employeeCode}）
                    </div>
                </div>

                <nav style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Link
                        href="/deals/new"
                        style={{
                            padding: '8px 14px',
                            backgroundColor: '#0066cc',
                            color: '#fff',
                            borderRadius: '6px',
                            textDecoration: 'none',
                            fontSize: '13px',
                            fontWeight: 'bold',
                        }}
                    >
                        + 新規商談登録
                    </Link>

                    <Link
                        href="/analytics"
                        style={{
                            padding: '8px 12px',
                            backgroundColor: '#f3f4f6',
                            color: '#111827',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            textDecoration: 'none',
                            fontSize: '13px',
                            fontWeight: 'bold',
                        }}
                    >
                        分析・統計
                    </Link>

                    {currentUser?.isAdmin && (
                        <Link
                            href="/admin/employees"
                            style={{
                                padding: '8px 12px',
                                backgroundColor: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                                borderRadius: '6px',
                                textDecoration: 'none',
                                fontSize: '13px',
                                fontWeight: 'bold',
                            }}
                        >
                            社員マスタ管理
                        </Link>
                    )}

                    <button
                        type="button"
                        onClick={handleLogout}
                        style={{
                            padding: '8px 12px',
                            backgroundColor: '#fff',
                            color: '#374151',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '13px',
                            cursor: 'pointer',
                        }}
                    >
                        ログアウト
                    </button>
                </nav>
            </header>

            {/* 絞り込みバー（2行構成） */}
            <section
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    marginBottom: '18px',
                    padding: '14px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: '#f9fafb',
                }}
            >
                {/* 1行目: キーワード・企業・担当者・フェーズ・リスク */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                        gap: '8px',
                    }}
                >
                    <input
                        type="text"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        placeholder="案件・要約・次アクション検索"
                        title="案件名・要約・次アクションで検索"
                        style={{
                            width: '100%',
                            minWidth: 0,
                            padding: '8px 10px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '13px',
                            backgroundColor: '#fff',
                            boxSizing: 'border-box',
                        }}
                    />

                    <select
                        aria-label="企業で絞り込み"
                        value={selectedCompanyId}
                        onChange={(e) => setSelectedCompanyId(e.target.value)}
                        style={{
                            width: '100%',
                            minWidth: 0,
                            padding: '8px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '13px',
                            backgroundColor: '#fff',
                            boxSizing: 'border-box',
                        }}
                    >
                        <option value="">すべての企業</option>
                        {companies.map((c) => (
                            <option key={c.company_id} value={String(c.company_id)}>
                                {c.company_name}
                            </option>
                        ))}
                    </select>

                    <select
                        aria-label="担当者で絞り込み"
                        value={selectedEmployeeCode}
                        onChange={(e) => setSelectedEmployeeCode(e.target.value)}
                        style={{
                            width: '100%',
                            minWidth: 0,
                            padding: '8px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '13px',
                            backgroundColor: '#fff',
                            boxSizing: 'border-box',
                        }}
                    >
                        <option value="">すべての担当者</option>
                        {employees.map((emp) => (
                            <option key={emp.employee_code} value={emp.employee_code}>
                                {emp.employee_name}
                            </option>
                        ))}
                        <option value={DELETED_EMPLOYEE_FILTER_VALUE}>退職済み社員</option>
                    </select>

                    <select
                        aria-label="フェーズで絞り込み"
                        value={selectedPhaseCode}
                        onChange={(e) => setSelectedPhaseCode(e.target.value)}
                        style={{
                            width: '100%',
                            minWidth: 0,
                            padding: '8px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '13px',
                            backgroundColor: '#fff',
                            boxSizing: 'border-box',
                        }}
                    >
                        <option value="">すべてのフェーズ</option>
                        {phases.map((p) => (
                            <option key={p.phase_code} value={p.phase_code}>
                                {p.phase_name}
                            </option>
                        ))}
                    </select>

                    <select
                        aria-label="リスクで絞り込み"
                        value={selectedRiskLevel}
                        onChange={(e) => setSelectedRiskLevel(e.target.value)}
                        style={{
                            width: '100%',
                            minWidth: 0,
                            padding: '8px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '13px',
                            backgroundColor: '#fff',
                            boxSizing: 'border-box',
                        }}
                    >
                        <option value="">すべてのリスク</option>
                        <option value="高">リスク: 高</option>
                        <option value="中">リスク: 中</option>
                        <option value="低">リスク: 低</option>
                    </select>
                </div>

                {/* 2行目: 商談日（開始～終了）・リセット */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        flexWrap: 'wrap',
                        fontSize: '13px',
                    }}
                >
                    <span style={{ color: '#374151', fontWeight: 'bold' }}>商談日:</span>
                    <input
                        type="date"
                        aria-label="商談日（開始）"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        style={{
                            padding: '6px 10px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '13px',
                            backgroundColor: '#fff',
                        }}
                    />
                    <span style={{ color: '#6b7280' }}>〜</span>
                    <input
                        type="date"
                        aria-label="商談日（終了）"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        style={{
                            padding: '6px 10px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '13px',
                            backgroundColor: '#fff',
                        }}
                    />

                    {hasActiveFilter && (
                        <button
                            type="button"
                            onClick={handleResetFilters}
                            style={{
                                marginLeft: 'auto',
                                padding: '6px 12px',
                                backgroundColor: '#fff',
                                color: '#374151',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '12px',
                                cursor: 'pointer',
                            }}
                        >
                            条件をリセット
                        </button>
                    )}
                </div>
            </section>

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

            {/* 商談一覧（重要情報のみ） */}
            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>読み込み中...</div>
            ) : filteredDeals.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                    条件に一致する商談がありません。
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {filteredDeals.map((deal) => (
                        <div
                            key={deal.id}
                            style={{
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                                padding: '14px 16px',
                                backgroundColor: '#fff',
                            }}
                        >
                            {/* 1行目: 案件名・企業名・フェーズ・リスク */}
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: '8px',
                                    flexWrap: 'wrap',
                                    marginBottom: '6px',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <Link
                                        href={`/deals/${deal.id}`}
                                        style={{ fontSize: '15px', fontWeight: 'bold', color: '#0066cc', textDecoration: 'none' }}
                                    >
                                        {deal.deal_title}
                                    </Link>
                                    <span style={{ fontSize: '13px', color: '#4b5563' }}>{deal.company_name}</span>
                                </div>

                                <div style={{ display: 'flex', gap: '6px', fontSize: '12px' }}>
                                    <span
                                        style={{
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            backgroundColor: '#eef2ff',
                                            color: '#3730a3',
                                            fontWeight: 'bold',
                                        }}
                                    >
                                        {deal.phase_name}
                                    </span>
                                    <span
                                        style={{
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            backgroundColor:
                                                deal.risk_level === '高'
                                                    ? '#fee2e2'
                                                    : deal.risk_level === '中'
                                                        ? '#fef3c7'
                                                        : '#dcfce7',
                                            color:
                                                deal.risk_level === '高'
                                                    ? '#991b1b'
                                                    : deal.risk_level === '中'
                                                        ? '#92400e'
                                                        : '#166534',
                                            fontWeight: 'bold',
                                        }}
                                    >
                                        リスク: {deal.risk_level}
                                    </span>
                                </div>
                            </div>

                            {/* 2行目: 商談日・担当 */}
                            <div
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    flexWrap: 'wrap',
                                    fontSize: '12px',
                                    color: '#6b7280',
                                    marginBottom: '8px',
                                }}
                            >
                                <span>
                                    商談日: {deal.deal_date} ／ 担当: {deal.person_in_charge_name}
                                </span>
                                {deal.person_in_charge_deleted && (
                                    <span
                                        style={{
                                            padding: '1px 6px',
                                            fontSize: '11px',
                                            fontWeight: 'bold',
                                            color: '#991b1b',
                                            backgroundColor: '#fee2e2',
                                            border: '1px solid #fca5a5',
                                            borderRadius: '4px',
                                        }}
                                    >
                                        退職済み
                                    </span>
                                )}
                            </div>

                            {/* 要約・ネクストアクションのみ */}
                            {deal.summary && (
                                <p style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#374151', lineHeight: 1.5 }}>
                                    {deal.summary}
                                </p>
                            )}
                            {deal.next_action && (
                                <p style={{ margin: 0, fontSize: '12px', color: '#1d4ed8', fontWeight: 'bold' }}>
                                    次アクション: {deal.next_action}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * ダッシュボード画面のエントリポイント。useSearchParams を利用する本体を Suspense でラップするコンポーネント。
 */
export default function DashboardPage() {
    return (
        <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>読み込み中...</div>}>
            <DashboardContent />
        </Suspense>
    );
}
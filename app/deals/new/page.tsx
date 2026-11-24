/**
 * 画面名: 新規商談登録画面
 * ファイルパス: app/deals/new/page.tsx
 * 役割: 商談情報の入力・送信（AI分析およびdealsテーブルへの新規登録）とダッシュボード遷移
 */
'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RAW_MEMO_MAX_LENGTH = 2000;

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
}

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function getTodayDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function NewDealContent() {
    const router = useRouter();

    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
    const [authChecking, setAuthChecking] = useState(true);

    const [companies, setCompanies] = useState<Company[]>([]);
    const [phases, setPhases] = useState<DealPhase[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loadingMasters, setLoadingMasters] = useState(true);

    // 登録フォームの状態
    const [companyId, setCompanyId] = useState('');
    const [dealTitle, setDealTitle] = useState('');
    const [dealDate, setDealDate] = useState(() => getTodayDateString());
    const [personInChargeCode, setPersonInChargeCode] = useState('');
    const [phaseCode, setPhaseCode] = useState('');
    const [rawMemo, setRawMemo] = useState('');

    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [message, setMessage] = useState('');

    const applyDefaultFormState = useCallback(
        (
            user: CurrentUser | null,
            phaseList: DealPhase[],
            employeeList: Employee[]
        ) => {
            const defaultPhaseCode = phaseList.length > 0 ? phaseList[0].phase_code : '';
            const matchedEmployee =
                user?.employeeCode
                    ? employeeList.find((emp) => emp.employee_code === user.employeeCode)
                    : undefined;

            setCompanyId('');
            setDealTitle('');
            setDealDate(getTodayDateString());
            setPersonInChargeCode(matchedEmployee ? matchedEmployee.employee_code : '');
            setPhaseCode(defaultPhaseCode);
            setRawMemo('');
            setSubmitting(false);
            setErrorMsg('');
            setMessage('');
        },
        []
    );

    // 再表示時に前回の入力値・状態をリセット
    useEffect(() => {
        const handlePageShow = () => {
            applyDefaultFormState(currentUser, phases, employees);
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                applyDefaultFormState(currentUser, phases, employees);
            }
        };

        window.addEventListener('pageshow', handlePageShow);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('pageshow', handlePageShow);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [currentUser, phases, employees, applyDefaultFormState]);

    // ログイン状態確認
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

                const normalizedUser: CurrentUser = {
                    ...data.user,
                    employeeCode: normalizeText(data.user.employeeCode),
                    employeeName: normalizeText(data.user.employeeName),
                    positionCode: data.user.positionCode ? normalizeText(data.user.positionCode) : null,
                    isAdmin: Boolean(data.user.isAdmin),
                };

                setCurrentUser(normalizedUser);
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

    // マスタデータ取得
    const loadMasters = useCallback(async () => {
        try {
            const [
                { data: companiesData, error: companiesError },
                { data: phasesData, error: phasesError },
                { data: employeesData, error: employeesError },
            ] = await Promise.all([
                supabase
                    .from('companies')
                    .select('company_id, company_name')
                    .order('company_id', { ascending: true }),
                supabase
                    .from('deal_phases')
                    .select('phase_code, phase_name, sort_no')
                    .order('sort_no', { ascending: true }),
                supabase
                    .from('employees')
                    .select('employee_code, employee_name')
                    .eq('delete_flg', false)
                    .order('employee_code', { ascending: true }),
            ]);

            if (companiesError) console.error('companies fetch error:', companiesError);
            if (phasesError) console.error('phases fetch error:', phasesError);
            if (employeesError) console.error('employees fetch error:', employeesError);

            const companyList: Company[] = (companiesData ?? []).map((c) => ({
                company_id: Number(c.company_id),
                company_name: normalizeText(c.company_name),
            }));

            const phaseList: DealPhase[] = (phasesData ?? []).map((p) => ({
                phase_code: normalizeText(p.phase_code),
                phase_name: normalizeText(p.phase_name),
                sort_no: Number(p.sort_no),
            }));

            const employeeList: Employee[] = (employeesData ?? []).map((e) => ({
                employee_code: normalizeText(e.employee_code),
                employee_name: normalizeText(e.employee_name),
            }));

            setCompanies(companyList);
            setPhases(phaseList);
            setEmployees(employeeList);
            applyDefaultFormState(currentUser, phaseList, employeeList);
        } finally {
            setLoadingMasters(false);
        }
    }, [currentUser, applyDefaultFormState]);

    useEffect(() => {
        if (authChecking || !currentUser) return;

        let active = true;
        const timer = window.setTimeout(() => {
            if (active) {
                void loadMasters();
            }
        }, 0);

        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [authChecking, currentUser, loadMasters]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;

        setErrorMsg('');
        setMessage('');

        const parsedCompanyId = Number(companyId);
        const trimmedTitle = dealTitle.trim();
        const trimmedDate = dealDate.trim();
        const trimmedPhaseCode = phaseCode.trim();
        const trimmedPersonCode = personInChargeCode.trim();
        const trimmedMemo = rawMemo.trim();

        if (!Number.isFinite(parsedCompanyId) || parsedCompanyId <= 0) {
            setErrorMsg('顧客企業を選択してください。');
            return;
        }
        if (!trimmedTitle) {
            setErrorMsg('商談タイトル・案件名を入力してください。');
            return;
        }
        if (!trimmedDate) {
            setErrorMsg('商談日を入力してください。');
            return;
        }
        if (!trimmedPersonCode || !employees.some((emp) => emp.employee_code === trimmedPersonCode)) {
            setErrorMsg('担当社員を選択してください。');
            return;
        }
        if (!trimmedPhaseCode || !phases.some((p) => p.phase_code === trimmedPhaseCode)) {
            setErrorMsg('商談フェーズを選択してください。');
            return;
        }
        if (!trimmedMemo) {
            setErrorMsg('商談メモを入力してください。');
            return;
        }
        if (trimmedMemo.length > RAW_MEMO_MAX_LENGTH) {
            setErrorMsg(`商談メモは${RAW_MEMO_MAX_LENGTH}文字以内で入力してください。`);
            return;
        }

        setSubmitting(true);

        try {
            const res = await fetch('/api/deals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company_id: parsedCompanyId,
                    deal_title: trimmedTitle,
                    person_in_charge_employee_id: trimmedPersonCode,
                    deal_date: trimmedDate,
                    phase_code: trimmedPhaseCode,
                    raw_memo: trimmedMemo,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                setErrorMsg(data.error || '商談の登録に失敗しました。');
                setSubmitting(false);
                return;
            }

            setMessage('商談を登録しました。ダッシュボードへ移動します...');
            router.push('/');
            router.refresh();
        } catch {
            setErrorMsg('登録処理中に通信エラーが発生しました。');
            setSubmitting(false);
        }
    };

    if (authChecking || loadingMasters) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
                読み込み中...
            </div>
        );
    }

    const trimmedMemoLength = rawMemo.trim().length;
    const isMemoOverLimit = trimmedMemoLength > RAW_MEMO_MAX_LENGTH;

    return (
        <div style={{ maxWidth: '880px', margin: '0 auto', padding: '24px', fontFamily: 'sans-serif' }}>
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
                    <h1 style={{ margin: '0 0 4px 0', fontSize: '22px' }}>新規商談登録</h1>
                    <div style={{ fontSize: '13px', color: '#4b5563' }}>
                        ログイン中: <strong>{currentUser?.employeeName}</strong>（{currentUser?.employeeCode}）
                    </div>
                </div>

                <Link
                    href="/"
                    onClick={() => {
                        applyDefaultFormState(currentUser, phases, employees);
                    }}
                    style={{
                        padding: '8px 14px',
                        backgroundColor: '#f3f4f6',
                        color: '#111827',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 'bold',
                    }}
                >
                    ← 一覧へ戻る
                </Link>
            </header>

            <form
                onSubmit={handleSubmit}
                autoComplete="off"
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '20px',
                    backgroundColor: '#fff',
                }}
            >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    <div>
                        <label htmlFor="companyId" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                            顧客企業 *
                        </label>
                        <select
                            id="companyId"
                            value={companyId}
                            onChange={(e) => setCompanyId(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                backgroundColor: '#fff',
                            }}
                        >
                            <option value="">選択してください</option>
                            {companies.map((c) => (
                                <option key={c.company_id} value={String(c.company_id)}>
                                    {c.company_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="dealTitle" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                            商談タイトル・案件名 *
                        </label>
                        <input
                            id="dealTitle"
                            type="text"
                            value={dealTitle}
                            onChange={(e) => setDealTitle(e.target.value)}
                            placeholder="例: 業務システム刷新のご提案"
                            autoComplete="off"
                            required
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                boxSizing: 'border-box',
                            }}
                        />
                    </div>

                    <div>
                        <label htmlFor="dealDate" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                            商談日 *
                        </label>
                        <input
                            id="dealDate"
                            type="date"
                            value={dealDate}
                            onChange={(e) => setDealDate(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                boxSizing: 'border-box',
                            }}
                        />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    <div>
                        <label htmlFor="personInChargeCode" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                            担当社員 *
                        </label>
                        <select
                            id="personInChargeCode"
                            value={personInChargeCode}
                            onChange={(e) => setPersonInChargeCode(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                backgroundColor: '#fff',
                            }}
                        >
                            <option value="">選択してください</option>
                            {employees.map((emp) => (
                                <option key={emp.employee_code} value={emp.employee_code}>
                                    {emp.employee_name}（{emp.employee_code}）
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="phaseCode" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                            商談フェーズ *
                        </label>
                        <select
                            id="phaseCode"
                            value={phaseCode}
                            onChange={(e) => setPhaseCode(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                backgroundColor: '#fff',
                            }}
                        >
                            <option value="">選択してください</option>
                            {phases.map((p) => (
                                <option key={p.phase_code} value={p.phase_code}>
                                    {p.phase_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="riskLevel" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                            リスクレベル（AI自動判定）
                        </label>
                        <select
                            id="riskLevel"
                            value=""
                            disabled
                            aria-disabled="true"
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                backgroundColor: '#f3f4f6',
                                color: '#6b7280',
                                cursor: 'not-allowed',
                            }}
                        >
                            <option value="">AI自動判定</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label htmlFor="rawMemo" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                        商談メモ *
                    </label>
                    <textarea
                        id="rawMemo"
                        rows={6}
                        value={rawMemo}
                        onChange={(e) => setRawMemo(e.target.value)}
                        maxLength={RAW_MEMO_MAX_LENGTH}
                        placeholder="商談の内容を入力してください。保存時にAIが要約・ネクストアクション・リスクレベルを生成します。"
                        required
                        style={{
                            width: '100%',
                            padding: '8px',
                            border: `1px solid ${isMemoOverLimit ? '#dc2626' : '#d1d5db'}`,
                            borderRadius: '4px',
                            boxSizing: 'border-box',
                        }}
                    />
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginTop: '4px',
                            fontSize: '12px',
                        }}
                    >
                        <span
                            style={{
                                color: isMemoOverLimit ? '#dc2626' : '#6b7280',
                                fontWeight: isMemoOverLimit ? 'bold' : 'normal',
                            }}
                        >
                            {isMemoOverLimit
                                ? `商談メモは${RAW_MEMO_MAX_LENGTH}文字以内で入力してください。`
                                : '※ 前後の空白を除いた文字数で判定されます（必須・最大2000文字）'}
                        </span>
                        <span
                            style={{
                                color: isMemoOverLimit ? '#dc2626' : '#4b5563',
                                fontWeight: isMemoOverLimit ? 'bold' : 'normal',
                            }}
                        >
                            {trimmedMemoLength} / {RAW_MEMO_MAX_LENGTH}文字
                        </span>
                    </div>
                </div>

                {message && (
                    <p style={{ margin: 0, fontSize: '13px', color: '#059669', fontWeight: 'bold' }}>
                        {message}
                    </p>
                )}

                {errorMsg && (
                    <p style={{ margin: 0, fontSize: '13px', color: '#dc2626', fontWeight: 'bold' }}>
                        {errorMsg}
                    </p>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                    <button
                        type="submit"
                        disabled={submitting || isMemoOverLimit}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: '#0066cc',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            fontWeight: 'bold',
                            cursor: submitting || isMemoOverLimit ? 'not-allowed' : 'pointer',
                            opacity: submitting || isMemoOverLimit ? 0.7 : 1,
                        }}
                    >
                        {submitting ? 'AI分析・登録中...' : '商談を登録'}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default function NewDealPage() {
    return (
        <Suspense
            fallback={
                <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
                    読み込み中...
                </div>
            }
        >
            <NewDealContent />
        </Suspense>
    );
}
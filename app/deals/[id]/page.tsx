/**
 * 画面名: 商談詳細・更新画面
 * ファイルパス: app/deals/[id]/page.tsx
 * 役割: 商談情報の参照・更新および論理削除、更新後のダッシュボード遷移と再表示時の状態リセット
 */
'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RAW_MEMO_MAX_LENGTH = 2000;
const VALID_RISK_LEVELS = ['高', '中', '低'] as const;

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

interface DealDetail {
    id: number;
    company_id: number;
    company_name: string;
    deal_title: string;
    person_in_charge_employee_id: string | null;
    person_in_charge_name: string;
    last_edited_employee_id: string | null;
    last_edited_name: string;
    deal_date: string;
    phase_code: string;
    raw_memo: string;
    summary: string | null;
    next_action: string | null;
    risk_level: string;
    delete_flg: boolean;
    created_at: string;
    updated_at: string;
}

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function validateRawMemo(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return '商談メモを入力してください。';
    }
    if (trimmed.length > RAW_MEMO_MAX_LENGTH) {
        return `商談メモは${RAW_MEMO_MAX_LENGTH}文字以内で入力してください。`;
    }
    return null;
}

function DealDetailContent() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const dealId = Number(params?.id);
    const redirectTimerRef = useRef<number | null>(null);

    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
    const [authChecking, setAuthChecking] = useState(true);

    const [deal, setDeal] = useState<DealDetail | null>(null);
    const [phases, setPhases] = useState<DealPhase[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    // 編集フォームの状態
    const [dealTitle, setDealTitle] = useState('');
    const [dealDate, setDealDate] = useState('');
    const [phaseCode, setPhaseCode] = useState('');
    const [riskLevel, setRiskLevel] = useState('');
    const [personInChargeCode, setPersonInChargeCode] = useState('');
    const [rawMemo, setRawMemo] = useState('');
    const [summary, setSummary] = useState('');
    const [nextAction, setNextAction] = useState('');

    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [message, setMessage] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const clearRedirectTimer = useCallback(() => {
        if (redirectTimerRef.current !== null) {
            window.clearTimeout(redirectTimerRef.current);
            redirectTimerRef.current = null;
        }
    }, []);

    const resetTransientStatus = useCallback(() => {
        clearRedirectTimer();
        setMessage('');
        setErrorMsg('');
        setSaving(false);
        setDeleting(false);
    }, [clearRedirectTimer]);

    useEffect(() => {
        return () => {
            clearRedirectTimer();
        };
    }, [clearRedirectTimer]);

    // ブラウザ戻るや再表示時に前回の完了メッセージ・遷移タイマーをクリア
    useEffect(() => {
        const handlePageShow = () => {
            resetTransientStatus();
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                resetTransientStatus();
            }
        };

        window.addEventListener('pageshow', handlePageShow);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('pageshow', handlePageShow);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [resetTransientStatus]);

    // ログイン状態確認
    useEffect(() => {
        let active = true;

        const checkAuth = async () => {
            try {
                const res = await fetch('/api/auth/me');
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
                setCurrentUser({
                    ...data.user,
                    employeeCode: normalizeText(data.user.employeeCode),
                });
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

    // 商談詳細とマスタ取得
    const loadDealDetail = useCallback(async () => {
        resetTransientStatus();

        if (!Number.isFinite(dealId) || dealId <= 0) {
            setNotFound(true);
            setLoading(false);
            return;
        }

        setLoading(true);
        setNotFound(false);

        try {
            const [
                { data: dealData, error: dealError },
                { data: phasesData, error: phasesError },
                { data: employeesData, error: employeesError },
            ] = await Promise.all([
                supabase
                    .from('deals')
                    .select('*')
                    .eq('id', dealId)
                    .eq('delete_flg', false)
                    .single(),
                supabase.from('deal_phases').select('phase_code, phase_name, sort_no').order('sort_no'),
                supabase
                    .from('employees')
                    .select('employee_code, employee_name, delete_flg')
                    .order('employee_code'),
            ]);

            if (dealError || !dealData) {
                if (dealError) console.error('deal fetch error:', dealError);
                setNotFound(true);
                return;
            }

            if (phasesError) console.error('phases fetch error:', phasesError);
            if (employeesError) console.error('employees fetch error:', employeesError);

            const companyId = Number(dealData.company_id);
            let companyName = '';
            if (Number.isFinite(companyId) && companyId > 0) {
                const { data: companyData } = await supabase
                    .from('companies')
                    .select('company_name')
                    .eq('company_id', companyId)
                    .single();
                if (companyData?.company_name) {
                    companyName = companyData.company_name.trim();
                }
            }

            const phaseList: DealPhase[] = (phasesData ?? []).map((p) => ({
                ...p,
                phase_code: normalizeText(p.phase_code),
                phase_name: normalizeText(p.phase_name),
            }));
            const allEmployeeRows = (employeesData ?? []).map((e) => ({
                employee_code: normalizeText(e.employee_code),
                employee_name: normalizeText(e.employee_name),
                delete_flg: Boolean(e.delete_flg),
            }));
            const activeEmployeeList: Employee[] = allEmployeeRows
                .filter((e) => !e.delete_flg)
                .map(({ employee_code, employee_name }) => ({ employee_code, employee_name }));
            const empMap = new Map(allEmployeeRows.map((e) => [e.employee_code, e.employee_name]));

            const normalizedChargeId = normalizeText(dealData.person_in_charge_employee_id) || null;
            const normalizedEditorId = normalizeText(dealData.last_edited_employee_id) || null;
            const normalizedPhaseId = normalizeText(dealData.phase_code);
            const normalizedRisk = normalizeText(dealData.risk_level);

            const enriched: DealDetail = {
                ...dealData,
                id: Number(dealData.id),
                company_id: companyId,
                company_name: companyName,
                person_in_charge_employee_id: normalizedChargeId,
                person_in_charge_name: normalizedChargeId
                    ? empMap.get(normalizedChargeId) ?? normalizedChargeId
                    : '未割当',
                last_edited_employee_id: normalizedEditorId,
                last_edited_name: normalizedEditorId
                    ? empMap.get(normalizedEditorId) ?? normalizedEditorId
                    : '-',
                phase_code: normalizedPhaseId,
                risk_level: normalizedRisk,
                raw_memo: typeof dealData.raw_memo === 'string' ? dealData.raw_memo : '',
            };

            setPhases(phaseList);
            setEmployees(activeEmployeeList);
            setDeal(enriched);

            // フォーム初期値反映
            const resolvedPhaseCode =
                enriched.phase_code && phaseList.some((p) => p.phase_code === enriched.phase_code)
                    ? enriched.phase_code
                    : '';

            const resolvedRiskLevel =
                enriched.risk_level &&
                    (VALID_RISK_LEVELS as readonly string[]).includes(enriched.risk_level)
                    ? enriched.risk_level
                    : '';

            const resolvedPersonCode =
                enriched.person_in_charge_employee_id &&
                    activeEmployeeList.some((emp) => emp.employee_code === enriched.person_in_charge_employee_id)
                    ? enriched.person_in_charge_employee_id
                    : '';

            setDealTitle(enriched.deal_title);
            setDealDate(enriched.deal_date);
            setPhaseCode(resolvedPhaseCode);
            setRiskLevel(resolvedRiskLevel);
            setPersonInChargeCode(resolvedPersonCode);
            setRawMemo(enriched.raw_memo);
            setSummary(enriched.summary ?? '');
            setNextAction(enriched.next_action ?? '');
        } finally {
            setLoading(false);
        }
    }, [dealId, resetTransientStatus]);

    useEffect(() => {
        if (authChecking || !currentUser) return;

        let active = true;
        const run = async () => {
            await loadDealDetail();
            if (!active) return;
        };
        void run();

        return () => {
            active = false;
        };
    }, [authChecking, currentUser, loadDealDetail]);

    // 更新処理（last_edited_employee_id にログイン中社員コードをセットし、完了後にダッシュボードへ遷移）
    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser || !deal) return;

        setMessage('');
        setErrorMsg('');

        const trimmedTitle = dealTitle.trim();
        const trimmedDate = dealDate.trim();
        const trimmedPersonCode = personInChargeCode.trim();
        const trimmedPhaseCode = phaseCode.trim();
        const trimmedRiskLevel = riskLevel.trim();
        const memoValidationError = validateRawMemo(rawMemo);
        const trimmedMemo = rawMemo.trim();

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
        if (
            !trimmedRiskLevel ||
            !(VALID_RISK_LEVELS as readonly string[]).includes(trimmedRiskLevel)
        ) {
            setErrorMsg('リスクレベルを選択してください。');
            return;
        }
        if (memoValidationError) {
            setErrorMsg(memoValidationError);
            return;
        }

        clearRedirectTimer();
        setSaving(true);

        try {
            const editorCode = normalizeText(currentUser.employeeCode) || null;
            const { error } = await supabase
                .from('deals')
                .update({
                    deal_title: trimmedTitle,
                    deal_date: trimmedDate,
                    phase_code: trimmedPhaseCode,
                    risk_level: trimmedRiskLevel,
                    person_in_charge_employee_id: trimmedPersonCode,
                    last_edited_employee_id: editorCode,
                    raw_memo: trimmedMemo,
                    summary: summary.trim() || null,
                    next_action: nextAction.trim() || null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', deal.id)
                .eq('delete_flg', false);

            if (error) {
                console.error('update deal error:', error);
                setErrorMsg(`更新に失敗しました: ${error.message}`);
                setSaving(false);
                return;
            }

            setMessage('商談情報を更新しました。ダッシュボードへ移動します...');
            redirectTimerRef.current = window.setTimeout(() => {
                redirectTimerRef.current = null;
                router.push('/');
                router.refresh();
            }, 1100);
        } catch {
            setErrorMsg('更新処理中にエラーが発生しました。');
            setSaving(false);
        }
    };

    // 論理削除処理（delete_flg = true に更新し、last_edited_employee_id も記録）
    const handleSoftDelete = async () => {
        if (!currentUser || !deal) return;

        const ok = window.confirm(
            `「${deal.deal_title}」を削除しますか？\n（ダッシュボード一覧から非表示になります）`
        );
        if (!ok) return;

        clearRedirectTimer();
        setMessage('');
        setErrorMsg('');
        setDeleting(true);

        try {
            const editorCode = normalizeText(currentUser.employeeCode) || null;
            const { error } = await supabase
                .from('deals')
                .update({
                    delete_flg: true,
                    last_edited_employee_id: editorCode,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', deal.id);

            if (error) {
                console.error('soft delete deal error:', error);
                setErrorMsg(`削除に失敗しました: ${error.message}`);
                setDeleting(false);
                return;
            }

            router.push('/');
            router.refresh();
        } catch {
            setErrorMsg('削除処理中にエラーが発生しました。');
            setDeleting(false);
        }
    };

    if (authChecking || loading) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
                読み込み中...
            </div>
        );
    }

    if (notFound || !deal) {
        return (
            <div style={{ maxWidth: '820px', margin: '0 auto', padding: '24px', fontFamily: 'sans-serif' }}>
                <p style={{ color: '#dc2626', fontWeight: 'bold' }}>
                    対象の商談データが見つからないか、すでに削除されています。
                </p>
                <Link href="/" style={{ color: '#0066cc', textDecoration: 'none', fontWeight: 'bold' }}>
                    ← ダッシュボードへ戻る
                </Link>
            </div>
        );
    }

    const trimmedMemoLength = rawMemo.trim().length;
    const isMemoOverLimit = trimmedMemoLength > RAW_MEMO_MAX_LENGTH;

    return (
        <div style={{ maxWidth: '880px', margin: '0 auto', padding: '24px', fontFamily: 'sans-serif' }}>
            {/* ヘッダー */}
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
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                        顧客企業: <strong>{deal.company_name}</strong> ／ 案件ID: #{deal.id}
                    </div>
                    <h1 style={{ margin: 0, fontSize: '22px' }}>{deal.deal_title}</h1>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Link
                        href="/"
                        onClick={() => {
                            resetTransientStatus();
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
                </div>
            </header>

            {/* 監査・メタ情報 */}
            <section
                style={{
                    fontSize: '12px',
                    color: '#4b5563',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    padding: '12px 16px',
                    marginBottom: '20px',
                    display: 'flex',
                    gap: '16px',
                    flexWrap: 'wrap',
                }}
            >
                <span>
                    担当社員: <strong>{deal.person_in_charge_name}</strong> ({deal.person_in_charge_employee_id ?? '-'})
                </span>
                <span>
                    最終更新者: <strong>{deal.last_edited_name}</strong> ({deal.last_edited_employee_id ?? '-'})
                </span>
                <span>更新日時: {new Date(deal.updated_at).toLocaleString('ja-JP')}</span>
            </section>

            {/* 編集フォーム */}
            <form
                onSubmit={handleUpdate}
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
                        <label htmlFor="dealTitle" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                            商談タイトル・案件名 *
                        </label>
                        <input
                            id="dealTitle"
                            type="text"
                            value={dealTitle}
                            onChange={(e) => setDealTitle(e.target.value)}
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
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
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
                            リスクレベル *
                        </label>
                        <select
                            id="riskLevel"
                            value={riskLevel}
                            onChange={(e) => setRiskLevel(e.target.value)}
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
                            <option value="高">高</option>
                            <option value="中">中</option>
                            <option value="低">低</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label htmlFor="rawMemo" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                        商談メモ *
                    </label>
                    <textarea
                        id="rawMemo"
                        rows={5}
                        value={rawMemo}
                        onChange={(e) => setRawMemo(e.target.value)}
                        maxLength={RAW_MEMO_MAX_LENGTH}
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

                <div>
                    <label htmlFor="summary" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                        要約
                    </label>
                    <textarea
                        id="summary"
                        rows={3}
                        value={summary}
                        onChange={(e) => setSummary(e.target.value)}
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
                    <label htmlFor="nextAction" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                        ネクストアクション
                    </label>
                    <input
                        id="nextAction"
                        type="text"
                        value={nextAction}
                        onChange={(e) => setNextAction(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            boxSizing: 'border-box',
                        }}
                    />
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

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                        marginTop: '8px',
                        paddingTop: '14px',
                        borderTop: '1px solid #f3f4f6',
                        flexWrap: 'wrap',
                    }}
                >
                    <button
                        type="submit"
                        disabled={saving || deleting || isMemoOverLimit}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: '#0066cc',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            fontWeight: 'bold',
                            cursor: saving || deleting || isMemoOverLimit ? 'not-allowed' : 'pointer',
                            opacity: saving || deleting || isMemoOverLimit ? 0.7 : 1,
                        }}
                    >
                        {saving ? '更新・移動中...' : '変更を保存'}
                    </button>

                    <button
                        type="button"
                        onClick={handleSoftDelete}
                        disabled={saving || deleting}
                        style={{
                            padding: '10px 16px',
                            backgroundColor: '#fff',
                            color: '#dc2626',
                            border: '1px solid #fca5a5',
                            borderRadius: '6px',
                            fontWeight: 'bold',
                            cursor: saving || deleting ? 'not-allowed' : 'pointer',
                            opacity: saving || deleting ? 0.7 : 1,
                        }}
                    >
                        {deleting ? '削除中...' : '商談を削除'}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default function DealDetailPage() {
    return (
        <Suspense
            fallback={
                <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
                    読み込み中...
                </div>
            }
        >
            <DealDetailContent />
        </Suspense>
    );
}
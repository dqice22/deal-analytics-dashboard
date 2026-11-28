/**
 * 画面名: 商談詳細・更新画面
 * ファイルパス: app/deals/[id]/page.tsx
 * 役割: 商談情報の参照・更新および論理削除、更新後のダッシュボード遷移と再表示時の状態リセット
 */
'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
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

const DEAL_TITLE_MAX_LENGTH = 150;
const RAW_MEMO_MAX_LENGTH = 2000;
const SUMMARY_MAX_LENGTH = 1000;
const NEXT_ACTION_MAX_LENGTH = 500;
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

/**
 * 入力値（unknown）が文字列であれば前後空白を除去し、それ以外は空文字を返す正規化関数。
 */
function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * DBのリスク値（「1」「2」「3」「高い」「中」「低い」「高」「低」など）を「高」「中」「低」に正規化する関数。
 */
function normalizeRiskLevel(rawRisk: unknown): string {
    const value = typeof rawRisk === 'string' ? rawRisk.trim() : String(rawRisk ?? '').trim();

    if (value === '高' || value === '高い' || value === '1') return '高';
    if (value === '中' || value === '2') return '中';
    if (value === '低' || value === '低い' || value === '3') return '低';

    return value;
}

/**
 * 商談メモの入力値（必須・最大文字数）を検証し、問題があればエラーメッセージを返す関数。
 */
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

/**
 * 商談詳細の取得、フォーム編集・バリデーション、更新、論理削除、および遷移制御を行うメインコンポーネント。
 */
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

    /**
     * 更新完了後にダッシュボードへ遷移するためのタイマーを解除する関数。
     */
    const clearRedirectTimer = useCallback(() => {
        if (redirectTimerRef.current !== null) {
            window.clearTimeout(redirectTimerRef.current);
            redirectTimerRef.current = null;
        }
    }, []);

    /**
     * 遷移タイマーの解除と、メッセージ・エラー・処理中フラグなどの一時的な表示状態を初期化する関数。
     */
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

    useEffect(() => {
        /**
         * ブラウザの戻る操作やページ復元（pageshow）時に一時的な表示状態をリセットするイベントハンドラ。
         */
        const handlePageShow = () => {
            resetTransientStatus();
        };

        /**
         * ページが再表示（visible）された際に一時的な表示状態をリセットするイベントハンドラ。
         */
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

        /**
         * 現在のログインセッション（/api/auth/me）を確認し、未認証の場合はログイン画面へ遷移する非同期関数。
         */
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

    /**
     * 対象IDの商談詳細、顧客企業名、フェーズ・社員マスタをSupabaseから取得し、フォーム初期値へ反映する関数。
     */
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
            const supabase = getSupabaseClient();

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
            const normalizedRisk = normalizeRiskLevel(dealData.risk_level);

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
        /**
         * 認証完了後に商談詳細の読み込み処理を実行する非同期ラッパー関数。
         */
        const run = async () => {
            await loadDealDetail();
            if (!active) return;
        };
        void run();

        return () => {
            active = false;
        };
    }, [authChecking, currentUser, loadDealDetail]);

    /**
     * 入力内容を検証したうえでSupabaseのdealsレコードを更新し、完了後にダッシュボードへ遷移するイベントハンドラ。
     */
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
        const trimmedSummary = summary.trim();
        const trimmedNextAction = nextAction.trim();

        if (!trimmedTitle) {
            setErrorMsg('商談タイトル・案件名を入力してください。');
            return;
        }
        if (trimmedTitle.length > DEAL_TITLE_MAX_LENGTH) {
            setErrorMsg(`商談タイトル・案件名は${DEAL_TITLE_MAX_LENGTH}文字以内で入力してください。`);
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
        if (trimmedSummary.length > SUMMARY_MAX_LENGTH) {
            setErrorMsg(`要約は${SUMMARY_MAX_LENGTH}文字以内で入力してください。`);
            return;
        }
        if (trimmedNextAction.length > NEXT_ACTION_MAX_LENGTH) {
            setErrorMsg(`ネクストアクションは${NEXT_ACTION_MAX_LENGTH}文字以内で入力してください。`);
            return;
        }

        clearRedirectTimer();
        setSaving(true);

        try {
            const supabase = getSupabaseClient();
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
                    summary: trimmedSummary || null,
                    next_action: trimmedNextAction || null,
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

    /**
     * 確認ダイアログ後に商談レコードのdelete_flgをtrueへ更新（論理削除）し、ダッシュボードへ遷移するイベントハンドラ。
     */
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
            const supabase = getSupabaseClient();
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
            <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif', fontSize: '14px' }}>
                読み込み中...
            </div>
        );
    }

    if (notFound || !deal) {
        return (
            <div style={{ maxWidth: '880px', margin: '0 auto', padding: '16px 20px', fontFamily: 'sans-serif', fontSize: '14px' }}>
                <p style={{ color: '#dc2626', fontWeight: 'bold' }}>
                    対象の商談データが見つからないか、すでに削除されています。
                </p>
                <Link href="/" style={{ color: '#0066cc', textDecoration: 'none', fontWeight: 'bold' }}>
                    ← ダッシュボードへ戻る
                </Link>
            </div>
        );
    }

    const trimmedTitleLength = dealTitle.trim().length;
    const isTitleOverLimit = trimmedTitleLength > DEAL_TITLE_MAX_LENGTH;
    const trimmedMemoLength = rawMemo.trim().length;
    const isMemoOverLimit = trimmedMemoLength > RAW_MEMO_MAX_LENGTH;
    const trimmedSummaryLength = summary.trim().length;
    const isSummaryOverLimit = trimmedSummaryLength > SUMMARY_MAX_LENGTH;
    const trimmedNextActionLength = nextAction.trim().length;
    const isNextActionOverLimit = trimmedNextActionLength > NEXT_ACTION_MAX_LENGTH;
    const isSaveDisabled =
        saving ||
        deleting ||
        isTitleOverLimit ||
        isMemoOverLimit ||
        isSummaryOverLimit ||
        isNextActionOverLimit;

    const metaRowStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '8px',
        marginTop: '3px',
        fontSize: '12px',
    } as const;

    /**
     * 文字数上限超過状態に応じて文字数カウンターの表示スタイル（色・太字・折り返し制御）を返す関数。
     */
    const counterStyle = (overLimit: boolean) =>
        ({
            color: overLimit ? '#dc2626' : '#4b5563',
            fontWeight: overLimit ? 'bold' : 'normal',
            whiteSpace: 'nowrap',
            flexShrink: 0,
        }) as const;

    const formControlStyle = {
        width: '100%',
        minWidth: 0,
        padding: '7px 10px',
        fontSize: '14px',
        fontFamily: 'inherit',
        border: '1px solid #d1d5db',
        borderRadius: '4px',
        backgroundColor: '#fff',
        boxSizing: 'border-box',
    } as const;

    return (
        <div style={{ maxWidth: '880px', margin: '0 auto', padding: '16px 20px', fontFamily: 'sans-serif' }}>
            {/* ヘッダー */}
            <header
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: '12px',
                    borderBottom: '1px solid #e5e7eb',
                    marginBottom: '12px',
                    gap: '12px',
                    flexWrap: 'wrap',
                }}
            >
                <div>
                    {/* 1段目: 画面タイトル */}
                    <h1 style={{ margin: '0 0 6px 0', fontSize: '22px', lineHeight: 1.25 }}>商談詳細・更新</h1>

                    {/* 2段目: ログイン者情報 */}
                    {currentUser && (
                        <div style={{ fontSize: '12px', color: '#4b5563', marginBottom: '8px' }}>
                            ログイン中: <strong>{currentUser.employeeName}</strong> ({currentUser.employeeCode})
                        </div>
                    )}

                    {/* 3段目: 顧客企業・案件ID */}
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>
                        顧客企業: <strong>{deal.company_name}</strong> ／ 案件ID: #{deal.id}
                    </div>

                    {/* 4段目: 商談タイトル・案件名 */}
                    <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#111827', lineHeight: 1.35 }}>
                        {deal.deal_title}
                    </div>
                </div>

                <Link
                    href="/"
                    onClick={() => {
                        resetTransientStatus();
                    }}
                    style={{
                        padding: '7px 14px',
                        backgroundColor: '#f3f4f6',
                        color: '#111827',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap',
                    }}
                >
                    ← 一覧へ戻る
                </Link>
            </header>

            {/* 監査・メタ情報 */}
            <section
                style={{
                    fontSize: '12px',
                    color: '#4b5563',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    marginBottom: '12px',
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
                    gap: '12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '16px 18px',
                    backgroundColor: '#fff',
                }}
            >
                {/* 1段目: 商談タイトル・案件名（全幅） */}
                <div>
                    <label htmlFor="dealTitle" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '3px' }}>
                        商談タイトル・案件名 *
                    </label>
                    <input
                        id="dealTitle"
                        type="text"
                        value={dealTitle}
                        onChange={(e) => setDealTitle(e.target.value)}
                        maxLength={DEAL_TITLE_MAX_LENGTH}
                        title={dealTitle}
                        required
                        style={{
                            ...formControlStyle,
                            border: `1px solid ${isTitleOverLimit ? '#dc2626' : '#d1d5db'}`,
                        }}
                    />
                    <div style={metaRowStyle}>
                        <span
                            style={{
                                color: isTitleOverLimit ? '#dc2626' : '#6b7280',
                                fontWeight: isTitleOverLimit ? 'bold' : 'normal',
                            }}
                        >
                            {isTitleOverLimit
                                ? `商談タイトル・案件名は${DEAL_TITLE_MAX_LENGTH}文字以内で入力してください。`
                                : `※ 前後の空白を除いた文字数で判定されます（必須・最大${DEAL_TITLE_MAX_LENGTH}文字）`}
                        </span>
                        <span style={counterStyle(isTitleOverLimit)}>
                            {trimmedTitleLength} / {DEAL_TITLE_MAX_LENGTH}文字
                        </span>
                    </div>
                </div>

                {/* 2段目: 商談日・担当社員・商談フェーズ・リスクレベル（1列配置） */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '155px minmax(0, 1.3fr) minmax(0, 1.2fr) 115px',
                        gap: '10px',
                        alignItems: 'start',
                    }}
                >
                    <div style={{ minWidth: 0 }}>
                        <label
                            htmlFor="dealDate"
                            style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap' }}
                        >
                            商談日 *
                        </label>
                        <input
                            id="dealDate"
                            type="date"
                            value={dealDate}
                            onChange={(e) => setDealDate(e.target.value)}
                            required
                            style={{ ...formControlStyle, padding: '7px 8px' }}
                        />
                    </div>

                    <div style={{ minWidth: 0 }}>
                        <label
                            htmlFor="personInChargeCode"
                            style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap' }}
                        >
                            担当社員 *
                        </label>
                        <select
                            id="personInChargeCode"
                            value={personInChargeCode}
                            onChange={(e) => setPersonInChargeCode(e.target.value)}
                            required
                            style={formControlStyle}
                        >
                            <option value="">選択してください</option>
                            {employees.map((emp) => (
                                <option key={emp.employee_code} value={emp.employee_code}>
                                    {emp.employee_name}（{emp.employee_code}）
                                </option>
                            ))}
                        </select>
                    </div>

                    <div style={{ minWidth: 0 }}>
                        <label
                            htmlFor="phaseCode"
                            style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap' }}
                        >
                            商談フェーズ *
                        </label>
                        <select
                            id="phaseCode"
                            value={phaseCode}
                            onChange={(e) => setPhaseCode(e.target.value)}
                            required
                            style={formControlStyle}
                        >
                            <option value="">選択してください</option>
                            {phases.map((p) => (
                                <option key={p.phase_code} value={p.phase_code}>
                                    {p.phase_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div style={{ minWidth: 0 }}>
                        <label
                            htmlFor="riskLevel"
                            style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap' }}
                        >
                            リスクレベル *
                        </label>
                        <select
                            id="riskLevel"
                            value={riskLevel}
                            onChange={(e) => setRiskLevel(e.target.value)}
                            required
                            style={formControlStyle}
                        >
                            <option value="">選択</option>
                            <option value="高">高</option>
                            <option value="中">中</option>
                            <option value="低">低</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label htmlFor="rawMemo" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '3px' }}>
                        商談メモ *
                    </label>
                    <textarea
                        id="rawMemo"
                        rows={4}
                        value={rawMemo}
                        onChange={(e) => setRawMemo(e.target.value)}
                        maxLength={RAW_MEMO_MAX_LENGTH}
                        required
                        style={{
                            ...formControlStyle,
                            border: `1px solid ${isMemoOverLimit ? '#dc2626' : '#d1d5db'}`,
                        }}
                    />
                    <div style={metaRowStyle}>
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
                        <span style={counterStyle(isMemoOverLimit)}>
                            {trimmedMemoLength} / {RAW_MEMO_MAX_LENGTH}文字
                        </span>
                    </div>
                </div>

                <div>
                    <label htmlFor="summary" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '3px' }}>
                        要約
                    </label>
                    <textarea
                        id="summary"
                        rows={3}
                        value={summary}
                        onChange={(e) => setSummary(e.target.value)}
                        maxLength={SUMMARY_MAX_LENGTH}
                        style={{
                            ...formControlStyle,
                            border: `1px solid ${isSummaryOverLimit ? '#dc2626' : '#d1d5db'}`,
                        }}
                    />
                    <div style={metaRowStyle}>
                        <span
                            style={{
                                color: isSummaryOverLimit ? '#dc2626' : '#6b7280',
                                fontWeight: isSummaryOverLimit ? 'bold' : 'normal',
                            }}
                        >
                            {isSummaryOverLimit
                                ? `要約は${SUMMARY_MAX_LENGTH}文字以内で入力してください。`
                                : `※ 前後の空白を除いた文字数で判定されます（最大${SUMMARY_MAX_LENGTH}文字）`}
                        </span>
                        <span style={counterStyle(isSummaryOverLimit)}>
                            {trimmedSummaryLength} / {SUMMARY_MAX_LENGTH}文字
                        </span>
                    </div>
                </div>

                <div>
                    <label htmlFor="nextAction" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '3px' }}>
                        ネクストアクション
                    </label>
                    <textarea
                        id="nextAction"
                        rows={3}
                        value={nextAction}
                        onChange={(e) => setNextAction(e.target.value)}
                        maxLength={NEXT_ACTION_MAX_LENGTH}
                        style={{
                            ...formControlStyle,
                            border: `1px solid ${isNextActionOverLimit ? '#dc2626' : '#d1d5db'}`,
                        }}
                    />
                    <div style={metaRowStyle}>
                        <span
                            style={{
                                color: isNextActionOverLimit ? '#dc2626' : '#6b7280',
                                fontWeight: isNextActionOverLimit ? 'bold' : 'normal',
                            }}
                        >
                            {isNextActionOverLimit
                                ? `ネクストアクションは${NEXT_ACTION_MAX_LENGTH}文字以内で入力してください。`
                                : `※ 前後の空白を除いた文字数で判定されます（最大${NEXT_ACTION_MAX_LENGTH}文字）`}
                        </span>
                        <span style={counterStyle(isNextActionOverLimit)}>
                            {trimmedNextActionLength} / {NEXT_ACTION_MAX_LENGTH}文字
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

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                        marginTop: '4px',
                        paddingTop: '12px',
                        borderTop: '1px solid #f3f4f6',
                        flexWrap: 'wrap',
                    }}
                >
                    <button
                        type="button"
                        onClick={handleSoftDelete}
                        disabled={saving || deleting}
                        style={{
                            padding: '9px 16px',
                            backgroundColor: '#fff',
                            color: '#dc2626',
                            border: '1px solid #fca5a5',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            cursor: saving || deleting ? 'not-allowed' : 'pointer',
                            opacity: saving || deleting ? 0.7 : 1,
                        }}
                    >
                        {deleting ? '削除中...' : '商談を削除'}
                    </button>

                    <button
                        type="submit"
                        disabled={isSaveDisabled}
                        style={{
                            padding: '9px 20px',
                            backgroundColor: '#0066cc',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            cursor: isSaveDisabled ? 'not-allowed' : 'pointer',
                            opacity: isSaveDisabled ? 0.7 : 1,
                        }}
                    >
                        {saving ? '更新・移動中...' : '変更を保存'}
                    </button>
                </div>
            </form>
        </div>
    );
}

/**
 * 商談詳細・更新画面のエントリポイント。本体コンポーネントを Suspense でラップして描画するコンポーネント。
 */
export default function DealDetailPage() {
    return (
        <Suspense
            fallback={
                <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif', fontSize: '14px' }}>
                    読み込み中...
                </div>
            }
        >
            <DealDetailContent />
        </Suspense>
    );
}
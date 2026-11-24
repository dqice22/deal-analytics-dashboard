/**
 * 画面名: 社員マスタ管理画面
 * ファイルパス: app/admin/employees/page.tsx
 * 役割: 社員情報の参照・登録・更新および有効状態（論理削除）の管理
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface CurrentUser {
    employeeCode: string;
    employeeName: string;
    positionCode: string | null;
    isAdmin: boolean;
}

interface PositionMaster {
    position_code: string;
    position_name: string;
}

interface EmployeeRow {
    employee_code: string;
    employee_name: string;
    position_code: string;
    position_name: string;
    is_admin: boolean;
    delete_flg: boolean;
}

interface RawEmployeeItem {
    employee_code: string;
    employee_name: string;
    position_code: string;
    is_admin: boolean;
    delete_flg: boolean;
}

interface CreateEmployeeInput {
    employeeCode: string;
    employeeName: string;
    positionCode: string;
    password: string;
    isAdmin: boolean;
    activeCodes: string[];
    deletedCodes: string[];
    validPositionCodes: string[];
}

interface UpdateEmployeeInput {
    employeeCode: string;
    employeeName: string;
    positionCode: string;
    isAdmin: boolean;
    validPositionCodes: string[];
}

const EMPLOYEE_CODE_REGEX = /^\d{6}$/;
const EMPLOYEE_CODE_LENGTH = 6;
const EMPLOYEE_NAME_MAX_LENGTH = 128;
const POSITION_CODE_MAX_LENGTH = 2;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 64;
const PASSWORD_HALF_WIDTH_PRINTABLE_REGEX = /^[!-~]+$/;

function validateEmployeeCode(
    rawCode: string,
    activeCodes: string[],
    deletedCodes: string[]
): string | null {
    const trimmed = rawCode.trim();
    if (!trimmed) {
        return '社員コードを入力してください。';
    }
    if (trimmed.length !== EMPLOYEE_CODE_LENGTH || !EMPLOYEE_CODE_REGEX.test(trimmed)) {
        return '社員コードは半角数字6桁で入力してください。';
    }
    if (activeCodes.includes(trimmed)) {
        return 'この社員コードはすでに登録されています。';
    }
    if (deletedCodes.includes(trimmed)) {
        return '削除済みデータに同じ社員コードが存在します。別のコードを入力してください。';
    }
    return null;
}

function validateEmployeeName(rawName: string): string | null {
    const trimmed = rawName.trim();
    if (!trimmed) {
        return '社員名を入力してください。';
    }
    if (trimmed.length > EMPLOYEE_NAME_MAX_LENGTH) {
        return `社員名は${EMPLOYEE_NAME_MAX_LENGTH}文字以内で入力してください。`;
    }
    return null;
}

function validatePositionCode(rawPositionCode: string, validPositionCodes: string[]): string | null {
    const trimmed = rawPositionCode.trim();
    if (!trimmed) {
        return '役職コードを選択してください。';
    }
    if (trimmed.length > POSITION_CODE_MAX_LENGTH) {
        return `役職コードは${POSITION_CODE_MAX_LENGTH}文字以内で選択してください。`;
    }
    if (!validPositionCodes.includes(trimmed)) {
        return '存在しない役職コードが選択されています。';
    }
    return null;
}

function validatePassword(rawPassword: string): string | null {
    if (!rawPassword) {
        return '初期パスワードを入力してください。';
    }
    if (/\s/.test(rawPassword)) {
        return '初期パスワードに空白は使用できません。';
    }
    if (rawPassword.length < PASSWORD_MIN_LENGTH) {
        return `初期パスワードは${PASSWORD_MIN_LENGTH}文字以上で入力してください。`;
    }
    if (rawPassword.length > PASSWORD_MAX_LENGTH) {
        return `初期パスワードは${PASSWORD_MAX_LENGTH}文字以内で入力してください。`;
    }
    if (!PASSWORD_HALF_WIDTH_PRINTABLE_REGEX.test(rawPassword)) {
        return '初期パスワードは半角英数字・記号のみで入力してください。';
    }
    return null;
}

function validateCreateEmployee(input: CreateEmployeeInput): string | null {
    const codeError = validateEmployeeCode(
        input.employeeCode,
        input.activeCodes,
        input.deletedCodes
    );
    if (codeError) return codeError;

    const nameError = validateEmployeeName(input.employeeName);
    if (nameError) return nameError;

    const positionError = validatePositionCode(input.positionCode, input.validPositionCodes);
    if (positionError) return positionError;

    const passwordError = validatePassword(input.password);
    if (passwordError) return passwordError;

    if (typeof input.isAdmin !== 'boolean') {
        return '管理者権限の指定が不正です。';
    }

    return null;
}

function validateUpdateEmployee(input: UpdateEmployeeInput): string | null {
    const trimmedCode = input.employeeCode.trim();
    if (!trimmedCode || !EMPLOYEE_CODE_REGEX.test(trimmedCode)) {
        return '更新対象の社員コードが不正です。';
    }

    const nameError = validateEmployeeName(input.employeeName);
    if (nameError) return nameError;

    const positionError = validatePositionCode(input.positionCode, input.validPositionCodes);
    if (positionError) return positionError;

    if (typeof input.isAdmin !== 'boolean') {
        return '管理者権限の指定が不正です。';
    }

    return null;
}

function EyeIcon({ visible }: { visible: boolean }) {
    if (visible) {
        return (
            <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
        );
    }

    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

export default function AdminEmployeesPage() {
    const router = useRouter();

    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
    const [authChecking, setAuthChecking] = useState(true);

    const [positions, setPositions] = useState<PositionMaster[]>([]);
    const [employees, setEmployees] = useState<EmployeeRow[]>([]);
    const [deletedEmployeeCodes, setDeletedEmployeeCodes] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    // 新規登録フォーム
    const [newCode, setNewCode] = useState('');
    const [newName, setNewName] = useState('');
    const [newPositionCode, setNewPositionCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [newIsAdmin, setNewIsAdmin] = useState(false);
    const [creating, setCreating] = useState(false);

    // 編集中の社員
    const [editingCode, setEditingCode] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editPositionCode, setEditPositionCode] = useState('');
    const [editIsAdmin, setEditIsAdmin] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);

    const [message, setMessage] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    // フォーム入力値・編集状態・メッセージの初期化
    const resetFormAndTransientState = useCallback(() => {
        setNewCode('');
        setNewName('');
        setNewPositionCode('');
        setNewPassword('');
        setShowPassword(false);
        setNewIsAdmin(false);
        setCreating(false);

        setEditingCode(null);
        setEditName('');
        setEditPositionCode('');
        setEditIsAdmin(false);
        setSavingEdit(false);

        setMessage('');
        setErrorMsg('');
    }, []);

    // 画面再表示時に前回の入力値・状態をリセット
    useEffect(() => {
        const handlePageShow = () => {
            resetFormAndTransientState();
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                resetFormAndTransientState();
            }
        };

        window.addEventListener('pageshow', handlePageShow);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('pageshow', handlePageShow);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [resetFormAndTransientState]);

    // 管理者権限チェック
    useEffect(() => {
        let active = true;

        const checkAdmin = async () => {
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
                if (!data.user.isAdmin) {
                    router.replace('/');
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

        void checkAdmin();

        return () => {
            active = false;
        };
    }, [router]);

    const fetchEmployees = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/employees', {
                method: 'GET',
                cache: 'no-store',
            });
            const data = await res.json();

            if (!res.ok) {
                setErrorMsg(data.error || '社員一覧の取得に失敗しました。');
                return;
            }

            const rawEmployees: RawEmployeeItem[] = Array.isArray(data.employees) ? data.employees : [];
            const rawDeletedCodes: string[] = Array.isArray(data.deletedEmployeeCodes)
                ? data.deletedEmployeeCodes
                : [];
            const rawPositions: PositionMaster[] = Array.isArray(data.positions) ? data.positions : [];

            const positionMap = new Map<string, string>();
            for (const pos of rawPositions) {
                positionMap.set(pos.position_code, pos.position_name);
            }

            // 社員側にある役職コードも漏らさず候補に含める
            for (const emp of rawEmployees) {
                if (emp.position_code && !positionMap.has(emp.position_code)) {
                    positionMap.set(emp.position_code, emp.position_code);
                }
            }

            const mergedPositions: PositionMaster[] = Array.from(positionMap.entries()).map(
                ([position_code, position_name]) => ({
                    position_code,
                    position_name,
                })
            );

            setPositions(mergedPositions);

            const enrichedEmployees: EmployeeRow[] = rawEmployees.map((emp) => ({
                ...emp,
                position_name: positionMap.get(emp.position_code) ?? '未設定',
            }));

            setEmployees(enrichedEmployees);
            setDeletedEmployeeCodes(rawDeletedCodes);
        } catch {
            setErrorMsg('社員一覧の取得中に通信エラーが発生しました。');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (authChecking || !currentUser?.isAdmin) return;

        let active = true;
        const timer = window.setTimeout(() => {
            if (active) {
                resetFormAndTransientState();
                void fetchEmployees();
            }
        }, 0);

        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [authChecking, currentUser, fetchEmployees, resetFormAndTransientState]);

    const trimmedNewCode = newCode.trim();
    const isActiveDuplicateCode =
        trimmedNewCode.length > 0 &&
        employees.some((emp) => emp.employee_code === trimmedNewCode);
    const isDeletedDuplicateCode =
        trimmedNewCode.length > 0 &&
        deletedEmployeeCodes.includes(trimmedNewCode);
    const isInvalidNewCodeFormat =
        trimmedNewCode.length > 0 && !EMPLOYEE_CODE_REGEX.test(trimmedNewCode);

    // 新規社員登録
    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage('');
        setErrorMsg('');

        const validationError = validateCreateEmployee({
            employeeCode: newCode,
            employeeName: newName,
            positionCode: newPositionCode,
            password: newPassword,
            isAdmin: Boolean(newIsAdmin),
            activeCodes: employees.map((emp) => emp.employee_code),
            deletedCodes: deletedEmployeeCodes,
            validPositionCodes: positions.map((pos) => pos.position_code),
        });

        if (validationError) {
            setErrorMsg(validationError);
            return;
        }

        setCreating(true);

        try {
            const trimmedCode = newCode.trim();
            const trimmedName = newName.trim();
            const trimmedPositionCode = newPositionCode.trim();
            const submittedPassword = newPassword;

            const res = await fetch('/api/admin/employees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employee_code: trimmedCode,
                    employee_name: trimmedName,
                    position_code: trimmedPositionCode,
                    password: submittedPassword,
                    is_admin: Boolean(newIsAdmin),
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                const rawError = String(data.error || '');
                if (
                    rawError.includes('employees_pkey') ||
                    rawError.includes('duplicate key value violates unique constraint')
                ) {
                    setErrorMsg('社員番号が重複しています。');
                } else {
                    setErrorMsg(rawError || '社員登録に失敗しました。');
                }
                return;
            }

            setNewCode('');
            setNewName('');
            setNewPositionCode('');
            setNewPassword('');
            setShowPassword(false);
            setNewIsAdmin(false);
            setMessage(`${trimmedName}さんの情報を登録しました。（初期パスワード: ${submittedPassword}）`);
            await fetchEmployees();
        } catch {
            setErrorMsg('通信エラーが発生しました。');
        } finally {
            setCreating(false);
        }
    };

    // 編集開始
    const startEdit = (emp: EmployeeRow) => {
        setMessage('');
        setErrorMsg('');
        setEditingCode(emp.employee_code);
        setEditName(emp.employee_name);
        setEditPositionCode(
            emp.position_code && positions.some((p) => p.position_code === emp.position_code)
                ? emp.position_code
                : ''
        );
        setEditIsAdmin(Boolean(emp.is_admin));
    };

    // 編集キャンセル
    const cancelEdit = () => {
        setEditingCode(null);
        setEditName('');
        setEditPositionCode('');
        setEditIsAdmin(false);
    };

    // 編集保存
    const handleSaveEdit = async (employeeCode: string) => {
        setMessage('');
        setErrorMsg('');

        const validationError = validateUpdateEmployee({
            employeeCode,
            employeeName: editName,
            positionCode: editPositionCode,
            isAdmin: Boolean(editIsAdmin),
            validPositionCodes: positions.map((pos) => pos.position_code),
        });

        if (validationError) {
            setErrorMsg(validationError);
            return;
        }

        setSavingEdit(true);

        try {
            const trimmedName = editName.trim();
            const trimmedPositionCode = editPositionCode.trim();

            const payload: Record<string, unknown> = {
                employee_code: employeeCode.trim(),
                employee_name: trimmedName,
                position_code: trimmedPositionCode,
                is_admin: Boolean(editIsAdmin),
            };

            const res = await fetch('/api/admin/employees', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (!res.ok) {
                setErrorMsg(data.error || '更新に失敗しました。');
                return;
            }

            setEditingCode(null);
            setMessage(`${trimmedName}さんの情報を更新しました。`);
            await fetchEmployees();
        } catch {
            setErrorMsg('通信エラーが発生しました。');
        } finally {
            setSavingEdit(false);
        }
    };

    // 論理削除
    const handleSoftDelete = async (emp: EmployeeRow) => {
        const ok = window.confirm(
            `社員「${emp.employee_name}」を削除しますか？`
        );
        if (!ok) return;

        setMessage('');
        setErrorMsg('');

        try {
            const res = await fetch('/api/admin/employees', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employee_code: emp.employee_code,
                    delete_flg: true,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                setErrorMsg(data.error || '削除に失敗しました。');
                return;
            }

            setMessage(`${emp.employee_name}さんの情報を削除しました。`);
            await fetchEmployees();
        } catch {
            setErrorMsg('通信エラーが発生しました。');
        }
    };

    if (authChecking) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
                権限を確認中...
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '24px', fontFamily: 'sans-serif' }}>
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
                    <h1 style={{ margin: '0 0 4px 0', fontSize: '22px' }}>社員マスタ管理</h1>
                    <div style={{ fontSize: '13px', color: '#4b5563' }}>
                        管理者: <strong>{currentUser?.employeeName}</strong>（{currentUser?.employeeCode}）
                    </div>
                </div>

                <Link
                    href="/"
                    onClick={() => {
                        resetFormAndTransientState();
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
                    ← ダッシュボードへ戻る
                </Link>
            </header>

            {/* 新規社員登録フォーム */}
            <section
                style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '18px',
                    backgroundColor: '#f9fafb',
                    marginBottom: '24px',
                }}
            >
                <h2 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>新規社員登録</h2>
                <form
                    onSubmit={handleCreate}
                    autoComplete="off"
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px',
                    }}
                >
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))',
                            gap: '12px',
                            alignItems: 'start',
                        }}
                    >
                        <div>
                            <label
                                style={{
                                    display: 'block',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    lineHeight: '16px',
                                    marginBottom: '4px',
                                }}
                            >
                                社員コード（半角数字6桁） *
                            </label>
                            <input
                                type="text"
                                value={newCode}
                                onChange={(e) => setNewCode(e.target.value)}
                                placeholder="例: 000001"
                                maxLength={EMPLOYEE_CODE_LENGTH}
                                inputMode="numeric"
                                pattern="\d{6}"
                                autoComplete="off"
                                required
                                style={{
                                    width: '100%',
                                    height: '38px',
                                    padding: '8px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    boxSizing: 'border-box',
                                    backgroundColor: '#fff',
                                }}
                            />
                            {isInvalidNewCodeFormat && (
                                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#dc2626', fontWeight: 'bold' }}>
                                    社員コードは半角数字6桁で入力してください。
                                </p>
                            )}
                            {!isInvalidNewCodeFormat && isActiveDuplicateCode && (
                                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#dc2626', fontWeight: 'bold' }}>
                                    この社員コードはすでに登録されています。
                                </p>
                            )}
                            {!isInvalidNewCodeFormat && !isActiveDuplicateCode && isDeletedDuplicateCode && (
                                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#d97706', fontWeight: 'bold' }}>
                                    削除済みデータに同じ社員コードが存在します。別のコードを入力してください。
                                </p>
                            )}
                        </div>

                        <div>
                            <label
                                style={{
                                    display: 'block',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    lineHeight: '16px',
                                    marginBottom: '4px',
                                }}
                            >
                                社員名 *
                            </label>
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="例: 山田 太郎"
                                maxLength={EMPLOYEE_NAME_MAX_LENGTH}
                                autoComplete="off"
                                required
                                style={{
                                    width: '100%',
                                    height: '38px',
                                    padding: '8px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    boxSizing: 'border-box',
                                    backgroundColor: '#fff',
                                }}
                            />
                        </div>

                        <div>
                            <label
                                style={{
                                    display: 'block',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    lineHeight: '16px',
                                    marginBottom: '4px',
                                }}
                            >
                                役職コード *
                            </label>
                            <select
                                value={newPositionCode}
                                onChange={(e) => setNewPositionCode(e.target.value)}
                                required
                                style={{
                                    width: '100%',
                                    height: '38px',
                                    padding: '6px 8px',
                                    fontSize: '13px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    boxSizing: 'border-box',
                                    backgroundColor: '#fff',
                                }}
                            >
                                <option value="">選択してください</option>
                                {positions.map((pos) => (
                                    <option key={pos.position_code} value={pos.position_code}>
                                        {pos.position_code}（{pos.position_name}）
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label
                                style={{
                                    display: 'block',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    lineHeight: '16px',
                                    marginBottom: '4px',
                                }}
                            >
                                初期パスワード *
                            </label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    minLength={PASSWORD_MIN_LENGTH}
                                    maxLength={PASSWORD_MAX_LENGTH}
                                    autoComplete="new-password"
                                    required
                                    style={{
                                        width: '100%',
                                        height: '38px',
                                        padding: '8px 36px 8px 8px',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '4px',
                                        boxSizing: 'border-box',
                                        backgroundColor: '#fff',
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                                    aria-pressed={showPassword}
                                    style={{
                                        position: 'absolute',
                                        top: '50%',
                                        right: '8px',
                                        transform: 'translateY(-50%)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '2px',
                                        backgroundColor: 'transparent',
                                        border: 'none',
                                        color: '#4b5563',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <EyeIcon visible={showPassword} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '12px',
                            flexWrap: 'wrap',
                        }}
                    >
                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '13px',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={newIsAdmin}
                                onChange={(e) => setNewIsAdmin(e.target.checked)}
                            />
                            管理者権限
                        </label>

                        <button
                            type="submit"
                            disabled={creating}
                            style={{
                                minWidth: '180px',
                                height: '38px',
                                padding: '0 20px',
                                backgroundColor: '#0066cc',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: 'bold',
                                cursor: creating ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {creating ? '登録中...' : '社員を登録'}
                        </button>
                    </div>
                </form>
            </section>

            {message && (
                <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#059669', fontWeight: 'bold' }}>
                    {message}
                </p>
            )}
            {errorMsg && (
                <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#dc2626', fontWeight: 'bold' }}>
                    {errorMsg}
                </p>
            )}

            {/* 社員一覧テーブル */}
            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>読み込み中...</div>
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f3f4f6', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                                <th style={{ padding: '10px 12px' }}>社員コード</th>
                                <th style={{ padding: '10px 12px' }}>社員名</th>
                                <th style={{ padding: '10px 12px' }}>役職コード</th>
                                <th style={{ padding: '10px 12px' }}>役職名</th>
                                <th style={{ padding: '10px 12px' }}>権限</th>
                                <th style={{ padding: '10px 12px' }}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employees.map((emp) => {
                                const isEditing = editingCode === emp.employee_code;
                                return (
                                    <tr key={emp.employee_code} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>{emp.employee_code}</td>

                                        <td style={{ padding: '10px 12px' }}>
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    maxLength={EMPLOYEE_NAME_MAX_LENGTH}
                                                    required
                                                    style={{ padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                                                />
                                            ) : (
                                                emp.employee_name
                                            )}
                                        </td>

                                        <td style={{ padding: '10px 12px' }}>
                                            {isEditing ? (
                                                <select
                                                    value={editPositionCode}
                                                    onChange={(e) => setEditPositionCode(e.target.value)}
                                                    required
                                                    style={{ padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff' }}
                                                >
                                                    <option value="">選択してください</option>
                                                    {positions.map((pos) => (
                                                        <option key={pos.position_code} value={pos.position_code}>
                                                            {pos.position_code}（{pos.position_name}）
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                emp.position_code
                                            )}
                                        </td>

                                        <td style={{ padding: '10px 12px' }}>
                                            {isEditing
                                                ? positions.find((p) => p.position_code === editPositionCode)?.position_name ?? '未設定'
                                                : emp.position_name}
                                        </td>

                                        <td style={{ padding: '10px 12px' }}>
                                            {isEditing ? (
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={editIsAdmin}
                                                        onChange={(e) => setEditIsAdmin(e.target.checked)}
                                                    />
                                                    管理者
                                                </label>
                                            ) : emp.is_admin ? (
                                                <span
                                                    style={{
                                                        padding: '2px 8px',
                                                        fontSize: '12px',
                                                        backgroundColor: '#dbeafe',
                                                        color: '#1e40af',
                                                        borderRadius: '4px',
                                                        fontWeight: 'bold',
                                                    }}
                                                >
                                                    管理者
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '12px', color: '#6b7280' }}>一般</span>
                                            )}
                                        </td>

                                        <td style={{ padding: '10px 12px' }}>
                                            {isEditing ? (
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button
                                                        type="button"
                                                        disabled={savingEdit}
                                                        onClick={() => handleSaveEdit(emp.employee_code)}
                                                        style={{
                                                            padding: '5px 10px',
                                                            backgroundColor: '#0066cc',
                                                            color: '#fff',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            fontSize: '12px',
                                                            fontWeight: 'bold',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        保存
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={savingEdit}
                                                        onClick={cancelEdit}
                                                        style={{
                                                            padding: '5px 10px',
                                                            backgroundColor: '#fff',
                                                            color: '#374151',
                                                            border: '1px solid #d1d5db',
                                                            borderRadius: '4px',
                                                            fontSize: '12px',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        取消
                                                    </button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => startEdit(emp)}
                                                        style={{
                                                            padding: '5px 10px',
                                                            backgroundColor: '#f3f4f6',
                                                            color: '#111827',
                                                            border: '1px solid #d1d5db',
                                                            borderRadius: '4px',
                                                            fontSize: '12px',
                                                            fontWeight: 'bold',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        編集
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSoftDelete(emp)}
                                                        style={{
                                                            padding: '5px 10px',
                                                            backgroundColor: '#fff',
                                                            color: '#dc2626',
                                                            border: '1px solid #fca5a5',
                                                            borderRadius: '4px',
                                                            fontSize: '12px',
                                                            fontWeight: 'bold',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        削除
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
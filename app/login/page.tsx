/**
 * 画面名: ログイン画面
 * ファイルパス: app/login/page.tsx
 * 役割: ユーザー認証（ログインフォーム入力および認証処理・画面遷移）
 */
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * パスワード表示状態に応じて目のアイコン（表示／非表示切替用SVG）を描画するコンポーネント。
 */
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

/**
 * ログインフォームの表示、入力値の状態管理、および認証APIへの送信と画面遷移を行うページコンポーネント。
 */
export default function LoginPage() {
    const router = useRouter();

    const [employeeCode, setEmployeeCode] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const employeeCodeRef = useRef<HTMLInputElement | null>(null);
    const passwordRef = useRef<HTMLInputElement | null>(null);

    /**
     * ログインフォームの入力値・表示切替・エラー・送信中状態を初期状態へリセットする関数。
     */
    const clearLoginForm = useCallback(() => {
        setEmployeeCode('');
        setPassword('');
        setShowPassword(false);
        setErrorMsg('');
        setSubmitting(false);

        if (employeeCodeRef.current) {
            employeeCodeRef.current.value = '';
        }
        if (passwordRef.current) {
            passwordRef.current.value = '';
        }
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            clearLoginForm();
        }, 0);

        /**
         * ブラウザの戻る操作やbfcacheからの復元時にフォーム状態をクリアするイベントハンドラ。
         */
        const handlePageShow = () => {
            clearLoginForm();
        };

        /**
         * ページが再表示（visible）された際にフォーム状態をクリアするイベントハンドラ。
         */
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                clearLoginForm();
            }
        };

        window.addEventListener('pageshow', handlePageShow);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.clearTimeout(timer);
            window.removeEventListener('pageshow', handlePageShow);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [clearLoginForm]);

    /**
     * フォーム送信時に認証API（/api/auth/login）を呼び出し、成功時はトップ画面へ遷移するイベントハンドラ。
     */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setSubmitting(true);

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeCode: employeeCode.trim(),
                    password,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                setErrorMsg(data.error || '社員コードまたはパスワードが正しくありません。');
                setPassword('');
                setSubmitting(false);
                return;
            }

            clearLoginForm();
            router.replace('/');
            router.refresh();
        } catch {
            setErrorMsg('ログイン処理中にエラーが発生しました。');
            setSubmitting(false);
        }
    };

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                backgroundColor: '#f3f4f6',
                fontFamily: 'sans-serif',
            }}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: '400px',
                    padding: '28px',
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
                }}
            >
                <h1 style={{ margin: '0 0 6px 0', fontSize: '22px', color: '#111827' }}>
                    ログイン
                </h1>
                <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#6b7280' }}>
                    社員コードとパスワードを入力してください。
                </p>

                <form
                    onSubmit={handleSubmit}
                    autoComplete="off"
                    style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
                >
                    <div>
                        <label
                            htmlFor="employeeCode"
                            style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}
                        >
                            社員コード
                        </label>
                        <input
                            ref={employeeCodeRef}
                            id="employeeCode"
                            type="text"
                            value={employeeCode}
                            onChange={(e) => setEmployeeCode(e.target.value)}
                            placeholder="例: 000001"
                            required
                            autoComplete="off"
                            style={{
                                width: '100%',
                                padding: '10px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '14px',
                                boxSizing: 'border-box',
                            }}
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="password"
                            style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}
                        >
                            パスワード
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                ref={passwordRef}
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="new-password"
                                style={{
                                    width: '100%',
                                    padding: '10px 38px 10px 10px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '6px',
                                    fontSize: '14px',
                                    boxSizing: 'border-box',
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
                                    right: '10px',
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

                    {errorMsg && (
                        <p style={{ margin: 0, fontSize: '13px', color: '#dc2626', fontWeight: 'bold' }}>
                            {errorMsg}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        style={{
                            width: '100%',
                            padding: '10px 14px',
                            backgroundColor: '#0066cc',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            cursor: submitting ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {submitting ? 'ログイン中...' : 'ログイン'}
                    </button>
                </form>
            </div>
        </div>
    );
}
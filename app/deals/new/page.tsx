'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// フォームデータの型定義
interface DealForm {
    company_name: string;
    person_in_charge: string;
    deal_date: string;
    raw_memo: string;
}

export default function NewDealPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [error, setError] = useState('');

    // 初期値を空文字にすることで、プリレンダーエラーもLint警告も完全に回避します
    const [form, setForm] = useState<DealForm>({
        company_name: '',
        person_in_charge: '',
        deal_date: '',
        raw_memo: '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    // フォーム送信とGemini解析・Supabase保存の処理
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setAnalyzing(true);
        setError('');

        try {
            const response = await fetch('/api/analyze', { // APIのエンドポイント（必要に応じて /api/analyze 等に調整してください）
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(form),
            });

            if (!response.ok) {
                throw new Error('商談の保存または解析に失敗しました。');
            }

            // 成功したらダッシュボードへ戻る
            router.push('/');
            router.refresh();
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('予期せぬエラーが発生しました。');
            }
            setLoading(false);
            setAnalyzing(false);
        }
    };

    return (
        <div style={{ maxWidth: '768px', margin: '0 auto', padding: '24px', boxSizing: 'border-box' }}>
            <div style={{ marginBottom: '24px' }}>
                <Link href="/" style={{ fontSize: '14px', color: '#2563eb', textDecoration: 'none', fontWeight: '500' }}>
                    ← ダッシュボードに戻る
                </Link>
                <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginTop: '8px', marginBottom: '4px' }}>新規商談の登録 & AI解析</h1>
                <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>商談メモを入力すると、Geminiが自動で要約・ネクストアクション・リスクを分析します。</p>
            </div>

            {error && (
                <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '8px', fontSize: '14px' }}>
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', display: 'flex', flexDirection: 'column', gap: '24px', boxSizing: 'border-box' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>企業名</label>
                        <input
                            type="text"
                            name="company_name"
                            required
                            value={form.company_name}
                            onChange={handleChange}
                            placeholder="例: 株式会社サンプル商事"
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>担当者名</label>
                        <input
                            type="text"
                            name="person_in_charge"
                            required
                            value={form.person_in_charge}
                            onChange={handleChange}
                            placeholder="例: 山田 太郎"
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>商談実施日</label>
                    <input
                        type="date"
                        name="deal_date"
                        required
                        value={form.deal_date}
                        onChange={handleChange}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>商談メモ（議事録・会話内容）</label>
                    <textarea
                        name="raw_memo"
                        rows={6}
                        required
                        value={form.raw_memo}
                        onChange={handleChange}
                        placeholder="商談でのやり取り、お客様の課題、予算感、懸念点などを自由に入力してください..."
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                    />
                </div>

                {/* キャンセルボタンと保存ボタンの間に gap: '12px' を設定してスペースを確保 */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid #f3f4f6' }}>
                    <Link
                        href="/"
                        style={{
                            padding: '8px 16px',
                            border: '1px solid #d1d5db',
                            color: '#374151',
                            borderRadius: '8px',
                            textDecoration: 'none',
                            fontSize: '14px',
                            fontWeight: '500',
                            display: 'inline-flex',
                            alignItems: 'center'
                        }}
                    >
                        キャンセル
                    </Link>
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            padding: '8px 24px',
                            backgroundColor: '#2563eb',
                            color: '#ffffff',
                            borderRadius: '8px',
                            border: 'none',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            opacity: loading ? 0.5 : 1
                        }}
                    >
                        {analyzing ? (
                            <>
                                <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid #ffffff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></span>
                                Geminiが解析中...
                            </>
                        ) : (
                            '保存してAI解析を実行'
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface Deal {
    id: string;
    company_name: string;
    person_in_charge: string;
    deal_date: string;
    summary: string;
    next_action: string;
    risk_level: string;
}

export default function DealsDashboard() {
    const [deals, setDeals] = useState<Deal[]>([]);

    // 入力中の状態（フォーム内で自由に変更できる値）
    const [searchInput, setSearchInput] = useState('');
    const [riskInput, setRiskInput] = useState('ALL');

    // 検索ボタン押下によって確定する状態（useEffectのトリガー）
    const [searchTerm, setSearchTerm] = useState('');
    const [confirmedRiskFilter, setConfirmedRiskFilter] = useState('ALL');

    const [loading, setLoading] = useState(true);

    // 検索ボタン押下時（またはEnterキー押下時）に値を確定して検索を実行
    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setSearchTerm(searchInput);
        setConfirmedRiskFilter(riskInput);
    };

    // 確定された検索ワード（searchTerm）または確定されたフィルター（confirmedRiskFilter）が変わったときだけデータ取得
    useEffect(() => {
        const fetchDeals = async () => {
            setLoading(true);
            try {
                let query = supabase.from('deals').select('*').order('deal_date', { ascending: false });

                if (searchTerm.trim() !== '') {
                    query = query.ilike('company_name', `%${searchTerm}%`);
                }

                if (confirmedRiskFilter !== 'ALL') {
                    query = query.eq('risk_level', confirmedRiskFilter);
                }

                const { data, error } = await query;

                if (error) {
                    console.error('Error fetching deals:', error);
                } else {
                    setDeals(data || []);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchDeals();
    }, [searchTerm, confirmedRiskFilter]);

    return (
        <div style={{ maxWidth: '1152px', margin: '0 auto', padding: '24px', boxSizing: 'border-box', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#030712', margin: 0 }}>商談ダッシュボード</h1>
                <Link
                    href="/deals/new"
                    style={{ backgroundColor: '#2563eb', color: '#ffffff', padding: '8px 16px', borderRadius: '6px', textDecoration: 'none', fontWeight: '500' }}
                >
                    + 新規商談を登録
                </Link>
            </div>

            {/* 🔍 検索フォーム（幅100%固定・ボタン押下時のみ検索） */}
            <form
                onSubmit={handleSearch}
                style={{
                    backgroundColor: '#ffffff',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: '16px',
                    width: '100%',
                    boxSizing: 'border-box'
                }}
            >
                {/* 会社名検索 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>会社名検索</label>
                    <input
                        type="text"
                        placeholder="例: 株式会社... (あいまい検索)"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        style={{
                            width: '100%',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '14px',
                            outline: 'none',
                            color: '#030712',
                            boxSizing: 'border-box',
                            backgroundColor: '#ffffff'
                        }}
                    />
                </div>

                {/* リスクレベル（選択しても即時検索されず、検索ボタン押下で反映されます） */}
                <div style={{ width: '200px', flexShrink: 0 }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>リスクレベル</label>
                    <select
                        value={riskInput}
                        onChange={(e) => setRiskInput(e.target.value)}
                        style={{
                            width: '100%',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '14px',
                            outline: 'none',
                            backgroundColor: '#ffffff',
                            color: '#030712',
                            boxSizing: 'border-box'
                        }}
                    >
                        <option value="ALL">すべて表示</option>
                        <option value="高">高</option>
                        <option value="中">中</option>
                        <option value="低">低</option>
                    </select>
                </div>

                {/* 検索ボタン */}
                <div style={{ flexShrink: 0 }}>
                    <button
                        type="submit"
                        style={{
                            backgroundColor: '#1f2937',
                            color: '#ffffff',
                            padding: '0 24px',
                            height: '38px',
                            borderRadius: '6px',
                            border: 'none',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: 'pointer'
                        }}
                    >
                        検索
                    </button>
                </div>
            </form>

            {/* 商談一覧表示エリア */}
            <div style={{ width: '100%', boxSizing: 'border-box' }}>
                {loading ? (
                    <div style={{ backgroundColor: '#ffffff', padding: '48px', borderRadius: '8px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280', width: '100%', boxSizing: 'border-box' }}>
                        読み込み中...
                    </div>
                ) : deals.length === 0 ? (
                    <div style={{ backgroundColor: '#ffffff', padding: '48px', borderRadius: '8px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280', width: '100%', boxSizing: 'border-box' }}>
                        条件に一致する商談データが見つかりませんでした。
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
                        {deals.map((deal) => (
                            <div key={deal.id} style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box' }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#030712', margin: 0 }}>{deal.company_name}</h2>
                                        <span
                                            style={{
                                                padding: '2px 10px',
                                                borderRadius: '9999px',
                                                fontSize: '12px',
                                                fontWeight: '500',
                                                backgroundColor: deal.risk_level === '高' ? '#fee2e2' : deal.risk_level === '中' ? '#fef3c7' : '#dcfce7',
                                                color: deal.risk_level === '高' ? '#991b1b' : deal.risk_level === '中' ? '#92400e' : '#166534'
                                            }}
                                        >
                                            リスク: {deal.risk_level}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px', marginTop: 0 }}>
                                        担当者: {deal.person_in_charge || '未設定'} | 商談日: {deal.deal_date}
                                    </p>
                                    <p style={{ fontSize: '14px', color: '#374151', marginBottom: '12px', backgroundColor: '#f9fafb', padding: '12px', borderRadius: '6px', margin: '0 0 12px 0' }}>
                                        <strong>要約:</strong> {deal.summary}
                                    </p>
                                </div>
                                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px', marginTop: '8px' }}>
                                    <p style={{ fontSize: '12px', color: '#2563eb', fontWeight: '500', margin: 0 }}>
                                        ネクストアクション: {deal.next_action}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
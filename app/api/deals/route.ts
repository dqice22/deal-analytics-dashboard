/**
 * 画面名: 新規商談登録API
 * ファイルパス: app/api/deals/route.ts
 * 役割: セッション認証確認、入力検証、商談メモのAI分析（要約・ネクストアクション・リスクレベル判定）およびdealsテーブルへの新規登録
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const secretKey = new TextEncoder().encode(process.env.AUTH_SECRET!);
const COOKIE_NAME = 'sfa_session';
const RAW_MEMO_MAX_LENGTH = 2000;

function normalizeCode(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

async function getEmployeeCodeFromCookie(): Promise<string | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get(COOKIE_NAME)?.value;
        if (!token) return null;

        const { payload } = await jwtVerify(token, secretKey);
        const code = normalizeCode(payload.employeeCode);
        return code || null;
    } catch {
        return null;
    }
}

export async function POST(request: Request) {
    try {
        const sessionEmployeeCode = await getEmployeeCodeFromCookie();
        if (!sessionEmployeeCode) {
            return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
        }

        const body = (await request.json()) as Record<string, unknown>;
        const {
            company_id,
            deal_title,
            person_in_charge_employee_id,
            deal_date,
            phase_code,
            raw_memo,
        } = body;

        const parsedCompanyId =
            company_id !== undefined && company_id !== null && company_id !== ''
                ? Number(company_id)
                : NaN;
        const trimmedTitle = typeof deal_title === 'string' ? deal_title.trim() : '';
        const trimmedDealDate = typeof deal_date === 'string' ? deal_date.trim() : '';
        const chargeEmployeeId = normalizeCode(person_in_charge_employee_id);
        const normalizedPhaseCode = normalizeCode(phase_code);
        const trimmedMemo = typeof raw_memo === 'string' ? raw_memo.trim() : '';

        if (Number.isNaN(parsedCompanyId) || parsedCompanyId <= 0) {
            return NextResponse.json(
                { error: '顧客企業は必須です。' },
                { status: 400 }
            );
        }
        if (!trimmedTitle) {
            return NextResponse.json(
                { error: '商談タイトルは必須です。' },
                { status: 400 }
            );
        }
        if (!trimmedDealDate) {
            return NextResponse.json(
                { error: '商談日は必須です。' },
                { status: 400 }
            );
        }
        if (!chargeEmployeeId) {
            return NextResponse.json(
                { error: '担当社員は必須です。' },
                { status: 400 }
            );
        }
        if (!normalizedPhaseCode) {
            return NextResponse.json(
                { error: '商談フェーズは必須です。' },
                { status: 400 }
            );
        }
        if (!trimmedMemo) {
            return NextResponse.json(
                { error: '商談メモは必須です。' },
                { status: 400 }
            );
        }
        if (trimmedMemo.length > RAW_MEMO_MAX_LENGTH) {
            return NextResponse.json(
                { error: `商談メモは${RAW_MEMO_MAX_LENGTH}文字以内で入力してください。` },
                { status: 400 }
            );
        }

        // 1. Gemini APIに商談メモの分析を依頼（リトライロジック付き）
        const prompt = `
以下の商談メモを分析し、JSON形式のみで正確に以下の3つの項目を出力してください。Markdownのバッククォート（\`\`\`json など）や余計な文章は一切含めず、純粋なJSON文字列だけを返してください。

【リスクレベル判断基準】
- "高": 競合他社への乗り換え懸念、予算削減・凍結、決裁者の難色、スケジュール大幅遅延や強い懸念・不満があり、失注・停滞リスクが高い場合
- "中": 課題の整理中・比較検討中・条件調整や回答待ちなど、フォロー次第で前後する要素がある場合
- "低": 顧客の反応が前向き、導入意欲やスケジュールが明確で、順調に進行している場合

【出力フォーマット】
{
  "summary": "商談の要約（3〜4行程度）",
  "next_action": "次に取るべき具体的なネクストアクション",
  "risk_level": "高" または "中" または "低"
}

【商談メモ】
${trimmedMemo}
`;

        let aiResponse;
        let retries = 3;
        let delay = 2000;

        while (retries > 0) {
            try {
                aiResponse = await ai.models.generateContent({
                    model: 'gemini-3.5-flash-lite',
                    contents: prompt,
                });
                break;
            } catch (err: unknown) {
                retries--;
                if (retries === 0) throw err;
                console.warn(
                    `Gemini API busy (High Demand). Retrying in ${delay / 1000}s... (Remaining: ${retries})`
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
                delay *= 2;
            }
        }

        const responseText = aiResponse?.text ?? '';

        let analysis: { summary: string; next_action: string; risk_level: string };
        try {
            const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanText);
            analysis = {
                summary:
                    typeof parsed.summary === 'string' && parsed.summary.trim()
                        ? parsed.summary.trim()
                        : '要約の生成に失敗しました。',
                next_action:
                    typeof parsed.next_action === 'string' && parsed.next_action.trim()
                        ? parsed.next_action.trim()
                        : '確認が必要です。',
                risk_level:
                    parsed.risk_level === '高' || parsed.risk_level === '中' || parsed.risk_level === '低'
                        ? parsed.risk_level
                        : '中',
            };
        } catch {
            console.error('Gemini JSON Parse Error:', responseText);
            analysis = {
                summary: responseText || '要約の生成に失敗しました。',
                next_action: '確認が必要です。',
                risk_level: '中',
            };
        }

        // 2. Supabaseへのデータ保存（Service Role KeyでRLSを安全にバイパスして登録）
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error: dbError } = await supabase.from('deals').insert([
            {
                company_id: parsedCompanyId,
                deal_title: trimmedTitle,
                person_in_charge_employee_id: chargeEmployeeId,
                last_edited_employee_id: sessionEmployeeCode,
                deal_date: trimmedDealDate,
                phase_code: normalizedPhaseCode,
                raw_memo: trimmedMemo,
                summary: analysis.summary,
                next_action: analysis.next_action,
                risk_level: analysis.risk_level,
                delete_flg: false,
            },
        ]);

        if (dbError) {
            console.error('Supabase Error:', dbError);
            throw new Error('データベースへの保存に失敗しました。');
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error: unknown) {
        console.error('API Error:', error);
        const errorMessage =
            error instanceof Error ? error.message : '予期せぬエラーが発生しました。';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

// Gemini APIクライアントの初期化
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { company_name, person_in_charge, deal_date, raw_memo } = body;

        if (!company_name || !raw_memo) {
            return NextResponse.json(
                { error: '企業名と商談メモは必須です。' },
                { status: 400 }
            );
        }

        // 1. Gemini APIに商談メモの分析を依頼（リトライロジック付き）
        const prompt = `
以下の商談メモを分析し、JSON形式のみで正確に以下の3つの項目を出力してください。Markdownのバッククォート（\`\`\`json など）や余計な文章は一切含めず、純粋なJSON文字列だけを返してください。

【出力フォーマット】
{
  "summary": "商談の要約（3〜4行程度）",
  "next_action": "次に取るべき具体的なネクストアクション",
  "risk_level": "高" または "中" または "低"
}

【商談メモ】
${raw_memo}
`;

        let aiResponse;
        let retries = 3;
        let delay = 2000; // 初回待機2秒

        while (retries > 0) {
            try {
                aiResponse = await ai.models.generateContent({
                    model: 'gemini-3.5-flash-lite', // ← こちらに変更
                    contents: prompt,
                });
                break; // 成功したらループを抜ける
            } catch (err: unknown) {
                retries--;
                if (retries === 0) throw err; // リトライ回数切れならエラーを投げる
                console.warn(`Gemini API busy (High Demand). Retrying in ${delay / 1000}s... (Remaining: ${retries})`);
                await new Promise((resolve) => setTimeout(resolve, delay));
                delay *= 2; // バックオフ（待機時間を倍増）
            }
        }

        // 安全にテキストを取得（undefined対策）
        const responseText = aiResponse?.text ?? '';

        let analysis;
        try {
            const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            analysis = JSON.parse(cleanText);
        } catch (e) {
            console.error('Gemini JSON Parse Error:', responseText);
            analysis = {
                summary: responseText || '要約の生成に失敗しました。',
                next_action: '確認が必要です。',
                risk_level: '中',
            };
        }

        // 2. Supabaseへのデータ保存
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error: dbError } = await supabase.from('deals').insert([
            {
                company_name,
                person_in_charge,
                deal_date,
                raw_memo,
                summary: analysis.summary,
                next_action: analysis.next_action,
                risk_level: analysis.risk_level,
            },
        ]);

        if (dbError) {
            console.error('Supabase Error:', dbError);
            throw new Error('データベースへの保存に失敗しました。');
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error: unknown) {
        console.error('API Error:', error);
        const errorMessage = error instanceof Error ? error.message : '予期せぬエラーが発生しました。';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
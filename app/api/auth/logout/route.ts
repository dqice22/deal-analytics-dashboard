/**
 * 画面名: ログアウトAPI
 * ファイルパス: app/api/auth/logout/route.ts
 * 役割: セッションCookie（sfa_session）の削除によるログアウト処理
 */
import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'sfa_session';

/**
 * セッションCookie（sfa_session）の有効期限を失効（maxAge: 0）させて削除し、ログアウト完了を返すPOSTハンドラ。
 */
export async function POST(req: NextRequest) {
    const forwardedProto = req.headers.get('x-forwarded-proto');
    const isHttps =
        forwardedProto === 'https' || req.nextUrl.protocol === 'https:';

    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: isHttps,
        path: '/',
        maxAge: 0,
    });
    return response;
}
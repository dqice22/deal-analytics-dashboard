/**
 * 画面名: ログインユーザー情報取得API
 * ファイルパス: app/api/auth/me/route.ts
 * 役割: セッションCookie（sfa_session）のJWT検証およびログイン中ユーザー情報の返却
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

const secretKey = new TextEncoder().encode(process.env.AUTH_SECRET!);
const COOKIE_NAME = 'sfa_session';

/**
 * 入力値（unknown）が文字列であれば前後空白を除去し、それ以外は空文字を返す正規化関数。
 */
function normalizeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * セッションCookie（sfa_session）内のJWTを検証し、認証済みであればログイン中ユーザー情報を返すGETハンドラ。
 */
export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get(COOKIE_NAME)?.value;

        if (!token) {
            return NextResponse.json(
                { user: null },
                { status: 401, headers: { 'Cache-Control': 'no-store' } }
            );
        }

        const { payload } = await jwtVerify(token, secretKey);
        const employeeCode = normalizeString(payload.employeeCode);
        const employeeName = normalizeString(payload.employeeName);
        const positionCode = normalizeString(payload.positionCode);

        if (!employeeCode) {
            return NextResponse.json(
                { user: null },
                { status: 401, headers: { 'Cache-Control': 'no-store' } }
            );
        }

        return NextResponse.json(
            {
                user: {
                    employeeCode,
                    employeeName,
                    positionCode: positionCode || null,
                    isAdmin: Boolean(payload.isAdmin),
                },
            },
            { status: 200, headers: { 'Cache-Control': 'no-store' } }
        );
    } catch {
        return NextResponse.json(
            { user: null },
            { status: 401, headers: { 'Cache-Control': 'no-store' } }
        );
    }
}